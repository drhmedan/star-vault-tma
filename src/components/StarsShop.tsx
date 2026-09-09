import React, { useState } from 'react';
import { Star, Zap, ShieldCheck, Check, Sparkles, Bot, Crown, ArrowLeft } from 'lucide-react';
import confetti from 'canvas-confetti';
import { StarPackage } from '../types';
import { STAR_PACKAGES } from '../data/vaultsData';
import { sound } from '../audio/soundEngine';

interface StarsShopProps {
  onStarsPurchased: (amount: number) => void;
  onActivateAutoMiner: () => void;
  autoMinerActive: boolean;
  onClose: () => void;
}

export const StarsShop: React.FC<StarsShopProps> = ({
  onStarsPurchased,
  onActivateAutoMiner,
  autoMinerActive,
  onClose
}) => {
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const buyPackage = (pkg: StarPackage) => {
    setLoadingId(pkg.id);
    sound.playClick();

    // Check if running inside Telegram Mini App
    const tg = (window as any).Telegram?.WebApp;
    if (tg && tg.openInvoice) {
      // Live Telegram Stars Invoice flow:
      // In production, fetch invoiceLink from /api/create-invoice?packageId=pkg.id
      // Then call tg.openInvoice(invoiceLink, (status) => { ... })
      setTimeout(() => {
        setLoadingId(null);
        const total = pkg.starsAmount + pkg.bonusStars;
        sound.playStarCoin();
        confetti({ particleCount: 70, spread: 60 });
        onStarsPurchased(total);
      }, 1000);
    } else {
      // Test / Web Fallback: Instant instant grant
      setTimeout(() => {
        setLoadingId(null);
        const total = pkg.starsAmount + pkg.bonusStars;
        sound.playStarCoin();
        confetti({ particleCount: 70, spread: 60 });
        onStarsPurchased(total);
      }, 800);
    }
  };

  return (
    <div className="space-y-4 select-none" dir="rtl">
      {/* Header Banner */}
      <div className="card bg-gradient-to-r from-amber-600/25 via-slate-900 to-yellow-600/20 border border-amber-500/40 p-4 rounded-2xl shadow-xl flex justify-between items-center">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Star size={16} className="text-amber-400 fill-amber-400 animate-spin" />
            <span className="text-xs font-mono font-bold text-amber-300">TELEGRAM STARS OFFICIAL GATEWAY</span>
          </div>
          <h2 className="text-base font-black text-slate-100">متجر نجوم تيليجرام الرسمي</h2>
          <p className="text-xs text-slate-300/80 mt-0.5">
            دفع فوري بنقرة واحدة عبر Apple Pay أو Google Pay أو البطاقات داخل تيليجرام.
          </p>
        </div>
        <button className="btn btn-ghost btn-circle btn-sm text-slate-400" onClick={onClose}>
          ✕
        </button>
      </div>

      {/* Telegram Star Packages Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        {STAR_PACKAGES.map(pkg => (
          <div 
            key={pkg.id}
            className={`card bg-slate-900 border p-4 rounded-2xl shadow-xl transition-all relative overflow-hidden flex flex-col justify-between ${
              pkg.popular 
                ? 'border-amber-400/80 bg-gradient-to-b from-amber-500/10 to-slate-900 shadow-[0_0_15px_rgba(251,191,36,0.15)]' 
                : 'border-slate-800'
            }`}
          >
            {pkg.badgeAr && (
              <span className="badge badge-warning badge-xs font-mono font-black absolute top-3 left-3">
                {pkg.badgeAr}
              </span>
            )}

            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">🌟</span>
                <div>
                  <div className="text-lg font-black text-slate-100 font-mono">
                    {pkg.starsAmount} <span className="text-xs text-amber-400 font-bold">نجمة</span>
                  </div>
                  {pkg.bonusStars > 0 && (
                    <div className="text-[10px] text-emerald-400 font-mono font-bold">
                      +{pkg.bonusStars} نجوم مجانية إضافية!
                    </div>
                  )}
                </div>
              </div>
              <div className="text-xs text-slate-400 mt-2 font-bold">{pkg.titleAr}</div>
            </div>

            <div className="pt-4">
              <button 
                className="btn btn-warning btn-sm w-full font-black text-xs gap-1.5 shadow-lg shadow-amber-500/20 active:scale-95"
                onClick={() => buyPackage(pkg)}
                disabled={loadingId === pkg.id}
              >
                {loadingId === pkg.id ? (
                  <span className="loading loading-spinner loading-xs"></span>
                ) : (
                  <>
                    <Star size={14} className="fill-slate-950" />
                    <span>شراء مقابل ${pkg.priceUsd}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Auto-Miner Bot Upgrade Card (Massive Retention Booster) */}
      <div className="card bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-2xl shrink-0">
            🤖
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-black text-slate-100">روبوت التعدين السيبراني التلقائي</h3>
              <span className="badge badge-primary badge-xs">24/7 AUTO</span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              يجمع Star Dust ويفتح الصناديق المجانية تلقائياً على مدار الساعة حتى أثناء إغلاق اللعبة لمدة 7 أيام!
            </p>
          </div>
        </div>

        <button 
          className={`btn btn-sm shrink-0 font-bold text-xs gap-1.5 ${
            autoMinerActive 
              ? 'btn-success text-slate-950 font-black' 
              : 'btn-outline border-purple-500 text-purple-400 hover:bg-purple-500/20'
          }`}
          onClick={onActivateAutoMiner}
          disabled={autoMinerActive}
        >
          {autoMinerActive ? <Check size={14} /> : <Zap size={14} />}
          <span>{autoMinerActive ? 'الروبوت نشط يعمل 24/7' : 'تفعيل بـ 100 نجمة 🌟'}</span>
        </button>
      </div>
    </div>
  );
};
