import React, { useState } from 'react';
import { Users, Share2, Copy, Check, Star, Gift, Trophy, Sparkles } from 'lucide-react';
import { UserProfile } from '../types';
import { sound } from '../audio/soundEngine';

interface ReferralHubProps {
  user: UserProfile;
  onClaimCommission: () => void;
}

export const ReferralHub: React.FC<ReferralHubProps> = ({ user, onClaimCommission }) => {
  const [copied, setCopied] = useState(false);

  // Generate bot referral deep-link
  const botUsername = 'StarVaultBot'; // default Telegram Bot username
  const refLink = `https://t.me/${botUsername}/app?startapp=${user.refCode || user.id}`;

  const copyToClipboard = () => {
    sound.playClick();
    navigator.clipboard.writeText(refLink).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const shareOnTelegram = () => {
    sound.playClick();
    const shareText = encodeURIComponent('🚀 افتح خزائن النجوم واربح حتى 1,000 نجمة تيليجرام فورياً! سجل عبر رابطي واحصل على لفة مجانية:');
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${shareText}`;
    window.open(shareUrl, '_blank');
  };

  return (
    <div className="space-y-4 select-none" dir="rtl">
      {/* Referral Hero Card */}
      <div className="card bg-gradient-to-r from-purple-900/30 via-slate-900 to-indigo-950/40 border border-purple-500/40 p-5 rounded-2xl shadow-xl space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
            <Users size={20} />
          </div>
          <div>
            <span className="badge badge-primary badge-xs font-mono font-bold">VIRAL AFFILIATE 20%</span>
            <h2 className="text-base font-black text-slate-100">برنامج الشركاء وإحالة الأصدقاء</h2>
          </div>
        </div>

        <p className="text-xs text-slate-300/80 leading-relaxed">
          شارك رابطك الخاص مع أصدقائك أو في قنوات تيليجرام. ستحصل على <strong className="text-amber-400 font-bold">20% عمولة فورية من كل نجمة تيليجرام</strong> ينفقها أصدقاؤك في فتح الخزائن!
        </p>

        {/* Stats Strip */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-center">
            <div className="text-[10px] text-slate-400 font-mono">الأصدقاء النشطون</div>
            <div className="text-xl font-black text-slate-100 font-mono mt-0.5">
              {user.referralsCount} <small className="text-xs text-slate-500">صديق</small>
            </div>
          </div>
          <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-center">
            <div className="text-[10px] text-slate-400 font-mono">أرباح النجوم المكتسبة</div>
            <div className="text-xl font-black text-amber-400 font-mono mt-0.5">
              🌟 {user.referralStarsEarned}
            </div>
          </div>
        </div>
      </div>

      {/* Share / Copy Box */}
      <div className="card bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-3">
        <div className="text-xs font-bold text-slate-200">رابط الدعوة الخاص بك:</div>

        <div className="flex items-center gap-2 bg-slate-950 p-2.5 rounded-xl border border-slate-800" dir="ltr">
          <input 
            type="text" 
            readOnly 
            value={refLink} 
            className="bg-transparent border-0 text-xs font-mono text-slate-300 flex-1 outline-none truncate"
          />
          <button 
            className="btn btn-ghost btn-xs text-amber-400 gap-1"
            onClick={copyToClipboard}
          >
            {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            <span className="text-[10px]">{copied ? 'تم النسخ!' : 'نسخ'}</span>
          </button>
        </div>

        <button 
          className="btn btn-primary w-full gap-2 text-xs font-bold shadow-lg shadow-primary/25"
          onClick={shareOnTelegram}
        >
          <Share2 size={16} />
          <span>مشاركة الرابط مباشرة في محادثات تيليجرام</span>
        </button>
      </div>

      {/* Milestone Rewards */}
      <div className="card bg-slate-900/80 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-2.5">
        <div className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
          <Trophy size={15} className="text-amber-400" />
          <span>مكافآت الإنجاز وتوسيع الشبكة:</span>
        </div>

        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-base">🥉</span>
              <span>ادعُ 3 أصدقاء</span>
            </div>
            <span className="badge badge-warning badge-xs font-bold">مفتاح ذهبي 🗝️</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-base">🥈</span>
              <span>ادعُ 10 أصدقاء</span>
            </div>
            <span className="badge badge-success badge-xs font-bold">عضوية VIP + 50 نجمة</span>
          </div>

          <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950 border border-slate-800/80">
            <div className="flex items-center gap-2">
              <span className="text-base">🥇</span>
              <span>ادعُ 25 صديقاً</span>
            </div>
            <span className="badge badge-error badge-xs font-bold">صندوق الماس الأسود الأسطوري</span>
          </div>
        </div>
      </div>
    </div>
  );
};
