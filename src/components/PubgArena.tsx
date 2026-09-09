import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { 
  ArrowLeft, Crosshair, Shield, Zap, Share2, Copy, Check, 
  RefreshCw, PlusCircle, Radio, Trophy, Skull
} from 'lucide-react';
import { UserProfile } from '../types';
import { 
  WeaponType, PlayerCharacter, Bullet, Obstacle, 
  LootItem, SafeZone, Particle 
} from '../game/types';
import { WEAPONS } from '../game/weaponsData';
import { generateBattleMap, MAP_WIDTH, MAP_HEIGHT } from '../game/mapGenerator';
import { resolveCollisions, updateBullets, updateSafeZone, isOutsideZone, checkCircleRect } from '../game/physicsEngine';
import { multiplayer, ConnectionStatus } from '../services/multiplayer';
import { sound } from '../audio/soundEngine';

interface PubgArenaProps {
  user: UserProfile;
  roomCode: string;
  mode: 'host' | 'join' | 'ai';
  stakeStars: number;
  onExit: () => void;
  onMatchComplete: (won: boolean, trophiesDelta: number, dustDelta: number, starsDelta: number) => void;
}

export const PubgArena: React.FC<PubgArenaProps> = ({
  user,
  roomCode,
  mode,
  stakeStars,
  onExit,
  onMatchComplete
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('connecting');
  const [opponentName, setOpponentName] = useState<string>(mode === 'ai' ? 'بوت تدريب (AI Sniper)' : 'في انتظار الخصم...');
  const [gameOver, setGameOver] = useState<'victory' | 'defeat' | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // HUD Stats
  const [playerHp, setPlayerHp] = useState<number>(100);
  const [playerArmor, setPlayerArmor] = useState<number>(0);
  const [activeWeaponType, setActiveWeaponType] = useState<WeaponType>('ak47');
  const [clipAmmo, setClipAmmo] = useState<number>(30);
  const [reserveAmmo, setReserveAmmo] = useState<number>(90);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [zoneTimer, setZoneTimer] = useState<number>(35);
  const [kills, setKills] = useState<number>(0);
  const [outsideZoneWarning, setOutsideZoneWarning] = useState<boolean>(false);
  const [medkitsCount, setMedkitsCount] = useState<number>(1);

  // Game Engine Internal State (Refs for 60fps loop)
  const mapDataRef = useRef<{ obstacles: Obstacle[]; lootItems: LootItem[] }>(generateBattleMap());
  const bulletsRef = useRef<Bullet[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  
  const playerRef = useRef<PlayerCharacter>({
    id: user.id,
    name: user.firstName,
    x: mode === 'join' ? 1650 : 450,
    y: mode === 'join' ? 1650 : 450,
    radius: 20,
    angle: 0,
    hp: 100,
    maxHp: 100,
    armor: 25,
    maxArmor: 100,
    speed: 4.8,
    activeWeapon: 'ak47',
    ammoInClip: 30,
    reserveAmmo: 90,
    isReloading: false,
    reloadProgress: 0,
    lastFireTime: 0,
    isInsideBush: false,
    color: '#06b6d4',
    kills: 0
  });

  const opponentRef = useRef<PlayerCharacter>({
    id: 999999,
    name: mode === 'ai' ? 'بوت تدريب' : 'الخصم',
    x: mode === 'join' ? 450 : 1650,
    y: mode === 'join' ? 450 : 1650,
    radius: 20,
    angle: Math.PI,
    hp: 100,
    maxHp: 100,
    armor: 25,
    maxArmor: 100,
    speed: 4.2,
    activeWeapon: 'ak47',
    ammoInClip: 30,
    reserveAmmo: 90,
    isReloading: false,
    reloadProgress: 0,
    lastFireTime: 0,
    isInsideBush: false,
    color: '#ef4444',
    kills: 0
  });

  const safeZoneRef = useRef<SafeZone>({
    x: MAP_WIDTH / 2,
    y: MAP_HEIGHT / 2,
    radius: 1050,
    targetRadius: 180,
    shrinkSpeed: 24,
    isShrinking: true,
    damagePerSec: 6
  });

  // Controls input tracking
  const keysRef = useRef<{ [key: string]: boolean }>({});
  const mouseRef = useRef<{ x: number; y: number; isDown: boolean }>({ x: 0, y: 0, isDown: false });
  const isShootingRef = useRef<boolean>(false);

  // 1. Networking & P2P Setup
  useEffect(() => {
    multiplayer.init(
      user.id,
      (msg) => {
        if (msg.type === 'JOIN_ROOM') {
          setOpponentName(msg.payload.playerName || 'لاعب متصل');
          setConnStatus('connected');
          opponentRef.current.name = msg.payload.playerName || 'الخصم';
        } else if (msg.type === 'SYNC_SHOOTER_STATE') {
          const s = msg.payload;
          if (s) {
            opponentRef.current.x = s.x;
            opponentRef.current.y = s.y;
            opponentRef.current.angle = s.angle;
            opponentRef.current.hp = s.hp;
            opponentRef.current.armor = s.armor;
            opponentRef.current.activeWeapon = s.activeWeapon;
          }
        } else if (msg.type === 'SHOOT_BULLETS') {
          const newBullets = msg.payload.bullets;
          if (Array.isArray(newBullets)) {
            bulletsRef.current.push(...newBullets);
            sound.playGunshot(newBullets[0]?.weaponType || 'ak47');
          }
        } else if (msg.type === 'BULLET_HIT') {
          if (msg.payload.victimId === user.id) {
            handleTakeDamage(msg.payload.damage);
          }
        } else if (msg.type === 'LOOT_TAKEN') {
          mapDataRef.current.lootItems = mapDataRef.current.lootItems.filter(i => i.id !== msg.payload.lootId);
        } else if (msg.type === 'GAME_OVER') {
          if (msg.payload.winnerId === user.id) {
            triggerVictory();
          } else {
            triggerDefeat();
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
    }

    return () => {
      multiplayer.cleanup();
    };
  }, []);

  // 2. Keyboard & Mouse Controls Listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === 'r') {
        handleReload();
      } else if (e.key === '1') {
        switchWeapon('ak47');
      } else if (e.key === '2') {
        switchWeapon('shotgun');
      } else if (e.key === '3') {
        switchWeapon('awm');
      } else if (e.key.toLowerCase() === 'e') {
        useMedkit();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        mouseRef.current.isDown = true;
        isShootingRef.current = true;
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        mouseRef.current.isDown = false;
        isShootingRef.current = false;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // 3. Zone Countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setZoneTimer(t => {
        if (t <= 1) return 30;
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Shoot Bullet Function
  const shootCurrentWeapon = () => {
    const p = playerRef.current;
    if (p.isReloading || p.ammoInClip <= 0) {
      if (p.ammoInClip <= 0 && !p.isReloading) {
        handleReload();
      }
      return;
    }

    const now = Date.now();
    const weapon = WEAPONS[p.activeWeapon];
    if (now - p.lastFireTime < weapon.fireRateMs) return;

    p.lastFireTime = now;
    p.ammoInClip -= 1;
    setClipAmmo(p.ammoInClip);

    // Apply recoil & spread
    const firedBullets: Bullet[] = [];
    for (let i = 0; i < weapon.pellets; i++) {
      const spreadAngle = (Math.random() - 0.5) * weapon.spread;
      const finalAngle = p.angle + spreadAngle;
      const vx = Math.cos(finalAngle) * weapon.bulletSpeed;
      const vy = Math.sin(finalAngle) * weapon.bulletSpeed;

      const bullet: Bullet = {
        id: `b-${p.id}-${Date.now()}-${i}`,
        ownerId: p.id,
        x: p.x + Math.cos(p.angle) * 28,
        y: p.y + Math.sin(p.angle) * 28,
        vx,
        vy,
        damage: weapon.damage,
        rangeRemaining: weapon.range,
        color: weapon.bulletColor,
        weaponType: weapon.type
      };
      firedBullets.push(bullet);
      bulletsRef.current.push(bullet);
    }

    sound.playGunshot(weapon.type);

    // Sync bullet to network
    multiplayer.sendShootBullets(firedBullets);

    // Create muzzle flash particles
    createSparks(p.x + Math.cos(p.angle) * 30, p.y + Math.sin(p.angle) * 30, '#fef08a', 4);
  };

  // Reload Logic
  const handleReload = () => {
    const p = playerRef.current;
    const weapon = WEAPONS[p.activeWeapon];
    if (p.isReloading || p.ammoInClip === weapon.magazineSize || p.reserveAmmo <= 0) return;

    p.isReloading = true;
    setIsReloading(true);
    sound.playReload();

    setTimeout(() => {
      const needed = weapon.magazineSize - p.ammoInClip;
      const reloadAmount = Math.min(needed, p.reserveAmmo);
      p.ammoInClip += reloadAmount;
      p.reserveAmmo -= reloadAmount;
      p.isReloading = false;
      setIsReloading(false);
      setClipAmmo(p.ammoInClip);
      setReserveAmmo(p.reserveAmmo);
    }, weapon.reloadTimeMs);
  };

  // Switch Weapon
  const switchWeapon = (type: WeaponType) => {
    sound.playPickup();
    const p = playerRef.current;
    p.activeWeapon = type;
    const w = WEAPONS[type];
    p.ammoInClip = w.magazineSize;
    p.isReloading = false;
    setIsReloading(false);
    setActiveWeaponType(type);
    setClipAmmo(p.ammoInClip);
  };

  // Use Medkit
  const useMedkit = () => {
    if (medkitsCount <= 0 || playerRef.current.hp >= 100) return;
    sound.playPickup();
    setMedkitsCount(c => c - 1);
    playerRef.current.hp = Math.min(100, playerRef.current.hp + 50);
    setPlayerHp(playerRef.current.hp);
  };

  // Damage handling
  const handleTakeDamage = (amount: number) => {
    const p = playerRef.current;
    sound.playHurt();

    if (p.armor > 0) {
      const absorbed = Math.min(p.armor, Math.round(amount * 0.6));
      p.armor -= absorbed;
      p.hp -= (amount - absorbed);
    } else {
      p.hp -= amount;
    }

    setPlayerHp(Math.max(0, Math.round(p.hp)));
    setPlayerArmor(Math.max(0, Math.round(p.armor)));

    if (p.hp <= 0) {
      triggerDefeat();
    }
  };

  const triggerVictory = () => {
    if (gameOver) return;
    setGameOver('victory');
    sound.playReveal('mythic');
    confetti({ particleCount: 100, spread: 80, origin: { y: 0.5 } });
    multiplayer.sendGameOver(user.id);
    const starReward = stakeStars > 0 ? Math.floor(stakeStars * 1.8) : 0;
    onMatchComplete(true, 50, 200, starReward);
  };

  const triggerDefeat = () => {
    if (gameOver) return;
    setGameOver('defeat');
    sound.playClick();
    onMatchComplete(false, -20, 30, 0);
  };

  const createSparks = (x: number, y: number, color: string, count: number = 5) => {
    for (let i = 0; i < count; i++) {
      particlesRef.current.push({
        x,
        y,
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
        life: 0,
        maxLife: 15 + Math.random() * 10,
        color,
        size: 2 + Math.random() * 2
      });
    }
  };

  // 4. MAIN 60 FPS CANVAS GAME LOOP
  useEffect(() => {
    let animId: number;
    let lastNetworkSync = 0;
    let lastZoneDamage = 0;

    const gameLoop = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const p = playerRef.current;
      const opp = opponentRef.current;
      const zone = safeZoneRef.current;
      const obstacles = mapDataRef.current.obstacles;
      const lootItems = mapDataRef.current.lootItems;

      // Adjust canvas resolution dynamically
      const width = canvas.parentElement?.clientWidth || 380;
      const height = canvas.parentElement?.clientHeight || 480;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // 1. Move Player
      let moveX = 0;
      let moveY = 0;
      const keys = keysRef.current;
      if (keys['w'] || keys['arrowup']) moveY -= 1;
      if (keys['s'] || keys['arrowdown']) moveY += 1;
      if (keys['a'] || keys['arrowleft']) moveX -= 1;
      if (keys['d'] || keys['arrowright']) moveX += 1;

      if (moveX !== 0 && moveY !== 0) {
        moveX *= 0.7071;
        moveY *= 0.7071;
      }

      p.x += moveX * p.speed;
      p.y += moveY * p.speed;

      // Boundary clamp
      p.x = Math.max(45, Math.min(MAP_WIDTH - 45, p.x));
      p.y = Math.max(45, Math.min(MAP_HEIGHT - 45, p.y));

      // Resolve wall collisions
      resolveCollisions(p, obstacles);

      // Aim angle calculation towards mouse/touch
      const screenCenterX = width / 2;
      const screenCenterY = height / 2;
      p.angle = Math.atan2(mouseRef.current.y - screenCenterY, mouseRef.current.x - screenCenterX);

      // Continuous firing when holding mouse
      if (isShootingRef.current && !p.isReloading) {
        shootCurrentWeapon();
      }

      // Check Bush stealth
      p.isInsideBush = obstacles.some(obs => obs.type === 'bush' && checkCircleRect(p.x, p.y, p.radius, obs.x, obs.y, obs.w, obs.h));

      // Loot item collision
      for (let i = lootItems.length - 1; i >= 0; i--) {
        const item = lootItems[i];
        const dist = Math.hypot(p.x - item.x, p.y - item.y);
        if (dist < p.radius + 18) {
          // Collect item
          sound.playPickup();
          if (item.type === 'weapon' && item.weaponType) {
            switchWeapon(item.weaponType);
          } else if (item.type === 'medkit') {
            setMedkitsCount(c => c + 1);
          } else if (item.type === 'armor') {
            p.armor = 100;
            setPlayerArmor(100);
          }
          multiplayer.sendLootTaken(item.id);
          lootItems.splice(i, 1);
        }
      }

      // 2. AI Opponent Simulation (if mode === 'ai')
      if (mode === 'ai' && opp.hp > 0 && !gameOver) {
        const distToPlayer = Math.hypot(p.x - opp.x, p.y - opp.y);
        opp.angle = Math.atan2(p.y - opp.y, p.x - opp.x);

        // Move towards safe zone or towards player
        if (isOutsideZone(opp.x, opp.y, zone)) {
          opp.x += Math.cos(Math.atan2(zone.y - opp.y, zone.x - opp.x)) * opp.speed;
          opp.y += Math.sin(Math.atan2(zone.y - opp.y, zone.x - opp.x)) * opp.speed;
        } else if (distToPlayer > 280) {
          opp.x += Math.cos(opp.angle) * opp.speed * 0.8;
          opp.y += Math.sin(opp.angle) * opp.speed * 0.8;
        }

        resolveCollisions(opp, obstacles);

        // AI fires if in range and line of sight
        const now = Date.now();
        if (distToPlayer < 650 && now - opp.lastFireTime > 260) {
          opp.lastFireTime = now;
          const spread = (Math.random() - 0.5) * 0.12;
          const finalAngle = opp.angle + spread;
          bulletsRef.current.push({
            id: `b-ai-${now}`,
            ownerId: opp.id,
            x: opp.x + Math.cos(opp.angle) * 25,
            y: opp.y + Math.sin(opp.angle) * 25,
            vx: Math.cos(finalAngle) * 19,
            vy: Math.sin(finalAngle) * 19,
            damage: 18,
            rangeRemaining: 700,
            color: '#f87171',
            weaponType: 'ak47'
          });
          sound.playGunshot('ak47');
        }
      }

      // 3. Update Safe Zone
      updateSafeZone(zone, 16);
      const isPlayerOutside = isOutsideZone(p.x, p.y, zone);
      setOutsideZoneWarning(isPlayerOutside);

      const now = Date.now();
      if (isPlayerOutside && now - lastZoneDamage > 1000) {
        lastZoneDamage = now;
        handleTakeDamage(zone.damagePerSec);
      }

      // 4. Update Bullets
      bulletsRef.current = updateBullets(
        bulletsRef.current,
        obstacles,
        [p, opp],
        (victimId, damage) => {
          if (victimId === p.id) {
            handleTakeDamage(damage);
          } else if (victimId === opp.id) {
            opp.hp -= damage;
            createSparks(opp.x, opp.y, '#ef4444', 8);
            if (opp.hp <= 0 && !gameOver) {
              opp.hp = 0;
              setKills(k => k + 1);
              triggerVictory();
            }
          }
        },
        (sx, sy, color) => createSparks(sx, sy, color, 4)
      );

      // 5. Update Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pt = particlesRef.current[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life++;
        if (pt.life >= pt.maxLife) {
          particlesRef.current.splice(i, 1);
        }
      }

      // 6. Network Position Sync (every 50ms)
      if (now - lastNetworkSync > 50 && mode !== 'ai') {
        lastNetworkSync = now;
        multiplayer.sendShooterState({
          x: Math.round(p.x),
          y: Math.round(p.y),
          angle: Number(p.angle.toFixed(2)),
          hp: p.hp,
          armor: p.armor,
          activeWeapon: p.activeWeapon
        });
      }

      // ==================== RENDERING ====================
      ctx.clearRect(0, 0, width, height);

      // Camera Transform: center on player
      ctx.save();
      ctx.translate(screenCenterX - p.x, screenCenterY - p.y);

      // 1. Draw Military Map Ground (Grid & Terrain)
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT);

      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      const gridSize = 100;
      for (let x = 0; x <= MAP_WIDTH; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, MAP_HEIGHT);
        ctx.stroke();
      }
      for (let y = 0; y <= MAP_HEIGHT; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(MAP_WIDTH, y);
        ctx.stroke();
      }

      // 2. Draw Safe Zone Storm Circle
      ctx.beginPath();
      ctx.arc(zone.x, zone.y, zone.radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 3. Draw Loot Items on Ground
      lootItems.forEach(item => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(item.x, item.y, 14, 0, Math.PI * 2);
        ctx.fillStyle = `${item.color}33`;
        ctx.fill();
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.icon, item.x, item.y);
        ctx.restore();
      });

      // 4. Draw Obstacles & Buildings
      obstacles.forEach(obs => {
        if (obs.type === 'bush') {
          // Bush
          ctx.save();
          ctx.beginPath();
          ctx.arc(obs.x + obs.w / 2, obs.y + obs.h / 2, obs.w / 2, 0, Math.PI * 2);
          ctx.fillStyle = '#166534';
          ctx.fill();
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        } else {
          // Building / Wall / Crate
          ctx.fillStyle = obs.color;
          ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 2;
          ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);

          // Diagonal hatch line for crates
          if (obs.type === 'crate') {
            ctx.beginPath();
            ctx.moveTo(obs.x, obs.y);
            ctx.lineTo(obs.x + obs.w, obs.y + obs.h);
            ctx.strokeStyle = 'rgba(255,255,255,0.2)';
            ctx.stroke();
          }
        }
      });

      // 5. Draw Bullets & Tracers
      bulletsRef.current.forEach(b => {
        ctx.save();
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.restore();
      });

      // 6. Draw Particles
      particlesRef.current.forEach(pt => {
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x, pt.y, pt.size, pt.size);
      });

      // 7. Draw Opponent Player
      if (opp.hp > 0) {
        ctx.save();
        ctx.translate(opp.x, opp.y);
        ctx.rotate(opp.angle);

        // Alpha if inside bush
        if (opp.isInsideBush && !p.isInsideBush) {
          ctx.globalAlpha = 0.2;
        }

        // Weapon barrel
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(10, -3, 20, 6);

        // Body circle
        ctx.beginPath();
        ctx.arc(0, 0, opp.radius, 0, Math.PI * 2);
        ctx.fillStyle = opp.color;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Helmet/Head
        ctx.beginPath();
        ctx.arc(4, 0, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();

        ctx.restore();

        // Opponent Name & Health Bar (Overhead)
        ctx.save();
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(opp.name, opp.x, opp.y - 30);

        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(opp.x - 20, opp.y - 25, 40, 5);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(opp.x - 20, opp.y - 25, (opp.hp / 100) * 40, 5);
        ctx.restore();
      }

      // 8. Draw Main Player
      if (p.hp > 0) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);

        // Weapon barrel
        ctx.fillStyle = '#334155';
        ctx.fillRect(12, -4, 22, 8);

        // Body
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Military Helmet
        ctx.beginPath();
        ctx.arc(4, 0, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();

        // Armor indicator aura
        if (p.armor > 0) {
          ctx.beginPath();
          ctx.arc(0, 0, p.radius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.restore();
      }

      ctx.restore(); // Restore camera transform

      // Red Storm Warning Screen Flash
      if (outsideZoneWarning) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
        ctx.fillRect(0, 0, width, height);
      }

      if (!gameOver) {
        animId = requestAnimationFrame(gameLoop);
      }
    };

    animId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animId);
  }, [gameOver, outsideZoneWarning]);

  // Mobile Touch Controls Helpers
  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current.x = touch.clientX - rect.left;
    mouseRef.current.y = touch.clientY - rect.top;
  };

  const handleCopyCode = () => {
    sound.playClick();
    navigator.clipboard.writeText(roomCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const shareLink = `https://t.me/share/url?url=${encodeURIComponent(`https://t.me/YOUR_BOT?startapp=pvp_${roomCode}`)}&text=${encodeURIComponent(`تحداني في معركة PUBG 1v1 نارية الآن! ⚔️ كود الغرفة: ${roomCode}`)}`;

  const handleShareToTelegram = () => {
    sound.playClick();
    if (typeof window !== 'undefined' && (window as any).Telegram?.WebApp?.openTelegramLink) {
      (window as any).Telegram.WebApp.openTelegramLink(shareLink);
    } else {
      window.open(shareLink, '_blank');
    }
  };

  return (
    <div className="relative w-full h-[650px] max-w-md mx-auto bg-slate-950 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col select-none">
      {/* Top HUD Bar: PUBG Vibe */}
      <div className="absolute top-2 inset-x-2 z-20 flex items-center justify-between pointer-events-none">
        {/* Left: Exit button & Opponent Status */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={() => {
              sound.playClick();
              onExit();
            }}
            className="p-2 bg-slate-900/80 hover:bg-slate-800 text-slate-300 rounded-xl border border-slate-700/60 backdrop-blur-md"
          >
            <ArrowLeft className="w-4 h-4 transform rotate-180" />
          </button>

          <div className="bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-xl border border-slate-700/60 flex items-center gap-2">
            <Radio className={`w-3.5 h-3.5 ${connStatus === 'connected' ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
            <div className="text-right">
              <div className="text-xs font-bold text-white leading-none">{opponentName}</div>
              <div className="text-[9px] text-slate-400 font-mono">غرفة: {roomCode}</div>
            </div>
          </div>
        </div>

        {/* Center: Alive & Kills Count */}
        <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-xl border border-slate-700/60 flex items-center gap-3">
          <div className="flex items-center gap-1 text-emerald-400 font-extrabold text-xs">
            <span>الأحياء:</span>
            <span>{gameOver === 'victory' ? '1' : '2'}</span>
          </div>
          <div className="w-[1px] h-3 bg-slate-700" />
          <div className="flex items-center gap-1 text-red-400 font-extrabold text-xs">
            <Skull className="w-3.5 h-3.5" />
            <span>{kills}</span>
          </div>
        </div>

        {/* Right: Invite & Zone Timer */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          {mode === 'host' && (
            <button
              onClick={handleShareToTelegram}
              className="px-2.5 py-1 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-bold flex items-center gap-1 shadow"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>دعوة</span>
            </button>
          )}

          <div className="bg-cyan-950/60 border border-cyan-500/40 text-cyan-300 px-2.5 py-1 rounded-xl text-xs font-mono font-bold">
            ⚡ {zoneTimer}s
          </div>
        </div>
      </div>

      {/* Main Canvas Viewport */}
      <div className="flex-1 w-full h-full relative cursor-crosshair">
        <canvas
          ref={canvasRef}
          className="w-full h-full block touch-none"
          onTouchMove={handleTouchMove}
        />

        {/* Outside Safe Zone Danger Alert */}
        {outsideZoneWarning && (
          <div className="absolute top-16 inset-x-0 mx-auto w-max bg-red-600/90 text-white text-[11px] font-black px-4 py-1 rounded-full animate-bounce shadow-lg">
            ⚠️ أنت خارج الزون! اركض نحو الدائرة الآمنة!
          </div>
        )}
      </div>

      {/* Bottom HUD: Health, Armor, Weapon, & Action Buttons */}
      <div className="absolute bottom-3 inset-x-3 z-20 flex flex-col gap-2 pointer-events-auto">
        {/* Health & Armor Bars */}
        <div className="bg-slate-950/85 backdrop-blur-md p-2 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex-1 space-y-1">
            {/* Health Bar */}
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-emerald-400">الصحة (HP)</span>
              <span className="text-white font-mono">{playerHp}/100</span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-green-400 transition-all duration-200"
                style={{ width: `${playerHp}%` }}
              />
            </div>

            {/* Armor Bar */}
            {playerArmor > 0 && (
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${playerArmor}%` }}
                />
              </div>
            )}
          </div>

          {/* Medkit Quick Button */}
          <button
            onClick={useMedkit}
            disabled={medkitsCount <= 0 || playerHp >= 100}
            className="px-3 py-2 bg-emerald-950/60 border border-emerald-500/40 hover:bg-emerald-800/60 disabled:opacity-40 text-emerald-300 rounded-xl flex flex-col items-center justify-center text-xs font-bold"
          >
            <span>🩹 x{medkitsCount}</span>
            <span className="text-[9px] text-slate-400">علاج [E]</span>
          </button>
        </div>

        {/* Weapon Arsenal & Reloading Strip */}
        <div className="bg-slate-950/90 backdrop-blur-md p-2 rounded-2xl border border-slate-800 flex items-center justify-between">
          {/* Active Gun Info */}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-2xl">
              {WEAPONS[activeWeaponType]?.icon}
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>{WEAPONS[activeWeaponType]?.nameAr}</span>
                {isReloading && <span className="text-[10px] text-amber-400 animate-pulse">جاري التلقيم...</span>}
              </div>
              <div className="text-sm font-extrabold text-amber-400 font-mono">
                {clipAmmo} <span className="text-xs text-slate-500">/ {reserveAmmo}</span>
              </div>
            </div>
          </div>

          {/* Quick Action Controls */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleReload}
              disabled={isReloading}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1"
            >
              <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin text-amber-400' : ''}`} />
              <span>تلقيم [R]</span>
            </button>

            {/* Mobile Touch Fire Button */}
            <button
              onTouchStart={() => {
                isShootingRef.current = true;
                shootCurrentWeapon();
              }}
              onTouchEnd={() => {
                isShootingRef.current = false;
              }}
              onMouseDown={() => {
                isShootingRef.current = true;
                shootCurrentWeapon();
              }}
              onMouseUp={() => {
                isShootingRef.current = false;
              }}
              className="px-4 py-2.5 bg-gradient-to-r from-red-600 to-amber-600 text-white font-black text-xs rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-1"
            >
              <Crosshair className="w-4 h-4" />
              <span>إطلاق 🔥</span>
            </button>
          </div>
        </div>
      </div>

      {/* Game Over Screen (Winner Winner Chicken Dinner 🍗) */}
      {gameOver && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl p-6 border border-slate-800 max-w-sm w-full text-center shadow-2xl animate-scaleUp">
            <div className="text-5xl mb-2">
              {gameOver === 'victory' ? '🍗' : '💀'}
            </div>
            <h2 className="text-2xl font-black text-white">
              {gameOver === 'victory' ? 'WINNER WINNER CHICKEN DINNER!' : 'تم القضاء عليك!'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {gameOver === 'victory'
                ? 'أنت الناجي الوحيد في الساحة! نصر أسطوري مستحق.'
                : 'لقد هزمك الخصم في المواجهة النارية. عُد للانتقام!'}
            </p>

            {/* Rewards Card */}
            <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800 my-4 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[10px] text-slate-400">كؤوس</div>
                <div className={`text-sm font-extrabold ${gameOver === 'victory' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {gameOver === 'victory' ? '+50 🏆' : '-20 🏆'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">غبار النجوم</div>
                <div className="text-sm font-extrabold text-cyan-300">
                  {gameOver === 'victory' ? '+200 💎' : '+30 💎'}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-400">نجوم تلجرام</div>
                <div className="text-sm font-extrabold text-amber-400">
                  {gameOver === 'victory' && stakeStars > 0 ? `+${Math.floor(stakeStars * 1.8)} 🌟` : '—'}
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
              العودة للرئيسية
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
