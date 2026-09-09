import React, { useState, useEffect, useRef } from 'react';
import confetti from 'canvas-confetti';
import { 
  ArrowLeft, Crosshair, Shield, Zap, Radio, 
  Trophy, Skull, Compass, RefreshCw, Flame, Bomb, Rocket
} from 'lucide-react';
import { UserProfile } from '../types';
import { MapId } from '../game3d/types3d';
import { multiplayer, ConnectionStatus } from '../services/multiplayer';
import { sound } from '../audio/soundEngine';
import { tgHaptics } from '../services/telegramHaptics';

interface CyberWarzoneArenaProps {
  user: UserProfile;
  roomCode: string;
  mode: 'host' | 'join' | 'ai';
  stakeStars: number;
  mapId?: MapId;
  onExit: () => void;
  onMatchComplete: (won: boolean, trophiesDelta: number, dustDelta: number, starsDelta: number) => void;
}

// Tactical Weapons System
export type WarzoneWeaponType = 'ak47' | 'rpg' | 'shotgun';

interface WarzoneWeapon {
  id: WarzoneWeaponType;
  name: string;
  nameAr: string;
  icon: string;
  damage: number;
  fireRateMs: number;
  magazineSize: number;
  ammoInClip: number;
  reserveAmmo: number;
  reloadTimeMs: number;
  speed: number;
  bulletColor: string;
  isRocket?: boolean;
}

interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  isRocket: boolean;
  radius: number;
  ownerId: number;
  life: number;
  color: string;
}

interface Explosion {
  id: number;
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  life: number;
  maxLife: number;
  color: string;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

interface FloatingText {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
}

interface Decal {
  x: number;
  y: number;
  radius: number;
  type: 'scorch' | 'blood';
}

interface Obstacle {
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'wall' | 'barrel' | 'container' | 'crate';
  hp?: number;
  maxHp?: number;
}

interface CarePackage {
  x: number;
  y: number;
  weapon: WarzoneWeaponType;
  isOpened: boolean;
  pulse: number;
}

const ARENA_WIDTH = 1800;
const ARENA_HEIGHT = 1400;

export const CyberWarzoneArena: React.FC<CyberWarzoneArenaProps> = ({
  user,
  roomCode,
  mode,
  stakeStars,
  mapId = 'warehouse',
  onExit,
  onMatchComplete
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('connecting');
  const [opponentName, setOpponentName] = useState<string>(mode === 'ai' ? 'بوت تكتيكي (AI Bot)' : 'في انتظار الخصم...');
  const [gameOver, setGameOver] = useState<'victory' | 'defeat' | null>(null);

  // Player State
  const [hp, setHp] = useState<number>(100);
  const [armor, setArmor] = useState<number>(50);
  const [medkits, setMedkits] = useState<number>(2);
  const [kills, setKills] = useState<number>(0);
  const [zoneTimer, setZoneTimer] = useState<number>(60);
  const [isReloading, setIsReloading] = useState<boolean>(false);

  // Weapons State
  const [activeWeaponType, setActiveWeaponType] = useState<WarzoneWeaponType>('ak47');
  const [weapons, setWeapons] = useState<Record<WarzoneWeaponType, WarzoneWeapon>>({
    ak47: {
      id: 'ak47',
      name: 'Cyber AK-47',
      nameAr: 'رشاش هجومي AK-47',
      icon: '⚡',
      damage: 32,
      fireRateMs: 110,
      magazineSize: 30,
      ammoInClip: 30,
      reserveAmmo: 150,
      reloadTimeMs: 1800,
      speed: 18,
      bulletColor: '#00f2fe'
    },
    rpg: {
      id: 'rpg',
      name: 'RPG-7 Bazooka',
      nameAr: 'قاذف صواريخ RPG-7',
      icon: '🚀',
      damage: 160,
      fireRateMs: 1100,
      magazineSize: 1,
      ammoInClip: 1,
      reserveAmmo: 8,
      reloadTimeMs: 2500,
      speed: 10,
      bulletColor: '#f97316',
      isRocket: true
    },
    shotgun: {
      id: 'shotgun',
      name: 'Combat Shotgun',
      nameAr: 'شوزن قتالي ثقيل',
      icon: '💥',
      damage: 22, // x 6 pellets
      fireRateMs: 750,
      magazineSize: 6,
      ammoInClip: 6,
      reserveAmmo: 36,
      reloadTimeMs: 2200,
      speed: 15,
      bulletColor: '#fbbf24'
    }
  });

  // Game Engine Refs
  const playerPos = useRef({ x: 300, y: 300, vx: 0, vy: 0, angle: 0 });
  const opponentPos = useRef({ x: 1500, y: 1100, vx: 0, vy: 0, angle: Math.PI, hp: 100, armor: 50 });
  const cameraOffset = useRef({ x: 0, y: 0 });
  const cameraShake = useRef(0);

  const keys = useRef<Record<string, boolean>>({});
  const mousePos = useRef({ x: 0, y: 0, isDown: false });

  // Virtual Joypad Touch Refs (Mobile)
  const leftJoy = useRef<{ active: boolean; startX: number; startY: number; curX: number; curY: number }>({
    active: false, startX: 0, startY: 0, curX: 0, curY: 0
  });
  const rightJoy = useRef<{ active: boolean; startX: number; startY: number; curX: number; curY: number }>({
    active: false, startX: 0, startY: 0, curX: 0, curY: 0
  });

  const projectiles = useRef<Projectile[]>([]);
  const explosions = useRef<Explosion[]>([]);
  const particles = useRef<Particle[]>([]);
  const decals = useRef<Decal[]>([]);
  const floatingTexts = useRef<FloatingText[]>([]);
  const lastFireTime = useRef(0);
  const lastDashTime = useRef(0);
  const isDashing = useRef(false);

  // Safe Zone
  const safeZone = useRef({ x: ARENA_WIDTH / 2, y: ARENA_HEIGHT / 2, radius: 850, targetRadius: 180 });

  // Tactical Obstacles & Barrels
  const obstacles = useRef<Obstacle[]>([
    // Central Compound
    { x: 750, y: 550, w: 300, h: 40, type: 'wall' },
    { x: 750, y: 810, w: 300, h: 40, type: 'wall' },
    { x: 750, y: 590, w: 40, h: 220, type: 'wall' },
    { x: 1010, y: 590, w: 40, h: 220, type: 'wall' },

    // Shipping Containers
    { x: 450, y: 400, w: 140, h: 70, type: 'container' },
    { x: 1200, y: 400, w: 140, h: 70, type: 'container' },
    { x: 450, y: 900, w: 140, h: 70, type: 'container' },
    { x: 1200, y: 900, w: 140, h: 70, type: 'container' },

    // Red Explosive Barrels
    { x: 620, y: 450, w: 45, h: 45, type: 'barrel', hp: 30, maxHp: 30 },
    { x: 1140, y: 450, w: 45, h: 45, type: 'barrel', hp: 30, maxHp: 30 },
    { x: 620, y: 950, w: 45, h: 45, type: 'barrel', hp: 30, maxHp: 30 },
    { x: 1140, y: 950, w: 45, h: 45, type: 'barrel', hp: 30, maxHp: 30 },
    { x: 880, y: 700, w: 45, h: 45, type: 'barrel', hp: 30, maxHp: 30 },

    // Wooden Crates
    { x: 300, y: 650, w: 60, h: 60, type: 'crate', hp: 40, maxHp: 40 },
    { x: 1450, y: 650, w: 60, h: 60, type: 'crate', hp: 40, maxHp: 40 }
  ]);

  // Care Packages (Airdrops)
  const carePackages = useRef<CarePackage[]>([
    { x: 900, y: 700, weapon: 'rpg', isOpened: false, pulse: 0 },
    { x: 400, y: 1100, weapon: 'rpg', isOpened: false, pulse: 0 },
    { x: 1400, y: 300, weapon: 'shotgun', isOpened: false, pulse: 0 }
  ]);

  // P2P Multiplayer Integration
  useEffect(() => {
    if (mode === 'ai') {
      multiplayer.startAiMatch();
      setConnStatus('connected');
      return;
    }

    multiplayer.init(
      user.id,
      (msg) => {
        if (msg.type === ('SYNC_SHOOTER_STATE' as any)) {
          opponentPos.current.x = msg.payload.x;
          opponentPos.current.y = msg.payload.y;
          opponentPos.current.angle = msg.payload.angle || 0;
        } else if (msg.type === ('SHOOT_BULLETS' as any)) {
          spawnOpponentBullet(msg.payload.bullets?.[0] || {});
        } else if (msg.type === ('BULLET_HIT' as any)) {
          takeDamage(msg.payload.damage);
        } else if (msg.type === 'GAME_OVER') {
          handleDefeat();
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
    }

    return () => {
      multiplayer.cleanup();
    };
  }, [mode, roomCode, user.id, user.firstName]);

  // Safe Zone Shrink Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setZoneTimer((prev) => {
        if (prev <= 1) {
          safeZone.current.radius = Math.max(safeZone.current.targetRadius, safeZone.current.radius - 80);
          return 25;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Main 60 FPS Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Keyboard Handlers
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
      if (e.key === ' ' || e.code === 'Space') {
        triggerDash();
      } else if (e.key === '1') {
        switchWeapon('ak47');
      } else if (e.key === '2') {
        switchWeapon('rpg');
      } else if (e.key === '3') {
        switchWeapon('shotgun');
      } else if (e.key.toLowerCase() === 'r') {
        reloadWeapon();
      } else if (e.key.toLowerCase() === 'e') {
        useMedkit();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };
    const onMouseMove = (e: MouseEvent) => {
      mousePos.current.x = e.clientX;
      mousePos.current.y = e.clientY;
    };
    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) mousePos.current.isDown = true;
      if (e.button === 2) {
        e.preventDefault();
        switchWeapon(activeWeaponType === 'rpg' ? 'ak47' : 'rpg');
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) mousePos.current.isDown = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);

    // GAME LOOP FUNCTION
    const render = () => {
      updateGamePhysics();
      drawGameScene(ctx, canvas);
      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [activeWeaponType, weapons, isReloading, medkits, gameOver]);

  // UPDATE GAME PHYSICS
  const updateGamePhysics = () => {
    if (gameOver) return;

    const p = playerPos.current;
    let moveX = 0;
    let moveY = 0;

    // Keyboard WASD
    if (keys.current['w'] || keys.current['arrowup']) moveY -= 1;
    if (keys.current['s'] || keys.current['arrowdown']) moveY += 1;
    if (keys.current['a'] || keys.current['arrowleft']) moveX -= 1;
    if (keys.current['d'] || keys.current['arrowright']) moveX += 1;

    // Touch Left Joystick
    if (leftJoy.current.active) {
      const dx = leftJoy.current.curX - leftJoy.current.startX;
      const dy = leftJoy.current.curY - leftJoy.current.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 8) {
        moveX = dx / dist;
        moveY = dy / dist;
      }
    }

    // Normalize & Speed
    const speed = isDashing.current ? 12 : 5.2;
    if (moveX !== 0 || moveY !== 0) {
      const mag = Math.sqrt(moveX * moveX + moveY * moveY);
      p.vx = (moveX / mag) * speed;
      p.vy = (moveY / mag) * speed;

      // Spawn dust particle
      if (Math.random() < 0.25) {
        particles.current.push({
          x: p.x + (Math.random() * 12 - 6),
          y: p.y + (Math.random() * 12 - 6),
          vx: -p.vx * 0.2,
          vy: -p.vy * 0.2,
          life: 1,
          maxLife: 18,
          size: Math.random() * 4 + 3,
          color: mapId === 'desert' ? '#d97706' : '#64748b'
        });
      }
    } else {
      p.vx *= 0.75;
      p.vy *= 0.75;
    }

    // Apply movement with obstacle collisions
    let nextX = p.x + p.vx;
    let nextY = p.y + p.vy;

    // Arena boundary clamp
    nextX = Math.max(30, Math.min(ARENA_WIDTH - 30, nextX));
    nextY = Math.max(30, Math.min(ARENA_HEIGHT - 30, nextY));

    // Collision with Obstacles
    for (const obs of obstacles.current) {
      if (obs.hp !== undefined && obs.hp <= 0) continue;
      if (
        nextX + 22 > obs.x &&
        nextX - 22 < obs.x + obs.w &&
        nextY + 22 > obs.y &&
        nextY - 22 < obs.y + obs.h
      ) {
        // Slide response
        if (p.x + 22 <= obs.x || p.x - 22 >= obs.x + obs.w) p.vx = 0;
        if (p.y + 22 <= obs.y || p.y - 22 >= obs.y + obs.h) p.vy = 0;
        nextX = p.x + p.vx;
        nextY = p.y + p.vy;
      }
    }

    p.x = nextX;
    p.y = nextY;

    // Angle calculation: Mouse or Touch Right Joystick
    if (rightJoy.current.active) {
      const rdx = rightJoy.current.curX - rightJoy.current.startX;
      const rdy = rightJoy.current.curY - rightJoy.current.startY;
      if (Math.sqrt(rdx * rdx + rdy * rdy) > 12) {
        p.angle = Math.atan2(rdy, rdx);
        triggerWeaponFire();
      }
    } else if (canvasRef.current) {
      const screenCenterX = window.innerWidth / 2;
      const screenCenterY = window.innerHeight / 2;
      p.angle = Math.atan2(mousePos.current.y - screenCenterY, mousePos.current.x - screenCenterX);
      if (mousePos.current.isDown) {
        triggerWeaponFire();
      }
    }

    // Send position to opponent via WebRTC P2P
    multiplayer.sendShooterState({ x: p.x, y: p.y, angle: p.angle });

    // AI Bot Behavior (if in AI mode)
    if (mode === 'ai') {
      updateAiBot();
    }

    // Safe Zone Damage check
    const distToCenter = Math.hypot(p.x - safeZone.current.x, p.y - safeZone.current.y);
    if (distToCenter > safeZone.current.radius) {
      if (Math.random() < 0.08) {
        takeDamage(4);
      }
    }

    // Care Package pickup check
    for (const cp of carePackages.current) {
      if (!cp.isOpened && Math.hypot(p.x - cp.x, p.y - cp.y) < 55) {
        cp.isOpened = true;
        sound.playPickup();
        tgHaptics.notification('success');
        setWeapons(prev => ({
          ...prev,
          rpg: { ...prev.rpg, ammoInClip: 1, reserveAmmo: prev.rpg.reserveAmmo + 3 }
        }));
        setMedkits(m => m + 1);
        floatingTexts.current.push({
          id: Date.now() + Math.random(),
          x: cp.x,
          y: cp.y - 20,
          text: '📦 عتاد ثقيل: RPG-7 + علاج!',
          color: '#f59e0b',
          life: 45
        });
      }
    }

    // Update Projectiles
    for (let i = projectiles.current.length - 1; i >= 0; i--) {
      const b = projectiles.current[i];
      b.x += b.vx;
      b.y += b.vy;
      b.life++;

      // Rocket smoke trail
      if (b.isRocket) {
        particles.current.push({
          x: b.x - b.vx * 0.4,
          y: b.y - b.vy * 0.4,
          vx: (Math.random() - 0.5) * 1.5,
          vy: (Math.random() - 0.5) * 1.5,
          life: 1,
          maxLife: 20,
          size: Math.random() * 6 + 4,
          color: Math.random() < 0.4 ? '#f97316' : '#94a3b8'
        });
      }

      // Check hit with Player (if shot by opponent)
      if (b.ownerId !== user.id && Math.hypot(b.x - p.x, b.y - p.y) < 26) {
        takeDamage(b.damage);
        if (b.isRocket) triggerExplosion(b.x, b.y, 90, b.damage);
        projectiles.current.splice(i, 1);
        continue;
      }

      // Check hit with Opponent (if shot by player)
      const opp = opponentPos.current;
      if (b.ownerId === user.id && Math.hypot(b.x - opp.x, b.y - opp.y) < 26) {
        damageOpponent(b.damage, b.isRocket);
        if (b.isRocket) triggerExplosion(b.x, b.y, 90, b.damage);
        projectiles.current.splice(i, 1);
        continue;
      }

      // Check hit with Obstacles & Barrels
      let hitObs = false;
      for (const obs of obstacles.current) {
        if (obs.hp !== undefined && obs.hp <= 0) continue;
        if (b.x >= obs.x && b.x <= obs.x + obs.w && b.y >= obs.y && b.y <= obs.y + obs.h) {
          hitObs = true;
          if (obs.type === 'barrel' && obs.hp !== undefined) {
            obs.hp -= b.damage;
            if (obs.hp <= 0) {
              triggerExplosion(obs.x + obs.w / 2, obs.y + obs.h / 2, 140, 180);
            }
          }
          if (b.isRocket) {
            triggerExplosion(b.x, b.y, 95, b.damage);
          }
          break;
        }
      }

      if (hitObs || b.life > 120 || b.x < 0 || b.x > ARENA_WIDTH || b.y < 0 || b.y > ARENA_HEIGHT) {
        projectiles.current.splice(i, 1);
      }
    }

    // Update Explosions
    for (let i = explosions.current.length - 1; i >= 0; i--) {
      const ex = explosions.current[i];
      ex.life++;
      ex.radius = (ex.life / ex.maxLife) * ex.maxRadius;

      // Area-of-Effect damage to player
      if (Math.hypot(p.x - ex.x, p.y - ex.y) < ex.radius) {
        takeDamage(Math.round(40 * (1 - ex.life / ex.maxLife)));
      }
      // AoE damage to opponent
      if (Math.hypot(opponentPos.current.x - ex.x, opponentPos.current.y - ex.y) < ex.radius) {
        damageOpponent(Math.round(50 * (1 - ex.life / ex.maxLife)), true);
      }

      if (ex.life >= ex.maxLife) {
        explosions.current.splice(i, 1);
      }
    }

    // Update Particles
    for (let i = particles.current.length - 1; i >= 0; i--) {
      const pt = particles.current[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.life++;
      if (pt.life >= pt.maxLife) {
        particles.current.splice(i, 1);
      }
    }

    // Update Floating texts
    for (let i = floatingTexts.current.length - 1; i >= 0; i--) {
      const ft = floatingTexts.current[i];
      ft.y -= 0.8;
      ft.life--;
      if (ft.life <= 0) floatingTexts.current.splice(i, 1);
    }

    // Decay camera shake
    if (cameraShake.current > 0) cameraShake.current *= 0.88;
  };

  // AI BOT CONTROLLER
  const updateAiBot = () => {
    const opp = opponentPos.current;
    const p = playerPos.current;
    const dx = p.x - opp.x;
    const dy = p.y - opp.y;
    const dist = Math.hypot(dx, dy);

    opp.angle = Math.atan2(dy, dx);

    // Flank / Chase Player
    if (dist > 280) {
      opp.vx = Math.cos(opp.angle) * 3.6;
      opp.vy = Math.sin(opp.angle) * 3.6;
    } else if (dist < 180) {
      opp.vx = -Math.cos(opp.angle) * 2.8;
      opp.vy = -Math.sin(opp.angle) * 2.8;
    } else {
      // Strafe
      opp.vx = -Math.sin(opp.angle) * 3.2;
      opp.vy = Math.cos(opp.angle) * 3.2;
    }

    opp.x = Math.max(50, Math.min(ARENA_WIDTH - 50, opp.x + opp.vx));
    opp.y = Math.max(50, Math.min(ARENA_HEIGHT - 50, opp.y + opp.vy));

    // AI Shoot
    if (Math.random() < 0.04 && dist < 550) {
      const isRocket = Math.random() < 0.15;
      const speed = isRocket ? 9 : 14;
      projectiles.current.push({
        id: Date.now() + Math.random(),
        x: opp.x + Math.cos(opp.angle) * 26,
        y: opp.y + Math.sin(opp.angle) * 26,
        vx: Math.cos(opp.angle) * speed,
        vy: Math.sin(opp.angle) * speed,
        damage: isRocket ? 130 : 25,
        isRocket,
        radius: isRocket ? 6 : 3,
        ownerId: 999999,
        life: 0,
        color: isRocket ? '#ea580c' : '#ef4444'
      });
      sound.playGunshot(isRocket ? 'awm' : 'ak47');
    }
  };

  // COMBAT ACTIONS
  const triggerWeaponFire = () => {
    const w = weapons[activeWeaponType];
    if (!w || isReloading || w.ammoInClip <= 0) {
      if (w && w.ammoInClip <= 0) reloadWeapon();
      return;
    }

    const now = Date.now();
    if (now - lastFireTime.current < w.fireRateMs) return;
    lastFireTime.current = now;

    // Decrement Ammo
    setWeapons(prev => ({
      ...prev,
      [activeWeaponType]: { ...w, ammoInClip: w.ammoInClip - 1 }
    }));

    const p = playerPos.current;
    const baseAngle = p.angle;

    // Shotgun fires 5 spread pellets; RPG & AK fire single
    const pelletCount = activeWeaponType === 'shotgun' ? 5 : 1;

    for (let i = 0; i < pelletCount; i++) {
      const spread = activeWeaponType === 'shotgun' ? (i - 2) * 0.1 : (Math.random() - 0.5) * 0.06;
      const finalAngle = baseAngle + spread;

      const bullet: Projectile = {
        id: Date.now() + Math.random(),
        x: p.x + Math.cos(finalAngle) * 28,
        y: p.y + Math.sin(finalAngle) * 28,
        vx: Math.cos(finalAngle) * w.speed,
        vy: Math.sin(finalAngle) * w.speed,
        damage: w.damage,
        isRocket: !!w.isRocket,
        radius: w.isRocket ? 6 : 3,
        ownerId: user.id,
        life: 0,
        color: w.bulletColor
      };
      projectiles.current.push(bullet);
    }

    // Audio & Haptics
    if (w.isRocket) {
      sound.playExplosion();
      cameraShake.current = 14;
      tgHaptics.impact('heavy');
    } else {
      sound.playGunshot(activeWeaponType === 'shotgun' ? 'shotgun' : 'ak47');
      tgHaptics.impact('medium');
    }

    // Send through P2P
    multiplayer.sendShootBullets([{ weaponType: activeWeaponType }]);
  };

  const spawnOpponentBullet = (data: any) => {
    const opp = opponentPos.current;
    const isRocket = data.weaponType === 'rpg';
    projectiles.current.push({
      id: Date.now() + Math.random(),
      x: opp.x + Math.cos(opp.angle) * 28,
      y: opp.y + Math.sin(opp.angle) * 28,
      vx: Math.cos(opp.angle) * (isRocket ? 10 : 16),
      vy: Math.sin(opp.angle) * (isRocket ? 10 : 16),
      damage: isRocket ? 150 : 30,
      isRocket,
      radius: isRocket ? 6 : 3,
      ownerId: 999999,
      life: 0,
      color: isRocket ? '#ea580c' : '#ef4444'
    });
    sound.playGunshot(isRocket ? 'awm' : 'ak47');
  };

  const triggerExplosion = (x: number, y: number, maxRadius: number, damage: number) => {
    sound.playExplosion();
    cameraShake.current = 18;
    tgHaptics.impact('heavy');

    explosions.current.push({
      id: Date.now() + Math.random(),
      x,
      y,
      radius: 5,
      maxRadius,
      life: 0,
      maxLife: 24,
      color: '#f97316'
    });

    // Permanent Scorch Decal
    decals.current.push({ x, y, radius: maxRadius * 0.7, type: 'scorch' });

    // 35 Fiery Shrapnel Particles
    for (let i = 0; i < 35; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = Math.random() * 8 + 3;
      particles.current.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 0,
        maxLife: Math.random() * 30 + 15,
        size: Math.random() * 5 + 2,
        color: Math.random() < 0.5 ? '#f59e0b' : '#ef4444'
      });
    }
  };

  const damageOpponent = (dmg: number, isExplosion = false) => {
    const opp = opponentPos.current;
    opp.hp = Math.max(0, opp.hp - dmg);
    multiplayer.sendBulletHit(999999, dmg, activeWeaponType);

    floatingTexts.current.push({
      id: Date.now() + Math.random(),
      x: opp.x + (Math.random() * 20 - 10),
      y: opp.y - 25,
      text: isExplosion ? `🚀 RPG HIT! -${Math.round(dmg)}` : `💥 -${Math.round(dmg)}`,
      color: isExplosion ? '#f97316' : '#22d3ee',
      life: 40
    });

    tgHaptics.notification('success');

    if (opp.hp <= 0) {
      setKills(k => k + 1);
      handleVictory();
    }
  };

  const takeDamage = (dmg: number) => {
    sound.playHurt();
    cameraShake.current = 10;
    tgHaptics.impact('heavy');

    setHp(prev => {
      let curArmor = armor;
      let newHp = prev;
      if (curArmor > 0) {
        const absorbed = Math.min(curArmor, Math.round(dmg * 0.6));
        setArmor(a => Math.max(0, a - absorbed));
        newHp -= (dmg - absorbed);
      } else {
        newHp -= dmg;
      }

      floatingTexts.current.push({
        id: Date.now() + Math.random(),
        x: playerPos.current.x,
        y: playerPos.current.y - 25,
        text: `⚠️ -${Math.round(dmg)}`,
        color: '#ef4444',
        life: 40
      });

      if (newHp <= 0) {
        handleDefeat();
        return 0;
      }
      return newHp;
    });
  };

  const triggerDash = () => {
    const now = Date.now();
    if (now - lastDashTime.current < 1600) return;
    lastDashTime.current = now;
    isDashing.current = true;
    sound.playPickup();
    tgHaptics.impact('medium');

    setTimeout(() => {
      isDashing.current = false;
    }, 240);
  };

  const switchWeapon = (type: WarzoneWeaponType) => {
    if (type === activeWeaponType) return;
    sound.playPickup();
    tgHaptics.selection();
    setActiveWeaponType(type);
  };

  const reloadWeapon = () => {
    const w = weapons[activeWeaponType];
    if (!w || isReloading || w.ammoInClip === w.magazineSize || w.reserveAmmo <= 0) return;

    setIsReloading(true);
    sound.playReload();
    tgHaptics.impact('light');

    setTimeout(() => {
      const needed = w.magazineSize - w.ammoInClip;
      const reloadAmt = Math.min(needed, w.reserveAmmo);
      setWeapons(prev => ({
        ...prev,
        [activeWeaponType]: {
          ...w,
          ammoInClip: w.ammoInClip + reloadAmt,
          reserveAmmo: w.reserveAmmo - reloadAmt
        }
      }));
      setIsReloading(false);
    }, w.reloadTimeMs);
  };

  const useMedkit = () => {
    if (medkits <= 0 || hp >= 100) return;
    sound.playPickup();
    tgHaptics.impact('light');
    setMedkits(m => m - 1);
    setHp(h => Math.min(100, h + 50));
    floatingTexts.current.push({
      id: Date.now() + Math.random(),
      x: playerPos.current.x,
      y: playerPos.current.y - 30,
      text: '🩹 +50 HP',
      color: '#10b981',
      life: 40
    });
  };

  const handleVictory = () => {
    if (gameOver) return;
    setGameOver('victory');
    sound.playReveal('mythic');
    tgHaptics.notification('success');
    confetti({ particleCount: 160, spread: 100, origin: { y: 0.5 } });
    multiplayer.sendGameOver(user.id);
    const starReward = stakeStars > 0 ? Math.floor(stakeStars * 1.8) : 0;
    onMatchComplete(true, 50, 250, starReward);
  };

  const handleDefeat = () => {
    if (gameOver) return;
    setGameOver('defeat');
    sound.playClick();
    tgHaptics.notification('error');
    onMatchComplete(false, -20, 40, 0);
  };

  // TOUCH JOYSTICK HANDLERS
  const handleTouchStart = (e: React.TouchEvent) => {
    const screenW = window.innerWidth;
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      if (t.clientX < screenW / 2) {
        leftJoy.current = { active: true, startX: t.clientX, startY: t.clientY, curX: t.clientX, curY: t.clientY };
      } else {
        rightJoy.current = { active: true, startX: t.clientX, startY: t.clientY, curX: t.clientX, curY: t.clientY };
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const screenW = window.innerWidth;
    for (let i = 0; i < e.touches.length; i++) {
      const t = e.touches[i];
      if (t.clientX < screenW / 2 && leftJoy.current.active) {
        leftJoy.current.curX = t.clientX;
        leftJoy.current.curY = t.clientY;
      } else if (t.clientX >= screenW / 2 && rightJoy.current.active) {
        rightJoy.current.curX = t.clientX;
        rightJoy.current.curY = t.clientY;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.touches.length === 0) {
      leftJoy.current.active = false;
      rightJoy.current.active = false;
    } else {
      let hasLeft = false;
      let hasRight = false;
      const screenW = window.innerWidth;
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if (t.clientX < screenW / 2) hasLeft = true;
        else hasRight = true;
      }
      if (!hasLeft) leftJoy.current.active = false;
      if (!hasRight) rightJoy.current.active = false;
    }
  };

  // DRAW CANVAS SCENE
  const drawGameScene = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const p = playerPos.current;

    // Camera Center with Screen Shake
    const shakeX = (Math.random() - 0.5) * cameraShake.current;
    const shakeY = (Math.random() - 0.5) * cameraShake.current;
    cameraOffset.current.x = canvas.width / 2 - p.x + shakeX;
    cameraOffset.current.y = canvas.height / 2 - p.y + shakeY;

    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(cameraOffset.current.x, cameraOffset.current.y);

    // 1. Tactical Grid Floor
    const isDesert = mapId === 'desert';
    ctx.fillStyle = isDesert ? '#1c150c' : '#080d1a';
    ctx.fillRect(0, 0, ARENA_WIDTH, ARENA_HEIGHT);

    // Floor Grid lines
    ctx.strokeStyle = isDesert ? 'rgba(217, 119, 6, 0.08)' : 'rgba(0, 242, 254, 0.07)';
    ctx.lineWidth = 1;
    for (let x = 0; x < ARENA_WIDTH; x += 100) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, ARENA_HEIGHT);
      ctx.stroke();
    }
    for (let y = 0; y < ARENA_HEIGHT; y += 100) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(ARENA_WIDTH, y);
      ctx.stroke();
    }

    // Asphalt Main Road with Chevrons
    ctx.fillStyle = isDesert ? '#291e12' : '#0f172a';
    ctx.fillRect(150, 640, ARENA_WIDTH - 300, 120);
    ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
    for (let rx = 200; rx < ARENA_WIDTH - 250; rx += 80) {
      ctx.fillRect(rx, 695, 40, 6);
    }

    // 2. Permanent Decals (Scorches & Blood)
    for (const d of decals.current) {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(10, 10, 15, 0.65)';
      ctx.fill();
    }

    // 3. Obstacles (Walls, Containers, Barrels)
    for (const obs of obstacles.current) {
      if (obs.hp !== undefined && obs.hp <= 0) continue;

      if (obs.type === 'wall') {
        ctx.fillStyle = '#334155';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeStyle = '#64748b';
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      } else if (obs.type === 'container') {
        ctx.fillStyle = '#1e3a8a';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 2;
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      } else if (obs.type === 'barrel') {
        // Red Explosive Barrel
        ctx.fillStyle = '#b91c1c';
        ctx.beginPath();
        ctx.arc(obs.x + obs.w / 2, obs.y + obs.h / 2, obs.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Warning Hazard Symbol
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('☢️', obs.x + obs.w / 2, obs.y + obs.h / 2 + 5);
      } else if (obs.type === 'crate') {
        ctx.fillStyle = '#854d0e';
        ctx.fillRect(obs.x, obs.y, obs.w, obs.h);
        ctx.strokeStyle = '#ca8a04';
        ctx.strokeRect(obs.x, obs.y, obs.w, obs.h);
      }
    }

    // 4. Care Packages (Airdrop Crates)
    for (const cp of carePackages.current) {
      if (cp.isOpened) continue;
      cp.pulse += 0.05;
      const glow = Math.sin(cp.pulse) * 6 + 10;

      ctx.save();
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = glow;
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(cp.x - 22, cp.y - 22, 44, 44);
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 3;
      ctx.strokeRect(cp.x - 22, cp.y - 22, 44, 44);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(cp.weapon === 'rpg' ? '🚀' : '📦', cp.x, cp.y + 6);
      ctx.restore();
    }

    // 5. Shrinking Safe Zone Ring
    ctx.beginPath();
    ctx.arc(safeZone.current.x, safeZone.current.y, safeZone.current.radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 242, 254, 0.7)';
    ctx.lineWidth = 4;
    ctx.setLineDash([12, 8]);
    ctx.stroke();
    ctx.setLineDash([]);

    // 6. Draw Opponent Soldier
    const opp = opponentPos.current;
    drawSoldier(ctx, opp.x, opp.y, opp.angle, '#ef4444', opponentName, opp.hp, false);

    // 7. Draw Player Soldier with Laser Sight
    drawSoldier(ctx, p.x, p.y, p.angle, '#00f2fe', user.firstName, hp, true);

    // 8. Projectiles (Bullets & Rockets)
    for (const b of projectiles.current) {
      ctx.save();
      if (b.isRocket) {
        // RPG Rocket with Exhaust Flame
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx));
        ctx.fillStyle = '#f97316';
        ctx.fillRect(-10, -4, 20, 8);
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.moveTo(10, 0);
        ctx.lineTo(16, -4);
        ctx.lineTo(16, 4);
        ctx.fill();
      } else {
        // Laser Bullet
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 8;
        ctx.fill();
      }
      ctx.restore();
    }

    // 9. Explosions
    for (const ex of explosions.current) {
      ctx.save();
      const grad = ctx.createRadialGradient(ex.x, ex.y, 0, ex.x, ex.y, ex.radius);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.95)');
      grad.addColorStop(0.3, 'rgba(249, 115, 22, 0.85)');
      grad.addColorStop(0.8, 'rgba(239, 68, 68, 0.5)');
      grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(ex.x, ex.y, ex.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 10. Particles
    for (const pt of particles.current) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size * (1 - pt.life / pt.maxLife), 0, Math.PI * 2);
      ctx.fillStyle = pt.color;
      ctx.fill();
    }

    // 11. Floating Damage Numbers
    for (const ft of floatingTexts.current) {
      ctx.save();
      ctx.font = 'bold 15px monospace';
      ctx.fillStyle = ft.color;
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.textAlign = 'center';
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }

    ctx.restore();

    // 12. Draw Mobile Virtual Joysticks (Screen Space)
    if (leftJoy.current.active) {
      drawVirtualJoystick(ctx, leftJoy.current.startX, leftJoy.current.startY, leftJoy.current.curX, leftJoy.current.curY, '#00f2fe');
    }
    if (rightJoy.current.active) {
      drawVirtualJoystick(ctx, rightJoy.current.startX, rightJoy.current.startY, rightJoy.current.curX, rightJoy.current.curY, '#f97316');
    }
  };

  // HELPER: DRAW SOLDIER
  const drawSoldier = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    color: string,
    name: string,
    curHp: number,
    isLocal: boolean
  ) => {
    ctx.save();
    ctx.translate(x, y);

    // Laser Sight Aim Line
    ctx.save();
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(25, 0);
    ctx.lineTo(380, 0);
    ctx.strokeStyle = isLocal ? 'rgba(0, 242, 254, 0.4)' : 'rgba(239, 68, 68, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.restore();

    // Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.ellipse(0, 4, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Rotate Torso & Gun
    ctx.rotate(angle);

    // Tactical Gun Barrel
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(12, 6, 20, 6);

    // Soldier Body (Shoulders & Torso)
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Tactical Helmet
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-2, 0, 11, 0, Math.PI * 2);
    ctx.fill();

    // Backpack
    ctx.fillStyle = '#475569';
    ctx.fillRect(-17, -8, 7, 16);

    ctx.restore();

    // Overhead Health Bar & Name
    ctx.save();
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(name, x, y - 30);

    // HP Bar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(x - 24, y - 26, 48, 5);
    ctx.fillStyle = curHp > 35 ? '#10b981' : '#ef4444';
    ctx.fillRect(x - 24, y - 26, (curHp / 100) * 48, 5);
    ctx.restore();
  };

  // HELPER: DRAW VIRTUAL JOYSTICK
  const drawVirtualJoystick = (
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    cx: number,
    cy: number,
    color: string
  ) => {
    ctx.save();
    // Outer Ring
    ctx.beginPath();
    ctx.arc(sx, sy, 55, 0, Math.PI * 2);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
    ctx.fill();
    ctx.stroke();

    // Inner Knob (Clamped)
    const dx = cx - sx;
    const dy = cy - sy;
    const dist = Math.min(50, Math.hypot(dx, dy));
    const angle = Math.atan2(dy, dx);
    const kx = sx + Math.cos(angle) * dist;
    const ky = sy + Math.sin(angle) * dist;

    ctx.beginPath();
    ctx.arc(kx, ky, 24, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
  };

  const curWeapon = weapons[activeWeaponType];

  return (
    <div 
      className="fixed inset-0 z-50 w-full h-full bg-slate-950 overflow-hidden flex flex-col select-none touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Game Canvas */}
      <canvas ref={canvasRef} className="w-full h-full block cursor-crosshair" />

      {/* Top HUD Bar: Back, Opponent Ping, Safe Zone, Kills */}
      <div className="absolute top-2 inset-x-2 z-20 flex items-center justify-between pointer-events-none">
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
          <div className="bg-slate-900/80 backdrop-blur-md px-2.5 py-1 rounded-xl border border-slate-700/60 flex items-center gap-1.5">
            <Radio className={`w-3.5 h-3.5 ${connStatus === 'connected' ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
            <span className="text-[11px] font-bold text-white">{opponentName}</span>
          </div>
        </div>

        {/* Center: Safe Zone Alert */}
        <div className="bg-cyan-950/80 backdrop-blur-md px-3 py-1 rounded-xl border border-cyan-500/40 text-cyan-300 font-mono text-xs font-bold flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-cyan-400" />
          <span>الزون: {zoneTimer}s</span>
        </div>

        {/* Right: Kills & Stakes */}
        <div className="flex items-center gap-1.5">
          <div className="bg-red-950/80 backdrop-blur-md px-2.5 py-1 rounded-xl border border-red-500/40 text-red-300 text-xs font-bold flex items-center gap-1">
            <Skull className="w-3.5 h-3.5 text-red-400" />
            <span>{kills}</span>
          </div>
          {stakeStars > 0 && (
            <div className="bg-amber-950/80 backdrop-blur-md px-2.5 py-1 rounded-xl border border-amber-500/40 text-amber-300 text-xs font-bold">
              🌟 {stakeStars * 2}
            </div>
          )}
        </div>
      </div>

      {/* Bottom HUD: Health, Armor, Weapon Strip, and Action Buttons */}
      <div className="absolute bottom-2 inset-x-2 z-20 flex flex-col gap-1.5 pointer-events-auto">
        {/* Health & Armor */}
        <div className="bg-slate-950/85 backdrop-blur-md p-2 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-emerald-400 flex items-center gap-1">
                <span>الصحة (HP)</span>
              </span>
              <span className="text-white font-mono">{hp}/100</span>
            </div>
            <div className="w-full h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-emerald-600 to-green-400 transition-all duration-200"
                style={{ width: `${hp}%` }}
              />
            </div>
            {armor > 0 && (
              <div className="w-full h-1.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-blue-500 transition-all duration-200"
                  style={{ width: `${armor * 2}%` }}
                />
              </div>
            )}
          </div>

          <button
            onClick={useMedkit}
            disabled={medkits <= 0 || hp >= 100}
            className="px-3 py-1.5 bg-emerald-950/60 border border-emerald-500/40 hover:bg-emerald-800/60 disabled:opacity-40 text-emerald-300 rounded-xl flex flex-col items-center justify-center text-xs font-bold"
          >
            <span>🩹 x{medkits}</span>
            <span className="text-[9px] text-slate-400">علاج [E]</span>
          </button>
        </div>

        {/* 3 Tactical Weapon Selector Cards */}
        <div className="grid grid-cols-3 gap-1.5">
          {(['ak47', 'rpg', 'shotgun'] as WarzoneWeaponType[]).map((wType) => {
            const w = weapons[wType];
            const isCurrent = activeWeaponType === wType;

            return (
              <button
                key={wType}
                onClick={() => switchWeapon(wType)}
                className={`p-1.5 rounded-xl border text-right transition-all flex items-center gap-2 ${
                  isCurrent
                    ? 'bg-cyan-950/70 border-cyan-400 shadow-lg scale-[1.02]'
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-lg">
                  {w.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold text-white truncate">
                    {w.nameAr}
                  </div>
                  <div className="text-[9px] text-amber-400 font-mono">
                    {w.ammoInClip}/{w.reserveAmmo}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Mobile Quick Action Buttons: Shoot, Dash, Reload */}
        <div className="flex items-center justify-between gap-2 px-1">
          <button
            onClick={triggerDash}
            className="flex-1 py-2.5 bg-slate-900/90 border border-slate-700 hover:border-cyan-500 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md"
          >
            <span>💨 دحرجة [Space]</span>
          </button>

          <button
            onClick={reloadWeapon}
            disabled={isReloading || curWeapon.ammoInClip === curWeapon.magazineSize}
            className="flex-1 py-2.5 bg-slate-900/90 border border-slate-700 hover:border-cyan-500 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md disabled:opacity-40"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReloading ? 'animate-spin' : ''}`} />
            <span>تلقيم [R]</span>
          </button>

          <button
            onClick={triggerWeaponFire}
            className={`flex-1 py-2.5 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-95 ${
              activeWeaponType === 'rpg'
                ? 'bg-gradient-to-r from-orange-600 to-red-600 border border-orange-400'
                : 'bg-gradient-to-r from-cyan-600 to-blue-600 border border-cyan-400'
            }`}
          >
            <span>{curWeapon.icon} إطلاق!</span>
          </button>
        </div>
      </div>

      {/* Game Over Modal (Victory / Defeat) */}
      {gameOver && (
        <div className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-xs w-full text-center space-y-4 shadow-2xl animate-in zoom-in-95">
            <div className="w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl shadow-xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/40">
              {gameOver === 'victory' ? '🏆' : '💀'}
            </div>

            <div className="space-y-1">
              <h2 className={`text-2xl font-black ${gameOver === 'victory' ? 'text-amber-400' : 'text-red-400'}`}>
                {gameOver === 'victory' ? 'نصر ساحق!' : 'سقطت في المعركة!'}
              </h2>
              <p className="text-xs text-slate-400">
                {gameOver === 'victory' ? 'لقد انتزعت الفوز والمكافآت بجدارة' : 'حاول مجدداً وخطط لمواجهتك القادمة'}
              </p>
            </div>

            <div className="bg-slate-950 p-3 rounded-2xl border border-slate-800 flex justify-around items-center text-xs">
              <div>
                <div className="text-slate-400">الكؤوس</div>
                <div className="font-bold text-amber-400">{gameOver === 'victory' ? '+50 🏆' : '-20 🏆'}</div>
              </div>
              {stakeStars > 0 && (
                <div>
                  <div className="text-slate-400">النجوم</div>
                  <div className="font-bold text-cyan-400">{gameOver === 'victory' ? `+${Math.floor(stakeStars * 1.8)} 🌟` : '0 🌟'}</div>
                </div>
              )}
              <div>
                <div className="text-slate-400">الغبار</div>
                <div className="font-bold text-purple-400">{gameOver === 'victory' ? '+250 ✨' : '+40 ✨'}</div>
              </div>
            </div>

            <button
              onClick={() => {
                sound.playClick();
                onExit();
              }}
              className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg active:scale-95"
            >
              العودة إلى البهو
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
