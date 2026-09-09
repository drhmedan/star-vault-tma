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

// Build a lightweight segmented tactical operator. Named pivots expose the rig to the 60 FPS animation loop.
export function createSoldierMesh(isEnemy: boolean = false): {
  root: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Mesh;
  gun: THREE.Mesh;
  muzzleLight: THREE.PointLight;
  rig: { leftLeg: THREE.Group; rightLeg: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group; recoil: THREE.Group };
} {
  const root = new THREE.Group();
  const accent = isEnemy ? '#f43f5e' : '#22d3ee';
  const camo = isEnemy ? '#5b2930' : '#243746';
  const dark = new THREE.MeshStandardMaterial({ color: '#111827', roughness: 0.72 });
  const fabric = new THREE.MeshStandardMaterial({ color: camo, roughness: 0.9 });
  const accentMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.4, metalness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: '#9be7ef', emissive: '#075985', emissiveIntensity: 0.35, metalness: 0.8, roughness: 0.12 });
  const add = (mesh: THREE.Mesh, parent: THREE.Object3D = root) => { mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh; };
  const box = (size: [number, number, number], material: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  const torso = add(box([0.72, 0.82, 0.44], dark)); torso.position.y = 1.23;
  const plate = add(box([0.58, 0.52, 0.08], accentMat)); plate.position.set(0, 1.28, 0.25);
  for (let i = -1; i <= 1; i++) { const pouch = add(box([0.16, 0.18, 0.12], dark)); pouch.position.set(i * 0.19, 1.02, 0.28); const mag = add(box([0.07, 0.12, 0.04], accentMat)); mag.position.set(i * 0.19, 1.12, 0.34); }
  const shoulder = add(box([0.9, 0.12, 0.28], fabric)); shoulder.position.y = 1.58;
  const pack = add(box([0.62, 0.76, 0.32], fabric)); pack.position.set(0, 1.25, -0.36);
  const roll = add(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.72, 10), dark)); roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.72, -0.37);
  for (const x of [-0.28, 0.28]) { const strap = add(box([0.06, 0.64, 0.05], accentMat)); strap.position.set(x, 1.28, -0.55); }

  const head = add(new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), fabric)); head.position.y = 1.96;
  const helmet = add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), dark)); helmet.position.y = 2.03;
  const goggles = add(box([0.34, 0.09, 0.055], glass)); goggles.position.set(0, 1.95, 0.22);
  const nvg = add(box([0.08, 0.16, 0.08], accentMat)); nvg.position.set(0, 2.08, 0.27);
  const antenna = add(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.55, 6), accentMat)); antenna.position.set(0.42, 1.7, 0); antenna.rotation.z = -0.18;

  const leftLeg = new THREE.Group(); const rightLeg = new THREE.Group(); leftLeg.position.set(-0.2, 0.82, 0); rightLeg.position.set(0.2, 0.82, 0); root.add(leftLeg, rightLeg);
  for (const [pivot, x] of [[leftLeg, -0.2], [rightLeg, 0.2]] as const) { const thigh = add(box([0.25, 0.68, 0.28], fabric), pivot); thigh.position.y = -0.34; const knee = add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), dark), pivot); knee.position.set(0, -0.7, 0.02); const boot = add(box([0.3, 0.22, 0.46], dark), pivot); boot.position.set(0, -0.92, 0.08); }
  const leftArm = new THREE.Group(); const rightArm = new THREE.Group(); leftArm.position.set(-0.48, 1.5, 0.03); rightArm.position.set(0.48, 1.5, 0.03); root.add(leftArm, rightArm);
  for (const arm of [leftArm, rightArm]) { const upper = add(box([0.2, 0.48, 0.22], fabric), arm); upper.position.y = -0.25; const elbow = add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), dark), arm); elbow.position.y = -0.53; const glove = add(box([0.22, 0.2, 0.25], dark), arm); glove.position.y = -0.72; }

  const recoil = new THREE.Group(); root.add(recoil); const gunMat = new THREE.MeshStandardMaterial({ color: '#0b1120', roughness: 0.28, metalness: 0.82 });
  const receiver = add(box([0.13, 0.15, 0.7], gunMat), recoil); receiver.position.set(0, 0, 0.35);
  const barrel = add(new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.8, 10), gunMat), recoil); barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, 1.05);
  const gasTube = add(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 8), accentMat), recoil); gasTube.rotation.x = Math.PI / 2; gasTube.position.set(0, 0.1, 0.55);
  const magazine = add(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.3, 10), fabric), recoil); magazine.position.set(0, -0.2, 0.28); magazine.rotation.x = 0.28;
  const stock = add(box([0.18, 0.16, 0.42], fabric), recoil); stock.position.set(0, 0, -0.25);
  const optic = add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 10), glass), recoil); optic.rotation.x = Math.PI / 2; optic.position.set(0, 0.14, 0.3);
  recoil.position.set(0.28, 1.28, 0.45);
  const muzzleLight = new THREE.PointLight('#fef08a', 0, 8); muzzleLight.position.set(0.28, 1.28, 1.75); root.add(muzzleLight);
  return { root, torso, head, gun: receiver, muzzleLight, rig: { leftLeg, rightLeg, leftArm, rightArm, recoil } };
}
