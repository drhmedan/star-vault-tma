import React from 'react';
import { Sparkles, Clock, Star, Flame, Eye, Lock, Unlock, ChevronLeft } from 'lucide-react';
import { VaultCase } from '../types';
import { VAULT_CASES } from '../data/vaultsData';
import { sound } from '../audio/soundEngine';

interface VaultsGridProps {
  userStars: number;
  lastFreeCaseTime: number;
  onSelectCase: (c: VaultCase) => void;
  onOpenShop: () => void;
}

export const VaultsGrid: React.FC<VaultsGridProps> = ({
  userStars,
  lastFreeCaseTime,
  onSelectCase,
  onOpenShop
}) => {
  const freeCooldownMs = 8 * 60 * 60 * 1000;
  const now = Date.now();
  const timeSinceFree = now - lastFreeCaseTime;
  const isFreeAvailable = timeSinceFree >= freeCooldownMs;
  const timeLeftMinutes = Math.max(0, Math.ceil((freeCooldownMs - timeSinceFree) / (60 * 1000)));

  return (
    <div className="space-y-5 select-none" dir="rtl">
      {/* High-Roller Promotional Banner */}
      <div className="card bg-gradient-to-r from-amber-600/30 via-slate-900 to-amber-950/40 border border-amber-500/40 p-4 rounded-2xl shadow-xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none"></div>
        <div className="flex justify-between items-center relative z-10">
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <span className="badge badge-warning badge-xs font-mono font-bold">JACKPOT DROP</span>
              <span className="text-[10px] text-amber-300 font-mono">1,000 TELEGRAM STARS</span>
            </div>
            <h2 className="text-base font-black text-white">خزائن النجوم والعتاد السيبراني</h2>
            <p className="text-xs text-slate-300/80 mt-0.5">
              افتح الصناديق فورياً بـ 🌟 نجوم تيليجرام أو نافس في معارك 1v1!
            </p>
          </div>
          <button 
            className="btn btn-warning btn-sm gap-1 text-xs font-black shadow-lg shadow-amber-500/25"
            onClick={() => onSelectCase(VAULT_CASES[2])} // Gold Sovereign
          >
            <span>افتح الذهبي</span>
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>

      {/* Grid of Vault Cases */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {VAULT_CASES.map(c => {
          const isFree = c.isDailyFree;
          const canAfford = isFree ? isFreeAvailable : userStars >= c.starsPrice;

          return (
            <div 
              key={c.id}
              className="card bg-slate-900/90 border border-slate-800 hover:border-amber-500/40 rounded-2xl p-4 shadow-xl transition-all relative overflow-hidden group flex flex-col justify-between"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-amber-500/5 to-transparent rounded-full pointer-events-none"></div>

              {/* Top Tag & Price Badge */}
              <div>
                <div className="flex justify-between items-start mb-3">
                  <span className="badge bg-slate-800 text-slate-300 text-[10px] font-mono border-0">
                    {c.tagAr}
                  </span>
                  <span 
                    className={`badge text-xs font-mono font-bold ${
                      isFree 
                        ? 'badge-success text-slate-950 font-black' 
                        : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                    }`}
                  >
                    {isFree ? (isFreeAvailable ? 'جاهز مجانًا' : `بعد ${Math.floor(timeLeftMinutes / 60)} س`) : `🌟 ${c.starsPrice} نجمة`}
                  </span>
                </div>

                {/* Case 3D Visual Representation */}
                <div className="flex flex-col items-center text-center my-3">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700/80 border border-slate-700 flex items-center justify-center text-4xl shadow-inner group-hover:scale-105 transition-transform duration-200">
                    {isFree ? '🎁' : c.id === 'cyber_silver' ? '📦' : c.id === 'gold_sovereign' ? '🪙' : '💎'}
                  </div>
                  <h3 className="text-sm font-black text-slate-100 mt-2.5">{c.nameAr}</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                    {c.descriptionAr}
                  </p>
                </div>

                {/* Top Loot Highlights Carousel */}
                <div className="bg-slate-950/70 p-2 rounded-xl border border-slate-800/80 my-2">
                  <div className="text-[10px] text-slate-400 font-mono mb-1 text-right">أبرز المحتويات والجوائز:</div>
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                    {c.items.slice(0, 5).map(item => (
                      <div 
                        key={item.id}
                        className="w-8 h-8 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-base shrink-0"
                        title={`${item.nameAr} (${item.rarity})`}
                      >
                        {item.icon}
                      </div>
                    ))}
                    {c.items.length > 5 && (
                      <div className="text-[9px] font-mono text-slate-500 pl-1">
                        +{c.items.length - 5}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-2">
                {isFree ? (
                  <button 
                    className={`btn btn-sm w-full font-black text-xs gap-1.5 ${
                      isFreeAvailable 
                        ? 'btn-success text-slate-950 shadow-lg shadow-success/20 animate-pulse' 
                        : 'btn-disabled opacity-50'
                    }`}
                    onClick={() => {
                      sound.playClick();
                      onSelectCase(c);
                    }}
                    disabled={!isFreeAvailable}
                  >
                    <Unlock size={14} />
                    <span>{isFreeAvailable ? 'فتح مجاني الآن' : `متبقي ${timeLeftMinutes} دقيقة`}</span>
                  </button>
                ) : (
                  <button 
                    className={`btn btn-sm w-full font-black text-xs gap-1.5 ${
                      canAfford 
                        ? 'btn-warning shadow-lg shadow-amber-500/20' 
                        : 'btn-outline border-amber-500/50 text-amber-400 hover:bg-amber-500/20'
                    }`}
                    onClick={() => {
                      sound.playClick();
                      if (canAfford) {
                        onSelectCase(c);
                      } else {
                        onOpenShop();
                      }
                    }}
                  >
                    <Star size={14} className="fill-amber-400" />
                    <span>{canAfford ? `افتح بـ ${c.starsPrice} نجمة` : `اشحن نجوم (${c.starsPrice})`}</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
