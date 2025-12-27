
import { GoogleGenAI, Type } from "@google/genai";
import { Difficulty, CardType, Card } from "../types";

// Use both Vite-style and process-style access for maximum compatibility
const getApiKey = () => {
  try {
    const meta = import.meta as any;
    return meta.env?.VITE_GEMINI_API_KEY || (typeof process !== 'undefined' ? (process.env.VITE_GEMINI_API_KEY || process.env.API_KEY || process.env.GEMINI_API_KEY) : '');
  } catch (e) {
    return '';
  }
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

export const generateDynamicCard = async (difficulty: Difficulty): Promise<Card> => {
  const prompt = `Gere uma carta de jogo para um 'Sincerão' (party game social). 
  A dificuldade deve ser ${difficulty}. 
  O tom deve ser instigante, focado em relações sociais e opiniões sobre amigos no grupo.
  Retorne um JSON com os campos: type (escolha entre DIRETA, COMPARACAO, JUSTIFICATIVA, ANONIMA, CAOS), text (a pergunta em si), instruction (como o jogador deve agir).`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: {
              type: Type.STRING,
              description: 'O tipo da carta: DIRETA, COMPARACAO, JUSTIFICATIVA, ANONIMA ou CAOS'
            },
            text: {
              type: Type.STRING,
              description: 'A pergunta ou desafio da carta'
            },
            instruction: {
              type: Type.STRING,
              description: 'Instrução de como o jogador deve proceder'
            },
          },
          required: ["type", "text", "instruction"],
        },
      },
    });

    // Extract text directly from response property as per guidelines
    const data = JSON.parse(response.text || '{}');

    // Map string response from Gemini to CardType enum values
    const typeMap: Record<string, CardType> = {
      'DIRETA': CardType.DIRETA,
      'COMPARACAO': CardType.COMPARACAO,
      'JUSTIFICATIVA': CardType.JUSTIFICATIVA,
      'ANONIMA': CardType.ANONIMA,
      'CAOS': CardType.CAOS
    };

    return {
      id: Math.random().toString(36).substr(2, 9),
      type: typeMap[data.type] || CardType.DIRETA,
      text: data.text,
      difficulty,
      instruction: data.instruction,
    };
  } catch (error) {
    console.error("Error generating card:", error);
    // Fallback card
    return {
      id: 'error-fallback',
      type: CardType.DIRETA,
      text: "Se o sistema falhar, quem aqui você culparia primeiro?",
      difficulty: Difficulty.LEVE,
      instruction: "Aponte o culpado."
    };
  }
};
