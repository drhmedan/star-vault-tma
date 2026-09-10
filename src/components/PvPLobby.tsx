import React, { useState } from 'react';
import { ArrowLeft, Bot, Check, Flame, LockKeyhole, Map as MapIcon, Share2, Shield, Sparkles, Swords, Zap } from 'lucide-react';
import { UserProfile } from '../types';
import { sound } from '../audio/soundEngine';
import { MapId } from '../game3d/types3d';
import { MAP_CATALOG } from '../game3d/mapRegistry';

interface PvPLobbyProps {
  user: UserProfile;
  onStartMatch: (roomCode: string, mode: 'host' | 'join' | 'ai', stakeStars: number, mapId?: MapId) => void;
  onOpenLoadout: () => void;
}

const stakeOptions = [0, 25, 100];

export const PvPLobby: React.FC<PvPLobbyProps> = ({ user, onStartMatch, onOpenLoadout }) => {
  const [joinCode, setJoinCode] = useState('');
  const [stakeStars, setStakeStars] = useState(0);
  const [selectedMap, setSelectedMap] = useState<MapId>('warzone');

  const roomCode = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const start = (mode: 'host' | 'join' | 'ai', code: string, stake = stakeStars) => {
    sound.playClick();
    onStartMatch(code, mode, stake, selectedMap);
  };

  return (
    <section className="space-y-5 pb-24 text-right" dir="rtl">
      {/* ===== Hero ===== */}
      <header className="relative overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-[#0d1726] via-[#0a0f1a] to-[#0d1726] p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_-10%,rgba(34,211,238,.20),transparent_42%),radial-gradient(circle_at_100%_120%,rgba(251,191,36,.12),transparent_38%)]" />
        <div className="absolute -top-12 -left-12 w-44 h-44 rounded-full bg-cyan-400/10 blur-3xl" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-tr from-cyan-500/25 to-amber-400/15 border border-white/15 text-xl font-black text-white shadow-[0_0_24px_rgba(34,211,238,.18)]">
                {user.firstName ? user.firstName.charAt(0).toUpperCase() : 'S'}
              </div>
              <span className="absolute -bottom-1 -left-1 grid place-items-center w-6 h-6 rounded-lg bg-slate-900 border border-cyan-300/40 text-[9px] font-black text-cyan-300">{user.level}</span>
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.3em] text-cyan-300/90">Command Deck</p>
              <h1 className="mt-0.5 text-xl font-black text-white leading-tight">{user.firstName}</h1>
              <p className="mt-0.5 text-[11px] text-slate-400">🏆 {user.trophies || 0} كأس {user.isVip ? <span className="text-amber-300">· VIP</span> : ''}</p>
            </div>
          </div>
          <button onClick={() => { sound.playClick(); onOpenLoadout(); }}
            className="flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-3.5 py-2 text-xs font-black text-amber-200 backdrop-blur-sm transition hover:bg-amber-300/20 active:scale-95">
            <Shield className="h-4 w-4" /> العتاد
          </button>
        </div>
        <div className="relative mt-4 flex items-center justify-between pt-3 border-t border-white/[0.07]">
          <span className="flex items-center gap-1.5 text-[10px] text-slate-400">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
            </span>
            1,248 لاعب متصل الآن
          </span>
          <span className="font-mono text-xs font-black text-amber-300">★ {user.stars}</span>
        </div>
      </header>

      {/* ===== Map selection ===== */}
      <div>
        <div className="flex items-center justify-between px-1 mb-3">
          <h2 className="flex items-center gap-2 text-base font-black text-white"><MapIcon className="h-5 w-5 text-cyan-300" /> خريطة العمليات</h2>
          <span className="rounded-full border border-cyan-300/20 bg-cyan-300/5 px-2.5 py-1 text-[9px] font-mono text-cyan-300">LIVE</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {Object.values(MAP_CATALOG).map((map) => {
            const selected = selectedMap === map.id;
            return (
              <button key={map.id} onClick={() => { sound.playClick(); setSelectedMap(map.id); }}
                className={`group relative min-h-36 overflow-hidden rounded-2xl border p-3 text-right transition-all duration-200 ${selected ? 'border-cyan-300/60 shadow-[0_0_30px_rgba(34,211,238,.16)]' : 'border-white/10 hover:border-white/25'}`}>
                <div className={`absolute inset-0 ${selected ? 'bg-gradient-to-br from-cyan-500/15 via-[#0a0f1a]/80 to-[#0a0f1a]' : 'bg-[#0a0f1a]/85'}`} />
                <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.035)_1px,transparent_1px)] [background-size:18px_18px]" />
                <div className="relative flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between">
                    <span className="text-3xl drop-shadow-[0_0_14px_rgba(34,211,238,.35)] transition-transform duration-200 group-hover:scale-110">{map.icon}</span>
                    {selected
                      ? <span className="grid place-items-center w-6 h-6 rounded-full bg-cyan-300 text-slate-950"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                      : <span className="w-6 h-6 rounded-full border border-white/15" />}
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">{map.nameAr}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400 leading-relaxed">{map.subtitleAr}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== Stake ===== */}
      <div>
        <div className="flex items-center justify-between px-1 mb-3">
          <h2 className="flex items-center gap-2 text-base font-black text-white"><Flame className="h-5 w-5 text-amber-300" /> مستوى الرهان</h2>
          <span className="text-[10px] text-slate-500">اربح أكثر، خاطر أكثر</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
          {stakeOptions.map((value) => {
            const active = stakeStars === value;
            return (
              <button key={value} onClick={() => { sound.playClick(); setStakeStars(value); }}
                className={`rounded-xl py-2.5 text-xs font-black transition-all duration-150 ${active
                  ? (value
                    ? 'bg-gradient-to-b from-amber-400/25 to-amber-500/10 text-amber-200 border border-amber-300/40 shadow-[0_0_18px_rgba(251,191,36,.14)]'
                    : 'bg-gradient-to-b from-cyan-400/25 to-cyan-500/10 text-cyan-200 border border-cyan-300/40 shadow-[0_0_18px_rgba(34,211,238,.14)]')
                  : 'text-slate-500 border border-transparent hover:text-slate-300'}`}>
                {value === 0 ? 'مجاني' : <>{value} <span className="text-amber-300">★</span></>}
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== Primary CTA ===== */}
      <button onClick={() => start('host', roomCode('QUICK'))}
        className="group relative w-full overflow-hidden rounded-2xl border border-cyan-300/40 bg-gradient-to-l from-cyan-500/25 via-blue-600/10 to-cyan-500/25 p-4 text-right transition hover:border-cyan-200 active:scale-[.99]">
        <div className="absolute inset-y-0 left-0 w-1/3 bg-white/10 blur-2xl animate-[shine_3.2s_ease-in-out_infinite]" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-cyan-300/15 text-cyan-200 border border-cyan-300/20"><Swords className="h-6 w-6" /></div>
          <div className="flex-1">
            <p className="text-base font-black text-white">بحث سريع عن معركة</p>
            <p className="mt-0.5 text-xs text-cyan-100/60">مطابقة فورية مع أقرب لاعب</p>
          </div>
          <ArrowLeft className="h-5 w-5 rotate-180 text-cyan-200 transition group-hover:-translate-x-1" />
        </div>
      </button>

      {/* ===== Secondary actions ===== */}
      <div className="grid grid-cols-2 gap-3">
        <button onClick={() => start('host', roomCode('CYBER'))}
          className="flex items-center gap-3 rounded-2xl border border-amber-300/20 bg-gradient-to-b from-amber-400/10 to-transparent p-4 text-right transition hover:border-amber-300/40 active:scale-[.98]">
          <Share2 className="h-5 w-5 text-amber-200" />
          <span><b className="block text-sm text-white">غرفة خاصة</b><small className="text-[10px] text-slate-500">دعوة صديق</small></span>
        </button>
        <button onClick={() => start('ai', 'AI-PRACTICE', 0)}
          className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-right transition hover:border-white/25 active:scale-[.98]">
          <Bot className="h-5 w-5 text-slate-300" />
          <span><b className="block text-sm text-white">تدريب AI</b><small className="text-[10px] text-slate-500">بدون رهان</small></span>
        </button>
      </div>

      {/* ===== Join by code ===== */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-300"><LockKeyhole className="h-4 w-4 text-slate-500" /> الانضمام برمز تكتيكي</div>
        <div className="flex gap-2">
          <input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="CYBER-X84"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-3 text-center font-mono text-sm text-white tracking-[0.2em] outline-none placeholder:text-slate-700 focus:border-cyan-300/60 transition" />
          <button disabled={!joinCode.trim()} onClick={() => start('join', joinCode.trim())}
            className="rounded-xl bg-gradient-to-b from-cyan-300 to-cyan-500 px-4 text-xs font-black text-slate-950 shadow-[0_0_20px_rgba(34,211,238,.3)] disabled:opacity-30 disabled:shadow-none transition active:scale-95">دخول</button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 text-[10px] text-slate-600">
        <Sparkles className="h-3 w-3 text-amber-300" /> نظام حماية الرهانات نشط <Zap className="h-3 w-3 text-cyan-300" />
      </div>
    </section>
  );
};
