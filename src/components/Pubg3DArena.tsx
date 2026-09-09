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
  mapId = 'warehouse',
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

  // Game Coordinates & Physics Refs (Distant Tactical Spawns: South Base vs North Outpost)
  const playerPosRef = useRef<THREE.Vector3>(new THREE.Vector3(-25, 0, 50));
  const playerVelRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const playerAnglesRef = useRef<{ yaw: number; pitch: number }>({ yaw: 0, pitch: 0 });
  const isCrouchedRef = useRef<boolean>(false);
  const isAimingRef = useRef<boolean>(false);
  const isFiringRef = useRef<boolean>(false);
  const lastFireTimeRef = useRef<number>(0);

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

      // 1. Tactical locomotion: sprint, crouch, prone/crawl, and vault impulse.
      const moving = Boolean(keys.current['w'] || keys.current['a'] || keys.current['s'] || keys.current['d']);
      const isProne = proneRef.current;
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

      // Vault/climb impulse uses the same grounded kinematics and stays collision-safe.
      if (isVaulting) {
        lastJumpRef.current = Date.now();
        vel.y = 5.8;
        keys.current[' '] = false;
        setLocomotion('vault');
      }
      if (isProne) vel.y = 0;
      else if (keys.current[' '] && pos.y <= 0.05 && !isCrouchedRef.current) vel.y = 5.2;
      vel.y -= 15.0 * delta;
      pos.y += vel.y * delta;
      if (pos.y < 0) {
        pos.y = 0;
        vel.y = 0;
      }

      pos.x = Math.max(-160, Math.min(160, pos.x));
      pos.z = Math.max(-160, Math.min(160, pos.z));

      // 2. Obstacle Collision Resolution
      obstacles.forEach(obs => {
        const playerBox = new THREE.Box3(
          new THREE.Vector3(pos.x - 0.45, pos.y, pos.z - 0.45),
          new THREE.Vector3(pos.x + 0.45, pos.y + 1.8, pos.z + 0.45)
        );
        if (obs.box.intersectsBox(playerBox)) {
          const center = new THREE.Vector3();
          obs.box.getCenter(center);
          const push = pos.clone().sub(center).setY(0).normalize().multiplyScalar(0.08);
          pos.add(push);
        }
      });

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

      // 7. Tactical AI Opponent Simulation (Aggressive Hunting, Flanking, Animated Limbs & Tracer Firing)
      if (mode === 'ai' && opponentHpRef.current > 0) {
        const oppPos = opponentPosRef.current;
        const dist = oppPos.distanceTo(pos);
        const targetAngle = Math.atan2(pos.x - oppPos.x, pos.z - oppPos.z);
        
        // Smooth rotation to aim at player
        opponentSoldier.root.rotation.y = THREE.MathUtils.lerp(
          opponentSoldier.root.rotation.y,
          targetAngle,
          Math.min(1, delta * 12)
        );

        // Tactical Movement: Hunt -> Strafe -> Circle
        let aiSpeed = 5.2;
        if (dist > 35) {
          // Hunt & Sprint across map
          aiSpeed = 6.2;
          oppPos.x += Math.sin(targetAngle) * aiSpeed * delta;
          oppPos.z += Math.cos(targetAngle) * aiSpeed * delta;
        } else if (dist > 12) {
          // Combat Strafe & Flank
          aiSpeed = 4.5;
          const strafeAngle = targetAngle + Math.sin(clock.elapsedTime * 2.8) * 1.1;
          oppPos.x += Math.sin(strafeAngle) * aiSpeed * delta;
          oppPos.z += Math.cos(strafeAngle) * aiSpeed * delta;
        } else {
          // Close quarters aggressive circle
          aiSpeed = 4.8;
          const circleAngle = targetAngle + Math.PI / 2;
          oppPos.x += Math.sin(circleAngle) * aiSpeed * delta;
          oppPos.z += Math.cos(circleAngle) * aiSpeed * delta;
        }

        // Clamp inside arena bounds
        oppPos.x = Math.max(-140, Math.min(140, oppPos.x));
        oppPos.z = Math.max(-140, Math.min(140, oppPos.z));
        opponentSoldier.root.position.copy(oppPos);

        // Animate AI Bot limbs (Gait Stride) so it moves like a real soldier
        const oppRig = opponentSoldier.rig;
        if (oppRig) {
          const aiGait = clock.elapsedTime * 11;
          const aiStride = Math.sin(aiGait) * 0.48;
          const aiStrideOpposite = Math.sin(aiGait + Math.PI) * 0.48;
          oppRig.leftLeg.rotation.x = aiStride;
          oppRig.rightLeg.rotation.x = aiStrideOpposite;
          oppRig.leftArm.rotation.x = -0.2 - aiStrideOpposite * 0.3;
          oppRig.rightArm.rotation.x = -0.2 - aiStride * 0.3;
        }

        // Tactical AI Firing (Bursts every 340ms when within 65m)
        if (!opponentSoldier.root.userData.lastFireTime) {
          opponentSoldier.root.userData.lastFireTime = now;
        }

        if (dist < 65 && now - opponentSoldier.root.userData.lastFireTime > 340) {
          opponentSoldier.root.userData.lastFireTime = now;

          // Muzzle Flash
          opponentSoldier.muzzleLight.intensity = 5;
          setTimeout(() => (opponentSoldier.muzzleLight.intensity = 0), 60);
          sound.playGunshot('ak47');

          // Visible Red Bullet Tracer from AI to Player
          const aiMuzzlePos = oppPos.clone().add(new THREE.Vector3(0, 1.3, 0));
          const aimTarget = pos.clone().add(new THREE.Vector3(
            (Math.random() - 0.5) * (isCrouchedRef.current ? 1.8 : 0.8),
            isCrouchedRef.current ? 0.6 : 1.2,
            (Math.random() - 0.5) * (isCrouchedRef.current ? 1.8 : 0.8)
          ));
          const tracerGeo = new THREE.BufferGeometry().setFromPoints([aiMuzzlePos, aimTarget]);
          const tracerMat = new THREE.LineBasicMaterial({ color: '#f87171', transparent: true, opacity: 0.95 });
          const aiTracer = new THREE.Line(tracerGeo, tracerMat);
          scene.add(aiTracer);
          setTimeout(() => {
            scene.remove(aiTracer);
            tracerGeo.dispose();
            tracerMat.dispose();
          }, 90);

          // Calculate Damage with crouch protection
          const hitChance = isCrouchedRef.current ? 0.22 : 0.48;
          if (Math.random() < hitChance) {
            takeDamage(Math.floor(Math.random() * 8 + 12));
          }
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
      const newGun: WeaponSlotState = nearbyLoot.weaponType === 'awm' ? {
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

  // Shoot Action (3D Raycasting Hitbox Detection)
  const triggerShoot = (
    camera: THREE.Camera, 
    scene: THREE.Scene, 
    obstacles: CoverObstacle3D[],
    oppSoldier: ReturnType<typeof createSoldierMesh>
  ) => {
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

    sound.playGunshot(curWeapon.weaponType);
    tgHaptics.impact(curWeapon.weaponType === 'awm' ? 'heavy' : 'medium');

    // 3D Raycasting from crosshair center
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const targets = [oppSoldier.head, oppSoldier.torso, ...obstacles.map(o => o.mesh)];
    const intersects = raycaster.intersectObjects(targets, true);
    const hitPoint = intersects[0]?.point ?? raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(120));
    const tracerGeometry = new THREE.BufferGeometry().setFromPoints([raycaster.ray.origin.clone(), hitPoint]);
    const tracerMaterial = new THREE.LineBasicMaterial({ color: curWeapon.weaponType === 'awm' ? '#fbbf24' : '#67e8f9', transparent: true, opacity: 0.9 });
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

      // Impact light
      const spark = new THREE.PointLight('#f59e0b', 3, 2);
      spark.position.copy(hit.point);
      scene.add(spark);
      setTimeout(() => scene.remove(spark), 120);

      // Check hit target
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
    sound.playHurt();
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

          {/* Action Buttons: Crouch, Scope, Reload, Fire */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={toggleCrouch}
              className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                isCrouching
                  ? 'bg-cyan-600 text-white border-cyan-400 shadow-md'
                  : 'bg-slate-800 text-slate-300 border-slate-700'
              }`}
              title="انحناء للاحتماء خلف السيارة"
            >
              <Shield className="w-4 h-4" />
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
