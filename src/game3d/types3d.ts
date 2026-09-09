import * as THREE from 'three';

export type CameraViewMode = 'tpp' | 'fpp';
export type MapId = 'warehouse' | 'desert' | 'warzone';
export type WeaponSlotId = 'primary' | 'secondary' | 'sidearm';
export type LocomotionState = 'idle' | 'sprint' | 'crouch' | 'slide' | 'prone' | 'crawl' | 'vault' | 'climb';
export type VehicleType = 'tank' | 'buggy';
export type ProjectileType = 'bullet' | 'rocket' | 'shell' | 'flame';

export interface WeaponSlotState {
  id: WeaponSlotId;
  name: string;
  nameAr: string;
  weaponType: 'ak47' | 'awm' | 'shotgun' | 'mp5' | 'pistol';
  damage: number;
  fireRateMs: number;
  magazineSize: number;
  reloadTimeMs: number;
  ammoInClip: number;
  reserveAmmo: number;
  icon: string;
}

export interface LootItem3D {
  id: string;
  type: 'weapon' | 'ammo' | 'medkit';
  weaponType?: 'ak47' | 'awm' | 'shotgun';
  nameAr: string;
  icon: string;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  isCollected: boolean;
}

export interface Player3DState {
  id: number;
  name: string;
  pos: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;   // Horizontal rotation (radians)
  pitch: number; // Vertical look angle (radians)
  isCrouching: boolean;
  isAiming: boolean; // ADS Scope Zoom
  viewMode: CameraViewMode;
  isGrounded: boolean;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  activeSlot: WeaponSlotId;
  weapons: Record<WeaponSlotId, WeaponSlotState | null>;
  isReloading: boolean;
  kills: number;
}

export interface Bullet3D {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  damage: number;
  ownerId: number;
  distanceTraveled: number;
  maxDistance: number;
  type?: ProjectileType;
  splashRadius?: number;
  gravity?: number;
}

export interface CombatVehicle3D {
  id: string;
  type: VehicleType;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  armor: number;
  maxArmor: number;
  turret?: THREE.Group;
  cannon?: THREE.Mesh;
  isOccupied: boolean;
}

export interface DestructibleCover3D extends CoverObstacle3D {
  health: number;
  maxHealth: number;
  explosive: boolean;
}

export interface CoverObstacle3D {
  mesh: THREE.Object3D;
  box: THREE.Box3;
  type: 'car' | 'building' | 'crate' | 'rock' | 'tree';
}

export interface SafeZone3D {
  center: THREE.Vector2;
  radius: number;
  targetRadius: number;
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
  descriptionAr: string;
  icon: string;
}
