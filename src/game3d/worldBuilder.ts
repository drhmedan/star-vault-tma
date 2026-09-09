import * as THREE from 'three';
import { CoverObstacle3D, SafeZone3D } from './types3d';

export function buildBattlefieldWorld(scene: THREE.Scene): {
  obstacles: CoverObstacle3D[];
  safeZone: SafeZone3D;
  ground: THREE.Mesh;
} {
  const obstacles: CoverObstacle3D[] = [];

  // 1. Lighting Setup (Atmospheric Sunlight + Ambient + Fog)
  scene.fog = new THREE.FogExp2('#1e293b', 0.008);

  const ambientLight = new THREE.AmbientLight('#94a3b8', 0.85);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight('#fffbeb', 1.6);
  sunLight.position.set(60, 100, 40);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 1024;
  sunLight.shadow.mapSize.height = 1024;
  sunLight.shadow.camera.near = 10;
  sunLight.shadow.camera.far = 250;
  sunLight.shadow.camera.left = -80;
  sunLight.shadow.camera.right = 80;
  sunLight.shadow.camera.top = 80;
  sunLight.shadow.camera.bottom = -80;
  scene.add(sunLight);

  // 2. Ground Terrain (Ground Plane with Grid & Military Grass/Dirt Shader)
  const groundGeo = new THREE.PlaneGeometry(350, 350, 32, 32);
  const groundMat = new THREE.MeshStandardMaterial({
    color: '#2e3828', // Tactical Olive/Earth
    roughness: 0.9,
    metalness: 0.1
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Grid helper for tactical distance perception
  const grid = new THREE.GridHelper(350, 70, '#475569', '#334155');
  grid.position.y = 0.02;
  scene.add(grid);

  // 3. THE 3D RED CAR (Exact match to the PUBG image uploaded by user!)
  const carGroup = new THREE.Group();
  
  // Lower chassis
  const bodyGeo = new THREE.BoxGeometry(2.4, 0.7, 4.6);
  const redCarMat = new THREE.MeshStandardMaterial({ color: '#991b1b', roughness: 0.35, metalness: 0.6 });
  const bodyMesh = new THREE.Mesh(bodyGeo, redCarMat);
  bodyMesh.position.y = 0.7;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  carGroup.add(bodyMesh);

  // Cabin / Roof
  const cabinGeo = new THREE.BoxGeometry(2.1, 0.75, 2.4);
  const cabinMesh = new THREE.Mesh(cabinGeo, redCarMat);
  cabinMesh.position.set(0, 1.4, -0.2);
  cabinMesh.castShadow = true;
  carGroup.add(cabinMesh);

  // Windshield & Windows
  const glassMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.1, metalness: 0.9 });
  const frontGlassGeo = new THREE.BoxGeometry(2.0, 0.6, 0.1);
  const frontGlass = new THREE.Mesh(frontGlassGeo, glassMat);
  frontGlass.position.set(0, 1.35, 0.95);
  frontGlass.rotation.x = 0.25;
  carGroup.add(frontGlass);

  // 4 Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.8 });
  const wheelPositions = [
    { x: -1.2, z: 1.4 },
    { x: 1.2, z: 1.4 },
    { x: -1.2, z: -1.4 },
    { x: 1.2, z: -1.4 }
  ];
  wheelPositions.forEach(wp => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wp.x, 0.45, wp.z);
    wheel.castShadow = true;
    carGroup.add(wheel);
  });

  carGroup.position.set(-6, 0, 8);
  carGroup.rotation.y = 0.4;
  scene.add(carGroup);

  const carBox = new THREE.Box3().setFromObject(carGroup);
  obstacles.push({ mesh: carGroup, box: carBox, type: 'car' });

  // 4. Low Concrete Perimeter Wall (Waist-High for Crouch Cover behind car)
  const wallMat = new THREE.MeshStandardMaterial({ color: '#78716c', roughness: 0.9 });
  const wallGeo = new THREE.BoxGeometry(16, 1.1, 0.4);
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.position.set(0, 0.55, 15);
  wallMesh.castShadow = true;
  wallMesh.receiveShadow = true;
  scene.add(wallMesh);
  obstacles.push({ mesh: wallMesh, box: new THREE.Box3().setFromObject(wallMesh), type: 'building' });

  // 5. 3D House / Military Compound (Beige Walls + Orange Tiled Roof)
  const houseGroup = new THREE.Group();
  // Walls
  const houseWallMat = new THREE.MeshStandardMaterial({ color: '#e7e5e4', roughness: 0.8 });
  const houseMain = new THREE.Mesh(new THREE.BoxGeometry(10, 4.5, 8), houseWallMat);
  houseMain.position.y = 2.25;
  houseMain.castShadow = true;
  houseMain.receiveShadow = true;
  houseGroup.add(houseMain);

  // Roof (Pyramid / Wedge)
  const roofGeo = new THREE.ConeGeometry(7.5, 2.5, 4);
  const roofMat = new THREE.MeshStandardMaterial({ color: '#c2410c', roughness: 0.6 });
  const roofMesh = new THREE.Mesh(roofGeo, roofMat);
  roofMesh.position.y = 5.6;
  roofMesh.rotation.y = Math.PI / 4;
  roofMesh.castShadow = true;
  houseGroup.add(roofMesh);

  houseGroup.position.set(12, 0, -18);
  scene.add(houseGroup);
  obstacles.push({ mesh: houseGroup, box: new THREE.Box3().setFromObject(houseGroup), type: 'building' });

  // 6. Tactical Shipping Containers (Blue & Red)
  const crateConfigs = [
    { x: -18, z: -10, rot: 0.2, color: '#1e3a8a' },
    { x: -14, z: -16, rot: -0.1, color: '#991b1b' },
    { x: 18, z: 12, rot: 0.5, color: '#15803d' },
    { x: 22, z: 6, rot: 0.4, color: '#d97706' }
  ];

  crateConfigs.forEach((cc, idx) => {
    const crateMat = new THREE.MeshStandardMaterial({ color: cc.color, roughness: 0.4, metalness: 0.5 });
    const crateMesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 6.0), crateMat);
    crateMesh.position.set(cc.x, 1.3, cc.z);
    crateMesh.rotation.y = cc.rot;
    crateMesh.castShadow = true;
    crateMesh.receiveShadow = true;
    scene.add(crateMesh);
    obstacles.push({ mesh: crateMesh, box: new THREE.Box3().setFromObject(crateMesh), type: 'crate' });
  });

  // 7. Trees & Bushes
  const treePositions = [
    { x: -25, z: 15 },
    { x: -30, z: -20 },
    { x: 28, z: -32 },
    { x: 32, z: 25 },
    { x: -5, z: -35 },
    { x: 8, z: 32 }
  ];

  treePositions.forEach(tp => {
    const treeGroup = new THREE.Group();
    // Trunk
    const trunkMat = new THREE.MeshStandardMaterial({ color: '#543d2b', roughness: 0.9 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 3.5, 8), trunkMat);
    trunk.position.y = 1.75;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    // Foliage
    const foliageMat = new THREE.MeshStandardMaterial({ color: '#1e3a1e', roughness: 0.7 });
    const f1 = new THREE.Mesh(new THREE.ConeGeometry(2.8, 3.5, 8), foliageMat);
    f1.position.y = 4.2;
    f1.castShadow = true;
    treeGroup.add(f1);

    const f2 = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3.0, 8), foliageMat);
    f2.position.y = 6.0;
    f2.castShadow = true;
    treeGroup.add(f2);

    treeGroup.position.set(tp.x, 0, tp.z);
    scene.add(treeGroup);
    obstacles.push({ mesh: treeGroup, box: new THREE.Box3().setFromObject(treeGroup), type: 'tree' });
  });

  // 8. 3D Shrinking Blue Safe Zone Cylinder
  const zoneGeo = new THREE.CylinderGeometry(75, 75, 40, 48, 1, true);
  const zoneMat = new THREE.MeshBasicMaterial({
    color: '#06b6d4',
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide
  });
  const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
  zoneMesh.position.set(0, 20, 0);
  scene.add(zoneMesh);

  const safeZone: SafeZone3D = {
    center: new THREE.Vector2(0, 0),
    radius: 75,
    targetRadius: 15,
    shrinkSpeed: 1.8,
    mesh: zoneMesh
  };

  return { obstacles, safeZone, ground };
}

// Build 3D Soldier Model (Torso, Helmet, Backpack, Arms, Gun)
export function createSoldierMesh(isEnemy: boolean = false): {
  root: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  gun: THREE.Mesh;
  muzzleLight: THREE.PointLight;
} {
  const root = new THREE.Group();

  // Color theme
  const suitColor = isEnemy ? '#991b1b' : '#0284c7';
  const vestColor = '#1e293b';
  const skinColor = '#e2b596';

  // 1. Torso with Tactical Vest
  const torsoGeo = new THREE.BoxGeometry(0.7, 0.9, 0.45);
  const torsoMat = new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.7 });
  const torso = new THREE.Mesh(torsoGeo, torsoMat);
  torso.position.y = 1.25;
  torso.castShadow = true;
  root.add(torso);

  // 2. Tactical Backpack (Military Ruck)
  const packGeo = new THREE.BoxGeometry(0.55, 0.7, 0.35);
  const packMat = new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.9 });
  const pack = new THREE.Mesh(packGeo, packMat);
  pack.position.set(0, 1.3, -0.32);
  pack.castShadow = true;
  root.add(pack);

  // 3. Head & Military Helmet (L3 Spetsnaz / Military pot helmet)
  const headGeo = new THREE.SphereGeometry(0.24, 16, 16);
  const headMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.5 });
  const head = new THREE.Mesh(headGeo, headMat);
  head.position.y = 1.95;
  head.castShadow = true;
  root.add(head);

  // Helmet shell
  const helmetGeo = new THREE.SphereGeometry(0.26, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.6);
  const helmetMat = new THREE.MeshStandardMaterial({ color: isEnemy ? '#7f1d1d' : '#0369a1', roughness: 0.4, metalness: 0.3 });
  const helmet = new THREE.Mesh(helmetGeo, helmetMat);
  helmet.position.y = 1.98;
  helmet.castShadow = true;
  root.add(helmet);

  // 4. Legs
  const legMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.8 });
  const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.3), legMat);
  leftLeg.position.set(-0.2, 0.4, 0);
  leftLeg.castShadow = true;
  root.add(leftLeg);

  const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.8, 0.3), legMat);
  rightLeg.position.set(0.2, 0.4, 0);
  rightLeg.castShadow = true;
  root.add(rightLeg);

  // 5. 3D Assault Rifle (Held pointing forward)
  const gunGroup = new THREE.Group();
  const gunMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.3, metalness: 0.8 });
  
  // Barrel & Receiver
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.9), gunMat);
  receiver.castShadow = true;
  gunGroup.add(receiver);

  // Magazine
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.12), gunMat);
  mag.position.set(0, -0.15, 0.1);
  mag.rotation.x = 0.2;
  gunGroup.add(mag);

  // Scope / Sight
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), gunMat);
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.12, 0.05);
  gunGroup.add(scope);

  gunGroup.position.set(0.35, 1.25, 0.55);
  root.add(gunGroup);

  // 6. Muzzle Flash Light
  const muzzleLight = new THREE.PointLight('#fef08a', 0, 8);
  muzzleLight.position.set(0.35, 1.25, 1.1);
  root.add(muzzleLight);

  return { root, torso, head, gun: receiver, muzzleLight };
}
