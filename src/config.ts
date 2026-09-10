// ============================================================
// Runtime service configuration
// ============================================================
// The game is fully playable offline (solo bot battles). When
// VITE_GAME_SERVER points at the deployed Koyeb container, live
// matchmaking and self-hosted WebRTC signaling activate:
//
//   VITE_GAME_SERVER=https://your-service.koyeb.app
//
// Both the /match WebSocket and the /peerjs signaling endpoint live on
// that single container, so one URL drives the whole live backend.

interface PeerSignalConfig {
  host: string;
  port: number;
  path: string;
  secure: boolean;
}

const raw = (import.meta.env.VITE_GAME_SERVER as string | undefined) ?? '';
const GAME_SERVER = raw.replace(/\/+$/, '');

export const config = {
  gameServer: GAME_SERVER,
  /** True when a live backend is configured; otherwise the app runs offline. */
  matchmakerAvailable: GAME_SERVER !== '',
  /** WebSocket endpoint of the matchmaking queue. */
  matchmakerUrl: GAME_SERVER !== '' ? GAME_SERVER.replace(/^http/, 'ws') + '/match' : '',
  /** Self-hosted PeerJS signaling; null falls back to the PeerJS cloud. */
  peerSignal: GAME_SERVER !== ''
    ? { host: GAME_SERVER.replace(/^https?:\/\//, ''), port: 443, path: '/', secure: true } as PeerSignalConfig
    : null
} as const;
