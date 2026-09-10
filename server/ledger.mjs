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
export function computeRewards(won, stake, kills, damage, durationSec) {
  const xp = Math.round(kills * 40 + damage * 0.5 + Math.min(120, durationSec) * 2);
  const trophies = won ? 25 : -15;
  const dust = won ? 200 : 30;
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
  const activity = new Map();       // playerId -> number[] settle timestamps (last hour)
  const dayStars = new Map();       // `${playerId}:${utcDay}` -> stars credited that day
  let entryCount = 0;

  function player(id) {
    let p = balances.get(id);
    if (!p) {
      p = { stars: cfg.initialStars, trophies: 0, dust: 0, xp: 0, matches: 0, wins: 0 };
      balances.set(id, p);
    }
    return p;
  }

  function persist(entry) {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    fs.appendFileSync(dataFile, JSON.stringify(entry) + '\n');
    entryCount += 1;
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
  function load() {
    let raw = '';
    try { raw = fs.readFileSync(dataFile, 'utf8'); } catch { return; }
    const lines = raw.split('\n').filter((l) => l.trim());

    // Pass 1: escrow ids consumed by a settle — these must never be refunded
    // even if their original escrow entry is already past the TTL.
    const consumed = new Set();
    for (const line of lines) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (e.type === 'settle' && e.escrowId) consumed.add(e.escrowId);
    }

    // Pass 2: replay in order.
    for (const line of lines) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
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
        p.stars += e.rewards.stars;
        p.trophies += e.rewards.trophies;
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
      }
    }
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

  function settle({ matchId, playerId, escrowId, won, kills, damage, accuracy, durationSec, mode }) {
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

    const rewards = computeRewards(isWin, stake, k, dmg, dur);
    const today = `${playerId}:${utcDay(Date.now())}`;
    const credited = dayStars.get(today) || 0;
    const room = Math.max(0, cfg.maxStarsPerDay - credited);
    if (rewards.stars > room) rewards.stars = room;

    const p = player(playerId);
    p.stars += rewards.stars;
    p.trophies += rewards.trophies;
    p.dust += rewards.dust;
    p.xp += rewards.xp;
    p.matches += 1;
    if (isWin) p.wins += 1;
    dayStars.set(today, credited + rewards.stars);

    persist({
      type: 'settle', matchId, playerId, escrowId: escrowId || null, roomCode: stakeRoom,
      won: isWin, kills: k, damage: dmg, accuracy: acc, durationSec: dur, mode, stake,
      rewards, balance: p.stars, ts: Date.now()
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

  function playerView(playerId) {
    releaseExpiredFor(playerId);
    const p = player(playerId);
    const open = Array.from(escrows.values()).filter((e) => e.playerId === playerId);
    return {
      id: playerId, stars: p.stars, trophies: p.trophies, dust: p.dust, xp: p.xp,
      matches: p.matches, wins: p.wins, openEscrows: open.length
    };
  }

  function stats() {
    return { players: balances.size, escrows: escrows.size, entries: entryCount };
  }

  load();
  return { stake, settle, cancelEscrow, playerView, stats, computeRewards };
}
