import React, { useState } from 'react';
import { Swords, Plus, Star, ShieldAlert, Trophy, User, Bot, Check, ArrowRight } from 'lucide-react';
import confetti from 'canvas-confetti';
import { BattleRoom, VaultItem, UserProfile } from '../types';
import { VAULT_CASES, ALL_ITEMS } from '../data/vaultsData';
import { sound } from '../audio/soundEngine';

interface CaseBattlesProps {
  user: UserProfile;
  onBattleWin: (wonItems: VaultItem[], starsWon: number) => void;
  onOpenShop: () => void;
}

export const CaseBattles: React.FC<CaseBattlesProps> = ({
  user,
  onBattleWin,
  onOpenShop
}) => {
  const [rooms, setRooms] = useState<BattleRoom[]>([
    {
      id: 'room_101',
      caseId: 'cyber_silver',
      caseNameAr: 'صندوق السايبر التكتيكي',
      entryStars: 25,
      creator: { id: 98124, name: 'سلطان_KSA', avatar: '🇸🇦' },
      status: 'waiting',
      createdAt: Date.now() - 1000 * 60 * 3
    },
    {
      id: 'room_102',
      caseId: 'gold_sovereign',
      caseNameAr: 'خزنة السيادة الذهبية',
      entryStars: 75,
      creator: { id: 45192, name: 'CyberLord_99', avatar: '⚡' },
      status: 'waiting',
      createdAt: Date.now() - 1000 * 60 * 8
    }
  ]);

  const [activeBattle, setActiveBattle] = useState<BattleRoom | null>(null);
  const [battleStep, setBattleStep] = useState<'countdown' | 'rolling' | 'finished'>('countdown');

  // Launch a 1v1 Battle
  const enterBattle = (room: BattleRoom, isBot = true) => {
    if (user.stars < room.entryStars) {
      onOpenShop();
      return;
    }

    sound.playVaultOpen();

    const selectedCase = VAULT_CASES.find(c => c.id === room.caseId) || VAULT_CASES[1];
    const items = selectedCase.items;

    // Pick random items for both participants
    const p1Item = items[Math.floor(Math.random() * items.length)];
    const p2Item = items[Math.floor(Math.random() * items.length)];

    const updatedRoom: BattleRoom = {
      ...room,
      opponent: {
        id: user.id,
        name: user.firstName || 'أنت (القائد)',
        avatar: '🎖️'
      },
      creatorItem: p1Item,
      opponentItem: p2Item,
      winnerId: p2Item.starValue >= p1Item.starValue ? user.id : room.creator.id,
      status: 'rolling'
    };

    setActiveBattle(updatedRoom);
    setBattleStep('rolling');

    // Reel spin interval sounds
    let ticks = 0;
    const interval = setInterval(() => {
      ticks++;
      sound.playTick();
      if (ticks > 25) clearInterval(interval);
    }, 140);

    setTimeout(() => {
      clearInterval(interval);
      setBattleStep('finished');
      const userWon = updatedRoom.winnerId === user.id;

      if (userWon) {
        sound.playReveal('legendary');
        confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
        onBattleWin([p1Item, p2Item], room.entryStars * 2);
      } else {
        sound.playReveal('common');
      }
    }, 4000);
  };

  const createInstantDuel = () => {
    const defaultRoom: BattleRoom = {
      id: 'room_' + Math.random().toString().slice(2, 6),
      caseId: 'cyber_silver',
      caseNameAr: 'صندوق السايبر التكتيكي',
      entryStars: 25,
      creator: { id: 777, name: 'بوت النخبة VIP', avatar: '🤖' },
      status: 'waiting',
      createdAt: Date.now()
    };
    enterBattle(defaultRoom, true);
  };

  return (
    <div className="space-y-4 select-none" dir="rtl">
      {/* Top Banner */}
      <div className="card bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="badge badge-error badge-xs font-mono font-bold">LIVE PVP 1V1</span>
            <span className="text-xs text-slate-400 font-mono">CASE BATTLES ARENA</span>
          </div>
          <h2 className="text-base font-black text-slate-100">معارك الصناديق التنافسية 1 ضد 1</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            تحدَّ لاعباً آخر، كلاكما يفتح الصندوق معاً، والفائز بالأعلى ندرة يستحوذ على كامل المحصول!
          </p>
        </div>
        <button 
          className="btn btn-primary btn-sm gap-1 text-xs font-bold shadow-lg shadow-primary/25"
          onClick={createInstantDuel}
        >
          <Swords size={15} />
          <span>تحدي فوري 1v1</span>
        </button>
      </div>

      {/* Active Battle View (When in Battle) */}
      {activeBattle && (
        <div className="card bg-slate-950 border-2 border-primary p-5 rounded-2xl shadow-2xl space-y-4 animate-fade-in">
          <div className="flex justify-between items-center border-b border-slate-800 pb-2">
            <span className="text-xs font-bold text-primary flex items-center gap-1.5">
              <Swords size={16} />
              <span>معركة حية على: {activeBattle.caseNameAr} (🌟 {activeBattle.entryStars} نجوم)</span>
            </span>
            <button 
              className="btn btn-ghost btn-xs text-slate-400"
              onClick={() => setActiveBattle(null)}
              disabled={battleStep === 'rolling'}
            >
              إغلاق المعركة
            </button>
          </div>

          {/* Duelists Stage */}
          <div className="grid grid-cols-2 gap-4 text-center">
            {/* Creator / Challenger */}
            <div className={`p-4 rounded-2xl border transition-all ${
              battleStep === 'finished' && activeBattle.winnerId === activeBattle.creator.id
                ? 'border-amber-400 bg-amber-500/15 shadow-[0_0_20px_#fbbf24]'
                : 'border-slate-800 bg-slate-900/60'
            }`}>
              <div className="text-3xl mb-1">{activeBattle.creator.avatar}</div>
              <div className="text-xs font-bold text-slate-200">{activeBattle.creator.name}</div>

              {/* Item Drop */}
              <div className="mt-3 min-h-[90px] flex flex-col items-center justify-center bg-slate-950 p-2 rounded-xl border border-slate-800">
                {battleStep === 'rolling' ? (
                  <div className="animate-spin text-2xl">🎲</div>
                ) : (
                  activeBattle.creatorItem && (
                    <>
                      <div className="text-3xl">{activeBattle.creatorItem.icon}</div>
                      <div className="text-[11px] font-bold text-slate-100 mt-1">{activeBattle.creatorItem.nameAr}</div>
                      <span className="badge badge-xs badge-warning font-mono font-bold mt-1">
                        🌟 {activeBattle.creatorItem.starValue} نجوم
                      </span>
                    </>
                  )
                )}
              </div>
            </div>

            {/* Opponent (You) */}
            <div className={`p-4 rounded-2xl border transition-all ${
              battleStep === 'finished' && activeBattle.winnerId === user.id
                ? 'border-emerald-400 bg-emerald-500/15 shadow-[0_0_20px_#10b981]'
                : 'border-slate-800 bg-slate-900/60'
            }`}>
              <div className="text-3xl mb-1">🎖️</div>
              <div className="text-xs font-bold text-emerald-400">أنت (القائد)</div>

              {/* Item Drop */}
              <div className="mt-3 min-h-[90px] flex flex-col items-center justify-center bg-slate-950 p-2 rounded-xl border border-slate-800">
                {battleStep === 'rolling' ? (
                  <div className="animate-spin text-2xl">🎲</div>
                ) : (
                  activeBattle.opponentItem && (
                    <>
                      <div className="text-3xl">{activeBattle.opponentItem.icon}</div>
                      <div className="text-[11px] font-bold text-slate-100 mt-1">{activeBattle.opponentItem.nameAr}</div>
                      <span className="badge badge-xs badge-success font-mono font-bold mt-1">
                        🌟 {activeBattle.opponentItem.starValue} نجوم
                      </span>
                    </>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Winner Banner */}
          {battleStep === 'finished' && (
            <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/20 to-primary/20 border border-primary/40 text-center animate-bounce">
              <div className="text-sm font-black text-white">
                {activeBattle.winnerId === user.id ? '🎉 نصر ساحق! فزت بجميع الجوائز ومضاعفة النجوم!' : 'حظ أوفر في الجولة القادمة!'}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Open Battle Rooms List */}
      <div className="space-y-2.5">
        <div className="text-xs font-mono text-slate-400 text-right">الغرف المفتوحة بانتظار الخصم:</div>
        {rooms.map(r => (
          <div 
            key={r.id}
            className="card bg-slate-900 border border-slate-800 p-3.5 rounded-xl flex flex-row justify-between items-center shadow-lg"
          >
            <div className="flex items-center gap-3">
              <div className="text-2xl p-2 rounded-xl bg-slate-800">{r.creator.avatar}</div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center gap-2">
                  <span>{r.creator.name}</span>
                  <span className="badge badge-xs bg-slate-800 text-slate-400 font-mono">1v1</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{r.caseNameAr}</div>
              </div>
            </div>

            <button 
              className="btn btn-warning btn-sm text-xs font-black gap-1 shadow"
              onClick={() => enterBattle(r, false)}
            >
              <span>دخول بـ {r.entryStars} 🌟</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
