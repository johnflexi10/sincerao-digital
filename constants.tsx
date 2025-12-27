
import { Difficulty, CardType, PowerType } from './types';

export const AVATARS = [
  '🔥', '💎', '🎭', '🃏', '👑', '🐉', '⚡', '🌈', '🛸', '👻', 
  '🐍', '🤡', '🍄', '🦁', '🦉', '🧊', '🍕', '💣', '🧿', '🧬'
];

export const POWER_DESCRIPTIONS: Record<PowerType, string> = {
  [PowerType.APONTAR_DUPLO]: 'Escolha dois jogadores para responder.',
  [PowerType.ESCUDO]: 'Ignore uma pergunta feita a você.',
  [PowerType.TROCA]: 'Passe a pergunta para o jogador à sua direita.',
  [PowerType.SILENCIAR]: 'Escolha alguém para não votar nesta rodada.',
  [PowerType.VOTO_DUPLO]: 'Seu voto nesta rodada vale por dois.'
};

export const INITIAL_CARDS = [
  {
    id: '1',
    type: CardType.DIRETA,
    text: 'Quem aqui você acha que é a pessoa mais "em cima do muro" do grupo?',
    difficulty: Difficulty.LEVE,
    instruction: 'Aponte diretamente e justifique.'
  },
  {
    id: '2',
    type: CardType.COMPARACAO,
    text: 'Entre {P1} e {P2}, quem é mais provável de trair a confiança em um jogo por 1 milhão?',
    difficulty: Difficulty.MEDIO,
    instruction: 'Compare os dois e escolha um.'
  },
  {
    id: '3',
    type: CardType.CAOS,
    text: 'A pessoa à sua esquerda deve responder à pergunta que VOCÊ inventar agora.',
    difficulty: Difficulty.PESADO,
    instruction: 'Seja criativo e maldoso.'
  }
];
