import React, { useEffect, useRef, useState } from 'react';
import { X, Sparkles, RefreshCw, Check, ArrowRight, Star, Shield } from 'lucide-react';
import confetti from 'canvas-confetti';
import { VaultCase, VaultItem } from '../types';
import { sound } from '../audio/soundEngine';

interface CaseUnboxingModalProps {
  vaultCase: VaultCase;
  onClose: () => void;
  onKeepItem: (item: VaultItem) => void;
  onSellItem: (item: VaultItem) => void;
  onReopen: () => void;
  canReopen: boolean;
}

export const CaseUnboxingModal: React.FC<CaseUnboxingModalProps> = ({
  vaultCase,
  onClose,
  onKeepItem,
  onSellItem,
  onReopen,
  canReopen
}) => {
  const [strip, setStrip] = useState<VaultItem[]>([]);
  const [winningItem, setWinningItem] = useState<VaultItem | null>(null);
  const [rolling, setRolling] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [translateX, setTranslateX] = useState(0);

  const stripRef = useRef<HTMLDivElement>(null);
  const itemWidth = 110; // width of each card + margin in px
  const targetIndex = 38; // winning item index in strip

  // Initialize randomized unboxing reel
  const startRoll = () => {
    // 1. Pick winning item with weighted probability
    const items = vaultCase.items;
    let selected: VaultItem;

    const roll = Math.random();
    if (roll < 0.03 && items.some(i => i.rarity === 'mythic')) {
      selected = items.find(i => i.rarity === 'mythic')!;
    } else if (roll < 0.12 && items.some(i => i.rarity === 'legendary')) {
      selected = items.find(i => i.rarity === 'legendary')!;
    } else if (roll < 0.32 && items.some(i => i.rarity === 'epic')) {
      selected = items.find(i => i.rarity === 'epic')!;
    } else if (roll < 0.65 && items.some(i => i.rarity === 'rare')) {
      selected = items.find(i => i.rarity === 'rare')!;
    } else {
      selected = items.find(i => i.rarity === 'common') || items[0];
    }

    // 2. Generate 50 items strip
    const newStrip: VaultItem[] = [];
    for (let i = 0; i < 50; i++) {
      if (i === targetIndex) {
        newStrip.push(selected);
      } else {
        const randomItem = items[Math.floor(Math.random() * items.length)];
        newStrip.push(randomItem);
      }
    }

    setStrip(newStrip);
    setWinningItem(selected);
    setRolling(true);
    setRevealed(false);
    setTranslateX(0);

    sound.playVaultOpen();

    // 3. Trigger CSS Animation after short render tick
    setTimeout(() => {
      // Calculate precise offset so targetIndex is centered under the pointer needle
      const containerWidth = stripRef.current?.parentElement?.clientWidth || 360;
      const jitter = (Math.random() - 0.5) * (itemWidth * 0.65); // natural random offset
      const finalTranslate = -(targetIndex * itemWidth) + (containerWidth / 2) - (itemWidth / 2) + jitter;
      setTranslateX(finalTranslate);

      // Sound ticks during rotation
      let tickCount = 0;
      const tickInterval = setInterval(() => {
        tickCount++;
        sound.playTick();
        if (tickCount > 35) clearInterval(tickInterval);
      }, 120);

      // Deceleration finish after 4.8 seconds
      setTimeout(() => {
        clearInterval(tickInterval);
        setRolling(false);
        setRevealed(true);
        sound.playReveal(selected.rarity);

        if (selected.rarity === 'legendary' || selected.rarity === 'mythic') {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 }
          });
        }
      }, 4900);
    }, 100);
  };

  useEffect(() => {
    startRoll();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md select-none" dir="rtl">
      <div className="card bg-slate-900 border border-slate-700/80 shadow-2xl max-w-lg w-full overflow-hidden relative">
        {/* Header Bar */}
        <div className="px-5 py-3 border-b border-slate-800 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <span className="text-xl">📦</span>
            <div>
              <h3 className="text-sm font-black text-slate-100">{vaultCase.nameAr}</h3>
              <span className="text-[10px] text-amber-400 font-mono">{vaultCase.badge}</span>
            </div>
          </div>
          <button 
            className="btn btn-ghost btn-circle btn-xs text-slate-400 hover:text-white"
            onClick={onClose}
            disabled={rolling}
          >
            <X size={16} />
          </button>
        </div>

        {/* The CS:GO Horizontal Carousel Window */}
        <div className="relative w-full h-44 bg-slate-950 overflow-hidden flex items-center border-y border-amber-500/20 shadow-inner">
          {/* Top & Bottom Center Selector Needles */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-5 bg-amber-400 z-30 [clip-path:polygon(50%_100%,0_0,100%_0)] shadow-[0_0_12px_#fbbf24]"></div>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-5 bg-amber-400 z-30 [clip-path:polygon(50%_0,0_100%,100%_100%)] shadow-[0_0_12px_#fbbf24]"></div>
          <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-amber-400/80 z-20 shadow-[0_0_8px_#fbbf24]"></div>

          {/* Left & Right Shadow Fade Masks */}
          <div className="absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-slate-950 to-transparent z-10 pointer-events-none"></div>
          <div className="absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-slate-950 to-transparent z-10 pointer-events-none"></div>

          {/* Scrolling Strip Container */}
          <div 
            ref={stripRef}
            className="flex items-center absolute left-0 transition-transform duration-[4800ms] will-change-transform"
            style={{
              transform: `translate3d(${translateX}px, 0, 0)`,
              transitionTimingFunction: 'cubic-bezier(0.12, 0.8, 0.15, 1.0)'
            }}
          >
            {strip.map((item, idx) => {
              const isWinner = revealed && idx === targetIndex;
              return (
                <div 
                  key={idx}
                  className={`w-[100px] h-[130px] mx-[5px] rounded-xl flex flex-col items-center justify-center p-2 shrink-0 border transition-all ${
                    isWinner 
                      ? 'border-amber-400 bg-amber-500/20 scale-105 shadow-[0_0_20px_#fbbf24]' 
                      : 'border-slate-800 bg-slate-900/80 opacity-80'
                  }`}
                >
                  <div className="text-3xl mb-1">{item.icon}</div>
                  <div className="text-[10px] font-bold text-slate-200 text-center truncate w-full">
                    {item.nameAr}
                  </div>
                  <div className={`text-[9px] font-mono font-bold mt-1 uppercase ${item.color}`}>
                    {item.rarity}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Winning Item Reveal Card & Actions */}
        {revealed && winningItem && (
          <div className="p-5 bg-gradient-to-b from-slate-900 to-slate-950 flex flex-col items-center text-center space-y-4 animate-fade-in">
            <div className="relative">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-slate-800 to-slate-700 flex items-center justify-center text-4xl shadow-xl border-2 border-amber-400/60">
                {winningItem.icon}
              </div>
              <span className="badge badge-warning badge-sm absolute -bottom-2.5 left-1/2 -translate-x-1/2 font-mono font-bold text-[10px]">
                {winningItem.rarity.toUpperCase()}
              </span>
            </div>

            <div>
              <h2 className="text-lg font-black text-slate-100">{winningItem.nameAr}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{winningItem.name}</p>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="badge bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs font-mono font-bold gap-1">
                  🌟 {winningItem.starValue} نجوم
                </span>
                <span className="badge bg-cyan-500/20 text-cyan-300 border-cyan-500/40 text-xs font-mono font-bold gap-1">
                  💎 {winningItem.dustValue} غبار
                </span>
              </div>
            </div>

            {/* Action Buttons: Keep or Instant Sell */}
            <div className="grid grid-cols-2 gap-2.5 w-full pt-2">
              <button 
                className="btn btn-outline btn-warning btn-sm text-xs font-bold gap-1 shadow"
                onClick={() => onSellItem(winningItem)}
              >
                <span>بيع بـ {winningItem.starValue} نجمة</span>
                <span>🌟</span>
              </button>
              <button 
                className="btn btn-primary btn-sm text-xs font-bold gap-1 shadow-lg shadow-primary/25"
                onClick={() => onKeepItem(winningItem)}
              >
                <Check size={14} />
                <span>إضافة للمخزن</span>
              </button>
            </div>

            {/* Re-Open Option */}
            <div className="pt-1 flex items-center justify-between w-full border-t border-slate-800 text-xs text-slate-400">
              <button 
                className="btn btn-ghost btn-xs text-slate-400 hover:text-white"
                onClick={onClose}
              >
                إغلاق الخزنة
              </button>
              <button 
                className="btn btn-sm btn-ghost text-amber-400 font-bold gap-1"
                onClick={() => {
                  startRoll();
                  onReopen();
                }}
                disabled={!canReopen}
              >
                <RefreshCw size={13} />
                <span>فتح مرة أخرى ({vaultCase.isDailyFree ? 'مجانًا' : `🌟 ${vaultCase.starsPrice}`})</span>
              </button>
            </div>
          </div>
        )}

        {/* Rolling Status Message */}
        {rolling && (
          <div className="p-4 text-center text-xs font-mono text-amber-400/90 flex items-center justify-center gap-2">
            <span className="loading loading-spinner loading-xs text-amber-400"></span>
            <span>جارٍ كسر أقفال الخزنة واستخراج الجوائز…</span>
          </div>
        )}
      </div>
    </div>
  );
};
