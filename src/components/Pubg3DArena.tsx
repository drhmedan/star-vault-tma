import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Heart, RefreshCw, Shield } from 'lucide-react';
import { UserProfile } from '../types';
import { buildMapEnvironment, MAP_CATALOG } from '../game3d/mapRegistry';
import { createSoldierMesh, createWeaponViewModel, WeaponViewModel } from '../game3d/worldBuilder';
import {
  CoverObstacle3D, MapId, WeaponSlotId, WeaponType, WeaponDef, WeaponState,
  GrenadeType, LocomotionState, LootItem3D, SurfaceType, SoldierMesh
} from '../game3d/types3d';
import { multiplayer, ConnectionStatus } from '../services/multiplayer';
import { MatchInfo } from '../services/matchmaking';
import { sound } from '../audio/soundEngine';
import { tgHaptics } from '../services/telegramHaptics';

// ============================================================
// Weapon registry — every weapon feels distinct.
// ============================================================
const WEAPONS: Record<WeaponType, WeaponDef> = {
  ak47: {
    type: 'ak47', name: 'AK-47', nameAr: 'كلاشينكوف AK-47', icon: '⚡',
    slot: 'primary', damageMin: 18, damageMax: 22, headshotMultiplier: 2.5,
    fireRateMs: 100, auto: true, magazineSize: 30, reloadTimeMs: 2200,
    spreadHip: 0.028, spreadAds: 0.007, recoilPitch: 0.010, recoilYaw: 0.0045,
    pellets: 1, range: 130, bulletSpeed: 460, adsFov: 40, tracerColor: 0xffd54a,
    reserveStart: 90, projectile: 'hitscan', soundId: 'ak47', movespeedMul: 1.0
  },
  awm: {
    type: 'awm', name: 'AWM', nameAr: 'قناصة AWM', icon: '🎯',
    slot: 'secondary', damageMin: 85, damageMax: 95, headshotMultiplier: 2.5,
    fireRateMs: 1500, auto: false, magazineSize: 5, reloadTimeMs: 3500,
    spreadHip: 0.02, spreadAds: 0.0012, recoilPitch: 0.05, recoilYaw: 0.006,
    pellets: 1, range: 300, bulletSpeed: 380, adsFov: 15, tracerColor: 0xffd54a,
    reserveStart: 20, projectile: 'hitscan', soundId: 'awm', movespeedMul: 0.82
  },
  shotgun: {
    type: 'shotgun', name: 'S1897', nameAr: 'شوزن S1897', icon: '💥',
    slot: 'secondary', damageMin: 45, damageMax: 65, headshotMultiplier: 2.5,
    fireRateMs: 800, auto: false, magazineSize: 5, reloadTimeMs: 2800,
    spreadHip: 0.075, spreadAds: 0.03, recoilPitch: 0.03, recoilYaw: 0.006,
    pellets: 8, range: 32, bulletSpeed: 300, adsFov: 45, tracerColor: 0xffd54a,
    reserveStart: 30, projectile: 'hitscan', soundId: 'shotgun', movespeedMul: 0.95
  },
  mp5: {
    type: 'mp5', name: 'MP5', nameAr: 'رشاش MP5', icon: '🔫',
    slot: 'secondary', damageMin: 12, damageMax: 15, headshotMultiplier: 2.5,
    fireRateMs: 65, auto: true, magazineSize: 30, reloadTimeMs: 1800,
    spreadHip: 0.02, spreadAds: 0.006, recoilPitch: 0.006, recoilYaw: 0.003,
    pellets: 1, range: 90, bulletSpeed: 400, adsFov: 42, tracerColor: 0xffd54a,
    reserveStart: 120, projectile: 'hitscan', soundId: 'mp5', movespeedMul: 1.12
  },
  pistol: {
    type: 'pistol', name: 'P92', nameAr: 'مسدس P92', icon: '🔹',
    slot: 'sidearm', damageMin: 15, damageMax: 18, headshotMultiplier: 2.5,
    fireRateMs: 180, auto: false, magazineSize: 15, reloadTimeMs: 1200,
    spreadHip: 0.022, spreadAds: 0.008, recoilPitch: 0.012, recoilYaw: 0.004,
    pellets: 1, range: 55, bulletSpeed: 320, adsFov: 50, tracerColor: 0xffd54a,
    reserveStart: 45, projectile: 'hitscan', soundId: 'pistol', movespeedMul: 1.1
  },
  rpg: {
    type: 'rpg', name: 'RPG-7', nameAr: 'قاذف RPG-7', icon: '🚀',
    slot: 'secondary', damageMin: 120, damageMax: 160, headshotMultiplier: 1.0,
    fireRateMs: 3000, auto: false, magazineSize: 1, reloadTimeMs: 4000,
    spreadHip: 0.01, spreadAds: 0.005, recoilPitch: 0.04, recoilYaw: 0.008,
    pellets: 1, range: 160, bulletSpeed: 52, adsFov: 45, tracerColor: 0xffd54a,
    reserveStart: 5, projectile: 'rocket', soundId: 'rpg', movespeedMul: 0.9
  }
};

const GRENADE_ICON = { frag: '💣', smoke: '🌫️', flash: '⚪' } as const;

function makeWeaponState(type: WeaponType, slot: WeaponSlotId): WeaponState {
  const def = WEAPONS[type];
  return { def, ammoInClip: def.magazineSize, reserveAmmo: def.reserveStart };
}

// ------------------------------------------------------------
// Ray helpers
// ------------------------------------------------------------
function rayHitsAABB(origin: THREE.Vector3, dir: THREE.Vector3, box: THREE.Box3): number | null {
  let tmin = 0;
  let tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const o = i === 0 ? origin.x : i === 1 ? origin.y : origin.z;
    const d = i === 0 ? dir.x : i === 1 ? dir.y : dir.z;
    const mn = i === 0 ? box.min.x : i === 1 ? box.min.y : box.min.z;
    const mx = i === 0 ? box.max.x : i === 1 ? box.max.y : box.max.z;
    if (Math.abs(d) < 1e-8) {
      if (o < mn || o > mx) return null;
      continue;
    }
    let t1 = (mn - o) / d;
    let t2 = (mx - o) / d;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin;
}

function lineBlocked(obstacles: CoverObstacle3D[], from: THREE.Vector3, to: THREE.Vector3): boolean {
  const dir = to.clone().sub(from);
  const dist = dir.length();
  if (dist < 1e-4) return false;
  dir.normalize();
  for (const o of obstacles) {
    if (!o.blocksBullets) continue;
    const t = rayHitsAABB(from, dir, o.box);
    if (t !== null && t >= 0 && t <= dist) return true;
  }
  return false;
}

// ------------------------------------------------------------
// Props + state types
// ------------------------------------------------------------
interface Pubg3DArenaProps {
  user: UserProfile;
  roomCode: string;
  mode: 'host' | 'join' | 'ai' | 'matchmade';
  stakeStars: number;
  mapId?: MapId;
  /** Matchmade room metadata (human roster + bot fill count). */
  matchInfo?: MatchInfo;
  onExit: () => void;
  onMatchComplete: (won: boolean, trophiesDelta: number, dustDelta: number, starsDelta: number) => void;
}

type Phase = 'countdown' | 'grace' | 'combat' | 'over';
type GameResult = 'victory' | 'defeat' | null;

interface PlayerState {
  pos: THREE.Vector3; vel: THREE.Vector3;
  yaw: number; pitch: number; lean: number;
  hp: number; armor: number;
  weapons: Record<WeaponSlotId, WeaponState | null>;
  slot: WeaponSlotId;
  nades: Record<GrenadeType, number>;
  nadeSlot: GrenadeType;
  medkits: number;
  reloading: boolean; reloadUntil: number;
  switching: boolean; switchUntil: number;
  firing: boolean;
  crouched: boolean; prone: boolean; sprinting: boolean;
  grounded: boolean; climbing: boolean;
  slidingUntil: number;
  bobPhase: number; stepTimer: number; surface: SurfaceType;
  recoilPitch: number; recoilYaw: number; bloom: number;
  lastFire: number;
  kills: number;
  shotsFired: number; shotsHit: number; headshots: number; damageDealt: number;
  alive: boolean;
  camHeight: number;
}

interface EnemyState {
  id: number;
  name: string;
  isHuman: boolean;
  pos: THREE.Vector3; vel: THREE.Vector3;
  yaw: number;
  hp: number; armor: number;
  alive: boolean;
  state: 'patrol' | 'hunt' | 'engage' | 'flank' | 'take_cover' | 'push' | 'retreat' | 'heal';
  stateT: number;
  lastKnown: THREE.Vector3;
  spotted: boolean;
  lastFire: number; burstCount: number; burstPause: number;
  lastGrenade: number;
  dodgeDir: number;
  patrolTarget: THREE.Vector3; pauseT: number;
  ammo: number; reloadingUntil: number;
  accuracy: number;
  weapon: WeaponType;
}

interface EnemyUnit {
  state: EnemyState;
  soldier: SoldierMesh;
}

interface Proj {
  kind: 'rocket' | 'bullet' | 'frag' | 'smoke' | 'flash';
  mesh: THREE.Group;
  vel: THREE.Vector3;
  gravity: number;
  dmg: number;
  owner: 'player' | 'bot';
  fuse: number;
  bounced: boolean;
}

interface SmokePuff { mesh: THREE.Mesh; life: number; maxLife: number; vel: THREE.Vector3; }
interface FloatingText { id: number; x: number; y: number; text: string; headshot: boolean; }
interface FeedItem { id: number; text: string; icon: string; }
interface HudState {
  hp: number; armor: number; ammo: number; reserve: number;
  icon: string; nameAr: string; wtype: WeaponType; slot: WeaponSlotId;
  nades: Record<GrenadeType, number>; nadeSlot: GrenadeType; medkits: number;
  kills: number; phase: Phase; zoneRadius: number; zoneTimer: number; matchTimer: number;
  compass: number; outside: boolean; reloading: boolean; aiming: boolean;
  crouched: boolean; prone: boolean; sprinting: boolean; locomotion: LocomotionState;
  viewMode: 'tpp' | 'fpp'; countdown: number;
  reloadProgress: number;
}

interface EngineApi {
  startFire: () => void;
  stopFire: () => void;
  setAim: (on: boolean) => void;
  reload: () => void;
  switchSlot: (s: WeaponSlotId) => void;
  toggleCrouch: () => void;
  toggleProne: () => void;
  jump: () => void;
  toggleView: () => void;
  nudgeCamHeight: (dir: 1 | -1) => void;
  resetCamHeight: () => void;
  cookGrenade: (on: boolean) => void;
  cycleNade: () => void;
  selectNade: (g: GrenadeType) => void;
  useMedkit: () => void;
  interact: () => void;
  setMove: (x: number, y: number) => void;
  addLook: (dx: number, dy: number) => void;
}

let floatId = 0;

export const Pubg3DArena: React.FC<Pubg3DArenaProps> = ({
  user, roomCode, mode, stakeStars, mapId = 'warzone', matchInfo, onExit, onMatchComplete
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);

  const pRef = useRef<PlayerState>({
    pos: new THREE.Vector3(), vel: new THREE.Vector3(),
    yaw: 0, pitch: 0, lean: 0,
    hp: 100, armor: 50,
    weapons: {
      primary: makeWeaponState('ak47', 'primary'),
      secondary: makeWeaponState('mp5', 'secondary'),
      sidearm: makeWeaponState('pistol', 'sidearm')
    },
    slot: 'primary',
    nades: { frag: 2, smoke: 1, flash: 1 },
    nadeSlot: 'frag',
    medkits: 2,
    reloading: false, reloadUntil: 0,
    switching: false, switchUntil: 0,
    firing: false,
    crouched: false, prone: false, sprinting: false,
    grounded: true, climbing: false,
    slidingUntil: 0,
    bobPhase: 0, stepTimer: 0, surface: 'grass',
    recoilPitch: 0, recoilYaw: 0, bloom: 0,
    lastFire: 0,
    kills: 0,
    shotsFired: 0, shotsHit: 0, headshots: 0, damageDealt: 0,
    alive: true,
    camHeight: 0
  });

  const keysRef = useRef<Set<string>>(new Set());
  const moveVecRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lookTouchRef = useRef<{ x: number; y: number } | null>(null);
  const fireHeldRef = useRef(false);
  const aimRef = useRef(false);
  const cookRef = useRef(false);
  const engineRef = useRef<EngineApi | null>(null);
  const viewModeRef = useRef<'tpp' | 'fpp'>('fpp');
  const phaseRef = useRef<Phase>('countdown');
  const gameOverRef = useRef<GameResult>(null);
  const lastLootRef = useRef<LootItem3D | null>(null);

  const [hud, setHud] = useState<HudState>({
    hp: 100, armor: 50, ammo: 30, reserve: 90,
    icon: WEAPONS.ak47.icon, nameAr: WEAPONS.ak47.nameAr, wtype: 'ak47', slot: 'primary',
    nades: { frag: 2, smoke: 1, flash: 1 }, nadeSlot: 'frag', medkits: 2,
    kills: 0, phase: 'countdown', zoneRadius: 142, zoneTimer: 45, matchTimer: 300,
    compass: 0, outside: false, reloading: false, aiming: false,
    crouched: false, prone: false, sprinting: false, locomotion: 'idle',
    viewMode: 'fpp', countdown: 3,
    reloadProgress: 0
  });
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('connecting');
  const [opponentName, setOpponentName] = useState<string>(
    mode === 'ai' ? 'بوت تكتيكي'
      : mode === 'matchmade'
        ? (matchInfo?.players.find((pl) => pl.id !== user.id)?.name ?? 'معركة البوتات')
        : 'في انتظار الخصم…'
  );
  const [gameOver, setGameOver] = useState<GameResult>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [damageNumbers, setDamageNumbers] = useState<FloatingText[]>([]);
  const [killFeed, setKillFeed] = useState<FeedItem[]>([]);
  const [hitmarker, setHitmarker] = useState<{ kind: 'hit' | 'headshot'; key: number } | null>(null);
  const [dmgVignette, setDmgVignette] = useState(0);
  const [screenFlash, setScreenFlash] = useState(0);
  const [dmgDir, setDmgDir] = useState<{ angle: number; key: number } | null>(null);
  const [nearbyLoot, setNearbyLoot] = useState<LootItem3D | null>(null);
  const [centerMsg, setCenterMsg] = useState<{ text: string; sub: string; key: number } | null>(null);
  const [cookPreview, setCookPreview] = useState(false);
  const [stats, setStats] = useState<{ kills: number; damage: number; accuracy: number; time: string; xp: number; trophies: number; dust: number; stars: number } | null>(null);
  const [autoFire, setAutoFire] = useState(false);

  const pushDamageNumber = useCallback((world: THREE.Vector3, camera: THREE.Camera, canvas: HTMLCanvasElement, text: string, headshot: boolean) => {
    const v = world.clone().project(camera);
    const x = (v.x * 0.5 + 0.5) * canvas.clientWidth;
    const y = (-v.y * 0.5 + 0.5) * canvas.clientHeight;
    if (v.z > 1) return;
    const id = ++floatId;
    setDamageNumbers((d) => [...d.slice(-7), { id, x, y, text, headshot }]);
    window.setTimeout(() => setDamageNumbers((d) => d.filter((n) => n.id !== id)), 900);
  }, []);

  const pushFeed = useCallback((text: string, icon: string) => {
    const id = ++floatId;
    setKillFeed((f) => [...f.slice(-4), { id, text, icon }]);
    window.setTimeout(() => setKillFeed((f) => f.filter((n) => n.id !== id)), 4200);
  }, []);

  // ============================================================
  // MAIN 3D ENGINE
  // ============================================================
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Size to the full viewport (not the container) so the aspect ratio always
    // matches the screen — a narrow container would otherwise stretch the view.
    const width = window.innerWidth || container.clientWidth || 400;
    const height = window.innerHeight || container.clientHeight || 600;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const meta = MAP_CATALOG[mapId];
    // Background matches the horizon so the sky dome blends seamlessly.
    scene.background = new THREE.Color(meta.fogColor);

    const env = buildMapEnvironment(mapId, scene);
    const { obstacles, safeZone, lootItems, getHeightAt, ladders, explosives, lootLight } = env;
    const zoneBaseRadius = safeZone.radius;
    void explosives;

    const camera = new THREE.PerspectiveCamera(75, width / height, 0.08, 600);
    camera.rotation.order = 'YXZ';

    const playerSoldier = createSoldierMesh(false);
    scene.add(playerSoldier.root);

    // ---- Enemy roster ----------------------------------------------------
    // Every match is "you + up to 7 enemies". A matchmade room carries one
    // human opponent (P2P) plus a bot fill; private rooms are 1v1; AI
    // training is a single bot. Bots are simulated locally by every client.
    const makeEnemy = (id: number, name: string, isHuman: boolean, pos: THREE.Vector3): EnemyUnit => {
      const state: EnemyState = {
        id, name, isHuman, pos: pos.clone(), vel: new THREE.Vector3(), yaw: 0,
        hp: 100, armor: 0, alive: true,
        state: 'patrol', stateT: 0,
        lastKnown: new THREE.Vector3(), spotted: false,
        lastFire: 0, burstCount: 0, burstPause: 0,
        lastGrenade: 0, dodgeDir: Math.random() > 0.5 ? 1 : -1,
        patrolTarget: new THREE.Vector3(), pauseT: 0,
        ammo: 30, reloadingUntil: 0,
        accuracy: 0.5,
        weapon: 'ak47'
      };
      const soldier = createSoldierMesh(true);
      soldier.root.position.copy(pos);
      scene.add(soldier.root);
      return { state, soldier };
    };

    const scatterSpawn = (index: number): THREE.Vector3 => {
      const ang = (index / 8) * Math.PI * 2 + 0.6;
      const r = 52 + (index % 3) * 11;
      const x = THREE.MathUtils.clamp(Math.cos(ang) * r, -env.bounds + 10, env.bounds - 10);
      const z = THREE.MathUtils.clamp(Math.sin(ang) * r, -env.bounds + 10, env.bounds - 10);
      return new THREE.Vector3(x, getHeightAt(x, z), z);
    };

    const enemyUnits: EnemyUnit[] = [];
    const rosterHumans = matchInfo ? matchInfo.players.filter((pl) => pl.id !== user.id) : [];
    const fillBots = matchInfo ? Math.max(0, matchInfo.fillBots) : 0;
    let spawnIndex = 0;
    if (mode === 'ai') {
      enemyUnits.push(makeEnemy(-1, 'بوت تكتيكي', false, env.spawnB));
    } else if (mode === 'host' || mode === 'join') {
      enemyUnits.push(makeEnemy(0, 'في انتظار الخصم…', true, env.spawnB));
    } else {
      // Matchmade: one human opponent (if matched) + bot fill up to 8 fighters.
      const opp = rosterHumans[0];
      if (opp) {
        enemyUnits.push(makeEnemy(opp.id, opp.name || 'خصم', true, env.spawnB));
        spawnIndex = 1;
      }
      for (let i = 0; i < fillBots; i++) {
        enemyUnits.push(makeEnemy(-(i + 1), `بوت ${i + 1}`, false, scatterSpawn(spawnIndex + i)));
      }
    }
    const hasHumanOpponent = enemyUnits.some((u) => u.state.isHuman);

    let viewmodel: WeaponViewModel | null = createWeaponViewModel(WEAPONS.ak47.type);
    viewmodel.group.visible = false;
    camera.add(viewmodel.group);
    scene.add(camera);

    const p = pRef.current;
    p.pos.copy(env.spawnA);
    p.yaw = Math.PI / 4;

    // ---- pools ----
    const tracerPool: THREE.Line[] = [];
    const activeTracers: { line: THREE.Line; ttl: number }[] = [];
    const acquireTracer = (color: number): THREE.Line => {
      let line = tracerPool.pop();
      if (line) {
        (line.material as THREE.LineBasicMaterial).color.set(color);
        line.visible = true;
      } else {
        const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false });
        line = new THREE.Line(geo, mat);
      }
      scene.add(line);
      return line;
    };
    const releaseTracer = (line: THREE.Line) => {
      scene.remove(line);
      line.visible = false;
      tracerPool.push(line);
    };

    interface Particle { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number; gravity: number; }
    const particles: Particle[] = [];
    const particleGeo = new THREE.SphereGeometry(0.05, 5, 4);
    const spawnParticles = (pos: THREE.Vector3, count: number, color: number, speed: number, gravity: number, life: number) => {
      for (let i = 0; i < count; i++) {
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1 });
        const mesh = new THREE.Mesh(particleGeo, mat);
        mesh.position.copy(pos);
        const s = speed * (0.4 + Math.random() * 0.8);
        const vel = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.8 + 0.2, (Math.random() - 0.5)).normalize().multiplyScalar(s);
        scene.add(mesh);
        particles.push({ mesh, vel, life: 0, maxLife: life, gravity });
      }
    };

    const projectiles: Proj[] = [];
    const smokes: SmokePuff[] = [];

    let muzzleT = 0;
    const matchStart = performance.now();
    let lastCountShown = 4;
    const zone = { timer: 45, phase: 'wait' as 'wait' | 'shrink', target: new THREE.Vector2() };
    const totalMatch = 300;

    let animId = 0;
    const clock = new THREE.Clock();
    let lastNetSync = 0;
    let lastZoneDmg = 0;
    let lastHudSync = 0;
    // ---- Premium screen shake ----
    // Directional kick impulse (recoil/explosions) + rolling rotation + a
    // smooth layered wobble for sustained vibration. No white-noise jitter —
    // it reads as a cinematic, physical camera rather than cheap shaking.
    let shakeMag = 0;
    const shakeKick = new THREE.Vector3();
    let shakeRoll = 0;
    let fovPunch = 0;
    let heartbeatTimer = 0;

    // Kick the camera along a direction (screen-space, in metres) with a roll.
    // `mag` is the impulse size; dx/dy are unit directions (x = right, y = up).
    const addShake = (mag: number, dx = 0, dy = 0, roll = 0) => {
      shakeMag = Math.max(shakeMag, mag);
      shakeKick.x += dx * mag;
      shakeKick.y += dy * mag;
      shakeRoll += roll * mag * 2;
    };
    // Temp vectors/colours reused every frame (no per-frame allocation).
    const lootColor = new THREE.Color();
    const lootLightPos = new THREE.Vector3();
    // View-mode blend: 0 = fully first-person, 1 = fully third-person. Damped
    // toward the selected mode every frame so toggling is a smooth cinematic
    // dolly instead of an instant snap.
    let viewBlend = viewModeRef.current === 'fpp' ? 0 : 1;
    // User-adjustable camera height (smoothed toward camHeightTarget).
    let camHeightTarget = p.camHeight;
    let flashLevel = 0;
    let hitmarkerT = 0;
    let cookFuse = 0;

    // ============================================================
    // Combat functions
    // ============================================================
    const currentWeapon = (): WeaponState | null => p.weapons[p.slot];

    function surfaceAt(pos: THREE.Vector3): SurfaceType {
      for (const o of obstacles) {
        if (o.type === 'car' && o.box.containsPoint(new THREE.Vector3(pos.x, pos.y + 0.2, pos.z))) return 'metal';
        if ((o.type === 'building' || o.type === 'crate') && o.box.containsPoint(new THREE.Vector3(pos.x, pos.y + 0.2, pos.z))) return 'concrete';
      }
      if (mapId === 'warzone' && Math.abs(pos.x + 2) < 4.4) return 'road';
      if (mapId === 'warzone' && Math.abs(pos.z - 4) < 4.4) return 'road';
      return mapId === 'desert' ? 'dirt' : 'grass';
    }

    function endMatch(won: boolean) {
      if (gameOverRef.current) return;
      gameOverRef.current = won ? 'victory' : 'defeat';
      phaseRef.current = 'over';
      const dur = (performance.now() - matchStart) / 1000;
      const acc = p.shotsFired > 0 ? Math.round((p.shotsHit / p.shotsFired) * 100) : 0;
      const xp = Math.round(p.kills * 40 + p.damageDealt * 0.5 + Math.min(120, dur) * 2);
      const trophies = won ? 25 : -15;
      const dust = won ? 200 : 30;
      const stars = won && stakeStars > 0 ? Math.floor(stakeStars * 1.8) : 0;
      setStats({
        kills: p.kills, damage: Math.round(p.damageDealt), accuracy: acc,
        time: `${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, '0')}`,
        xp, trophies, dust, stars
      });
      setGameOver(won ? 'victory' : 'defeat');
      if (won) {
        sound.playVictory();
        tgHaptics.notification('success');
        confetti({ particleCount: 140, spread: 90, origin: { y: 0.55 } });
      } else {
        sound.playDefeat();
        tgHaptics.notification('error');
      }
      onMatchComplete(won, trophies, dust, stars);
      if (document.pointerLockElement) document.exitPointerLock();
    }

    function damagePlayer(dmg: number, fromPos?: THREE.Vector3) {
      if (phaseRef.current === 'grace' || !p.alive || gameOverRef.current) return;
      let absorbed = 0;
      if (p.armor > 0) {
        absorbed = Math.min(p.armor, Math.round(dmg * 0.55));
        p.armor -= absorbed;
      }
      p.hp = Math.max(0, p.hp - (dmg - absorbed));
      sound.playHurt();
      tgHaptics.impact('heavy');
      // Directional hit feedback: jerk up + roll + a red FOV punch.
      if (fromPos) {
        const hitDir = p.pos.clone().sub(fromPos).setY(0);
        if (hitDir.lengthSq() < 0.001) hitDir.set(1, 0, 0);
        hitDir.normalize();
        const camHit = hitDir.clone().applyQuaternion(camera.quaternion.clone().invert());
        addShake(0.1, camHit.x, 0.7 + camHit.y, 0.5);
      } else {
        addShake(0.1, 0, 0.8, 0.45);
      }
      fovPunch = Math.min(0.18, fovPunch + 2.5);
      setDmgVignette(Math.min(1, 0.35 + dmg / 100));
      window.setTimeout(() => setDmgVignette(0), 300);

      if (fromPos) {
        const dir = fromPos.clone().sub(p.pos).setY(0).normalize();
        const ang = Math.atan2(dir.x, dir.z) - p.yaw;
        setDmgDir({ angle: ang, key: Date.now() });
        window.setTimeout(() => setDmgDir(null), 900);
      }
      if (p.hp <= 0) {
        p.alive = false;
        endMatch(false);
      }
    }

    function damageEnemy(enemy: EnemyState, soldier: SoldierMesh, dmg: number, headshot: boolean) {
      if (!enemy.alive || gameOverRef.current) return;
      let absorbed = 0;
      if (enemy.armor > 0) { absorbed = Math.min(enemy.armor, Math.round(dmg * 0.5)); enemy.armor -= absorbed; }
      enemy.hp = Math.max(0, enemy.hp - (dmg - absorbed));
      p.damageDealt += (dmg - absorbed);
      p.shotsHit += 1;
      if (headshot) { p.headshots += 1; sound.playHeadshot(); }
      else sound.playHitmarker();
      setHitmarker({ kind: headshot ? 'headshot' : 'hit', key: Date.now() });
      hitmarkerT = 0.12;
      enemy.spotted = true;
      enemy.lastKnown.copy(p.pos);
      soldier.flashHit(headshot ? 'head' : 'body');

      if (enemy.isHuman) multiplayer.sendBulletHit(enemy.id, Math.round(dmg), currentWeapon()?.def.type || 'ak47');

      if (enemy.hp <= 0) {
        enemy.alive = false;
        p.kills += 1;
        sound.playKillConfirm();
        tgHaptics.notification('success');
        setCenterMsg({ text: headshot ? 'إصابة رأس قاتلة!' : 'تم القضاء على الهدف', sub: headshot ? 'HEADSHOT' : 'ELIMINATED', key: Date.now() });
        pushFeed(`أنت قضيت على ${enemy.isHuman ? 'الخصم' : enemy.name}`, headshot ? '🎯' : '💀');
        if (enemy.isHuman) {
          multiplayer.sendGameOver(user.id);
          endMatch(true);
        } else if (!enemyUnits.some((u) => u.state.alive)) {
          endMatch(true);
        }
      }
    }

    function traceShot(origin: THREE.Vector3, dir: THREE.Vector3, range: number, self: 'player' | 'bot'):
      { hit: 'head' | 'body' | 'limb' | 'world' | 'explosive' | null; point: THREE.Vector3; dist: number; obstacle: CoverObstacle3D | null; enemyIndex: number } {
      let bestT = Infinity;
      let bestObs: CoverObstacle3D | null = null;
      for (const o of obstacles) {
        if (!o.blocksBullets) continue;
        const t = rayHitsAABB(origin, dir, o.box);
        if (t !== null && t < bestT) { bestT = t; bestObs = o; }
      }

      let bestHit: { hit: 'head' | 'body' | 'limb'; point: THREE.Vector3; dist: number } | null = null;
      let bestEnemyIndex = -1;

      if (self === 'player') {
        for (let i = 0; i < enemyUnits.length; i++) {
          const u = enemyUnits[i];
          if (!u.state.alive) continue;
          const ray = new THREE.Raycaster(origin, dir, 0, range);
          const zones = [u.soldier.hitHead, u.soldier.hitBody, ...u.soldier.hitLimbs];
          u.soldier.root.updateMatrixWorld(true);
          const hits = ray.intersectObjects(zones, false);
          if (hits.length > 0 && hits[0].distance < bestT) {
            const obj = hits[0].object as THREE.Mesh;
            const zone = obj.userData.isHitZone as 'head' | 'body' | 'limb' | undefined;
            bestHit = { hit: zone ?? 'body', point: hits[0].point.clone(), dist: hits[0].distance };
            bestEnemyIndex = i;
          }
        }
      } else {
        const ray = new THREE.Raycaster(origin, dir, 0, range);
        const zones = [playerSoldier.hitHead, playerSoldier.hitBody, ...playerSoldier.hitLimbs];
        playerSoldier.root.updateMatrixWorld(true);
        const hits = ray.intersectObjects(zones, false);
        if (hits.length > 0 && hits[0].distance < bestT) {
          const obj = hits[0].object as THREE.Mesh;
          const zone = obj.userData.isHitZone as 'head' | 'body' | 'limb' | undefined;
          bestHit = { hit: zone ?? 'body', point: hits[0].point.clone(), dist: hits[0].distance };
        }
      }

      if (bestHit) return { ...bestHit, obstacle: null, enemyIndex: bestEnemyIndex };
      if (bestObs) {
        const point = origin.clone().addScaledVector(dir, bestT);
        return { hit: bestObs.explosive ? 'explosive' : 'world', point, dist: bestT, obstacle: bestObs, enemyIndex: -1 };
      }
      const point = origin.clone().addScaledVector(dir, range);
      const gh = getHeightAt(point.x, point.z);
      if (point.y < gh) { point.y = gh; return { hit: 'world', point, dist: point.distanceTo(origin), obstacle: null, enemyIndex: -1 }; }
      return { hit: null, point, dist: range, obstacle: null, enemyIndex: -1 };
    }

    function muzzleWorld(): THREE.Vector3 {
      if (viewModeRef.current === 'fpp' && viewmodel) return viewmodel.muzzle.getWorldPosition(new THREE.Vector3());
      return playerSoldier.muzzle.getWorldPosition(new THREE.Vector3());
    }

    function shootDir(): THREE.Vector3 {
      // The camera always looks along the aim direction in both view modes
      // (the TPP camera is aimed down the crosshair line), so the bullets fly
      // exactly where the crosshair points.
      return camera.getWorldDirection(new THREE.Vector3());
    }

    function shotOrigin(): THREE.Vector3 {
      // First-person: from the viewmodel muzzle. Third-person: from the camera
      // so the bullet passes precisely through the crosshair; the shooter's own
      // soldier is never part of the hit test, so this cannot self-hit.
      if (viewModeRef.current === 'fpp') return muzzleWorld();
      return camera.position.clone();
    }

    function triggerExplosion(pos: THREE.Vector3, radius: number) {
      const light = new THREE.PointLight(0xf97316, 20, 30);
      light.position.copy(pos);
      scene.add(light);
      spawnParticles(pos, 16, 0xfbbf24, 8, 6, 0.5);
      spawnParticles(pos, 10, 0xef4444, 6, 4, 0.6);
      const fireGeo = new THREE.SphereGeometry(1.4, 10, 8);
      const fireMat = new THREE.MeshBasicMaterial({ color: 0xff6a00, transparent: true, opacity: 0.9 });
      const fire = new THREE.Mesh(fireGeo, fireMat);
      fire.position.copy(pos);
      scene.add(fire);
      const start = performance.now();
      const anim = () => {
        const t = (performance.now() - start) / 350;
        if (t < 1) {
          fire.scale.setScalar(1 + t * 2.6);
          fireMat.opacity = 0.9 * (1 - t);
          light.intensity = 20 * (1 - t);
          requestAnimationFrame(anim);
        } else {
          scene.remove(fire); scene.remove(light);
          fireGeo.dispose(); fireMat.dispose();
        }
      };
      anim();
      sound.playExplosion();
      // Blast kicks the camera away from the explosion centre with heavy roll.
      const blastDir = p.pos.clone().sub(pos).setY(0);
      if (blastDir.lengthSq() < 0.001) blastDir.set(1, 0, 0);
      blastDir.normalize();
      const camBlast = blastDir.clone().applyQuaternion(camera.quaternion.clone().invert());
      addShake(0.18, camBlast.x, 0.7 + camBlast.y, (Math.random() - 0.5) * 0.8);
      fovPunch = Math.min(0.2, fovPunch + 6);
      tgHaptics.impact('heavy');
      const dToP = pos.distanceTo(p.pos);
      if (dToP < radius + 2) damagePlayer(Math.round(90 * Math.max(0.15, 1 - dToP / (radius + 2))), pos);
      for (const u of enemyUnits) {
        if (!u.state.alive) continue;
        const dToE = pos.distanceTo(u.state.pos);
        if (dToE < radius + 2) damageEnemy(u.state, u.soldier, Math.round(120 * Math.max(0.15, 1 - dToE / (radius + 2))), dToE < 2.5);
      }
    }

    function fireShot() {
      const w = currentWeapon();
      if (!w || !p.alive || phaseRef.current !== 'combat' || p.reloading || p.switching) return;
      const now = performance.now();
      if (now - p.lastFire < w.def.fireRateMs) return;
      if (w.ammoInClip <= 0) { tryReload(); return; }

      p.lastFire = now;
      w.ammoInClip -= 1;
      p.shotsFired += 1;

      p.recoilPitch += w.def.recoilPitch;
      p.recoilYaw += (Math.random() - 0.5) * w.def.recoilYaw * 2;
      p.pitch += w.def.recoilPitch * 0.6;
      p.bloom = Math.min(0.06, p.bloom + w.def.spreadHip * 0.25);

      const adsBlend = aimRef.current ? 1 : 0;
      const spread = w.def.spreadHip * (1 - adsBlend) + w.def.spreadAds * adsBlend + p.bloom;
      const baseDir = shootDir();

      sound.playGunshot(w.def.type);
      tgHaptics.impact(w.def.type === 'awm' || w.def.type === 'rpg' ? 'heavy' : 'medium');
      // Directional recoil kick: the camera snaps up and rolls a hair, with a
      // brief FOV punch — the classic "every shot has weight" feel.
      const shakePower = w.def.type === 'awm' ? 0.12 : w.def.type === 'shotgun' ? 0.09 : w.def.type === 'rpg' ? 0.16 : w.def.type === 'mp5' ? 0.03 : 0.045;
      addShake(shakePower, (Math.random() - 0.5) * 0.35, 0.8, (Math.random() - 0.5) * 0.5);
      fovPunch = Math.min(0.2, fovPunch + (w.def.type === 'awm' ? 4.5 : w.def.type === 'shotgun' ? 3.5 : w.def.type === 'rpg' ? 5 : 1.8));
      muzzleT = 0.05;

      if (w.def.type === 'rpg') {
        const rocket = new THREE.Group();
        const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.4, metalness: 0.6 }));
        cone.rotation.x = Math.PI / 2; cone.position.z = -0.35;
        rocket.add(cone);
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 8), new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.5, metalness: 0.8 }));
        tube.rotation.x = Math.PI / 2;
        rocket.add(tube);
        const rl = new THREE.PointLight(0xf97316, 8, 10);
        rl.position.z = 0.45;
        rocket.add(rl);
        const start = muzzleWorld().clone();
        rocket.position.copy(start);
        rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), baseDir);
        scene.add(rocket);
        projectiles.push({
          kind: 'rocket', mesh: rocket, vel: baseDir.clone().multiplyScalar(52),
          gravity: 2.2, dmg: w.def.damageMin + Math.random() * (w.def.damageMax - w.def.damageMin), owner: 'player', fuse: 0, bounced: false
        });
        if (mode !== 'ai') multiplayer.sendShootBullets([{ weaponType: 'rpg' }]);
        return;
      }

      const muzzlePos = muzzleWorld();
      const origin = shotOrigin();
      for (let i = 0; i < w.def.pellets; i++) {
        const jitter = new THREE.Vector3(
          (Math.random() - 0.5) * 2 * spread,
          (Math.random() - 0.5) * 2 * spread,
          (Math.random() - 0.5) * 2 * spread
        );
        const dir = baseDir.clone().add(jitter).normalize();

        if (w.def.type === 'awm') {
          // Simulated projectile with visible bullet drop
          const bullet = new THREE.Group();
          const bm = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 5), new THREE.MeshBasicMaterial({ color: 0xffd54a }));
          bm.rotation.x = Math.PI / 2;
          bullet.add(bm);
          bullet.position.copy(origin);
          bullet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
          scene.add(bullet);
          projectiles.push({
            kind: 'bullet', mesh: bullet, vel: dir.clone().multiplyScalar(w.def.bulletSpeed),
            gravity: 6.5, dmg: w.def.damageMin + Math.random() * (w.def.damageMax - w.def.damageMin),
            owner: 'player', fuse: 0, bounced: false
          });
          continue;
        }

        const hit = traceShot(origin, dir, w.def.range, 'player');
        const line = acquireTracer(w.def.tracerColor);
        line.geometry.setFromPoints([muzzlePos.clone(), hit.point.clone()]);
        activeTracers.push({ line, ttl: 0.07 });

        if ((hit.hit === 'head' || hit.hit === 'body' || hit.hit === 'limb') && hit.enemyIndex >= 0) {
          const dmg = w.def.damageMin + Math.random() * (w.def.damageMax - w.def.damageMin);
          const headshot = hit.hit === 'head';
          const total = headshot ? dmg * w.def.headshotMultiplier : hit.hit === 'limb' ? dmg * 0.7 : dmg;
          damageEnemy(enemyUnits[hit.enemyIndex].state, enemyUnits[hit.enemyIndex].soldier, total, headshot);
          spawnParticles(hit.point, headshot ? 10 : 6, 0xdc2626, 5, 9, 0.4);
          pushDamageNumber(hit.point, camera, renderer.domElement, `-${Math.round(total)}`, headshot);
        } else if (hit.hit === 'explosive' && hit.obstacle) {
          triggerExplosion(hit.point, 10);
        } else if (hit.hit === 'world') {
          const surf = hit.obstacle ? (hit.obstacle.type === 'car' ? 'metal' : 'concrete') : 'dirt';
          sound.playImpact(surf);
          spawnParticles(hit.point, 5, surf === 'metal' ? 0xf59e0b : surf === 'concrete' ? 0x9ca3af : 0x8a7a58, 4, 8, 0.3);
        }
      }
      if (mode !== 'ai') multiplayer.sendShootBullets([{ weaponType: w.def.type }]);
    }

    function throwGrenade() {
      if (!p.alive || phaseRef.current !== 'combat') return;
      const kind = p.nadeSlot;
      if (p.nades[kind] <= 0) { cookRef.current = false; setCookPreview(false); return; }
      p.nades[kind] -= 1;
      cookRef.current = false;
      setCookPreview(false);
      sound.playGrenadePin();

      const grp = new THREE.Group();
      const colors: Record<GrenadeType, number> = { frag: 0x4a5f3a, smoke: 0x94a3b8, flash: 0xfde047 };
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: colors[kind], roughness: 0.6, metalness: 0.4 }));
      grp.add(ball);
      const start = muzzleWorld().clone().add(new THREE.Vector3(0, 0.1, 0));
      const dir = shootDir().clone();
      grp.position.copy(start);
      scene.add(grp);
      projectiles.push({
        kind, mesh: grp,
        vel: dir.multiplyScalar(14).add(new THREE.Vector3(0, 6.5, 0)),
        gravity: 12, dmg: kind === 'frag' ? 100 : 0, owner: 'player',
        fuse: kind === 'frag' ? 3 : 2, bounced: false
      });
    }

    function tryReload() {
      const w = currentWeapon();
      if (!w || p.reloading || w.ammoInClip >= w.def.magazineSize || w.reserveAmmo <= 0) return;
      p.reloading = true;
      p.reloadUntil = performance.now() + w.def.reloadTimeMs;
      sound.playReload();
      tgHaptics.impact('light');
    }

    function disposeViewModel(vm: WeaponViewModel) {
      vm.group.traverse((o) => {
        if (o instanceof THREE.Mesh) { o.geometry.dispose(); (o.material as THREE.Material).dispose(); }
      });
    }

    function switchSlot(s: WeaponSlotId) {
      const w = p.weapons[s];
      if (!w || s === p.slot || p.reloading) return;
      p.slot = s;
      p.switching = true;
      p.switchUntil = performance.now() + 500;
      sound.playPickup();
      tgHaptics.selection();
      if (viewmodel) {
        camera.remove(viewmodel.group);
        disposeViewModel(viewmodel);
        viewmodel = createWeaponViewModel(w.def.type);
        viewmodel.group.visible = viewModeRef.current === 'fpp';
        camera.add(viewmodel.group);
      }
      // Third-person soldier mirrors the equipped weapon.
      playerSoldier.setWeapon(w.def.type);
    }

    function pickup(loot: LootItem3D) {
      if (!loot || loot.isCollected) return;
      if (loot.type === 'weapon' && loot.weaponType) {
        const def = WEAPONS[loot.weaponType];
        p.weapons[def.slot] = makeWeaponState(def.type, def.slot);
        if (p.slot !== def.slot) switchSlot(def.slot);
        pushFeed(`التقطت ${def.nameAr}`, def.icon);
        sound.playPickup();
      } else if (loot.type === 'ammo') {
        const w = p.weapons[p.slot];
        if (w) w.reserveAmmo += 90;
        sound.playPickup();
      } else if (loot.type === 'medkit') {
        p.medkits += 1;
        sound.playPickup();
      } else if (loot.type === 'armor') {
        p.armor = Math.min(100, p.armor + 50);
        sound.playShield();
      } else if (loot.type === 'grenade' && loot.grenadeType) {
        p.nades[loot.grenadeType] += 1;
        sound.playPickup();
      }
      tgHaptics.notification('success');
      loot.isCollected = true;
      loot.setCollected(true);
      setNearbyLoot(null);
      lastLootRef.current = null;
      if (mode !== 'ai') multiplayer.sendLootTaken(loot.id);
    }

    // ============================================================
    // Networking
    // ============================================================
    const findHumanEnemy = (senderId?: number): EnemyUnit | undefined =>
      enemyUnits.find((u) => u.state.isHuman && (senderId === undefined || u.state.id === senderId || u.state.id === 0));

    multiplayer.init(
      user.id,
      (msg) => {
        if (msg.type === 'JOIN_ROOM') {
          const opp = findHumanEnemy(msg.senderId);
          if (opp && typeof msg.senderId === 'number') opp.state.id = msg.senderId;
          setOpponentName(msg.payload.playerName || 'لاعب متصل');
          setConnStatus('connected');
        } else if (msg.type === 'SYNC_SHOOTER_STATE') {
          const s = msg.payload;
          const opp = findHumanEnemy(msg.senderId);
          if (s && opp && opp.state.alive) {
            opp.state.pos.set(s.x, s.y, s.z);
            opp.state.yaw = s.yaw;
            opp.soldier.root.position.set(s.x, s.y, s.z);
            opp.soldier.root.rotation.y = s.yaw;
          }
        } else if (msg.type === 'SHOOT_BULLETS') {
          const opp = findHumanEnemy(msg.senderId);
          if (!opp) return;
          const pos = opp.soldier.root.position;
          const dist = camera.position.distanceTo(pos);
          const toBot = pos.clone().sub(camera.position).normalize();
          const camDir = new THREE.Vector3();
          camera.getWorldDirection(camDir);
          const pan = toBot.clone().cross(camDir).y * 2;
          const rw = (msg.payload?.bullets?.[0]?.weaponType || 'ak47') as WeaponType;
          if (opp.state.weapon !== rw) {
            opp.state.weapon = rw;
            opp.soldier.setWeapon(rw);
          }
          sound.playSpatialShot(rw, dist, pan);
          opp.soldier.setMuzzleFlash(true);
          window.setTimeout(() => opp.soldier.setMuzzleFlash(false), 60);
          const from = opp.soldier.muzzle.getWorldPosition(new THREE.Vector3());
          const to = camera.position.clone().add(new THREE.Vector3(0, 0.5, 0));
          const line = acquireTracer(0xf87171);
          line.geometry.setFromPoints([from, to]);
          activeTracers.push({ line, ttl: 0.08 });
        } else if (msg.type === 'BULLET_HIT') {
          if (msg.payload.victimId === user.id) {
            const opp = findHumanEnemy(msg.senderId);
            damagePlayer(msg.payload.damage, opp ? opp.soldier.root.position : undefined);
          }
        } else if (msg.type === 'LOOT_TAKEN') {
          const taken = lootItems.find((l) => l.id === msg.payload.lootId);
          if (taken) { taken.isCollected = true; taken.setCollected(true); }
        } else if (msg.type === 'GAME_OVER') {
          if (msg.payload.winnerId === user.id) endMatch(true);
          else endMatch(false);
        }
      },
      (status, peerName) => {
        setConnStatus(status);
        if (peerName) setOpponentName(peerName);
      }
    );
    if (mode === 'host' || (mode === 'matchmade' && hasHumanOpponent && matchInfo && matchInfo.hostId === user.id)) {
      multiplayer.createRoom(roomCode, user.firstName);
    } else if (mode === 'join' || (mode === 'matchmade' && hasHumanOpponent && matchInfo && matchInfo.hostId !== user.id)) {
      multiplayer.joinRoom(roomCode, user.firstName);
    } else if (mode === 'matchmade') {
      multiplayer.startSoloMatch();
    } else {
      multiplayer.startAiMatch();
    }

    // ============================================================
    // AI
    // ============================================================
    function aiThink(dt: number, now: number) {
      // Every bot runs its own brain; human enemies are driven by the network.
      for (const u of enemyUnits) {
        if (u.state.isHuman || !u.state.alive) continue;
        const b = u.state;
        const botSoldier = u.soldier;

        const dist = b.pos.distanceTo(p.pos);
        const angToPlayer = Math.atan2(p.pos.x - b.pos.x, p.pos.z - b.pos.z);
        b.stateT += dt;

        const eyeB = b.pos.clone().add(new THREE.Vector3(0, 1.5, 0));
        const eyeP = p.pos.clone().add(new THREE.Vector3(0, 1.4, 0));
        const canSee = !lineBlocked(obstacles, eyeB, eyeP);
        if (canSee && dist < 130) { b.spotted = true; b.lastKnown.copy(p.pos); }

        const hpPct = b.hp / 100;
        if (b.stateT > 0.9 + Math.random() * 1.2) {
          b.stateT = 0;
          b.dodgeDir = Math.random() > 0.5 ? 1 : -1;
          if (!b.spotted && dist > 60) b.state = 'patrol';
          else if (hpPct < 0.25) b.state = 'retreat';
          else if (hpPct < 0.5 && Math.random() < 0.35) b.state = 'take_cover';
          else if (dist > 55) b.state = 'hunt';
          else if (dist > 24) b.state = Math.random() > 0.45 ? 'flank' : 'engage';
          else if (hpPct < 0.3) b.state = 'retreat';
          else if (p.reloading || p.hp < 30) b.state = 'push';
          else b.state = 'engage';
        }

        const faceAngle = b.state === 'retreat' ? angToPlayer + Math.PI : angToPlayer;
        const rotSpeed = dist < 15 ? 14 : 9;
        b.yaw += (faceAngle - b.yaw) * Math.min(1, dt * rotSpeed);
        botSoldier.root.rotation.y = b.yaw;

        let speed = 0;
        let moveAngle = angToPlayer;
        switch (b.state) {
          case 'patrol': {
            if (b.pauseT > 0) { b.pauseT -= dt; speed = 0; }
            else if (b.pos.distanceTo(b.patrolTarget) < 3 || b.patrolTarget.lengthSq() === 0) {
              const a = Math.random() * Math.PI * 2;
              b.patrolTarget.set(
                Math.max(-90, Math.min(90, b.pos.x + Math.cos(a) * (20 + Math.random() * 50))),
                b.pos.y,
                Math.max(-90, Math.min(90, b.pos.z + Math.sin(a) * (20 + Math.random() * 50)))
              );
              b.pauseT = 0.8 + Math.random() * 1.8;
            } else {
              speed = 4.2;
              moveAngle = Math.atan2(b.patrolTarget.x - b.pos.x, b.patrolTarget.z - b.pos.z);
            }
            break;
          }
          case 'hunt': speed = 7.4; moveAngle = angToPlayer; break;
          case 'engage': speed = 4.6; moveAngle = angToPlayer + b.dodgeDir * 0.4; break;
          case 'flank': speed = 5.8; moveAngle = angToPlayer + b.dodgeDir * (Math.PI * 0.42); break;
          case 'take_cover': speed = 5.2; moveAngle = angToPlayer + Math.PI * 0.5 * b.dodgeDir; break;
          case 'push': speed = 7.6; moveAngle = angToPlayer; break;
          case 'retreat': speed = 5.4; moveAngle = angToPlayer + Math.PI + b.dodgeDir * 0.6; break;
          case 'heal': speed = 0; break;
        }

        if ((b.state === 'engage' || b.state === 'flank' || b.state === 'push') && Math.sin(now * 0.007 + b.id) > 0.6) {
          moveAngle += b.dodgeDir * 0.7;
        }

        if (speed > 0) {
          const desired = new THREE.Vector3(b.pos.x + Math.sin(moveAngle) * speed * dt, b.pos.y, b.pos.z + Math.cos(moveAngle) * speed * dt);
          const blockedAt = (v: THREE.Vector3) => {
            const box = new THREE.Box3(new THREE.Vector3(v.x - 0.5, v.y, v.z - 0.5), new THREE.Vector3(v.x + 0.5, v.y + 1.9, v.z + 0.5));
            for (const o of obstacles) if (o.blocksMovement && o.box.intersectsBox(box)) return true;
            return false;
          };
          if (blockedAt(desired)) {
            const alt1 = new THREE.Vector3(b.pos.x + Math.sin(moveAngle + 1.2) * speed * dt, b.pos.y, b.pos.z + Math.cos(moveAngle + 1.2) * speed * dt);
            const alt2 = new THREE.Vector3(b.pos.x + Math.sin(moveAngle - 1.2) * speed * dt, b.pos.y, b.pos.z + Math.cos(moveAngle - 1.2) * speed * dt);
            if (!blockedAt(alt1)) b.pos.copy(alt1);
            else if (!blockedAt(alt2)) b.pos.copy(alt2);
          } else b.pos.copy(desired);
          b.pos.x = Math.max(-96, Math.min(96, b.pos.x));
          b.pos.z = Math.max(-96, Math.min(96, b.pos.z));
          b.pos.y = getHeightAt(b.pos.x, b.pos.z);
        }

        botSoldier.root.position.copy(b.pos);

        // ---- Firing ----
        if (b.reloadingUntil > now) continue;
        if (b.ammo <= 0) { b.reloadingUntil = now + 2200; b.ammo = 30; sound.playReload(); continue; }

        const longRange = dist > 60;
        const accBase = longRange ? 0.15 : dist < 15 ? 0.7 : 0.4;
        const fireInterval = longRange ? 900 : dist < 12 ? 150 : 260;

        // Bot carries a long gun at range, a rifle up close.
        const botWep: WeaponType = longRange ? 'awm' : 'ak47';
        if (b.weapon !== botWep) {
          b.weapon = botWep;
          botSoldier.setWeapon(botWep);
        }

        if (b.spotted && dist < 110 && now - b.lastFire > fireInterval) {
          b.lastFire = now;
          b.burstCount += 1;
          if (b.burstCount > (3 + Math.floor(Math.random() * 3))) {
            b.burstCount = 0;
            b.lastFire = now + 500 + Math.random() * 500;
          }
          b.ammo -= 1;

          botSoldier.setMuzzleFlash(true);
          window.setTimeout(() => botSoldier.setMuzzleFlash(false), 55);
          const dist2 = camera.position.distanceTo(b.pos);
          const toBot = b.pos.clone().sub(camera.position).normalize();
          const camDir = new THREE.Vector3();
          camera.getWorldDirection(camDir);
          const pan = toBot.clone().cross(camDir).y * 2;
          sound.playSpatialShot(botWep, dist2, pan);

          const spreadRad = (1 - accBase) * 0.09 + (p.crouched ? 0.02 : 0) + (p.prone ? 0.03 : 0);
          const from = botSoldier.muzzle.getWorldPosition(new THREE.Vector3());
          const aim = p.pos.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * 2 * spreadRad * dist * 0.5,
            1.3 + (Math.random() - 0.5) * 0.4,
            (Math.random() - 0.5) * 2 * spreadRad * dist * 0.5
          ));
          const dir = aim.sub(from).normalize();
          const line = acquireTracer(0xf87171);
          line.geometry.setFromPoints([from.clone(), aim.clone()]);
          activeTracers.push({ line, ttl: 0.09 });

          if (canSee && Math.random() < accBase) {
            const dmg = 7 + Math.floor(Math.random() * 9);
            const headshot = Math.random() < 0.12;
            damagePlayer(headshot ? dmg * 2.5 : dmg, b.pos);
            if (headshot) pushFeed('أصابك البوت في الرأس!', '🎯');
          } else if (Math.random() < 0.3) {
            sound.playWhiz();
          }
        }

        // ---- Grenade at player behind cover ----
        if (b.spotted && dist > 10 && dist < 40 && !canSee && now - b.lastGrenade > 9000 + Math.random() * 5000) {
          b.lastGrenade = now;
          const grp = new THREE.Group();
          grp.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshStandardMaterial({ color: 0x4a5f3a, roughness: 0.6 })));
          grp.position.copy(b.pos).add(new THREE.Vector3(0, 1.6, 0));
          scene.add(grp);
          const toTarget = p.pos.clone().sub(b.pos);
          toTarget.y = 0;
          const d = Math.max(1, toTarget.length());
          const vel = toTarget.normalize().multiplyScalar(Math.min(16, d * 0.9)).add(new THREE.Vector3(0, 7, 0));
          projectiles.push({ kind: 'frag', mesh: grp, vel, gravity: 12, dmg: 90, owner: 'bot', fuse: 3, bounced: false });
        }
      }
    }

    // ============================================================
    // Input
    // ============================================================
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysRef.current.add(k);
      if (k === 'v') engineRef.current?.toggleView();
      else if (k === 'c') engineRef.current?.toggleCrouch();
      else if (k === 'z') engineRef.current?.toggleProne();
      else if (k === 'r') engineRef.current?.reload();
      else if (k === 'f') engineRef.current?.interact();
      else if (k === 'g') engineRef.current?.cookGrenade(true);
      else if (k === '1') engineRef.current?.switchSlot('primary');
      else if (k === '2') engineRef.current?.switchSlot('secondary');
      else if (k === '3') engineRef.current?.switchSlot('sidearm');
      else if (k === 'h') engineRef.current?.useMedkit();
      else if (k === 'pageup') { e.preventDefault(); engineRef.current?.nudgeCamHeight(1); }
      else if (k === 'pagedown') { e.preventDefault(); engineRef.current?.nudgeCamHeight(-1); }
      else if (k === 'home') { e.preventDefault(); engineRef.current?.resetCamHeight(); }
      else if (k === ' ') { e.preventDefault(); engineRef.current?.jump(); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keysRef.current.delete(k);
      if (k === 'g') engineRef.current?.cookGrenade(false);
    };

    let mouseDown = false;
    let lastMX = 0, lastMY = 0;
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === renderer.domElement) {
        engineRef.current?.addLook(e.movementX, e.movementY);
      } else if (mouseDown) {
        const dx = e.clientX - lastMX, dy = e.clientY - lastMY;
        lastMX = e.clientX; lastMY = e.clientY;
        engineRef.current?.addLook(dx, dy);
      }
    };
    const onMouseDown = (e: MouseEvent) => {
      mouseDown = true;
      lastMX = e.clientX; lastMY = e.clientY;
      if (document.pointerLockElement !== renderer.domElement) {
        try { renderer.domElement.requestPointerLock(); } catch { /* sandboxed iframe */ }
      }
      if (e.button === 0) engineRef.current?.startFire();
      else if (e.button === 2) engineRef.current?.setAim(true);
    };
    const onMouseUp = (e: MouseEvent) => {
      mouseDown = false;
      if (e.button === 0) engineRef.current?.stopFire();
      else if (e.button === 2) engineRef.current?.setAim(false);
    };
    const onContext = (e: MouseEvent) => e.preventDefault();
    const onLockChange = () => setIsLocked(document.pointerLockElement === renderer.domElement);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('contextmenu', onContext);
    document.addEventListener('pointerlockchange', onLockChange);

    const handleResize = () => {
      const w = window.innerWidth || container.clientWidth;
      const h = window.innerHeight || container.clientHeight;
      if (w <= 0 || h <= 0) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    if (window.visualViewport) window.visualViewport.addEventListener('resize', handleResize);

    // ============================================================
    // Engine API (exposed to React touch handlers)
    // ============================================================
    engineRef.current = {
      startFire: () => {
        p.firing = true;
        fireHeldRef.current = true;
        const w = currentWeapon();
        if (w && !w.def.auto) fireShot();
      },
      stopFire: () => { p.firing = false; fireHeldRef.current = false; },
      setAim: (on) => { aimRef.current = on; },
      reload: tryReload,
      switchSlot,
      toggleCrouch: () => {
        if (p.prone) p.prone = false;
        p.crouched = !p.crouched;
        if (p.sprinting && p.crouched) p.slidingUntil = performance.now() + 550;
        sound.playPickup();
      },
      toggleProne: () => {
        p.prone = !p.prone;
        if (p.prone) p.crouched = false;
        tgHaptics.impact('medium');
        sound.playPickup();
      },
      jump: () => {
        if (p.grounded && !p.climbing) {
          p.vel.y = 5.6;
          p.grounded = false;
          sound.playJump();
          tgHaptics.impact('light');
          addShake(0.015, 0, 0.5, 0);
        }
      },
      toggleView: () => {
        viewModeRef.current = viewModeRef.current === 'tpp' ? 'fpp' : 'tpp';
        sound.playClick();
      },
      nudgeCamHeight: (dir) => {
        camHeightTarget = THREE.MathUtils.clamp(camHeightTarget + dir * 0.08, -0.35, 0.35);
        sound.playClick();
      },
      resetCamHeight: () => {
        camHeightTarget = 0;
        sound.playClick();
      },
      cookGrenade: (on) => {
        if (on) {
          if (p.nades[p.nadeSlot] > 0) { cookRef.current = true; setCookPreview(true); sound.playGrenadePin(); }
        } else {
          if (cookRef.current) throwGrenade();
        }
      },
      cycleNade: () => {
        const order: GrenadeType[] = ['frag', 'smoke', 'flash'];
        const idx = order.indexOf(p.nadeSlot);
        p.nadeSlot = order[(idx + 1) % order.length];
        sound.playClick();
        tgHaptics.selection();
      },
      selectNade: (g) => {
        if (p.nadeSlot === g) return;
        p.nadeSlot = g;
        sound.playClick();
        tgHaptics.selection();
      },
      useMedkit: () => {
        if (p.medkits > 0 && p.hp < 100) {
          p.medkits -= 1;
          p.hp = Math.min(100, p.hp + 50);
          sound.playPickup();
          tgHaptics.impact('light');
        }
      },
      interact: () => {
        if (lastLootRef.current) pickup(lastLootRef.current);
      },
      setMove: (x, y) => { moveVecRef.current = { x, y }; },
      addLook: (dx, dy) => {
        // Slower, steadier aim; ADS applies extra slowdown for fine control.
        const sens = 0.0022 * (aimRef.current ? 0.55 : 1);
        p.yaw -= dx * sens;
        p.pitch -= dy * sens;
        p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
      }
    };

    // ============================================================
    // Render loop
    // ============================================================
    const renderLoop = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const now = performance.now();
      const elapsed = (now - matchStart) / 1000;

      let phase: Phase;
      if (gameOverRef.current) phase = 'over';
      else if (elapsed < 3) phase = 'countdown';
      else if (elapsed < 8) phase = 'grace';
      else phase = 'combat';
      phaseRef.current = phase;

      const countNum = 3 - Math.floor(elapsed);
      if (phase === 'countdown' && countNum !== lastCountShown && countNum >= 1) {
        lastCountShown = countNum;
        sound.playCountdown(countNum as 1 | 2 | 3);
      } else if (phase === 'grace' && lastCountShown !== 0) {
        lastCountShown = 0;
        sound.playCountdown('go');
      }

      // ---- Movement input ----
      const keys = keysRef.current;
      const mv = moveVecRef.current;
      let mx = 0, mz = 0;
      if (keys.has('w') || keys.has('arrowup')) mz += 1;
      if (keys.has('s') || keys.has('arrowdown')) mz -= 1;
      if (keys.has('d') || keys.has('arrowright')) mx += 1;
      if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
      if (mv.x !== 0 || mv.y !== 0) { mx += mv.x; mz += -mv.y; }
      const canMove = phase === 'combat' || phase === 'grace';
      const moving = (mx !== 0 || mz !== 0) && canMove;

      // Lean
      let leanTarget = 0;
      if (keys.has('q')) leanTarget = -1;
      if (keys.has('e')) leanTarget = 1;
      p.lean += (leanTarget * 0.34 - p.lean) * Math.min(1, dt * 10);

      const wantSprint = (keys.has('shift') || (mv.x !== 0 && mv.y !== 0 && Math.hypot(mv.x, mv.y) > 0.9)) && !p.crouched && !p.prone && moving;
      p.sprinting = wantSprint;
      const sliding = p.slidingUntil > now;
      const speedMul = sliding ? 1.2 : p.prone ? 0.32 : p.crouched ? 0.55 : p.sprinting ? 1.55 : 1.0;
      const adsMul = aimRef.current ? 0.5 : 1;
      const baseSpeed = 6.2 * speedMul * adsMul;

      const forward = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      const right = new THREE.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
      const wish = canMove
        ? forward.clone().multiplyScalar(mz).add(right.clone().multiplyScalar(mx))
        : new THREE.Vector3();
      if (wish.lengthSq() > 0) wish.normalize().multiplyScalar(baseSpeed);
      const accel = p.grounded ? 14 : 4;
      p.vel.x += (wish.x - p.vel.x) * Math.min(1, dt * accel);
      p.vel.z += (wish.z - p.vel.z) * Math.min(1, dt * accel);
      if (sliding) { p.vel.x += wish.x * dt * 0.5; p.vel.z += wish.z * dt * 0.5; }

      // Ladder climb
      p.climbing = false;
      for (const lad of ladders) {
        if (Math.hypot(p.pos.x - lad.x, p.pos.z - lad.z) < 1.6) {
          if (keys.has('w') || keys.has('arrowup') || keys.has(' ')) {
            p.pos.y = Math.min(lad.topY, p.pos.y + 5.0 * dt);
            p.vel.y = 0;
            p.climbing = true;
          } else if (keys.has('s') || keys.has('arrowdown')) {
            p.pos.y = Math.max(lad.baseY, p.pos.y - 4.5 * dt);
            p.vel.y = 0;
            p.climbing = true;
          }
        }
      }

      if (!p.climbing) {
        const groundY = getHeightAt(p.pos.x, p.pos.z);
        let standY = groundY;
        for (const o of obstacles) {
          const top = o.box.max.y;
          const within = p.pos.x >= o.box.min.x - 0.3 && p.pos.x <= o.box.max.x + 0.3 && p.pos.z >= o.box.min.z - 0.3 && p.pos.z <= o.box.max.z + 0.3;
          if (within && top >= groundY - 0.5 && p.pos.y >= top - 0.6 && p.pos.y <= top + 1.0) standY = Math.max(standY, top);
        }

        p.vel.y -= 15 * dt;
        p.pos.y += p.vel.y * dt;
        if (p.pos.y <= standY + 0.01) {
          const fallSpeed = p.vel.y;
          p.pos.y = standY;
          p.vel.y = 0;
          if (!p.grounded) {
            const hard = fallSpeed < -8;
            sound.playLand(p.surface, hard);
            if (hard) {
              addShake(0.06, 0, -0.8, 0);
              tgHaptics.impact('medium');
            } else {
              tgHaptics.impact('soft');
            }
          }
          p.grounded = true;
        } else p.grounded = false;

        if (moving || Math.abs(p.vel.x) > 0.01 || Math.abs(p.vel.z) > 0.01) {
          p.pos.x += p.vel.x * dt;
          p.pos.z += p.vel.z * dt;
          const playerBox = new THREE.Box3(
            new THREE.Vector3(p.pos.x - 0.42, p.pos.y + 0.15, p.pos.z - 0.42),
            new THREE.Vector3(p.pos.x + 0.42, p.pos.y + 1.75, p.pos.z + 0.42)
          );
          for (const o of obstacles) {
            if (!o.blocksMovement) continue;
            if (p.pos.y >= o.box.max.y - 0.15) continue;
            if (o.box.intersectsBox(playerBox)) {
              const c = new THREE.Vector3();
              o.box.getCenter(c);
              if (Math.abs(p.pos.x - c.x) > Math.abs(p.pos.z - c.z)) p.pos.x += Math.sign(p.pos.x - c.x) * 0.06;
              else p.pos.z += Math.sign(p.pos.z - c.z) * 0.06;
            }
          }
        }
      }

      p.pos.x = Math.max(-env.bounds + 1, Math.min(env.bounds - 1, p.pos.x));
      p.pos.z = Math.max(-env.bounds + 1, Math.min(env.bounds - 1, p.pos.z));

      // Surface + footsteps
      p.surface = surfaceAt(p.pos);
      const bobSpeed = p.sprinting ? 13 : p.crouched ? 6 : 8.5;
      if (moving && p.grounded) {
        p.bobPhase += dt * bobSpeed;
        p.stepTimer -= dt;
        if (p.stepTimer <= 0) {
          p.stepTimer = p.sprinting ? 0.3 : 0.42;
          sound.playFootstep(p.surface, p.sprinting);
          tgHaptics.impact(p.sprinting ? 'light' : 'soft');
        }
      }

      // ---- Heartbeat thump when critically wounded ----
      if (phase === 'combat' && p.alive && p.hp <= 30) {
        heartbeatTimer -= dt;
        if (heartbeatTimer <= 0) {
          heartbeatTimer = 1.15 - (30 - p.hp) * 0.022;
          sound.playHeartbeat();
        }
      }

      // ---- Firing (hold for auto) ----
      if (p.firing || fireHeldRef.current) {
        const w = currentWeapon();
        if (w && w.def.auto) fireShot();
      }

      // ---- Grenade cooking fuse ----
      if (cookRef.current) {
        cookFuse -= dt;
        if (cookFuse <= 0) throwGrenade();
      } else cookFuse = 3;

      // ---- Reload / switch ----
      if (p.reloading && now >= p.reloadUntil) {
        const w = currentWeapon();
        if (w) {
          const need = w.def.magazineSize - w.ammoInClip;
          const take = Math.min(need, w.reserveAmmo);
          w.ammoInClip += take;
          w.reserveAmmo -= take;
        }
        p.reloading = false;
        sound.playClick();
        tgHaptics.notification('success');
      }
      if (p.switching && now >= p.switchUntil) p.switching = false;

      // Recoil recovery
      p.recoilPitch *= Math.pow(0.001, dt);
      p.recoilYaw *= Math.pow(0.001, dt);
      p.bloom = Math.max(0, p.bloom - dt * 0.02);

      // ---- Projectiles ----
      for (let i = projectiles.length - 1; i >= 0; i--) {
        const pr = projectiles[i];
        pr.vel.y -= pr.gravity * dt;
        const prev = pr.mesh.position.clone();
        pr.mesh.position.addScaledVector(pr.vel, dt);

        if (pr.kind === 'rocket') {
          if (Math.random() < 0.7) spawnParticles(prev, 1, 0x78716c, 1.5, 0, 0.35);
          let exploded = false;
          if (pr.owner === 'player') {
            for (const u of enemyUnits) {
              if (u.state.alive && pr.mesh.position.distanceTo(u.state.pos) < 2.0) { exploded = true; break; }
            }
          } else if (pr.mesh.position.distanceTo(p.pos) < 2.0) {
            exploded = true;
          }
          for (const o of obstacles) {
            if (o.blocksBullets && o.box.containsPoint(pr.mesh.position)) { exploded = true; break; }
          }
          if (pr.mesh.position.y <= getHeightAt(pr.mesh.position.x, pr.mesh.position.z) + 0.1) exploded = true;
          if (exploded) {
            const blastPos = pr.mesh.position.clone();
            scene.remove(pr.mesh);
            projectiles.splice(i, 1);
            triggerExplosion(blastPos, 9);
          }
        } else if (pr.kind === 'bullet') {
          const dir = pr.vel.clone().normalize();
          const step = pr.vel.length() * dt;
          const rayEnd = prev.clone().add(dir.clone().multiplyScalar(step));
          let done = false;
          let nearestIdx = -1;
          let nearestHit: { point: THREE.Vector3; zone: 'head' | 'body' | 'limb' } | null = null;
          let nearestDist = Infinity;
          if (pr.owner === 'player') {
            for (let i = 0; i < enemyUnits.length; i++) {
              const u = enemyUnits[i];
              if (!u.state.alive) continue;
              u.soldier.root.updateMatrixWorld(true);
              const raycaster = new THREE.Raycaster(prev, dir, 0, step);
              const zones = [u.soldier.hitHead, u.soldier.hitBody, ...u.soldier.hitLimbs];
              const hits = raycaster.intersectObjects(zones, false);
              if (hits.length > 0 && hits[0].distance < nearestDist) {
                nearestDist = hits[0].distance;
                nearestIdx = i;
                const obj = hits[0].object as THREE.Mesh;
                const zone = obj.userData.isHitZone as 'head' | 'body' | 'limb' | undefined;
                nearestHit = { point: hits[0].point.clone(), zone: zone ?? 'body' };
              }
            }
          } else {
            playerSoldier.root.updateMatrixWorld(true);
            const raycaster = new THREE.Raycaster(prev, dir, 0, step);
            const zones = [playerSoldier.hitHead, playerSoldier.hitBody, ...playerSoldier.hitLimbs];
            const hits = raycaster.intersectObjects(zones, false);
            if (hits.length > 0) {
              nearestDist = hits[0].distance;
              const obj = hits[0].object as THREE.Mesh;
              const zone = obj.userData.isHitZone as 'head' | 'body' | 'limb' | undefined;
              nearestHit = { point: hits[0].point.clone(), zone: zone ?? 'body' };
            }
          }
          if (nearestHit) {
            const headshot = nearestHit.zone === 'head';
            if (pr.owner === 'player' && nearestIdx >= 0) {
              const u = enemyUnits[nearestIdx];
              damageEnemy(u.state, u.soldier, pr.dmg * (headshot ? 2.5 : nearestHit.zone === 'limb' ? 0.7 : 1), headshot);
              pushDamageNumber(nearestHit.point, camera, renderer.domElement, `-${Math.round(pr.dmg * (headshot ? 2.5 : 1))}`, headshot);
            } else if (pr.owner !== 'player') {
              damagePlayer(pr.dmg, pr.mesh.position);
            }
            spawnParticles(nearestHit.point, headshot ? 10 : 6, 0xdc2626, 5, 9, 0.4);
            done = true;
          } else {
            for (const o of obstacles) {
              if (o.blocksBullets) {
                const t = rayHitsAABB(prev, dir, o.box);
                if (t !== null && t <= step) {
                  const pt = prev.clone().addScaledVector(dir, t);
                  spawnParticles(pt, 4, o.type === 'car' ? 0xf59e0b : 0x9ca3af, 4, 8, 0.3);
                  sound.playImpact(o.type === 'car' ? 'metal' : 'concrete');
                  done = true;
                  break;
                }
              }
            }
            if (!done && rayEnd.y <= getHeightAt(rayEnd.x, rayEnd.z)) {
              spawnParticles(rayEnd, 4, 0x8a7a58, 3, 6, 0.25);
              done = true;
            }
          }
          if (done || pr.mesh.position.length() > 420) {
            scene.remove(pr.mesh);
            projectiles.splice(i, 1);
          }
        } else {
          // Grenades
          const gh = getHeightAt(pr.mesh.position.x, pr.mesh.position.z);
          if (pr.mesh.position.y <= gh + 0.16 && pr.vel.y < 0) {
            pr.mesh.position.y = gh + 0.16;
            if (!pr.bounced) {
              pr.bounced = true;
              pr.vel.y = Math.abs(pr.vel.y) * 0.42;
              pr.vel.x *= 0.7;
              pr.vel.z *= 0.7;
              sound.playGrenadeBounce();
            } else {
              pr.vel.multiplyScalar(0.25);
              pr.vel.y = 0;
            }
          }
          pr.fuse -= dt;
          if (pr.fuse <= 0) {
            const blastPos = pr.mesh.position.clone();
            scene.remove(pr.mesh);
            projectiles.splice(i, 1);
            if (pr.kind === 'frag') {
              triggerExplosion(blastPos, 8);
              if (pr.owner === 'player') pushFeed('قنبلتك انفجرت', '💣');
            } else if (pr.kind === 'smoke') {
              sound.playSmokePop();
              for (let s = 0; s < 14; s++) {
                const puff = new THREE.Mesh(
                  new THREE.SphereGeometry(1.2, 8, 6),
                  new THREE.MeshBasicMaterial({ color: 0xcbd5e1, transparent: true, opacity: 0.4, depthWrite: false })
                );
                puff.position.copy(blastPos).add(new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2));
                scene.add(puff);
                smokes.push({
                  mesh: puff, life: 0, maxLife: 5 + Math.random() * 2,
                  vel: new THREE.Vector3((Math.random() - 0.5) * 0.8, 0.5 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8)
                });
              }
            } else if (pr.kind === 'flash') {
              sound.playFlashbang();
              const toFlash = blastPos.clone().sub(p.pos).normalize();
              const facing = new THREE.Vector3(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
              const dot = toFlash.dot(facing);
              const canSeeFlash = !lineBlocked(obstacles, p.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), blastPos.clone().add(new THREE.Vector3(0, 1, 0)));
              if (dot > 0.15 && canSeeFlash) {
                flashLevel = Math.max(flashLevel, dot);
                tgHaptics.impact('heavy');
              }
            }
          }
        }
      }

      // ---- Smoke puffs ----
      for (let i = smokes.length - 1; i >= 0; i--) {
        const s = smokes[i];
        s.life += dt;
        const t = s.life / s.maxLife;
        s.mesh.position.addScaledVector(s.vel, dt);
        s.mesh.scale.setScalar(1 + t * 3.4);
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = 0.42 * (1 - t);
        if (t >= 1) {
          scene.remove(s.mesh);
          s.mesh.geometry.dispose();
          (s.mesh.material as THREE.Material).dispose();
          smokes.splice(i, 1);
        }
      }

      // ---- Particles ----
      for (let i = particles.length - 1; i >= 0; i--) {
        const pt = particles[i];
        pt.life += dt;
        pt.vel.y -= pt.gravity * dt;
        pt.mesh.position.addScaledVector(pt.vel, dt);
        (pt.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - pt.life / pt.maxLife);
        if (pt.life >= pt.maxLife) {
          scene.remove(pt.mesh);
          (pt.mesh.material as THREE.Material).dispose();
          particles.splice(i, 1);
        }
      }

      // ---- Tracers ----
      for (let i = activeTracers.length - 1; i >= 0; i--) {
        const tr = activeTracers[i];
        tr.ttl -= dt;
        (tr.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, tr.ttl / 0.1);
        if (tr.ttl <= 0) {
          releaseTracer(tr.line);
          activeTracers.splice(i, 1);
        }
      }

      // ---- AI ----
      aiThink(dt, now);

      // ---- Safe zone ----
      if (phase === 'combat' || phase === 'grace') {
        zone.timer -= dt;
        if (zone.timer <= 0) {
          if (zone.phase === 'wait') {
            zone.phase = 'shrink';
            zone.timer = 14;
            const a = Math.random() * Math.PI * 2;
            const r = Math.random() * (safeZone.radius * 0.55);
            zone.target.set(
              Math.max(-env.bounds + 40, Math.min(env.bounds - 40, safeZone.center.x + Math.cos(a) * r)),
              Math.max(-env.bounds + 40, Math.min(env.bounds - 40, safeZone.center.y + Math.sin(a) * r))
            );
          } else {
            zone.phase = 'wait';
            zone.timer = 45;
            safeZone.center.copy(zone.target);
            safeZone.targetRadius = Math.max(12, safeZone.radius * 0.55);
          }
        }
        if (zone.phase === 'shrink') {
          safeZone.center.lerp(zone.target, dt * 0.35);
          safeZone.radius = Math.max(safeZone.targetRadius, safeZone.radius - safeZone.shrinkSpeed * dt * 6);
          safeZone.mesh.position.set(safeZone.center.x, 30, safeZone.center.y);
          safeZone.mesh.scale.setScalar(safeZone.radius / zoneBaseRadius);
        }
      }
      const distCenter = Math.hypot(p.pos.x - safeZone.center.x, p.pos.z - safeZone.center.y);
      const outside = distCenter > safeZone.radius;
      if (outside && phase === 'combat' && now - lastZoneDmg > 1000) {
        lastZoneDmg = now;
        damagePlayer(6, p.pos.clone().add(new THREE.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw)).multiplyScalar(-1)));
      }

      if (phase === 'combat' && elapsed > totalMatch && !gameOverRef.current) {
        // Timer decision: with a human opponent, higher remaining HP wins; a
        // pure bot battle is won by surviving with at least one elimination.
        const opp = enemyUnits.find((u) => u.state.isHuman && u.state.alive);
        endMatch(opp ? p.hp >= opp.state.hp : p.alive && p.kills >= 1);
      }
      if (hasHumanOpponent && connStatus === 'disconnected' && phase === 'combat' && !gameOverRef.current) endMatch(true);

      // ---- Player pose ----
      const soldier = playerSoldier;
      soldier.root.position.copy(p.pos);
      soldier.root.rotation.y = p.yaw;
      const rig = soldier.rig;
      const crouchBlend = p.crouched ? 1 : 0;
      const proneBlend = p.prone ? 1 : 0;
      const stride = moving && p.grounded ? Math.sin(p.bobPhase) : 0;
      const strideOpp = moving && p.grounded ? Math.sin(p.bobPhase + Math.PI) : 0;

      const legSwing = p.sprinting ? 0.6 : p.crouched ? 0.25 : 0.45;
      rig.leftLeg.rotation.x = THREE.MathUtils.lerp(rig.leftLeg.rotation.x,
        proneBlend * 0.3 + crouchBlend * -0.75 + (1 - crouchBlend - proneBlend) * strideOpp * legSwing, dt * 12);
      rig.rightLeg.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.rotation.x,
        proneBlend * 0.5 + crouchBlend * -0.75 + (1 - crouchBlend - proneBlend) * stride * legSwing, dt * 12);

      const armAim = p.pitch * 0.7 - 0.3;
      rig.leftArm.rotation.x = THREE.MathUtils.lerp(rig.leftArm.rotation.x,
        proneBlend * -1.4 + crouchBlend * -0.4 + (1 - crouchBlend) * (armAim - stride * 0.3), dt * 12);
      rig.rightArm.rotation.x = THREE.MathUtils.lerp(rig.rightArm.rotation.x,
        proneBlend * -1.4 + crouchBlend * -0.4 + (1 - crouchBlend) * (armAim - strideOpp * 0.3), dt * 12);
      rig.leftArm.rotation.z = THREE.MathUtils.lerp(rig.leftArm.rotation.z, p.pitch * 0.2, dt * 10);
      rig.rightArm.rotation.z = THREE.MathUtils.lerp(rig.rightArm.rotation.z, -p.pitch * 0.2, dt * 10);

      const torsoY = proneBlend * 0.45 + crouchBlend * 0.95 + (1 - crouchBlend - proneBlend) * 1.24;
      const headY = proneBlend * 0.55 + crouchBlend * 1.3 + (1 - crouchBlend - proneBlend) * 1.62;
      soldier.torso.position.y = THREE.MathUtils.lerp(soldier.torso.position.y, torsoY, dt * 12);
      soldier.head.position.y = THREE.MathUtils.lerp(soldier.head.position.y, headY, dt * 12);
      soldier.torso.rotation.x = THREE.MathUtils.lerp(soldier.torso.rotation.x,
        proneBlend * -1.35 + (p.sprinting ? 0.14 : 0) + p.pitch * 0.1, dt * 10);

      const gunAimY = proneBlend * 0.5 + crouchBlend * 1.1 + (1 - crouchBlend - proneBlend) * 1.36;
      rig.recoil.position.y = THREE.MathUtils.lerp(rig.recoil.position.y, gunAimY, dt * 12);
      rig.recoil.rotation.x = THREE.MathUtils.lerp(rig.recoil.rotation.x, p.pitch * 0.8, dt * 12);
      const sway = p.sprinting ? 0.05 : 0.02;
      rig.recoil.rotation.z = THREE.MathUtils.lerp(rig.recoil.rotation.z, stride * sway + p.lean * 0.1, dt * 8);
      soldier.torso.rotation.z = THREE.MathUtils.lerp(soldier.torso.rotation.z, p.lean * 0.12, dt * 8);
      muzzleT = Math.max(0, muzzleT - dt);
      soldier.setMuzzleFlash(p.firing && muzzleT > 0 && phase === 'combat');

      // ---- Enemy pose (bots walk; human opponent mirrors the network) ----
      for (const u of enemyUnits) {
        const sol = u.soldier;
        const rig = sol.rig;
        if (u.state.alive) {
          const bStride = Math.sin(now * 0.011 + u.state.id * 1.7);
          rig.leftLeg.rotation.x = bStride * 0.5;
          rig.rightLeg.rotation.x = -bStride * 0.5;
          rig.leftArm.rotation.x = -0.4 - bStride * 0.3;
          rig.rightArm.rotation.x = -0.4 + bStride * 0.3;
          sol.torso.position.y = 1.24;
          sol.head.position.y = 1.62;
          sol.torso.rotation.x = 0;
        } else {
          // Death ragdoll: fall flat on the back with a natural sideways tilt.
          sol.root.rotation.x = THREE.MathUtils.lerp(sol.root.rotation.x, -Math.PI / 2, dt * 5);
          sol.root.rotation.z = THREE.MathUtils.lerp(sol.root.rotation.z, 0.18, dt * 3);
          sol.root.position.y = getHeightAt(sol.root.position.x, sol.root.position.z);
        }
      }

      // ---- Camera ----
      const viewMode = viewModeRef.current;
      // Ease the view blend toward the selected mode: 0 = first-person,
      // 1 = third-person. This turns the toggle into a smooth cinematic dolly.
      viewBlend = THREE.MathUtils.damp(viewBlend, viewMode === 'fpp' ? 0 : 1, 7, dt);
      const tpp = THREE.MathUtils.smoothstep(viewBlend, 0, 1);

      // Ease the user's camera-height preference in/out for a comfortable feel.
      camHeightTarget = THREE.MathUtils.clamp(camHeightTarget, -0.35, 0.35);
      p.camHeight = THREE.MathUtils.damp(p.camHeight, camHeightTarget, 6, dt);
      const camH = p.camHeight;

      const crouchEye = p.crouched ? 1.15 : 1.65;
      const eyeH = p.prone ? 0.42 : crouchEye + (sliding ? -0.25 : 0);
      // FPP aim = per-weapon ADS (sniper zooms to 15°). TPP aim = shoulder zoom.
      // Sprint widens the view (sense of speed); fire/recoil punches it briefly.
      const sprintFov = !aimRef.current && p.sprinting ? 5 : 0;
      const fovFpp = aimRef.current ? (currentWeapon()?.def.adsFov ?? 45) : 75 + sprintFov;
      const fovTpp = aimRef.current ? 55 : 70 + sprintFov;
      const targetFov = THREE.MathUtils.lerp(fovFpp, fovTpp, tpp) + fovPunch;
      camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, dt * 12);
      camera.updateProjectionMatrix();
      fovPunch *= Math.pow(0.0015, dt);

      const bobAmp = p.sprinting ? 0.035 : p.crouched ? 0.012 : 0.022;
      const bobY = moving && p.grounded ? Math.abs(Math.sin(p.bobPhase)) * bobAmp : 0;
      const bobX = moving && p.grounded ? Math.sin(p.bobPhase * 0.5) * bobAmp * 0.6 : 0;
      // Slight roll into sideways movement (strafe tilt) for a planted feel.
      const strafeTilt = (moving && p.grounded ? mx : 0) * -0.014;

      // First-person viewmodel is shown only while mostly first-person; the
      // soldier body only while mostly third-person.
      if (viewmodel) {
        viewmodel.group.visible = tpp < 0.55;
        if (viewmodel.group.visible) {
          const vm = viewmodel.group;
          const adsBlend2 = aimRef.current ? 1 : 0;
          const basePos = new THREE.Vector3(0.26, -0.22, -0.5);
          const adsPos = new THREE.Vector3(0, -0.012, -0.42);
          const vmPos = basePos.clone().lerp(adsPos, adsBlend2);
          vmPos.x += p.lean * -0.12 + bobX + p.recoilYaw * 1.4;
          vmPos.y += bobY + p.recoilPitch * 0.35 + Math.sin(now * 0.0016) * 0.004 * (1 - adsBlend2 * 0.7);
          vmPos.z += p.recoilPitch * 0.6;
          vm.position.lerp(vmPos, dt * 16);
          vm.rotation.x = THREE.MathUtils.lerp(vm.rotation.x, p.pitch * 0.5 - p.recoilPitch * 3.4, dt * 16);
          vm.rotation.y = THREE.MathUtils.lerp(vm.rotation.y, p.recoilYaw * 2.2, dt * 16);
          vm.rotation.z = THREE.MathUtils.lerp(vm.rotation.z, p.lean * -0.06 + stride * 0.01 + p.recoilYaw * -1.2, dt * 10);
          // Muzzle flash gets a fresh random roll each shot (organic feel).
          if (muzzleT > 0) viewmodel.muzzle.rotation.z = Math.random() * Math.PI * 2;
          viewmodel.muzzleLight.intensity = muzzleT > 0 ? 5 : 0;
          (viewmodel.muzzle.children[0] as THREE.Object3D).visible = muzzleT > 0;
        }
      }
      playerSoldier.root.visible = tpp > 0.45;

      // ---- First-person pose (eye at head height) ----
      const fppPos = new THREE.Vector3(
        p.pos.x + p.lean * 0.28,
        p.pos.y + eyeH + bobY,
        p.pos.z
      );
      const qFpp = new THREE.Quaternion().setFromEuler(new THREE.Euler(p.pitch, p.yaw, p.lean * 0.12 + strafeTilt, 'YXZ'));

      // ---- Third-person over-the-shoulder pose ----
      // The camera sits up and to the right of the player's head and looks
      // straight along the aim direction, so the player is framed to the lower
      // left of the screen while the crosshair lands exactly on the aim point
      // (instead of sitting on the player's back).
      const cosY = Math.cos(p.yaw), sinY = Math.sin(p.yaw);
      const camDist = 3.4;
      const shoulder = 0.55 + p.lean * 0.5;
      const tppPos = new THREE.Vector3(
        p.pos.x + sinY * camDist + cosY * shoulder,
        p.pos.y + 1.75 + camH + bobY,
        p.pos.z + cosY * camDist - sinY * shoulder
      );

      // Never let the orbit camera sink below the terrain when looking down.
      tppPos.y = Math.max(tppPos.y, getHeightAt(tppPos.x, tppPos.z) + 0.35);

      // Camera collision: pull the camera in when a wall stands between the
      // player's head and the desired orbit point (prevents seeing through
      // buildings and popping geometry).
      const chest = new THREE.Vector3(p.pos.x, p.pos.y + 1.6, p.pos.z);
      const toCam = tppPos.clone().sub(chest);
      const camLen = toCam.length();
      if (camLen > 1e-4) {
        const camDir = toCam.normalize();
        let tMin = camLen;
        for (const o of obstacles) {
          if (!o.blocksBullets) continue;
          const t = rayHitsAABB(chest, camDir, o.box);
          if (t !== null && t >= 0 && t < tMin) tMin = t;
        }
        if (tMin < camLen - 0.2) {
          tppPos.copy(chest).addScaledVector(camDir, Math.max(0.3, tMin - 0.25));
          tppPos.y = Math.max(tppPos.y, getHeightAt(tppPos.x, tppPos.z) + 0.3);
        }
      }

      // Aim direction shared by the camera and the bullets (crosshair-aligned).
      const fwd = new THREE.Vector3(
        -sinY * Math.cos(p.pitch),
        Math.sin(p.pitch),
        -cosY * Math.cos(p.pitch)
      );
      const look = tppPos.clone().addScaledVector(fwd, 60);
      camera.position.copy(tppPos);
      camera.lookAt(look);
      camera.rotateZ(-p.lean * 0.06 + strafeTilt * 0.6);
      const qTpp = camera.quaternion.clone();

      // Blend the two poses: tpp=0 -> first-person, tpp=1 -> third-person.
      camera.position.copy(fppPos).lerp(tppPos, tpp);
      camera.quaternion.copy(qFpp).slerp(qTpp, tpp);

      // ---- Apply screen shake: decaying directional kick + rolling wobble ----
      // The kick is applied as an offset from the true pose and decays back to
      // zero, so the camera always settles on the correct framing.
      if (shakeMag > 0.001 || shakeKick.lengthSq() > 1e-8 || Math.abs(shakeRoll) > 0.0005) {
        const t = now * 0.001;
        const wobX = Math.sin(t * 46.3) * 0.55 + Math.sin(t * 23.7) * 0.45;
        const wobY = Math.cos(t * 39.1) * 0.55 + Math.cos(t * 31.3) * 0.45;
        camera.translateX(shakeKick.x + wobX * shakeMag * 0.03);
        camera.translateY(shakeKick.y + wobY * shakeMag * 0.03);
        camera.rotateZ(shakeRoll + wobX * shakeMag * 0.02);
        shakeKick.multiplyScalar(Math.pow(0.0012, dt));
        shakeMag *= Math.pow(0.0012, dt);
        shakeRoll *= Math.pow(0.0012, dt);
        if (shakeMag < 0.001) shakeMag = 0;
      } else {
        shakeKick.set(0, 0, 0);
        shakeRoll = 0;
      }

      if (flashLevel > 0.01) {
        setScreenFlash(flashLevel);
        flashLevel *= Math.pow(0.001, dt);
      } else if (flashLevel > 0) flashLevel = 0;

      if (hitmarkerT > 0) {
        hitmarkerT -= dt;
        if (hitmarkerT <= 0) setHitmarker(null);
      }

      // ---- Loot proximity + animation ----
      let nearLoot: LootItem3D | null = null;
      for (const loot of lootItems) {
        if (loot.isCollected) continue;
        loot.mesh.rotation.y += dt * 1.5;
        // Gentle hover bob keeps items feeling alive and easy to spot.
        loot.mesh.position.y = loot.pos.y + Math.sin(now * 0.0022 + loot.pos.x * 0.13) * 0.08;
        if (p.pos.distanceTo(loot.pos) < 3.6) nearLoot = loot;
      }
      // Shared loot light eases toward the nearest uncollected item, fading
      // out when nothing is nearby — a premium touch without per-item lights.
      if (lootLight) {
        if (nearLoot) {
          lootColor.set(nearLoot.colorHex);
          lootLight.color.lerp(lootColor, dt * 8);
          lootLight.intensity = THREE.MathUtils.lerp(lootLight.intensity, 5, dt * 8);
          lootLightPos.copy(nearLoot.pos);
          lootLightPos.y += 1.6;
          lootLight.position.lerp(lootLightPos, dt * 8);
        } else {
          lootLight.intensity = THREE.MathUtils.lerp(lootLight.intensity, 0, dt * 6);
        }
      }
      if (nearLoot !== lastLootRef.current) {
        lastLootRef.current = nearLoot;
        setNearbyLoot(nearLoot);
      }

      // ---- Ambient animation (water waves, mist breathing, dust drift) ----
      const dust = scene.getObjectByName('dust');
      if (dust) dust.rotation.y += dt * 0.008;

      const rays = scene.getObjectByName('godRays');
      if (rays) ((rays as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.05 + Math.sin(now * 0.0004) * 0.018;

      const waterMesh = scene.getObjectByName('water');
      if (waterMesh) {
        const wg = (waterMesh as THREE.Mesh).geometry;
        const wPos = wg.getAttribute('position') as THREE.BufferAttribute;
        const baseZ = wg.userData.baseZ as Float32Array | undefined;
        if (baseZ) {
          for (let i = 0; i < wPos.count; i++) {
            const x = wPos.getX(i);
            const y = wPos.getY(i);
            wPos.setZ(i, baseZ[i]
              + Math.sin(x * 0.9 + now * 0.0016) * 0.05
              + Math.sin(y * 1.4 - now * 0.0021) * 0.03);
          }
          wPos.needsUpdate = true;
        }
      }

      const mist = scene.getObjectByName('mist');
      if (mist) {
        const mm = (mist as THREE.Mesh).material as THREE.MeshBasicMaterial;
        mm.opacity = 0.08 + Math.sin(now * 0.0005) * 0.025;
      }

      // ---- Net sync ----
      if (mode !== 'ai' && now - lastNetSync > 80) {
        lastNetSync = now;
        multiplayer.sendShooterState({
          x: +p.pos.x.toFixed(2), y: +p.pos.y.toFixed(2), z: +p.pos.z.toFixed(2),
          yaw: +p.yaw.toFixed(2), isCrouching: p.crouched
        });
      }

      // ---- HUD sync ----
      if (now - lastHudSync > 84) {
        lastHudSync = now;
        const w = currentWeapon();
        const deg = Math.round(((-p.yaw * 180) / Math.PI) % 360);
        setHud({
          hp: Math.max(0, Math.round(p.hp)), armor: Math.round(p.armor),
          ammo: w ? w.ammoInClip : 0, reserve: w ? w.reserveAmmo : 0,
          icon: w ? w.def.icon : '', nameAr: w ? w.def.nameAr : '', wtype: w ? w.def.type : 'pistol', slot: p.slot,
          nades: { ...p.nades }, nadeSlot: p.nadeSlot, medkits: p.medkits,
          kills: p.kills, phase, zoneRadius: Math.round(safeZone.radius), zoneTimer: Math.max(0, Math.round(zone.timer)), matchTimer: Math.max(0, Math.round(totalMatch - elapsed)),
          compass: deg < 0 ? deg + 360 : deg, outside, reloading: p.reloading, aiming: aimRef.current,
          crouched: p.crouched, prone: p.prone, sprinting: p.sprinting,
          locomotion: p.climbing ? 'climb' : sliding ? 'slide' : p.prone ? 'prone' : p.crouched ? 'crouch' : p.sprinting ? 'sprint' : moving ? 'walk' : 'idle',
          viewMode,
          countdown: Math.max(1, countNum),
          reloadProgress: p.reloading && w ? THREE.MathUtils.clamp(1 - (p.reloadUntil - now) / w.def.reloadTimeMs, 0, 1) : 0
        });
      }

      // ---- Minimap ----
      const mm = minimapRef.current;
      if (mm) {
        const g = mm.getContext('2d');
        if (g) {
          const S = mm.width;
          const cx = S / 2, cy = S / 2;
          const scale = (S / 2 - 6) / (env.bounds + 20);
          g.clearRect(0, 0, S, S);
          g.fillStyle = 'rgba(8,11,17,0.72)';
          g.beginPath(); g.arc(cx, cy, S / 2, 0, Math.PI * 2); g.fill();
          g.strokeStyle = 'rgba(56,189,248,0.9)';
          g.lineWidth = 1.5;
          g.beginPath();
          g.arc(cx + safeZone.center.x * scale, cy + safeZone.center.y * scale, safeZone.radius * scale, 0, Math.PI * 2);
          g.stroke();
          for (const u of enemyUnits) {
            if (!u.state.alive) continue;
            const s = u.state;
            if (!s.isHuman) {
              const canSee = !lineBlocked(obstacles, p.pos.clone().add(new THREE.Vector3(0, 1.5, 0)), s.pos.clone().add(new THREE.Vector3(0, 1.4, 0)));
              if (!s.spotted || (!canSee && now - s.lastFire > 2000)) continue;
            }
            g.fillStyle = s.isHuman ? '#fb7185' : '#ef4444';
            g.beginPath();
            g.arc(cx + s.pos.x * scale, cy + s.pos.z * scale, 3, 0, Math.PI * 2);
            g.fill();
          }
          g.save();
          g.translate(cx + p.pos.x * scale, cy + p.pos.z * scale);
          g.rotate(-p.yaw);
          g.fillStyle = '#22d3ee';
          g.beginPath();
          g.moveTo(0, -6); g.lineTo(4, 5); g.lineTo(0, 2.5); g.lineTo(-4, 5);
          g.closePath(); g.fill();
          g.restore();
        }
      }

      renderer.render(scene, camera);
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);

    // ============================================================
    // Cleanup
    // ============================================================
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('contextmenu', onContext);
      document.removeEventListener('pointerlockchange', onLockChange);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', handleResize);
      multiplayer.cleanup();
      scene.traverse((o) => {
        const obj = o as THREE.Mesh;
        if (obj.geometry) obj.geometry.dispose();
        const m = obj.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else if (m) m.dispose();
      });
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId]);

  // ============================================================
  // Touch handlers
  // ============================================================
  const joystickRef = useRef<HTMLDivElement | null>(null);
  const joyBaseRef = useRef<HTMLDivElement | null>(null);

  const updateJoy = (t: React.Touch) => {
    const base = joyBaseRef.current, thumb = joystickRef.current;
    if (!base || !thumb) return;
    const r = base.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const max = r.width / 2 - 10;
    const len = Math.hypot(dx, dy);
    if (len > max) { dx = (dx / len) * max; dy = (dy / len) * max; }
    thumb.style.transform = `translate(${dx}px, ${dy}px)`;
    engineRef.current?.setMove(dx / max, dy / max);
  };
  const onJoyStart = (e: React.TouchEvent) => updateJoy(e.touches[0]);
  const onJoyMove = (e: React.TouchEvent) => updateJoy(e.touches[0]);
  const onJoyEnd = () => {
    if (joystickRef.current) joystickRef.current.style.transform = 'translate(0px,0px)';
    engineRef.current?.setMove(0, 0);
  };

  const onLookStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    lookTouchRef.current = { x: t.clientX, y: t.clientY };
  };
  const onLookMove = (e: React.TouchEvent) => {
    if (!lookTouchRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - lookTouchRef.current.x;
    const dy = t.clientY - lookTouchRef.current.y;
    lookTouchRef.current = { x: t.clientX, y: t.clientY };
    engineRef.current?.addLook(dx, dy);
  };
  const onLookEnd = () => { lookTouchRef.current = null; };

  const hpPct = Math.max(0, Math.min(100, hud.hp));
  const lowHp = hpPct <= 25;
  const hpSegs = Math.max(0, Math.min(20, Math.round((hpPct / 100) * 20)));
  const hpSegColor = hpPct > 55 ? 'bg-emerald-400' : hpPct > 25 ? 'bg-amber-400' : 'bg-red-500';
  const hpSegGlow = hpPct > 55 ? 'rgba(52,211,153,.55)' : hpPct > 25 ? 'rgba(251,191,36,.55)' : 'rgba(239,68,68,.6)';
  const activeDef = WEAPONS[hud.wtype];
  const isMobile = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);
  // Dynamic crosshair spread: tight while aiming/crouched, wide while sprinting.
  const crossSpread = hud.aiming ? 3 : hud.sprinting ? 13 : hud.crouched || hud.prone ? 6 : 9;
  const armorPct = Math.max(0, Math.min(100, hud.armor));
  const armorSegs = Math.max(0, Math.min(20, Math.round((armorPct / 100) * 20)));
  const signalBars = connStatus === 'connected' ? 3 : connStatus === 'connecting' ? 2 : 1;

  // ============================================================
  // Render
  // ============================================================
  return (
    <div className="fixed inset-0 z-50 w-screen h-[100dvh] bg-black overflow-hidden flex flex-col select-none touch-none" dir="rtl">
      <div ref={mountRef} className="absolute inset-0 cursor-crosshair" />

      {/* ===================== CROSSHAIR (both view modes, dynamic spread) ===================== */}
      {hud.phase !== 'over' && !(hud.aiming && activeDef.type === 'awm') && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
          <div className="relative w-1 h-1">
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-cyan-200 shadow-[0_0_5px_rgba(103,232,249,0.9)]" />
            <div className="absolute left-1/2 -translate-x-1/2 w-px bg-cyan-200/95" style={{ bottom: `calc(100% + ${crossSpread}px)`, height: 6 }} />
            <div className="absolute left-1/2 -translate-x-1/2 w-px bg-cyan-200/95" style={{ top: `calc(100% + ${crossSpread}px)`, height: 6 }} />
            <div className="absolute top-1/2 -translate-y-1/2 h-px bg-cyan-200/95" style={{ right: `calc(100% + ${crossSpread}px)`, width: 6 }} />
            <div className="absolute top-1/2 -translate-y-1/2 h-px bg-cyan-200/95" style={{ left: `calc(100% + ${crossSpread}px)`, width: 6 }} />
          </div>
        </div>
      )}

      {/* Sniper scope overlay */}
      {hud.phase !== 'over' && hud.viewMode === 'fpp' && hud.aiming && activeDef.type === 'awm' && (
        <div className="absolute inset-0 pointer-events-none z-20" style={{ background: 'radial-gradient(circle, transparent 22%, rgba(0,0,0,0.94) 23%)' }}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="relative w-40 h-40">
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-black/80" />
              <div className="absolute top-1/2 left-0 right-0 h-px bg-black/80" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 rounded-full bg-red-500" />
            </div>
          </div>
        </div>
      )}

      {/* ===================== HITMARKER ===================== */}
      <AnimatePresence>
        {hitmarker && (
          <motion.div key={hitmarker.key} initial={{ opacity: 1, scale: 1.2 }} animate={{ opacity: 0, scale: 0.8 }} exit={{ opacity: 0 }} transition={{ duration: 0.14 }}
            className="absolute inset-0 pointer-events-none flex items-center justify-center z-20">
            <svg viewBox="0 0 24 24" fill="none" stroke={hitmarker.kind === 'headshot' ? '#ef4444' : '#ffffff'} strokeWidth="3" className="w-7 h-7">
              <path d="M4 4l16 16M20 4L4 20" strokeLinecap="round" />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================== DAMAGE VIGNETTE ===================== */}
      <AnimatePresence>
        {dmgVignette > 0.02 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: dmgVignette }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
            className="absolute inset-0 pointer-events-none z-20" style={{ boxShadow: 'inset 0 0 120px 30px rgba(220,38,38,0.55)' }} />
        )}
      </AnimatePresence>

      {/* ===================== LOW-HP HEARTBEAT ===================== */}
      {hud.phase === 'combat' && lowHp && (
        <div className="absolute inset-0 pointer-events-none z-20 animate-pulse"
          style={{ boxShadow: `inset 0 0 ${100 + (25 - hpPct) * 4}px ${10 + (25 - hpPct)}px rgba(220,38,38,${0.25 + (25 - hpPct) * 0.012})`, animationDuration: '1.1s' }} />
      )}

      {/* Flashbang */}
      {screenFlash > 0.03 && (
        <div className="absolute inset-0 pointer-events-none z-30 bg-white" style={{ opacity: Math.min(1, screenFlash) }} />
      )}

      {/* Damage direction */}
      <AnimatePresence>
        {dmgDir && (
          <motion.div key={dmgDir.key} initial={{ opacity: 0.9 }} animate={{ opacity: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.9 }}
            className="absolute top-1/2 left-1/2 z-20 pointer-events-none" style={{ transform: `translate(-50%,-50%) rotate(${dmgDir.angle}rad)` }}>
            <div className="w-24 h-24 rounded-full border-t-4 border-r-4 border-transparent" style={{ borderTopColor: '#ef4444', transform: 'translateY(-46px)' }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Damage numbers */}
      {damageNumbers.map((n) => (
        <div key={n.id} className={`absolute z-30 pointer-events-none font-mono font-black text-sm drop-shadow-lg ${n.headshot ? 'text-amber-300' : 'text-red-400'}`}
          style={{ left: n.x, top: n.y, animation: 'floatUp 0.9s ease-out forwards' }}>
          {n.text}
        </div>
      ))}

      {/* ===================== TOP HUD — minimal, corner-docked ===================== */}
      {hud.phase !== 'over' && (
        <>
          {/* Minimap — small, subtle ring */}
          <div className="absolute top-3 left-3 z-20 pointer-events-none">
            <div className="relative w-[68px] h-[68px] rounded-full border border-white/10 bg-black/25 backdrop-blur-sm shadow-[0_2px_14px_rgba(0,0,0,.35)] overflow-hidden">
              <canvas ref={minimapRef} width={68} height={68} className="absolute inset-0" />
              <div className="absolute top-0.5 left-1/2 -translate-x-1/2 text-[6px] font-black text-white/60">N</div>
            </div>
          </div>

          {/* Timer + zone — tiny pill */}
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none">
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[10px] font-bold backdrop-blur-sm ${hud.matchTimer <= 60 ? 'border-amber-300/30 bg-amber-500/10 text-amber-300' : 'border-white/10 bg-black/25 text-white/90'}`}>
              <span className="tabular-nums">⏱ {Math.floor(hud.matchTimer / 60)}:{String(hud.matchTimer % 60).padStart(2, '0')}</span>
              <span className="w-px h-2.5 bg-white/20" />
              <span className={`tabular-nums ${hud.zoneTimer <= 10 ? 'text-red-400' : 'text-sky-300'}`}>◉ {hud.zoneTimer}s</span>
            </div>
            <div className="mt-0.5 text-[9px] font-bold text-white/50 drop-shadow-[0_1px_2px_rgba(0,0,0,.8)]">
              {hud.compass}° {hud.compass >= 315 || hud.compass < 45 ? 'شمال' : hud.compass < 135 ? 'شرق' : hud.compass < 225 ? 'جنوب' : 'غرب'}
            </div>
          </div>

          {/* Connection + kills + exit — tiny icons */}
          <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full border border-white/10 bg-black/25 backdrop-blur-sm">
              <div className="flex items-end gap-[2px] h-2.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`w-[3px] rounded-[1px] transition-colors ${i < signalBars ? 'bg-emerald-400' : 'bg-white/25'}`} style={{ height: `${3 + i * 2.5}px` }} />
                ))}
              </div>
              <span className="text-[9px] font-bold text-white/80 max-w-20 truncate">{opponentName}</span>
            </div>
            <div className="flex items-center gap-1 px-2 py-1 rounded-full border border-red-400/25 bg-black/25 backdrop-blur-sm">
              <span className="text-[10px] leading-none">💀</span>
              <span className="text-[11px] font-black font-mono text-red-400 tabular-nums">{hud.kills}</span>
            </div>
            <button onClick={() => { sound.playClick(); onExit(); }}
              className="w-8 h-8 flex items-center justify-center rounded-full border border-white/10 bg-black/25 text-slate-300 backdrop-blur-sm active:scale-90 transition-transform">
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Kill feed — transparent, no boxes */}
          <div className="absolute top-14 right-3 z-20 flex flex-col gap-1 items-end pointer-events-none">
            <AnimatePresence>
              {killFeed.map((f) => (
                <motion.div key={f.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 24 }}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/10 bg-black/25 backdrop-blur-sm text-[9px] font-bold text-white/90">
                  <span className="text-[10px]">{f.icon}</span><span>{f.text}</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* ===================== PHASE OVERLAYS ===================== */}
      {hud.phase === 'countdown' && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none">
          <div className="absolute inset-0 bg-black/30" />
          <AnimatePresence mode="popLayout">
            <motion.div key={hud.countdown} initial={{ scale: 1.6, opacity: 0, filter: 'blur(8px)' }} animate={{ scale: 1, opacity: 1, filter: 'blur(0px)' }} exit={{ scale: 0.8, opacity: 0 }} transition={{ duration: 0.35, ease: 'easeOut' }}>
              <div className="text-[120px] leading-none font-black text-transparent bg-clip-text bg-gradient-to-b from-white via-cyan-200 to-cyan-500 drop-shadow-[0_0_60px_rgba(34,211,238,.45)] tabular-nums">{hud.countdown}</div>
            </motion.div>
          </AnimatePresence>
          <div className="mt-2 text-xs font-black tracking-[0.6em] text-white/60">استعد للمعركة</div>
        </div>
      )}
      {hud.phase === 'grace' && (
        <div className="absolute top-16 inset-x-0 z-40 flex justify-center pointer-events-none">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-cyan-300/25 bg-cyan-400/10 text-cyan-100 text-[10px] font-bold backdrop-blur-sm">
            <Shield className="w-3 h-3" /> فترة حماية — لا يمكن إصابتك
          </div>
        </div>
      )}

      {/* Center notification (ELIMINATED / HEADSHOT) */}
      <AnimatePresence>
        {centerMsg && (
          <motion.div key={centerMsg.key} initial={{ opacity: 0, scale: 0.6, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 1.2 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            className="absolute inset-0 z-40 flex flex-col items-center justify-center pointer-events-none">
            <div className="absolute inset-0 bg-black/25" />
            <motion.div
              initial={{ letterSpacing: '0.35em', opacity: 0 }} animate={{ letterSpacing: '0.12em', opacity: 1 }} exit={{ opacity: 0, letterSpacing: '0.3em' }}
              transition={{ duration: 0.35 }}
              className="relative text-4xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 drop-shadow-[0_0_28px_rgba(251,191,36,.55)]">
              {centerMsg.sub}
            </motion.div>
            <div className="relative mt-2 text-sm font-bold text-white/85 drop-shadow-[0_2px_8px_rgba(0,0,0,.8)]">{centerMsg.text}</div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===================== BOTTOM HUD — slim, corner-docked, non-blocking ===================== */}
      {hud.phase !== 'over' && (
        <>
          {/* Health + Armor — bottom-left, slim segmented bars */}
          <div className="absolute bottom-3 left-3 z-20 flex flex-col gap-1.5 pointer-events-none">
            <div className="flex items-center gap-1.5">
              <Heart className={`w-3.5 h-3.5 drop-shadow ${lowHp ? 'text-red-400' : 'text-emerald-400'}`} fill="currentColor" strokeWidth={0} />
              <div className="flex items-center gap-[2px]">
                {Array.from({ length: 20 }).map((_, i) => (
                  <span key={i} className={`h-3 w-[3px] rounded-[1px] transition-colors duration-200 ${i < hpSegs ? hpSegColor : 'bg-white/15'}`} style={i < hpSegs ? { boxShadow: `0 0 6px ${hpSegGlow}` } : undefined} />
                ))}
              </div>
              <span className={`w-7 text-left font-mono font-black text-sm tabular-nums drop-shadow-[0_1px_3px_rgba(0,0,0,.9)] ${lowHp ? 'text-red-400 animate-pulse' : 'text-white'}`}>{hud.hp}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-sky-300 drop-shadow" fill="currentColor" strokeWidth={0} />
              <div className="flex items-center gap-[2px]">
                {Array.from({ length: 20 }).map((_, i) => (
                  <span key={i} className={`h-2.5 w-[3px] rounded-[1px] transition-colors duration-200 ${i < armorSegs ? 'bg-sky-400' : 'bg-white/15'}`} style={i < armorSegs ? { boxShadow: '0 0 6px rgba(56,189,248,.5)' } : undefined} />
                ))}
              </div>
              <span className="w-7 text-left font-mono font-black text-sm tabular-nums text-sky-300 drop-shadow-[0_1px_3px_rgba(0,0,0,.9)]">{hud.armor}</span>
            </div>
            <button onClick={() => engineRef.current?.useMedkit()}
              className={`self-start flex items-center gap-1 px-2 py-1 rounded-full border backdrop-blur-sm text-[10px] font-black transition-all active:scale-90 pointer-events-auto ${hud.medkits > 0 && hud.hp < 100 ? 'border-emerald-300/30 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/[0.04] text-white/30'}`}>
              🩹 ×{hud.medkits}
            </button>
          </div>

          {/* Weapon + ammo + grenades + slots — bottom-right (raised above fire on mobile) */}
          <div className={`absolute ${isMobile ? 'bottom-24 right-4' : 'bottom-3 right-3'} z-20 flex flex-col items-end gap-1.5 pointer-events-none`}>
            <div className="flex items-center gap-2 pointer-events-auto">
              <div className="flex flex-col items-end leading-none">
                <span className="text-[9px] font-black text-white/60 tracking-wide">{hud.nameAr}</span>
                <span className={`mt-0.5 font-mono font-black text-[26px] leading-none tabular-nums drop-shadow-[0_2px_6px_rgba(0,0,0,.7)] ${hud.ammo === 0 ? 'text-red-400 animate-pulse' : hud.ammo <= Math.ceil(activeDef.magazineSize * 0.25) ? 'text-amber-300' : 'text-white'}`}>
                  {hud.ammo}<span className="text-sm font-bold text-white/45"> / {hud.reserve}</span>
                </span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/[0.05] border border-white/10 backdrop-blur-sm flex items-center justify-center text-lg shadow-[0_2px_10px_rgba(0,0,0,.3)]">{hud.icon}</div>
            </div>
            {hud.reloading && (
              <div className="w-28 h-1 rounded-full bg-black/40 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-amber-400 to-yellow-300" style={{ width: `${hud.reloadProgress * 100}%` }} />
              </div>
            )}
            <div className="flex items-center gap-1 pointer-events-auto">
              {(['frag', 'smoke', 'flash'] as GrenadeType[]).map((g) => (
                <button key={g} onClick={() => engineRef.current?.selectNade(g)}
                  className={`w-9 h-9 rounded-lg border backdrop-blur-sm flex flex-col items-center justify-center transition-all active:scale-90 ${hud.nadeSlot === g ? 'border-amber-300/50 bg-amber-300/10' : 'border-white/10 bg-white/[0.04] opacity-60'}`}>
                  <span className="text-[13px] leading-none">{GRENADE_ICON[g]}</span>
                  <span className={`text-[8px] font-black leading-none mt-0.5 ${hud.nades[g] > 0 ? 'text-white/75' : 'text-white/25'}`}>{hud.nades[g]}</span>
                </button>
              ))}
              <button onClick={() => engineRef.current?.cookGrenade(false)}
                onTouchStart={() => engineRef.current?.cookGrenade(true)}
                onTouchEnd={() => engineRef.current?.cookGrenade(false)}
                className={`w-9 h-9 rounded-lg border backdrop-blur-sm flex items-center justify-center transition-all active:scale-90 ${cookPreview ? 'border-red-400/60 bg-red-500/10' : 'border-white/10 bg-white/[0.04] opacity-60'}`}>
                <span className="text-[13px] leading-none">{cookPreview ? '💥' : '🎯'}</span>
              </button>
              <div className="w-px h-5 bg-white/10 mx-0.5" />
              {(['primary', 'secondary', 'sidearm'] as WeaponSlotId[]).map((slot, i) => {
                const w = pRef.current.weapons[slot];
                const active = hud.slot === slot;
                return (
                  <button key={slot} onClick={() => engineRef.current?.switchSlot(slot)}
                    className={`relative w-9 h-9 rounded-lg border backdrop-blur-sm flex items-center justify-center transition-all active:scale-90 ${active ? 'border-cyan-300/50 bg-cyan-300/10 shadow-[0_0_10px_rgba(34,211,238,.25)]' : 'border-white/10 bg-white/[0.04] opacity-60'}`}>
                    <span className="text-[13px] leading-none">{w ? w.def.icon : '➕'}</span>
                    <span className={`absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full text-[6px] font-black flex items-center justify-center ${active ? 'bg-cyan-400 text-black' : 'bg-white/10 text-white/40'}`}>{i + 1}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {isMobile ? (
            <>
              {/* Joystick — elegant glass */}
              <div ref={joyBaseRef} className="absolute bottom-24 left-5 w-24 h-24 rounded-full border border-white/15 bg-white/[0.05] backdrop-blur-sm z-30 pointer-events-auto shadow-[0_8px_24px_rgba(0,0,0,.35)]"
                onTouchStart={onJoyStart} onTouchMove={onJoyMove} onTouchEnd={onJoyEnd}>
                <div ref={joystickRef} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-cyan-300/25 border border-cyan-200/40 shadow-[0_0_18px_rgba(34,211,238,.3)]" />
              </div>

              {/* Look zone */}
              <div className="absolute right-0 top-20 bottom-40 w-1/2 z-10 touch-none"
                onTouchStart={onLookStart} onTouchMove={onLookMove} onTouchEnd={onLookEnd} />

              {/* Action cluster — above the fire button */}
              <div className="absolute bottom-52 right-4 z-30 flex flex-col items-end gap-1.5 pointer-events-auto">
                <div className="flex items-center gap-1.5">
                  <button onTouchStart={() => engineRef.current?.jump()} className="w-10 h-10 rounded-full border border-white/15 bg-white/[0.06] backdrop-blur-sm text-white/90 text-[10px] font-bold active:scale-90 transition-transform">قفز</button>
                  <button onTouchStart={() => engineRef.current?.toggleCrouch()} className={`w-10 h-10 rounded-full border text-[10px] font-bold backdrop-blur-sm active:scale-90 transition-transform ${hud.crouched ? 'border-cyan-300/60 bg-cyan-400/20 text-cyan-200' : 'border-white/15 bg-white/[0.06] text-white/90'}`}>انحناء</button>
                  <button onTouchStart={() => engineRef.current?.toggleProne()} className={`w-10 h-10 rounded-full border text-[10px] font-bold backdrop-blur-sm active:scale-90 transition-transform ${hud.prone ? 'border-amber-300/60 bg-amber-400/20 text-amber-200' : 'border-white/15 bg-white/[0.06] text-white/90'}`}>زحف</button>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onTouchStart={() => engineRef.current?.setAim(!aimRef.current)} className={`w-10 h-10 rounded-full border text-[10px] font-bold backdrop-blur-sm active:scale-90 transition-transform ${hud.aiming ? 'border-purple-300/60 bg-purple-400/20 text-purple-200' : 'border-white/15 bg-white/[0.06] text-white/90'}`}>تصويب</button>
                  <button onTouchStart={() => engineRef.current?.reload()} className={`w-10 h-10 rounded-full border backdrop-blur-sm active:scale-90 transition-transform flex items-center justify-center ${hud.reloading ? 'border-amber-300/60 bg-amber-400/20' : 'border-white/15 bg-white/[0.06]'}`}>
                    <RefreshCw className={`w-4 h-4 text-white/90 ${hud.reloading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Fire button — premium ring */}
              <button
                onTouchStart={() => { if (autoFire) { fireHeldRef.current ? engineRef.current?.stopFire() : engineRef.current?.startFire(); } else engineRef.current?.startFire(); }}
                onTouchEnd={() => { if (!autoFire) engineRef.current?.stopFire(); }}
                className="absolute bottom-5 right-4 z-30 w-16 h-16 rounded-full flex items-center justify-center active:scale-90 transition-transform pointer-events-auto">
                <span className="absolute inset-0 rounded-full border-2 border-red-300/30 bg-red-500/10 backdrop-blur-sm shadow-[0_0_28px_rgba(239,68,68,.35)]" />
                <span className="absolute inset-1.5 rounded-full border border-white/10 bg-gradient-to-br from-red-500/40 to-amber-500/15" />
                <span className="relative text-xl drop-shadow">🔥</span>
              </button>

              {/* Camera height + view + autofire — tiny controls under the minimap */}
              <div className="absolute top-20 left-3 z-30 flex flex-col gap-1 pointer-events-auto">
                <button onTouchStart={() => engineRef.current?.nudgeCamHeight(1)} aria-label="رفع الكاميرا" className="w-8 h-8 rounded-full border border-white/10 bg-black/25 backdrop-blur-sm text-white/70 text-[11px] font-bold active:scale-90 flex items-center justify-center">▲</button>
                <button onTouchStart={() => engineRef.current?.nudgeCamHeight(-1)} aria-label="خفض الكاميرا" className="w-8 h-8 rounded-full border border-white/10 bg-black/25 backdrop-blur-sm text-white/70 text-[11px] font-bold active:scale-90 flex items-center justify-center">▼</button>
                <button onTouchStart={() => engineRef.current?.resetCamHeight()} aria-label="إعادة ضبط الكاميرا" className="w-8 h-8 rounded-full border border-white/10 bg-black/25 backdrop-blur-sm text-white/70 text-[9px] font-bold active:scale-90 flex items-center justify-center">⟲</button>
              </div>
              <div className="absolute top-20 right-3 z-30 flex flex-col gap-1 items-end pointer-events-auto">
                <button onClick={() => engineRef.current?.toggleView()} className="px-2 py-1 rounded-full border border-white/10 bg-black/25 backdrop-blur-sm text-[9px] font-black text-white/70 active:scale-90">{hud.viewMode.toUpperCase()}</button>
                <button onClick={() => setAutoFire(!autoFire)} className={`px-2 py-1 rounded-full border text-[9px] font-black backdrop-blur-sm active:scale-90 ${autoFire ? 'border-emerald-300/40 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-black/25 text-white/50'}`}>{autoFire ? 'تلقائي ✓' : 'تلقائي'}</button>
              </div>
            </>
          ) : (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 pointer-events-none text-[9px] font-bold text-white/30 tracking-wide">
              WASD حركة · فأرة تصويب · نقر إطلاق · R تلقيم · V منظور · C/Z انحناء/زحف · G قنبلة · مسافة قفز
            </div>
          )}
        </>
      )}


      {/* Interact prompt — clear, glassy, and colour-matched to the item */}
      <AnimatePresence>
        {nearbyLoot && hud.phase === 'combat' && (
          <motion.button initial={{ opacity: 0, y: 24, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 24, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            onClick={() => engineRef.current?.interact()}
            className="absolute bottom-44 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-[#080b11]/90 backdrop-blur-xl rounded-2xl pl-3 pr-4 py-2.5 pointer-events-auto"
            style={{ border: `1px solid rgba(255,255,255,0.14)`, boxShadow: `0 0 26px ${nearbyLoot.colorHex ? '#' + nearbyLoot.colorHex.toString(16).padStart(6, '0') + '55' : 'rgba(255,215,0,0.18)'}` }}>
            <span className="flex items-center justify-center w-11 h-11 rounded-xl text-2xl" style={{ background: `rgba(255,255,255,0.06)` }}>{nearbyLoot.icon}</span>
            <span className="text-right">
              <span className="block text-[9px] font-bold tracking-widest text-cyan-300">{isMobile ? 'اضغط للالتقاط' : 'التقاط [F]'}</span>
              <span className="block text-sm font-black text-white">{nearbyLoot.nameAr}</span>
            </span>
            <span className="mr-1 w-6 h-6 rounded-full border-2 border-cyan-300/60 animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ===================== GAME OVER ===================== */}
      {gameOver && stats && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-5">
          <motion.div initial={{ scale: 0.85, y: 24 }} animate={{ scale: 1, y: 0 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="bg-gradient-to-b from-slate-900 to-slate-950 rounded-3xl p-6 border border-slate-800 max-w-sm w-full text-center shadow-2xl">
            <div className="text-6xl mb-2">{gameOver === 'victory' ? '🏆' : '💀'}</div>
            <h2 className={`text-2xl font-black ${gameOver === 'victory' ? 'text-amber-300' : 'text-red-400'}`}>
              {gameOver === 'victory' ? 'النصر!' : 'هُزمت'}
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              {gameOver === 'victory' ? 'سيطرت على ساحة المعركة وحققت فوزاً أسطورياً.' : 'لا بأس أيها المحارب، عد للانتقام!'}
            </p>

            <div className="grid grid-cols-2 gap-2 my-4 text-right">
              <div className="bg-slate-900/80 rounded-xl p-2.5 border border-slate-800">
                <div className="text-[9px] text-slate-500">القضاء</div>
                <div className="text-lg font-black text-white">{stats.kills}</div>
              </div>
              <div className="bg-slate-900/80 rounded-xl p-2.5 border border-slate-800">
                <div className="text-[9px] text-slate-500">الضرر</div>
                <div className="text-lg font-black text-white">{stats.damage}</div>
              </div>
              <div className="bg-slate-900/80 rounded-xl p-2.5 border border-slate-800">
                <div className="text-[9px] text-slate-500">الدقة</div>
                <div className="text-lg font-black text-cyan-300">{stats.accuracy}%</div>
              </div>
              <div className="bg-slate-900/80 rounded-xl p-2.5 border border-slate-800">
                <div className="text-[9px] text-slate-500">الوقت</div>
                <div className="text-lg font-black text-white font-mono">{stats.time}</div>
              </div>
            </div>

            <div className="bg-slate-900/80 rounded-2xl p-3 border border-slate-800 mb-4 grid grid-cols-4 gap-1 text-center">
              <div>
                <div className="text-[9px] text-slate-500">خبرة</div>
                <div className="text-sm font-black text-violet-300">+{stats.xp}</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-500">كؤوس</div>
                <div className={`text-sm font-black ${stats.trophies > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{stats.trophies > 0 ? '+' : ''}{stats.trophies}</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-500">غبار</div>
                <div className="text-sm font-black text-cyan-300">+{stats.dust}</div>
              </div>
              <div>
                <div className="text-[9px] text-slate-500">نجوم</div>
                <div className="text-sm font-black text-amber-400">{stats.stars > 0 ? `+${stats.stars}` : '—'}</div>
              </div>
            </div>

            <button onClick={() => { sound.playClick(); onExit(); }}
              className="w-full py-3 bg-gradient-to-l from-blue-600 to-cyan-600 text-white font-black text-sm rounded-xl shadow-lg active:scale-95">
              العودة إلى الردهة
            </button>
          </motion.div>
        </motion.div>
      )}

      <style>{`
        @keyframes floatUp {
          from { opacity: 1; transform: translate(-50%, -50%); }
          to { opacity: 0; transform: translate(-50%, -150%); }
        }
      `}</style>
    </div>
  );
};
