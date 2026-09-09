import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft, Crosshair, Shield, RefreshCw, Radio, 
  Share2, Trophy, Skull, Eye, ChevronUp, Zap, Box, Compass
} from 'lucide-react';
import { UserProfile } from '../types';
import { buildMapEnvironment, MAP_CATALOG } from '../game3d/mapRegistry';
import { createSoldierMesh } from '../game3d/worldBuilder';
import { 
  CoverObstacle3D, SafeZone3D, CameraViewMode, 
  MapId, WeaponSlotId, WeaponSlotState, LootItem3D, LocomotionState
} from '../game3d/types3d';
import { multiplayer, ConnectionStatus } from '../services/multiplayer';
import { sound } from '../audio/soundEngine';
import { tgHaptics } from '../services/telegramHaptics';

interface Pubg3DArenaProps {
  user: UserProfile;
  roomCode: string;
  mode: 'host' | 'join' | 'ai';
  stakeStars: number;
  mapId?: MapId;
  onExit: () => void;
  onMatchComplete: (won: boolean, trophiesDelta: number, dustDelta: number, starsDelta: number) => void;
}

export const Pubg3DArena: React.FC<Pubg3DArenaProps> = ({
  user,
  roomCode,
  mode,
  stakeStars,
  mapId = 'warzone',
  onExit,
  onMatchComplete
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('connecting');
  const [opponentName, setOpponentName] = useState<string>(mode === 'ai' ? 'بوت تكتيكي (3D AI)' : 'في انتظار الخصم...');
  const [gameOver, setGameOver] = useState<'victory' | 'defeat' | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // View Mode: TPP vs FPP
  const [viewMode, setViewMode] = useState<CameraViewMode>('tpp');
  const viewModeRef = useRef<CameraViewMode>('tpp');

  // HUD & Combat States
  const [hp, setHp] = useState<number>(100);
  const [armor, setArmor] = useState<number>(50);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [isCrouching, setIsCrouching] = useState<boolean>(false);
  const [isAiming, setIsAiming] = useState<boolean>(false);
  const [kills, setKills] = useState<number>(0);
  const [zoneTimer, setZoneTimer] = useState<number>(45);
  const [outsideZone, setOutsideZone] = useState<boolean>(false);
  const [compassHeading, setCompassHeading] = useState<number>(0);
  const [medkits, setMedkits] = useState<number>(2);
  const [locomotion, setLocomotion] = useState<LocomotionState>('idle');
  const [vehiclePrompt, setVehiclePrompt] = useState<'tank' | 'buggy' | null>(null);
  const locomotionRef = useRef<LocomotionState>('idle');
  const sprintRef = useRef(false);
  const proneRef = useRef(false);
  const lastJumpRef = useRef(0);

  // 3-Slot Weapon Inventory System
  const [activeSlot, setActiveSlot] = useState<WeaponSlotId>('primary');
  const [weapons, setWeapons] = useState<Record<WeaponSlotId, WeaponSlotState | null>>({
    primary: {
      id: 'primary',
      name: 'AK-47',
      nameAr: 'كلاشينكوف (AK-47)',
      weaponType: 'ak47',
      damage: 34,
      fireRateMs: 115,
      magazineSize: 30,
      reloadTimeMs: 2000,
      ammoInClip: 30,
      reserveAmmo: 90,
      icon: '⚡'
    },
    secondary: null, // Empty until looted!
    sidearm: {
      id: 'sidearm',
      name: 'P92 Pistol',
      nameAr: 'مسدس جانبي (P92)',
      weaponType: 'pistol',
      damage: 26,
      fireRateMs: 220,
      magazineSize: 15,
      reloadTimeMs: 1400,
      ammoInClip: 15,
      reserveAmmo: 45,
      icon: '🔹'
    }
  });

  // Nearby Ground Loot Pickup Prompt
  const [nearbyLoot, setNearbyLoot] = useState<LootItem3D | null>(null);
  const [damageFeed, setDamageFeed] = useState<string | null>(null);
  const [isVehicleMounted, setIsVehicleMounted] = useState<boolean>(false);
  const [nearbyVehicle, setNearbyVehicle] = useState<boolean>(false);

  // Game Coordinates & Physics Refs (Distant Tactical Spawns: South Base vs North Outpost)
  const playerPosRef = useRef<THREE.Vector3>(new THREE.Vector3(-25, 0, 50));
  const playerVelRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const playerAnglesRef = useRef<{ yaw: number; pitch: number }>({ yaw: 0, pitch: 0 });
  const isCrouchedRef = useRef<boolean>(false);
  const isAimingRef = useRef<boolean>(false);
  const isFiringRef = useRef<boolean>(false);
  const lastFireTimeRef = useRef<number>(0);
  const isVehicleMountedRef = useRef<boolean>(false);
  const isNearVehicleRef = useRef<boolean>(false);
  const cameraShakeRef = useRef<number>(0);
  const activeRocketsRef = useRef<Array<{
    mesh: THREE.Group;
    light: THREE.PointLight;
    velocity: THREE.Vector3;
    spawnTime: number;
  }>>([]);

  const opponentPosRef = useRef<THREE.Vector3>(new THREE.Vector3(25, 0, -50));
  const opponentHpRef = useRef<number>(100);
  const opponentMeshRef = useRef<ReturnType<typeof createSoldierMesh> | null>(null);

  // Active Map & Loot Refs
  const lootItemsRef = useRef<LootItem3D[]>([]);
  const keys = useRef<{ [k: string]: boolean }>({});

  // Touch Drag State for Mobile Camera
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  // 1. Networking Sync Setup
  useEffect(() => {
    multiplayer.init(
      user.id,
      (msg) => {
        if (msg.type === 'JOIN_ROOM') {
          setOpponentName(msg.payload.playerName || 'لاعب متصل');
          setConnStatus('connected');
        } else if (msg.type === 'SYNC_SHOOTER_STATE') {
          const s = msg.payload;
          if (s) {
            opponentPosRef.current.set(s.x, s.y, s.z);
            if (opponentMeshRef.current) {
              opponentMeshRef.current.root.position.set(s.x, s.y, s.z);
              opponentMeshRef.current.root.rotation.y = s.yaw;
              opponentMeshRef.current.torso.position.y = s.isCrouching ? 0.85 : 1.25;
            }
          }
        } else if (msg.type === 'SHOOT_BULLETS') {
          sound.playGunshot('ak47');
          if (opponentMeshRef.current) {
            opponentMeshRef.current.muzzleLight.intensity = 3;
            setTimeout(() => {
              if (opponentMeshRef.current) opponentMeshRef.current.muzzleLight.intensity = 0;
            }, 60);
          }
        } else if (msg.type === 'BULLET_HIT') {
          if (msg.payload.victimId === user.id) {
            takeDamage(msg.payload.damage);
          }
        } else if (msg.type === 'LOOT_TAKEN') {
          const taken = lootItemsRef.current.find(l => l.id === msg.payload.lootId);
          if (taken) {
            taken.isCollected = true;
            taken.mesh.visible = false;
          }
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
    }

    return () => {
      multiplayer.cleanup();
    };
  }, []);

  // 2. Zone Timer Countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setZoneTimer(t => (t <= 1 ? 40 : t - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 3. MAIN THREE.JS 3D SCENE & ENGINE
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 400;
    const height = container.clientHeight || 580;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const meta = MAP_CATALOG[mapId];
    scene.background = new THREE.Color(meta.skyColor);

    // Build World (Map Environment + Obstacles + 3D Loot)
    const { obstacles, safeZone, lootItems } = buildMapEnvironment(mapId, scene);
    lootItemsRef.current = lootItems;

    const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 450);

    // 3D Soldiers
    const playerSoldier = createSoldierMesh(false);
    scene.add(playerSoldier.root);

    const opponentSoldier = createSoldierMesh(true);
    opponentSoldier.root.position.copy(opponentPosRef.current);
    scene.add(opponentSoldier.root);
    opponentMeshRef.current = opponentSoldier;

    // Window Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Keyboard Listeners
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === 'v') {
        toggleViewMode();
      } else if (e.key.toLowerCase() === 'c') {
        toggleCrouch();
      } else if (e.key.toLowerCase() === 'z') {
        toggleProne();
      } else if (e.key.toLowerCase() === 'shift') {
        sprintRef.current = true;
      } else if (e.key.toLowerCase() === 'r') {
        reloadActiveWeapon();
      } else if (e.key.toLowerCase() === 'e') {
        useMedkitItem();
      } else if (e.key.toLowerCase() === 'f') {
        pickupNearbyLoot();
      } else if (e.key === '1') {
        selectSlot('primary');
      } else if (e.key === '2') {
        selectSlot('secondary');
      } else if (e.key === '3') {
        selectSlot('sidearm');
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
      if (e.key.toLowerCase() === 'shift') sprintRef.current = false;
    };

    // Mouse Steering & Camera Controls (Supports Pointer Lock & Mouse Drag)
    let isMouseDown = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    const onMouseMove = (e: MouseEvent) => {
      const sens = 0.0028;
      let dx = 0;
      let dy = 0;

      if (document.pointerLockElement === renderer.domElement) {
        dx = e.movementX;
        dy = e.movementY;
      } else if (isMouseDown) {
        dx = e.clientX - lastMouseX;
        dy = e.clientY - lastMouseY;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      } else {
        return;
      }

      playerAnglesRef.current.yaw -= dx * sens;
      playerAnglesRef.current.pitch -= dy * sens;
      playerAnglesRef.current.pitch = Math.max(-1.15, Math.min(1.15, playerAnglesRef.current.pitch));

      const deg = Math.round(((-playerAnglesRef.current.yaw * 180) / Math.PI) % 360);
      setCompassHeading(deg < 0 ? deg + 360 : deg);
    };

    const onMouseDown = (e: MouseEvent) => {
      isMouseDown = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }

      if (e.button === 0) {
        isFiringRef.current = true;
        triggerShoot(camera, scene, obstacles, opponentSoldier);
      } else if (e.button === 2) {
        e.preventDefault();
        isAimingRef.current = true;
        setIsAiming(true);
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      isMouseDown = false;
      if (e.button === 0) {
        isFiringRef.current = false;
      } else if (e.button === 2) {
        isAimingRef.current = false;
        setIsAiming(false);
      }
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    renderer.domElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    renderer.domElement.addEventListener('contextmenu', onContextMenu);

    const handleCanvasClick = () => {
      if (document.pointerLockElement !== renderer.domElement) {
        renderer.domElement.requestPointerLock();
      }
    };
    renderer.domElement.addEventListener('click', handleCanvasClick);

    const onPointerLockChange = () => {
      setIsLocked(document.pointerLockElement === renderer.domElement);
    };
    document.addEventListener('pointerlockchange', onPointerLockChange);

    // ==================== 60 FPS MAIN RENDER & PHYSICS LOOP ====================
    let animId: number;
    let clock = new THREE.Clock();
    let lastNetworkSync = 0;
    let lastZoneDamage = 0;

    const renderLoop = () => {
      const delta = Math.min(clock.getDelta(), 0.05);

      const pos = playerPosRef.current;
      const vel = playerVelRef.current;
      const { yaw, pitch } = playerAnglesRef.current;
      const curViewMode = viewModeRef.current;

      // Check vehicle proximity
      const distToTech = pos.distanceTo(new THREE.Vector3(0, 0, 12));
      const nearTech = distToTech < 3.8;
      isNearVehicleRef.current = nearTech;
      setNearbyVehicle(nearTech);

      let moving = false;
      let isProne = proneRef.current;

      if (isVehicleMountedRef.current) {
        // Player is mounted on the Armored Technical Autocannon Turret!
        pos.set(0, 1.85, 12);
        vel.set(0, 0, 0);
        if (locomotionRef.current !== 'idle') {
          locomotionRef.current = 'idle';
          setLocomotion('idle');
        }
      } else {
        // 1. Tactical locomotion: sprint, crouch, prone/crawl, and vault impulse.
        moving = Boolean(keys.current['w'] || keys.current['a'] || keys.current['s'] || keys.current['d']);
        isProne = proneRef.current;
        const isVaulting = keys.current[' '] && moving && pos.y <= 0.05 && Date.now() - lastJumpRef.current > 500;
        const moveSpeed = isProne ? 1.25 : isCrouchedRef.current ? 2.8 : sprintRef.current ? 9.2 : 5.8;
        const nextLocomotion: LocomotionState = isVaulting ? 'vault' : isProne ? (moving ? 'crawl' : 'prone') : isCrouchedRef.current ? 'crouch' : sprintRef.current && moving ? 'sprint' : moving ? 'idle' : 'idle';
        if (nextLocomotion !== locomotionRef.current) {
          locomotionRef.current = nextLocomotion;
          setLocomotion(nextLocomotion);
        }
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

        const moveDir = new THREE.Vector3();
        if (keys.current['w'] || keys.current['arrowup']) moveDir.add(forward);
        if (keys.current['s'] || keys.current['arrowdown']) moveDir.sub(forward);
        if (keys.current['d'] || keys.current['arrowright']) moveDir.add(right);
        if (keys.current['a'] || keys.current['arrowleft']) moveDir.sub(right);

        if (moveDir.lengthSq() > 0) {
          moveDir.normalize().multiplyScalar(moveSpeed * delta);
          pos.add(moveDir);
        }

        // Check Watchtower Ladder Climb (Allows scaling to sniper decks!)
        let onLadder = false;
        const watchtowers = [[-38, -32], [38, -32], [-38, 32], [38, 32]];
        for (const [tx, tz] of watchtowers) {
          if (Math.hypot(pos.x - tx, pos.z - (tz + 2.35)) < 1.45) {
            onLadder = true;
            if (keys.current['w'] || keys.current['arrowup'] || keys.current[' ']) {
              pos.y = Math.min(9.8, pos.y + 5.2 * delta);
              vel.y = 0;
              locomotionRef.current = 'climb';
              setLocomotion('climb');
            } else if (keys.current['s'] || keys.current['arrowdown']) {
              pos.y = Math.max(0, pos.y - 4.5 * delta);
              vel.y = 0;
            }
            break;
          }
        }

        // Check standing on top of platforms / obstacle roofs
        let groundLevel = 0;
        obstacles.forEach(obs => {
          const topY = obs.box.max.y;
          const inBoundsXZ = pos.x >= obs.box.min.x - 0.25 && pos.x <= obs.box.max.x + 0.25 &&
                             pos.z >= obs.box.min.z - 0.25 && pos.z <= obs.box.max.z + 0.25;
          if (inBoundsXZ && pos.y >= topY - 0.45 && pos.y <= topY + 0.8) {
            groundLevel = Math.max(groundLevel, topY);
          }
        });

        if (!onLadder) {
          if (isVaulting) {
            lastJumpRef.current = Date.now();
            vel.y = 5.8;
            keys.current[' '] = false;
            setLocomotion('vault');
          }
          if (isProne) vel.y = 0;
          else if (keys.current[' '] && pos.y <= groundLevel + 0.05 && !isCrouchedRef.current) vel.y = 5.2;

          if (pos.y > groundLevel) {
            vel.y -= 15.0 * delta;
            pos.y += vel.y * delta;
          }
          if (pos.y <= groundLevel) {
            pos.y = groundLevel;
            vel.y = 0;
          }
        }

        pos.x = Math.max(-160, Math.min(160, pos.x));
        pos.z = Math.max(-160, Math.min(160, pos.z));

        // 2. Obstacle Collision Resolution
        obstacles.forEach(obs => {
          // If player is standing on top of obstacle, ignore horizontal collision
          if (pos.y >= obs.box.max.y - 0.18) return;

          const playerBox = new THREE.Box3(
            new THREE.Vector3(pos.x - 0.45, pos.y, pos.z - 0.45),
            new THREE.Vector3(pos.x + 0.45, pos.y + 1.8, pos.z + 0.45)
          );
          if (obs.box.intersectsBox(playerBox)) {
            if (obs.box.max.y <= pos.y + 1.4 && isVaulting) {
              vel.y = 5.6;
              pos.y += 0.2;
            } else {
              const center = new THREE.Vector3();
              obs.box.getCenter(center);
              const push = pos.clone().sub(center).setY(0).normalize().multiplyScalar(0.08);
              pos.add(push);
            }
          }
        });
      }

      // 3. Update Player Soldier Mesh
      playerSoldier.root.position.copy(pos);
      playerSoldier.root.rotation.y = yaw;

      if (isCrouchedRef.current) {
        playerSoldier.torso.position.y = 0.85;
        playerSoldier.head.position.y = 1.45;
      } else {
        playerSoldier.torso.position.y = 1.25;
        playerSoldier.head.position.y = 1.95;
      }

      // 4. Procedural operator kinematics: opposing gait phases, weight shift, crouch/prone geometry, and spring recoil.
      const rig = playerSoldier.rig;
      const gaitSpeed = isProne ? 4.2 : sprintRef.current ? 13 : isCrouchedRef.current ? 7 : 9;
      const gait = clock.elapsedTime * gaitSpeed;
      const stride = moving ? Math.sin(gait) : 0;
      const strideOpposite = moving ? Math.sin(gait + Math.PI) : 0;
      const crouchBlend = isCrouchedRef.current ? 1 : 0;
      const proneBlend = isProne ? 1 : 0;
      const targetRootX = proneBlend * -Math.PI * 0.47 + crouchBlend * 0.08;
      playerSoldier.root.rotation.x += (targetRootX - playerSoldier.root.rotation.x) * Math.min(1, delta * 12);
      playerSoldier.root.position.y = pos.y + (proneBlend ? 0.22 : crouchBlend ? -0.18 : 0);
      playerSoldier.torso.rotation.x = THREE.MathUtils.lerp(playerSoldier.torso.rotation.x, (sprintRef.current ? -0.18 : 0) + pitch * 0.16, delta * 8);
      playerSoldier.torso.position.y = THREE.MathUtils.lerp(playerSoldier.torso.position.y, proneBlend ? 0.56 : crouchBlend ? 0.82 : 1.23 + Math.abs(stride) * (moving ? 0.045 : 0), delta * 10);
      rig.leftLeg.rotation.x = THREE.MathUtils.lerp(rig.leftLeg.rotation.x, proneBlend ? 0.18 : crouchBlend ? -0.72 + stride * 0.08 : strideOpposite * 0.52, delta * 14);
      rig.rightLeg.rotation.x = THREE.MathUtils.lerp(rig.rightLeg.rotation.x, proneBlend ? -0.18 : crouchBlend ? -0.72 + strideOpposite * 0.08 : stride * 0.52, delta * 14);
      rig.leftArm.rotation.x = THREE.MathUtils.lerp(rig.leftArm.rotation.x, proneBlend ? -0.9 : -0.2 - strideOpposite * 0.32, delta * 14);
      rig.rightArm.rotation.x = THREE.MathUtils.lerp(rig.rightArm.rotation.x, proneBlend ? -0.9 : -0.2 - stride * 0.32, delta * 14);
      rig.leftArm.rotation.z = THREE.MathUtils.lerp(rig.leftArm.rotation.z, pitch * 0.22, delta * 10);
      rig.rightArm.rotation.z = THREE.MathUtils.lerp(rig.rightArm.rotation.z, -pitch * 0.22, delta * 10);
      const recoilTarget = isFiringRef.current ? -0.12 : 0;
      rig.recoil.position.z += (0.45 + recoilTarget - rig.recoil.position.z) * Math.min(1, delta * 18);
      playerSoldier.muzzleLight.intensity = THREE.MathUtils.lerp(playerSoldier.muzzleLight.intensity, isFiringRef.current ? 4 : 0, delta * 24);

      // 5. CAMERA VIEW CONTROLLER: TPP vs FPP (Dynamic Switch)
      const crouchOffset = isCrouchedRef.current ? -0.4 : 0;
      const aimZoom = isAimingRef.current ? 0.45 : 1.0;

      if (curViewMode === 'fpp') {
        // ========== FIRST-PERSON PERSPECTIVE (FPP) ==========
        // Hide head and torso from local view so they don't block the camera
        playerSoldier.torso.visible = false;
        playerSoldier.head.visible = false;

        // Position camera directly at soldier eye level
        const fppOffset = new THREE.Vector3(0, 1.85 + crouchOffset, 0.1);
        camera.position.copy(pos).add(fppOffset);

        const lookTarget = new THREE.Vector3(
          pos.x - Math.sin(yaw) * 40,
          pos.y + 1.85 + crouchOffset + Math.sin(pitch) * 40,
          pos.z - Math.cos(yaw) * 40
        );
        camera.lookAt(lookTarget);

      } else {
        // ========== THIRD-PERSON PERSPECTIVE (TPP) ==========
        playerSoldier.torso.visible = true;
        playerSoldier.head.visible = true;

        const camOffset = new THREE.Vector3(
          0.65 * aimZoom,
          (1.85 + crouchOffset) * aimZoom,
          -3.2 * aimZoom
        );
        camOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), pitch * 0.4);
        camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

        camera.position.copy(pos).add(camOffset);

        const lookTarget = new THREE.Vector3(
          pos.x - Math.sin(yaw) * 40,
          pos.y + 1.7 + crouchOffset + Math.sin(pitch) * 40,
          pos.z - Math.cos(yaw) * 40
        );
        camera.lookAt(lookTarget);
      }

      camera.fov = isAimingRef.current ? 36 : (curViewMode === 'fpp' ? 70 : 65);
      camera.updateProjectionMatrix();

      // 5. Ground Loot Detection (Check if near loot items)
      let foundNearby: LootItem3D | null = null;
      lootItemsRef.current.forEach(loot => {
        if (loot.isCollected) return;
        // Rotate floating 3D loot mesh
        loot.mesh.rotation.y += 0.02;
        const d = pos.distanceTo(loot.pos);
        if (d < 3.2) {
          foundNearby = loot;
        }
      });
      setNearbyLoot(foundNearby);

      // 5.5 Active Rockets (RPG-7) Flight Physics & Detonation
      const rockets = activeRocketsRef.current;
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        const prevPos = r.mesh.position.clone();
        r.mesh.position.addScaledVector(r.velocity, delta);

        // Rocket exhaust particle puff
        if (Math.random() < 0.65) {
          const puff = new THREE.Mesh(
            new THREE.SphereGeometry(0.18 + Math.random() * 0.12, 6, 6),
            new THREE.MeshBasicMaterial({ color: '#78716c', transparent: true, opacity: 0.55 })
          );
          puff.position.copy(prevPos);
          scene.add(puff);
          setTimeout(() => {
            scene.remove(puff);
            puff.geometry.dispose();
          }, 320);
        }

        const oppTarget = opponentPosRef.current.clone().add(new THREE.Vector3(0, 1.1, 0));
        const oppDist = r.mesh.position.distanceTo(oppTarget);
        let hitObs = false;
        for (const obs of obstacles) {
          if (obs.box.containsPoint(r.mesh.position)) {
            hitObs = true;
            break;
          }
        }
        const hitGround = r.mesh.position.y <= 0.1;
        const timedOut = Date.now() - r.spawnTime > 3500;

        if (oppDist < 2.2 || hitObs || hitGround || timedOut) {
          const blastPos = r.mesh.position.clone();
          scene.remove(r.mesh);
          rockets.splice(i, 1);

          createExplosionBlast(scene, blastPos);
          sound.playExplosion();
          cameraShakeRef.current = 0.55;

          // Splash damage to opponent bot
          const distToOpp = blastPos.distanceTo(opponentPosRef.current);
          if (distToOpp < 9.5) {
            const splashDmg = Math.round(160 * Math.max(0.2, (1 - distToOpp / 9.5)));
            damageOpponent(splashDmg, distToOpp < 2.4);
            setDamageFeed(`🚀 RPG DETONATION! -${splashDmg}`);
          }

          // Splash damage to player if caught in blast
          const distToSelf = blastPos.distanceTo(pos);
          if (distToSelf < 7.5) {
            const selfDmg = Math.round(90 * (1 - distToSelf / 7.5));
            takeDamage(selfDmg);
          }
        }
      }

      // Camera Screenshake Decay
      if (cameraShakeRef.current > 0.01) {
        camera.position.x += (Math.random() - 0.5) * cameraShakeRef.current;
        camera.position.y += (Math.random() - 0.5) * cameraShakeRef.current;
        cameraShakeRef.current *= 0.88;
      }

      // 6. Safe Zone Shrink & Outside Damage
      if (safeZone.radius > safeZone.targetRadius) {
        safeZone.radius -= safeZone.shrinkSpeed * delta;
        safeZone.mesh.scale.set(safeZone.radius / 75, 1, safeZone.radius / 75);
      }

      const distCenter = Math.hypot(pos.x, pos.z);
      const isOut = distCenter > safeZone.radius;
      setOutsideZone(isOut);

      const now = Date.now();
      if (isOut && now - lastZoneDamage > 1000) {
        lastZoneDamage = now;
        takeDamage(6);
      }

      // 7. Tactical AI Opponent — Aggressive Combat AI with Cover, Flanking, Burst Fire & Grenades
      if (mode === 'ai' && opponentHpRef.current > 0) {
        const oppPos = opponentPosRef.current;
        const dist = oppPos.distanceTo(pos);
        const targetAngle = Math.atan2(pos.x - oppPos.x, pos.z - oppPos.z);

        // Initialize AI state on first frame
        if (!opponentSoldier.root.userData.aiState) {
          opponentSoldier.root.userData.aiState = 'hunt';
          opponentSoldier.root.userData.lastStateChange = now;
          opponentSoldier.root.userData.dodgeDir = 1;
          opponentSoldier.root.userData.burstCount = 0;
          opponentSoldier.root.userData.lastFireTime = now;
          opponentSoldier.root.userData.lastGrenadeTime = now - 8000;
        }

        const aiData = opponentSoldier.root.userData;
        const aiHpPct = opponentHpRef.current / 100;

        // State machine: hunt → engage → flank → dodge (cycle every few seconds)
        const timeSinceStateChange = now - aiData.lastStateChange;
        if (timeSinceStateChange > (2000 + Math.random() * 2000)) {
          aiData.lastStateChange = now;
          aiData.dodgeDir *= -1; // Flip dodge direction
          if (dist > 45) {
            aiData.aiState = 'hunt';
          } else if (dist > 18) {
            aiData.aiState = Math.random() > 0.4 ? 'flank' : 'engage';
          } else {
            aiData.aiState = aiHpPct < 0.35 ? 'retreat_fire' : 'close_assault';
          }
        }

        // Smooth rotation to aim at player — faster when close
        const rotSpeed = dist < 15 ? 16 : 10;
        opponentSoldier.root.rotation.y = THREE.MathUtils.lerp(
          opponentSoldier.root.rotation.y,
          targetAngle,
          Math.min(1, delta * rotSpeed)
        );

        // Movement based on AI state
        let aiSpeed: number;
        let moveAngle: number;
        switch (aiData.aiState) {
          case 'hunt':
            // Sprint directly toward player
            aiSpeed = 7.0;
            moveAngle = targetAngle;
            break;
          case 'engage':
            // Move toward player with slight lateral offset
            aiSpeed = 4.8;
            moveAngle = targetAngle + aiData.dodgeDir * 0.35;
            break;
          case 'flank':
            // Wide arc around player to attack from side
            aiSpeed = 5.5;
            moveAngle = targetAngle + aiData.dodgeDir * (Math.PI * 0.38);
            break;
          case 'close_assault':
            // Aggressive circling with unpredictable direction changes
            aiSpeed = 5.2;
            moveAngle = targetAngle + (Math.PI / 2) * aiData.dodgeDir
              + Math.sin(clock.elapsedTime * 4.5) * 0.6;
            break;
          case 'retreat_fire':
            // Back away while shooting — low HP survival mode
            aiSpeed = 4.0;
            moveAngle = targetAngle + Math.PI + aiData.dodgeDir * 0.5;
            break;
          default:
            aiSpeed = 5.0;
            moveAngle = targetAngle;
        }

        // Random micro-dodges to avoid being an easy target
        if (dist < 40 && Math.sin(clock.elapsedTime * 7) > 0.7) {
          moveAngle += aiData.dodgeDir * 0.8;
        }

        oppPos.x += Math.sin(moveAngle) * aiSpeed * delta;
        oppPos.z += Math.cos(moveAngle) * aiSpeed * delta;

        // Clamp inside arena bounds
        oppPos.x = Math.max(-130, Math.min(130, oppPos.x));
        oppPos.z = Math.max(-130, Math.min(130, oppPos.z));
        opponentSoldier.root.position.copy(oppPos);

        // Animate AI Bot limbs — faster stride when sprinting
        const oppRig = opponentSoldier.rig;
        if (oppRig) {
          const gaitSpeed = aiSpeed > 5.5 ? 14 : 10;
          const aiGait = clock.elapsedTime * gaitSpeed;
          const aiStride = Math.sin(aiGait) * 0.55;
          const aiStrideOpp = Math.sin(aiGait + Math.PI) * 0.55;
          oppRig.leftLeg.rotation.x = aiStride;
          oppRig.rightLeg.rotation.x = aiStrideOpp;
          oppRig.leftArm.rotation.x = -0.25 - aiStrideOpp * 0.35;
          oppRig.rightArm.rotation.x = -0.25 - aiStride * 0.35;
        }

        // AI FIRING — Burst fire with varying intervals based on distance
        const fireInterval = dist < 12 ? 180 : dist < 30 ? 280 : 400;

        if (dist < 75 && now - aiData.lastFireTime > fireInterval) {
          aiData.lastFireTime = now;
          aiData.burstCount++;

          // Burst of 3-5 shots then short cooldown
          if (aiData.burstCount > (3 + Math.floor(Math.random() * 3))) {
            aiData.burstCount = 0;
            aiData.lastFireTime = now + 600 + Math.random() * 400; // Cooldown between bursts
          }

          // Muzzle Flash
          opponentSoldier.muzzleLight.intensity = 6;
          setTimeout(() => (opponentSoldier.muzzleLight.intensity = 0), 55);
          sound.playGunshot('ak47');

          // Visible Red Bullet Tracer from AI to Player
          const aiMuzzlePos = oppPos.clone().add(new THREE.Vector3(0, 1.3, 0));
          // AI accuracy improves when closer and player is not crouching
          const spread = isCrouchedRef.current
            ? (dist < 15 ? 1.0 : 2.2)
            : (dist < 15 ? 0.4 : 1.0);
          const aimTarget = pos.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * spread,
            isCrouchedRef.current ? 0.5 : 1.2 + (Math.random() - 0.5) * 0.3,
            (Math.random() - 0.5) * spread
          ));
          const tracerGeo = new THREE.BufferGeometry().setFromPoints([aiMuzzlePos, aimTarget]);
          const tracerMat = new THREE.LineBasicMaterial({ color: '#f87171', transparent: true, opacity: 0.95 });
          const aiTracer = new THREE.Line(tracerGeo, tracerMat);
          scene.add(aiTracer);
          setTimeout(() => {
            scene.remove(aiTracer);
            tracerGeo.dispose();
            tracerMat.dispose();
          }, 85);

          // Hit calculation — AI is more accurate up close, less when player crouches
          const baseHitChance = isCrouchedRef.current ? 0.18 : 0.42;
          const distMod = dist < 15 ? 1.3 : dist < 30 ? 1.0 : 0.7;
          if (Math.random() < baseHitChance * distMod) {
            const dmg = Math.floor(Math.random() * 10 + 10);
            takeDamage(dmg);
            // Camera punch on hit
            cameraShakeRef.current = Math.max(cameraShakeRef.current, 0.12);
          }
        }

        // AI GRENADE — throws one every 10-15s when in mid-range
        if (dist > 8 && dist < 35 && now - aiData.lastGrenadeTime > (10000 + Math.random() * 5000)) {
          aiData.lastGrenadeTime = now;
          // Visual grenade projectile
          const grenade = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 8, 8),
            new THREE.MeshStandardMaterial({ color: '#4a5f3a', roughness: 0.7 })
          );
          grenade.position.copy(oppPos).add(new THREE.Vector3(0, 1.5, 0));
          scene.add(grenade);
          const grenadeTarget = pos.clone();
          const grenadeStart = grenade.position.clone();
          const grenadeStartTime = now;
          const grenadeFlightTime = 1200;
          const grenadeInterval = setInterval(() => {
            const t = Math.min(1, (Date.now() - grenadeStartTime) / grenadeFlightTime);
            grenade.position.lerpVectors(grenadeStart, grenadeTarget, t);
            grenade.position.y += Math.sin(t * Math.PI) * 6; // Arc trajectory
            if (t >= 1) {
              clearInterval(grenadeInterval);
              scene.remove(grenade);
              grenade.geometry.dispose();
              createExplosionBlast(scene, grenadeTarget);
              sound.playExplosion();
              cameraShakeRef.current = 0.4;
              const distToBlast = grenadeTarget.distanceTo(playerPosRef.current);
              if (distToBlast < 7) {
                takeDamage(Math.round(45 * (1 - distToBlast / 7)));
              }
            }
          }, 16);
        }
      }


      // 8. State Broadcast
      if (now - lastNetworkSync > 45 && mode !== 'ai') {
        lastNetworkSync = now;
        multiplayer.sendShooterState({
          x: Number(pos.x.toFixed(2)),
          y: Number(pos.y.toFixed(2)),
          z: Number(pos.z.toFixed(2)),
          yaw: Number(yaw.toFixed(2)),
          isCrouching: isCrouchedRef.current
        });
      }

      renderer.render(scene, camera);
      animId = requestAnimationFrame(renderLoop);
    };

    animId = requestAnimationFrame(renderLoop);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      renderer.domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      renderer.domElement.removeEventListener('contextmenu', onContextMenu);
      renderer.domElement.removeEventListener('click', handleCanvasClick);
      document.removeEventListener('pointerlockchange', onPointerLockChange);

      if (container && renderer.domElement) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [mapId]);

  // View Mode Toggle (TPP vs FPP)
  const toggleViewMode = () => {
    sound.playClick();
    const next = viewMode === 'tpp' ? 'fpp' : 'tpp';
    setViewMode(next);
    viewModeRef.current = next;
  };

  // Weapon Slot Switching
  const selectSlot = (slot: WeaponSlotId) => {
    if (!weapons[slot]) return;
    sound.playPickup();
    tgHaptics.selection();
    setActiveSlot(slot);
  };

  // Pickup Nearby Ground Loot
  const pickupNearbyLoot = () => {
    if (!nearbyLoot) return;
    sound.playPickup();
    tgHaptics.notification('success');

    if (nearbyLoot.type === 'weapon' && nearbyLoot.weaponType) {
      const newGun: WeaponSlotState = nearbyLoot.weaponType === 'rpg' ? {
        id: 'secondary',
        name: 'RPG-7 Bazooka',
        nameAr: 'قاذف صواريخ RPG-7 (بازوكا)',
        weaponType: 'rpg',
        damage: 160,
        fireRateMs: 1400,
        magazineSize: 1,
        reloadTimeMs: 2700,
        ammoInClip: 1,
        reserveAmmo: 6,
        icon: '🚀'
      } : nearbyLoot.weaponType === 'awm' ? {
        id: 'secondary',
        name: 'AWM Sniper',
        nameAr: 'قناصة AWM الأسطورية',
        weaponType: 'awm',
        damage: 120,
        fireRateMs: 1200,
        magazineSize: 5,
        reloadTimeMs: 2800,
        ammoInClip: 5,
        reserveAmmo: 25,
        icon: '🎯'
      } : {
        id: 'secondary',
        name: 'S1897 Shotgun',
        nameAr: 'شوزن قتالي S1897',
        weaponType: 'shotgun',
        damage: 130,
        fireRateMs: 800,
        magazineSize: 5,
        reloadTimeMs: 2400,
        ammoInClip: 5,
        reserveAmmo: 30,
        icon: '💥'
      };

      setWeapons(prev => ({ ...prev, secondary: newGun }));
      setActiveSlot('secondary');
    } else if (nearbyLoot.type === 'ammo') {
      setWeapons(prev => {
        const cur = prev[activeSlot];
        if (!cur) return prev;
        return {
          ...prev,
          [activeSlot]: { ...cur, reserveAmmo: cur.reserveAmmo + 60 }
        };
      });
    } else if (nearbyLoot.type === 'medkit') {
      setMedkits(m => m + 1);
    }

    nearbyLoot.isCollected = true;
    nearbyLoot.mesh.visible = false;
    multiplayer.sendLootTaken(nearbyLoot.id);
    setNearbyLoot(null);
  };

  // Combat Vehicle Mount / Dismount Action
  const toggleVehicleMount = () => {
    if (isVehicleMountedRef.current) {
      // Dismount
      isVehicleMountedRef.current = false;
      setIsVehicleMounted(false);
      playerPosRef.current.set(2.4, 0, 12);
      sound.playShield();
      tgHaptics.notification('warning');
      setDamageFeed('تم النزول من المدرعة 🚶‍♂️');
      setTimeout(() => setDamageFeed(null), 1200);
    } else {
      // Mount heavy turret
      isVehicleMountedRef.current = true;
      setIsVehicleMounted(true);
      playerPosRef.current.set(0, 1.85, 12);
      sound.playShield();
      tgHaptics.notification('success');
      setDamageFeed('تم ركوب مدفع المدرعة الثقيل 🛡️🔥');
      setTimeout(() => setDamageFeed(null), 1200);
    }
  };

  // Explosive Blast Visual Effects (Fireball + Shrapnel Sparks + Flash Light)
  const createExplosionBlast = (scene: THREE.Scene, pos: THREE.Vector3) => {
    const fireGeo = new THREE.SphereGeometry(1.6, 12, 12);
    const fireMat = new THREE.MeshBasicMaterial({ color: '#ff4500', transparent: true, opacity: 0.95 });
    const fireball = new THREE.Mesh(fireGeo, fireMat);
    fireball.position.copy(pos);
    scene.add(fireball);

    const blastLight = new THREE.PointLight('#f97316', 15, 24);
    blastLight.position.copy(pos);
    scene.add(blastLight);

    const sparks: THREE.Mesh[] = [];
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 4, 4),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? '#fbbf24' : '#ef4444' })
      );
      sp.position.copy(pos);
      sp.userData = {
        vx: (Math.random() - 0.5) * 16,
        vy: Math.random() * 12 + 2,
        vz: (Math.random() - 0.5) * 16
      };
      scene.add(sp);
      sparks.push(sp);
    }

    const start = Date.now();
    const dur = 420;
    const anim = () => {
      const elapsed = Date.now() - start;
      const prog = elapsed / dur;
      if (prog < 1) {
        const scale = 1 + prog * 3.6;
        fireball.scale.set(scale, scale, scale);
        fireMat.opacity = 0.95 * (1 - prog);
        blastLight.intensity = 15 * (1 - prog);
        sparks.forEach(sp => {
          sp.position.x += sp.userData.vx * 0.016;
          sp.position.y += sp.userData.vy * 0.016;
          sp.position.z += sp.userData.vz * 0.016;
          sp.userData.vy -= 18 * 0.016;
        });
        requestAnimationFrame(anim);
      } else {
        scene.remove(fireball);
        scene.remove(blastLight);
        fireGeo.dispose();
        fireMat.dispose();
        sparks.forEach(sp => {
          scene.remove(sp);
          sp.geometry.dispose();
        });
      }
    };
    anim();
  };

  // Bullet Impact Sparks & Blood Splatter
  const createImpactSparks = (scene: THREE.Scene, pos: THREE.Vector3, isFlesh: boolean) => {
    const count = isFlesh ? 8 : 5;
    const color = isFlesh ? '#dc2626' : '#f59e0b';
    const sparks: THREE.Mesh[] = [];
    for (let i = 0; i < count; i++) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 4, 4),
        new THREE.MeshBasicMaterial({ color })
      );
      s.position.copy(pos);
      s.userData = {
        vx: (Math.random() - 0.5) * 7,
        vy: Math.random() * 5 + 1.5,
        vz: (Math.random() - 0.5) * 7
      };
      scene.add(s);
      sparks.push(s);
    }
    const startTime = Date.now();
    const animSparks = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      if (elapsed < 0.28) {
        sparks.forEach(s => {
          s.position.x += s.userData.vx * 0.016;
          s.position.y += s.userData.vy * 0.016;
          s.position.z += s.userData.vz * 0.016;
          s.userData.vy -= 12 * 0.016;
        });
        requestAnimationFrame(animSparks);
      } else {
        sparks.forEach(s => {
          scene.remove(s);
          s.geometry.dispose();
        });
      }
    };
    animSparks();
  };

  // Shoot Action (3D Raycasting & Physical RPG Rockets & Vehicle Autocannon)
  const triggerShoot = (
    camera: THREE.Camera, 
    scene: THREE.Scene, 
    obstacles: CoverObstacle3D[],
    oppSoldier: ReturnType<typeof createSoldierMesh>
  ) => {
    // 1. VEHICLE MOUNTED DUAL AUTOCANNON FIRE
    if (isVehicleMountedRef.current) {
      const now = Date.now();
      if (now - lastFireTimeRef.current < 120) return;
      lastFireTimeRef.current = now;

      sound.playGunshot('autocannon');
      tgHaptics.impact('heavy');
      cameraShakeRef.current = 0.22;

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

      const targets = [oppSoldier.head, oppSoldier.torso, ...obstacles.map(o => o.mesh)];
      const intersects = raycaster.intersectObjects(targets, true);
      const hitPoint = intersects[0]?.point ?? raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(150));

      const tracerGeometry = new THREE.BufferGeometry().setFromPoints([raycaster.ray.origin.clone(), hitPoint]);
      const tracerMaterial = new THREE.LineBasicMaterial({ color: '#f59e0b', transparent: true, opacity: 0.95 });
      const tracer = new THREE.Line(tracerGeometry, tracerMaterial);
      scene.add(tracer);
      setTimeout(() => {
        scene.remove(tracer);
        tracerGeometry.dispose();
        tracerMaterial.dispose();
      }, 70);

      const muzzle = new THREE.PointLight('#f59e0b', 7, 5);
      muzzle.position.copy(raycaster.ray.origin);
      scene.add(muzzle);
      setTimeout(() => scene.remove(muzzle), 50);

      if (intersects.length > 0) {
        const hit = intersects[0];
        createImpactSparks(scene, hit.point, hit.object === oppSoldier.head || hit.object === oppSoldier.torso);

        if (hit.object === oppSoldier.head || hit.object === oppSoldier.torso || oppSoldier.root.getObjectById(hit.object.id)) {
          damageOpponent(42, hit.object === oppSoldier.head);
        }
      }
      return;
    }

    const curWeapon = weapons[activeSlot];
    if (!curWeapon || isReloading || curWeapon.ammoInClip <= 0) {
      if (curWeapon && curWeapon.ammoInClip <= 0) reloadActiveWeapon();
      return;
    }

    const now = Date.now();
    if (now - lastFireTimeRef.current < curWeapon.fireRateMs) return;
    lastFireTimeRef.current = now;

    // Decrement ammo
    setWeapons(prev => ({
      ...prev,
      [activeSlot]: { ...curWeapon, ammoInClip: curWeapon.ammoInClip - 1 }
    }));

    // 2. BAZOOKA / RPG-7 PHYSICAL ROCKET LAUNCH
    if (curWeapon.weaponType === 'rpg') {
      sound.playGunshot('rpg');
      tgHaptics.notification('warning');
      cameraShakeRef.current = 0.45;

      const rocketGroup = new THREE.Group();
      // Warhead
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.45, 8),
        new THREE.MeshStandardMaterial({ color: '#ea580c', roughness: 0.4, metalness: 0.6 })
      );
      cone.rotation.x = Math.PI / 2;
      cone.position.z = -0.35;
      rocketGroup.add(cone);

      // Rocket Body
      const cylinder = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.09, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: '#27272a', roughness: 0.5, metalness: 0.8 })
      );
      cylinder.rotation.x = Math.PI / 2;
      rocketGroup.add(cylinder);

      // Thruster Flame Light
      const rLight = new THREE.PointLight('#f97316', 8, 10);
      rLight.position.z = 0.45;
      rocketGroup.add(rLight);

      const camDir = new THREE.Vector3();
      camera.getWorldDirection(camDir);
      rocketGroup.position.copy(camera.position).add(camDir.clone().multiplyScalar(1.2));
      rocketGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), camDir);

      scene.add(rocketGroup);
      activeRocketsRef.current.push({
        mesh: rocketGroup,
        light: rLight,
        velocity: camDir.clone().multiplyScalar(52), // 52 m/s
        spawnTime: Date.now()
      });

      multiplayer.sendShootBullets([{ weaponType: 'rpg' }]);
      return;
    }

    // 3. STANDARD HITSCAN FIREARMS (AK-47, AWM, Shotgun, Pistol)
    sound.playGunshot(curWeapon.weaponType);
    tgHaptics.impact(curWeapon.weaponType === 'awm' ? 'heavy' : 'medium');
    cameraShakeRef.current = curWeapon.weaponType === 'awm' ? 0.35 : 0.12;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const targets = [oppSoldier.head, oppSoldier.torso, ...obstacles.map(o => o.mesh)];
    const intersects = raycaster.intersectObjects(targets, true);
    const hitPoint = intersects[0]?.point ?? raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(120));
    const tracerGeometry = new THREE.BufferGeometry().setFromPoints([raycaster.ray.origin.clone(), hitPoint]);
    const tracerMaterial = new THREE.LineBasicMaterial({
      color: curWeapon.weaponType === 'awm' ? '#fbbf24' : curWeapon.weaponType === 'shotgun' ? '#f87171' : '#67e8f9',
      transparent: true,
      opacity: 0.95
    });
    const tracer = new THREE.Line(tracerGeometry, tracerMaterial);
    scene.add(tracer);
    window.setTimeout(() => {
      scene.remove(tracer);
      tracerGeometry.dispose();
      tracerMaterial.dispose();
    }, curWeapon.weaponType === 'awm' ? 180 : 90);

    const muzzle = new THREE.PointLight(curWeapon.weaponType === 'awm' ? '#fbbf24' : '#22d3ee', 6, 4);
    muzzle.position.copy(raycaster.ray.origin);
    scene.add(muzzle);
    window.setTimeout(() => scene.remove(muzzle), 70);

    if (intersects.length > 0) {
      const hit = intersects[0];
      const spark = new THREE.PointLight('#f59e0b', 3, 2);
      spark.position.copy(hit.point);
      scene.add(spark);
      setTimeout(() => scene.remove(spark), 120);

      createImpactSparks(scene, hit.point, hit.object === oppSoldier.head || hit.object === oppSoldier.torso);

      if (hit.object === oppSoldier.head) {
        sound.playExplosion();
        damageOpponent(curWeapon.damage * 2.2, true);
      } else if (hit.object === oppSoldier.torso || oppSoldier.root.getObjectById(hit.object.id)) {
        damageOpponent(curWeapon.damage, false);
      }
    }

    multiplayer.sendShootBullets([{ weaponType: curWeapon.weaponType }]);
  };

  const damageOpponent = (dmg: number, isHeadshot: boolean) => {
    opponentHpRef.current = Math.max(0, opponentHpRef.current - dmg);
    multiplayer.sendBulletHit(999999, dmg, weapons[activeSlot]?.weaponType || 'ak47');

    if (isHeadshot) {
      tgHaptics.notification('success');
    } else {
      tgHaptics.impact('light');
    }

    setDamageFeed(isHeadshot ? `🎯 HEADSHOT! -${Math.round(dmg)}` : `💥 HIT! -${Math.round(dmg)}`);
    setTimeout(() => setDamageFeed(null), 1200);

    if (opponentHpRef.current <= 0) {
      setKills(k => k + 1);
      handleVictory();
    }
  };

  const takeDamage = (dmg: number) => {
    // If inside armored combat vehicle, reduce damage by 75%
    if (isVehicleMountedRef.current) {
      dmg = Math.round(dmg * 0.25);
      sound.playShield();
    } else {
      sound.playHurt();
    }

    tgHaptics.impact('heavy');
    cameraShakeRef.current = 0.35;

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
      if (newHp <= 0) {
        handleDefeat();
        return 0;
      }
      return newHp;
    });
  };

  const toggleCrouch = () => {
    if (proneRef.current) proneRef.current = false;
    isCrouchedRef.current = !isCrouchedRef.current;
    setIsCrouching(isCrouchedRef.current);
    locomotionRef.current = isCrouchedRef.current ? 'crouch' : 'idle';
    setLocomotion(locomotionRef.current);
    sound.playPickup();
  };

  const toggleProne = () => {
    proneRef.current = !proneRef.current;
    isCrouchedRef.current = false;
    setIsCrouching(false);
    locomotionRef.current = proneRef.current ? 'prone' : 'idle';
    setLocomotion(locomotionRef.current);
    tgHaptics.impact('medium');
    sound.playPickup();
  };

  const reloadActiveWeapon = () => {
    const cur = weapons[activeSlot];
    if (!cur || isReloading || cur.ammoInClip === cur.magazineSize || cur.reserveAmmo <= 0) return;

    setIsReloading(true);
    sound.playReload();
    tgHaptics.impact('light');

    setTimeout(() => {
      const needed = cur.magazineSize - cur.ammoInClip;
      const reloadAmt = Math.min(needed, cur.reserveAmmo);
      setWeapons(prev => ({
        ...prev,
        [activeSlot]: {
          ...cur,
          ammoInClip: cur.ammoInClip + reloadAmt,
          reserveAmmo: cur.reserveAmmo - reloadAmt
        }
      }));
      setIsReloading(false);
    }, cur.reloadTimeMs);
  };

  const useMedkitItem = () => {
    if (medkits <= 0 || hp >= 100) return;
    sound.playPickup();
    tgHaptics.impact('light');
    setMedkits(m => m - 1);
    setHp(h => Math.min(100, h + 50));
  };

  const handleVictory = () => {
    if (gameOver) return;
    setGameOver('victory');
    sound.playReveal('mythic');
    tgHaptics.notification('success');
    confetti({ particleCount: 140, spread: 90, origin: { y: 0.5 } });
    multiplayer.sendGameOver(user.id);
    const starReward = stakeStars > 0 ? Math.floor(stakeStars * 1.8) : 0;
    onMatchComplete(true, 50, 200, starReward);
  };

  const handleDefeat = () => {
    if (gameOver) return;
    setGameOver('defeat');
    sound.playClick();
    tgHaptics.notification('error');
    onMatchComplete(false, -20, 30, 0);
  };

  // Mobile Touch Drag for Camera Yaw & Pitch
  const handleTouchStartRight = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStartRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleTouchMoveRight = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartRef.current.x;
    const dy = t.clientY - touchStartRef.current.y;
    touchStartRef.current = { x: t.clientX, y: t.clientY };

    const sens = 0.006;
    playerAnglesRef.current.yaw -= dx * sens;
    playerAnglesRef.current.pitch -= dy * sens;
    playerAnglesRef.current.pitch = Math.max(-1.15, Math.min(1.15, playerAnglesRef.current.pitch));
  };

  const activeWeapon = weapons[activeSlot];
  const locomotionLabel: Record<LocomotionState, string> = { idle: 'READY', sprint: 'SPRINT', crouch: 'CROUCH', slide: 'SLIDE', prone: 'PRONE', crawl: 'CRAWL', vault: 'VAULT', climb: 'CLIMB' };

  return (
    <div className="fixed inset-0 z-50 w-full h-full max-w-lg mx-auto bg-slate-950 overflow-hidden border-x border-slate-800 shadow-2xl flex flex-col select-none touch-none">
      {/* 3D WebGL Canvas Container */}
      <div 
        ref={mountRef} 
        className="w-full h-full relative cursor-crosshair overflow-hidden"
      >
        <div className="pointer-events-none absolute left-1/2 top-3 z-20 flex -translate-x-1/2 items-center gap-3 rounded-full border border-cyan-300/20 bg-slate-950/75 px-3 py-1.5 font-mono text-[9px] tracking-[0.18em] text-cyan-200 shadow-[0_0_24px_rgba(34,211,238,.14)] backdrop-blur-md">
          <span className="text-amber-300">{mapId === 'warzone' ? 'WARZONE 200×200' : 'TACTICAL ARENA'}</span>
          <span className="h-1 w-1 rounded-full bg-cyan-300" />
          <span>{locomotionLabel[locomotion]}</span>
          <span className="text-slate-500">FPP/TPP ONLINE</span>
        </div>
        {/* PC Pointer Lock Banner */}
        {!isLocked && (
          <div className="absolute top-16 inset-x-0 mx-auto w-max bg-black/80 backdrop-blur-md px-4 py-1.5 rounded-full border border-slate-700/60 text-white text-xs font-bold pointer-events-none z-30 animate-pulse">
            🖱️ انقر بالماوس لقفل الكاميرا والتصويب الحر
          </div>
        )}

        {/* Center Crosshair (PUBG Tactical Reticle) */}
        <div className="absolute inset-0 m-auto w-8 h-8 pointer-events-none flex items-center justify-center z-10">
          <div className={`w-1.5 h-1.5 rounded-full bg-cyan-400 ${isAiming ? 'scale-75 bg-amber-400' : ''}`} />
          <div className="absolute top-0 w-0.5 h-2.5 bg-cyan-400/80" />
          <div className="absolute bottom-0 w-0.5 h-2.5 bg-cyan-400/80" />
          <div className="absolute left-0 w-2.5 h-0.5 bg-cyan-400/80" />
          <div className="absolute right-0 w-2.5 h-0.5 bg-cyan-400/80" />
        </div>

        {/* Floating Damage Hit Number */}
        {damageFeed && (
          <div className="absolute top-1/3 inset-x-0 mx-auto w-max text-red-400 font-black text-sm animate-bounce z-30 drop-shadow-md">
            {damageFeed}
          </div>
        )}

        {/* Nearby Ground Loot Pickup Floating Button */}
        {nearbyLoot && (
          <div className="absolute bottom-32 inset-x-0 mx-auto w-max z-30 animate-bounce">
            <button
              onClick={pickupNearbyLoot}
              className="px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-extrabold text-xs rounded-2xl shadow-xl flex items-center gap-2 border border-amber-300 active:scale-95"
            >
              <Box className="w-4 h-4" />
              <span>التقاط {nearbyLoot.nameAr} [F]</span>
            </button>
          </div>
        )}

        {/* Safe Zone Flash Warning */}
        {outsideZone && (
          <div className="absolute inset-0 bg-red-600/20 border-4 border-red-500 pointer-events-none animate-pulse z-20" />
        )}

        {/* Mobile Right Touch Pan Area */}
        <div
          className="absolute right-0 top-20 bottom-36 w-1/2 z-10 touch-none"
          onTouchStart={handleTouchStartRight}
          onTouchMove={handleTouchMoveRight}
        />
      </div>

      {/* Top HUD: Compass, Alive, Kills, Zone, and TPP/FPP Toggle */}
      <div className="absolute top-2 inset-x-2 z-20 flex items-center justify-between pointer-events-none">
        {/* Left: Exit & Opponent status */}
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

        {/* Center: Tactical Compass Heading */}
        <div className="bg-black/75 backdrop-blur-md px-3 py-1 rounded-xl border border-slate-700/60 text-white font-mono text-xs font-extrabold flex items-center gap-1.5">
          <Compass className="w-3.5 h-3.5 text-cyan-400" />
          <span className="text-cyan-400">{compassHeading}°</span>
          <span className="text-[10px] text-slate-400">
            {compassHeading >= 315 || compassHeading < 45 ? 'N' : compassHeading < 135 ? 'E' : compassHeading < 225 ? 'S' : 'W'}
          </span>
        </div>

        {/* Right: TPP/FPP Toggle & Zone Timer */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <button
            onClick={toggleViewMode}
            className="px-2.5 py-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-black text-xs rounded-xl border border-blue-400/40 shadow-lg flex items-center gap-1 active:scale-95"
            title="تبديل منظور الشخص الأول والثالث [V]"
          >
            <Eye className="w-3.5 h-3.5 text-cyan-300" />
            <span>{viewMode.toUpperCase()}</span>
          </button>

          <div className="bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 px-2 py-1 rounded-xl text-xs font-mono font-bold">
            ⚡ {zoneTimer}s
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center">
        <AnimatePresence>
          {damageFeed && <motion.div initial={{ opacity: 0, y: 12, scale: .8 }} animate={{ opacity: 1, y: -18, scale: 1 }} exit={{ opacity: 0, y: -42 }} className="rounded-full border border-amber-300/40 bg-[#080b11]/80 px-5 py-2 font-black tracking-wide text-amber-200 shadow-[0_0_30px_rgba(255,215,0,.25)] backdrop-blur-xl">{damageFeed}</motion.div>}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {nearbyLoot && <motion.button initial={{ opacity: 0, y: 25 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 25 }} onClick={pickupNearbyLoot} className="pointer-events-auto absolute bottom-52 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-amber-300/40 bg-[#080b11]/85 px-4 py-3 text-right shadow-[0_0_32px_rgba(255,215,0,.15)] backdrop-blur-xl"><span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-300/15 text-xl">{nearbyLoot.icon}</span><span><span className="block text-[9px] font-bold tracking-[.2em] text-amber-300">GROUND LOOT / PRESS F</span><span className="block text-sm font-black text-white">{nearbyLoot.nameAr}</span></span><span className="rounded-lg bg-amber-300 px-2 py-1 text-[10px] font-black text-slate-950">التقاط</span></motion.button>}
        {(nearbyVehicle || isVehicleMounted) && (
          <motion.button
            initial={{ opacity: 0, y: 25 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 25 }}
            onClick={toggleVehicleMount}
            className={`pointer-events-auto absolute bottom-40 left-1/2 z-30 flex -translate-x-1/2 items-center gap-3 rounded-2xl border px-4 py-2.5 text-right shadow-[0_0_32px_rgba(34,211,238,.2)] backdrop-blur-xl ${
              isVehicleMounted
                ? 'border-red-400/80 bg-red-950/90 text-red-200'
                : 'border-cyan-400/80 bg-slate-900/90 text-cyan-200'
            }`}
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-cyan-400/20 text-xl">
              {isVehicleMounted ? '🚶‍♂️' : '🛡️'}
            </span>
            <span>
              <span className="block text-[9px] font-bold tracking-widest text-amber-300">
                {isVehicleMounted ? 'MOUNTED AUTOCANNON' : 'ARMORED COMBAT VEHICLE'}
              </span>
              <span className="block text-xs font-black text-white">
                {isVehicleMounted ? 'النزول من المدرعة [F]' : 'ركوب المدفع الرشاش الثقيل [F]'}
              </span>
            </span>
            <span className="rounded-lg bg-cyan-400 px-2.5 py-1 text-[10px] font-black text-slate-950">
              {isVehicleMounted ? 'نزول' : 'ركوب'}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* Bottom HUD: Health, Armor, 3-Slot Weapons, & Touch Controls */}
      <div className="absolute bottom-2 inset-x-2 z-20 flex flex-col gap-1.5 pointer-events-auto">
        {/* Health & Armor Bars */}
        <div className="bg-slate-950/85 backdrop-blur-md p-2 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-emerald-400 flex items-center gap-1">
                <span>الصحة (HP)</span>
                {isCrouching && <span className="text-cyan-400 text-[9px] bg-cyan-950 px-1 rounded border border-cyan-800">محتمي 🛡️</span>}
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
                  style={{ width: `${armor}%` }}
                />
              </div>
            )}
          </div>

          <button
            onClick={useMedkitItem}
            disabled={medkits <= 0 || hp >= 100}
            className="px-2.5 py-1.5 bg-emerald-950/60 border border-emerald-500/40 hover:bg-emerald-800/60 disabled:opacity-40 text-emerald-300 rounded-xl flex flex-col items-center justify-center text-xs font-bold"
          >
            <span>🩹 x{medkits}</span>
            <span className="text-[9px] text-slate-400">علاج [E]</span>
          </button>
        </div>

        {/* 3-Slot Weapon Switcher Strip */}
        <div className="grid grid-cols-3 gap-1.5">
          {(['primary', 'secondary', 'sidearm'] as WeaponSlotId[]).map((slot, idx) => {
            const w = weapons[slot];
            const isCurrent = activeSlot === slot;

            return (
              <button
                key={slot}
                onClick={() => selectSlot(slot)}
                disabled={!w}
                className={`p-1.5 rounded-xl border text-right transition-all flex items-center gap-2 ${
                  isCurrent
                    ? 'bg-cyan-950/70 border-cyan-400 shadow-md scale-[1.02]'
                    : w
                    ? 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
                    : 'bg-slate-950/40 border-slate-900 opacity-40'
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-black/40 flex items-center justify-center text-base">
                  {w ? w.icon : '➕'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold text-white truncate">
                    {w ? w.name : `خانة ${idx + 1}`}
                  </div>
                  <div className="text-[9px] text-amber-400 font-mono">
                    {w ? `${w.ammoInClip}/${w.reserveAmmo}` : 'فارغ'}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Mobile Action Controls Bar */}
        <div className="bg-slate-950/90 backdrop-blur-md p-2 rounded-2xl border border-slate-800 flex items-center justify-between">
          {/* Mobile Movement Buttons (Left Joystick Alternative) */}
          <div className="grid grid-cols-3 gap-1 w-28">
            <div />
            <button
              onMouseDown={() => (keys.current['w'] = true)}
              onMouseUp={() => (keys.current['w'] = false)}
              onTouchStart={() => (keys.current['w'] = true)}
              onTouchEnd={() => (keys.current['w'] = false)}
              className="p-2 bg-slate-800 text-white rounded-lg flex items-center justify-center text-xs active:bg-cyan-600"
            >
              ⬆️
            </button>
            <div />
            <button
              onMouseDown={() => (keys.current['a'] = true)}
              onMouseUp={() => (keys.current['a'] = false)}
              onTouchStart={() => (keys.current['a'] = true)}
              onTouchEnd={() => (keys.current['a'] = false)}
              className="p-2 bg-slate-800 text-white rounded-lg flex items-center justify-center text-xs active:bg-cyan-600"
            >
              ⬅️
            </button>
            <button
              onMouseDown={() => (keys.current['s'] = true)}
              onMouseUp={() => (keys.current['s'] = false)}
              onTouchStart={() => (keys.current['s'] = true)}
              onTouchEnd={() => (keys.current['s'] = false)}
              className="p-2 bg-slate-800 text-white rounded-lg flex items-center justify-center text-xs active:bg-cyan-600"
            >
              ⬇️
            </button>
            <button
              onMouseDown={() => (keys.current['d'] = true)}
              onMouseUp={() => (keys.current['d'] = false)}
              onTouchStart={() => (keys.current['d'] = true)}
              onTouchEnd={() => (keys.current['d'] = false)}
              className="p-2 bg-slate-800 text-white rounded-lg flex items-center justify-center text-xs active:bg-cyan-600"
            >
              ➡️
            </button>
          </div>

          {/* Action Buttons: Jump, Prone, Crouch, Scope, Reload, Fire */}
          <div className="flex items-center gap-1">
            {/* Jump / Vault Button */}
            <button
              onClick={() => {
                keys.current[' '] = true;
                setTimeout(() => (keys.current[' '] = false), 160);
              }}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-700 text-xs font-bold active:bg-cyan-600 transition-all"
              title="قفز / تسلق [Space]"
            >
              🦘
            </button>

            {/* Prone Button */}
            <button
              onClick={toggleProne}
              className={`p-2 rounded-xl border text-xs font-bold transition-all ${
                locomotion === 'prone' || locomotion === 'crawl'
                  ? 'bg-amber-600 text-white border-amber-400 shadow-md'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="زحف تكتيكي [Z]"
            >
              🧎‍♂️
            </button>

            <button
              onClick={toggleCrouch}
              className={`p-2 rounded-xl border text-xs font-bold transition-all ${
                isCrouching
                  ? 'bg-cyan-600 text-white border-cyan-400 shadow-md'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="انحناء للاحتماء خلف السواتر [C]"
            >
              <Shield className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => {
                isAimingRef.current = !isAimingRef.current;
                setIsAiming(isAimingRef.current);
              }}
              className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                isAiming
                  ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="تقريب السكوب"
            >
              <Eye className="w-4 h-4" />
            </button>

            <button
              onClick={reloadActiveWeapon}
              disabled={isReloading}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold"
              title="تلقيم"
            >
              <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin text-amber-400' : ''}`} />
            </button>

            {/* Fire Button */}
            <button
              onMouseDown={() => (isFiringRef.current = true)}
              onMouseUp={() => (isFiringRef.current = false)}
              onTouchStart={() => (isFiringRef.current = true)}
              onTouchEnd={() => (isFiringRef.current = false)}
              className="px-4 py-2.5 bg-gradient-to-r from-red-600 to-amber-600 text-white font-black text-xs rounded-xl shadow-lg active:scale-95 transition-all flex items-center gap-1"
            >
              <Crosshair className="w-4 h-4" />
              <span>إطلاق 🔥</span>
            </button>
          </div>
        </div>
      </div>

      {/* Chicken Dinner / Victory Screen */}
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
                ? 'أنت الناجي الوحيد في الساحة! نصر أسطوري مستحق في عالم 3D.'
                : 'لقد أصابك قناص الخصم في ساحة المعركة. عُد للانتقام!'}
            </p>

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
              العودة للردهة
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
