// ============================================================
// TiDB storage adapter — durable source of truth for the ledger
// ============================================================
// When DATABASE_URL (or the TIDB_* vars) is configured, the ledger's
// balances, open escrows, idempotency keys and rate-limit state live in
// TiDB and survive any container redeploy. The JSONL journal remains the
// write-ahead fallback: if TiDB is unreachable the server keeps running on
// the journal, and every missed write is backfilled on the next boot.
//
// Every mutation already carries a natural idempotency key (escrowId,
// matchId, purchaseId, topupId, grantId), so replaying the journal into
// TiDB with INSERT … ON DUPLICATE KEY UPDATE is always safe — the same
// entry never applies twice.
// ============================================================

import fs from 'node:fs';
import mysql from 'mysql2/promise';

function dsn() {
  return (process.env.DATABASE_URL || process.env.TIDB_DSN || '').trim();
}

function hasConfig() {
  if (dsn()) return true;
  return !!(process.env.TIDB_HOST && process.env.TIDB_USER && process.env.TIDB_NAME);
}

/** Parse a `mysql://` connection string into pool options. */
function poolOptions() {
  const url = dsn();
  if (url) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port || 4000),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, '').split('/')[0]
    };
  }
  return {
    host: process.env.TIDB_HOST,
    port: Number(process.env.TIDB_PORT || 4000),
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD || '',
    database: process.env.TIDB_NAME
  };
}

function sslOptions() {
  const ca = (process.env.TIDB_SSL_CA || '').trim();
  if (ca && fs.existsSync(ca)) return { ca: fs.readFileSync(ca), rejectUnauthorized: true };
  const mode = ((dsn().match(/[?&]sslMode=([^&]+)/i) || [])[1] || '').toUpperCase();
  if (mode === 'DISABLED') return undefined;
  // TiDB Cloud presents a publicly-trusted certificate; verify it by default.
  return { rejectUnauthorized: true };
}

/**
 * Connect to TiDB. Returns a pool on success, or null when the database is
 * unconfigured or unreachable (the server then runs on the JSONL journal).
 */
export async function connectTiDB() {
  if (!hasConfig()) return null;
  const pool = mysql.createPool({
    ...poolOptions(),
    ssl: sslOptions(),
    waitForConnections: true,
    connectionLimit: 4,
    enableKeepAlive: true,
    connectTimeout: 5000
  });
  try {
    const conn = await pool.getConnection();
    await conn.ping();
    conn.release();
    return pool;
  } catch (err) {
    console.warn('[tidb] unreachable — falling back to the JSONL journal:', err && err.message);
    try { await pool.end(); } catch { /* already closed */ }
    return null;
  }
}

/** Rebuild the ledger's in-memory state from TiDB. */
export async function loadSeed(pool) {
  const q = async (sql) => (await pool.query(sql))[0];
  const users = await q('SELECT id, name, stars_balance, trophies, dust_balance, xp, matches, wins, is_vip FROM users');
  const escrows = await q("SELECT escrow_id, player_id, amount, room_code, created_at FROM escrows WHERE status = 'open'");
  const settles = await q('SELECT match_id, balance_after, reward_xp, reward_trophies, reward_dust, reward_stars FROM match_ledger');
  const txns = await q('SELECT txn_id, kind, player_id, amount, balance_after FROM ledger_txns');
  const recentSettles = await q('SELECT player_id, created_at FROM match_ledger WHERE created_at > (NOW() - INTERVAL 1 HOUR)');
  const starSettles = await q('SELECT player_id, created_at, reward_stars FROM match_ledger WHERE reward_stars > 0 AND created_at >= CURDATE()');
  const starGrants = await q("SELECT player_id, amount, created_at FROM ledger_txns WHERE kind = 'grant' AND amount > 0 AND created_at >= CURDATE()");
  const meta = await q("SELECT v FROM meta WHERE k = 'last_seq'");

  const balances = users.map((u) => ({
    id: Number(u.id), name: u.name || '', stars: Number(u.stars_balance), trophies: Number(u.trophies || 0),
    dust: Number(u.dust_balance || 0), xp: Number(u.xp || 0), matches: Number(u.matches || 0),
    wins: Number(u.wins || 0), vip: !!u.is_vip
  }));
  const escrowRows = escrows.map((e) => ({
    escrowId: String(e.escrow_id), playerId: Number(e.player_id), amount: Number(e.amount),
    roomCode: String(e.room_code), createdAt: new Date(e.created_at).getTime()
  }));
  const settlements = settles.map((s) => ({
    matchId: String(s.match_id),
    rewards: { xp: Number(s.reward_xp), trophies: Number(s.reward_trophies), dust: Number(s.reward_dust), stars: Number(s.reward_stars) },
    balance: Number(s.balance_after)
  }));
  const purchases = txns.filter((t) => t.kind === 'purchase').map((t) => ({ id: String(t.txn_id), amount: Number(t.amount), balance: Number(t.balance_after) }));
  const grants = txns.filter((t) => t.kind === 'grant').map((t) => ({ id: String(t.txn_id), amount: Number(t.amount), balance: Number(t.balance_after) }));
  const topups = txns.filter((t) => t.kind === 'topup').map((t) => ({ id: String(t.txn_id), amount: Number(t.amount), balance: Number(t.balance_after) }));
  const activity = recentSettles.map((r) => ({ playerId: Number(r.player_id), ts: new Date(r.created_at).getTime() }));
  const dayStars = [];
  const ds = new Map();
  for (const r of starSettles) {
    const key = `${r.player_id}:${utcDay(new Date(r.created_at))}`;
    ds.set(key, (ds.get(key) || 0) + Number(r.reward_stars));
  }
  for (const r of starGrants) {
    const key = `${r.player_id}:${utcDay(new Date(r.created_at))}`;
    ds.set(key, (ds.get(key) || 0) + Number(r.amount));
  }
  for (const [key, amount] of ds) dayStars.push({ key, amount });

  const lastSeq = meta.length ? Number(meta[0].v) || 0 : 0;
  return { balances, escrows: escrowRows, settlements, purchases, grants, topups, activity, dayStars, lastSeq, entries: settles.length + txns.length + escrows.length };
}

function utcDay(date) {
  return date.toISOString().slice(0, 10);
}

/** Upsert a player's row with only the columns this entry actually updates. */
async function syncUser(pool, playerId, cols) {
  const names = ['id', ...cols.map((c) => c.col)];
  const sql = `INSERT INTO users (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})
    ON DUPLICATE KEY UPDATE ${cols.map((c) => (c.col === 'name'
    ? "name = IF(VALUES(name) <> '', VALUES(name), name)" : `${c.col} = VALUES(${c.col})`)).join(', ')}`;
  await pool.execute(sql, [playerId, ...cols.map((c) => c.val)]);
}

/**
 * Apply one journal entry to TiDB (idempotent by natural key). Mirrors the
 * in-memory replay in ledger.mjs so both stores stay consistent.
 */
export async function applyEntry(pool, e) {
  const ts = Math.floor((e.ts || Date.now()) / 1000);
  const playerId = Number(e.playerId);

  switch (e.type) {
    case 'escrow':
      await pool.execute(
        `INSERT INTO escrows (escrow_id, player_id, amount, room_code, status, created_at)
         VALUES (?, ?, ?, ?, 'open', FROM_UNIXTIME(?))
         ON DUPLICATE KEY UPDATE escrow_id = VALUES(escrow_id)`,
        [String(e.escrowId), playerId, Number(e.amount), String(e.roomCode || ''), ts]
      );
      await syncUser(pool, playerId, [{ col: 'stars_balance', val: Number(e.balance) }]);
      break;

    case 'escrow_cancel':
    case 'escrow_release':
      await pool.execute(
        `UPDATE escrows SET status = ?, settled_match_id = NULL WHERE escrow_id = ?`,
        [e.type === 'escrow_cancel' ? 'cancelled' : 'released', String(e.escrowId)]
      );
      await syncUser(pool, playerId, [{ col: 'stars_balance', val: Number(e.balance) }]);
      break;

    case 'settle':
      await pool.execute(
        `INSERT INTO match_ledger
           (match_id, player_id, escrow_id, mode, won, stake, kills, damage, accuracy, duration_sec,
            reward_xp, reward_trophies, reward_dust, reward_stars, balance_after, name, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))
         ON DUPLICATE KEY UPDATE match_id = VALUES(match_id)`,
        [
          String(e.matchId), playerId, e.escrowId ? String(e.escrowId) : null, String(e.mode || ''),
          e.won ? 1 : 0, Number(e.stake || 0), Number(e.kills || 0), Number(e.damage || 0),
          Number(e.accuracy || 0), Number(e.durationSec || 0),
          Number(e.rewards.xp), Number(e.rewards.trophies), Number(e.rewards.dust), Number(e.rewards.stars),
          Number(e.balance), String(e.name || ''), ts
        ]
      );
      if (e.escrowId) {
        await pool.execute(
          `UPDATE escrows SET status = 'settled', settled_match_id = ? WHERE escrow_id = ?`,
          [String(e.matchId), String(e.escrowId)]
        );
      }
      await syncUser(pool, playerId, [
        { col: 'name', val: String(e.name || '') },
        { col: 'stars_balance', val: Number(e.balance) },
        { col: 'trophies', val: Number(e.trophies || 0) },
        { col: 'dust_balance', val: Number(e.dust || 0) },
        { col: 'xp', val: Number(e.xp || 0) },
        { col: 'matches', val: Number(e.matches || 0) },
        { col: 'wins', val: Number(e.wins || 0) }
      ]);
      break;

    case 'purchase':
      await pool.execute(
        `INSERT INTO ledger_txns (txn_id, kind, player_id, amount, balance_after, created_at)
         VALUES (?, 'purchase', ?, ?, ?, FROM_UNIXTIME(?))
         ON DUPLICATE KEY UPDATE txn_id = VALUES(txn_id)`,
        [String(e.purchaseId), playerId, Number(e.amount), Number(e.balance), ts]
      );
      await syncUser(pool, playerId, [
        { col: 'stars_balance', val: Number(e.balance) },
        { col: 'is_vip', val: e.vip ? 1 : 0 }
      ]);
      break;

    case 'topup':
      await pool.execute(
        `INSERT INTO ledger_txns (txn_id, kind, player_id, amount, balance_after, created_at)
         VALUES (?, 'topup', ?, ?, ?, FROM_UNIXTIME(?))
         ON DUPLICATE KEY UPDATE txn_id = VALUES(txn_id)`,
        [String(e.topupId), playerId, Number(e.amount), Number(e.balance), ts]
      );
      await syncUser(pool, playerId, [{ col: 'stars_balance', val: Number(e.balance) }]);
      break;

    case 'grant':
      await pool.execute(
        `INSERT INTO ledger_txns (txn_id, kind, player_id, amount, balance_after, created_at)
         VALUES (?, 'grant', ?, ?, ?, FROM_UNIXTIME(?))
         ON DUPLICATE KEY UPDATE txn_id = VALUES(txn_id)`,
        [String(e.grantId), playerId, Number(e.stars), Number(e.balance), ts]
      );
      await syncUser(pool, playerId, [{ col: 'stars_balance', val: Number(e.balance) }]);
      break;

    default:
      break;
  }
}

/** Persist the journal↔TiDB watermark so only the tail is replayed on boot. */
export async function setMeta(pool, k, v) {
  await pool.execute(
    'INSERT INTO meta (k, v) VALUES (?, ?) ON DUPLICATE KEY UPDATE v = VALUES(v)',
    [String(k), String(v)]
  );
}
