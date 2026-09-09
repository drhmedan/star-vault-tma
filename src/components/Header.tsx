import React from 'react';
import { Sparkles, Volume2, VolumeX, Plus, Crown, Shield } from 'lucide-react';
import { UserProfile } from '../types';
import { sound } from '../audio/soundEngine';

interface HeaderProps {
  user: UserProfile;
  onOpenShop: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

export const Header: React.FC<HeaderProps> = ({ user, onOpenShop, muted, onToggleMute }) => {
  return (
    <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-md border-b border-slate-800/80 px-4 py-3 select-none">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* User Profile Mini Badge */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-primary flex items-center justify-center font-black text-white text-base shadow-lg shadow-amber-500/20 border border-amber-400/40">
              {user.firstName ? user.firstName.charAt(0).toUpperCase() : 'S'}
            </div>
            {user.isVip && (
              <span className="absolute -top-1.5 -right-1.5 bg-amber-400 text-slate-950 p-0.5 rounded-full shadow">
                <Crown size={11} className="fill-slate-950" />
              </span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-slate-100">{user.firstName || 'مغامر السيادة'}</span>
              <span className="badge badge-xs bg-amber-500/20 text-amber-300 font-mono font-bold border border-amber-500/30">
                LVL {user.level}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-mono">@{user.username || 'telegram_user'}</div>
          </div>
        </div>

        {/* Balances & Audio Toggle */}
        <div className="flex items-center gap-2">
          {/* Telegram Stars Balance (Top Currency) */}
          <button 
            className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-500/20 hover:from-amber-500/25 hover:to-amber-500/30 border border-amber-500/40 px-3 py-1.5 rounded-xl shadow-lg transition-all active:scale-95"
            onClick={() => {
              sound.playClick();
              onOpenShop();
            }}
            title="متجر نجوم تيليجرام"
          >
            <span className="text-base animate-bounce">🌟</span>
            <div className="text-right font-mono">
              <span className="text-amber-300 font-black text-sm block leading-none">{user.stars}</span>
              <span className="text-[9px] text-amber-400/80 font-bold block">نجوم</span>
            </div>
            <div className="p-1 rounded-md bg-amber-500 text-slate-950 mr-1 shadow">
              <Plus size={10} strokeWidth={3} />
            </div>
          </button>

          {/* Star Dust (In-Game Gems) */}
          <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 px-2.5 py-1.5 rounded-xl font-mono text-xs">
            <span className="text-cyan-400">💎</span>
            <span className="text-slate-200 font-bold">{user.starDust}</span>
          </div>

          {/* Audio Mute/Unmute */}
          <button 
            className="btn btn-ghost btn-circle btn-sm text-slate-400 hover:text-amber-400"
            onClick={() => {
              onToggleMute();
              sound.playClick();
            }}
            aria-label="كتم أو تشغيل الصوت"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} className="text-amber-400" />}
          </button>
        </div>
      </div>
    </header>
  );
};
