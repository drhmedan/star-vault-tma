// ============================================================
// Star Vault — Matchmaking & WebRTC signaling server
// ============================================================
// One lightweight Node process designed for the Koyeb free tier
// (512 MB / 0.1 vCPU, always-on). It hosts two concerns on a
// single HTTP server:
//
//   1. /match   — WebSocket matchmaking: players queue, get grouped
//                 into rooms (2..8), and rooms are filled with bots
//                 when the gathering window expires.
//   2. /peerjs  — PeerJS signaling for WebRTC data channels. The
//                 actual gameplay traffic is peer-to-peer and never
//                 passes through this server.
//
// No database here: rooms live in memory only. TiDB is used solely
// by the game clients for persistence (profiles, economy, matches).
//
// The PeerJS browser client always appends "peerjs" to its configured
// path, so the signaling WebSocket must live at "/peerjs". The
// matchmaking WebSocket lives at "/match". Both `ws` servers are
// created with `noServer: true` and routed by a single manual
// "upgrade" handler — otherwise the PeerJS server would reject /match
// handshakes with HTTP 400.
// ============================================================

import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import express from 'express';
import { ExpressPeerServer } from 'peer';
import { WebSocketServer, WebSocket } from 'ws';
import { createLedger } from './ledger.mjs';
import { verifyTelegramInitData } from './telegramAuth.mjs';
import {
  STAR_PACKAGES, createInvoiceLink, validatePayment,
  botApi, parsePayload
} from './payments.mjs';
import { connectTiDB, loadSeed, applyEntry, setMeta } from './tidb.mjs';

const PORT = Number(process.env.PORT || 8000);
const HOST = '0.0.0.0';

const ledger = createLedger();

// ---- Durable store (TiDB) boot -----------------------------------------
// When TiDB is reachable it becomes the source of truth: the ledger seeds
// from it, backfills any journal entries TiDB missed while it was down, and
// mirrors every future write. Otherwise the server runs on the JSONL journal
// (the same behavior as before TiDB existed).
const tidbPool = await connectTiDB();
if (tidbPool) {
  const seed = await loadSeed(tidbPool);
  ledger.seed(seed); // replaces the journal replay done inside createLedger()
  const tail = ledger.load(Number(seed.lastSeq) || -1);
  for (const entry of tail) {
    try { await applyEntry(tidbPool, entry); } catch (err) { console.warn('[tidb] backfill entry failed:', err && err.message); }
  }
  if (tail.length) await setMeta(tidbPool, 'last_seq', String(ledger.seqNow()));
  ledger.attachPersist(async (entry) => { await applyEntry(tidbPool, entry); });
  console.log(`[tidb] connected — ledger served from TiDB (${seed.balances.length} players, seq ${ledger.seqNow()})`);
}
// No TiDB: createLedger() already replayed the JSONL journal into memory.

// ---- Telegram identity verification -----------------------------------
// When BOT_TOKEN is set (production), every /ledger/* request must carry a
// valid, fresh Telegram initData signature; the verified user id becomes the
// authoritative player id, so a client can no longer move stars for someone
// else's account. Without a token the ledger runs in dev mode (no identity
// check) so local testing keeps working.
const BOT_TOKEN = (process.env.BOT_TOKEN || '').trim();
const INITDATA_MAX_AGE_MS = Number(process.env.INITDATA_MAX_AGE_MS || 24 * 60 * 60 * 1000);
// Payments: the public webhook URL Telegram posts updates to, and an optional
// secret token (also registered via setWebhook) that authenticates them.
const WEBHOOK_URL = (process.env.WEBHOOK_URL || '').trim();
const WEBHOOK_SECRET = (process.env.WEBHOOK_SECRET || '').trim();
// Money-in (stars top-ups) must originate from the Telegram payment webhook in
// production — a verified client is never allowed to credit its own account.
const ALLOW_CLIENT_TOPUP = process.env.ALLOW_CLIENT_TOPUP === '1';
if (!BOT_TOKEN) {
  console.warn('[auth] BOT_TOKEN is not set — the ledger is running WITHOUT Telegram identity verification (dev mode only).');
}

// ---- Matchmaking configuration (env-overridable for tests) ----
// quick  = 1v1 + bot fill (the instant "always alive" default: nobody waits).
// ffa    = free-for-all up to 8 humans + bot fill, last human standing wins.
// 2v2    = duo elimination: 2 teams of 2 (bots fill empty seats), last team wins.
// squad  = squad elimination: 2 teams of 4 (bots fill empty seats), last team wins.
// ranked = competitive singles: full human lobby, no bot fill.
// Teams are assigned by join-order parity (slot % 2) so every client derives
// identical teams without a handshake.
const MODES = {
  quick: {
    maxHumans: Number(process.env.QUICK_MAX_HUMANS || 2),
    minHumans: 2, // wait up to the window for a human duel before bot fill
    totalFighters: Number(process.env.QUICK_TOTAL_FIGHTERS || 8),
    fillMs: Number(process.env.QUICK_FILL_MS || 30000),
    allowBotFill: true,
    teamSize: 1
  },
  ffa: {
    maxHumans: Number(process.env.FFA_MAX_HUMANS || 8),
    minHumans: 2, // ≥2 humans -> go now; a lone player waits out the window
    totalFighters: 8,
    fillMs: Number(process.env.FFA_FILL_MS || 30000),
    allowBotFill: true,
    teamSize: 1
  },
  '2v2': {
    maxHumans: 4,
    minHumans: 2,
    totalFighters: 4,
    fillMs: Number(process.env.DUO_FILL_MS || 45000),
    allowBotFill: true,
    teamSize: 2
  },
  squad: {
    maxHumans: 8,
    minHumans: 2,
    totalFighters: 8,
    fillMs: Number(process.env.SQUAD_FILL_MS || 60000),
    allowBotFill: true,
    teamSize: 4
  },
  tdm4v4: {
    maxHumans: 8,
    minHumans: 2,
    totalFighters: 8,
    fillMs: Number(process.env.TDM_FILL_MS || 60000),
    allowBotFill: true,
    teamSize: 4
  },
  ranked: {
    // Ranked is grouped by MMR in formRankedRooms() (not the generic tick()):
    // prefer a full 8-human lobby for the first minute, then form a
    // shorthanded lobby (4+) from the closest ratings. Never bot-filled.
    maxHumans: Number(process.env.RANKED_MAX_HUMANS || 8),
    minHumans: 4,
    totalFighters: 8,
    fillMs: Number(process.env.RANKED_FILL_MS || 60000),
    allowBotFill: false,
    teamSize: 1
  }
};

// ---- State ----
const queue = [];            // waiting players, in join order
const bySocket = new Map();  // WebSocket -> player entry

const log = (...args) => console.log(new Date().toISOString(), ...args);

function send(ws, obj) {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(obj)); } catch { /* ignore broken pipe */ }
  }
}

function broadcastStatus() {
  const waiting = { quick: 0, ranked: 0 };
  for (const p of queue) waiting[p.mode] = (waiting[p.mode] || 0) + 1;
  for (const ws of bySocket.keys()) {
    const p = bySocket.get(ws);
    if (p) send(ws, { type: 'queue_status', payload: { waiting: waiting[p.mode] || 0, total: queue.length } });
  }
}

function leaveQueue(ws) {
  const p = bySocket.get(ws);
  if (!p) return;
  const i = queue.indexOf(p);
  if (i !== -1) queue.splice(i, 1);
  bySocket.delete(ws);
  log(`player ${p.name} left queue (waiting=${queue.length})`);
  broadcastStatus();
}

function formRoom(members, mode) {
  const cfg = MODES[mode];
  const roomCode = 'ROOM-' + randomBytes(3).toString('hex').toUpperCase();
  // Seats are assigned in join order so every client derives identical,
  // deterministic spawn points for the whole roster (mesh spawn symmetry).
  // Team = seat parity (0/1) — meaningful for 2v2/squad, harmless elsewhere.
  const players = members.map((m, i) => ({ id: m.id, name: m.name, slot: i, team: i % 2 }));
  const fillBots = cfg.allowBotFill ? Math.max(0, cfg.totalFighters - players.length) : 0;
  log(`room ${roomCode} formed (mode=${mode}, real=${players.length}, bots=${fillBots})`);
  for (const m of members) {
    const i = queue.indexOf(m);
    if (i !== -1) queue.splice(i, 1);
    bySocket.delete(m.ws);
    send(m.ws, {
      type: 'room_ready',
      payload: { roomCode, mode, host: players[0].id, players, fillBots, teamSize: cfg.teamSize }
    });
  }
  broadcastStatus();
}

// Ranked grouping: pick the players whose ratings are closest to each other,
// preferring a full 8-human lobby but settling for a shorthanded 4+ after the
// oldest player has waited out the window. No bots ever fill a ranked lobby.
const RANKED_MIN = 4;
const RANKED_MAX = 8;
function formRankedRooms(now) {
  const g = queue.filter((p) => p.mode === 'ranked').sort((a, b) => a.rating - b.rating);
  if (g.length < RANKED_MIN) return;
  // The oldest player's wait decides full-vs-shorthanded (join order, not
  // rating order — sorting by rating above would read the wrong entry).
  const oldestWait = now - Math.min(...g.map((p) => p.joinedAt));
  const want = oldestWait >= MODES.ranked.fillMs ? RANKED_MIN : RANKED_MAX;
  if (g.length < want) return;
  // Tightest rating window of `want` consecutive players (sorted by rating).
  let start = 0;
  let bestSpread = Infinity;
  for (let i = 0; i + want <= g.length; i++) {
    const spread = g[i + want - 1].rating - g[i].rating;
    if (spread < bestSpread) { bestSpread = spread; start = i; }
  }
  formRoom(g.slice(start, start + want), 'ranked');
}

function tick() {
  const now = Date.now();
  for (const mode of Object.keys(MODES)) {
    if (mode === 'ranked') continue; // handled by formRankedRooms below
    const cfg = MODES[mode];
    const group = queue.filter((p) => p.mode === mode);
    if (group.length === 0) continue;

    // Full lobby -> start immediately.
    if (group.length >= cfg.maxHumans) {
      formRoom(group.slice(0, cfg.maxHumans), mode);
      continue;
    }
    // At least two humans matched -> go now (bots fill the empty seats). A
    // lone player waits out the gathering window, then fights bots instead
    // of waiting forever. Ranked (no bot fill) keeps waiting for a full lobby.
    if (cfg.allowBotFill && (group.length >= cfg.minHumans || now - group[0].joinedAt >= cfg.fillMs)) {
      formRoom(group.slice(0, cfg.maxHumans), mode);
    }
  }
  formRankedRooms(now);
}

// ---- HTTP app ----
const app = express();
const server = createServer(app);
app.use(express.json({ limit: '16kb' }));

// ---- CORS ------------------------------------------------------------------
// The Vercel frontend calls this API cross-origin and sends the custom
// X-Telegram-Init-Data header, which forces a browser preflight. Allow it
// explicitly — the API authenticates via Telegram initData (not cookies), so
// a wildcard origin is safe. Must run before the auth gate so OPTIONS
// preflights (which carry no initData) are answered without a 401.
const CORS_ORIGIN = (process.env.CORS_ORIGIN || '*').trim();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Telegram-Init-Data');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ============================================================
// Economy ledger — the server-side authority for star movement
// ============================================================
function ledgerErrorResponse(res, err) {
  const code = err && err.code;
  if (code === 'insufficient') return res.status(409).json({ error: err.message, code });
  if (code === 'limited') return res.status(429).json({ error: err.message, code });
  if (code === 'invalid') return res.status(400).json({ error: err.message, code });
  if (code === 'forbidden') return res.status(403).json({ error: err.message, code });
  return res.status(500).json({ error: 'خطأ داخلي في سجل الحسابات' });
}

// ---- Telegram identity gate -------------------------------------------------
// In production (BOT_TOKEN set) every /ledger and /api request must carry a
// valid initData signature; the middleware verifies it and stamps the
// verified Telegram user onto the request. Dev mode (no token) skips the
// check so local testing keeps working.
function telegramAuth(req, res, next) {
  if (!BOT_TOKEN) return next();
  const initData = (req.get('x-telegram-init-data') || '').trim();
  const result = verifyTelegramInitData(initData, BOT_TOKEN, { maxAgeMs: INITDATA_MAX_AGE_MS });
  if (!result.ok) {
    return res.status(401).json({ error: result.error, code: result.code || 'unauthorized' });
  }
  req.telegramUser = result.user;
  req.telegramUserId = result.userId;
  next();
}
app.use('/ledger', telegramAuth);

// Returns the authoritative player id for a write request. With a verified
// Telegram session the id comes from the signature (a body id that disagrees
// is rejected); in dev mode the body id is trusted as before. Returns null
// after sending a 403 so callers can bail out.
function requirePlayerId(req, res) {
  const claimed = req.body ? Number(req.body.playerId) : NaN;
  if (req.telegramUserId) {
    if (Number.isFinite(claimed) && claimed !== req.telegramUserId) {
      res.status(403).json({ error: 'هوية اللاعب لا تطابق جلسة تيليجرام', code: 'forbidden' });
      return null;
    }
    return req.telegramUserId;
  }
  return Number.isFinite(claimed) ? claimed : NaN;
}

// Read a player's authoritative balance (does not persist unknown players).
app.get('/ledger/player/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'معرّف لاعب غير صالح' });
  if (req.telegramUserId && id !== req.telegramUserId) {
    return res.status(403).json({ error: 'لا يمكنك عرض حساب لاعب آخر', code: 'forbidden' });
  }
  try {
    res.json(ledger.playerView(id));
  } catch (err) {
    ledgerErrorResponse(res, err);
  }
});

// Escrow a stake before a staked match starts.
app.post('/ledger/stake', (req, res) => {
  const b = req.body || {};
  const playerId = requirePlayerId(req, res);
  if (playerId === null) return;
  try {
    const receipt = ledger.stake({ playerId, amount: b.amount, roomCode: b.roomCode });
    res.json(receipt);
  } catch (err) {
    ledgerErrorResponse(res, err);
  }
});

// Settle a finished match: computes and pays the authoritative rewards.
app.post('/ledger/settle', (req, res) => {
  const b = req.body || {};
  const playerId = requirePlayerId(req, res);
  if (playerId === null) return;
  try {
    const settlement = ledger.settle({
      matchId: b.matchId, playerId, escrowId: b.escrowId,
      won: b.won, kills: b.kills, damage: b.damage, accuracy: b.accuracy,
      durationSec: b.durationSec, mode: b.mode, name: b.name,
      ranked: b.ranked === true
    });
    res.json(settlement);
  } catch (err) {
    ledgerErrorResponse(res, err);
  }
});

// Global leaderboard — top players by trophies (competitive rating).
app.get('/ledger/leaderboard', (req, res) => {
  const limit = Number(req.query.limit) || 50;
  try {
    res.json({ players: ledger.leaderboard(limit) });
  } catch (err) {
    ledgerErrorResponse(res, err);
  }
});

// Refund an open escrow (match aborted / server unreachable at settle time).
app.post('/ledger/escrow/cancel', (req, res) => {
  const b = req.body || {};
  const playerId = requirePlayerId(req, res);
  if (playerId === null) return;
  try {
    const result = ledger.cancelEscrow(b.escrowId, playerId);
    res.json(result);
  } catch (err) {
    ledgerErrorResponse(res, err);
  }
});

// Debit stars for a store purchase (battle pass, skin, VIP unlock...).
// Idempotent by purchaseId so a retried request never charges twice.
app.post('/ledger/purchase', (req, res) => {
  const b = req.body || {};
  const playerId = requirePlayerId(req, res);
  if (playerId === null) return;
  try {
    const result = ledger.purchase({ purchaseId: b.purchaseId, playerId, productId: b.productId, amount: b.amount, vip: b.vip === true });
    res.json(result);
  } catch (err) {
    ledgerErrorResponse(res, err);
  }
});

// Credit stars for a real-money top-up (stars package purchase). Money-in is
// not a reward, so it is NOT bounded by the daily reward cap — but it is
// still idempotent by topupId. In production this endpoint is reserved for
// the Telegram payment webhook: verified clients cannot credit themselves
// unless ALLOW_CLIENT_TOPUP=1 (dev convenience only).
app.post('/ledger/topup', (req, res) => {
  if (BOT_TOKEN && !ALLOW_CLIENT_TOPUP) {
    return res.status(403).json({ error: 'إضافة النجوم تتم عبر بوابة الدفع فقط', code: 'forbidden' });
  }
  const b = req.body || {};
  const playerId = requirePlayerId(req, res);
  if (playerId === null) return;
  try {
    const result = ledger.topup({ topupId: b.topupId, playerId, amount: b.amount });
    res.json(result);
  } catch (err) {
    ledgerErrorResponse(res, err);
  }
});

// Credit stars for a claimed grant (battle pass / wheel / referral / VIP
// daily). Idempotent by grantId and bounded by the daily star cap.
app.post('/ledger/grant', (req, res) => {
  const b = req.body || {};
  const playerId = requirePlayerId(req, res);
  if (playerId === null) return;
  try {
    const result = ledger.grant({ grantId: b.grantId, playerId, stars: b.stars, vip: b.vip === true });
    res.json(result);
  } catch (err) {
    ledgerErrorResponse(res, err);
  }
});

// ============================================================
// Telegram Stars payments — real-money-adjacent purchases
// ============================================================
// The client requests an invoice (Telegram-verified identity), opens it
// in the Mini App, and Telegram delivers payment confirmation to the
// webhook below. Money-in never originates from the client.

// Create a Stars invoice for a package purchase.
app.post('/api/create-invoice', telegramAuth, async (req, res) => {
  if (!BOT_TOKEN) return res.status(503).json({ error: 'بوابة الدفع غير مفعّلة', code: 'unavailable' });
  if (!req.telegramUserId) return res.status(401).json({ error: 'هوية غير موثّقة', code: 'unauthorized' });
  const b = req.body || {};
  const pkg = STAR_PACKAGES.find((p) => p.id === b.packageId);
  if (!pkg) return res.status(400).json({ error: 'حزمة غير معروفة', code: 'invalid' });
  try {
    const result = await createInvoiceLink(BOT_TOKEN, pkg, req.telegramUserId);
    res.json({ invoiceLink: result, packageId: pkg.id, starsAmount: pkg.starsAmount, bonusStars: pkg.bonusStars });
  } catch (err) {
    console.error('[payments] createInvoiceLink failed:', err.message);
    res.status(502).json({ error: 'تعذر إنشاء الفاتورة حالياً', code: 'gateway' });
  }
});

// Telegram payment webhook: pre_checkout_query approval + successful_payment
// crediting. Verified by the webhook secret token when configured.
app.post('/webhook', async (req, res) => {
  const update = req.body || {};
  const secret = req.get('x-telegram-bot-api-secret-token') || '';
  if (WEBHOOK_SECRET && secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false });
  }

  // 1) Pre-checkout: approve only real, correctly-priced invoices.
  const pcq = update.pre_checkout_query;
  if (pcq) {
    const problem = validatePayment({ payload: pcq.invoice_payload, currency: pcq.currency, totalAmount: pcq.total_amount });
    try {
      await botApi(BOT_TOKEN, 'answerPreCheckoutQuery', {
        pre_checkout_query_id: pcq.id,
        ok: !problem,
        ...(problem ? { error_message: problem } : {})
      });
    } catch (err) {
      console.error('[payments] answerPreCheckoutQuery failed:', err.message);
    }
    return res.json({ ok: true });
  }

  // 2) Successful payment: credit the buyer idempotently (topupId = payload).
  const sp = update.message && update.message.successful_payment;
  if (sp) {
    try {
      const problem = validatePayment({ payload: sp.invoice_payload, currency: sp.currency, totalAmount: sp.total_amount });
      const parsed = parsePayload(sp.invoice_payload);
      if (problem || !parsed) {
        console.warn('[payments] rejected successful_payment:', problem || 'bad payload');
      } else {
        // Credit stars + bonus once; a redelivered update replays safely.
        ledger.topup({ topupId: sp.invoice_payload, playerId: parsed.userId, amount: parsed.pkg.starsAmount + parsed.pkg.bonusStars });
        console.log(`[payments] credited ${parsed.pkg.starsAmount + parsed.pkg.bonusStars} stars to ${parsed.userId} (${parsed.packageId})`);
      }
    } catch (err) {
      console.error('[payments] crediting failed:', err.message);
    }
  }

  res.json({ ok: true });
});

// ---- PeerJS signaling (WebRTC handshake only) ----
// Mounted at the root so the client's default path "/" resolves to the
// "/peerjs" WebSocket endpoint and "/peerjs/id" HTTP id endpoint.
let peerJsWss = null;
const peerApp = ExpressPeerServer(server, {
  path: '/',
  allow_discovery: false,
  createWebSocketServer: (options) => {
    const { server: _attached, ...rest } = options; // drop "server" so noServer is the sole binding
    peerJsWss = new WebSocketServer({ ...rest, noServer: true });
    return peerJsWss;
  }
});
app.use(peerApp);

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    db: tidbPool ? 'tidb' : 'jsonl',
    queue: queue.length,
    players: queue.reduce((s, p) => s + p.teamSize, 0),
    ledger: ledger.stats()
  });
});

// ---- Matchmaking WebSocket ----
const matchWss = new WebSocketServer({ noServer: true });

matchWss.on('connection', (ws) => {
  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    if (msg.type === 'ping') {
      send(ws, { type: 'pong' });
      return;
    }

    if (msg.type === 'queue') {
      const p = msg.payload || {};
      const id = typeof p.id === 'number' ? p.id : Math.floor(Math.random() * 1e9);
      const name = String(p.name || 'لاعب').slice(0, 32);
      // The mode dictates the team size (server is authoritative — clients
      // can't lie their way into a different lobby shape).
      const mode = MODES[p.mode] ? p.mode : 'quick';
      const teamSize = MODES[mode].teamSize;
      // Competitive rating (trophy count) — used only by ranked grouping.
      const rating = Number.isFinite(p.rating) ? Math.max(0, Math.floor(p.rating)) : 0;
      if (bySocket.has(ws)) leaveQueue(ws);
      const entry = { ws, id, name, teamSize, mode, rating, joinedAt: Date.now() };
      queue.push(entry);
      bySocket.set(ws, entry);
      log(`player ${name} queued (mode=${mode}, rating=${rating}, waiting=${queue.length})`);
      broadcastStatus();
      return;
    }

    if (msg.type === 'leave_queue') {
      leaveQueue(ws);
    }
  });

  ws.on('close', () => leaveQueue(ws));
  ws.on('error', () => leaveQueue(ws));
});

// ---- Single upgrade router for both WebSocket servers ----
server.on('upgrade', (req, socket, head) => {
  const pathname = (req.url || '/').split('?')[0];
  if (pathname === '/match') {
    matchWss.handleUpgrade(req, socket, head, (ws) => matchWss.emit('connection', ws, req));
    return;
  }
  if (pathname.startsWith('/peerjs')) {
    peerJsWss.handleUpgrade(req, socket, head, (ws) => peerJsWss.emit('connection', ws, req));
    return;
  }
  socket.destroy();
});

// ---- Loops ----
setInterval(tick, 1000);
setInterval(() => {
  for (const ws of matchWss.clients) {
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }
}, 25000);

server.listen(PORT, HOST, () => {
  log(`matchmaking + signaling listening on ${HOST}:${PORT}`);
});

// Register the Telegram payment webhook on boot (payments + pre-checkout
// only). Fire-and-forget: a failure here must never crash the match server.
if (BOT_TOKEN && WEBHOOK_URL) {
  botApi(BOT_TOKEN, 'setWebhook', {
    url: WEBHOOK_URL,
    ...(WEBHOOK_SECRET ? { secret_token: WEBHOOK_SECRET } : {}),
    allowed_updates: ['message', 'pre_checkout_query']
  })
    .then(() => console.log(`[payments] webhook registered at ${WEBHOOK_URL}`))
    .catch((err) => console.warn('[payments] setWebhook failed:', err.message));
}
