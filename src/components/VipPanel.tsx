import React, { useState } from 'react';
import { Crown, Gem, Loader2, Star, Zap } from 'lucide-react';
import { UserProfile } from '../types';
import { ledger, LedgerError } from '../services/ledger';
import { sound } from '../audio/soundEngine';

interface VipPanelProps {
  user: UserProfile;
  onUserChange: (next: UserProfile) => void;
}

const VIP_PRICE_STARS = 199;
const VIP_DAILY_STARS = 15;

const todayISO = () => new Date().toISOString().slice(0, 10);

export const VipPanel: React.FC<VipPanelProps> = ({ user, onUserChange }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  const isVip = user.isVip === true;
  const claimedToday = user.lastVipClaim === todayISO();

  const notify = (text: string, tone: 'ok' | 'err') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  async function subscribe() {
    if (busy || isVip) return;
    setBusy('buy');
    try {
      if (ledger.available) {
        try {
          const r = await ledger.purchase(`${user.id}:vip`, user.id, 'vip_subscription', VIP_PRICE_STARS, true);
          onUserChange({ ...user, stars: r.balance, isVip: true });
        } catch (e) {
          if ((e as LedgerError).code === 'insufficient') { notify('رصيد النجوم غير كافٍ — اشترِ نجومًا أولًا', 'err'); return; }
          throw e;
        }
      } else {
        if (user.stars < VIP_PRICE_STARS) { notify('رصيد النجوم غير كافٍ — اشترِ نجومًا أولًا', 'err'); return; }
        onUserChange({ ...user, stars: user.stars - VIP_PRICE_STARS, isVip: true });
      }
      sound.playStarCoin();
      notify('مرحبًا بك في نادي VIP!', 'ok');
    } catch (e) {
      notify((e as LedgerError).message || 'تعذر الاشتراك', 'err');
    } finally {
      setBusy(null);
    }
  }

  async function claimDaily() {
    if (!isVip || claimedToday || busy) return;
    setBusy('claim');
    try {
      if (ledger.available) {
        try {
          const g = await ledger.grant(`${user.id}:vip:${todayISO()}`, user.id, VIP_DAILY_STARS, true);
          onUserChange({ ...user, stars: g.balance, lastVipClaim: todayISO() });
        } catch (e) {
          notify((e as LedgerError).message || 'تعذر استلام المكافأة', 'err');
          return;
        }
      } else {
        onUserChange({ ...user, stars: user.stars + VIP_DAILY_STARS, lastVipClaim: todayISO() });
      }
      sound.playStarCoin();
      notify(`استلمت ${VIP_DAILY_STARS} نجمة يومية!`, 'ok');
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="relative overflow-hidden rounded-[24px] border p-4 text-right" dir="rtl"
      style={{ borderColor: isVip ? 'rgba(251,191,36,.4)' : 'rgba(251,191,36,.22)' }}>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_100%_0%,rgba(251,191,36,.16),transparent_45%),radial-gradient(circle_at_0%_100%,rgba(168,85,247,.12),transparent_40%)]" />

      <div className="relative">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-400/30 to-yellow-300/15 border border-amber-300/30">
            <Crown className="w-5 h-5 text-amber-300" />
          </span>
          <div>
            <p className="text-[9px] font-black uppercase tracking-[.3em] text-amber-300/90">VIP Club</p>
            <h3 className="text-base font-black text-white leading-tight">نادي VIP الذهبي</h3>
          </div>
          {isVip && (
            <span className="mr-auto px-2 py-1 rounded-lg bg-amber-400/15 border border-amber-300/40 text-[10px] font-black text-amber-200">عضو فعّال</span>
          )}
        </div>

        {!isVip ? (
          <>
            <ul className="mt-3 space-y-1.5">
              <li className="flex items-center gap-2 text-[11px] text-slate-200"><Star className="w-3.5 h-3.5 text-amber-300" /> {VIP_DAILY_STARS} نجمة يومية مجانية مدى الحياة</li>
              <li className="flex items-center gap-2 text-[11px] text-slate-200"><Gem className="w-3.5 h-3.5 text-violet-300" /> شارة VIP ذهبية مميزة في ملفك</li>
              <li className="flex items-center gap-2 text-[11px] text-slate-200"><Zap className="w-3.5 h-3.5 text-cyan-300" /> أولوية في طوابير المباريات</li>
            </ul>
            <button onClick={subscribe} disabled={busy !== null}
              className="mt-3 w-full py-3 rounded-xl bg-gradient-to-l from-amber-300 to-amber-500 text-slate-950 font-black text-sm shadow-lg shadow-amber-500/25 active:scale-[.98] transition-transform disabled:opacity-60">
              {busy === 'buy' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : `اشترك VIP — ${VIP_PRICE_STARS} ⭐`}
            </button>
          </>
        ) : (
          <button onClick={claimDaily} disabled={claimedToday || busy !== null}
            className={`mt-3 w-full py-3 rounded-xl font-black text-sm transition-all active:scale-[.98] disabled:opacity-60 ${claimedToday ? 'bg-slate-800/80 text-slate-400 border border-white/10' : 'bg-gradient-to-l from-amber-300 to-amber-500 text-slate-950 shadow-lg shadow-amber-500/25'}`}>
            {busy === 'claim' ? <Loader2 className="w-4 h-4 animate-spin mx-auto" />
              : claimedToday ? '✓ استلمت مكافأتك اليوم — عُد غدًا'
              : `استلم ${VIP_DAILY_STARS} ⭐ اليوم`}
          </button>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-20 inset-x-0 z-50 flex justify-center px-6 pointer-events-none">
          <div className={`px-4 py-2 rounded-xl text-xs font-black shadow-xl ${toast.tone === 'ok' ? 'bg-emerald-500/95 text-emerald-950' : 'bg-red-500/95 text-red-50'}`}>
            {toast.text}
          </div>
        </div>
      )}
    </section>
  );
};
