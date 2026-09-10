import React from 'react';
import { Crown, Plus, Volume2, VolumeX } from 'lucide-react';
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
    <header className="sticky top-0 z-40 bg-[#080b11]/80 backdrop-blur-xl border-b border-white/[0.06] px-4 py-2.5 select-none">
      <div className="max-w-md mx-auto flex items-center justify-between">
        {/* User Profile Mini Badge */}
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-400/80 to-amber-600/60 border border-amber-300/40 flex items-center justify-center font-black text-white text-base shadow-[0_0_18px_rgba(251,191,36,.18)]">
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
              <span className="font-black text-sm text-slate-100">{user.firstName || 'مغامر السيادة'}</span>
              <span className="px-1.5 py-0.5 rounded-md bg-amber-400/15 text-amber-300 font-mono font-black text-[9px] border border-amber-400/25">
                LVL {user.level}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 font-mono">@{user.username || 'telegram_user'}</div>
          </div>
        </div>

        {/* Balances & Audio Toggle */}
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 bg-gradient-to-r from-amber-500/15 via-yellow-500/10 to-amber-500/20 border border-amber-500/40 px-3 py-1.5 rounded-xl shadow-[0_0_16px_rgba(251,191,36,.1)] transition-all active:scale-95"
            onClick={() => { sound.playClick(); onOpenShop(); }}
            title="متجر نجوم تيليجرام"
          >
            <span className="text-base">🌟</span>
            <span className="text-amber-300 font-black text-sm font-mono leading-none tabular-nums">{user.stars}</span>
            <span className="p-1 rounded-md bg-amber-400 text-slate-950 shadow"><Plus size={10} strokeWidth={3} /></span>
          </button>

          <div className="flex items-center gap-1 bg-white/[0.04] border border-white/10 px-2.5 py-1.5 rounded-xl font-mono text-xs">
            <span className="text-cyan-400">💎</span>
            <span className="text-slate-200 font-bold tabular-nums">{user.starDust}</span>
          </div>

          <button
            className="w-9 h-9 flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-400 hover:text-amber-400 transition active:scale-90"
            onClick={() => { onToggleMute(); sound.playClick(); }}
            aria-label="كتم أو تشغيل الصوت"
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} className="text-amber-400" />}
          </button>
        </div>
      </div>
    </header>
  );
};
