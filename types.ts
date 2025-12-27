
export enum Difficulty {
  LEVE = 'Leve',
  MEDIO = 'Médio',
  PESADO = 'Pesado'
}

export enum CardType {
  DIRETA = 'Direta',
  ANONIMA = 'Anônima',
  COMPARACAO = 'Comparação',
  JUSTIFICATIVA = 'Justificativa',
  CAOS = 'Caos'
}

export enum GamePhase {
  LOBBY = 'LOBBY',
  SETUP = 'SETUP',
  ROUND_START = 'ROUND_START',
  PICKING_TARGET = 'PICKING_TARGET',
  RESPONDING = 'RESPONDING',
  VOTING = 'VOTING',
  RESULT = 'RESULT',
  GAME_OVER = 'GAME_OVER'
}

export enum PowerType {
  APONTAR_DUPLO = 'Apontar Duplo',
  ESCUDO = 'Escudo',
  TROCA = 'Troca',
  SILENCIAR = 'Silenciar',
  VOTO_DUPLO = 'Voto Duplo'
}

export interface Player {
  id: string;
  name: string;
  avatar: string;
  score: number;
  powerUsed: boolean;
  power: PowerType;
  isHost: boolean;
  isBot?: boolean;
  isSilenced?: boolean;
  isShielded?: boolean;
}

export interface Card {
  id: string;
  type: CardType;
  text: string;
  difficulty: Difficulty;
  instruction: string;
}

export interface GameState {
  roomCode: string;
  phase: GamePhase;
  players: Player[];
  currentPlayerId: string; // The "Apontador"
  targetPlayerId: string | null; // The one being accused/asked
  currentCard: Card | null;
  roundNumber: number;
  maxRounds: number;
  votes: Record<string, 'APOIO' | 'DISCORDO' | 'NEUTRO'>;
  difficulty: Difficulty;
  isBotEnabled: boolean;
  logs: string[];
}
