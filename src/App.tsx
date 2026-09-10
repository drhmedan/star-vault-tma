import React, { useState, useEffect, useRef } from 'react';
import { 
  Package, Star, Swords, Disc, Users, ShoppingBag, 
  Sparkles, CheckCircle, Volume2, VolumeX, Backpack, Shield, Crosshair, Crown
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
import { Pubg3DArena } from './components/Pubg3DArena';
import { CommanderLoadout } from './components/CommanderLoadout';
import { BattlePass } from './components/BattlePass';
import { SkinsPanel } from './components/SkinsPanel';
import { VipPanel } from './components/VipPanel';
import { MapId } from './game3d/types3d';
import { MatchInfo } from './services/matchmaking';
import { config } from './config';
import { ledger, LedgerError, MatchCompletion, SettleOutcome } from './services/ledger';
import { BATTLE_PASS, normalizeBattlePass } from './data/battlePass';
import { DEFAULT_WEAPON_SKIN_ID, DEFAULT_SOLDIER_SKIN_ID } from './data/skins';
import { sound } from './audio/soundEngine';

type TabType = 'cyberwar' | 'loadout' | 'vaults' | 'wheel' | 'shop' | 'inventory' | 'referrals' | 'battlepass';

export const App: React.FC = () => {
  const [tab, setTab] = useState<TabType>('cyberwar');
  const [muted, setMuted] = useState(false);
  const [activeUnboxingCase, setActiveUnboxingCase] = useState<VaultCase | null>(null);

  // Active Tactical PvP match state
  const [activeMatch, setActiveMatch] = useState<{
    roomCode: string;
    mode: 'host' | 'join' | 'ai' | 'matchmade';
    stakeStars: number;
    mapId?: MapId;
    matchInfo?: MatchInfo;
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
          },
          ownedSkins: parsed.ownedSkins?.length ? parsed.ownedSkins : [DEFAULT_WEAPON_SKIN_ID, DEFAULT_SOLDIER_SKIN_ID],
          equippedSkins: parsed.equippedSkins || { soldier: DEFAULT_SOLDIER_SKIN_ID, weapon: DEFAULT_WEAPON_SKIN_ID }
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
      ownedSkins: [DEFAULT_WEAPON_SKIN_ID, DEFAULT_SOLDIER_SKIN_ID],
      equippedSkins: { soldier: DEFAULT_SOLDIER_SKIN_ID, weapon: DEFAULT_WEAPON_SKIN_ID },
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
  // Track the active stake escrow across the async escrow -> settle window.
  const escrowRef = useRef<{ id: string; verified: boolean; amount: number }>({ id: '', verified: false, amount: 0 });
  const startingMatchRef = useRef(false);

  const handleStartPvPMatch = async (roomCode: string, mode: 'host' | 'join' | 'ai' | 'matchmade', stakeStars: number, mapId: MapId = 'warzone', matchInfo?: MatchInfo) => {
    if (startingMatchRef.current) return;
    if (stakeStars > 0 && user.stars < stakeStars) {
      setTab('shop');
      return;
    }
    startingMatchRef.current = true;
    escrowRef.current = { id: '', verified: false, amount: stakeStars };
    try {
      if (stakeStars > 0) {
        if (ledger.available) {
          // Server holds the stake in escrow; the match starts only once the
          // escrow is secured so stars can never be spent twice.
          try {
            const receipt = await ledger.escrow(user.id, stakeStars, roomCode);
            escrowRef.current = { id: receipt.escrowId, verified: true, amount: stakeStars };
            setUser(p => ({ ...p, stars: receipt.balance }));
          } catch (e) {
            if ((e as LedgerError).code === 'insufficient') {
              setTab('shop');
              return;
            }
            // Server unreachable: play offline with a local deduction.
            setUser(p => ({ ...p, stars: Math.max(0, p.stars - stakeStars) }));
          }
        } else {
          // Offline mode: local deduction, exactly as before.
          setUser(p => ({ ...p, stars: p.stars - stakeStars }));
        }
      }
      setActiveMatch({ roomCode, mode, stakeStars, mapId, matchInfo });
    } finally {
      startingMatchRef.current = false;
    }
  };

  // Battle-pass XP accrues from every finished match (soft progression).
  const creditBattlePassXp = (xp: number) => {
    setUser(p => {
      const base = normalizeBattlePass(p.battlePass);
      return { ...p, battlePass: { ...base, xp: Math.min(BATTLE_PASS.maxLevel * BATTLE_PASS.xpPerLevel, base.xp + xp) } };
    });
  };

  const handleMatchComplete = async (result: MatchCompletion): Promise<SettleOutcome> => {
    creditBattlePassXp(Math.max(0, Math.round(result.xp || 0)));
    const localTrophies = result.won ? 25 : -15;
    const localDust = result.won ? 200 : 30;
    const localStars = result.won && result.stake > 0 ? Math.floor(result.stake * 1.8) : 0;

    const applyLocal = (): SettleOutcome => {
      setUser(p => ({
        ...p,
        trophies: Math.max(0, (p.trophies || 0) + localTrophies),
        starDust: p.starDust + localDust,
        stars: p.stars + localStars
      }));
      return { trophies: localTrophies, dust: localDust, stars: localStars, verified: false };
    };

    // Offline (or AI training): local progression only.
    if (!ledger.available || result.mode === 'ai') return applyLocal();

    const esc = escrowRef.current;
    try {
      const s = await ledger.settle({
        ...result,
        playerId: user.id,
        escrowId: result.stake > 0 && esc.verified ? esc.id : undefined
      });
      setUser(p => ({
        ...p,
        stars: result.stake > 0 ? s.balance : p.stars,
        trophies: Math.max(0, (p.trophies || 0) + s.rewards.trophies),
        starDust: p.starDust + s.rewards.dust
      }));
      escrowRef.current = { id: '', verified: false, amount: 0 };
      return { trophies: s.rewards.trophies, dust: s.rewards.dust, stars: s.rewards.stars, verified: true };
    } catch {
      // Server unreachable at settle time: refund the open escrow (if any)
      // so the player never loses a stake they couldn't settle, then apply
      // local progression without minting unverifiable stars.
      if (result.stake > 0 && esc.verified && esc.id) {
        try {
          const c = await ledger.cancelEscrow(esc.id, user.id);
          setUser(p => ({
            ...p,
            stars: c.balance,
            trophies: Math.max(0, (p.trophies || 0) + localTrophies),
            starDust: p.starDust + localDust
          }));
        } catch {
          setUser(p => ({
            ...p,
            trophies: Math.max(0, (p.trophies || 0) + localTrophies),
            starDust: p.starDust + localDust
          }));
        }
        escrowRef.current = { id: '', verified: false, amount: 0 };
        return { trophies: localTrophies, dust: localDust, stars: 0, verified: false };
      }
      return applyLocal();
    }
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
        {/* TAB 1: CYBER WAR (ONLINE 3D TACTICAL WARZONE) */}
        {tab === 'cyberwar' && (
          activeMatch ? (
            <Pubg3DArena 
              user={user}
              roomCode={activeMatch.roomCode}
              mode={activeMatch.mode}
              stakeStars={activeMatch.stakeStars}
              mapId={activeMatch.mapId}
              matchInfo={activeMatch.matchInfo}
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
          <>
            <CommanderLoadout 
              user={user}
              onUpdateLoadout={(loadout) => setUser(p => ({ ...p, equippedLoadout: loadout }))}
              onBack={() => setTab('cyberwar')}
            />
            <div className="mt-5">
              <SkinsPanel
                user={user}
                onUserChange={setUser}
                onOpenShop={() => setTab('shop')}
              />
            </div>
          </>
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
          <>
            <StarsShop 
              onStarsPurchased={handleStarsPurchased}
              onActivateAutoMiner={handleActivateAutoMiner}
              autoMinerActive={!!user.autoMinerActiveUntil && user.autoMinerActiveUntil > Date.now()}
              onClose={() => setTab('cyberwar')}
            />
            <div className="mt-4">
              <VipPanel user={user} onUserChange={setUser} />
            </div>
          </>
        )}

        {/* TAB 6: INVENTORY */}
        {tab === 'inventory' && (
          <Inventory 
            items={user.inventory}
            onSellItem={handleInventorySell}
          />
        )}

        {/* TAB 8: BATTLE PASS */}
        {tab === 'battlepass' && (
          <BattlePass
            user={user}
            onUserChange={setUser}
            onOpenShop={() => setTab('shop')}
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
            { id: 'battlepass', label: 'الممر', icon: Crown },
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
