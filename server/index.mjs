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

const PORT = Number(process.env.PORT || 8000);
const HOST = '0.0.0.0';

const ledger = createLedger();

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
  ranked: {
    maxHumans: Number(process.env.RANKED_MAX_HUMANS || 8),
    minHumans: 8,
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

function tick() {
  const now = Date.now();
  for (const mode of Object.keys(MODES)) {
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
}

// ---- HTTP app ----
const app = express();
const server = createServer(app);
app.use(express.json({ limit: '16kb' }));

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

// Read a player's authoritative balance (does not persist unknown players).
app.get('/ledger/player/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'معرّف لاعب غير صالح' });
  try {
    res.json(ledger.playerView(id));
  } catch (err) {
    ledgerErrorResponse(res, err);
  }
});

// Escrow a stake before a staked match starts.
app.post('/ledger/stake', (req, res) => {
  const b = req.body || {};
  try {
    const receipt = ledger.stake({ playerId: b.playerId, amount: b.amount, roomCode: b.roomCode });
    res.json(receipt);
  } catch (err) {
    ledgerErrorResponse(res, err);
  }
});

// Settle a finished match: computes and pays the authoritative rewards.
app.post('/ledger/settle', (req, res) => {
  const b = req.body || {};
  try {
    const settlement = ledger.settle({
      matchId: b.matchId, playerId: b.playerId, escrowId: b.escrowId,
      won: b.won, kills: b.kills, damage: b.damage, accuracy: b.accuracy,
      durationSec: b.durationSec, mode: b.mode, name: b.name
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
  try {
    const result = ledger.cancelEscrow(b.escrowId, b.playerId);
    res.json(result);
  } catch (err) {
    ledgerErrorResponse(res, err);
  }
});

// Debit stars for a store purchase (battle pass, skin, VIP unlock...).
// Idempotent by purchaseId so a retried request never charges twice.
app.post('/ledger/purchase', (req, res) => {
  const b = req.body || {};
  try {
    const result = ledger.purchase({ purchaseId: b.purchaseId, playerId: b.playerId, productId: b.productId, amount: b.amount, vip: b.vip === true });
    res.json(result);
  } catch (err) {
    ledgerErrorResponse(res, err);
  }
});

// Credit stars for a real-money top-up (stars package purchase). Money-in is
// not a reward, so it is NOT bounded by the daily reward cap — but it is
// still idempotent by topupId.
app.post('/ledger/topup', (req, res) => {
  const b = req.body || {};
  try {
    const result = ledger.topup({ topupId: b.topupId, playerId: b.playerId, amount: b.amount });
    res.json(result);
  } catch (err) {
    ledgerErrorResponse(res, err);
  }
});

// Credit stars for a claimed grant (battle pass / wheel / referral / VIP
// daily). Idempotent by grantId and bounded by the daily star cap.
app.post('/ledger/grant', (req, res) => {
  const b = req.body || {};
  try {
    const result = ledger.grant({ grantId: b.grantId, playerId: b.playerId, stars: b.stars, vip: b.vip === true });
    res.json(result);
  } catch (err) {
    ledgerErrorResponse(res, err);
  }
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
      if (bySocket.has(ws)) leaveQueue(ws);
      const entry = { ws, id, name, teamSize, mode, joinedAt: Date.now() };
      queue.push(entry);
      bySocket.set(ws, entry);
      log(`player ${name} queued (mode=${mode}, team=${teamSize}, waiting=${queue.length})`);
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
