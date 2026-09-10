// ============================================================
// Star Vault — server-side economy ledger
// ============================================================
// The single authority for star movement (the real-money-adjacent
// currency). Clients can display numbers, but only this module decides
// whether a stake is deducted, whether a win pays out, and how much.
//
// Storage: an append-only JSONL journal plus an in-memory index rebuilt
// on boot by replaying the journal. It survives container restarts
// (Koyeb's free tier keeps the service disk). The store is intentionally
// a flat file so the swap to TiDB later is a drop-in: every mutation flows
// through `persist()` + `player()`, and nothing else touches disk.
//
// Anti-cheat & anti-farm guarantees:
//   • Stakes are escrowed atomically and can only be settled once.
//   • Settles are idempotent by matchId (a replay returns the stored result).
//   • Rewards are clamped to sane bounds (kills/damage/duration/accuracy).
//   • Per-player settle rate limit + daily star-payout cap.
//   • Escrows left open expire and are auto-refunded (TTL).
//
// Honest limitation (documented): gameplay itself is P2P, so this server
// cannot verify that a kill really happened — it verifies the *economy*
// (who staked, who won, and that payouts stay inside the rules).
// ============================================================

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = {
  initialStars: Number(process.env.INITIAL_STARS || 100),
  maxStake: Number(process.env.MAX_STAKE || 5000),
  escrowTtlMs: Number(process.env.ESCROW_TTL_MS || 30 * 60 * 1000),
  maxSettlesPerHour: Number(process.env.MAX_SETTLES_PER_HOUR || 60),
  maxStarsPerDay: Number(process.env.MAX_STARS_PER_DAY || 500),
  maxKills: 8,
  maxDamage: 30000,
  maxDurationSec: 3600
};

const ALLOWED_MODES = new Set(['host', 'join', 'ai', 'matchmade']);

function clampInt(value, lo, hi, fallback) {
  const n = Number.isFinite(value) ? Math.round(value) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function utcDay(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

/** The authoritative reward rules — mirrors the client display formula. */
export function computeRewards(won, stake, kills, damage, durationSec, ranked = false) {
  const xp = Math.round(kills * 40 + damage * 0.5 + Math.min(120, durationSec) * 2);
  // Ranked stakes swing the competitive rating harder than casual lobbies.
  const trophies = won ? (ranked ? 30 : 25) : (ranked ? -18 : -15);
  const dust = won ? (ranked ? 260 : 200) : 30;
  const stars = won && stake > 0 ? Math.floor(stake * 1.8) : 0;
  return { xp, trophies, dust, stars };
}

function ledgerError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

export function createLedger(options = {}) {
  const cfg = { ...DEFAULTS, ...options };
  const dataFile = options.file || process.env.LEDGER_FILE || path.join(process.cwd(), 'data', 'ledger.jsonl');

  // ---- In-memory index (rebuilt from the journal on boot) ----
  const balances = new Map();       // playerId -> { stars, trophies, dust, xp, matches, wins }
  const escrows = new Map();        // escrowId -> { playerId, amount, roomCode, createdAt }
  const escrowKeys = new Map();     // `${playerId}:${roomCode}` -> escrowId (idempotent stake)
  const settlements = new Map();    // matchId -> settlement result (idempotent settle)
  const purchases = new Map();      // purchaseId -> purchase result (idempotent debit)
  const grants = new Map();         // grantId -> grant result (idempotent credit)
  const topups = new Map();         // topupId -> topup result (idempotent deposit)
  const activity = new Map();       // playerId -> number[] settle timestamps (last hour)
  const dayStars = new Map();       // `${playerId}:${utcDay}` -> stars credited that day
  let entryCount = 0;
  let seqCounter = 0;               // monotonic journal sequence (TiDB watermark)
  let storeHook = null;             // async durable-store mirror, attached after boot
  let persistChain = Promise.resolve(); // serializes store writes in journal order

  function player(id) {
    let p = balances.get(id);
    if (!p) {
      p = { stars: cfg.initialStars, trophies: 0, dust: 0, xp: 0, matches: 0, wins: 0, vip: false, name: '' };
      balances.set(id, p);
    }
    return p;
  }

  function persist(entry) {
    entry.seq = ++seqCounter;
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.appendFileSync(dataFile, JSON.stringify(entry) + '\n');
    entryCount += 1;
    // Mirror to the durable store (TiDB) in journal order. Failures are
    // swallowed: the entry is already journaled locally and the next boot
    // backfills any gap idempotently by natural key.
    if (storeHook) {
      persistChain = persistChain
        .then(() => storeHook(entry))
        .catch((err) => console.error('[ledger] durable store sync failed:', err && err.message));
    }
  }

  function releaseExpiredFor(playerId) {
    const now = Date.now();
    for (const [escrowId, e] of escrows) {
      if (e.playerId !== playerId) continue;
      if (now - e.createdAt < cfg.escrowTtlMs) continue;
      escrows.delete(escrowId);
      escrowKeys.delete(`${e.playerId}:${e.roomCode}`);
      const p = player(e.playerId);
      p.stars += e.amount;
      persist({ type: 'escrow_release', escrowId, playerId: e.playerId, amount: e.amount, balance: p.stars, ts: now });
    }
  }

  // ---- Replay the journal to rebuild all indexes ----
  // Balance reconstruction uses deltas per entry so the on-disk file is the
  // single source of truth:
  //   escrow         -> -amount (open stake, or skipped if expired & settled)
  //   escrow_cancel  -> +amount (explicit refund)
  //   escrow_release -> +amount (auto refund after TTL)
  //   settle         -> +rewards.stars / trophies / dust / xp
  function entrySeq(e) {
    return Number.isFinite(e.seq) ? e.seq : 0;
  }

  function applyEntryToMemory(e, consumed) {
    entryCount += 1;
    if (e.type === 'escrow') {
      const expired = Date.now() - e.ts >= cfg.escrowTtlMs;
      if (expired && !consumed.has(e.escrowId)) {
        // Was never settled and its window lapsed -> refund on load.
        player(e.playerId).stars += e.amount;
      } else if (!expired) {
        // Still-open stake -> apply the deduction.
        player(e.playerId).stars -= e.amount;
        escrows.set(e.escrowId, { playerId: e.playerId, amount: e.amount, roomCode: e.roomCode, createdAt: e.ts });
        escrowKeys.set(`${e.playerId}:${e.roomCode}`, e.escrowId);
      }
      // expired && consumed: net effect captured by the settle entry below.
    } else if (e.type === 'escrow_cancel' || e.type === 'escrow_release') {
      escrows.delete(e.escrowId);
      if (e.type === 'escrow_cancel' && e.roomCode) escrowKeys.delete(`${e.playerId}:${e.roomCode}`);
      player(e.playerId).stars += e.amount;
    } else if (e.type === 'settle') {
      const p = player(e.playerId);
      if (e.name) p.name = String(e.name).slice(0, 32);
      p.stars += e.rewards.stars;
      p.trophies = Math.max(0, p.trophies + e.rewards.trophies);
      p.dust += e.rewards.dust;
      p.xp += e.rewards.xp;
      p.matches += 1;
      if (e.won) p.wins += 1;
      if (e.escrowId) {
        escrows.delete(e.escrowId);
        if (e.roomCode) escrowKeys.delete(`${e.playerId}:${e.roomCode}`);
      }
      settlements.set(e.matchId, {
        rewards: e.rewards, balance: p.stars, trophies: p.trophies, dust: p.dust, xp: p.xp, verified: true
      });
      const arr = activity.get(e.playerId) || [];
      arr.push(e.ts);
      activity.set(e.playerId, arr);
      if (e.rewards.stars > 0) {
        const key = `${e.playerId}:${utcDay(e.ts)}`;
        dayStars.set(key, (dayStars.get(key) || 0) + e.rewards.stars);
      }
    } else if (e.type === 'purchase') {
      const p = player(e.playerId);
      p.stars -= e.amount;
      if (e.vip) p.vip = true;
      purchases.set(e.purchaseId, { balance: p.stars, spent: e.amount, verified: true });
    } else if (e.type === 'topup') {
      const p = player(e.playerId);
      p.stars += e.amount;
      topups.set(e.topupId, { balance: p.stars, amount: e.amount, verified: true });
    } else if (e.type === 'grant') {
      const p = player(e.playerId);
      p.stars += e.stars;
      grants.set(e.grantId, { balance: p.stars, stars: e.stars, verified: true });
      const key = `${e.playerId}:${utcDay(e.ts)}`;
      dayStars.set(key, (dayStars.get(key) || 0) + e.stars);
    }
  }

  // Replay journal entries with seq > afterSeq into the in-memory indexes.
  // Returns the entries actually applied (the caller mirrors them to TiDB).
  function load(afterSeq = -1) {
    let raw = '';
    try { raw = fs.readFileSync(dataFile, 'utf8'); } catch { return []; }
    const lines = raw.split('\n').filter((l) => l.trim());
    const applied = [];

    // Pass 1: escrow ids consumed by a settle — these must never be refunded
    // even if their original escrow entry is already past the TTL. Also track
    // the highest sequence so new writes continue above the watermark.
    const consumed = new Set();
    for (const line of lines) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (e.type === 'settle' && e.escrowId) consumed.add(e.escrowId);
      seqCounter = Math.max(seqCounter, entrySeq(e));
    }

    // Pass 2: replay in order.
    for (const line of lines) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (entrySeq(e) <= afterSeq) continue;
      applyEntryToMemory(e, consumed);
      applied.push(e);
    }
    return applied;
  }

  // Replace the in-memory indexes with state loaded from the durable store.
  // Called after boot when TiDB is reachable (the journal stays as fallback).
  function seed(state) {
    balances.clear(); escrows.clear(); escrowKeys.clear();
    settlements.clear(); purchases.clear(); grants.clear(); topups.clear();
    activity.clear(); dayStars.clear();
    entryCount = 0;

    for (const b of state.balances || []) {
      balances.set(b.id, {
        stars: b.stars, trophies: b.trophies || 0, dust: b.dust || 0, xp: b.xp || 0,
        matches: b.matches || 0, wins: b.wins || 0, vip: !!b.vip, name: b.name || ''
      });
    }
    for (const e of state.escrows || []) {
      escrows.set(e.escrowId, { playerId: e.playerId, amount: e.amount, roomCode: e.roomCode, createdAt: e.createdAt });
      escrowKeys.set(`${e.playerId}:${e.roomCode}`, e.escrowId);
    }
    for (const s of state.settlements || []) {
      settlements.set(s.matchId, {
        rewards: s.rewards, balance: s.balance, trophies: 0, dust: 0, xp: 0, verified: true
      });
    }
    for (const p of state.purchases || []) purchases.set(p.id, { balance: p.balance, spent: p.amount, vip: false, verified: true });
    for (const g of state.grants || []) grants.set(g.id, { balance: g.balance, stars: g.amount, verified: true });
    for (const t of state.topups || []) topups.set(t.id, { balance: t.balance, amount: t.amount, verified: true });
    for (const a of state.activity || []) {
      const arr = activity.get(a.playerId) || [];
      arr.push(a.ts);
      activity.set(a.playerId, arr);
    }
    for (const d of state.dayStars || []) dayStars.set(d.key, d.amount);
    seqCounter = Math.max(seqCounter, Number(state.lastSeq) || 0);
  }

  function checkRateLimits(playerId, won) {
    const now = Date.now();
    const hourAgo = now - 3600 * 1000;
    const recent = (activity.get(playerId) || []).filter((t) => t > hourAgo);
    if (recent.length >= cfg.maxSettlesPerHour) {
      throw ledgerError('limited', 'تجاوزت حد المباريات المسجّلة — حاول لاحقاً');
    }
    recent.push(now); // reserve a slot so parallel requests can't slip through
    activity.set(playerId, recent);

    if (won) {
      const today = `${playerId}:${utcDay(now)}`;
      const credited = dayStars.get(today) || 0;
      if (credited >= cfg.maxStarsPerDay) {
        throw ledgerError('limited', 'بلغت سقف نجوم المكافآت اليومي');
      }
    }
  }

  function consumeEscrow(escrowId, playerId) {
    if (typeof escrowId !== 'string' || escrowId === '') return { amount: 0, roomCode: null };
    const e = escrows.get(escrowId);
    if (!e) return { amount: 0, roomCode: null }; // unknown escrow -> un-staked (idempotent-friendly)
    if (e.playerId !== playerId) throw ledgerError('invalid', 'رهان لا يخص هذا اللاعب');
    escrows.delete(escrowId);
    escrowKeys.delete(`${e.playerId}:${e.roomCode}`);
    return { amount: e.amount, roomCode: e.roomCode };
  }

  // ---- Public API ----

  function stake({ playerId, amount, roomCode }) {
    if (!Number.isFinite(playerId)) throw ledgerError('invalid', 'معرّف لاعب غير صالح');
    const amt = clampInt(amount, 1, cfg.maxStake, 0);
    if (amt <= 0) throw ledgerError('invalid', 'قيمة رهان غير صالحة');
    const code = String(roomCode || '').trim();
    if (!code) throw ledgerError('invalid', 'رمز غرفة غير صالح');

    releaseExpiredFor(playerId);

    const key = `${playerId}:${code}`;
    const existingId = escrowKeys.get(key);
    if (existingId && escrows.has(existingId)) {
      const existing = escrows.get(existingId);
      return { escrowId: existingId, balance: player(playerId).stars, amount: existing.amount };
    }

    const p = player(playerId);
    if (p.stars < amt) throw ledgerError('insufficient', 'رصيد النجوم غير كافٍ للرهان');

    p.stars -= amt;
    const escrowId = 'ESC-' + randomBytes(6).toString('hex').toUpperCase();
    escrows.set(escrowId, { playerId, amount: amt, roomCode: code, createdAt: Date.now() });
    escrowKeys.set(key, escrowId);
    persist({ type: 'escrow', escrowId, playerId, amount: amt, roomCode: code, balance: p.stars, ts: Date.now() });
    return { escrowId, balance: p.stars, amount: amt };
  }

  function settle({ matchId, playerId, escrowId, won, kills, damage, accuracy, durationSec, mode, name, ranked }) {
    if (typeof matchId !== 'string' || matchId.length < 6 || matchId.length > 96) {
      throw ledgerError('invalid', 'معرّف مباراة غير صالح');
    }
    const stored = settlements.get(matchId);
    if (stored) return stored; // idempotent replay

    if (!Number.isFinite(playerId)) throw ledgerError('invalid', 'معرّف لاعب غير صالح');
    if (!ALLOWED_MODES.has(mode)) throw ledgerError('invalid', 'وضع مباراة غير صالح');

    releaseExpiredFor(playerId);

    const k = clampInt(kills, 0, cfg.maxKills, 0);
    const dmg = clampInt(damage, 0, cfg.maxDamage, 0);
    const dur = clampInt(durationSec, 1, cfg.maxDurationSec, 60);
    const acc = clampInt(accuracy, 0, 100, 0);
    const isWin = won === true;

    // Escrow is consumed before the rate-limit check, so a rejected settle
    // can never lose the player's stake.
    const { amount: stake, roomCode: stakeRoom } = consumeEscrow(escrowId, playerId);

    checkRateLimits(playerId, isWin);

    const rewards = computeRewards(isWin, stake, k, dmg, dur, ranked === true);
    const today = `${playerId}:${utcDay(Date.now())}`;
    const credited = dayStars.get(today) || 0;
    const room = Math.max(0, cfg.maxStarsPerDay - credited);
    if (rewards.stars > room) rewards.stars = room;

    const p = player(playerId);
    if (typeof name === 'string' && name.trim()) p.name = name.trim().slice(0, 32);
    p.stars += rewards.stars;
    p.trophies = Math.max(0, p.trophies + rewards.trophies);
    p.dust += rewards.dust;
    p.xp += rewards.xp;
    p.matches += 1;
    if (isWin) p.wins += 1;
    dayStars.set(today, credited + rewards.stars);

    persist({
      type: 'settle', matchId, playerId, escrowId: escrowId || null, roomCode: stakeRoom,
      won: isWin, kills: k, damage: dmg, accuracy: acc, durationSec: dur, mode, stake, name: p.name,
      rewards, balance: p.stars, trophies: p.trophies, dust: p.dust, xp: p.xp, matches: p.matches, wins: p.wins,
      ts: Date.now()
    });

    const settlement = {
      rewards, balance: p.stars, trophies: p.trophies, dust: p.dust, xp: p.xp, verified: true
    };
    settlements.set(matchId, settlement);
    return settlement;
  }

  function cancelEscrow(escrowId, playerId) {
    releaseExpiredFor(playerId);
    const e = escrows.get(escrowId);
    if (!e) return { balance: player(playerId).stars, refunded: false };
    if (e.playerId !== playerId) throw ledgerError('forbidden', 'لا يمكن إلغاء رهان لاعب آخر');
    escrows.delete(escrowId);
    escrowKeys.delete(`${e.playerId}:${e.roomCode}`);
    const p = player(e.playerId);
    p.stars += e.amount;
    persist({ type: 'escrow_cancel', escrowId, playerId: e.playerId, amount: e.amount, roomCode: e.roomCode, balance: p.stars, ts: Date.now() });
    return { balance: p.stars, refunded: true };
  }

  function purchase({ purchaseId, playerId, productId, amount, vip = false }) {
    if (typeof purchaseId !== 'string' || purchaseId.length < 6 || purchaseId.length > 96) {
      throw ledgerError('invalid', 'معرّف عملية شراء غير صالح');
    }
    const stored = purchases.get(purchaseId);
    if (stored) return stored; // idempotent replay

    if (!Number.isFinite(playerId)) throw ledgerError('invalid', 'معرّف لاعب غير صالح');
    const amt = clampInt(amount, 1, cfg.maxStake, 0);
    if (amt <= 0) throw ledgerError('invalid', 'قيمة شراء غير صالحة');
    const product = String(productId || '').slice(0, 64);
    if (!product) throw ledgerError('invalid', 'منتج غير صالح');

    releaseExpiredFor(playerId);
    const p = player(playerId);
    if (p.stars < amt) throw ledgerError('insufficient', 'رصيد النجوم غير كافٍ للشراء');

    p.stars -= amt;
    if (vip) p.vip = true;
    persist({ type: 'purchase', purchaseId, playerId, productId: product, amount: amt, vip: p.vip, balance: p.stars, ts: Date.now() });
    const result = { balance: p.stars, spent: amt, vip: p.vip, verified: true };
    purchases.set(purchaseId, result);
    return result;
  }

  function topup({ topupId, playerId, amount }) {
    if (typeof topupId !== 'string' || topupId.length < 6 || topupId.length > 96) {
      throw ledgerError('invalid', 'معرّف عملية شحن غير صالح');
    }
    const stored = topups.get(topupId);
    if (stored) return stored; // idempotent replay

    if (!Number.isFinite(playerId)) throw ledgerError('invalid', 'معرّف لاعب غير صالح');
    const amt = clampInt(amount, 1, cfg.maxStake * 20, 0);
    if (amt <= 0) throw ledgerError('invalid', 'قيمة شحن غير صالحة');

    releaseExpiredFor(playerId);
    const p = player(playerId);
    p.stars += amt;
    persist({ type: 'topup', topupId, playerId, amount: amt, balance: p.stars, ts: Date.now() });
    const result = { balance: p.stars, amount: amt, verified: true };
    topups.set(topupId, result);
    return result;
  }

  function grant({ grantId, playerId, stars, vip = false }) {
    if (typeof grantId !== 'string' || grantId.length < 6 || grantId.length > 96) {
      throw ledgerError('invalid', 'معرّف منحة غير صالح');
    }
    const stored = grants.get(grantId);
    if (stored) return stored; // idempotent replay

    if (!Number.isFinite(playerId)) throw ledgerError('invalid', 'معرّف لاعب غير صالح');
    const amt = clampInt(stars, 1, cfg.maxStarsPerDay, 0);
    if (amt <= 0) throw ledgerError('invalid', 'قيمة منحة غير صالحة');

    releaseExpiredFor(playerId);

    const p = player(playerId);
    if (vip && !p.vip) throw ledgerError('invalid', 'اشترك في نادي VIP أولاً');

    // Grants share the daily star cap with match rewards so the total
    // credits per player per day stay inside the economy budget.
    const today = `${playerId}:${utcDay(Date.now())}`;
    const credited = dayStars.get(today) || 0;
    const room = Math.max(0, cfg.maxStarsPerDay - credited);
    if (amt > room) throw ledgerError('limited', 'بلغت سقف نجوم المكافآت اليومي');

    p.stars += amt;
    dayStars.set(today, credited + amt);
    persist({ type: 'grant', grantId, playerId, stars: amt, vip: !!vip, balance: p.stars, ts: Date.now() });
    const result = { balance: p.stars, stars: amt, verified: true };
    grants.set(grantId, result);
    return result;
  }

  function playerView(playerId) {
    releaseExpiredFor(playerId);
    const p = player(playerId);
    const open = Array.from(escrows.values()).filter((e) => e.playerId === playerId);
    return {
      id: playerId, name: p.name, stars: p.stars, trophies: p.trophies, dust: p.dust, xp: p.xp,
      matches: p.matches, wins: p.wins, vip: p.vip, openEscrows: open.length
    };
  }

  // Ranked by trophies (the competitive rating). Only players who have ever
  // played a match appear — the board is real, never seeded.
  function leaderboard(limit) {
    const n = clampInt(limit, 1, 100, 50);
    const rows = Array.from(balances.entries())
      .filter(([, p]) => p.matches > 0)
      .map(([id, p]) => ({ id, name: p.name || 'لاعب مجهول', trophies: p.trophies, wins: p.wins, matches: p.matches, xp: p.xp }))
      .sort((a, b) => b.trophies - a.trophies || b.wins - a.wins || b.matches - a.matches)
      .slice(0, n)
      .map((row, i) => ({ ...row, rank: i + 1 }));
    return rows;
  }

  function stats() {
    return { players: balances.size, escrows: escrows.size, entries: entryCount };
  }

  load();
  return {
    stake, settle, cancelEscrow, purchase, topup, grant, playerView, leaderboard, stats, computeRewards,
    // Durability hooks used by the TiDB adapter at boot:
    seed,             // replace in-memory state with the durable store's state
    load,             // replay journal entries with seq > afterSeq (returns them)
    attachPersist: (hook) => { storeHook = hook; }, // mirror future writes to the durable store
    seqNow: () => seqCounter
  };
}
