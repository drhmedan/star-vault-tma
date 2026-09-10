import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bot, Check, Crosshair, Flame, LockKeyhole, Map as MapIcon, Radar, Share2, Shield, Sparkles, Swords, Users, X, Zap } from 'lucide-react';
import { UserProfile } from '../types';
import { sound } from '../audio/soundEngine';
import { MapId } from '../game3d/types3d';
import { MAP_CATALOG } from '../game3d/mapRegistry';
import { config } from '../config';
import { rankForTrophies } from '../data/ranks';
import { GameMode, MatchInfo, MatchmakingClient } from '../services/matchmaking';

interface PvPLobbyProps {
  user: UserProfile;
  onStartMatch: (roomCode: string, mode: 'host' | 'join' | 'ai' | 'matchmade', stakeStars: number, mapId?: MapId, matchInfo?: MatchInfo, gameMode?: GameMode) => void;
  onOpenLoadout: () => void;
}

const stakeOptions = [0, 25, 100];

// Playable modes: solo queues (quick/ffa) and team elimination queues
// (2v2/squad). Bots always fill empty seats so nobody ever waits out the
// gathering window.
const MODE_CATALOG: { id: GameMode; nameAr: string; descAr: string; tag: string; fighters: number; teamSize: number; gatherSec: number }[] = [
  { id: 'quick', nameAr: 'مواجهة سريعة', descAr: '1 ضد 1 + بوتات تكتيكية', tag: 'فوري', fighters: 8, teamSize: 1, gatherSec: 30 },
  { id: 'ffa', nameAr: 'معركة حرة', descAr: 'كل مقاتل لنفسه · حتى ٨', tag: 'FFA', fighters: 8, teamSize: 1, gatherSec: 30 },
  { id: '2v2', nameAr: 'ثنائي ضد ثنائي', descAr: 'فريقان · آخر فريق صامد', tag: '2×2', fighters: 4, teamSize: 2, gatherSec: 45 },
  { id: 'squad', nameAr: 'فرق ٤ ضد ٤', descAr: 'فريقان كاملان · بوتات تكمل', tag: '4×4', fighters: 8, teamSize: 4, gatherSec: 60 }
];

export const PvPLobby: React.FC<PvPLobbyProps> = ({ user, onStartMatch, onOpenLoadout }) => {
  const [joinCode, setJoinCode] = useState('');
  const [stakeStars, setStakeStars] = useState(0);
  const [selectedMap, setSelectedMap] = useState<MapId>('warzone');
  const [selectedMode, setSelectedMode] = useState<GameMode>('quick');
  const [searching, setSearching] = useState(false);
  const [queueWaiting, setQueueWaiting] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(30);
  const searchRef = useRef<MatchmakingClient | null>(null);
  const startingRef = useRef(false);

  const activeMode = MODE_CATALOG.find((m) => m.id === selectedMode) ?? MODE_CATALOG[0];
  const totalFighters = activeMode.fighters;

  const roomCode = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
  const start = (mode: 'host' | 'join' | 'ai' | 'matchmade', code: string, stake = stakeStars, info?: MatchInfo, gameMode: GameMode = selectedMode) => {
    sound.playClick();
    onStartMatch(code, mode, stake, selectedMap, info, gameMode);
  };

  const beginSearch = () => {
    sound.playClick();
    startingRef.current = false;
    setQueueWaiting(0);
    setSecondsLeft(activeMode.gatherSec);
    setSearching(true);
  };

  const cancelSearch = () => {
    sound.playClick();
    searchRef.current?.cancel();
    searchRef.current = null;
    setSearching(false);
  };

  const startSoloFallback = () => {
    start('matchmade', 'SOLO-' + Math.random().toString(36).slice(2, 7).toUpperCase(), stakeStars, {
      myId: user.id,
      hostId: user.id,
      players: [{ id: user.id, name: user.firstName, slot: 0, team: 0 }],
      fillBots: totalFighters - 1,
      mySlot: 0,
      gameMode: selectedMode,
      teamSize: activeMode.teamSize
    }, selectedMode);
  };

  // Runs the matchmaking queue while the gathering screen is open.
  useEffect(() => {
    if (!searching) return;

    // No live backend configured: go straight into a full bot battle.
    if (!config.matchmakerAvailable) {
      const t = window.setTimeout(() => {
        if (!startingRef.current) { startingRef.current = true; startSoloFallback(); }
      }, 1200);
      return () => window.clearTimeout(t);
    }

    const client = new MatchmakingClient();
    searchRef.current = client;
    client.start(
      { userId: user.id, name: user.firstName, teamSize: activeMode.teamSize, mode: selectedMode, url: config.matchmakerUrl },
      (e) => {
        if (e.type === 'status') {
          setQueueWaiting(e.waiting);
        } else if (e.type === 'ready') {
          if (startingRef.current) return;
          startingRef.current = true;
          const mySeat = e.room.players.find((pl) => pl.id === user.id);
          const info: MatchInfo = {
            myId: user.id,
            hostId: e.room.host,
            players: e.room.players,
            fillBots: e.room.fillBots,
            mySlot: mySeat?.slot ?? 0,
            gameMode: e.room.mode,
            teamSize: e.room.teamSize
          };
          start('matchmade', e.room.roomCode, stakeStars, info, e.room.mode);
        } else if (e.type === 'error' || (e.type === 'closed' && e.reason === 'network')) {
          if (!startingRef.current) { startingRef.current = true; startSoloFallback(); }
        }
      }
    );

    const tick = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      window.clearInterval(tick);
      client.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching]);

  // ============================================================
  // Gathering screen — full-screen, premium, live queue status
  // ============================================================
  if (searching) {
    return (
      <div className="fixed inset-0 z-50 bg-[#07090f] flex flex-col items-center justify-between py-10 px-6 select-none touch-none" dir="rtl">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(34,211,238,.16),transparent_55%),radial-gradient(circle_at_50%_100%,rgba(251,191,36,.08),transparent_45%)]" />

        <button onClick={cancelSearch}
          className="relative self-start flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-black text-slate-300 active:scale-95 transition-transform">
          <X className="w-4 h-4" /> إلغاء البحث
        </button>

        <div className="relative flex flex-col items-center">
          {/* Radar sweep */}
          <div className="relative w-44 h-44">
            <div className="absolute inset-0 rounded-full border border-cyan-300/20" />
            <div className="absolute inset-4 rounded-full border border-cyan-300/15" />
            <div className="absolute inset-9 rounded-full border border-cyan-300/10" />
            <div className="absolute inset-0 rounded-full overflow-hidden">
              <div className="absolute inset-0 rounded-full animate-[radar_1.8s_linear_infinite]" style={{ background: 'conic-gradient(from 0deg, rgba(34,211,238,.5), transparent 60deg)' }} />
            </div>
            <div className="absolute inset-0 grid place-items-center">
              <div className="w-2.5 h-2.5 rounded-full bg-cyan-300 shadow-[0_0_22px_rgba(34,211,238,.9)] animate-ping" />
              <div className="absolute w-2.5 h-2.5 rounded-full bg-cyan-200 shadow-[0_0_14px_rgba(34,211,238,.8)]" />
            </div>
            <Radar className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 text-cyan-300/25" />
          </div>

          <h2 className="mt-6 text-2xl font-black text-white text-center">جاري البحث عن خصم…</h2>
          <p className="mt-1.5 text-xs text-slate-400 text-center">
            {config.matchmakerAvailable
              ? `${queueWaiting} لاعب في الطابور الآن · ${activeMode.nameAr} من ${totalFighters} مقاتلين`
              : `وضع التدريب — تجهيز مباراة ${activeMode.nameAr} بالبوتات`}
          </p>

          {/* Fighter slots filling */}
          <div className="mt-6 flex items-center gap-1.5">
            <div className={`w-9 h-9 rounded-xl border grid place-items-center text-sm font-black ${activeMode.teamSize > 1 ? 'border-emerald-300/50 bg-emerald-300/10 text-emerald-200' : 'border-cyan-300/50 bg-cyan-300/10 text-cyan-200'}`}>{user.firstName.charAt(0).toUpperCase()}</div>
            {Array.from({ length: totalFighters - 1 }).map((_, i) => (
              <div key={i} className="w-9 h-9 rounded-xl border border-white/10 bg-white/[0.04] grid place-items-center text-slate-500 text-xs animate-pulse" style={{ animationDelay: `${i * 0.12}s` }}>?</div>
            ))}
          </div>
          {activeMode.teamSize > 1 && (
            <p className="mt-2 text-[10px] font-bold text-emerald-300/80">
              <Users className="inline w-3.5 h-3.5 ml-1" />
              فريقك: {activeMode.teamSize} مقاتلين · الفريق الصامد ينتصر
            </p>
          )}

          {/* Countdown ring */}
          <div className="mt-8 flex flex-col items-center">
            <div className="relative w-20 h-20">
              <svg viewBox="0 0 80 80" className="w-20 h-20 -rotate-90">
                <circle cx="40" cy="40" r="34" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="#22d3ee" strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={`${(secondsLeft / activeMode.gatherSec) * 213.6} 213.6`} className="transition-all duration-1000" />
              </svg>
              <div className="absolute inset-0 grid place-items-center text-2xl font-black font-mono text-white tabular-nums">{secondsLeft}</div>
            </div>
            <p className="mt-2 text-[10px] font-bold text-slate-500">
              {secondsLeft > 0 ? 'تبدأ المباراة خلال ثوانٍ' : 'جارٍ تجهيز الساحة بالبوتات…'}
            </p>
          </div>
        </div>

        <p className="relative text-[10px] text-slate-600 text-center leading-relaxed">
          <Sparkles className="inline w-3 h-3 text-amber-300 ml-1" />
          لا خصم؟ نملأ الساحة ببوتات تكتيكية حتى لا تنتظر أبداً
        </p>

        <style>{`
          @keyframes radar { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

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
              <p className="mt-0.5 text-[11px] text-slate-400">{rankForTrophies(user.trophies).icon} {rankForTrophies(user.trophies).nameAr} · 🏆 {user.trophies || 0} كأس {user.isVip ? <span className="text-amber-300">· VIP</span> : ''}</p>
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
            {config.matchmakerAvailable ? 'خوادم المطابقة نشطة' : 'وضع التدريب المحلي'}
          </span>
          <span className="font-mono text-xs font-black text-amber-300">★ {user.stars}</span>
        </div>
      </header>

      {/* ===== Game mode ===== */}
      <div>
        <div className="flex items-center justify-between px-1 mb-3">
          <h2 className="flex items-center gap-2 text-base font-black text-white"><Crosshair className="h-5 w-5 text-emerald-300" /> نمط المعركة</h2>
          <span className="text-[10px] text-slate-500">اختر قواعد الاشتباك</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {MODE_CATALOG.map((m) => {
            const selected = selectedMode === m.id;
            const team = m.teamSize > 1;
            return (
              <button key={m.id} onClick={() => { sound.playClick(); setSelectedMode(m.id); }}
                className={`group relative overflow-hidden rounded-2xl border p-3 text-right transition-all duration-200 ${selected ? (team ? 'border-emerald-300/60 shadow-[0_0_30px_rgba(52,211,153,.16)]' : 'border-cyan-300/60 shadow-[0_0_30px_rgba(34,211,238,.16)]') : 'border-white/10 hover:border-white/25'}`}>
                <div className={`absolute inset-0 ${selected ? (team ? 'bg-gradient-to-br from-emerald-500/15 via-[#0a0f1a]/80 to-[#0a0f1a]' : 'bg-gradient-to-br from-cyan-500/15 via-[#0a0f1a]/80 to-[#0a0f1a]') : 'bg-[#0a0f1a]/85'}`} />
                <div className="relative flex flex-col gap-2">
                  <div className="flex items-start justify-between">
                    <span className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[9px] font-mono font-black ${team ? 'border-emerald-300/30 bg-emerald-300/10 text-emerald-300' : 'border-cyan-300/30 bg-cyan-300/10 text-cyan-300'}`}>{m.tag}</span>
                    {selected
                      ? <span className={`grid place-items-center w-6 h-6 rounded-full ${team ? 'bg-emerald-300' : 'bg-cyan-300'} text-slate-950`}><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>
                      : <span className="w-6 h-6 rounded-full border border-white/15" />}
                  </div>
                  <div>
                    <p className="text-sm font-black text-white">{m.nameAr}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400 leading-relaxed">{m.descAr}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

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
      <button onClick={beginSearch}
        className="group relative w-full overflow-hidden rounded-2xl border border-cyan-300/40 bg-gradient-to-l from-cyan-500/25 via-blue-600/10 to-cyan-500/25 p-4 text-right transition hover:border-cyan-200 active:scale-[.99]">
        <div className="absolute inset-y-0 left-0 w-1/3 bg-white/10 blur-2xl animate-[shine_3.2s_ease-in-out_infinite]" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-cyan-300/15 text-cyan-200 border border-cyan-300/20"><Swords className="h-6 w-6" /></div>
          <div className="flex-1">
            <p className="text-base font-black text-white">بحث سريع عن معركة · {activeMode.nameAr}</p>
            <p className="mt-0.5 text-xs text-cyan-100/60">
              {config.matchmakerAvailable
                ? `تجهيز خلال ${activeMode.gatherSec} ثانية · ${totalFighters} مقاتلين${activeMode.teamSize > 1 ? ' · فريقان' : ''}`
                : `معركة بوتات فورية · ${totalFighters} مقاتلين${activeMode.teamSize > 1 ? ' · فريقان' : ''}`}
            </p>
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
