import * as THREE from 'three';
import { MapId, MapMetadata, CoverObstacle3D, SafeZone3D, LootItem3D } from './types3d';

export const MAP_CATALOG: Record<MapId, MapMetadata> = {
  warehouse: {
    id: 'warehouse',
    nameAr: 'مستودع إرانغل (Erangel TDM)',
    subtitleAr: 'اشتباك سريع بين الحاويات والسيارة الحمراء',
    previewColor: 'from-blue-900 via-slate-900 to-cyan-950',
    skyColor: '#273549',
    fogColor: '#1e293b',
    descriptionAr: 'خريطة تكتيكية مركزة مستوحاة من مود المستودع في ببجي، مليئة بالسواتر وسيارات الخردة.',
    icon: '🏭'
  },
  desert: {
    id: 'desert',
    nameAr: 'أطلال ميرامار (Miramar Outpost)',
    subtitleAr: 'نزال صحراوي مفتوح بين السواتر الرملية والصخور',
    previewColor: 'from-amber-900 via-stone-900 to-yellow-950',
    skyColor: '#b45309',
    fogColor: '#78350f',
    descriptionAr: 'أجواء صحراوية حارقة مع سواتر ترابية وصخور ضخمة وقناصات AWM مبعثرة للقنص البعيد.',
    icon: '🏜️'
  },
  warzone: {
    id: 'warzone',
    nameAr: 'منطقة الحرب الكبرى (Tactical Warzone)',
    subtitleAr: 'ساحة 200×200 متر مع دبابات، خنادق، وأبراج قناصة',
    previewColor: 'from-zinc-950 via-cyan-950 to-amber-950',
    skyColor: '#17212b',
    fogColor: '#27323b',
    descriptionAr: 'ميدان عمليات واسع مليء بالسواتر القابلة للتدمير، المركبات الثقيلة، ومناطق الاشتباك المفتوحة.',
    icon: '◈'
  }
};

export function buildMapEnvironment(
  mapId: MapId, 
  scene: THREE.Scene
): {
  obstacles: CoverObstacle3D[];
  safeZone: SafeZone3D;
  lootItems: LootItem3D[];
} {
  const obstacles: CoverObstacle3D[] = [];
  const lootItems: LootItem3D[] = [];
  const meta = MAP_CATALOG[mapId];

  // 1. Atmosphere & Fog
  scene.fog = new THREE.FogExp2(mapId === 'warzone' ? '#111827' : meta.fogColor, mapId === 'warzone' ? 0.012 : 0.009);

  const hemisphereLight = new THREE.HemisphereLight(
    mapId === 'desert' ? '#fbbf24' : '#38bdf8',
    mapId === 'desert' ? '#78350f' : '#1e293b',
    0.65
  );
  scene.add(hemisphereLight);

  const ambientLight = new THREE.AmbientLight(mapId === 'desert' ? '#fef3c7' : '#94a3b8', 0.35);
  scene.add(ambientLight);

  const sunLight = new THREE.DirectionalLight(mapId === 'desert' ? '#fbbf24' : '#fffbeb', 1.8);
  sunLight.position.set(60, 100, 40);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.width = 2048;
  sunLight.shadow.mapSize.height = 2048;
  sunLight.shadow.camera.near = 1;
  sunLight.shadow.camera.far = 260;
  sunLight.shadow.camera.left = -130;
  sunLight.shadow.camera.right = 130;
  sunLight.shadow.camera.top = 130;
  sunLight.shadow.camera.bottom = -130;
  scene.add(sunLight);

  // 2. Ground Terrain — vertex-displaced for warzone to create hills & dips
  const groundSubdivs = mapId === 'warzone' ? 96 : 32;
  const groundGeo = new THREE.PlaneGeometry(350, 350, groundSubdivs, groundSubdivs);
  const groundColor = mapId === 'desert' ? '#b45309' : mapId === 'warzone' ? '#2a3320' : '#2e3828';
  const groundMat = new THREE.MeshStandardMaterial({
    color: groundColor,
    roughness: 0.95,
    metalness: 0.05
  });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Warzone terrain: displace vertices to create gentle rolling hills
  if (mapId === 'warzone') {
    const posAttr = groundGeo.getAttribute('position');
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const y = posAttr.getY(i);
      // Perlin-like noise approximation using layered sine waves
      const h = Math.sin(x * 0.035) * Math.cos(y * 0.04) * 2.5
              + Math.sin(x * 0.08 + 1.5) * Math.cos(y * 0.06 - 0.7) * 1.2
              + Math.sin(x * 0.15 + y * 0.12) * 0.5;
      // Flatten near center (road/building area) — within 20m of center axis
      const flattenFactor = Math.min(1, Math.max(0, (Math.abs(x) - 20) / 15));
      posAttr.setZ(i, h * flattenFactor);
    }
    posAttr.needsUpdate = true;
    groundGeo.computeVertexNormals();

    // Scattered rocks and dirt mounds for visual richness
    const rockMat = new THREE.MeshStandardMaterial({ color: '#4a4a40', roughness: 0.92 });
    const dirtMat = new THREE.MeshStandardMaterial({ color: '#3a3520', roughness: 1.0 });
    for (let i = 0; i < 40; i++) {
      const rx = (Math.random() - 0.5) * 260;
      const rz = (Math.random() - 0.5) * 260;
      if (Math.abs(rx) < 15) continue; // Skip road area
      const size = 0.4 + Math.random() * 1.2;
      const rock = new THREE.Mesh(
        new THREE.DodecahedronGeometry(size, 0),
        Math.random() > 0.5 ? rockMat : dirtMat
      );
      rock.position.set(rx, size * 0.3, rz);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      rock.castShadow = true;
      scene.add(rock);
    }

    // Grass tuft clusters
    const grassMat = new THREE.MeshStandardMaterial({ color: '#3a5a2a', roughness: 0.9 });
    for (let i = 0; i < 60; i++) {
      const gx = (Math.random() - 0.5) * 240;
      const gz = (Math.random() - 0.5) * 240;
      if (Math.abs(gx) < 12) continue;
      const tuft = new THREE.Mesh(
        new THREE.ConeGeometry(0.15 + Math.random() * 0.2, 0.6 + Math.random() * 0.4, 4),
        grassMat
      );
      tuft.position.set(gx, 0.2, gz);
      scene.add(tuft);
    }
  }


  if (mapId === 'warehouse') {
    // ==================== E R A N G E L   W A R E H O U S E ====================
    // 3D Red Car (PUBG Image Replica)
    const carGroup = create3DCar('#991b1b');
    carGroup.position.set(-6, 0, 8);
    carGroup.rotation.y = 0.4;
    scene.add(carGroup);
    obstacles.push({ mesh: carGroup, box: new THREE.Box3().setFromObject(carGroup), type: 'car' });

    // Low Concrete Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: '#78716c', roughness: 0.9 });
    const wallMesh = new THREE.Mesh(new THREE.BoxGeometry(18, 1.1, 0.45), wallMat);
    wallMesh.position.set(0, 0.55, 15);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    scene.add(wallMesh);
    obstacles.push({ mesh: wallMesh, box: new THREE.Box3().setFromObject(wallMesh), type: 'building' });

    // Central Military Warehouse
    const houseGroup = new THREE.Group();
    const houseMain = new THREE.Mesh(new THREE.BoxGeometry(14, 5.0, 10), new THREE.MeshStandardMaterial({ color: '#cbd5e1', roughness: 0.8 }));
    houseMain.position.y = 2.5;
    houseMain.castShadow = true;
    houseGroup.add(houseMain);

    const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(9.0, 3.0, 4), new THREE.MeshStandardMaterial({ color: '#c2410c', roughness: 0.6 }));
    roofMesh.position.y = 6.2;
    roofMesh.rotation.y = Math.PI / 4;
    roofMesh.castShadow = true;
    houseGroup.add(roofMesh);

    houseGroup.position.set(14, 0, -18);
    scene.add(houseGroup);
    obstacles.push({ mesh: houseGroup, box: new THREE.Box3().setFromObject(houseGroup), type: 'building' });

    // Containers (Blue & Red)
    [
      { x: -18, z: -10, rot: 0.2, color: '#1e3a8a' },
      { x: -14, z: -16, rot: -0.1, color: '#991b1b' },
      { x: 18, z: 12, rot: 0.5, color: '#15803d' },
      { x: 22, z: 6, rot: 0.4, color: '#d97706' }
    ].forEach((cc) => {
      const crateMesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 6.0), new THREE.MeshStandardMaterial({ color: cc.color, roughness: 0.4, metalness: 0.5 }));
      crateMesh.position.set(cc.x, 1.3, cc.z);
      crateMesh.rotation.y = cc.rot;
      crateMesh.castShadow = true;
      scene.add(crateMesh);
      obstacles.push({ mesh: crateMesh, box: new THREE.Box3().setFromObject(crateMesh), type: 'crate' });
    });

  } else {
    // ==================== M I R A M A R   D E S E R T ====================
    // Abandoned Military Jeep (Desert Camo)
    const jeepGroup = create3DCar('#78350f');
    jeepGroup.position.set(-8, 0, 10);
    jeepGroup.rotation.y = -0.3;
    scene.add(jeepGroup);
    obstacles.push({ mesh: jeepGroup, box: new THREE.Box3().setFromObject(jeepGroup), type: 'car' });

    // Sandbag Bunkers (Waist-High Cover)
    const sandbagMat = new THREE.MeshStandardMaterial({ color: '#d97706', roughness: 0.95 });
    [-1, 1].forEach((dir) => {
      const sandbag = new THREE.Mesh(new THREE.BoxGeometry(12, 1.1, 0.8), sandbagMat);
      sandbag.position.set(dir * 12, 0.55, dir * 14);
      sandbag.rotation.y = dir * 0.4;
      sandbag.castShadow = true;
      scene.add(sandbag);
      obstacles.push({ mesh: sandbag, box: new THREE.Box3().setFromObject(sandbag), type: 'building' });
    });

    // Adobe Desert Ruins
    const ruinsGroup = new THREE.Group();
    const wall1 = new THREE.Mesh(new THREE.BoxGeometry(16, 4.0, 0.8), new THREE.MeshStandardMaterial({ color: '#ca8a04', roughness: 0.9 }));
    wall1.position.set(0, 2.0, 0);
    wall1.castShadow = true;
    ruinsGroup.add(wall1);

    const wall2 = new THREE.Mesh(new THREE.BoxGeometry(0.8, 4.0, 12), new THREE.MeshStandardMaterial({ color: '#ca8a04', roughness: 0.9 }));
    wall2.position.set(8, 2.0, 6);
    wall2.castShadow = true;
    ruinsGroup.add(wall2);

    ruinsGroup.position.set(16, 0, -16);
    scene.add(ruinsGroup);
    obstacles.push({ mesh: ruinsGroup, box: new THREE.Box3().setFromObject(ruinsGroup), type: 'building' });

    // Desert Rock Boulders
    [
      { x: -22, z: 20, r: 3.2 },
      { x: -25, z: -15, r: 2.8 },
      { x: 26, z: 24, r: 3.5 },
      { x: 4, z: -28, r: 3.0 }
    ].forEach((rc) => {
      const rockMat = new THREE.MeshStandardMaterial({ color: '#713f12', roughness: 0.9 });
      const rockMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(rc.r, 1), rockMat);
      rockMesh.position.set(rc.x, rc.r * 0.8, rc.z);
      rockMesh.castShadow = true;
      scene.add(rockMesh);
      obstacles.push({ mesh: rockMesh, box: new THREE.Box3().setFromObject(rockMesh), type: 'rock' });
    });
  }

  if (mapId === 'warzone') {
    const battlefieldMat = new THREE.MeshStandardMaterial({ color: '#3f4644', roughness: 0.92, metalness: 0.08 });
    const steelMat = new THREE.MeshStandardMaterial({ color: '#172126', roughness: 0.7, metalness: 0.65 });
    const roadMat = new THREE.MeshStandardMaterial({ color: '#202728', roughness: 0.96 });
    const road = new THREE.Mesh(new THREE.BoxGeometry(16, 0.08, 190), roadMat);
    road.position.set(0, 0.04, 0);
    road.receiveShadow = true;
    scene.add(road);

    // Broken center line and solid shoulders make the route readable at gameplay scale.
    for (let z = -86; z <= 86; z += 12) {
      const dash = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 5), new THREE.MeshStandardMaterial({ color: '#fbbf24', roughness: 0.8 }));
      dash.position.set(0, 0.1, z);
      scene.add(dash);
    }
    [-7.3, 7.3].forEach((x) => {
      const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.025, 188), new THREE.MeshStandardMaterial({ color: '#e2e8f0', roughness: 0.85 }));
      shoulder.position.set(x, 0.1, 0);
      scene.add(shoulder);
    });

    // Reinforced depot with an open central bay, rafters, columns, and roof panels.
    const depot = new THREE.Group();
    const concrete = new THREE.MeshStandardMaterial({ color: '#687276', roughness: 0.9 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(36, 0.28, 24), concrete);
    slab.position.y = 0.14;
    depot.add(slab);
    [-17, 17].forEach((x) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7, 22), concrete);
      wall.position.set(x, 3.5, 0);
      depot.add(wall);
    });
    [-10, 10].forEach((z) => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(34, 7, 0.7), concrete);
      wall.position.set(0, 3.5, z);
      depot.add(wall);
    });
    [-16, 16].forEach((x) => [-10, 10].forEach((z) => {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.7, 8, 0.7), steelMat);
      beam.position.set(x, 4, z);
      depot.add(beam);
    }));
    for (let x = -14; x <= 14; x += 4) {
      const rafter = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 21), steelMat);
      rafter.position.set(x, 7.4, 0);
      rafter.rotation.x = x % 8 === 0 ? 0.12 : -0.12;
      depot.add(rafter);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(36, 0.25, 24), new THREE.MeshStandardMaterial({ color: '#334155', roughness: 0.75, metalness: 0.5 }));
    roof.position.y = 8;
    roof.rotation.z = 0.04;
    depot.add(roof);
    depot.position.set(25, 0, -28);
    depot.traverse((child) => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
    scene.add(depot);
    obstacles.push({ mesh: depot, box: new THREE.Box3(new THREE.Vector3(7, 0, -40), new THREE.Vector3(43, 7, -18)), type: 'building' });

    // Tactical ridges, trenches, and container stacks.
    [-54, -28, 28, 54].forEach((x) => {
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(8, 1.8, 150), battlefieldMat);
      ridge.position.set(x, 0.9, 0);
      ridge.castShadow = true;
      ridge.receiveShadow = true;
      scene.add(ridge);
      obstacles.push({ mesh: ridge, box: new THREE.Box3().setFromObject(ridge), type: 'building' });
    });
    [-70, -35, 35, 70].forEach((z) => {
      const trench = new THREE.Mesh(new THREE.BoxGeometry(150, 0.7, 2.4), new THREE.MeshStandardMaterial({ color: '#242b28', roughness: 1 }));
      trench.position.set(0, -0.2, z);
      scene.add(trench);
      const wall = new THREE.Mesh(new THREE.BoxGeometry(150, 0.9, 0.45), battlefieldMat);
      wall.position.set(0, 0.45, z + 1.5);
      wall.castShadow = true;
      scene.add(wall);
      obstacles.push({ mesh: wall, box: new THREE.Box3().setFromObject(wall), type: 'building' });
    });
    [[-22, -6, '#1e3a8a'], [-18, -12, '#c2410c'], [20, 12, '#1e3a8a'], [25, 8, '#c2410c']].forEach(([x, z, color]) => {
      const container = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.2, 12), new THREE.MeshStandardMaterial({ color: color as string, roughness: 0.55, metalness: 0.45 }));
      container.position.set(x as number, 1.6, z as number);
      container.castShadow = true;
      scene.add(container);
      obstacles.push({ mesh: container, box: new THREE.Box3().setFromObject(container), type: 'crate' });
    });

    // Four elevated watchtowers with steel legs, decks, railings, and climbing ladders.
    [[-38, -32], [38, -32], [-38, 32], [38, 32]].forEach(([x, z]) => {
      const tower = new THREE.Group();
      [-1, 1].forEach((dx) => [-1, 1].forEach((dz) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.28, 10, 0.28), steelMat);
        leg.position.set(dx * 2.3, 5, dz * 2.3);
        leg.rotation.z = -dx * 0.08;
        tower.add(leg);
      }));
      const platform = new THREE.Mesh(new THREE.BoxGeometry(6, 0.35, 6), steelMat);
      platform.position.y = 9.8;
      tower.add(platform);
      [-2.8, 2.8].forEach((v) => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.2, 6), steelMat);
        rail.position.set(v, 10.5, 0);
        tower.add(rail);
      });
      // Climbing ladder rungs on North face (player can climb up to snipe!)
      for (let ly = 0.5; ly < 9.8; ly += 0.45) {
        const rung = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: '#f59e0b', roughness: 0.5, metalness: 0.7 }));
        rung.position.set(0, ly, 2.35);
        tower.add(rung);
      }
      tower.position.set(x, 0, z);
      tower.traverse((child) => { if (child instanceof THREE.Mesh) child.castShadow = true; });
      scene.add(tower);
      obstacles.push({ mesh: tower, box: new THREE.Box3().setFromObject(tower), type: 'building' });
    });

    // South Armory Compound (Provides tactical cover and exploration at South Base)
    const armory = new THREE.Group();
    const armoryBase = new THREE.Mesh(new THREE.BoxGeometry(28, 0.28, 20), concrete);
    armoryBase.position.y = 0.14;
    armory.add(armoryBase);
    [-13, 13].forEach((x) => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5.5, 18), concrete);
      w.position.set(x, 2.75, 0);
      armory.add(w);
    });
    [-9, 9].forEach((z) => {
      const w = new THREE.Mesh(new THREE.BoxGeometry(26, 5.5, 0.6), concrete);
      w.position.set(0, 2.75, z);
      armory.add(w);
    });
    const armoryRoof = new THREE.Mesh(new THREE.BoxGeometry(29, 0.3, 21), new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.7, metalness: 0.5 }));
    armoryRoof.position.y = 5.7;
    armory.add(armoryRoof);
    armory.position.set(-28, 0, 48);
    armory.traverse((child) => { if (child instanceof THREE.Mesh) { child.castShadow = true; child.receiveShadow = true; } });
    scene.add(armory);
    obstacles.push({ mesh: armory, box: new THREE.Box3(new THREE.Vector3(-44, 0, 36), new THREE.Vector3(-12, 6, 60)), type: 'building' });

    // Armed Combat Technical Vehicle (With Mounted Dual Autocannon Turret)
    const combatTruck = create3DCombatTechnical('#1e3a5f');
    combatTruck.position.set(0, 0, 12);
    scene.add(combatTruck);
    obstacles.push({ mesh: combatTruck, box: new THREE.Box3().setFromObject(combatTruck), type: 'car' });

    // Tactical Armored Vehicles as Heavy Roadside Cover
    const jeepSouth = create3DCar('#1e3a8a');
    jeepSouth.position.set(-5, 0, 26);
    jeepSouth.rotation.y = 0.35;
    scene.add(jeepSouth);
    obstacles.push({ mesh: jeepSouth, box: new THREE.Box3().setFromObject(jeepSouth), type: 'car' });

    const jeepNorth = create3DCar('#78350f');
    jeepNorth.position.set(8, 0, -18);
    jeepNorth.rotation.y = -0.4;
    scene.add(jeepNorth);
    obstacles.push({ mesh: jeepNorth, box: new THREE.Box3().setFromObject(jeepNorth), type: 'car' });

    // Destroyed 2-Story Building Ruins (West side — provides multi-level cover)
    const ruins = new THREE.Group();
    const ruinMat = new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: 0.95 });
    // Standing walls
    const rw1 = new THREE.Mesh(new THREE.BoxGeometry(12, 6, 0.6), ruinMat);
    rw1.position.set(0, 3, -5); rw1.castShadow = true; ruins.add(rw1);
    const rw2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 6, 10), ruinMat);
    rw2.position.set(-5.7, 3, 0); rw2.castShadow = true; ruins.add(rw2);
    // Collapsed wall section (angled debris)
    const rw3 = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.6), ruinMat);
    rw3.position.set(2, 1.5, 4.5); rw3.rotation.x = 0.4; rw3.castShadow = true; ruins.add(rw3);
    // Floor slab at 2nd story height (sniper perch)
    const rFloor = new THREE.Mesh(new THREE.BoxGeometry(11, 0.25, 9), ruinMat);
    rFloor.position.y = 5.8; rFloor.castShadow = true; ruins.add(rFloor);
    // Rubble pile
    for (let ri = 0; ri < 8; ri++) {
      const rubble = new THREE.Mesh(
        new THREE.BoxGeometry(0.8 + Math.random(), 0.5 + Math.random() * 0.8, 0.8 + Math.random()),
        ruinMat
      );
      rubble.position.set((Math.random() - 0.5) * 8, Math.random() * 0.6, (Math.random() - 0.5) * 6);
      rubble.rotation.set(Math.random(), Math.random(), Math.random());
      ruins.add(rubble);
    }
    ruins.position.set(-50, 0, 0);
    ruins.traverse((c) => { if (c instanceof THREE.Mesh) c.castShadow = true; });
    scene.add(ruins);
    obstacles.push({ mesh: ruins, box: new THREE.Box3(new THREE.Vector3(-58, 0, -6), new THREE.Vector3(-42, 6, 6)), type: 'building' });

    // Sandbag Emplacements — circular defensive positions
    [[-15, 45], [15, -45], [40, 15], [-40, -15]].forEach(([sx, sz]) => {
      const sandbagGroup = new THREE.Group();
      const sbMat = new THREE.MeshStandardMaterial({ color: '#8b7355', roughness: 0.98 });
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        const bag = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.9, 0.7), sbMat);
        bag.position.set(Math.cos(a) * 3, 0.45, Math.sin(a) * 3);
        bag.rotation.y = a;
        bag.castShadow = true;
        sandbagGroup.add(bag);
      }
      sandbagGroup.position.set(sx, 0, sz);
      scene.add(sandbagGroup);
      obstacles.push({ mesh: sandbagGroup, box: new THREE.Box3().setFromObject(sandbagGroup), type: 'building' });
    });

    // Underground Bunker Entrance (East side — half-buried concrete structure)
    const bunker = new THREE.Group();
    const bunkerMat = new THREE.MeshStandardMaterial({ color: '#4b5563', roughness: 0.92 });
    const bRoof = new THREE.Mesh(new THREE.BoxGeometry(10, 0.5, 8), bunkerMat);
    bRoof.position.set(0, 1.8, 0); bRoof.castShadow = true; bunker.add(bRoof);
    [-4.5, 4.5].forEach(x => {
      const bWall = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 7), bunkerMat);
      bWall.position.set(x, 0.9, 0); bWall.castShadow = true; bunker.add(bWall);
    });
    // Entrance opening — no back wall for gameplay flow
    const bBack = new THREE.Mesh(new THREE.BoxGeometry(9, 2.2, 0.5), bunkerMat);
    bBack.position.set(0, 0.9, -3.5); bBack.castShadow = true; bunker.add(bBack);
    // Dirt mound over top
    const bDirt = new THREE.Mesh(new THREE.BoxGeometry(12, 1.5, 10), new THREE.MeshStandardMaterial({ color: '#3a3520', roughness: 1 }));
    bDirt.position.set(0, 2.5, 0); bDirt.castShadow = true; bunker.add(bDirt);
    bunker.position.set(50, -0.5, 15);
    scene.add(bunker);
    obstacles.push({ mesh: bunker, box: new THREE.Box3().setFromObject(bunker), type: 'building' });

    // More scattered trees across the map (not just perimeter)
    const pinePositions = [
      [-65, 45], [-60, 65], [-45, 80], [45, 75], [65, 55],
      [-65, -45], [-55, -68], [-40, -82], [45, -75], [65, -55],
      [-75, 0], [75, 0], [-2, 85], [2, -85],
      // Interior scattered trees for cover
      [-30, 20], [30, -20], [-20, -35], [20, 35],
      [-45, 10], [45, -10], [-10, 60], [10, -60],
      [-55, 30], [55, -30], [-35, -55], [35, 55]
    ];
    pinePositions.forEach(([px, pz]) => {
      const tree = createPineTree();
      tree.position.set(px, 0, pz);
      scene.add(tree);
      obstacles.push({ mesh: tree, box: new THREE.Box3().setFromObject(tree), type: 'tree' });
    });
  }


  // 3. 3D Ground Loot Generation (AWM Sniper, Shotgun, Ammo, Medkits)
  const lootConfigs: Array<{
    id: string;
    type: 'weapon' | 'ammo' | 'medkit';
    weaponType?: 'ak47' | 'awm' | 'shotgun' | 'rpg';
    nameAr: string;
    icon: string;
    color: string;
    pos: THREE.Vector3;
  }> = mapId === 'warzone' ? [
    { id: 'loot-rpg-1', type: 'weapon', weaponType: 'rpg', nameAr: 'قاذف صواريخ RPG-7 (بازوكا)', icon: '🚀', color: '#ea580c', pos: new THREE.Vector3(0, 0.4, -4) }, // Center Highway near depot
    { id: 'loot-rpg-2', type: 'weapon', weaponType: 'rpg', nameAr: 'قاذف صواريخ RPG-7 (بازوكا)', icon: '🚀', color: '#ea580c', pos: new THREE.Vector3(-38, 10.2, 32) }, // Sniper watchtower roof
    { id: 'loot-awm-1', type: 'weapon', weaponType: 'awm', nameAr: 'قناصة AWM الأسطورية', icon: '🎯', color: '#10b981', pos: new THREE.Vector3(38, 10.2, -32) }, // At top of watchtower!
    { id: 'loot-awm-2', type: 'weapon', weaponType: 'awm', nameAr: 'قناصة AWM الأسطورية', icon: '🎯', color: '#10b981', pos: new THREE.Vector3(-25, 0.4, 48) }, // Inside South Armory
    { id: 'loot-shotgun-1', type: 'weapon', weaponType: 'shotgun', nameAr: 'شوزن قتالي S1897', icon: '💥', color: '#ef4444', pos: new THREE.Vector3(25, 0.4, -28) }, // Inside North Depot
    { id: 'loot-shotgun-2', type: 'weapon', weaponType: 'shotgun', nameAr: 'شوزن قتالي S1897', icon: '💥', color: '#ef4444', pos: new THREE.Vector3(-4, 0.4, 18) }, // Near South Jeep
    { id: 'loot-ammo-1', type: 'ammo', nameAr: 'ذخيرة ثقيلة (+60)', icon: '⚡', color: '#f59e0b', pos: new THREE.Vector3(0, 0.3, 0) }, // Center Highway
    { id: 'loot-ammo-2', type: 'ammo', nameAr: 'ذخيرة ثقيلة (+60)', icon: '⚡', color: '#f59e0b', pos: new THREE.Vector3(-28, 0.3, 52) },
    { id: 'loot-med-1', type: 'medkit', nameAr: 'حقيبة إسعاف (Medkit)', icon: '🩹', color: '#06b6d4', pos: new THREE.Vector3(10, 0.3, -22) },
    { id: 'loot-med-2', type: 'medkit', nameAr: 'حقيبة إسعاف (Medkit)', icon: '🩹', color: '#06b6d4', pos: new THREE.Vector3(-38, 10.2, 32) }
  ] : [
    { id: 'loot-rpg', type: 'weapon', weaponType: 'rpg', nameAr: 'قاذف صواريخ RPG-7 (بازوكا)', icon: '🚀', color: '#ea580c', pos: new THREE.Vector3(0, 0.4, 0) },
    { id: 'loot-awm', type: 'weapon', weaponType: 'awm', nameAr: 'قناصة AWM الأسطورية', icon: '🎯', color: '#10b981', pos: new THREE.Vector3(12, 0.4, -14) },
    { id: 'loot-shotgun', type: 'weapon', weaponType: 'shotgun', nameAr: 'شوزن قتالي S1897', icon: '💥', color: '#ef4444', pos: new THREE.Vector3(-14, 0.4, -6) },
    { id: 'loot-ammo-1', type: 'ammo', nameAr: 'ذخيرة ثقيلة (+60)', icon: '⚡', color: '#f59e0b', pos: new THREE.Vector3(0, 0.3, 12) },
    { id: 'loot-med-1', type: 'medkit', nameAr: 'حقيبة إسعاف (Medkit)', icon: '🩹', color: '#06b6d4', pos: new THREE.Vector3(-4, 0.3, 6) }
  ];

  lootConfigs.forEach((lc) => {
    const lootGroup = new THREE.Group();
    // Glowing ring on floor
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.6, 0.8, 16),
      new THREE.MeshBasicMaterial({ color: lc.color, side: THREE.DoubleSide })
    );
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.05;
    lootGroup.add(ringMesh);

    if (lc.weaponType === 'rpg') {
      // 3D Realistic RPG-7 Model on Ground
      const tube = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8),
        new THREE.MeshStandardMaterial({ color: '#27272a', roughness: 0.6, metalness: 0.7 })
      );
      tube.rotation.z = Math.PI / 2;
      tube.position.y = 0.22;
      tube.castShadow = true;
      lootGroup.add(tube);

      const warhead = new THREE.Mesh(
        new THREE.ConeGeometry(0.18, 0.38, 8),
        new THREE.MeshStandardMaterial({ color: '#ea580c', roughness: 0.4, metalness: 0.5 })
      );
      warhead.rotation.z = -Math.PI / 2;
      warhead.position.set(0.72, 0.22, 0);
      warhead.castShadow = true;
      lootGroup.add(warhead);
    } else {
      // Floating 3D Weapon/Box representation
      const boxMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.3, 0.4),
        new THREE.MeshStandardMaterial({ color: lc.color, roughness: 0.3, metalness: 0.7 })
      );
      boxMesh.position.y = 0.35;
      boxMesh.castShadow = true;
      lootGroup.add(boxMesh);
    }

    lootGroup.position.copy(lc.pos);
    scene.add(lootGroup);

    lootItems.push({
      id: lc.id,
      type: lc.type,
      weaponType: lc.weaponType,
      nameAr: lc.nameAr,
      icon: lc.icon,
      mesh: lootGroup,
      pos: lc.pos,
      isCollected: false
    });
  });

  // 4. Shrinking 3D Safe Zone
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
    targetRadius: 16,
    shrinkSpeed: 1.8,
    mesh: zoneMesh
  };

  return { obstacles, safeZone, lootItems };
}

// 3D Armed Combat Technical / Gun Truck Helper
export function create3DCombatTechnical(color: string): THREE.Group {
  const truck = new THREE.Group();
  const armorMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.5 });
  const darkSteel = new THREE.MeshStandardMaterial({ color: '#1e293b', roughness: 0.4, metalness: 0.8 });

  // Lower chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.75, 5.2), armorMat);
  chassis.position.y = 0.8;
  chassis.castShadow = true;
  truck.add(chassis);

  // Front cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.95, 2.2), armorMat);
  cabin.position.set(0, 1.65, 0.8);
  cabin.castShadow = true;
  truck.add(cabin);

  // Windshield armored slit
  const slit = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.35, 0.1), darkSteel);
  slit.position.set(0, 1.75, 1.92);
  truck.add(slit);

  // Front Heavy Bullbar / Ram
  const bullbar = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.8, 0.4), darkSteel);
  bullbar.position.set(0, 0.85, 2.7);
  bullbar.castShadow = true;
  truck.add(bullbar);

  // Rear Flatbed side walls
  [-1.2, 1.2].forEach(x => {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.7, 2.4), darkSteel);
    wall.position.set(x, 1.4, -1.3);
    truck.add(wall);
  });

  // Heavy Gunner Tripod & Turret
  const turretMount = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 0.9, 8), darkSteel);
  turretMount.position.set(0, 1.65, -1.3);
  truck.add(turretMount);

  // Gunner Armor Shield Plate
  const shieldPlate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.08), darkSteel);
  shieldPlate.position.set(0, 2.15, -1.05);
  truck.add(shieldPlate);

  // Dual Heavy Autocannon Barrels
  const barrelMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.3, metalness: 0.9 });
  [-0.14, 0.14].forEach(bx => {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), barrelMat);
    b.rotation.x = Math.PI / 2;
    b.position.set(bx, 2.15, -0.3);
    truck.add(b);
  });

  // 4 Heavy All-Terrain Tires
  const tireGeo = new THREE.CylinderGeometry(0.55, 0.55, 0.45, 16);
  const tireMat = new THREE.MeshStandardMaterial({ color: '#09090b', roughness: 0.9 });
  [
    { x: -1.35, z: 1.6 },
    { x: 1.35, z: 1.6 },
    { x: -1.35, z: -1.6 },
    { x: 1.35, z: -1.6 }
  ].forEach(tp => {
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.z = Math.PI / 2;
    tire.position.set(tp.x, 0.55, tp.z);
    tire.castShadow = true;
    truck.add(tire);
  });

  truck.userData = { isCombatVehicle: true, vehicleType: 'technical', maxArmor: 250, armor: 250 };
  return truck;
}

// 3D Car Helper
function create3DCar(color: string): THREE.Group {
  const carGroup = new THREE.Group();
  const carMat = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.6 });

  // Chassis
  const bodyMesh = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 4.6), carMat);
  bodyMesh.position.y = 0.7;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  carGroup.add(bodyMesh);

  // Cabin
  const cabinMesh = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.75, 2.4), carMat);
  cabinMesh.position.set(0, 1.4, -0.2);
  cabinMesh.castShadow = true;
  carGroup.add(cabinMesh);

  // Windshield
  const glassMat = new THREE.MeshStandardMaterial({ color: '#0f172a', roughness: 0.1, metalness: 0.9 });
  const frontGlass = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.6, 0.1), glassMat);
  frontGlass.position.set(0, 1.35, 0.95);
  frontGlass.rotation.x = 0.25;
  carGroup.add(frontGlass);

  // 4 Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.45, 0.45, 0.35, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: '#18181b', roughness: 0.8 });
  [
    { x: -1.2, z: 1.4 },
    { x: 1.2, z: 1.4 },
    { x: -1.2, z: -1.4 },
    { x: 1.2, z: -1.4 }
  ].forEach((wp) => {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wp.x, 0.45, wp.z);
    wheel.castShadow = true;
    carGroup.add(wheel);
  });

  return carGroup;
}

// 3D Pine Tree Helper
function createPineTree(): THREE.Group {
  const treeGroup = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: '#451a03', roughness: 0.9 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.45, 3.2, 8), trunkMat);
  trunk.position.y = 1.6;
  trunk.castShadow = true;
  treeGroup.add(trunk);

  const foliageMat = new THREE.MeshStandardMaterial({ color: '#14532d', roughness: 0.8 });
  const f1 = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 8), foliageMat);
  f1.position.y = 3.8;
  f1.castShadow = true;
  treeGroup.add(f1);

  const f2 = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.8, 8), foliageMat);
  f2.position.y = 5.6;
  f2.castShadow = true;
  treeGroup.add(f2);

  const f3 = new THREE.Mesh(new THREE.ConeGeometry(1.4, 2.2, 8), foliageMat);
  f3.position.y = 7.1;
  f3.castShadow = true;
  treeGroup.add(f3);

  return treeGroup;
}

