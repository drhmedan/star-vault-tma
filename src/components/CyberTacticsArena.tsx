import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { 
  Shield, Zap, Crosshair, ArrowLeft, Share2, Copy, Check, 
  Swords, Bot, Sparkles, Trophy, AlertTriangle, Radio
} from 'lucide-react';
import { 
  UserProfile, DeployedUnit, TacticalUnitType, 
  BattlePhase, CombatLogEntry, CommanderAbilityType 
} from '../types';
import { TACTICAL_UNITS, COMMANDER_ABILITIES } from '../data/tacticalData';
import { multiplayer, ConnectionStatus } from '../services/multiplayer';
import { sound } from '../audio/soundEngine';

interface CyberTacticsArenaProps {
  user: UserProfile;
  roomCode: string;
  mode: 'host' | 'join' | 'ai';
  stakeStars: number;
  onExit: () => void;
  onMatchComplete: (won: boolean, trophiesDelta: number, dustDelta: number, starsDelta: number) => void;
}

export const CyberTacticsArena: React.FC<CyberTacticsArenaProps> = ({
  user,
  roomCode,
  mode,
  stakeStars,
  onExit,
  onMatchComplete
}) => {
  const [phase, setPhase] = useState<BattlePhase>('deployment');
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('connecting');
  const [opponentName, setOpponentName] = useState<string>(mode === 'ai' ? 'الذكاء الاصطناعي (Cyber AI)' : 'في انتظار الخصم...');
  
  // Tactical State
  const [energy, setEnergy] = useState<number>(100);
  const [selectedUnitType, setSelectedUnitType] = useState<TacticalUnitType | null>('mech');
  const [units, setUnits] = useState<DeployedUnit[]>([]);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [opponentReady, setOpponentReady] = useState<boolean>(false);
  const [deployTimer, setDeployTimer] = useState<number>(20);
  
  // Abilities & Cooldowns
  const [abilityCooldowns, setAbilityCooldowns] = useState<Record<string, number>>({});
  const [combatLogs, setCombatLogs] = useState<CombatLogEntry[]>([]);
  const [copiedLink, setCopiedLink] = useState(false);
  const [activeLaser, setActiveLaser] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

  // Result state
  const [winner, setWinner] = useState<'player' | 'opponent' | null>(null);

  // Refs for combat loop
  const unitsRef = useRef<DeployedUnit[]>([]);
  unitsRef.current = units;
  const phaseRef = useRef<BattlePhase>(phase);
  phaseRef.current = phase;

  // Loadout buffs
  const weaponBuff = user.equippedLoadout?.weaponItemId ? 0.35 : 0;
  const armorBuff = user.equippedLoadout?.armorItemId ? 0.30 : 0;

  // 1. Initialize Multiplayer / AI connection
  useEffect(() => {
    multiplayer.init(
      user.id,
      (msg) => {
        // Handle incoming messages
        if (msg.type === 'JOIN_ROOM') {
          setOpponentName(msg.payload.playerName || 'لاعب متصل');
          setConnStatus('connected');
          addLog(`انضم الخصم ${msg.payload.playerName || ''} إلى المعركة!`, 'system');
        } else if (msg.type === 'DEPLOY_UNIT') {
          const enemyUnit: DeployedUnit = {
            ...msg.payload,
            side: 'enemy',
            // Invert Y coordinate for opponent's view
            y: 5 - msg.payload.y,
            x: 5 - msg.payload.x
          };
          setUnits(prev => [...prev, enemyUnit]);
          sound.playShield();
        } else if (msg.type === 'READY') {
          setOpponentReady(msg.payload.isReady);
          addLog('الخصم جاهز لبدء الاشتباك!', 'system');
        } else if (msg.type === 'COMBAT_START') {
          setPhase('combat');
          sound.playExplosion();
          addLog('بدأت المعركة التكتيكية الحية!', 'system');
        } else if (msg.type === 'USE_ABILITY') {
          handleOpponentAbility(msg.payload.abilityId);
        } else if (msg.type === 'GAME_OVER') {
          if (msg.payload.winnerId === user.id) {
            handleVictory();
          } else {
            handleDefeat();
          }
        }
      },
      (status, peerName) => {
        setConnStatus(status);
        if (peerName) setOpponentName(peerName);
      }
    );

    if (mode === 'host') {
      multiplayer.createRoom(roomCode, user.firstName);
    } else if (mode === 'join') {
      multiplayer.joinRoom(roomCode, user.firstName);
    } else if (mode === 'ai') {
      multiplayer.startAiMatch();
      // Auto-deploy AI units after 2 seconds
      setTimeout(() => {
        deployAiUnits();
      }, 1200);
    }

    return () => {
      multiplayer.cleanup();
    };
  }, []);

  // 2. Deployment Countdown Timer
  useEffect(() => {
    if (phase !== 'deployment') return;
    if (deployTimer <= 0) {
      handleStartCombat();
      return;
    }
    const interval = setInterval(() => {
      setDeployTimer(t => t - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [deployTimer, phase]);

  // 3. Automated Combat Loop (Runs when phase === 'combat')
  useEffect(() => {
    if (phase !== 'combat') return;

    const combatInterval = setInterval(() => {
      const current = [...unitsRef.current];
      const allies = current.filter(u => u.side === 'ally' && u.currentHp > 0);
      const enemies = current.filter(u => u.side === 'enemy' && u.currentHp > 0);

      // Check win condition
      if (allies.length === 0 && enemies.length > 0) {
        clearInterval(combatInterval);
        handleDefeat();
        return;
      }
      if (enemies.length === 0 && allies.length > 0) {
        clearInterval(combatInterval);
        handleVictory();
        return;
      }

      // Unit actions
      let updated = false;
      const now = Date.now();

      current.forEach((unit) => {
        if (unit.currentHp <= 0 || unit.isStunned) return;
        const def = TACTICAL_UNITS[unit.type];
        if (!def) return;

        // Attack cooldown check
        if (now - unit.lastAttackTime < def.attackSpeedSec * 1000) return;

        // Find target
        const targets = current.filter(t => t.side !== unit.side && t.currentHp > 0);
        if (targets.length === 0) return;

        // Target nearest
        targets.sort((a, b) => {
          const distA = Math.hypot(a.x - unit.x, a.y - unit.y);
          const distB = Math.hypot(b.x - unit.x, b.y - unit.y);
          return distA - distB;
        });

        const target = targets[0];
        const dist = Math.hypot(target.x - unit.x, target.y - unit.y);

        if (dist <= unit.range) {
          // Attack target
          unit.lastAttackTime = now;
          const damage = Math.round(unit.attack * (1 + (unit.side === 'ally' ? weaponBuff : 0)));
          
          if (target.shield > 0) {
            const absorbed = Math.min(target.shield, damage);
            target.shield -= absorbed;
            target.currentHp -= (damage - absorbed);
          } else {
            target.currentHp -= damage;
          }

          updated = true;
          sound.playLaserShot();

          // Laser visual
          setActiveLaser({ x1: unit.x, y1: unit.y, x2: target.x, y2: target.y });
          setTimeout(() => setActiveLaser(null), 180);

          if (target.currentHp <= 0) {
            target.currentHp = 0;
            sound.playExplosion();
            addLog(`تم تدمير ${TACTICAL_UNITS[target.type]?.nameAr}!`, 'kill');
          } else {
            addLog(`${def.nameAr} ألحق ${damage} ضرر بالعدو`, 'damage');
          }
        } else {
          // Move towards target by 1 step
          const dx = Math.sign(target.x - unit.x);
          const dy = Math.sign(target.y - unit.y);
          const nextX = Math.max(0, Math.min(5, unit.x + dx));
          const nextY = Math.max(0, Math.min(5, unit.y + dy));

          // Check if tile is free
          const occupied = current.some(u => u.currentHp > 0 && u.instanceId !== unit.instanceId && u.x === nextX && u.y === nextY);
          if (!occupied) {
            unit.x = nextX;
            unit.y = nextY;
            updated = true;
          }
        }
      });

      if (updated) {
        setUnits([...current]);
      }
    }, 400);

    return () => clearInterval(combatInterval);
  }, [phase]);

  // AI Deployment Logic
  const deployAiUnits = () => {
    const aiTypes: TacticalUnitType[] = ['mech', 'commando', 'sniper', 'drone'];
    const aiSpots = [
      { x: 2, y: 1 },
      { x: 3, y: 1 },
      { x: 1, y: 0 },
      { x: 4, y: 0 }
    ];

    const aiUnits: DeployedUnit[] = aiTypes.map((type, idx) => {
      const def = TACTICAL_UNITS[type];
      return {
        instanceId: `ai-${idx}-${Date.now()}`,
        ownerId: 999999,
        side: 'enemy',
        type,
        x: aiSpots[idx].x,
        y: aiSpots[idx].y,
        currentHp: def.hp,
        maxHp: def.hp,
        attack: def.attack,
        range: def.range,
        shield: 0,
        isStunned: false,
        lastAttackTime: 0
      };
    });

    setUnits(prev => [...prev, ...aiUnits]);
    setOpponentReady(true);
  };

  // Add Combat Log
  const addLog = (textAr: string, type: CombatLogEntry['type']) => {
    setCombatLogs(prev => [
      { id: Math.random().toString(), textAr, type, timestamp: Date.now() },
      ...prev.slice(0, 15)
    ]);
  };

  // Deploy player unit to tile
  const handleTileClick = (x: number, y: number) => {
    if (phase !== 'deployment') return;
    if (y < 3) {
      addLog('يمكنك نشر وحداتك في منطقتك الزرقاء فقط (الصفوف السفلية)', 'system');
      return;
    }
    if (!selectedUnitType) return;

    const def = TACTICAL_UNITS[selectedUnitType];
    if (energy < def.energyCost) {
      addLog(`طاقة النانو غير كافية! تتطلب ${def.energyCost} طاقة`, 'system');
      return;
    }

    // Check tile occupancy
    const isOccupied = units.some(u => u.x === x && u.y === y && u.currentHp > 0);
    if (isOccupied) return;

    const maxHpWithBuff = Math.round(def.hp * (1 + armorBuff));
    const newUnit: DeployedUnit = {
      instanceId: `p1-${Date.now()}-${Math.random()}`,
      ownerId: user.id,
      side: 'ally',
      type: selectedUnitType,
      x,
      y,
      currentHp: maxHpWithBuff,
      maxHp: maxHpWithBuff,
      attack: def.attack,
      range: def.range,
      shield: 0,
      isStunned: false,
      lastAttackTime: 0
    };

    sound.playShield();
    setEnergy(e => e - def.energyCost);
    setUnits(prev => [...prev, newUnit]);
    multiplayer.sendUnitDeployment(newUnit);
    addLog(`تم نشر ${def.nameAr} في الميدان`, 'system');
  };

  // Start Combat Phase
  const handleReadyClick = () => {
    sound.playClick();
    setIsReady(true);
    multiplayer.sendReadyState(true);

    if (opponentReady || mode === 'ai') {
      handleStartCombat();
    }
  };

  const handleStartCombat = () => {
    setPhase('combat');
    sound.playExplosion();
    multiplayer.sendCombatStart();
    addLog('بدأت المعركة التكتيكية الحية!', 'system');
  };

  // Trigger Commander Ability
  const handleUseAbility = (ability: typeof COMMANDER_ABILITIES[0]) => {
    if (phase !== 'combat') return;
    if (energy < ability.energyCost) {
      addLog(`لا توجد طاقة كافية لتفعيل ${ability.nameAr}`, 'system');
      return;
    }
    if ((abilityCooldowns[ability.id] || 0) > Date.now()) {
      addLog('القدرة قيد الانتظار!', 'system');
      return;
    }

    setEnergy(e => e - ability.energyCost);
    setAbilityCooldowns(prev => ({
      ...prev,
      [ability.id]: Date.now() + ability.cooldownSec * 1000
    }));

    multiplayer.sendAbilityUse(ability.id);

    if (ability.id === 'orbital') {
      sound.playExplosion();
      addLog('☄️ تم إطلاق الضربة المدارية على قوات الخصم!', 'ability');
      setUnits(prev => prev.map(u => {
        if (u.side === 'enemy') {
          return { ...u, currentHp: Math.max(0, u.currentHp - 350) };
        }
        return u;
      }));
    } else if (ability.id === 'shield') {
      sound.playShield();
      addLog('🛡️ تفعيل قبة الحماية لكافة وحداتك!', 'ability');
      setUnits(prev => prev.map(u => {
        if (u.side === 'ally') {
          return { ...u, shield: u.shield + 300 };
        }
        return u;
      }));
    } else if (ability.id === 'emp') {
      sound.playEmp();
      addLog('⚡ إطلاق نبض EMP لتعطيل وحدات العدو!', 'ability');
      setUnits(prev => prev.map(u => {
        if (u.side === 'enemy') {
          return { ...u, isStunned: true };
        }
        return u;
      }));
      setTimeout(() => {
        setUnits(prev => prev.map(u => ({ ...u, isStunned: false })));
      }, 3500);
    }
  };

  const handleOpponentAbility = (abilityId: CommanderAbilityType) => {
    if (abilityId === 'orbital') {
      sound.playExplosion();
      addLog('⚠️ الخصم استدعى ضربة مدارية على وحداتك!', 'ability');
      setUnits(prev => prev.map(u => {
        if (u.side === 'ally') {
          return { ...u, currentHp: Math.max(0, u.currentHp - 350) };
        }
        return u;
      }));
    } else if (abilityId === 'emp') {
      sound.playEmp();
      addLog('⚠️ الخصم عطل أجهزتك بنبض EMP!', 'ability');
      setUnits(prev => prev.map(u => {
        if (u.side === 'ally') {
          return { ...u, isStunned: true };
        }
        return u;
      }));
      setTimeout(() => {
        setUnits(prev => prev.map(u => ({ ...u, isStunned: false })));
      }, 3500);
    }
  };

  // Victory Handler
  const handleVictory = () => {
    setPhase('gameover');
    setWinner('player');
    sound.playReveal('mythic');
    confetti({ particleCount: 80, spread: 80, origin: { y: 0.6 } });
    multiplayer.sendGameOver(user.id);
    
    const starReward = stakeStars > 0 ? Math.floor(stakeStars * 1.8) : 0;
    onMatchComplete(true, 35, 150, starReward);
  };

  // Defeat Handler
  const handleDefeat = () => {
    setPhase('gameover');
    setWinner('opponent');
    sound.playClick();
    onMatchComplete(false, -15, 25, 0);
  };

  // Telegram Share Link
  const shareLink = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/YOUR_BOT?startapp=pvp_${roomCode}`)}&text=${encodeURIComponent(`تحداني في معركة تكتيكية الآن! ⚔️ كود الغرفة: ${roomCode}`)}`;

  const handleShareToTelegram = () => {
    sound.playClick();
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.openTelegramLink) {
      (window as any).Telegram.WebApp.openTelegramLink(shareLink);
    } else {
      window.open(shareLink, '_blank');
    }
  };

  const handleCopyCode = () => {
    sound.playClick();
    navigator.clipboard.writeText(roomCode);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="space-y-3 pb-24">
      {/* Top Bar: Room Status & Telegram Invite */}
      <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800 backdrop-blur-md flex items-center justify-between">
        <button
          onClick={() => {
            sound.playClick();
            onExit();
          }}
          className="text-xs text-slate-400 hover:text-white bg-slate-800/80 px-2.5 py-1.5 rounded-xl border border-slate-700/60 flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5 transform rotate-180" />
          <span>انسحاب</span>
        </button>

        <div className="text-center">
          <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-white">
            <Radio className={`w-3.5 h-3.5 ${connStatus === 'connected' ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
            <span>{opponentName}</span>
          </div>
          <div className="text-[10px] text-slate-400 font-mono">غرفة: {roomCode}</div>
        </div>

        {mode === 'host' && (
          <div className="flex items-center gap-1">
            <button
              onClick={handleCopyCode}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs"
              title="نسخ الرمز"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleShareToTelegram}
              className="px-2.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 shadow"
            >
              <Share2 className="w-3 h-3" />
              <span>دعوة</span>
            </button>
          </div>
        )}
      </div>

      {/* Energy & Phase Indicator */}
      <div className="bg-slate-900/70 rounded-xl p-2.5 border border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-7 h-7 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-xs font-bold">
            ⚡
          </span>
          <div>
            <div className="text-[11px] text-slate-400">طاقة النانو التكتيكية:</div>
            <div className="text-xs font-extrabold text-cyan-300 font-mono">{energy} / 100</div>
          </div>
        </div>

        {phase === 'deployment' ? (
          <div className="flex items-center gap-2">
            <div className="text-right">
              <div className="text-[10px] text-slate-400">مرحلة النشر:</div>
              <div className="text-xs font-extrabold text-amber-400">{deployTimer} ثانية</div>
            </div>
            <button
              onClick={handleReadyClick}
              disabled={isReady || units.filter(u => u.side === 'ally').length === 0}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                isReady
                  ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-md'
              }`}
            >
              {isReady ? 'جاهز ✓' : 'بدء الاشتباك!'}
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-red-400 font-extrabold text-xs animate-pulse">
            <Swords className="w-4 h-4" />
            <span>اشتباك ناري حي!</span>
          </div>
        )}
      </div>

      {/* The 6x6 Tactical Grid */}
      <div className="relative aspect-square max-w-sm mx-auto bg-slate-950 rounded-2xl p-2 border-2 border-slate-800 shadow-2xl overflow-hidden">
        {/* Grid lines & zones */}
        <div className="grid grid-cols-6 grid-rows-6 h-full w-full gap-1">
          {Array.from({ length: 36 }).map((_, idx) => {
            const x = idx % 6;
            const y = Math.floor(idx / 6);
            const isEnemyZone = y < 3;
            const isAllyZone = y >= 3;
            const unitOnTile = units.find(u => u.x === x && u.y === y && u.currentHp > 0);

            return (
              <div
                key={idx}
                onClick={() => handleTileClick(x, y)}
                className={`relative rounded-lg flex items-center justify-center transition-all cursor-pointer select-none ${
                  isEnemyZone
                    ? 'bg-red-950/20 border border-red-900/30 hover:bg-red-900/30'
                    : 'bg-cyan-950/20 border border-cyan-900/40 hover:bg-cyan-900/40'
                }`}
              >
                {/* Zone guide hint in deployment */}
                {phase === 'deployment' && !unitOnTile && (
                  <span className="text-[9px] opacity-20 font-mono text-slate-500">
                    {x},{y}
                  </span>
                )}

                {/* Render Unit if on tile */}
                {unitOnTile && (
                  <div className="relative w-full h-full flex flex-col items-center justify-center p-0.5 animate-fadeIn">
                    {/* Unit Icon */}
                    <span className="text-xl sm:text-2xl filter drop-shadow-md">
                      {TACTICAL_UNITS[unitOnTile.type]?.icon}
                    </span>

                    {/* Shield aura if active */}
                    {unitOnTile.shield > 0 && (
                      <div className="absolute inset-0 rounded-lg border-2 border-blue-400 animate-pulse pointer-events-none" />
                    )}

                    {/* Stun effect */}
                    {unitOnTile.isStunned && (
                      <span className="absolute -top-1 text-[10px]">⚡💫</span>
                    )}

                    {/* Mini Health Bar */}
                    <div className="w-full h-1 bg-black/60 rounded-full overflow-hidden mt-0.5">
                      <div
                        className={`h-full transition-all duration-200 ${
                          unitOnTile.side === 'ally' ? 'bg-cyan-400' : 'bg-red-500'
                        }`}
                        style={{ width: `${(unitOnTile.currentHp / unitOnTile.maxHp) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Laser Shot Beam Visual overlay */}
        {activeLaser && (
          <svg className="absolute inset-0 w-full h-full pointer-events-none z-20">
            <line
              x1={`${(activeLaser.x1 + 0.5) * (100 / 6)}%`}
              y1={`${(activeLaser.y1 + 0.5) * (100 / 6)}%`}
              x2={`${(activeLaser.x2 + 0.5) * (100 / 6)}%`}
              y2={`${(activeLaser.y2 + 0.5) * (100 / 6)}%`}
              stroke="#06b6d4"
              strokeWidth="3"
              strokeDasharray="4"
              className="animate-pulse"
            />
          </svg>
        )}
      </div>

      {/* Deployment Phase: Unit Selector Tray */}
      {phase === 'deployment' && (
        <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800">
          <div className="text-[11px] font-bold text-slate-400 mb-2 flex items-center justify-between">
            <span>اختر وحدة وانقر على شبكتك الزرقاء لنشرها:</span>
            <span className="text-cyan-400 text-[10px]">الوحدات المتمركزة: {units.filter(u => u.side === 'ally').length}</span>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {Object.values(TACTICAL_UNITS).map((u) => {
              const isSelected = selectedUnitType === u.type;
              const canAfford = energy >= u.energyCost;

              return (
                <button
                  key={u.type}
                  onClick={() => {
                    sound.playClick();
                    setSelectedUnitType(u.type);
                  }}
                  disabled={!canAfford}
                  className={`p-1.5 rounded-xl border text-center transition-all ${
                    isSelected
                      ? 'bg-cyan-600/30 border-cyan-400 shadow-md scale-105'
                      : canAfford
                      ? 'bg-slate-950/80 border-slate-800 hover:border-slate-700'
                      : 'opacity-40 bg-slate-950 border-slate-900'
                  }`}
                >
                  <div className="text-xl">{u.icon}</div>
                  <div className="text-[10px] font-bold text-white truncate mt-0.5">{u.nameAr.split(' ')[0]}</div>
                  <div className="text-[9px] font-extrabold text-cyan-400 mt-0.5">{u.energyCost} ⚡</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Combat Phase: Live Commander Abilities Tray */}
      {phase === 'combat' && (
        <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800">
          <div className="text-[11px] font-bold text-slate-400 mb-2 flex items-center justify-between">
            <span>⚡ قدرات القائد المدارية (تدخل فوري):</span>
            <span className="text-[10px] text-cyan-400">{energy} طاقة نانو</span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {COMMANDER_ABILITIES.map((ability) => {
              const isCooling = (abilityCooldowns[ability.id] || 0) > Date.now();
              const canCast = energy >= ability.energyCost && !isCooling;

              return (
                <button
                  key={ability.id}
                  onClick={() => handleUseAbility(ability)}
                  disabled={!canCast}
                  className={`p-2 rounded-xl border text-center transition-all ${
                    canCast
                      ? 'bg-indigo-900/40 border-indigo-500/50 hover:bg-indigo-800/60 shadow-lg active:scale-95'
                      : 'opacity-40 bg-slate-950 border-slate-900'
                  }`}
                >
                  <div className="text-xl">{ability.icon}</div>
                  <div className="text-[10px] font-bold text-white truncate mt-0.5">{ability.nameAr.split(' ')[0]}</div>
                  <div className="text-[9px] text-cyan-400 font-bold">{ability.energyCost} ⚡</div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Combat Ticker Log */}
      <div className="bg-slate-950/70 rounded-xl p-2.5 border border-slate-800/80 max-h-24 overflow-y-auto font-mono text-[10px] space-y-1">
        {combatLogs.length === 0 ? (
          <div className="text-slate-600 text-center">سجل التكتيكات والأضرار جاهز...</div>
        ) : (
          combatLogs.map((log) => (
            <div
              key={log.id}
              className={`${
                log.type === 'kill'
                  ? 'text-red-400 font-bold'
                  : log.type === 'ability'
                  ? 'text-purple-300 font-bold'
                  : log.type === 'damage'
                  ? 'text-cyan-400'
                  : 'text-slate-400'
              }`}
            >
              • {log.textAr}
            </div>
          ))
        )}
      </div>

      {/* Game Over Modal */}
      {phase === 'gameover' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl p-6 border border-slate-800 max-w-sm w-full text-center shadow-2xl animate-scaleUp">
            <div className="text-5xl mb-3">
              {winner === 'player' ? '🏆' : '💀'}
            </div>
            <h2 className="text-2xl font-black text-white">
              {winner === 'player' ? 'نصر تكتيكي ساحق!' : 'هزيمة في الميدان'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {winner === 'player' 
                ? 'تم القضاء على جميع قوات الخصم واستعادة السيطرة على القطاع.'
                : 'دمرت قوات الخصم دفاعاتك. حسّن عتادك وأعد الكرّة.'}
            </p>

            {/* Rewards */}
            <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800 my-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] text-slate-400">الكؤوس</div>
                <div className={`text-sm font-extrabold ${winner === 'player' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {winner === 'player' ? '+35 🏆' : '-15 🏆'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">غبار النجوم</div>
                <div className="text-sm font-extrabold text-cyan-300">
                  {winner === 'player' ? '+150 💎' : '+25 💎'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">نجوم تلجرام</div>
                <div className="text-sm font-extrabold text-amber-400">
                  {winner === 'player' && stakeStars > 0 ? `+${Math.floor(stakeStars * 1.8)} 🌟` : '—'}
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                sound.playClick();
                onExit();
              }}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-extrabold text-sm rounded-xl shadow-lg active:scale-95 transition-all"
            >
              العودة للردهة
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
