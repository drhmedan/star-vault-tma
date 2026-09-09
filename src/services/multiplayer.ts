import Peer, { DataConnection } from 'peerjs';
import { MultiplayerMessage, DeployedUnit, CommanderAbilityType } from '../types';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export class MultiplayerService {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private broadcastChannel: BroadcastChannel | null = null;
  private onMessageCallback: ((msg: MultiplayerMessage) => void) | null = null;
  private onStatusChangeCallback: ((status: ConnectionStatus, peerName?: string) => void) | null = null;
  
  public isHost: boolean = false;
  public roomCode: string = '';
  public status: ConnectionStatus = 'disconnected';
  public isAiMode: boolean = false;
  public myPlayerId: number = 0;

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

  // 1. Create a Host Room
  public createRoom(roomCode: string, playerName: string) {
    this.cleanup();
    this.roomCode = roomCode.toUpperCase().trim();
    this.isHost = true;
    this.isAiMode = false;
    this.updateStatus('connecting');

    // BroadcastChannel for instant local multi-tab testing
    try {
      this.broadcastChannel = new BroadcastChannel(`sv-room-${this.roomCode}`);
      this.broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.senderId !== this.myPlayerId) {
          this.handleIncomingMessage(event.data);
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported in this env', e);
    }

    // Initialize WebRTC Host Peer
    const peerId = `sv-host-${this.roomCode.toLowerCase()}`;
    try {
      this.peer = new Peer(peerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', (id) => {
        console.log('Host peer opened with id:', id);
        this.updateStatus('connecting');
      });

      this.peer.on('connection', (incomingConn) => {
        console.log('Opponent connected to host!');
        this.conn = incomingConn;
        this.setupConnectionHandlers();
      });

      this.peer.on('error', (err) => {
        console.warn('Peer error (falling back to local relay):', err);
      });
    } catch (err) {
      console.error('Failed to init PeerJS:', err);
    }
  }

  // 2. Join an Existing Room
  public joinRoom(roomCode: string, playerName: string) {
    this.cleanup();
    this.roomCode = roomCode.toUpperCase().trim();
    this.isHost = false;
    this.isAiMode = false;
    this.updateStatus('connecting');

    // BroadcastChannel for instant local multi-tab testing
    try {
      this.broadcastChannel = new BroadcastChannel(`sv-room-${this.roomCode}`);
      this.broadcastChannel.onmessage = (event) => {
        if (event.data && event.data.senderId !== this.myPlayerId) {
          this.handleIncomingMessage(event.data);
        }
      };
    } catch (e) {
      console.warn('BroadcastChannel not supported', e);
    }

    const hostPeerId = `sv-host-${this.roomCode.toLowerCase()}`;
    const myClientPeerId = `sv-client-${this.roomCode.toLowerCase()}-${Date.now().toString().slice(-4)}`;

    try {
      this.peer = new Peer(myClientPeerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' }
          ]
        }
      });

      this.peer.on('open', () => {
        console.log('Client peer opened, connecting to host:', hostPeerId);
        const connection = this.peer!.connect(hostPeerId, { reliable: true });
        this.conn = connection;
        this.setupConnectionHandlers();
      });

      this.peer.on('error', (err) => {
        console.warn('Peer client connection error:', err);
      });
    } catch (err) {
      console.error('Failed to init PeerJS client:', err);
    }

    // Ping host over broadcast channel immediately
    setTimeout(() => {
      this.sendMessage({
        type: 'JOIN_ROOM',
        senderId: this.myPlayerId,
        payload: { playerName, roomCode: this.roomCode },
        timestamp: Date.now()
      });
    }, 400);
  }

  // 3. Start AI Training Match
  public startAiMatch() {
    this.cleanup();
    this.isAiMode = true;
    this.isHost = true;
    this.roomCode = 'AI-TRAINING';
    this.updateStatus('connected', 'الذكاء الاصطناعي (Cyber AI)');
  }

  private setupConnectionHandlers() {
    if (!this.conn) return;

    this.conn.on('open', () => {
      console.log('WebRTC connection established!');
      this.updateStatus('connected', 'لاعب متصل أونلاين');
      // Send handshake
      this.sendMessage({
        type: 'JOIN_ROOM',
        senderId: this.myPlayerId,
        payload: { roomCode: this.roomCode },
        timestamp: Date.now()
      });
    });

    this.conn.on('data', (data) => {
      this.handleIncomingMessage(data as MultiplayerMessage);
    });

    this.conn.on('close', () => {
      this.updateStatus('disconnected');
    });

    this.conn.on('error', () => {
      this.updateStatus('error');
    });
  }

  private handleIncomingMessage(msg: MultiplayerMessage) {
    if (this.status !== 'connected') {
      this.updateStatus('connected', 'لاعب حقيقي متصل');
    }
    if (this.onMessageCallback) {
      this.onMessageCallback(msg);
    }
  }

  public sendMessage(msg: MultiplayerMessage) {
    // 1. Send via WebRTC DataChannel if active
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(msg);
      } catch (e) {
        console.warn('Failed to send via WebRTC:', e);
      }
    }

    // 2. Send via BroadcastChannel (local tabs / backup)
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage(msg);
      } catch (e) {
        console.warn('Failed to send via BroadcastChannel:', e);
      }
    }
  }

  public sendUnitDeployment(unit: DeployedUnit) {
    this.sendMessage({
      type: 'DEPLOY_UNIT',
      senderId: this.myPlayerId,
      payload: unit,
      timestamp: Date.now()
    });
  }

  public sendAbilityUse(abilityId: CommanderAbilityType, targetX?: number, targetY?: number) {
    this.sendMessage({
      type: 'USE_ABILITY',
      senderId: this.myPlayerId,
      payload: { abilityId, targetX, targetY },
      timestamp: Date.now()
    });
  }

  public sendReadyState(isReady: boolean) {
    this.sendMessage({
      type: 'READY',
      senderId: this.myPlayerId,
      payload: { isReady },
      timestamp: Date.now()
    });
  }

  public sendCombatStart() {
    this.sendMessage({
      type: 'COMBAT_START',
      senderId: this.myPlayerId,
      payload: {},
      timestamp: Date.now()
    });
  }

  public sendGameOver(winnerId: number) {
    this.sendMessage({
      type: 'GAME_OVER',
      senderId: this.myPlayerId,
      payload: { winnerId },
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
    if (this.conn) {
      try { this.conn.close(); } catch (_) {}
      this.conn = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (_) {}
      this.peer = null;
    }
    if (this.broadcastChannel) {
      try { this.broadcastChannel.close(); } catch (_) {}
      this.broadcastChannel = null;
    }
    this.status = 'disconnected';
    this.isAiMode = false;
  }
}

export const multiplayer = new MultiplayerService();
