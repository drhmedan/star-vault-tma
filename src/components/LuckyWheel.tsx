import React, { useState } from 'react';
import { Sparkles, Star, RefreshCw, Trophy, Gift, ArrowDown } from 'lucide-react';
import confetti from 'canvas-confetti';
import { WheelSegment } from '../types';
import { WHEEL_SEGMENTS } from '../data/vaultsData';
import { sound } from '../audio/soundEngine';

interface LuckyWheelProps {
  userStars: number;
  lastDailySpin: number;
  onSpinResult: (reward: WheelSegment) => void;
  onOpenShop: () => void;
}

export const LuckyWheel: React.FC<LuckyWheelProps> = ({
  userStars,
  lastDailySpin,
  onSpinResult,
  onOpenShop
}) => {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [wonReward, setWonReward] = useState<WheelSegment | null>(null);

  const dailyCooldown = 24 * 60 * 60 * 1000;
  const now = Date.now();
  const timeSinceSpin = now - lastDailySpin;
  const isFreeAvailable = timeSinceSpin >= dailyCooldown;
  const hoursLeft = Math.max(0, Math.ceil((dailyCooldown - timeSinceSpin) / (60 * 60 * 1000)));

  const spinWheel = (isVip: boolean) => {
    if (spinning) return;
    if (!isVip && !isFreeAvailable) return;
    if (isVip && userStars < 15) {
      onOpenShop();
      return;
    }

    setSpinning(true);
    setWonReward(null);
    sound.playVaultOpen();

    // Pick segment with weighted probabilities
    const rand = Math.random();
    let accumulated = 0;
    let chosen = WHEEL_SEGMENTS[0];
    for (let seg of WHEEL_SEGMENTS) {
      accumulated += seg.probability;
      if (rand <= accumulated) {
        chosen = seg;
        break;
      }
    }

    // 8 segments = 45 degrees each
    const segIndex = WHEEL_SEGMENTS.findIndex(s => s.id === chosen.id);
    const segDegree = 360 / WHEEL_SEGMENTS.length; // 45 deg
    // Needle is at the top (0 deg). To land on index i, rotate so segment is at top
    const targetAngle = 360 - (segIndex * segDegree) - (segDegree / 2);
    const fullSpins = 360 * 5; // 5 full revolutions
    const finalRotation = rotation + fullSpins + (targetAngle - (rotation % 360));

    setRotation(finalRotation);

    // Audio ticks
    let tickCount = 0;
    const ticker = setInterval(() => {
      tickCount++;
      sound.playTick();
      if (tickCount > 30) clearInterval(ticker);
    }, 130);

    // Stop after 4.5 seconds
    setTimeout(() => {
      clearInterval(ticker);
      setSpinning(false);
      setWonReward(chosen);
      sound.playReveal(chosen.rewardType === 'jackpot' ? 'mythic' : 'epic');
      onSpinResult(chosen);

      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 }
      });
    }, 4500);
  };

  return (
    <div className="card bg-slate-900/95 border border-slate-800 p-5 rounded-2xl shadow-2xl flex flex-col items-center select-none" dir="rtl">
      {/* Header */}
      <div className="text-center mb-4">
        <span className="badge badge-warning badge-sm font-mono font-bold mb-1">
          DAILY & VIP LUCKY WHEEL
        </span>
        <h2 className="text-xl font-black text-slate-100">عجلة الحظ الكبرى · لفة النجوم</h2>
        <p className="text-xs text-slate-400 mt-1">
          اربح ما يصل إلى <span className="text-amber-400 font-bold">500 نجمة تيليجرام</span> فورياً، مفاتيح ذهبية، أو مضاعفات أرباح!
        </p>
      </div>

      {/* The 360-Degree Rotating Wheel */}
      <div className="relative w-64 h-64 my-4 flex items-center justify-center">
        {/* Top Pointer Indicator Needle */}
        <div className="absolute -top-3 z-30 flex flex-col items-center">
          <div className="w-4 h-6 bg-amber-400 [clip-path:polygon(50%_100%,0_0,100%_0)] shadow-[0_0_12px_#fbbf24] animate-pulse"></div>
        </div>

        {/* Outer Glowing Ring */}
        <div className="absolute inset-0 rounded-full border-4 border-amber-500/40 shadow-[0_0_30px_rgba(245,158,11,0.2)]"></div>

        {/* Wheel Disc */}
        <div 
          className="w-60 h-60 rounded-full relative overflow-hidden border-2 border-slate-700 transition-transform will-change-transform shadow-2xl"
          style={{
            transform: `rotate(${rotation}deg)`,
            transitionDuration: spinning ? '4500ms' : '0ms',
            transitionTimingFunction: 'cubic-bezier(0.15, 0.85, 0.15, 1.0)'
          }}
        >
          <svg className="w-full h-full" viewBox="0 0 100 100">
            {WHEEL_SEGMENTS.map((seg, idx) => {
              const startAngle = (idx * 45) * (Math.PI / 180);
              const endAngle = ((idx + 1) * 45) * (Math.PI / 180);
              const x1 = 50 + 50 * Math.cos(startAngle);
              const y1 = 50 + 50 * Math.sin(startAngle);
              const x2 = 50 + 50 * Math.cos(endAngle);
              const y2 = 50 + 50 * Math.sin(endAngle);
              const pathData = `M 50 50 L ${x1} ${y1} A 50 50 0 0 1 ${x2} ${y2} Z`;

              return (
                <path 
                  key={seg.id}
                  d={pathData}
                  fill={seg.color}
                  stroke="#0f172a"
                  strokeWidth="0.8"
                />
              );
            })}
          </svg>

          {/* Labels on segments */}
          {WHEEL_SEGMENTS.map((seg, idx) => {
            const angle = idx * 45 + 22.5;
            return (
              <div 
                key={'label-' + seg.id}
                className="absolute inset-0 flex items-center justify-center pointer-events-none"
                style={{ transform: `rotate(${angle}deg)` }}
              >
                <span className="text-[9px] font-black text-white font-mono translate-x-16 drop-shadow-md whitespace-nowrap">
                  {seg.labelAr}
                </span>
              </div>
            );
          })}
        </div>

        {/* Center Hub Cap */}
        <div className="absolute w-12 h-12 rounded-full bg-slate-950 border-2 border-amber-400 flex items-center justify-center text-lg z-20 shadow-lg">
          🌟
        </div>
      </div>

      {/* Won Reward Popup Banner */}
      {wonReward && (
        <div className="card bg-amber-500/10 border border-amber-400/40 p-3 rounded-xl w-full text-center my-2 animate-bounce">
          <div className="text-xs text-amber-300 font-bold">🎉 مبروك! ربحت من العجلة:</div>
          <div className="text-base font-black text-white mt-0.5">{wonReward.labelAr}</div>
        </div>
      )}

      {/* Spin Trigger Buttons */}
      <div className="grid grid-cols-2 gap-3 w-full mt-2">
        {/* Free Spin */}
        <button 
          className={`btn btn-sm ${isFreeAvailable ? 'btn-success text-slate-950 font-black' : 'btn-ghost border border-slate-700 text-slate-400'}`}
          onClick={() => spinWheel(false)}
          disabled={spinning || !isFreeAvailable}
        >
          <Gift size={15} />
          <span>{isFreeAvailable ? 'لفة مجانية' : `بعد ${hoursLeft} ساعة`}</span>
        </button>

        {/* VIP Star Spin */}
        <button 
          className="btn btn-sm btn-warning text-slate-950 font-black shadow-lg shadow-amber-500/25"
          onClick={() => spinWheel(true)}
          disabled={spinning}
        >
          <Star size={15} className="fill-slate-950" />
          <span>لفة VIP بـ 15 نجمة 🌟</span>
        </button>
      </div>
    </div>
  );
};
