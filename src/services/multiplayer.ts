import Peer, { DataConnection } from 'peerjs';
import { MultiplayerMessage } from '../types';
import { config } from '../config';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

const DIAL_ATTEMPTS = 20;       // ~30s of retry dialing while peers come online
const DIAL_INTERVAL_MS = 1500;

// ============================================================
// MultiplayerService — P2P WebRTC mesh via self-hosted PeerJS.
//
// Two connection topologies are supported:
//
//   • Mesh (matchmade rooms): every player derives a deterministic peer id
//     from the room code + their player id, so all clients can find each
//     other through the shared signaling server. To guarantee exactly one
//     DataChannel per pair (no duplicate channels), the peer with the LOWER
//     player id always dials the HIGHER one. Result: full mesh, no relay,
//     no duplicates — reliable for the 2–4 human fighters we target on
//     mobile, and still correct up to 8.
//
//   • Star (private rooms / deep links): the host listens on sv-host-<code>
//     and the joiner dials it — a single 1v1 channel.
//
// Gameplay traffic (movement, shots, hits, loot, game-over) never touches
// the server; it flows peer-to-peer. The server only matches players and
// relays the WebRTC handshake.
// ============================================================
export class MultiplayerService {
  private peer: Peer | null = null;
  /** Open data channels keyed by the learned senderId of the remote peer. */
  private connections = new Map<number, DataConnection>();
  /** Dialing attempts in flight, keyed by the target peer id string. */
  private dialing = new Map<string, DataConnection>();
  private broadcastChannel: BroadcastChannel | null = null;
  private onMessageCallback: ((msg: MultiplayerMessage) => void) | null = null;
  private onStatusChangeCallback: ((status: ConnectionStatus, peerName?: string) => void) | null = null;
  private myName = '';

  public isHost = false;
  public roomCode = '';
  public status: ConnectionStatus = 'disconnected';
  public isAiMode = false;
  public myPlayerId = 0;
  /** Player id of the first connected peer (kept for legacy callers). */
  public opponentId: number | null = null;

  constructor() {}

  public init(
    playerId: number,
    onMessage: (msg: MultiplayerMessage) => void,
    onStatusChange: (status: ConnectionStatus, peerName?: string) => void
  ) {
    this.myPlayerId = playerId;
    this.onMessageCallback = onMessage;
    this.onStatusChangeCallback = onStatusChange;
  }

  /** Number of live human peer channels (bots are local and don't count). */
  public get peerCount(): number {
    return this.connections.size;
  }

  /** Player ids currently connected over live data channels. */
  public get connectedPeerIds(): number[] {
    return Array.from(this.connections.keys());
  }

  /** PeerJS connection options: self-hosted signaling when configured. */
  private peerOptions(): Record<string, unknown> {
    const signal = config.peerSignal;
    return signal
      ? { host: signal.host, port: signal.port, path: signal.path, secure: signal.secure }
      : {};
  }

  /** Deterministic peer id for a mesh participant. */
  private meshId(roomCode: string, playerId: number): string {
    return `sv-mesh-${roomCode.toLowerCase()}-${playerId}`;
  }

  private makePeer(id: string): Peer {
    return new Peer(id, {
      debug: 1,
      ...this.peerOptions(),
      config: { iceServers: ICE_SERVERS }
    });
  }

  private openBroadcastChannel() {
    try {
      this.broadcastChannel = new BroadcastChannel(`sv-room-${this.roomCode}`);
      this.broadcastChannel.onmessage = (event) => {
        const msg = event.data as MultiplayerMessage | undefined;
        if (msg && msg.senderId !== this.myPlayerId) {
          this.deliver(msg, null);
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported in this env', e);
    }
  }

  private attachPeerHandlers() {
    if (!this.peer) return;
    this.peer.on('open', () => {
      // Still connecting until the first human channel is live.
      if (this.connections.size === 0) this.updateStatus('connecting');
    });
    this.peer.on('connection', (incoming) => this.registerConnection(incoming));
    this.peer.on('error', (err) => {
      console.warn('Peer error:', err);
    });
  }

  /** Wire a single DataChannel (incoming or dialed) to the message bus. */
  private registerConnection(conn: DataConnection) {
    conn.on('open', () => {
      // Handshake carries our identity so the remote can key the channel.
      this.sendOn(conn, {
        type: 'JOIN_ROOM',
        senderId: this.myPlayerId,
        payload: { playerName: this.myName, roomCode: this.roomCode },
        timestamp: Date.now()
      });
      this.updateStatus('connected', 'لاعب حقيقي متصل');
    });
    conn.on('data', (data) => this.deliver(data as MultiplayerMessage, conn));
    conn.on('close', () => this.dropConnection(conn));
    conn.on('error', () => this.dropConnection(conn));
  }

  private deliver(msg: MultiplayerMessage, from: DataConnection | null) {
    if (!msg || typeof msg !== 'object') return;
    if (typeof msg.senderId === 'number' && msg.senderId !== this.myPlayerId) {
      if (from) this.connections.set(msg.senderId, from);
      if (this.opponentId === null) this.opponentId = msg.senderId;
      if (this.status !== 'connected') this.updateStatus('connected', 'لاعب حقيقي متصل');
      if (this.onMessageCallback) this.onMessageCallback(msg);
    }
  }

  private dropConnection(conn: DataConnection) {
    for (const [id, c] of this.connections) {
      if (c === conn) this.connections.delete(id);
    }
    for (const [peerId, c] of this.dialing) {
      if (c === conn) this.dialing.delete(peerId);
    }
    if (this.connections.size === 0 && this.status !== 'disconnected') {
      this.updateStatus('disconnected');
    }
  }

  /** Dial a target peer id, retrying until the channel opens or cleanup. */
  private dial(targetPeerId: string, remaining: number) {
    if (!this.peer || this.peer.destroyed) return;
    if (this.dialing.has(targetPeerId)) return;
    const conn = this.peer.connect(targetPeerId, { reliable: true });
    this.dialing.set(targetPeerId, conn);
    this.registerConnection(conn);
    const guard = window.setTimeout(() => {
      this.dialing.delete(targetPeerId);
      if (!conn.open && remaining > 0 && this.peer && !this.peer.destroyed) {
        try { conn.close(); } catch { /* already closed */ }
        this.dial(targetPeerId, remaining - 1);
      }
    }, DIAL_INTERVAL_MS);
    conn.on('open', () => window.clearTimeout(guard));
  }

  private startMesh(roomCode: string, playerIds: number[]) {
    // Mesh rule: the peer with the LOWER id dials the HIGHER id. This yields
    // exactly one channel per pair with no duplicates and no relay.
    const myPeerId = this.meshId(roomCode, this.myPlayerId);
    try {
      this.peer = this.makePeer(myPeerId);
      this.attachPeerHandlers();
      this.peer.on('open', () => {
        for (const pid of playerIds) {
          if (pid !== this.myPlayerId && pid > this.myPlayerId) {
            this.dial(this.meshId(roomCode, pid), DIAL_ATTEMPTS);
          }
        }
      });
    } catch (err) {
      console.error('Failed to init mesh PeerJS:', err);
    }
  }

  private startStar(roomCode: string, playerName: string) {
    const hostPeerId = `sv-host-${roomCode.toLowerCase()}`;
    try {
      this.peer = this.isHost
        ? this.makePeer(hostPeerId)
        : this.makePeer(`sv-client-${roomCode.toLowerCase()}-${Date.now().toString().slice(-4)}`);
      this.attachPeerHandlers();
      if (!this.isHost) {
        this.peer.on('open', () => this.dial(hostPeerId, DIAL_ATTEMPTS));
      }
    } catch (err) {
      console.error('Failed to init PeerJS:', err);
    }
    // Ping the host over the broadcast channel immediately (local tabs / backup).
    window.setTimeout(() => {
      this.broadcastChannel?.postMessage({
        type: 'JOIN_ROOM',
        senderId: this.myPlayerId,
        payload: { playerName, roomCode: this.roomCode },
        timestamp: Date.now()
      });
    }, 400);
  }

  // 1. Create a room (host). With playerIds -> full mesh; without -> 1v1 star.
  public createRoom(roomCode: string, playerName: string, playerIds?: number[]) {
    this.cleanup();
    this.roomCode = roomCode.toUpperCase().trim();
    this.isHost = true;
    this.isAiMode = false;
    this.myName = playerName;
    this.updateStatus('connecting');
    this.openBroadcastChannel();
    if (playerIds && playerIds.length > 1) this.startMesh(this.roomCode, playerIds);
    else this.startStar(this.roomCode, playerName);
  }

  // 2. Join an existing room (client). With playerIds -> full mesh.
  public joinRoom(roomCode: string, playerName: string, playerIds?: number[]) {
    this.cleanup();
    this.roomCode = roomCode.toUpperCase().trim();
    this.isHost = false;
    this.isAiMode = false;
    this.myName = playerName;
    this.updateStatus('connecting');
    this.openBroadcastChannel();
    if (playerIds && playerIds.length > 1) this.startMesh(this.roomCode, playerIds);
    else this.startStar(this.roomCode, playerName);
  }

  // 3. Start AI Training Match
  public startAiMatch() {
    this.cleanup();
    this.isAiMode = true;
    this.isHost = true;
    this.roomCode = 'AI-TRAINING';
    this.updateStatus('connected', 'الذكاء الاصطناعي (Cyber AI)');
  }

  // 4. Solo matchmade battle (no human opponent found — bot-only fight)
  public startSoloMatch() {
    this.cleanup();
    this.isAiMode = false;
    this.isHost = true;
    this.roomCode = 'SOLO';
    this.updateStatus('connected', 'معركة البوتات');
  }

  private sendOn(conn: DataConnection | null | undefined, msg: MultiplayerMessage) {
    if (conn && conn.open) {
      try { conn.send(msg); } catch { /* drop silent */ }
    }
  }

  public sendMessage(msg: MultiplayerMessage) {
    for (const conn of this.connections.values()) this.sendOn(conn, msg);
    if (this.broadcastChannel) {
      try { this.broadcastChannel.postMessage(msg); } catch { /* drop silent */ }
    }
  }

  public sendGameOver(winnerId: number) {
    this.sendMessage({
      type: 'GAME_OVER',
      senderId: this.myPlayerId,
      payload: { winnerId },
      timestamp: Date.now()
    });
  }

  // ---- Shooter real-time sync (broadcast to every human peer) ----

  public sendShooterState(state: Record<string, number | boolean | string>) {
    this.sendMessage({
      type: 'SYNC_SHOOTER_STATE',
      senderId: this.myPlayerId,
      payload: state,
      timestamp: Date.now()
    });
  }

  public sendShootBullets(bullets: unknown[]) {
    this.sendMessage({
      type: 'SHOOT_BULLETS',
      senderId: this.myPlayerId,
      payload: { bullets },
      timestamp: Date.now()
    });
  }

  public sendBulletHit(victimId: number, damage: number, weaponType: string) {
    this.sendMessage({
      type: 'BULLET_HIT',
      senderId: this.myPlayerId,
      payload: { victimId, damage, weaponType },
      timestamp: Date.now()
    });
  }

  public sendLootTaken(lootId: string) {
    this.sendMessage({
      type: 'LOOT_TAKEN',
      senderId: this.myPlayerId,
      payload: { lootId },
      timestamp: Date.now()
    });
  }

  private updateStatus(status: ConnectionStatus, peerName?: string) {
    this.status = status;
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(status, peerName);
    }
  }

  public cleanup() {
    for (const conn of this.connections.values()) {
      try { conn.close(); } catch { /* already closed */ }
    }
    for (const conn of this.dialing.values()) {
      try { conn.close(); } catch { /* already closed */ }
    }
    this.connections.clear();
    this.dialing.clear();
    if (this.peer) {
      try { this.peer.destroy(); } catch { /* already destroyed */ }
      this.peer = null;
    }
    if (this.broadcastChannel) {
      try { this.broadcastChannel.close(); } catch { /* already closed */ }
      this.broadcastChannel = null;
    }
    this.status = 'disconnected';
    this.isAiMode = false;
    this.opponentId = null;
    this.myName = '';
  }
}

export const multiplayer = new MultiplayerService();
