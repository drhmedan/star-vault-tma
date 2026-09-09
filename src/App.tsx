import React, { useState, useEffect } from 'react';
import { 
  Package, Star, Swords, Disc, Users, ShoppingBag, 
  Sparkles, CheckCircle, Volume2, VolumeX, Backpack, Shield, Crosshair
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
import { PvPLobby } from './components/PvPLobby';
import { CyberTacticsArena } from './components/CyberTacticsArena';
import { PubgArena } from './components/PubgArena';
import { Pubg3DArena } from './components/Pubg3DArena';
import { CommanderLoadout } from './components/CommanderLoadout';
import { MapId } from './game3d/types3d';
import { sound } from './audio/soundEngine';

type TabType = 'cyberwar' | 'loadout' | 'vaults' | 'wheel' | 'shop' | 'inventory' | 'referrals';

export const App: React.FC = () => {
  const [tab, setTab] = useState<TabType>('cyberwar');
  const [muted, setMuted] = useState(false);
  const [activeUnboxingCase, setActiveUnboxingCase] = useState<VaultCase | null>(null);

  // Active Tactical PvP match state
  const [activeMatch, setActiveMatch] = useState<{
    roomCode: string;
    mode: 'host' | 'join' | 'ai';
    stakeStars: number;
    mapId?: MapId;
  } | null>(null);

  // Initialize or load user profile
  const [user, setUser] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('star_vault_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return {
          ...parsed,
          trophies: parsed.trophies || 120,
          equippedLoadout: parsed.equippedLoadout || {
            weaponItemId: ALL_ITEMS.combat_knife.id,
            armorItemId: undefined
          }
        };
      } catch (e) {}
    }

    // Default starting state
    return {
      id: Math.floor(100000 + Math.random() * 900000),
      username: 'cyber_commander',
      firstName: 'القائد السيبراني',
      stars: 100, // Starting test grant of Stars
      starDust: 350,
      keys: { cyber_silver: 1 },
      level: 3,
      trophies: 120,
      isVip: false,
      inventory: [ALL_ITEMS.combat_knife, ALL_ITEMS.silver_bar, ALL_ITEMS.sovereign_blade],
      equippedLoadout: {
        weaponItemId: ALL_ITEMS.combat_knife.id
      },
      lastDailySpin: 0,
      lastFreeCase: 0,
      refCode: 'REF' + Math.floor(1000 + Math.random() * 9000),
      referralsCount: 2,
      referralStarsEarned: 30
    };
  });

  // Telegram Mini App Initialization & Direct Invite Link listener
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand();
      if (typeof tg.disableVerticalSwipes === 'function') {
        tg.disableVerticalSwipes();
      }
      if (typeof tg.enableClosingConfirmation === 'function') {
        tg.enableClosingConfirmation();
      }
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

      // Check deep link start parameter (e.g. ?startapp=pvp_CYBER-XYZ)
      const startParam = tg.initDataUnsafe?.start_param || '';
      if (startParam.startsWith('pvp_')) {
        const roomToJoin = startParam.replace('pvp_', '');
        setActiveMatch({
          roomCode: roomToJoin,
          mode: 'join',
          stakeStars: 0
        });
        setTab('cyberwar');
      }
    }
  }, []);

  // Sync to local storage
  useEffect(() => {
    localStorage.setItem('star_vault_user', JSON.stringify(user));
  }, [user]);

  // Case Actions
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

  // PvP Tactical Handlers
  const handleStartPvPMatch = (roomCode: string, mode: 'host' | 'join' | 'ai', stakeStars: number, mapId: MapId = 'warehouse') => {
    if (stakeStars > 0 && user.stars < stakeStars) {
      setTab('shop');
      return;
    }
    if (stakeStars > 0) {
      setUser(p => ({ ...p, stars: p.stars - stakeStars }));
    }
    setActiveMatch({ roomCode, mode, stakeStars, mapId });
  };

  const handleMatchComplete = (won: boolean, trophiesDelta: number, dustDelta: number, starsDelta: number) => {
    setUser(p => ({
      ...p,
      trophies: Math.max(0, (p.trophies || 0) + trophiesDelta),
      starDust: p.starDust + dustDelta,
      stars: p.stars + starsDelta
    }));
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between max-w-lg mx-auto border-x border-slate-800/40 shadow-2xl relative" dir="rtl">
      {/* Top Header - Hidden during active 3D shooter match for fullscreen immersion */}
      {!activeMatch && (
        <Header 
          user={user}
          onOpenShop={() => setTab('shop')}
          muted={muted}
          onToggleMute={() => {
            const isMuted = sound.toggleMute();
            setMuted(isMuted);
          }}
        />
      )}

      {/* Main View Area */}
      <main className={activeMatch ? "flex-1 w-full h-full p-0 overflow-hidden" : "p-4 flex-1 pb-24"}>
        {/* TAB 1: CYBER WAR (ONLINE PVP 3D) */}
        {tab === 'cyberwar' && (
          activeMatch ? (
            <Pubg3DArena 
              user={user}
              roomCode={activeMatch.roomCode}
              mode={activeMatch.mode}
              stakeStars={activeMatch.stakeStars}
              mapId={activeMatch.mapId}
              onExit={() => setActiveMatch(null)}
              onMatchComplete={handleMatchComplete}
            />
          ) : (
            <PvPLobby 
              user={user}
              onStartMatch={handleStartPvPMatch}
              onOpenLoadout={() => setTab('loadout')}
            />
          )
        )}

        {/* TAB 2: COMMANDER LOADOUT */}
        {tab === 'loadout' && (
          <CommanderLoadout 
            user={user}
            onUpdateLoadout={(loadout) => setUser(p => ({ ...p, equippedLoadout: loadout }))}
            onBack={() => setTab('cyberwar')}
          />
        )}

        {/* TAB 3: VAULTS & CASES */}
        {tab === 'vaults' && (
          <VaultsGrid 
            userStars={user.stars}
            lastFreeCaseTime={user.lastFreeCase}
            onSelectCase={handleOpenCase}
            onOpenShop={() => setTab('shop')}
          />
        )}

        {/* TAB 4: LUCKY WHEEL */}
        {tab === 'wheel' && (
          <LuckyWheel 
            userStars={user.stars}
            lastDailySpin={user.lastDailySpin}
            onSpinResult={handleWheelReward}
            onOpenShop={() => setTab('shop')}
          />
        )}

        {/* TAB 5: STARS SHOP */}
        {tab === 'shop' && (
          <StarsShop 
            onStarsPurchased={handleStarsPurchased}
            onActivateAutoMiner={handleActivateAutoMiner}
            autoMinerActive={!!user.autoMinerActiveUntil && user.autoMinerActiveUntil > Date.now()}
            onClose={() => setTab('cyberwar')}
          />
        )}

        {/* TAB 6: INVENTORY */}
        {tab === 'inventory' && (
          <Inventory 
            items={user.inventory}
            onSellItem={handleInventorySell}
          />
        )}

        {/* TAB 7: REFERRAL */}
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

      {/* Sticky Bottom Navigation Bar (TMA Standard) - Hidden during active match */}
      {!activeMatch && (
        <nav className="fixed bottom-0 inset-x-0 max-w-lg mx-auto bg-slate-950/95 backdrop-blur-lg border-t border-slate-800/80 px-2 py-2 flex justify-around items-center z-40">
          {[
            { id: 'cyberwar', label: 'ساحة الحرب', icon: Swords },
            { id: 'loadout', label: 'العتاد', icon: Shield },
            { id: 'vaults', label: 'الصناديق', icon: Package },
            { id: 'wheel', label: 'العجلة', icon: Disc },
            { id: 'inventory', label: 'حقيبتي', icon: Backpack },
            { id: 'shop', label: 'النجوم', icon: Star },
            { id: 'referrals', label: 'الإحالات', icon: Users }
          ].map(item => {
            const isActive = tab === item.id;
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`flex flex-col items-center justify-center py-1 px-1.5 rounded-xl transition-all ${
                  isActive 
                    ? 'text-cyan-400 font-bold scale-105' 
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
      )}
    </div>
  );
};
