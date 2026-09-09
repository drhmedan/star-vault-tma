export type WeaponType = 'ak47' | 'awm' | 'shotgun' | 'mp5' | 'pistol';

export interface WeaponDef {
  type: WeaponType;
  name: string;
  nameAr: string;
  damage: number;
  fireRateMs: number;
  magazineSize: number;
  reloadTimeMs: number;
  bulletSpeed: number;
  spread: number; // in radians
  pellets: number; // for shotgun
  range: number;
  color: string;
  bulletColor: string;
  icon: string;
}

export interface Bullet {
  id: string;
  ownerId: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  rangeRemaining: number;
  color: string;
  weaponType: WeaponType;
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  type: 'wall' | 'building' | 'crate' | 'rock' | 'bush';
  color: string;
  blocksBullets: boolean;
  blocksVision: boolean;
}

export interface LootItem {
  id: string;
  x: number;
  y: number;
  type: 'weapon' | 'ammo' | 'medkit' | 'armor' | 'airdrop';
  weaponType?: WeaponType;
  amount?: number;
  nameAr: string;
  icon: string;
  color: string;
}

export interface PlayerCharacter {
  id: number;
  name: string;
  x: number;
  y: number;
  radius: number;
  angle: number; // radians (0 to 2*PI)
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  speed: number;
  activeWeapon: WeaponType;
  ammoInClip: number;
  reserveAmmo: number;
  isReloading: boolean;
  reloadProgress: number; // 0 to 1
  lastFireTime: number;
  isInsideBush: boolean;
  color: string;
  kills: number;
}

export interface SafeZone {
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  shrinkSpeed: number;
  isShrinking: boolean;
  damagePerSec: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}
