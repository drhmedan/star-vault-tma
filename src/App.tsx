import React, { useState, useEffect } from 'react';
import { 
  Package, Star, Swords, Disc, Users, ShoppingBag, 
  Sparkles, CheckCircle, Volume2, VolumeX, Backpack
} from 'lucide-react';
import { UserProfile, VaultCase, VaultItem, WheelSegment } from './types';
import { VAULT_CASES, ALL_ITEMS } from './data/vaultsData';
import { Header } from './components/Header';
import { VaultsGrid } from './components/VaultsGrid';
import { CaseUnboxingModal } from './components/CaseUnboxingModal';
import { LuckyWheel } from './components/LuckyWheel';
import { CaseBattles } from './components/CaseBattles';
import { StarsShop } from './components/StarsShop';
import { ReferralHub } from './components/ReferralHub';
import { Inventory } from './components/Inventory';
import { sound } from './audio/soundEngine';

type TabType = 'vaults' | 'wheel' | 'battles' | 'shop' | 'referrals' | 'inventory';

export const App: React.FC = () => {
  const [tab, setTab] = useState<TabType>('vaults');
  const [muted, setMuted] = useState(false);
  const [activeUnboxingCase, setActiveUnboxingCase] = useState<VaultCase | null>(null);

  // Initialize or load user profile
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('star_vault_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {}
    }

    // Default starting state
    return {
      id: Math.floor(100000 + Math.random() * 900000),
      username: 'sovereign_player',
      firstName: 'القائد المغامر',
      stars: 75, // Starting test grant of Stars
      starDust: 250,
      keys: { cyber_silver: 1 },
      level: 2,
      isVip: false,
      inventory: [ALL_ITEMS.combat_knife, ALL_ITEMS.silver_bar],
      lastDailySpin: 0,
      lastFreeCase: 0,
      refCode: 'REF' + Math.floor(1000 + Math.random() * 9000),
      referralsCount: 2,
      referralStarsEarned: 30
    };
  });

  // Telegram Mini App Initialization
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      try {
        tg.setHeaderColor('#080b11');
        tg.setBackgroundColor('#080b11');
      } catch (e) {}

      // Extract Telegram user info if available
      const tgUser = tg.initDataUnsafe?.user;
      if (tgUser) {
        setUser(prev => ({
          ...prev,
          id: tgUser.id,
          username: tgUser.username || prev.username,
          firstName: tgUser.first_name || prev.firstName
        }));
      }
    }
  }, []);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('star_vault_user', JSON.stringify(user));
  }, [user]);

  // Actions
  const handleOpenCase = (c: VaultCase) => {
    if (c.isDailyFree) {
      setUser(p => ({ ...p, lastFreeCase: Date.now() }));
    } else {
      if (user.stars < c.starsPrice) {
        setTab('shop');
        return;
      }
      setUser(p => ({ ...p, stars: Math.max(0, p.stars - c.starsPrice) }));
    }
    setActiveUnboxingCase(c);
  };

  const handleKeepItem = (item: VaultItem) => {
    setUser(p => ({
      ...p,
      inventory: [item, ...p.inventory]
    }));
    setActiveUnboxingCase(null);
  };

  const handleSellItem = (item: VaultItem) => {
    sound.playStarCoin();
    setUser(p => ({
      ...p,
      stars: p.stars + item.starValue
    }));
    setActiveUnboxingCase(null);
  };

  const handleWheelReward = (reward: WheelSegment) => {
    if (reward.rewardType === 'stars') {
      setUser(p => ({ ...p, stars: p.stars + reward.amount, lastDailySpin: Date.now() }));
    } else if (reward.rewardType === 'dust') {
      setUser(p => ({ ...p, starDust: p.starDust + reward.amount, lastDailySpin: Date.now() }));
    } else if (reward.rewardType === 'jackpot') {
      setUser(p => ({ ...p, stars: p.stars + 500, isVip: true, lastDailySpin: Date.now() }));
    } else {
      setUser(p => ({ ...p, starDust: p.starDust + 150, lastDailySpin: Date.now() }));
    }
  };

  const handleBattleWin = (wonItems: VaultItem[], starsWon: number) => {
    setUser(p => ({
      ...p,
      stars: p.stars + starsWon,
      inventory: [...wonItems, ...p.inventory]
    }));
  };

  const handleStarsPurchased = (stars: number) => {
    setUser(p => ({
      ...p,
      stars: p.stars + stars
    }));
  };

  const handleActivateAutoMiner = () => {
    if (user.stars < 100) {
      setTab('shop');
      return;
    }
    sound.playStarCoin();
    setUser(p => ({
      ...p,
      stars: p.stars - 100,
      autoMinerActiveUntil: Date.now() + 7 * 24 * 60 * 60 * 1000
    }));
  };

  const handleInventorySell = (item: VaultItem) => {
    sound.playStarCoin();
    setUser(p => ({
      ...p,
      stars: p.stars + item.starValue,
      inventory: p.inventory.filter(i => i !== item)
    }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between max-w-lg mx-auto border-x border-slate-800/40 shadow-2xl relative" dir="rtl">
      {/* Top Header */}
      <Header 
        user={user}
        onOpenShop={() => setTab('shop')}
        muted={muted}
        onToggleMute={() => {
          const isMuted = sound.toggleMute();
          setMuted(isMuted);
        }}
      />

      {/* Main View Area */}
      <main className="p-4 flex-1 pb-24">
        {tab === 'vaults' && (
          <VaultsGrid 
            userStars={user.stars}
            lastFreeCaseTime={user.lastFreeCase}
            onSelectCase={handleOpenCase}
            onOpenShop={() => setTab('shop')}
          />
        )}

        {tab === 'wheel' && (
          <LuckyWheel 
            userStars={user.stars}
            lastDailySpin={user.lastDailySpin}
            onSpinResult={handleWheelReward}
            onOpenShop={() => setTab('shop')}
          />
        )}

        {tab === 'battles' && (
          <CaseBattles 
            user={user}
            onBattleWin={handleBattleWin}
            onOpenShop={() => setTab('shop')}
          />
        )}

        {tab === 'shop' && (
          <StarsShop 
            onStarsPurchased={handleStarsPurchased}
            onActivateAutoMiner={handleActivateAutoMiner}
            autoMinerActive={!!user.autoMinerActiveUntil && user.autoMinerActiveUntil > Date.now()}
            onClose={() => setTab('vaults')}
          />
        )}

        {tab === 'referrals' && (
          <ReferralHub 
            user={user}
            onClaimCommission={() => {
              if (user.referralStarsEarned > 0) {
                sound.playStarCoin();
                setUser(p => ({
                  ...p,
                  stars: p.stars + p.referralStarsEarned,
                  referralStarsEarned: 0
                }));
              }
            }}
          />
        )}

        {tab === 'inventory' && (
          <Inventory 
            items={user.inventory}
            onSellItem={handleInventorySell}
          />
        )}
      </main>

      {/* CS:GO Style Horizontal Unboxing Reel Modal */}
      {activeUnboxingCase && (
        <CaseUnboxingModal 
          vaultCase={activeUnboxingCase}
          onClose={() => setActiveUnboxingCase(null)}
          onKeepItem={handleKeepItem}
          onSellItem={handleSellItem}
          onReopen={() => handleOpenCase(activeUnboxingCase)}
          canReopen={activeUnboxingCase.isDailyFree || user.stars >= activeUnboxingCase.starsPrice}
        />
      )}

      {/* Sticky Bottom Navigation Bar (TMA Standard) */}
      <nav className="fixed bottom-0 inset-x-0 max-w-lg mx-auto bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/80 px-2 py-2 flex justify-around items-center z-40">
        {[
          { id: 'vaults', label: 'الخزائن', icon: Package },
          { id: 'wheel', label: 'العجلة', icon: Disc },
          { id: 'battles', label: 'المعارك', icon: Swords },
          { id: 'shop', label: 'النجوم', icon: Star },
          { id: 'inventory', label: 'حقيبتي', icon: Backpack },
          { id: 'referrals', label: 'الإحالات', icon: Users }
        ].map(item => {
          const isActive = tab === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={`flex flex-col items-center justify-center py-1 px-2 rounded-xl transition-all ${
                isActive 
                  ? 'text-amber-400 font-bold scale-105' 
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              onClick={() => {
                sound.playClick();
                setTab(item.id as TabType);
              }}
            >
              <Icon size={18} className={isActive ? 'stroke-[2.5]' : 'stroke-2'} />
              <span className="text-[10px] mt-0.5">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
