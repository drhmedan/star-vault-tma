import * as THREE from 'three';

// ============================================================
// Shared 3D game contracts — strict, no `any` anywhere.
// ============================================================

export type CameraViewMode = 'tpp' | 'fpp';
export type MapId = 'warehouse' | 'desert' | 'warzone';
export type MapTheme = 'dawn' | 'noon' | 'dusk' | 'night';
export type WeaponSlotId = 'primary' | 'secondary' | 'sidearm';
export type WeaponType = 'ak47' | 'awm' | 'shotgun' | 'mp5' | 'pistol' | 'rpg';
export type GrenadeType = 'frag' | 'smoke' | 'flash';
export type LocomotionState =
  | 'idle' | 'walk' | 'sprint' | 'crouch' | 'prone' | 'vault' | 'climb' | 'slide';
export type SurfaceType = 'grass' | 'concrete' | 'metal' | 'dirt' | 'road';

export interface WeaponDef {
  type: WeaponType;
  name: string;
  nameAr: string;
  icon: string;
  slot: WeaponSlotId;
  damageMin: number;
  damageMax: number;
  headshotMultiplier: number;
  fireRateMs: number;
  auto: boolean;
  magazineSize: number;
  reloadTimeMs: number;
  // Spread in radians (hip / ADS)
  spreadHip: number;
  spreadAds: number;
  // Recoil impulse per shot (radians)
  recoilPitch: number;
  recoilYaw: number;
  pellets: number;
  range: number;
  bulletSpeed: number;
  adsFov: number;
  tracerColor: number;
  reserveStart: number;
  projectile: 'hitscan' | 'rocket';
  soundId: WeaponType;
  movespeedMul: number;
}

export interface WeaponState {
  def: WeaponDef;
  ammoInClip: number;
  reserveAmmo: number;
}

export interface LootItem3D {
  id: string;
  type: 'weapon' | 'ammo' | 'medkit' | 'armor' | 'grenade';
  weaponType?: WeaponType;
  grenadeType?: GrenadeType;
  nameAr: string;
  icon: string;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  isCollected: boolean;
  pulseLight?: THREE.PointLight;
}

export interface CoverObstacle3D {
  mesh: THREE.Object3D;
  box: THREE.Box3;
  type: 'car' | 'building' | 'crate' | 'rock' | 'tree' | 'wall' | 'bush';
  // Low obstacles (<=1.5m) can be vaulted over.
  isVaultable?: boolean;
  // Solid buildings block bullets & movement; bushes only hide.
  blocksBullets?: boolean;
  blocksMovement?: boolean;
  // Explodes with AoE damage when shot (fuel tanks).
  explosive?: boolean;
}

export interface Ladder3D {
  x: number;
  z: number;
  topY: number;
  baseY: number;
}

export interface SafeZone3D {
  center: THREE.Vector2;
  radius: number;
  targetRadius: number;
  targetCenter: THREE.Vector2;
  shrinkSpeed: number;
  mesh: THREE.Mesh;
}

export interface MapMetadata {
  id: MapId;
  nameAr: string;
  subtitleAr: string;
  previewColor: string;
  skyColor: string;
  fogColor: string;
  fogDensity: number;
  descriptionAr: string;
  icon: string;
  theme: MapTheme;
  sunColor: string;
  ambientColor: string;
  hemisphereSky: string;
  hemisphereGround: string;
  sunElevation: number;
  sunAzimuth: number;
  groundBase: string;
  groundRock: string;
  groundSand: string;
  groundGrass: string;
}

export interface MapEnvironment {
  obstacles: CoverObstacle3D[];
  safeZone: SafeZone3D;
  lootItems: LootItem3D[];
  getHeightAt: (x: number, z: number) => number;
  spawnA: THREE.Vector3;
  spawnB: THREE.Vector3;
  bounds: number;
  sunDirection: THREE.Vector3;
  mapId: MapId;
  // A flat list of every collidable box for AI pathing & player collision.
  colliders: CoverObstacle3D[];
  // Climbable ladders (watchtowers, minaret).
  ladders: Ladder3D[];
  // Shootable explosive props.
  explosives: CoverObstacle3D[];
}

// ============================================================
// Soldier rig (procedural tactical operator)
// ============================================================
export interface SoldierRig {
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  recoil: THREE.Group;
}

export interface SoldierMesh {
  root: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  gun: THREE.Group;
  muzzle: THREE.Object3D;
  muzzleLight: THREE.PointLight;
  rig: SoldierRig;
  // Hit zones used by the raycasters.
  hitHead: THREE.Mesh;
  hitBody: THREE.Mesh;
  hitLimbs: THREE.Mesh[];
  accentColor: number;
  setSkin: (isEnemy: boolean) => void;
  flashHit: (zone: 'head' | 'body' | 'limb') => void;
  setMuzzleFlash: (on: boolean) => void;
}

// ============================================================
// Projectiles
// ============================================================
export type ProjectileKind = 'bullet' | 'rocket' | 'frag' | 'smoke' | 'flash';

export interface Projectile3D {
  kind: ProjectileKind;
  mesh: THREE.Group;
  velocity: THREE.Vector3;
  gravity: number;
  damage: number;
  ownerId: number;
  spawnTime: number;
  fuseMs: number;
  lastBouncePos: THREE.Vector3;
}

export interface Tracer3D {
  line: THREE.Line;
  spawnTime: number;
  lifeMs: number;
}

export interface Particle3D {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  fade: boolean;
}

export interface MatchStats {
  kills: number;
  damageDealt: number;
  shotsFired: number;
  shotsHit: number;
  headshots: number;
  matchDurationSec: number;
  survivedSec: number;
  accuracy: number;
  xpGained: number;
  trophiesDelta: number;
  dustDelta: number;
  starsDelta: number;
}
