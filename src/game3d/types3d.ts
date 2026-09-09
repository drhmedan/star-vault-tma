import * as THREE from 'three';

export interface Player3DState {
  id: number;
  name: string;
  pos: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;   // Horizontal rotation (radians)
  pitch: number; // Vertical look angle (radians)
  isCrouching: boolean;
  isAiming: boolean; // ADS Scope Zoom
  isGrounded: boolean;
  hp: number;
  maxHp: number;
  armor: number;
  maxArmor: number;
  ammoInClip: number;
  reserveAmmo: number;
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
