// ============================================================
// Deploy smoke — verify a live backend end-to-end.
// ============================================================
// Run against a deployed Koyeb service:
//
//   GAME_SERVER=https://sv-xxx.koyeb.app node server/deploy-smoke.mjs
//
// Checks (hard failures exit non-zero):
//   1. GET  /health              -> 200 { ok:true }
//   2. CORS preflight OPTIONS    -> Access-Control-Allow-Origin present
//   3. WS   /match               -> queue + receive queue_status / room_ready
//   4. GET  /peerjs/id           -> 200 JSON id (signaling endpoint alive)
// Soft (reported, never fatal): leaderboard and invoice endpoints report
// their auth state so you can confirm Telegram verification is active.
// ============================================================

import { WebSocket } from 'ws';

const raw = (process.env.GAME_SERVER || process.argv[2] || '').trim().replace(/\/+$/, '');
if (!raw) {
  console.error('Usage: GAME_SERVER=https://sv-xxx.koyeb.app node server/deploy-smoke.mjs');
  process.exit(2);
}
const base = raw;
const wsUrl = base.replace(/^http/, 'ws') + '/match';

let failures = 0;
const ok = (cond, label, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? ' — ' + extra : ''}`); if (!cond) failures++; };
const info = (label, extra = '') => console.log(`INFO  ${label}${extra ? ' — ' + extra : ''}`);

// 1) Health
let healthOk = false;
try {
  const r = await fetch(base + '/health');
  const j = await r.json();
  healthOk = r.ok && j.ok === true;
  ok(healthOk, 'GET /health', `queue=${j.queue ?? '?'}`);
} catch {
  ok(false, 'GET /health', 'unreachable');
}

// 2) CORS preflight
try {
  const r = await fetch(base + '/ledger/stake', {
    method: 'OPTIONS',
    headers: {
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type, x-telegram-init-data'
    }
  });
  const allow = r.headers.get('access-control-allow-origin');
  ok((r.status === 204 || r.ok) && !!allow, 'CORS preflight', `allow-origin=${allow ?? 'MISSING'}`);
} catch {
  ok(false, 'CORS preflight', 'failed');
}

// 3) WebSocket matchmaking
await new Promise((resolve) => {
  const ws = new WebSocket(wsUrl);
  const timer = setTimeout(() => { ok(false, 'WS /match', 'no message within 12s'); try { ws.close(); } catch {} resolve(); }, 12000);
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'queue', payload: { id: Date.now() % 1000000, name: 'smoke', teamSize: 1, mode: 'quick' } }));
  });
  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'queue_status' || msg.type === 'room_ready') {
        clearTimeout(timer);
        ok(true, 'WS /match', `received ${msg.type}`);
        ws.close();
        resolve();
      }
    } catch { /* ignore malformed */ }
  });
  ws.on('error', () => { clearTimeout(timer); ok(false, 'WS /match', 'connection error'); resolve(); });
  ws.on('close', () => { clearTimeout(timer); resolve(); });
});

// 4) PeerJS signaling id endpoint (returns a raw UUID as text)
try {
  const r = await fetch(base + '/peerjs/id');
  const text = await r.text();
  ok(r.ok && typeof text === 'string' && text.trim().length > 8, 'GET /peerjs/id', `id=${text.trim().slice(0, 8)}…`);
} catch {
  ok(false, 'GET /peerjs/id', 'unreachable');
}

// Soft: leaderboard (200 = open/dev, 401 = Telegram auth active — both healthy)
try {
  const r = await fetch(base + '/ledger/leaderboard');
  if (r.status === 200) info('GET /ledger/leaderboard', '200 (dev mode — no BOT_TOKEN, auth OFF)');
  else if (r.status === 401) info('GET /ledger/leaderboard', '401 (Telegram auth ACTIVE — expected in production)');
  else info('GET /ledger/leaderboard', `unexpected ${r.status}`);
} catch { info('GET /ledger/leaderboard', 'unreachable'); }

// Soft: invoice route exists (any non-404 means the route is wired)
try {
  const r = await fetch(base + '/api/create-invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  info('POST /api/create-invoice', r.status === 404 ? '404 — route MISSING (bad)' : `${r.status} (route wired; 401/503/400 all expected)`);
} catch { info('POST /api/create-invoice', 'unreachable'); }

console.log(failures === 0 ? '✅ DEPLOY SMOKE PASSED' : `❌ ${failures} HARD FAILURES`);
process.exit(failures === 0 ? 0 : 1);
