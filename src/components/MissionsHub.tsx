import React, { useEffect, useState } from 'react';
import { Award, Check, ChevronLeft, Loader2, Lock, RefreshCw, Swords, Target, Trophy, Users } from 'lucide-react';
import { UserProfile } from '../types';
import { questsForDate, questDateKey, DailyQuestDef } from '../data/dailyQuests';
import { ACHIEVEMENTS, achievementValue, achievementItem } from '../data/achievements';
import { RANKS, rankForTrophies, nextRank, rankProgress } from '../data/ranks';
import { ledger, LeaderboardEntry } from '../services/ledger';
import { sound } from '../audio/soundEngine';

interface MissionsHubProps {
  user: UserProfile;
  onClaimQuest: (questId: string, rewardStars: number, rewardDust: number) => void;
  onClaimAchievement: (achId: string, rewardStars: number, rewardDust: number, itemId?: string) => void;
}

type Section = 'quests' | 'achievements' | 'ranks' | 'leaderboard';

const SECTIONS: { id: Section; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[] = [
  { id: 'quests', label: 'المهام اليومية', icon: Target },
  { id: 'achievements', label: 'الإنجازات', icon: Award },
  { id: 'ranks', label: 'الرتب', icon: Trophy },
  { id: 'leaderboard', label: 'الصدارة', icon: Users }
];

export const MissionsHub: React.FC<MissionsHubProps> = ({ user, onClaimQuest, onClaimAchievement }) => {
  const [section, setSection] = useState<Section>('quests');

  return (
    <section className="space-y-4 pb-24 text-right" dir="rtl">
      {/* ===== Header ===== */}
      <header className="relative overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-[#0d1726] via-[#0a0f1a] to-[#0d1726] p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_-10%,rgba(251,191,36,.14),transparent_45%),radial-gradient(circle_at_10%_120%,rgba(34,211,238,.16),transparent_40%)]" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-tr from-amber-400/25 to-cyan-400/15 border border-white/15 text-2xl shadow-[0_0_24px_rgba(251,191,36,.15)]">🎖️</div>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.3em] text-amber-300/90">مركز الإنجاز</p>
            <h1 className="mt-0.5 text-xl font-black text-white leading-tight">مهامك اليومية ورتبك</h1>
            <p className="mt-0.5 text-[11px] text-slate-400">العب، تقدم، وارتقِ في سلّم الساحة</p>
          </div>
        </div>
      </header>

      {/* ===== Segmented sections ===== */}
      <div className="grid grid-cols-4 gap-1.5 rounded-2xl border border-white/10 bg-white/[0.03] p-1.5">
        {SECTIONS.map((s) => {
          const active = section === s.id;
          const Icon = s.icon;
          return (
            <button key={s.id} onClick={() => { sound.playClick(); setSection(s.id); }}
              className={`flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-black transition-all duration-150 ${active ? 'bg-gradient-to-b from-amber-400/25 to-amber-500/10 text-amber-200 border border-amber-300/40 shadow-[0_0_16px_rgba(251,191,36,.12)]' : 'text-slate-500 border border-transparent hover:text-slate-300'}`}>
              <Icon size={16} />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>

      {section === 'quests' && <DailyQuests user={user} onClaim={onClaimQuest} />}
      {section === 'achievements' && <Achievements user={user} onClaim={onClaimAchievement} />}
      {section === 'ranks' && <Ranks user={user} />}
      {section === 'leaderboard' && <Leaderboard user={user} />}
    </section>
  );
};

// ============================================================
// Daily quests
// ============================================================
const DailyQuests: React.FC<{ user: UserProfile; onClaim: (id: string, stars: number, dust: number) => void }> = ({ user, onClaim }) => {
  const date = questDateKey(Date.now());
  const quests = questsForDate(date);
  const state = user.dailyQuests && user.dailyQuests.date === date ? user.dailyQuests : { date, progress: {} as Record<string, number>, claimed: [] as string[] };
  const claimedCount = quests.filter((q) => state.claimed.includes(q.id)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-base font-black text-white"><Target className="h-5 w-5 text-amber-300" /> مهام اليوم</h2>
        <span className="rounded-full border border-amber-300/20 bg-amber-300/5 px-2.5 py-1 text-[10px] font-mono font-black text-amber-300">{claimedCount} / {quests.length} منجزة</span>
      </div>
      {quests.map((q) => <QuestCard key={q.id} q={q} progress={state.progress[q.metric] || 0} claimed={state.claimed.includes(q.id)} onClaim={onClaim} />)}
      <p className="text-center text-[10px] text-slate-600 leading-relaxed px-4">
        ⭐ مكافآت النجوم تُضاف عبر سجل الخادم الآمن · تتجدد المهام يومياً عند منتصف الليل
      </p>
    </div>
  );
};

const QuestCard: React.FC<{ q: DailyQuestDef; progress: number; claimed: boolean; onClaim: (id: string, stars: number, dust: number) => void }> = ({ q, progress, claimed, onClaim }) => {
  const done = progress >= q.target;
  const pct = Math.min(100, Math.round((progress / q.target) * 100));
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-start gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl border ${done ? 'border-emerald-300/30 bg-emerald-300/10' : 'border-white/10 bg-white/[0.04]'}`}>{q.icon}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black text-white">{q.nameAr}</p>
            <div className="flex items-center gap-1 text-[10px] font-bold">
              <span className="text-amber-300">★{q.rewardStars}</span>
              <span className="text-cyan-300">💎{q.rewardDust}</span>
            </div>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">{q.descAr}</p>
          <div className="mt-2.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded-full bg-black/40 overflow-hidden">
              <div className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="font-mono text-[10px] font-black text-slate-400 tabular-nums">{Math.min(progress, q.target)}/{q.target}</span>
          </div>
        </div>
      </div>
      <button disabled={!done || claimed} onClick={() => onClaim(q.id, q.rewardStars, q.rewardDust)}
        className={`mt-3 w-full rounded-xl py-2 text-xs font-black transition active:scale-[.99] ${claimed
          ? 'bg-emerald-400/10 text-emerald-300 border border-emerald-300/25'
          : done
            ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,.25)]'
            : 'bg-white/[0.04] text-slate-500 border border-white/10'}`}>
        {claimed ? (<span className="flex items-center justify-center gap-1"><Check className="h-3.5 w-3.5" strokeWidth={3} /> تم الاستلام</span>)
          : done ? 'استلم المكافأة' : 'تابع اللعب لإكمال المهمة'}
      </button>
    </div>
  );
};

// ============================================================
// Achievements
// ============================================================
const Achievements: React.FC<{ user: UserProfile; onClaim: (id: string, stars: number, dust: number, itemId?: string) => void }> = ({ user, onClaim }) => {
  const stats = user.achievements?.stats ?? { kills: 0, wins: 0, matches: 0, damage: 0, headshots: 0, stakes: 0, bestTrophies: user.trophies || 0 };
  const claimed = user.achievements?.claimed ?? [];
  const claimedCount = ACHIEVEMENTS.filter((a) => claimed.includes(a.id)).length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-base font-black text-white"><Award className="h-5 w-5 text-amber-300" /> إنجازات دائمة</h2>
        <span className="rounded-full border border-amber-300/20 bg-amber-300/5 px-2.5 py-1 text-[10px] font-mono font-black text-amber-300">{claimedCount} / {ACHIEVEMENTS.length}</span>
      </div>
      {ACHIEVEMENTS.map((a) => {
        const value = achievementValue(a, stats);
        const done = value >= a.target;
        const isClaimed = claimed.includes(a.id);
        const pct = Math.min(100, Math.round((value / a.target) * 100));
        const item = achievementItem(a);
        return (
          <div key={a.id} className={`relative overflow-hidden rounded-2xl border p-4 transition ${isClaimed ? 'border-emerald-300/20 bg-emerald-300/[0.04]' : done ? 'border-amber-300/25 bg-amber-300/[0.05]' : 'border-white/10 bg-white/[0.03]'}`}>
            <div className="flex items-start gap-3">
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-xl border ${done ? 'border-amber-300/30 bg-amber-300/10' : 'border-white/10 bg-white/[0.04] grayscale opacity-70'}`}>{a.icon}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-white">{a.nameAr}</p>
                  <div className="flex items-center gap-1 text-[10px] font-bold">
                    <span className="text-amber-300">★{a.rewardStars}</span>
                    <span className="text-cyan-300">💎{a.rewardDust}</span>
                    {item && <span title={item.nameAr}>{item.icon}</span>}
                  </div>
                </div>
                <p className="mt-0.5 text-[11px] text-slate-400">{a.descAr}</p>
                <div className="mt-2.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 rounded-full bg-black/40 overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${done ? 'bg-amber-400' : 'bg-slate-500'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="font-mono text-[10px] font-black text-slate-400 tabular-nums">{Math.min(value, a.target).toLocaleString('ar-EG')}/{a.target.toLocaleString('ar-EG')}</span>
                </div>
              </div>
            </div>
            <button disabled={!done || isClaimed} onClick={() => onClaim(a.id, a.rewardStars, a.rewardDust, a.itemId)}
              className={`mt-3 w-full rounded-xl py-2 text-xs font-black transition active:scale-[.99] ${isClaimed
                ? 'bg-emerald-400/10 text-emerald-300 border border-emerald-300/25'
                : done
                  ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 shadow-[0_0_18px_rgba(251,191,36,.25)]'
                  : 'bg-white/[0.04] text-slate-500 border border-white/10'}`}>
              {isClaimed ? (<span className="flex items-center justify-center gap-1"><Check className="h-3.5 w-3.5" strokeWidth={3} /> مستلم</span>)
                : done ? 'استلم المكافأة' : (<span className="flex items-center justify-center gap-1"><Lock className="h-3 w-3" /> لم يكتمل بعد</span>)}
            </button>
          </div>
        );
      })}
    </div>
  );
};

// ============================================================
// Ranks
// ============================================================
const Ranks: React.FC<{ user: UserProfile }> = ({ user }) => {
  const trophies = user.trophies || 0;
  const current = rankForTrophies(trophies);
  const next = nextRank(trophies);
  const pct = Math.round(rankProgress(trophies) * 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-base font-black text-white"><Trophy className="h-5 w-5 text-amber-300" /> رتبتك الحالية</h2>
        <span className="font-mono text-xs font-black text-slate-300 tabular-nums">🏆 {trophies.toLocaleString('ar-EG')}</span>
      </div>

      {/* Current rank card */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-[#0d1726] to-[#0a0f1a] p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-20%,rgba(251,191,36,.18),transparent_55%)]" />
        <div className="relative flex items-center gap-4">
          <div className="grid h-16 w-16 place-items-center rounded-2xl text-4xl border border-white/15" style={{ background: `linear-gradient(135deg, ${current.color}33, transparent)`, boxShadow: `0 0 30px ${current.color}22` }}>
            {current.icon}
          </div>
          <div className="flex-1">
            <p className="text-[9px] font-black uppercase tracking-[.3em] text-slate-500">التقييم التنافسي (MMR)</p>
            <h3 className="mt-0.5 text-2xl font-black" style={{ color: current.color }}>{current.nameAr}</h3>
            <p className="mt-0.5 text-[11px] text-slate-400">{current.tagAr}</p>
          </div>
        </div>
        {next && (
          <div className="relative mt-4">
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 mb-1.5">
              <span>التقدم نحو {next.nameAr}</span>
              <span className="font-mono tabular-nums">{next.min - trophies} كأس متبقية</span>
            </div>
            <div className="h-2 rounded-full bg-black/40 overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-l from-amber-300 to-amber-500 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* All tiers */}
      <div className="space-y-2">
        {RANKS.map((r) => {
          const active = r.id === current.id;
          return (
            <div key={r.id} className={`flex items-center gap-3 rounded-2xl border p-3 ${active ? 'border-amber-300/40 bg-amber-300/[0.06] shadow-[0_0_20px_rgba(251,191,36,.08)]' : 'border-white/[0.07] bg-white/[0.02] opacity-70'}`}>
              <span className="text-2xl">{r.icon}</span>
              <div className="flex-1">
                <p className="text-sm font-black text-white">{r.nameAr}</p>
                <p className="text-[10px] text-slate-500">{r.tagAr}</p>
              </div>
              <span className="font-mono text-[10px] font-black text-slate-400 tabular-nums">{r.min.toLocaleString('ar-EG')}+</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ============================================================
// Leaderboard
// ============================================================
const Leaderboard: React.FC<{ user: UserProfile }> = ({ user }) => {
  const [rows, setRows] = useState<LeaderboardEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    ledger.leaderboard(50).then((r) => { setRows(r); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-base font-black text-white"><Swords className="h-5 w-5 text-cyan-300" /> لوحة الصدارة</h2>
        <button onClick={() => { sound.playClick(); load(); }}
          className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-bold text-slate-300 active:scale-95 transition">
          <RefreshCw className="h-3 w-3" /> تحديث
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] py-10 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" /> جارٍ تحميل الصدارة…
        </div>
      )}

      {!loading && rows && rows.length === 0 && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] py-10 text-center">
          <p className="text-3xl">🏆</p>
          <p className="mt-2 text-sm font-black text-white">لا يوجد مقاتلون بعد</p>
          <p className="mt-1 text-[11px] text-slate-500 leading-relaxed px-6">
            كن أول من يسجّل مباراة حقيقية ليظهر اسمه هنا — الصدارة حقيقية بالكامل، لا أسماء وهمية
          </p>
        </div>
      )}

      {!loading && rows && rows.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] divide-y divide-white/[0.05]">
          {rows.map((r) => {
            const me = r.id === user.id;
            const podium = r.rank <= 3;
            return (
              <div key={r.id} className={`flex items-center gap-3 p-3 ${me ? 'bg-cyan-400/[0.07]' : ''}`}>
                <span className={`w-7 text-center font-mono font-black tabular-nums ${podium ? 'text-amber-300 text-base' : 'text-slate-500 text-xs'}`}>
                  {podium ? ['🥇', '🥈', '🥉'][r.rank - 1] : r.rank}
                </span>
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-tr from-cyan-500/20 to-amber-400/10 border border-white/10 text-sm font-black text-white">
                  {r.name ? r.name.charAt(0).toUpperCase() : '؟'}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-black text-white">
                    {r.name || 'لاعب مجهول'}{me && <span className="mr-1.5 text-[9px] text-cyan-300 font-bold">(أنت)</span>}
                  </p>
                  <p className="text-[10px] text-slate-500 font-mono tabular-nums">{r.wins} فوز · {r.matches} مباراة</p>
                </div>
                <span className="font-mono text-sm font-black text-amber-300 tabular-nums">🏆 {r.trophies.toLocaleString('ar-EG')}</span>
              </div>
            );
          })}
        </div>
      )}

      <p className="flex items-center justify-center gap-1.5 text-center text-[10px] text-slate-600 px-4">
        <ChevronLeft className="h-3 w-3" /> الترتيب حسب كؤوس التقييم من المباريات الحقيقية المسجّلة
      </p>
    </div>
  );
};
