
import { Peer, DataConnection } from 'peerjs';
import { GameState, Player } from '../types';

export enum MultiplayerEvent {
  STATE_UPDATE = 'state_update',
  ACTION = 'action',
  EMOTE = 'emote',
  LOG = 'log',
  CHAT = 'chat',
  AUDIO = 'audio'
}

export interface MultiplayerAction {
  type: string;
  payload: any;
  senderId: string;
}

class MultiplayerService {
  private peer: Peer | null = null;
  private connections: Map<string, DataConnection> = new Map();
  private isHost: boolean = false;
  private onStateUpdate?: (state: GameState) => void;
  private onAction?: (action: MultiplayerAction) => void;
  private onEmote?: (emoji: string) => void;
  private onLog?: (msg: string) => void;
  private onChat?: (msg: string, sender: string) => void;
  private onAudio?: (audioBlob: Blob) => void;
  private onPlayerJoined?: (player: Player) => void;

  initialize(playerId: string, onIdAssigned: (id: string) => void) {
    if (this.peer) {
      this.destroy();
    }

    this.peer = new Peer(playerId);

    this.peer.on('open', (id) => {
      console.log('Peer ID assigned:', id);
      onIdAssigned(id);
    });

    this.peer.on('connection', (conn) => {
      console.log('Connection attempt from:', conn.peer);
      if (this.isHost) {
        this.handleNewConnection(conn);
      } else {
        console.warn('Declining connection: Not a host.');
        conn.close();
      }
    });

    this.peer.on('error', (err) => {
      console.error('PeerJS error:', err);
    });
  }

  destroy() {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
      this.connections.clear();
      console.log('Peer destroyed.');
    }
  }

  createRoom() {
    this.isHost = true;
  }

  joinRoom(hostId: string, playerInfo: Player) {
    this.isHost = false;
    if (!this.peer) {
      console.error('Peer not initialized');
      return;
    }

    console.log('Attempting to join host:', hostId);
    const conn = this.peer.connect(hostId, {
      metadata: { playerInfo },
      serialization: 'json'
    });

    this.setupConnection(conn);
  }

  private handleNewConnection(conn: DataConnection) {
    const playerInfo = conn.metadata?.playerInfo as Player;
    if (playerInfo) {
      this.connections.set(playerInfo.id, conn);
      this.onPlayerJoined?.(playerInfo);
      this.setupConnection(conn);
    }
  }

  private setupConnection(conn: DataConnection) {
    conn.on('open', () => {
      console.log('Connection established with:', conn.peer);
    });

    conn.on('data', (data: any) => {
      const { type, payload } = data;
      switch (type) {
        case MultiplayerEvent.STATE_UPDATE:
          this.onStateUpdate?.(payload);
          break;
        case MultiplayerEvent.ACTION:
          this.onAction?.(payload);
          break;
        case MultiplayerEvent.EMOTE:
          this.onEmote?.(payload);
          break;
        case MultiplayerEvent.LOG:
          this.onLog?.(payload);
          break;
        case MultiplayerEvent.CHAT:
          this.onChat?.(payload.msg, payload.sender);
          break;
        case MultiplayerEvent.AUDIO:
          this.onAudio?.(payload);
          break;
      }
    });

    conn.on('close', () => {
      console.log('Connection closed:', conn.peer);
      // Logic to handle player disconnection could be added here
    });
  }

  broadcastState(state: GameState) {
    if (!this.isHost) return;
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send({ type: MultiplayerEvent.STATE_UPDATE, payload: state });
      }
    });
  }

  sendAction(action: MultiplayerAction) {
    if (this.isHost) {
      this.onAction?.(action); // Host handles its own action
    } else {
      // Send to host (the only connection for a client)
      const hostConn = Array.from(this.connections.values())[0];
      if (hostConn?.open) {
        hostConn.send({ type: MultiplayerEvent.ACTION, payload: action });
      }
    }
  }

  broadcastEmote(emoji: string) {
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send({ type: MultiplayerEvent.EMOTE, payload: emoji });
      }
    });
  }

  broadcastLog(msg: string) {
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send({ type: MultiplayerEvent.LOG, payload: msg });
      }
    });
  }

  broadcastChat(msg: string, sender: string) {
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send({ type: MultiplayerEvent.CHAT, payload: { msg, sender } });
      }
    });
  }

  broadcastAudio(audioBlob: Blob) {
    this.connections.forEach(conn => {
      if (conn.open) {
        conn.send({ type: MultiplayerEvent.AUDIO, payload: audioBlob });
      }
    });
  }

  sendAudio(audioBlob: Blob) {
    if (this.isHost) {
      this.onAudio?.(audioBlob);
    } else {
      const hostConn = Array.from(this.connections.values())[0];
      if (hostConn?.open) {
        hostConn.send({ type: MultiplayerEvent.AUDIO, payload: audioBlob });
      }
    }
  }

  // Callbacks
  setCallbacks(callbacks: {
    onStateUpdate?: (state: GameState) => void;
    onAction?: (action: MultiplayerAction) => void;
    onEmote?: (emoji: string) => void;
    onLog?: (msg: string) => void;
    onChat?: (msg: string, sender: string) => void;
    onAudio?: (audioBlob: Blob) => void;
    onPlayerJoined?: (player: Player) => void;
  }) {
    this.onStateUpdate = callbacks.onStateUpdate;
    this.onAction = callbacks.onAction;
    this.onEmote = callbacks.onEmote;
    this.onLog = callbacks.onLog;
    this.onChat = callbacks.onChat;
    this.onAudio = callbacks.onAudio;
    this.onPlayerJoined = callbacks.onPlayerJoined;
  }
}

export const multiplayerService = new MultiplayerService();
