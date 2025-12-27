
import React from 'react';
import { Player } from '../types';

interface PlayerAvatarProps {
  player: Player;
  isHighlighted?: boolean;
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  onClick?: () => void;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  player,
  isHighlighted = false,
  size = 'md',
  label,
  onClick
}) => {
  const sizeClasses = {
    sm: 'w-10 h-10 text-xl',
    md: 'w-16 h-16 text-3xl',
    lg: 'w-24 h-24 text-5xl'
  };

  return (
    <div
      className={`flex flex-col items-center gap-1 transition-all duration-300 ${onClick ? 'cursor-pointer active:scale-95' : ''}`}
      onClick={onClick}
    >
      <div className={`
        ${sizeClasses[size]} 
        flex items-center justify-center rounded-full glass 
        ${isHighlighted ? 'ring-4 ring-fuchsia-500 scale-110 shadow-[0_0_20px_rgba(192,38,211,0.6)]' : 'ring-2 ring-white/20'}
        relative
      `}>
        {player.avatar}
        {player.isHost && (
          <div className="absolute -top-1 -right-1 text-xs bg-yellow-400 text-slate-900 px-1 rounded-full font-bold shadow-sm">
            HOST
          </div>
        )}
        {player.isShielded && (
          <div className="absolute -bottom-1 -left-1 text-lg animate-pulse" title="Escudo Ativo">
            🛡️
          </div>
        )}
        {player.isSilenced && (
          <div className="absolute inset-0 bg-slate-950/60 rounded-full flex items-center justify-center text-2xl" title="Silenciado">
            🔇
          </div>
        )}
      </div>
      <span className="text-xs font-semibold text-white/80 max-w-[80px] truncate">
        {player.name}
      </span>
      {label && (
        <span className="text-[10px] uppercase font-bold text-fuchsia-400">
          {label}
        </span>
      )}
    </div>
  );
};
