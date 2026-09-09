import React, { useState } from 'react';
import { ArrowRight, Bot, Crosshair, Flame, LockKeyhole, Map, Radio, Share2, Shield, Sparkles, Swords, Trophy, Users, Zap } from 'lucide-react';
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
    <section className="space-y-4 pb-24 text-right" dir="rtl">
      <header className="relative overflow-hidden rounded-[28px] border border-cyan-400/20 bg-[#0d1621]/90 p-5 shadow-2xl shadow-cyan-950/20 backdrop-blur-xl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,.18),transparent_35%),radial-gradient(circle_at_100%_100%,rgba(255,215,0,.1),transparent_30%)]" />
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-2xl border border-amber-300/30 bg-amber-300/10 text-amber-300 shadow-[0_0_28px_rgba(255,215,0,.14)]"><Trophy className="h-6 w-6" /></div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.28em] text-cyan-300">COMMAND DECK / ONLINE</p>
              <h1 className="mt-1 text-xl font-black text-white">{user.firstName}</h1>
              <p className="mt-1 text-xs text-slate-400">المستوى {user.level} <span className="mx-1 text-slate-600">•</span> {user.trophies || 0} كأس</p>
            </div>
          </div>
          <button onClick={() => { sound.playClick(); onOpenLoadout(); }} className="flex items-center gap-2 rounded-xl border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-xs font-black text-amber-200 transition hover:bg-amber-300/20 active:scale-95"><Shield className="h-4 w-4" /> العتاد</button>
        </div>
        <div className="relative mt-5 flex items-center justify-between border-t border-white/10 pt-3 text-[10px] text-slate-400"><span className="flex items-center gap-1.5"><Radio className="h-3.5 w-3.5 text-emerald-400" /> 1,248 لاعب في الساحة</span><span className="font-mono text-amber-300">STARS {user.stars}</span></div>
      </header>

      <div className="flex items-center justify-between px-1"><div><p className="text-[10px] font-bold tracking-[.22em] text-cyan-400">SELECT BATTLEFIELD</p><h2 className="mt-1 flex items-center gap-2 text-lg font-black text-white"><Map className="h-5 w-5 text-cyan-300" /> خريطة العمليات</h2></div><span className="rounded-full border border-cyan-300/20 bg-cyan-300/5 px-2 py-1 text-[10px] font-mono text-cyan-300">LIVE ROTATION</span></div>
      <div className="grid grid-cols-2 gap-3">
        {Object.values(MAP_CATALOG).map((map) => {
          const selected = selectedMap === map.id;
          return <button key={map.id} onClick={() => { sound.playClick(); setSelectedMap(map.id); }} className={`group relative min-h-36 overflow-hidden rounded-2xl border p-3 text-right transition-all ${selected ? 'border-cyan-300 bg-cyan-950/50 shadow-[0_0_25px_rgba(34,211,238,.16)]' : 'border-white/10 bg-[#0d1621]/80 opacity-75 hover:opacity-100'}`}><div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" /><div className="relative flex h-full flex-col justify-between"><div className="flex items-start justify-between"><span className="text-2xl">{map.icon}</span>{selected && <span className="rounded-full bg-cyan-300 px-2 py-1 text-[9px] font-black text-slate-950">SELECTED</span>}</div><div><p className="text-sm font-black text-white">{map.nameAr}</p><p className="mt-1 text-[10px] text-slate-400">{map.subtitleAr}</p><div className="mt-2 flex gap-1">{['TACTICAL','RANKED'].map(tag => <span key={tag} className="rounded border border-white/10 px-1.5 py-0.5 text-[8px] text-slate-500">{tag}</span>)}</div></div></div></button>;
        })}
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0d1621]/80 p-4 backdrop-blur-xl"><div className="mb-3 flex items-center justify-between"><span className="flex items-center gap-2 text-xs font-bold text-slate-300"><Flame className="h-4 w-4 text-amber-300" /> مستوى المخاطرة</span><span className="text-[10px] text-slate-500">اربح أكثر، خاطر أكثر</span></div><div className="grid grid-cols-3 gap-2">{stakeOptions.map(value => <button key={value} onClick={() => { sound.playClick(); setStakeStars(value); }} className={`rounded-xl border py-3 text-xs font-black transition ${stakeStars === value ? value ? 'border-amber-300 bg-amber-300/15 text-amber-200' : 'border-cyan-300 bg-cyan-300/15 text-cyan-200' : 'border-white/10 bg-black/20 text-slate-500'}`}>{value === 0 ? 'مجاني' : <>{value} <span className="text-amber-300">★</span></>}</button>)}</div></div>

      <button onClick={() => start('host', roomCode('QUICK'))} className="group relative flex w-full items-center justify-between overflow-hidden rounded-2xl border border-cyan-300/40 bg-gradient-to-l from-cyan-500/30 to-blue-600/20 p-4 text-right shadow-lg shadow-cyan-950/30 transition hover:border-cyan-200 active:scale-[.99]"><div className="absolute inset-y-0 right-0 w-1/3 bg-cyan-300/10 blur-2xl" /><div className="relative flex items-center gap-3"><div className="grid h-12 w-12 place-items-center rounded-xl bg-cyan-300/15 text-cyan-200"><Swords className="h-6 w-6" /></div><div><p className="text-base font-black text-white">بحث سريع عن معركة</p><p className="mt-1 text-xs text-cyan-100/60">مطابقة فورية مع أقرب لاعب</p></div></div><ArrowRight className="relative h-5 w-5 rotate-180 text-cyan-200 transition group-hover:-translate-x-1" /></button>

      <div className="grid grid-cols-2 gap-3"><button onClick={() => start('host', roomCode('CYBER'))} className="flex items-center gap-3 rounded-2xl border border-amber-300/25 bg-amber-300/5 p-4 text-right transition hover:bg-amber-300/10 active:scale-[.98]"><Share2 className="h-5 w-5 text-amber-200" /><span><b className="block text-sm text-white">غرفة خاصة</b><small className="text-[10px] text-slate-500">دعوة صديق</small></span></button><button onClick={() => start('ai', 'AI-PRACTICE', 0)} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#0d1621]/80 p-4 text-right transition hover:bg-white/5 active:scale-[.98]"><Bot className="h-5 w-5 text-slate-300" /><span><b className="block text-sm text-white">تدريب AI</b><small className="text-[10px] text-slate-500">بدون رهان</small></span></button></div>

      <div className="rounded-2xl border border-white/10 bg-[#0d1621]/80 p-4"><div className="mb-2 flex items-center gap-2 text-xs font-bold text-slate-300"><LockKeyhole className="h-4 w-4 text-slate-500" /> الانضمام برمز تكتيكي</div><div className="flex gap-2"><input value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())} placeholder="CYBER-X84" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-center font-mono text-sm text-white outline-none placeholder:text-slate-700 focus:border-cyan-300" /><button disabled={!joinCode.trim()} onClick={() => start('join', joinCode.trim())} className="rounded-xl bg-cyan-400 px-4 text-xs font-black text-slate-950 disabled:opacity-30">دخول</button></div></div>
      <div className="flex items-center justify-center gap-2 text-[10px] text-slate-600"><Sparkles className="h-3 w-3 text-amber-300" /> نظام حماية الرهانات نشط <Zap className="h-3 w-3 text-cyan-300" /></div>
    </section>
  );
};
