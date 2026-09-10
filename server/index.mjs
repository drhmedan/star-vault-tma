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

const PORT = Number(process.env.PORT || 8000);
const HOST = '0.0.0.0';

// ---- Matchmaking configuration (env-overridable for tests) ----
const MODES = {
  quick: {
    target: 8,                                             // room size (real + bots)
    minReal: Number(process.env.QUICK_MIN_REAL || 2),      // humans needed before bot-fill
    fillMs: Number(process.env.QUICK_FILL_MS || 30000)     // gathering window
  },
  ranked: {
    target: 8,
    minReal: Number(process.env.RANKED_MIN_REAL || 8),     // ranked never bot-fills
    fillMs: Number(process.env.RANKED_FILL_MS || 60000)
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
  const players = members.map((m) => ({ id: m.id, name: m.name }));
  const fillBots = Math.max(0, cfg.target - players.length);
  log(`room ${roomCode} formed (mode=${mode}, real=${players.length}, bots=${fillBots})`);
  for (const m of members) {
    const i = queue.indexOf(m);
    if (i !== -1) queue.splice(i, 1);
    bySocket.delete(m.ws);
    send(m.ws, {
      type: 'room_ready',
      payload: { roomCode, mode, host: players[0].id, players, fillBots, teamSize: m.teamSize }
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
    if (group.length >= cfg.target) {
      formRoom(group.slice(0, cfg.target), mode);
      continue;
    }
    // Gathering window elapsed with enough humans -> fill with bots.
    if (group.length >= cfg.minReal && now - group[0].joinedAt >= cfg.fillMs) {
      formRoom(group.slice(0, cfg.target), mode);
    }
  }
}

// ---- HTTP app ----
const app = express();
const server = createServer(app);

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
  res.json({ ok: true, queue: queue.length, players: queue.reduce((s, p) => s + p.teamSize, 0) });
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
      const teamSize = [1, 2, 4].includes(p.teamSize) ? p.teamSize : 1;
      const mode = p.mode === 'ranked' ? 'ranked' : 'quick';
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
