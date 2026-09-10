// ============================================================
// Matchmaking client — talks to the /match WebSocket on the
// Koyeb container. The client only handles the queue; gameplay
// itself stays peer-to-peer via PeerJS once a room is assigned.
// ============================================================

export interface MatchedPlayer {
  id: number;
  name: string;
  /** 0-based seat in the room, assigned by the server for deterministic spawns. */
  slot?: number;
  /** Team index (0/1) in team modes, assigned by seat parity. */
  team?: number;
}

export type GameMode = 'quick' | 'ffa' | '2v2' | 'squad' | 'ranked';

export interface MatchRoom {
  roomCode: string;
  mode: GameMode;
  host: number;
  players: MatchedPlayer[];
  fillBots: number;
  teamSize: number;
}

/** Information passed into the arena for a matchmade room. */
export interface MatchInfo {
  myId: number;
  hostId: number;
  players: MatchedPlayer[];
  fillBots: number;
  /** My seat in the room (0-based), used for deterministic spawn placement. */
  mySlot?: number;
  /** The game mode this room was gathered under. */
  gameMode: GameMode;
  /** Squad size of the mode (1 = solo, 2 = duo, 4 = squad). */
  teamSize: number;
}

export type MatchmakerEvent =
  | { type: 'status'; waiting: number; total: number }
  | { type: 'ready'; room: MatchRoom }
  | { type: 'error'; message: string }
  | { type: 'closed'; reason: 'left' | 'network' };

export type QueueParams = {
  userId: number;
  name: string;
  teamSize: number;
  mode: GameMode;
  url: string;
};

const CONNECT_TIMEOUT_MS = 8000;

export class MatchmakingClient {
  private ws: WebSocket | null = null;
  private handler: ((e: MatchmakerEvent) => void) | null = null;
  private connectTimer: number | null = null;
  private finished = false;

  /** Connect and join the queue. Replaces any in-flight search. */
  public start(params: QueueParams, handler: (e: MatchmakerEvent) => void): void {
    this.stop();
    this.handler = handler;
    this.finished = false;

    this.connectTimer = window.setTimeout(() => {
      this.finish({ type: 'error', message: 'تعذر الاتصال بخادم المطابقة' });
    }, CONNECT_TIMEOUT_MS);

    const ws = new WebSocket(params.url);
    this.ws = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'queue',
        payload: { id: params.userId, name: params.name, teamSize: params.teamSize, mode: params.mode }
      }));
    };

    ws.onmessage = (ev) => {
      let msg: { type?: string; payload?: Record<string, unknown> };
      try { msg = JSON.parse(ev.data as string); } catch { return; }
      if (msg.type === 'queue_status') {
        const p = (msg.payload ?? {}) as { waiting?: number; total?: number };
        this.handler?.({ type: 'status', waiting: p.waiting ?? 0, total: p.total ?? 0 });
      } else if (msg.type === 'room_ready') {
        const p = (msg.payload ?? {}) as {
          roomCode?: string; mode?: GameMode; host?: number;
          players?: MatchedPlayer[]; fillBots?: number; teamSize?: number;
        };
        const room: MatchRoom = {
          roomCode: p.roomCode ?? '',
          mode: p.mode ?? 'quick',
          host: p.host ?? 0,
          players: p.players ?? [],
          fillBots: p.fillBots ?? 0,
          teamSize: p.teamSize ?? 1
        };
        this.finish({ type: 'ready', room });
      }
    };

    ws.onerror = () => {
      this.finish({ type: 'error', message: 'تعذر الاتصال بخادم المطابقة' });
    };

    ws.onclose = () => {
      if (!this.finished) this.finish({ type: 'closed', reason: 'network' });
    };
  }

  /** Cancel the current search and close the socket. */
  public cancel(): void {
    const reason: 'left' = 'left';
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try { this.ws.send(JSON.stringify({ type: 'leave_queue' })); } catch { /* closing anyway */ }
    }
    this.finish({ type: 'closed', reason });
  }

  private finish(e: MatchmakerEvent): void {
    if (this.finished) return;
    this.finished = true;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch { /* already closed */ }
      this.ws = null;
    }
    this.handler?.(e);
  }

  /** Hard teardown without emitting events (component unmount). */
  public stop(): void {
    this.finished = true;
    if (this.connectTimer !== null) {
      window.clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch { /* already closed */ }
      this.ws = null;
    }
  }
}
