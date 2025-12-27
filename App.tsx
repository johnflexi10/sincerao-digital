
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  GameState,
  GamePhase,
  Player,
  Difficulty,
  PowerType,
  CardType,
  Card
} from './types';
import { AVATARS, POWER_DESCRIPTIONS } from './constants';
import { generateDynamicCard } from './services/geminiService';
import { PlayerAvatar } from './components/PlayerAvatar';
import { multiplayerService, MultiplayerEvent, MultiplayerAction } from './services/multiplayerService';

const BOT_NAMES = ["Sincero-Bot", "IA-Polemica", "Justo-GPT", "FogoNoParquinho", "Calada-Vence"];
const EMOTES = ['🔥', '🐍', '🤡', '😱', '👏', '💔', '🤫'];

const BIG_BOSS_MESSAGES = {
  ROUND_START: [
    "O PARQUINHO VAI QUEIMAR AGORA!",
    "NOVA RODADA, NOVAS TRAIÇÕES...",
    "QUEM VAI TER CORAGEM DE FALAR A REAL?",
    "A CASA ESTÁ PRESTES A DIVIDIR OPINIÕES."
  ],
  PICKED: [
    "ALVO LOCALIZADO! SEM SAÍDA AGORA.",
    "ESSA DOEU ATÉ EM MIM!",
    "DIRETO NO PONTO FRACO!",
    "A MIRA FOI CERTEIRA!"
  ],
  VOTING: [
    "O POVO ESTÁ DECIDINDO... TENSÃO TOTAL.",
    "VAI COMPRAR A BRIGA OU VAI FICAR NO MURO?",
    "A CASA NÃO PERDOA QUEM PIPOCO.",
    "O JULGAMENTO COMEÇOU!"
  ],
  RESULT: [
    "O VEREDITO FOI DADO. A CASA FALOU!",
    "NÃO ADIANTA RECLAMAR COM A PRODUÇÃO!",
    "O PÚBLICO JÁ TEM UM FAVORITO.",
    "A VERDADE DÓI, NÃO É MESMO?"
  ],
  POWER: [
    "UMA JOGADA DE MESTRE!",
    "PODER ATIVADO! O JOGO MUDOU.",
    "ESTRATÉGIA PURA NA CASA!",
    "ALGUÉM NÃO ESTÁ PARA BRINCADEIRA."
  ]
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

interface FloatingEmote {
  id: number;
  emoji: string;
  left: number;
}

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>({
    roomCode: '',
    phase: GamePhase.LOBBY,
    players: [],
    currentPlayerId: '',
    targetPlayerId: null,
    currentCard: null,
    roundNumber: 0,
    maxRounds: 5,
    votes: {},
    difficulty: Difficulty.LEVE,
    isBotEnabled: true,
    logs: []
  });

  const [localPlayerId, setLocalPlayerId] = useState<string>('player-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5));
  const [inputName, setInputName] = useState('');
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState(AVATARS[0]);
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [floatingEmotes, setFloatingEmotes] = useState<FloatingEmote[]>([]);
  const [isHost, setIsHost] = useState(false);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordDuration, setRecordDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  // Chat & SFX
  const [chatMessages, setChatMessages] = useState<{ id: number; text: string; sender: string }[]>([]);
  const [chatInput, setChatInput] = useState('');

  const playSFX = (type: 'buzzer' | 'success' | 'alert' | 'pop') => {
    const sfxMap = {
      buzzer: 'https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3',
      success: 'https://assets.mixkit.co/active_storage/sfx/2013/2013-preview.mp3',
      alert: 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3',
      pop: 'https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3'
    };
    const audio = new Audio(sfxMap[type]);
    audio.volume = 0.4;
    audio.play().catch(() => { });
  };

  const stateRef = useRef(gameState);
  useEffect(() => {
    stateRef.current = gameState;
    if (isHost && gameState.roomCode) {
      multiplayerService.broadcastState(gameState);
    }
  }, [gameState, isHost]);

  // INITIALIZE MULTIPLAYER BASICALLY (Random ID for now, re-init if Host)
  useEffect(() => {
    multiplayerService.initialize(localPlayerId, (id) => {
      console.log("Peer ready with ID:", id);
    });

    multiplayerService.setCallbacks({
      onStateUpdate: (newState) => {
        if (!isHost) setGameState(newState);
      },
      onAction: (action) => handleRemoteAction(action),
      onEmote: (emoji) => sendEmote(emoji),
      onChat: (msg: string, sender: string) => {
        const id = Date.now();
        setChatMessages(prev => [...prev.slice(-4), { id, text: msg, sender }]);
        setTimeout(() => setChatMessages(prev => prev.filter(m => m.id !== id)), 4000);
      },
      onLog: (msg) => {
        addLog(msg);
        if (msg.includes('ENTROU')) playSFX('pop');
      },
      onAudio: (blob) => {
        if (isHost) {
          multiplayerService.broadcastAudio(blob);
        }
        setAudioUrl(URL.createObjectURL(blob));
        addLog("ÁUDIO RECEBIDO DO CONFESSIONÁRIO");
      },
      onPlayerJoined: (player) => {
        if (isHost) {
          addLog(`${player.name} ENTROU NA CASA!`);
          setGameState(prev => {
            const newState = {
              ...prev,
              players: [...prev.players, player]
            };
            // Broadcast state immediately to the new player
            setTimeout(() => multiplayerService.broadcastState(newState), 500);
            return newState;
          });
        }
      }
    });

    return () => multiplayerService.destroy();
  }, [localPlayerId, isHost]);

  const handleRemoteAction = (action: MultiplayerAction) => {
    const { type, payload } = action;
    switch (type) {
      case 'VOTE':
        castVote(payload.voterId, payload.vote);
        break;
      case 'PICK_TARGET':
        handlePickTarget(payload.targetId);
        break;
      case 'SUBMIT_RESPONSE':
        submitResponse();
        break;
      case 'EMOTE':
        multiplayerService.broadcastEmote(payload.emoji);
        sendEmote(payload.emoji);
        break;
      case 'POWER':
        usePowerRemote(payload.playerId, payload.type);
        if (payload.type === PowerType.TROCA && isHost) {
          handlePowerTroca(payload.playerId);
        }
        playSFX('alert');
        break;
      case 'CHAT':
        const id = Date.now();
        setChatMessages(prev => [...prev.slice(-4), { id, text: payload.msg, sender: payload.sender }]);
        setTimeout(() => setChatMessages(prev => prev.filter(m => m.id !== id)), 4000);
        playSFX('pop');
        break;
    }
  };

  // BIG BOSS LOG SYSTEM
  const addLog = (msg: string) => {
    setGameState(prev => ({ ...prev, logs: [msg.toUpperCase(), ...prev.logs].slice(0, 5) }));
  };

  const sendChat = (text: string) => {
    if (!text.trim()) return;
    const player = gameState.players.find(p => p.id === localPlayerId);
    const sender = player?.name || 'ANÔNIMO';

    if (isHost) {
      const id = Date.now();
      setChatMessages(prev => [...prev.slice(-4), { id, text, sender }]);
      setTimeout(() => setChatMessages(prev => prev.filter(m => m.id !== id)), 4000);
      multiplayerService.broadcastChat(text, sender);
    } else {
      multiplayerService.sendAction({ type: 'CHAT' as any, payload: { msg: text, sender }, senderId: localPlayerId });
    }
    setChatInput('');
    playSFX('pop');
  };

  const triggerBigBossComment = (category: keyof typeof BIG_BOSS_MESSAGES) => {
    const messages = BIG_BOSS_MESSAGES[category];
    const randomMsg = messages[Math.floor(Math.random() * messages.length)];
    addLog(randomMsg);
  };

  // EMOTE SYSTEM
  const sendEmote = (emoji: string) => {
    const newEmote = {
      id: Date.now(),
      emoji,
      left: Math.random() * 80 + 10
    };
    setFloatingEmotes(prev => [...prev, newEmote]);

    // Broadcast if host, send action if client
    if (isHost) {
      multiplayerService.broadcastEmote(emoji);
    } else {
      multiplayerService.sendAction({ type: 'EMOTE', payload: { emoji }, senderId: localPlayerId });
    }

    setTimeout(() => {
      setFloatingEmotes(prev => prev.filter(e => e.id !== newEmote.id));
    }, 2000);
  };

  // ROOM SHARING & SOCIAL
  const copyRoomCode = () => {
    if (gameState.roomCode) {
      navigator.clipboard.writeText(gameState.roomCode);
      addLog("CÓDIGO COPIADO!");
    }
  };

  const shareToWhatsApp = () => {
    if (gameState.roomCode) {
      const text = `Bora jogar Sincerão? A casa tá pegando fogo! 🏠🔥\n\nSala: ${gameState.roomCode}\nLink: ${window.location.href}`;
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      addLog("CONVITE ENVIADO AO ZAP!");
    }
  };

  // ACTIONS
  const createRoom = () => {
    // 5-digit numeric PIN for easier cross-network entry
    const code = Math.floor(10000 + Math.random() * 90000).toString();
    const host: Player = {
      id: localPlayerId,
      name: inputName || 'ANÔNIMO',
      avatar: selectedAvatar,
      score: 0,
      powerUsed: false,
      power: PowerType.APONTAR_DUPLO,
      isHost: true,
      isBot: false
    };

    setIsHost(true);
    // CRITICAL: Re-initialize as host with the room code as Peer ID
    multiplayerService.initialize(code, (id) => {
      console.log("Host Peer ready with Room Code:", id);
      multiplayerService.createRoom();
      setGameState(prev => ({
        ...prev,
        roomCode: code,
        players: [host],
        currentPlayerId: localPlayerId
      }));
      addLog("CÓDIGO DA SALA: " + code);
      setIsAvatarPickerOpen(false); // Close if open
    });
    addLog("ESTABELECENDO SINAL...");
  };

  const joinRoom = () => {
    if (!inputRoomCode) return;
    const player: Player = {
      id: localPlayerId,
      name: inputName || 'ANÔNIMO',
      avatar: selectedAvatar,
      score: 0,
      powerUsed: false,
      power: PowerType.VOTO_DUPLO,
      isHost: false,
      isBot: false
    };

    setIsHost(false);
    multiplayerService.joinRoom(inputRoomCode, player);
    setGameState(prev => ({ ...prev, roomCode: inputRoomCode }));
    addLog("CONECTANDO À SALA...");
  };

  const leaveRoom = () => {
    const confirmed = window.confirm("🚪 Deseja realmente sair da casa? Sua jornada no Sincerão será interrompida.");
    if (confirmed) {
      setGameState({
        roomCode: '',
        phase: GamePhase.LOBBY,
        players: [],
        currentPlayerId: '',
        targetPlayerId: null,
        currentCard: null,
        roundNumber: 0,
        maxRounds: 5,
        votes: {},
        difficulty: Difficulty.LEVE,
        isBotEnabled: true,
        logs: ["VOCÊ SAIU DA PARTIDA."]
      });
      setLocalPlayerId('');
      setAudioUrl(null);
      setRecordDuration(0);
    }
  };

  const updateAvatar = (newAvatar: string) => {
    setSelectedAvatar(newAvatar);
    if (gameState.roomCode) {
      setGameState(prev => ({
        ...prev,
        players: prev.players.map(p => p.id === localPlayerId ? { ...p, avatar: newAvatar } : p)
      }));
      addLog("CARA NOVA, ESTRATÉGIA NOVA?");
    }
    setIsAvatarPickerOpen(false);
  };

  const addBot = () => {
    if (gameState.players.length >= 7) return;
    const botId = 'bot-' + Math.random().toString(36).substr(2, 5);
    const powers = Object.values(PowerType);
    const newBot: Player = {
      id: botId,
      name: BOT_NAMES[gameState.players.length % BOT_NAMES.length],
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
      score: 0,
      powerUsed: false,
      power: powers[Math.floor(Math.random() * powers.length)],
      isHost: false,
      isBot: true
    };
    setGameState(prev => ({ ...prev, players: [...prev.players, newBot] }));
    addLog(`${newBot.name} ENTROU NO JOGO!`);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        setAudioUrl(URL.createObjectURL(audioBlob));
        stream.getTracks().forEach(track => track.stop());
      };
      mediaRecorder.start();
      setIsRecording(true);
      setRecordDuration(0);
      setAudioUrl(null);
      timerIntervalRef.current = window.setInterval(() => setRecordDuration(prev => prev + 1), 1000);
      addLog("GRAVANDO NO CONFESSIONÁRIO...");
    } catch (err) {
      alert("Acesso ao microfone negado!");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      addLog("ÁUDIO PRONTO PARA ENVIO!");
    }
  };

  const discardAudio = () => {
    setAudioUrl(null);
    setRecordDuration(0);
    addLog("ÁUDIO DESCARTADO.");
  };

  const usePower = () => {
    const player = gameState.players.find(p => p.id === localPlayerId);
    if (!player || player.powerUsed) return;

    if (player.power === PowerType.TROCA && gameState.targetPlayerId === localPlayerId) {
      if (isHost) {
        handlePowerTroca(localPlayerId);
      } else {
        multiplayerService.sendAction({ type: 'POWER', payload: { playerId: localPlayerId, type: PowerType.TROCA }, senderId: localPlayerId });
      }
    } else {
      if (isHost) {
        usePowerRemote(localPlayerId, player.power);
      } else {
        multiplayerService.sendAction({ type: 'POWER', payload: { playerId: localPlayerId, type: player.power }, senderId: localPlayerId });
      }
    }
  };

  const handlePowerTroca = async (playerId: string) => {
    addLog("TROCOU A PERGUNTA!");
    const newCard = await generateDynamicCard(gameState.difficulty);
    setGameState(prev => ({
      ...prev,
      currentCard: newCard,
      players: prev.players.map(p => p.id === playerId ? { ...p, powerUsed: true } : p)
    }));
    triggerBigBossComment('POWER');
  };

  const usePowerRemote = (playerId: string, type: PowerType) => {
    triggerBigBossComment('POWER');
    setGameState(prev => {
      return {
        ...prev,
        players: prev.players.map(p => {
          if (p.id === playerId) {
            let scoreUpdate = 10;
            let shielded = p.isShielded;
            if (type === PowerType.ESCUDO) shielded = true;
            return { ...p, powerUsed: true, score: p.score + scoreUpdate, isShielded: shielded };
          }

          if (type === PowerType.SILENCIAR && p.id === prev.targetPlayerId) {
            return { ...p, isSilenced: true };
          }

          return p;
        })
      };
    });
  };

  const startGame = async () => {
    if (gameState.players.length < 2) {
      alert("A casa precisa de pelo menos 2 pessoas!");
      return;
    }
    setGameState(prev => ({ ...prev, phase: GamePhase.SETUP }));
    await nextRound();
  };

  const nextRound = async () => {
    if (gameState.roundNumber >= gameState.maxRounds) {
      setGameState(prev => ({ ...prev, phase: GamePhase.GAME_OVER }));
      addLog("FIM DE JOGO! QUEM É O CAMPEÃO?");
      return;
    }
    const nextPlayerIndex = (gameState.roundNumber) % gameState.players.length;
    const pointingPlayer = gameState.players[nextPlayerIndex];
    setGameState(prev => ({
      ...prev,
      phase: GamePhase.ROUND_START,
      currentPlayerId: pointingPlayer.id,
      targetPlayerId: null,
      votes: {},
      roundNumber: prev.roundNumber + 1,
      players: prev.players.map(p => ({ ...p, isSilenced: false, isShielded: false }))
    }));
    playSFX('buzzer');
    setAudioUrl(null);
    setRecordDuration(0);
    audioChunksRef.current = [];
    playSFX('success');
    const newCard = await generateDynamicCard(gameState.difficulty);
    setGameState(prev => ({ ...prev, currentCard: newCard }));
    triggerBigBossComment('ROUND_START');
  };

  const handlePickTarget = (targetId: string) => {
    if (isHost) {
      setGameState(prev => ({ ...prev, targetPlayerId: targetId, phase: GamePhase.RESPONDING }));
      triggerBigBossComment('PICKED');
    } else {
      multiplayerService.sendAction({ type: 'PICK_TARGET', payload: { targetId }, senderId: localPlayerId });
    }
  };

  const submitResponse = () => {
    // Extract the blob from chunks and send
    if (audioChunksRef.current.length > 0) {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      multiplayerService.sendAudio(audioBlob);
    }

    if (isHost) {
      setGameState(prev => ({ ...prev, phase: GamePhase.VOTING }));
      triggerBigBossComment('VOTING');
    } else {
      multiplayerService.sendAction({ type: 'SUBMIT_RESPONSE', payload: {}, senderId: localPlayerId });
    }
  };

  const castVote = (voterId: string, vote: 'APOIO' | 'DISCORDO' | 'NEUTRO') => {
    if (isHost) {
      setGameState(prev => ({ ...prev, votes: { ...prev.votes, [voterId]: vote } }));
    } else {
      multiplayerService.sendAction({ type: 'VOTE', payload: { voterId, vote }, senderId: localPlayerId });
    }
  };

  const revealResult = () => {
    setGameState(prev => {
      // Logic for weighted votes
      let weightedApoios = 0;
      let totalWeight = 0;

      Object.entries(prev.votes).forEach(([voterId, vote]) => {
        const voter = prev.players.find(p => p.id === voterId);
        let weight = 1;
        // Apply Double Vote power if used
        if (voter?.powerUsed && voter.power === PowerType.VOTO_DUPLO) {
          weight = 2;
        }

        if (vote === 'APOIO') weightedApoios += weight;
        totalWeight += weight;
      });

      const updatedPlayers = prev.players.map(p => {
        if (p.id === prev.targetPlayerId) {
          const ratio = totalWeight > 0 ? weightedApoios / totalWeight : 0;
          let points = Math.round(ratio * 50);

          // Negative points if ratio < 0.3
          if (ratio < 0.3 && !p.isShielded) {
            points = -20;
            addLog(`${p.name} PERDEU PONTOS PELO CANCELAMENTO!`);
          } else if (ratio < 0.3 && p.isShielded) {
            points = 0;
            addLog(`ESCUDO PROTEGEU ${p.name}!`);
          }

          return { ...p, score: Math.max(0, p.score + points) };
        }
        if (prev.votes[p.id]) {
          return { ...p, score: p.score + 10 };
        }
        return p;
      });

      return {
        ...prev,
        players: updatedPlayers,
        phase: GamePhase.RESULT
      };
    });
    playSFX('alert');
    triggerBigBossComment('RESULT');
  };

  const calculateVotingRatio = () => {
    let weightedApoios = 0;
    let totalWeight = 0;

    Object.entries(gameState.votes).forEach(([voterId, vote]) => {
      const voter = gameState.players.find(p => p.id === voterId);
      let weight = 1;
      if (voter?.powerUsed && voter.power === PowerType.VOTO_DUPLO) {
        weight = 2;
      }

      if (vote === 'APOIO') weightedApoios += weight;
      totalWeight += weight;
    });

    return totalWeight > 0 ? weightedApoios / totalWeight : 0;
  };

  const getPlayerLabel = (player: Player) => {
    if (gameState.phase === GamePhase.ROUND_START) return player.id === gameState.currentPlayerId ? 'APONTADOR' : '';
    if (gameState.phase === GamePhase.RESPONDING) return player.id === gameState.currentPlayerId ? 'APONTADOR' : player.id === gameState.targetPlayerId ? 'ALVO' : '';
    if (gameState.phase === GamePhase.VOTING) {
      if (player.id === gameState.currentPlayerId) return 'APONTADOR';
      if (player.id === gameState.targetPlayerId) return 'ALVO';
      let label = gameState.votes[player.id] ? '✓ VOTOU' : '⏳ VOTANDO';
      if (player.powerUsed && player.power === PowerType.VOTO_DUPLO) label += ' (x2)';
      return label;
    }
    return player.id === gameState.targetPlayerId ? 'ALVO' : '';
  };

  // BOT LOGIC EFFECT
  useEffect(() => {
    if (gameState.phase === GamePhase.LOBBY) return;
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId);
    const targetPlayer = gameState.players.find(p => p.id === gameState.targetPlayerId);
    const timers: number[] = [];

    if (gameState.phase === GamePhase.ROUND_START && currentPlayer?.isBot) {
      timers.push(window.setTimeout(() => {
        const others = gameState.players.filter(p => p.id !== currentPlayer.id);
        handlePickTarget(others[Math.floor(Math.random() * others.length)].id);
      }, 2500));
    }
    if (gameState.phase === GamePhase.RESPONDING && targetPlayer?.isBot) {
      timers.push(window.setTimeout(() => submitResponse(), 4000));
    }
    if (gameState.phase === GamePhase.VOTING) {
      const bots = gameState.players.filter(p => p.isBot && !gameState.votes[p.id] && p.id !== gameState.currentPlayerId && p.id !== gameState.targetPlayerId);
      if (bots.length > 0) {
        timers.push(window.setTimeout(() => castVote(bots[0].id, 'APOIO'), 1000 + Math.random() * 2000));
      }
    }
    return () => timers.forEach(t => window.clearTimeout(t));
  }, [gameState.phase, gameState.currentPlayerId, gameState.targetPlayerId, gameState.votes, gameState.players]);

  const renderPhase = () => {
    const isMeCurrent = gameState.currentPlayerId === localPlayerId;
    const isMeTarget = gameState.targetPlayerId === localPlayerId;
    const currentPlayer = gameState.players.find(p => p.id === gameState.currentPlayerId);
    const targetPlayer = gameState.players.find(p => p.id === gameState.targetPlayerId);

    switch (gameState.phase) {
      case GamePhase.LOBBY:
        return (
          <div className="flex-grow flex flex-col justify-center items-center w-full max-w-sm mx-auto p-6 gap-10">
            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-500 to-cyan-400 animate-neon tracking-tighter italic text-center">SINCERÃO</h1>

            <div className="flex flex-col items-center justify-center w-full gap-5">
              <div className="relative group">
                <div
                  onClick={() => setIsAvatarPickerOpen(true)}
                  className="w-40 h-40 rounded-full glass border-4 border-fuchsia-500/50 flex items-center justify-center text-7xl cursor-pointer hover:scale-105 active:scale-95 transition-all shadow-[0_0_50px_rgba(192,38,211,0.3)] relative"
                >
                  {selectedAvatar}
                  <div className="absolute bottom-2 right-2 bg-fuchsia-600 p-2.5 rounded-full border-2 border-slate-900 text-sm shadow-xl">✨</div>
                </div>
              </div>
              <p className="text-[10px] font-black text-white/40 uppercase tracking-[0.4em] text-center w-full animate-pulse">
                Toque para mudar o visual
              </p>
            </div>

            {isAvatarPickerOpen && (
              <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-2xl p-8 flex flex-col items-center justify-center animate-in fade-in zoom-in-95">
                <h3 className="text-2xl font-black italic uppercase tracking-tighter mb-8 text-fuchsia-400">Escolha seu Personagem</h3>
                <div className="grid grid-cols-5 gap-4 max-w-xs">
                  {AVATARS.map(a => (
                    <button
                      key={a}
                      onClick={() => updateAvatar(a)}
                      className={`text-4xl p-2 rounded-2xl transition-all ${selectedAvatar === a ? 'bg-fuchsia-500/20 border-2 border-fuchsia-500 scale-110' : 'bg-white/5 border border-white/10 hover:bg-white/10'}`}
                    >
                      {a}
                    </button>
                  ))}
                </div>
                <button onClick={() => setIsAvatarPickerOpen(false)} className="mt-10 text-[10px] font-black text-white/30 uppercase tracking-[0.3em] border-b border-white/10 pb-1">Cancelar</button>
              </div>
            )}

            {!gameState.roomCode ? (
              <div className="w-full space-y-8 animate-in fade-in slide-in-from-bottom-4">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-white/40 uppercase tracking-widest block text-center">QUEM É VOCÊ NA CASA?</label>
                  <input
                    type="text"
                    placeholder="Nome do Jogador"
                    value={inputName}
                    onChange={(e) => setInputName(e.target.value.toUpperCase())}
                    className="w-full bg-white/5 border border-white/10 p-6 rounded-[2.5rem] focus:ring-4 focus:ring-fuchsia-500/30 outline-none transition-all placeholder:text-white/10 text-2xl font-black text-center italic tracking-tight"
                  />
                </div>
                <button onClick={createRoom} className="w-full bg-gradient-to-r from-cyan-600 to-cyan-400 text-white font-black py-6 rounded-[2.5rem] transition-all active:scale-95 shadow-2xl shadow-cyan-500/20 uppercase italic text-xl tracking-tight">
                  Criar Sala Nova
                </button>

                <div className="relative pt-4">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                  <div className="relative flex justify-center text-[10px] font-black uppercase tracking-[0.3em]"><span className="bg-slate-950 px-4 text-white/20">OU</span></div>
                </div>

                <div className="flex flex-col gap-4">
                  <input
                    type="text"
                    placeholder="Código (5 números)"
                    value={inputRoomCode}
                    maxLength={5}
                    onChange={(e) => setInputRoomCode(e.target.value.replace(/\D/g, ''))}
                    className="w-full bg-white/5 border border-white/10 p-4 rounded-3xl focus:ring-2 focus:ring-cyan-500/30 outline-none transition-all placeholder:text-white/10 text-xl font-black text-center italic tracking-widest"
                  />
                  <button onClick={joinRoom} className="w-full bg-white/5 border border-white/20 text-white font-black py-5 rounded-[2.5rem] transition-all active:scale-95 uppercase italic text-lg tracking-tight hover:bg-white/10">
                    Entrar na Casa
                  </button>
                </div>
              </div>
            ) : (
              <div className="w-full space-y-6 animate-in fade-in slide-in-from-bottom-4">
                <div className="glass p-6 rounded-3xl text-center space-y-4 border border-white/5 shadow-2xl">
                  <div className="flex flex-col gap-4">
                    <div className="flex items-center justify-center gap-4 bg-white/5 p-5 rounded-2xl border border-white/10">
                      <h2 className="text-4xl font-mono font-black text-cyan-400 tracking-widest">{gameState.roomCode}</h2>
                      <button onClick={copyRoomCode} title="Copiar Código" className="p-3 bg-cyan-500/20 text-cyan-400 rounded-xl active:scale-90 transition-all border border-cyan-500/30">📋</button>
                      {isHost && (
                        <button
                          onClick={() => {
                            multiplayerService.broadcastState(gameState);
                            addLog("ESTADO SINCRONIZADO!");
                          }}
                          title="Forçar Sincronização"
                          className="p-3 bg-fuchsia-500/20 text-fuchsia-400 rounded-xl active:scale-90 transition-all border border-fuchsia-500/30"
                        >
                          🔄
                        </button>
                      )}
                    </div>
                    <button onClick={shareToWhatsApp} className="w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-black py-5 rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 text-sm uppercase italic shadow-lg shadow-green-500/20">Chamar Aliados (Zap)</button>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 py-4 max-h-[250px] overflow-y-auto pr-2">
                  {gameState.players.map(p => (
                    <PlayerAvatar key={p.id} player={p} label={p.id === localPlayerId ? (isHost ? "HOST" : "VOCÊ") : (p.isBot ? "BOT" : "PLAY")} isHighlighted={p.id === localPlayerId} />
                  ))}
                  {gameState.players.length < 7 && (
                    <button onClick={addBot} className="w-16 h-16 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center text-white/40 hover:border-cyan-500 transition-all bg-white/5">
                      <span className="text-2xl">+</span>
                    </button>
                  )}
                </div>

                <button onClick={startGame} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black py-6 rounded-3xl shadow-[0_0_40px_rgba(192,38,211,0.5)] transition-all active:scale-95 text-2xl italic uppercase tracking-tighter">
                  Tocar o Terror
                </button>
              </div>
            )}
          </div>
        );

      case GamePhase.ROUND_START:
        return (
          <div className="flex flex-col gap-6 p-6 items-center">
            <div className="w-full flex justify-between items-center text-[10px] font-black tracking-widest text-white/30">
              <span className="bg-white/5 px-2 py-1 rounded uppercase">Rodada {gameState.roundNumber}</span>
              <span className="text-fuchsia-400">{gameState.difficulty}</span>
            </div>
            <div className="w-full glass p-8 rounded-[40px] border border-white/10 min-h-[220px] flex flex-col items-center justify-center text-center gap-5 relative overflow-hidden group shadow-2xl">
              <div className="text-fuchsia-400 font-black uppercase tracking-[0.3em] text-[10px] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-fuchsia-500 animate-ping"></span>
                NA BOCA DO POVO
              </div>
              <h2 className="text-3xl font-black leading-none text-white tracking-tighter italic drop-shadow-lg">
                {gameState.currentCard?.text || 'Embaralhando...'}
              </h2>
              <p className="text-white/30 text-[10px] font-bold uppercase tracking-widest italic">{gameState.currentCard?.instruction}</p>
            </div>
            <div className="flex flex-col items-center gap-6 mt-4 w-full">
              <PlayerAvatar player={currentPlayer!} isHighlighted size="lg" label="APONTADOR" />
              <div className="text-center">
                <p className="text-2xl font-black italic tracking-tighter">{isMeCurrent ? 'VOCÊ DECIDE!' : `${currentPlayer?.name} APONTA`}</p>
                <p className="text-[10px] text-white/40 uppercase tracking-[0.3em] font-bold">{isMeCurrent ? 'Escolha um alvo na casa' : 'Quem será o alvo?'}</p>
              </div>
            </div>
            {isMeCurrent && (
              <div className="grid grid-cols-3 gap-4 w-full pt-6 border-t border-white/5 overflow-y-auto max-h-[200px]">
                {gameState.players.filter(p => p.id !== localPlayerId).map(p => (
                  <PlayerAvatar key={p.id} player={p} onClick={() => handlePickTarget(p.id)} />
                ))}
              </div>
            )}
          </div>
        );

      case GamePhase.RESPONDING:
        return (
          <div className="flex flex-col gap-8 p-6 items-center h-full">
            <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
              {floatingEmotes.map(e => <div key={e.id} className="absolute bottom-40 text-4xl animate-float-up" style={{ left: `${e.left}%` }}>{e.emoji}</div>)}
            </div>
            <div className="w-full glass p-5 rounded-3xl border-l-8 border-cyan-500 shadow-2xl relative overflow-hidden">
              <p className="text-2xl font-black italic tracking-tighter leading-tight">"{gameState.currentCard?.text}"</p>
            </div>

            <div className="flex items-center justify-around w-full relative">
              <PlayerAvatar player={currentPlayer!} size="md" label="APONTADOR" />
              <div className="z-10 bg-slate-900 px-4 py-1.5 border border-white/10 rounded-full text-[10px] font-black text-cyan-400 uppercase tracking-widest shadow-lg">Versus</div>
              <PlayerAvatar player={targetPlayer!} isHighlighted size="lg" label="ALVO" />
            </div>

            <div className="w-full glass p-8 rounded-[40px] flex flex-col items-center gap-6 relative border border-white/5 shadow-2xl">
              {isMeTarget ? (
                <div className="w-full flex flex-col items-center gap-6">
                  <div className="text-center">
                    <p className="text-fuchsia-400 font-black uppercase tracking-[0.2em] text-[10px] mb-2">Momento da Verdade</p>
                    <h3 className="text-xl font-black italic tracking-tighter uppercase">No Confessionário</h3>
                  </div>

                  <div className="relative flex flex-col items-center gap-4">
                    {targetPlayer?.isSilenced ? (
                      <div className="w-28 h-28 rounded-full flex items-center justify-center border-4 border-white/10 bg-slate-900 shadow-inner">
                        <span className="text-5xl">🔇</span>
                      </div>
                    ) : (
                      <div className={`w-28 h-28 rounded-full flex items-center justify-center border-4 transition-all duration-300 relative ${isRecording ? 'border-red-600 bg-red-600/20 shadow-[0_0_40px_rgba(220,38,38,0.6)] animate-pulse' : 'border-white/20 bg-white/5'}`}>
                        {!audioUrl ? (
                          <button
                            onClick={isRecording ? stopRecording : startRecording}
                            className={`text-5xl transition-transform active:scale-90 ${isRecording ? 'text-red-500' : 'text-white'}`}
                          >
                            {isRecording ? '⏹️' : '🎤'}
                          </button>
                        ) : (
                          <span className="text-5xl">✅</span>
                        )}
                        {isRecording && (
                          <div className="absolute -inset-2 border-2 border-red-500 rounded-full animate-ping opacity-20"></div>
                        )}
                      </div>
                    )}

                    <span className={`text-4xl font-mono font-black tracking-widest ${isRecording ? 'text-red-500' : 'text-white/20'}`}>
                      {formatDuration(recordDuration)}
                    </span>
                  </div>

                  {targetPlayer?.isSilenced && (
                    <p className="text-red-400 font-black text-xs uppercase tracking-widest animate-pulse">Você foi silenciado!</p>
                  )}

                  {audioUrl && !isRecording && (
                    <div className="w-full flex flex-col items-center gap-4 animate-in slide-in-from-bottom-2">
                      <div className="w-full bg-white/5 p-4 rounded-2xl border border-white/10 flex flex-col gap-2">
                        <audio src={audioUrl} controls className="w-full h-10 filter invert brightness-200" />
                        <button onClick={discardAudio} className="text-[10px] font-black text-red-500 uppercase tracking-widest text-center mt-1">🗑️ Descartar e Gravar de Novo</button>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={submitResponse}
                    disabled={isRecording || (!audioUrl && !targetPlayer?.isSilenced)}
                    className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 text-white font-black py-5 rounded-2xl shadow-xl transition-all active:scale-95 text-xl uppercase italic disabled:opacity-20 disabled:grayscale"
                  >
                    {targetPlayer?.isSilenced ? 'AVANÇAR (SILENCIADO)' : audioUrl ? 'ENVIAR PARA A CASA' : 'GRAVE SUA RESPOSTA'}
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-6 py-8 w-full">
                  <div className="flex gap-4">
                    <div className="w-4 h-4 bg-cyan-500 rounded-full animate-bounce"></div>
                    <div className="w-4 h-4 bg-cyan-500 rounded-full animate-bounce [animation-delay:-.15s]"></div>
                    <div className="w-4 h-4 bg-cyan-500 rounded-full animate-bounce [animation-delay:-.3s]"></div>
                  </div>
                  <p className="text-white/30 text-center text-[10px] font-black uppercase tracking-[0.3em] italic">O Alvo está justificando...</p>

                  {audioUrl && (
                    <div className="w-full animate-in slide-in-from-bottom-2 px-4">
                      <div className="w-full bg-cyan-500/10 p-4 rounded-2xl border border-cyan-500/30 flex flex-col gap-2">
                        <audio src={audioUrl} controls autoPlay className="w-full h-10 filter invert brightness-200" />
                        <p className="text-[8px] font-black text-cyan-400 uppercase tracking-widest text-center">Ouça a Verdade</p>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 flex-wrap justify-center border-t border-white/5 pt-6 w-full">
                    {EMOTES.map(e => <button key={e} onClick={() => sendEmote(e)} className="text-2xl p-3 bg-white/5 rounded-2xl hover:bg-white/10 transition-all">{e}</button>)}
                  </div>
                </div>
              )}
            </div>
          </div>
        );

      case GamePhase.VOTING:
        return (
          <div className="flex flex-col gap-6 p-6 items-center">
            <h2 className="text-4xl font-black italic uppercase text-transparent bg-clip-text bg-gradient-to-r from-fuchsia-400 to-cyan-400 tracking-tighter">Veredito Popular</h2>
            <div className="w-full grid grid-cols-4 gap-3 py-4 border-b border-white/5">
              {gameState.players.map(p => <PlayerAvatar key={p.id} player={p} size="sm" isHighlighted={gameState.votes[p.id] !== undefined} label={getPlayerLabel(p)} />)}
            </div>
            <div className="w-full space-y-4 pt-4">
              {['APOIO', 'DISCORDO', 'NEUTRO'].map(v => (
                <button
                  key={v}
                  disabled={isMeCurrent || isMeTarget}
                  onClick={() => castVote(localPlayerId, v as any)}
                  className={`w-full py-6 rounded-3xl border-2 transition-all flex items-center justify-between px-6 ${gameState.votes[localPlayerId] === v ? 'bg-white/10 border-cyan-500 shadow-xl' : 'bg-white/5 border-white/10 opacity-60'}`}
                >
                  <span className="text-3xl">{v === 'APOIO' ? '✅' : v === 'DISCORDO' ? '❌' : '🧼'}</span>
                  <div className="flex flex-col items-end">
                    <span className="font-black text-2xl tracking-tighter uppercase italic">{v === 'APOIO' ? 'Acreditei' : v === 'DISCORDO' ? 'Pipocou' : 'No Muro'}</span>
                    {localPlayerId && gameState.players.find(p => p.id === localPlayerId)?.powerUsed && gameState.players.find(p => p.id === localPlayerId)?.power === PowerType.VOTO_DUPLO && (
                      <span className="text-[8px] font-black text-cyan-400 uppercase tracking-widest mt-[-4px]">Poder x2 Ativo</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            {gameState.players.find(p => p.id === localPlayerId)?.isHost && (
              <button onClick={revealResult} className="mt-8 bg-cyan-600/30 border border-cyan-500/50 px-10 py-4 rounded-full text-xs font-black uppercase tracking-[0.3em] hover:bg-cyan-500 transition-all text-white">Revelar Decisão</button>
            )}
          </div>
        );

      case GamePhase.RESULT:
        const ratio = calculateVotingRatio();
        return (
          <div className="flex flex-col gap-10 p-6 items-center animate-in zoom-in-95">
            <h2 className="text-6xl font-black italic tracking-tighter uppercase text-fuchsia-500">VEREDITO</h2>
            <div className="w-full glass p-8 rounded-[48px] border-t-2 border-fuchsia-500/50 shadow-2xl flex flex-col gap-6 relative">
              <div className="flex justify-between items-center w-full">
                <PlayerAvatar player={targetPlayer!} isHighlighted size="lg" label="ALVO" />
                <div className="flex flex-col items-end">
                  <span className="text-6xl font-black text-fuchsia-500 tracking-tighter">{Math.round(ratio * 100)}%</span>
                  <span className="text-[10px] font-black text-white/40 uppercase tracking-widest">Sincerômetro</span>
                </div>
              </div>
              <div className="h-4 w-full bg-white/5 rounded-full overflow-hidden border border-white/10">
                <div className={`h-full transition-all duration-1000 ${ratio >= 0.5 ? 'bg-green-500' : 'bg-red-500'}`} style={{ width: `${ratio * 100}%` }} />
              </div>
              <p className="text-center text-2xl font-black italic tracking-tighter leading-none mt-4">{ratio >= 0.5 ? 'A CASA COMPROU A TUA!' : 'O GRUPO TE CANCELOU!'}</p>
            </div>
            {gameState.players.find(p => p.id === localPlayerId)?.isHost && (
              <button onClick={nextRound} className="w-full bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black py-6 rounded-3xl shadow-2xl transition-all text-2xl italic uppercase tracking-tighter">Próximo Alvo</button>
            )}
          </div>
        );

      case GamePhase.GAME_OVER:
        const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
        return (
          <div className="flex flex-col gap-8 p-6 items-center">
            <h1 className="text-5xl font-black italic text-transparent bg-clip-text bg-gradient-to-b from-yellow-400 to-orange-600 uppercase tracking-tighter">Pódio Final</h1>
            <div className="w-full space-y-4 pt-4">
              {sorted.map((p, i) => (
                <div key={p.id} className={`flex items-center gap-4 p-6 rounded-[32px] glass border transition-all ${i === 0 ? 'border-yellow-400 bg-yellow-400/10' : 'border-white/5'}`}>
                  <span className={`text-4xl font-black ${i === 0 ? 'text-yellow-400' : i === 1 ? 'text-slate-300' : 'text-orange-400'}`}>{i + 1}º</span>
                  <div className="text-5xl">{p.avatar}</div>
                  <div className="flex-grow">
                    <div className="font-black text-2xl tracking-tight leading-none">{p.name}</div>
                    <div className="text-[9px] font-black text-white/30 uppercase mt-1">{p.score} Pontos</div>
                  </div>
                  {i === 0 && <span className="text-4xl">👑</span>}
                </div>
              ))}
            </div>
            <button onClick={() => window.location.reload()} className="w-full bg-white/10 text-white font-black py-6 rounded-3xl shadow-lg transition-all text-xl italic mt-6 uppercase tracking-widest border border-white/10">Novo Reality</button>
          </div>
        );

      default:
        return <div className="flex h-full items-center justify-center animate-pulse text-white/10 font-black italic uppercase tracking-[1em]">Diretoria...</div>;
    }
  };

  const currentPlayerLocal = gameState.players.find(p => p.id === localPlayerId);

  return (
    <div className="min-h-screen max-w-md mx-auto relative flex flex-col bg-slate-950 overflow-hidden font-['Outfit'] select-none">
      <div className="crt-overlay"></div>

      {/* FLOATING CHAT */}
      <div className="fixed top-32 right-4 z-50 flex flex-col gap-2 items-end pointer-events-none">
        {chatMessages.map(m => (
          <div key={m.id} className="bg-cyan-500/20 border border-cyan-400/50 backdrop-blur-xl px-4 py-2 rounded-2xl animate-in slide-in-from-right fade-in duration-300">
            <span className="text-[8px] font-black text-white/50 block uppercase tracking-widest">{m.sender}</span>
            <p className="text-white text-sm font-bold italic tracking-tight">{m.text}</p>
          </div>
        ))}
      </div>

      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-[-20%] right-[-20%] w-[600px] h-[600px] bg-fuchsia-600/10 blur-[150px] rounded-full"></div>
        <div className="absolute bottom-[-20%] left-[-20%] w-[600px] h-[600px] bg-cyan-600/10 blur-[150px] rounded-full"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[radial-gradient(circle,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:32px_32px]"></div>
      </div>

      {/* IMMERSIVE HEADER WITH BIG BOSS MESSAGES */}
      {gameState.phase !== GamePhase.LOBBY && (
        <div className="absolute top-0 left-0 right-0 z-50 p-4 flex flex-col items-center pointer-events-none gap-2">
          <div className="w-full flex justify-between items-start">
            <button
              onClick={leaveRoom}
              className="glass p-3 rounded-2xl border-white/10 hover:bg-red-500/20 active:scale-90 transition-all pointer-events-auto shadow-lg"
            >
              <span className="text-xl">🚪</span>
            </button>

            <div className="flex items-center gap-2 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-white/10">
              <div className="w-2 h-2 rounded-full bg-red-600 animate-pulse"></div>
              <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">AO VIVO</span>
            </div>
          </div>

          {gameState.logs.length > 0 && (
            <div className="bg-gradient-to-r from-cyan-600/20 to-fuchsia-600/20 border border-white/10 backdrop-blur-3xl py-4 px-8 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] animate-in slide-in-from-top duration-700 max-w-[320px] w-full mt-2">
              <div className="flex flex-col items-center gap-1.5 overflow-hidden">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black text-cyan-400 uppercase tracking-[0.6em] animate-pulse">{isHost ? 'SINAL TRANSMITINDO' : 'SINAL RECEBIDO'}</span>
                </div>
                <h2 className="text-xs font-black text-white italic tracking-tighter uppercase text-center animate-glitch line-clamp-2 leading-tight drop-shadow-md">
                  "{gameState.logs[0]}"
                </h2>
              </div>
            </div>
          )}
        </div>
      )}

      <main className="flex-grow flex flex-col relative z-10 pt-32">
        {renderPhase()}
      </main>

      {/* CHAT INPUT BAR */}
      {gameState.roomCode && (
        <div className="fixed bottom-32 left-0 right-0 max-w-md mx-auto px-6 z-[60] animate-in slide-in-from-bottom-5">
          <div className="glass p-2 rounded-full flex gap-2 border border-white/10 shadow-2xl backdrop-blur-3xl">
            <input
              type="text"
              placeholder="Comentar..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendChat(chatInput)}
              className="flex-1 bg-white/5 border border-white/5 rounded-full px-5 py-2.5 text-sm focus:outline-none placeholder:text-white/20"
            />
            <button onClick={() => sendChat(chatInput)} className="bg-cyan-600 hover:bg-cyan-500 text-white p-2.5 px-6 rounded-full text-xs font-black uppercase transition-all active:scale-90">GO</button>
          </div>
        </div>
      )}

      {gameState.phase !== GamePhase.LOBBY && gameState.phase !== GamePhase.GAME_OVER && (
        <footer className="fixed bottom-0 left-0 right-0 max-w-md mx-auto glass border-t border-white/10 p-8 flex justify-between items-center z-40 rounded-t-[50px] shadow-[0_-30px_100px_rgba(0,0,0,0.8)] backdrop-blur-3xl">
          <div className="flex items-center gap-5">
            <PlayerAvatar player={currentPlayerLocal!} label={getPlayerLabel(currentPlayerLocal!)} size="sm" />
            <div className="flex flex-col">
              <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">Sinceridade</span>
              <span className="text-3xl font-black text-fuchsia-400 tracking-tighter leading-none">{currentPlayerLocal?.score}</span>
            </div>
          </div>
          <button onClick={usePower} disabled={currentPlayerLocal?.powerUsed} className="bg-gradient-to-br from-fuchsia-600 to-purple-800 px-8 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest disabled:opacity-20 transition-all shadow-2xl border border-white/20 text-white">⚡ {currentPlayerLocal?.power.toUpperCase()}</button>
        </footer>
      )}

      <style>{`
        @keyframes float-up { 0% { transform: translateY(0) scale(1); opacity: 1; } 100% { transform: translateY(-300px) scale(1.5); opacity: 0; } }
        .animate-float-up { animation: float-up 2s ease-out forwards; }
        @keyframes glitch { 0% { transform: translate(0); } 20% { transform: translate(-1px, 1px); } 40% { transform: translate(-1px, -1px); } 60% { transform: translate(1px, 1px); } 80% { transform: translate(1px, -1px); } 100% { transform: translate(0); } }
        .animate-glitch { animation: glitch 0.25s cubic-bezier(.25,.46,.45,.94) infinite alternate-reverse; }
      `}</style>
    </div>
  );
};

export default App;
