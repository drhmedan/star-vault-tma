import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import confetti from 'canvas-confetti';
import { 
  ArrowLeft, Crosshair, Shield, RefreshCw, Radio, 
  Share2, Trophy, Skull, Eye, ChevronUp
} from 'lucide-react';
import { UserProfile } from '../types';
import { buildBattlefieldWorld, createSoldierMesh } from '../game3d/worldBuilder';
import { CoverObstacle3D, SafeZone3D } from '../game3d/types3d';
import { multiplayer, ConnectionStatus } from '../services/multiplayer';
import { sound } from '../audio/soundEngine';

interface Pubg3DArenaProps {
  user: UserProfile;
  roomCode: string;
  mode: 'host' | 'join' | 'ai';
  stakeStars: number;
  onExit: () => void;
  onMatchComplete: (won: boolean, trophiesDelta: number, dustDelta: number, starsDelta: number) => void;
}

export const Pubg3DArena: React.FC<Pubg3DArenaProps> = ({
  user,
  roomCode,
  mode,
  stakeStars,
  onExit,
  onMatchComplete
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>('connecting');
  const [opponentName, setOpponentName] = useState<string>(mode === 'ai' ? 'بوت تكتيكي (3D AI)' : 'في انتظار الخصم...');
  const [gameOver, setGameOver] = useState<'victory' | 'defeat' | null>(null);
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // HUD States
  const [hp, setHp] = useState<number>(100);
  const [armor, setArmor] = useState<number>(50);
  const [ammoClip, setAmmoClip] = useState<number>(30);
  const [ammoReserve, setAmmoReserve] = useState<number>(90);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [isCrouching, setIsCrouching] = useState<boolean>(false);
  const [isAiming, setIsAiming] = useState<boolean>(false);
  const [kills, setKills] = useState<number>(0);
  const [zoneTimer, setZoneTimer] = useState<number>(40);
  const [outsideZone, setOutsideZone] = useState<boolean>(false);
  const [compassHeading, setCompassHeading] = useState<number>(0);
  const [medkits, setMedkits] = useState<number>(2);

  // Game Refs
  const playerPosRef = useRef<THREE.Vector3>(new THREE.Vector3(-4, 0, 11)); // Start behind the red car!
  const playerVelRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const playerAnglesRef = useRef<{ yaw: number; pitch: number }>({ yaw: Math.PI, pitch: 0 }); // Look towards compound
  const isCrouchedRef = useRef<boolean>(false);
  const isAimingRef = useRef<boolean>(false);
  const isFiringRef = useRef<boolean>(false);
  const lastFireTimeRef = useRef<number>(0);

  const opponentPosRef = useRef<THREE.Vector3>(new THREE.Vector3(12, 0, -8));
  const opponentHpRef = useRef<number>(100);
  const opponentMeshRef = useRef<ReturnType<typeof createSoldierMesh> | null>(null);

  // Keyboard controls map
  const keys = useRef<{ [k: string]: boolean }>({});

  // 1. Networking Sync
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
              if (s.isCrouching) {
                opponentMeshRef.current.torso.position.y = 0.85;
              } else {
                opponentMeshRef.current.torso.position.y = 1.25;
              }
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

  // 2. Zone Timer countdown
  useEffect(() => {
    const timer = setInterval(() => {
      setZoneTimer(t => (t <= 1 ? 35 : t - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // 3. MAIN THREE.JS 3D SCENE & ENGINE LOOP
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Renderer
    const width = container.clientWidth || 400;
    const height = container.clientHeight || 550;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#384c68'); // Battlefield overcast sky

    // Build World (3D Red Car, Compound, Crates, Trees, Safe Zone)
    const { obstacles, safeZone } = buildBattlefieldWorld(scene);

    // Camera
    const camera = new THREE.PerspectiveCamera(65, width / height, 0.1, 400);

    // 3D Player & Opponent Avatars
    const playerSoldier = createSoldierMesh(false);
    scene.add(playerSoldier.root);

    const opponentSoldier = createSoldierMesh(true);
    opponentSoldier.root.position.copy(opponentPosRef.current);
    scene.add(opponentSoldier.root);
    opponentMeshRef.current = opponentSoldier;

    // Raycaster for shooting & cover detection
    const raycaster = new THREE.Raycaster();

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Controls: Keyboard
    const onKeyDown = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === 'c') {
        toggleCrouch();
      } else if (e.key.toLowerCase() === 'r') {
        reloadWeapon();
      } else if (e.key.toLowerCase() === 'e') {
        useMedkitItem();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.current[e.key.toLowerCase()] = false;
    };

    // Pointer Lock Mouse Controls
    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement) return;
      const sensitivity = 0.0022;
      playerAnglesRef.current.yaw -= e.movementX * sensitivity;
      playerAnglesRef.current.pitch -= e.movementY * sensitivity;

      // Clamp pitch (-60 to +60 degrees)
      playerAnglesRef.current.pitch = Math.max(-1.1, Math.min(1.1, playerAnglesRef.current.pitch));

      // Update Compass Heading
      const deg = Math.round(((-playerAnglesRef.current.yaw * 180) / Math.PI) % 360);
      setCompassHeading(deg < 0 ? deg + 360 : deg);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        // Shoot
        isFiringRef.current = true;
        triggerShoot(camera, scene, obstacles, opponentSoldier);
      } else if (e.button === 2) {
        // ADS Scope Zoom
        e.preventDefault();
        isAimingRef.current = true;
        setIsAiming(true);
      }
    };

    const onMouseUp = (e: MouseEvent) => {
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

    // Lock Pointer on click
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

      // 1. Move Player in Camera Direction
      const moveSpeed = isCrouchedRef.current ? 2.8 : 5.8;
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

      // Jump Physics
      if (keys.current[' '] && pos.y <= 0.05 && !isCrouchedRef.current) {
        vel.y = 5.2;
      }
      vel.y -= 15.0 * delta; // Gravity
      pos.y += vel.y * delta;
      if (pos.y < 0) {
        pos.y = 0;
        vel.y = 0;
      }

      // Clamp to map boundary (350x350)
      pos.x = Math.max(-160, Math.min(160, pos.x));
      pos.z = Math.max(-160, Math.min(160, pos.z));

      // 2. Obstacle Collisions (Simple Cylinder vs Box collision)
      obstacles.forEach(obs => {
        const playerBox = new THREE.Box3(
          new THREE.Vector3(pos.x - 0.4, pos.y, pos.z - 0.4),
          new THREE.Vector3(pos.x + 0.4, pos.y + 1.8, pos.z + 0.4)
        );
        if (obs.box.intersectsBox(playerBox)) {
          // Push back
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

      // 4. Third-Person Over-the-Shoulder Camera Positioning
      const crouchOffset = isCrouchedRef.current ? -0.4 : 0;
      const aimZoom = isAimingRef.current ? 0.5 : 1.0;

      // Base offset behind player's right shoulder (PUBG style)
      const camOffset = new THREE.Vector3(
        0.65 * aimZoom,
        (1.8 + crouchOffset) * aimZoom,
        -3.2 * aimZoom
      );

      // Rotate offset by Yaw and Pitch
      camOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), pitch * 0.4);
      camOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);

      camera.position.copy(pos).add(camOffset);

      // Camera looks at target point ahead through crosshair
      const targetLook = new THREE.Vector3(
        pos.x - Math.sin(yaw) * 40,
        pos.y + 1.7 + crouchOffset + Math.sin(pitch) * 40,
        pos.z - Math.cos(yaw) * 40
      );
      camera.lookAt(targetLook);

      // Scope FOV Zoom
      camera.fov = isAimingRef.current ? 38 : 65;
      camera.updateProjectionMatrix();

      // 5. Update Shrinking Safe Zone 3D
      if (safeZone.radius > safeZone.targetRadius) {
        safeZone.radius -= safeZone.shrinkSpeed * delta;
        safeZone.mesh.scale.set(safeZone.radius / 75, 1, safeZone.radius / 75);
      }

      const distFromCenter = Math.hypot(pos.x, pos.z);
      const isOut = distFromCenter > safeZone.radius;
      setOutsideZone(isOut);

      const now = Date.now();
      if (isOut && now - lastZoneDamage > 1000) {
        lastZoneDamage = now;
        takeDamage(6);
      }

      // 6. AI Opponent Logic in Solo Mode
      if (mode === 'ai' && opponentHpRef.current > 0) {
        const oppPos = opponentPosRef.current;
        const distToPlayer = oppPos.distanceTo(pos);

        // Turn towards player
        const targetAngle = Math.atan2(pos.x - oppPos.x, pos.z - oppPos.z);
        opponentSoldier.root.rotation.y = targetAngle;

        // Move towards player or take cover behind compound
        if (distToPlayer > 18) {
          oppPos.x += Math.sin(targetAngle) * 2.8 * delta;
          oppPos.z += Math.cos(targetAngle) * 2.8 * delta;
          opponentSoldier.root.position.copy(oppPos);
        }

        // AI fires if within 40 meters
        if (distToPlayer < 45 && now - opponentSoldier.root.userData.lastFireTime > 380) {
          opponentSoldier.root.userData.lastFireTime = now;
          opponentSoldier.muzzleLight.intensity = 3;
          setTimeout(() => (opponentSoldier.muzzleLight.intensity = 0), 50);
          sound.playGunshot('ak47');

          // Check hit on player
          if (Math.random() < 0.45 && !isCrouchedRef.current) {
            takeDamage(14);
          }
        }
      }

      // 7. Network State Broadcast (every 45ms)
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
  }, []);

  // Shoot Action (3D Raycasting)
  const triggerShoot = (
    camera: THREE.Camera, 
    scene: THREE.Scene, 
    obstacles: CoverObstacle3D[],
    oppSoldier: ReturnType<typeof createSoldierMesh>
  ) => {
    if (isReloading || ammoClip <= 0) {
      if (ammoClip <= 0) reloadWeapon();
      return;
    }

    const now = Date.now();
    if (now - lastFireTimeRef.current < 115) return; // AK-47 fire rate
    lastFireTimeRef.current = now;

    setAmmoClip(a => a - 1);
    sound.playGunshot('ak47');

    // Muzzle flash on player
    // Raycast from camera center
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    // Intersect objects
    const targets = [oppSoldier.head, oppSoldier.torso, ...obstacles.map(o => o.mesh)];
    const intersects = raycaster.intersectObjects(targets, true);

    if (intersects.length > 0) {
      const hit = intersects[0];

      // Create spark light on hit point
      const spark = new THREE.PointLight('#f59e0b', 3, 2);
      spark.position.copy(hit.point);
      scene.add(spark);
      setTimeout(() => scene.remove(spark), 120);

      // Check if enemy hit
      if (hit.object === oppSoldier.head) {
        // HEADSHOT! 🎯
        sound.playExplosion();
        damageOpponent(75, true);
      } else if (hit.object === oppSoldier.torso || oppSoldier.root.getObjectById(hit.object.id)) {
        damageOpponent(35, false);
      }
    }

    // Sync shoot to peer
    multiplayer.sendShootBullets([{ weaponType: 'ak47' }]);
  };

  const damageOpponent = (dmg: number, isHeadshot: boolean) => {
    opponentHpRef.current = Math.max(0, opponentHpRef.current - dmg);
    multiplayer.sendBulletHit(999999, dmg, 'ak47');

    if (opponentHpRef.current <= 0) {
      setKills(k => k + 1);
      handleVictory();
    }
  };

  const takeDamage = (dmg: number) => {
    sound.playHurt();
    setHp(prevHp => {
      let currentArmor = armor;
      let newHp = prevHp;

      if (currentArmor > 0) {
        const absorbed = Math.min(currentArmor, Math.round(dmg * 0.6));
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
    isCrouchedRef.current = !isCrouchedRef.current;
    setIsCrouching(isCrouchedRef.current);
    sound.playPickup();
  };

  const reloadWeapon = () => {
    if (isReloading || ammoClip === 30 || ammoReserve <= 0) return;
    setIsReloading(true);
    sound.playReload();

    setTimeout(() => {
      const needed = 30 - ammoClip;
      const reloadAmt = Math.min(needed, ammoReserve);
      setAmmoClip(c => c + reloadAmt);
      setAmmoReserve(r => r - reloadAmt);
      setIsReloading(false);
    }, 2000);
  };

  const useMedkitItem = () => {
    if (medkits <= 0 || hp >= 100) return;
    sound.playPickup();
    setMedkits(m => m - 1);
    setHp(h => Math.min(100, h + 50));
  };

  const handleVictory = () => {
    if (gameOver) return;
    setGameOver('victory');
    sound.playReveal('mythic');
    confetti({ particleCount: 120, spread: 90, origin: { y: 0.5 } });
    multiplayer.sendGameOver(user.id);
    const starReward = stakeStars > 0 ? Math.floor(stakeStars * 1.8) : 0;
    onMatchComplete(true, 50, 200, starReward);
  };

  const handleDefeat = () => {
    if (gameOver) return;
    setGameOver('defeat');
    sound.playClick();
    onMatchComplete(false, -20, 30, 0);
  };

  // Mobile Touch Controls
  const handleTouchMoveJoystick = (dir: 'forward' | 'back' | 'left' | 'right', active: boolean) => {
    const map = { forward: 'w', back: 's', left: 'a', right: 'd' };
    keys.current[map[dir]] = active;
  };

  return (
    <div className="relative w-full h-[660px] max-w-md mx-auto bg-slate-950 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl flex flex-col select-none">
      {/* 3D WebGL Canvas Container */}
      <div 
        ref={mountRef} 
        className="w-full h-full relative cursor-crosshair overflow-hidden"
      >
        {/* Click to lock mouse banner for PC */}
        {!isLocked && (
          <div className="absolute top-16 inset-x-0 mx-auto w-max bg-black/75 backdrop-blur-md px-4 py-1.5 rounded-full border border-slate-700/60 text-white text-xs font-bold pointer-events-none z-30 animate-pulse">
            🖱️ انقر بالماوس لقفل الكاميرا والتصويب بحرية
          </div>
        )}

        {/* Center Crosshair (PUBG Tactical Reticle) */}
        <div className="absolute inset-0 m-auto w-7 h-7 pointer-events-none flex items-center justify-center z-10">
          <div className={`w-1.5 h-1.5 rounded-full bg-cyan-400 ${isAiming ? 'scale-75' : ''}`} />
          <div className="absolute top-0 w-0.5 h-2 bg-cyan-400/80" />
          <div className="absolute bottom-0 w-0.5 h-2 bg-cyan-400/80" />
          <div className="absolute left-0 w-2 h-0.5 bg-cyan-400/80" />
          <div className="absolute right-0 w-2 h-0.5 bg-cyan-400/80" />
        </div>

        {/* Outside Zone Flash Warning */}
        {outsideZone && (
          <div className="absolute inset-0 bg-red-600/20 border-4 border-red-500 pointer-events-none animate-pulse z-20" />
        )}
      </div>

      {/* Top HUD: PUBG Style Compass, Alive & Zone */}
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
          <div className="bg-slate-900/80 backdrop-blur-md px-3 py-1 rounded-xl border border-slate-700/60 flex items-center gap-1.5">
            <Radio className={`w-3.5 h-3.5 ${connStatus === 'connected' ? 'text-emerald-400 animate-pulse' : 'text-amber-400'}`} />
            <span className="text-xs font-bold text-white">{opponentName}</span>
          </div>
        </div>

        {/* Center: Tactical Compass Heading Tape */}
        <div className="bg-black/70 backdrop-blur-md px-4 py-1 rounded-xl border border-slate-700/60 text-white font-mono text-xs font-extrabold flex items-center gap-2">
          <span className="text-cyan-400">{compassHeading}°</span>
          <span className="text-[10px] text-slate-400">
            {compassHeading >= 315 || compassHeading < 45 ? 'N' : compassHeading < 135 ? 'E' : compassHeading < 225 ? 'S' : 'W'}
          </span>
        </div>

        {/* Right: Alive, Kills, & Zone Timer */}
        <div className="flex items-center gap-1.5 pointer-events-auto">
          <div className="bg-black/70 backdrop-blur-md px-2.5 py-1 rounded-xl border border-slate-700/60 flex items-center gap-2 text-xs">
            <span className="text-emerald-400 font-extrabold">2 أحياء</span>
            <span className="w-[1px] h-3 bg-slate-700" />
            <span className="text-red-400 font-bold flex items-center gap-0.5">
              <Skull className="w-3 h-3" /> {kills}
            </span>
          </div>
          <div className="bg-cyan-950/70 border border-cyan-500/40 text-cyan-300 px-2.5 py-1 rounded-xl text-xs font-mono font-bold">
            ⚡ {zoneTimer}s
          </div>
        </div>
      </div>

      {/* Bottom HUD: Health, Armor, Ammo, Crouch, Scope Controls */}
      <div className="absolute bottom-3 inset-x-3 z-20 flex flex-col gap-2 pointer-events-auto">
        {/* Health & Armor Bars */}
        <div className="bg-slate-950/85 backdrop-blur-md p-2 rounded-2xl border border-slate-800 flex items-center justify-between gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex items-center justify-between text-[10px] font-bold">
              <span className="text-emerald-400 flex items-center gap-1">
                <span>الصحة (HP)</span>
                {isCrouching && <span className="text-cyan-400 text-[9px] bg-cyan-950 px-1 rounded border border-cyan-800">محتمي خلف الساتر</span>}
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
            className="px-3 py-2 bg-emerald-950/60 border border-emerald-500/40 hover:bg-emerald-800/60 disabled:opacity-40 text-emerald-300 rounded-xl flex flex-col items-center justify-center text-xs font-bold"
          >
            <span>🩹 x{medkits}</span>
            <span className="text-[9px] text-slate-400">علاج [E]</span>
          </button>
        </div>

        {/* Tactical Controls & Mobile Action Bar */}
        <div className="bg-slate-950/90 backdrop-blur-md p-2 rounded-2xl border border-slate-800 flex items-center justify-between">
          {/* Weapon Ammo Display */}
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-xl bg-slate-900 border border-slate-700 flex items-center justify-center text-2xl shadow-inner">
              ⚡
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1">
                <span>AK-47 كلاشينكوف</span>
                {isReloading && <span className="text-[9px] text-amber-400 animate-pulse">تلقيم...</span>}
              </div>
              <div className="text-sm font-black text-amber-400 font-mono">
                {ammoClip} <span className="text-xs text-slate-500">/ {ammoReserve}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons: Crouch, ADS Scope, Reload, Fire */}
          <div className="flex items-center gap-1.5">
            {/* Crouch Button */}
            <button
              onClick={toggleCrouch}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition-all ${
                isCrouching
                  ? 'bg-cyan-600 text-white border-cyan-400 shadow-md scale-105'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
              title="انحناء للاحتماء خلف السيارة أو الساتر"
            >
              <Shield className="w-4 h-4" />
              <span>{isCrouching ? 'وقوف' : 'انحناء [C]'}</span>
            </button>

            {/* ADS Scope Zoom Button */}
            <button
              onClick={() => {
                isAimingRef.current = !isAimingRef.current;
                setIsAiming(isAimingRef.current);
              }}
              className={`p-2.5 rounded-xl border text-xs font-bold flex items-center gap-1 transition-all ${
                isAiming
                  ? 'bg-purple-600 text-white border-purple-400 shadow-md'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              <Eye className="w-4 h-4" />
              <span>سكوب</span>
            </button>

            {/* Reload Button */}
            <button
              onClick={reloadWeapon}
              disabled={isReloading}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold"
            >
              <RefreshCw className={`w-4 h-4 ${isReloading ? 'animate-spin text-amber-400' : ''}`} />
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
