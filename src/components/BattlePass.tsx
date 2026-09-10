import React, { useState } from 'react';
import { Crown, Lock, Check, Sparkles, Loader2 } from 'lucide-react';
import { UserProfile } from '../types';
import {
  BATTLE_PASS, BpReward, levelForXp, normalizeBattlePass,
  rewardItem, rewardLabelAr, rewardTitleAr
} from '../data/battlePass';
import { ledger, LedgerError } from '../services/ledger';
import { sound } from '../audio/soundEngine';

interface BattlePassProps {
  user: UserProfile;
  onUserChange: (next: UserProfile) => void;
  onOpenShop: () => void;
}

export const BattlePass: React.FC<BattlePassProps> = ({ user, onUserChange, onOpenShop }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  const bp = normalizeBattlePass(user.battlePass);
  const level = levelForXp(bp.xp);
  const maxed = level >= BATTLE_PASS.maxLevel;
  const progress = maxed ? 1 : (bp.xp % BATTLE_PASS.xpPerLevel) / BATTLE_PASS.xpPerLevel;

  const notify = (text: string, tone: 'ok' | 'err') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  // Apply a reward's soft value (dust / item) to a copy of the profile.
  // Star rewards are handled by the caller through the server ledger.
  function applyReward(reward: BpReward | null, base: UserProfile): UserProfile {
    if (!reward) return base;
    const next = { ...base };
    if (reward.kind === 'dust') next.starDust = base.starDust + reward.amount;
    else if (reward.kind === 'item') {
      const it = rewardItem(reward);
      if (it) next.inventory = [...base.inventory, { ...it }];
    }
    return next;
  }

  function markClaimed(base: UserProfile, track: 'free' | 'premium', lvl: number): UserProfile {
    const b = normalizeBattlePass(base.battlePass);
    const key = track === 'free' ? 'claimedFree' : 'claimedPremium';
    return { ...base, battlePass: { ...b, [key]: [...b[key], lvl] } };
  }

  async function claimFree(lvl: number) {
    const reward = BATTLE_PASS.levels[lvl - 1].free;
    if (!reward || bp.claimedFree.includes(lvl) || lvl > level || busy) return;
    sound.playClick();
    let next = applyReward(reward, user);
    next = markClaimed(next, 'free', lvl);
    onUserChange(next);
    notify('تم استلام المكافأة المجانية', 'ok');
  }

  async function claimPremium(lvl: number) {
    const reward = BATTLE_PASS.levels[lvl - 1].premium;
    if (!reward || !bp.premium || bp.claimedPremium.includes(lvl) || lvl > level || busy) return;
    setBusy(`p${lvl}`);
    try {
      let next = applyReward(reward, user);
      if (reward.kind === 'stars') {
        if (ledger.available) {
          const g = await ledger.grant(`${user.id}:bp:${BATTLE_PASS.season}:${lvl}`, user.id, reward.amount);
          next = { ...next, stars: g.balance };
        } else {
          next = { ...next, stars: user.stars + reward.amount };
        }
      }
      next = markClaimed(next, 'premium', lvl);
      onUserChange(next);
      sound.playStarCoin();
      notify('تم استلام مكافأة الممر المميز', 'ok');
    } catch (e) {
      notify((e as LedgerError).message || 'تعذر استلام المكافأة', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function buyPremium() {
    if (busy || bp.premium) return;
    setBusy('buy');
    try {
      if (ledger.available) {
        try {
          const r = await ledger.purchase(
            `${user.id}:bp:${BATTLE_PASS.season}`, user.id, 'battle_pass', BATTLE_PASS.premiumPriceStars
          );
          onUserChange({ ...user, stars: r.balance, battlePass: { ...bp, premium: true } });
        } catch (e) {
          if ((e as LedgerError).code === 'insufficient') { onOpenShop(); return; }
          throw e;
        }
      } else {
        if (user.stars < BATTLE_PASS.premiumPriceStars) { onOpenShop(); return; }
        onUserChange({
          ...user,
          stars: user.stars - BATTLE_PASS.premiumPriceStars,
          battlePass: { ...bp, premium: true }
        });
      }
      sound.playStarCoin();
      notify('تم تفعيل الممر المميز — استمتع بالغنائم!', 'ok');
    } catch (e) {
      notify((e as LedgerError).message || 'تعذر شراء الممر', 'err');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-4 pb-24 text-right" dir="rtl">
      {/* ===== Season hero ===== */}
      <header className="relative overflow-hidden rounded-[26px] border border-white/10 bg-gradient-to-br from-[#1a1030] via-[#0d0a1a] to-[#0d1726] p-5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_-10%,rgba(168,85,247,.28),transparent_45%),radial-gradient(circle_at_100%_120%,rgba(34,211,238,.16),transparent_40%)]" />
        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-tr from-violet-500/30 to-fuchsia-400/20 border border-white/15">
              <Crown className="w-4.5 h-4.5 text-amber-300" />
            </span>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.3em] text-violet-300/90">Battle Pass</p>
              <h1 className="text-lg font-black text-white leading-tight">{BATTLE_PASS.nameAr}</h1>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-slate-300/80">{BATTLE_PASS.taglineAr}</p>

          {/* Progress */}
          <div className="mt-4 flex items-center gap-3">
            <div className="grid place-items-center w-16 h-16 rounded-2xl bg-black/30 border border-white/10">
              <span className="text-2xl font-black text-white leading-none">{level}</span>
              <span className="text-[8px] text-slate-400">المستوى</span>
            </div>
            <div className="flex-1">
              <div className="flex justify-between text-[10px] font-bold mb-1">
                <span className="text-slate-300">{maxed ? 'أكملت الموسم 🎉' : `المستوى التالي: ${level + 1}`}</span>
                <span className="text-slate-500 font-mono">{bp.xp} / {BATTLE_PASS.maxLevel * BATTLE_PASS.xpPerLevel} XP</span>
              </div>
              <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-l from-violet-400 to-cyan-300 transition-all duration-300"
                  style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* ===== Premium unlock ===== */}
      {!bp.premium ? (
        <div className="relative overflow-hidden rounded-[22px] border border-amber-300/25 bg-gradient-to-br from-amber-400/[0.07] to-transparent p-4">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(251,191,36,.14),transparent_50%)]" />
          <div className="relative flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-black text-amber-200">الممر المميز</h2>
              <ul className="mt-1.5 space-y-1 text-[10px] text-slate-300/90">
                <li>⭐ 135 نجمة تيليجرام تُسترد عبر المستويات</li>
                <li>💎 أكثر من 2,400 غبار نجمي إضافي</li>
                <li>🎁 عتاد أسطوري حصري بمسار مضاعف</li>
              </ul>
            </div>
            <button
              onClick={buyPremium}
              disabled={busy !== null}
              className="shrink-0 flex flex-col items-center gap-0.5 rounded-2xl bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 px-4 py-3 font-black text-sm shadow-lg shadow-amber-500/25 active:scale-95 transition-transform disabled:opacity-60"
            >
              {busy === 'buy' ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                <>
                  <span>تفعيل</span>
                  <span className="text-[10px] font-mono">99 ⭐</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-[18px] border border-violet-300/20 bg-violet-400/[0.07] px-4 py-2.5">
          <Crown className="w-4 h-4 text-amber-300" />
          <span className="text-xs font-black text-violet-200">الممر المميز مفعّل — استلم مكافآتك الحصرية</span>
        </div>
      )}

      {/* ===== Level list ===== */}
      <div className="space-y-2">
        {BATTLE_PASS.levels.map((l) => {
          const reached = l.level <= level;
          const freeClaimed = bp.claimedFree.includes(l.level);
          const premClaimed = bp.claimedPremium.includes(l.level);
          const isMilestone = l.level % 5 === 0;
          return (
            <div key={l.level}
              className={`relative flex items-center gap-2 rounded-2xl border p-2.5 ${reached ? 'border-white/10 bg-white/[0.04]' : 'border-white/[0.04] bg-black/20 opacity-60'}`}>
              {isMilestone && (
                <span className="absolute -top-1.5 right-3 px-1.5 rounded-md bg-amber-400/90 text-[8px] font-black text-slate-950">محطة</span>
              )}

              {/* Level number */}
              <div className={`grid place-items-center w-9 h-9 shrink-0 rounded-xl border font-black text-sm ${reached ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200' : 'border-white/10 bg-white/5 text-slate-500'}`}>
                {l.level}
              </div>

              {/* Free track */}
              <button
                onClick={() => claimFree(l.level)}
                disabled={!reached || freeClaimed || busy !== null}
                className={`flex-1 flex items-center justify-between gap-1.5 rounded-xl border px-2.5 py-1.5 text-right transition ${freeClaimed ? 'border-emerald-300/30 bg-emerald-400/10' : reached ? 'border-white/10 bg-white/[0.03] active:scale-[.98]' : 'border-white/5 bg-transparent'} disabled:cursor-default`}
              >
                <span className="min-w-0">
                  <span className={`block text-[9px] font-bold ${freeClaimed ? 'text-emerald-300' : 'text-slate-400'}`}>مجاني</span>
                  <span className="block text-[11px] font-black text-white truncate" title={rewardTitleAr(l.free)}>{rewardLabelAr(l.free)} {rewardItem(l.free)?.nameAr}</span>
                </span>
                {freeClaimed ? <Check className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  : reached && l.free ? <span className="text-[9px] font-black text-cyan-300 shrink-0">استلم</span>
                  : <Lock className="w-3 h-3 text-slate-600 shrink-0" />}
              </button>

              {/* Premium track */}
              <button
                onClick={() => claimPremium(l.level)}
                disabled={!reached || !bp.premium || premClaimed || busy !== null}
                className={`flex-1 flex items-center justify-between gap-1.5 rounded-xl border px-2.5 py-1.5 text-right transition ${premClaimed ? 'border-amber-300/30 bg-amber-400/10' : bp.premium && reached ? 'border-amber-300/25 bg-amber-400/[0.06] active:scale-[.98]' : 'border-white/5 bg-transparent'} disabled:cursor-default`}
              >
                <span className="min-w-0">
                  <span className={`block text-[9px] font-bold ${premClaimed ? 'text-amber-300' : 'text-amber-200/70'}`}>مميز</span>
                  <span className="block text-[11px] font-black text-white truncate" title={rewardTitleAr(l.premium)}>{rewardLabelAr(l.premium)} {rewardItem(l.premium)?.nameAr}</span>
                </span>
                {busy === `p${l.level}` ? <Loader2 className="w-3.5 h-3.5 text-amber-300 animate-spin shrink-0" />
                  : premClaimed ? <Check className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  : !bp.premium ? <Lock className="w-3 h-3 text-slate-600 shrink-0" />
                  : reached && l.premium ? <span className="text-[9px] font-black text-amber-300 shrink-0">استلم</span>
                  : <Lock className="w-3 h-3 text-slate-600 shrink-0" />}
              </button>
            </div>
          );
        })}
      </div>

      <p className="flex items-center justify-center gap-1 text-[10px] text-slate-600 text-center">
        <Sparkles className="w-3 h-3 text-amber-300" />
        كل مباراة تكسبك خبرة تُرفع مستواك في الممر
      </p>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-20 inset-x-0 z-50 flex justify-center px-6 pointer-events-none`}>
          <div className={`px-4 py-2 rounded-xl text-xs font-black shadow-xl ${toast.tone === 'ok' ? 'bg-emerald-500/95 text-emerald-950' : 'bg-red-500/95 text-red-50'}`}>
            {toast.text}
          </div>
        </div>
      )}
    </section>
  );
};
