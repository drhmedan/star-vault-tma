import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  MapId, MapMetadata, MapEnvironment, CoverObstacle3D,
  SafeZone3D, LootItem3D, WeaponType, GrenadeType
} from './types3d';

// ============================================================
// Star Vault — Tactical Warzone Map Builder (100% procedural).
// Layered-noise terrain, vertex-colored ground, roads, river,
// craters, full building set, instanced vegetation, atmosphere.
// Static geometry is merged per-material and vegetation is
// instanced to keep draw calls low on mobile GPUs.
// ============================================================

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MAP_CATALOG: Record<MapId, MapMetadata> = {
  warehouse: {
    id: 'warehouse',
    nameAr: 'مستودع إرانغل (Erangel TDM)',
    subtitleAr: 'اشتباك سريع بين الحاويات والسيارات',
    previewColor: 'from-blue-900 via-slate-900 to-cyan-950',
    skyColor: '#33415c',
    fogColor: '#2a3448',
    fogDensity: 0.016,
    descriptionAr: 'خريطة تكتيكية مركزة للاشتباك القريب، مليئة بالسواتر والحاويات.',
    icon: '🏭',
    theme: 'dusk',
    sunColor: '#ffd9a0',
    ambientColor: '#7d8aa8',
    hemisphereSky: '#5f7bb0',
    hemisphereGround: '#2a2f38',
    sunElevation: 34,
    sunAzimuth: 40,
    groundBase: '#3a4250',
    groundRock: '#5a5344',
    groundSand: '#6a6354',
    groundGrass: '#3c4636'
  },
  desert: {
    id: 'desert',
    nameAr: 'أطلال ميرامار (Miramar Outpost)',
    subtitleAr: 'نزال صحراوي مفتوح بين الصخور والأطلال',
    previewColor: 'from-amber-900 via-stone-900 to-yellow-950',
    skyColor: '#d97706',
    fogColor: '#b45309',
    fogDensity: 0.009,
    descriptionAr: 'أجواء صحراوية حارقة مع سواتر ترابية وصخور ضخمة للقنص البعيد.',
    icon: '🏜️',
    theme: 'noon',
    sunColor: '#fff3c4',
    ambientColor: '#e7cfa4',
    hemisphereSky: '#ffe9c0',
    hemisphereGround: '#8a5a2b',
    sunElevation: 62,
    sunAzimuth: 120,
    groundBase: '#b0722f',
    groundRock: '#8a5a2b',
    groundSand: '#c98d45',
    groundGrass: '#9aa06a'
  },
  warzone: {
    id: 'warzone',
    nameAr: 'منطقة الحرب الكبرى (Tactical Warzone)',
    subtitleAr: 'ساحة 200×200 متر — أحياء، ميناء، ومدينة أشباح',
    previewColor: 'from-zinc-950 via-cyan-950 to-amber-950',
    skyColor: '#23435f',
    fogColor: '#4e6478',
    fogDensity: 0.0042,
    descriptionAr: 'ميدان عمليات واسع بمناطق قتال بعيدة وقريبة، طرق، نهر، ومبانٍ متعددة الطوابق.',
    icon: '◈',
    theme: 'dusk',
    sunColor: '#ffdca0',
    ambientColor: '#a9bdd6',
    hemisphereSky: '#b9d4ec',
    hemisphereGround: '#46523c',
    sunElevation: 30,
    sunAzimuth: 155,
    groundBase: '#5a6b45',
    groundRock: '#6d654e',
    groundSand: '#8d7b57',
    groundGrass: '#57703e'
  }
};

// ------------------------------------------------------------
// Shared materials
// ------------------------------------------------------------
interface MapMaterials {
  concrete: THREE.MeshStandardMaterial;
  concreteDark: THREE.MeshStandardMaterial;
  brick: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  metalDark: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  asphalt: THREE.MeshStandardMaterial;
  dirt: THREE.MeshStandardMaterial;
  sand: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  glassWarm: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  roadMark: THREE.MeshStandardMaterial;
  foliage: THREE.MeshStandardMaterial;
  foliageDark: THREE.MeshStandardMaterial;
  trunk: THREE.MeshStandardMaterial;
  rust: THREE.MeshStandardMaterial;
  debris: THREE.MeshStandardMaterial;
  windowGlow: THREE.MeshBasicMaterial;
}

function makeMaterials(meta: MapMetadata): MapMaterials {
  const std = (c: string, r: number, m: number) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  return {
    concrete: std('#8a8f8c', 0.92, 0.02),
    concreteDark: std('#5c625f', 0.95, 0.02),
    brick: std('#9a6b4a', 0.9, 0.05),
    metal: std('#3d4649', 0.55, 0.6),
    metalDark: std('#232a2c', 0.5, 0.7),
    wood: std('#6b4a2b', 0.7, 0.1),
    asphalt: std('#26292b', 0.96, 0.0),
    dirt: std('#5d5644', 1.0, 0.0),
    sand: std('#8a7a58', 1.0, 0.0),
    rock: std('#6a6a5e', 0.92, 0.05),
    glass: std('#10161f', 0.12, 0.9),
    glassWarm: std('#1a1410', 0.12, 0.9),
    water: std('#2f5d6a', 0.2, 0.4),
    roadMark: std('#d9c05a', 0.85, 0.05),
    foliage: std(meta.groundGrass, 0.9, 0.0),
    foliageDark: std('#2f4a28', 0.9, 0.0),
    trunk: std('#4a3a28', 0.95, 0.0),
    rust: std('#6a3a24', 0.6, 0.35),
    debris: std('#54524a', 0.95, 0.02),
    // Unlit warm glow shared by lit windows, street lamps, shop signs and the
    // watchtower spotlight — a single material so every glowing surface merges
    // into one draw call. Fades into fog naturally.
    windowGlow: new THREE.MeshBasicMaterial({ color: 0xffb45f })
  };
}

// ------------------------------------------------------------
// Geometry accumulator — merges static geometry per material.
// All part coordinates are LOCAL (group-space). The caller sets
// the group position/rotation; colliders are baked to world space
// with `bakeSolids`.
// ------------------------------------------------------------
interface SolidPart {
  box: THREE.Box3;
  type: CoverObstacle3D['type'];
  vaultable: boolean;
  explosive: boolean;
}

class Parts {
  private buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  solids: SolidPart[] = [];
  readonly group = new THREE.Group();

  private push(mat: THREE.Material, geo: THREE.BufferGeometry) {
    if (!this.buckets.has(mat)) this.buckets.set(mat, []);
    this.buckets.get(mat)!.push(geo);
  }

  add(mat: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number,
      rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.Matrix4 {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz)
    );
    const g = geo.toNonIndexed();
    g.applyMatrix4(m);
    this.push(mat, g);
    return m;
  }

  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number,
      rx = 0, ry = 0, rz = 0) {
    return this.add(mat, new THREE.BoxGeometry(w, h, d), x, y, z, rx, ry, rz);
  }

  cyl(mat: THREE.Material, rt: number, rb: number, h: number, seg: number,
      x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) {
    return this.add(mat, new THREE.CylinderGeometry(rt, rb, h, seg), x, y, z, rx, ry, rz);
  }

  sphere(mat: THREE.Material, r: number, seg: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
    return this.add(mat, new THREE.SphereGeometry(r, seg, Math.max(6, seg >> 1)), x, y, z, 0, 0, 0, sx, sy, sz);
  }

  // Solid box — rendered AND registered as a collider.
  solid(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number,
        type: CoverObstacle3D['type'] = 'building', vaultable = false, explosive = false, ry = 0) {
    const m = this.box(mat, w, h, d, x, y, z, 0, ry, 0);
    const geo = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    geo.applyMatrix4(m);
    geo.computeBoundingBox();
    this.solids.push({ box: geo.boundingBox!.clone(), type, vaultable, explosive });
    geo.dispose();
  }

  // Solid from arbitrary geometry (rendered + collider).
  solidGeo(mat: THREE.Material, geo: THREE.BufferGeometry, x: number, y: number, z: number,
           type: CoverObstacle3D['type'] = 'building', vaultable = false, explosive = false, ry = 0) {
    const m = this.add(mat, geo, x, y, z, 0, ry, 0);
    const g = geo.toNonIndexed();
    g.applyMatrix4(m);
    g.computeBoundingBox();
    this.solids.push({ box: g.boundingBox!.clone(), type, vaultable, explosive });
    g.dispose();
  }

  build(): THREE.Group {
    this.buckets.forEach((geos, mat) => {
      if (geos.length === 0) return;
      const merged = mergeGeometries(geos, false);
      geos.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    });
    return this.group;
  }
}

// ------------------------------------------------------------
// Terrain math (warzone hills, river, roads, craters, plazas)
// ------------------------------------------------------------
const RIVER_POINTS: [number, number][] = [[-72, 78], [-56, 40], [-52, 2], [-40, -30], [-30, -68], [-10, -96]];
const ROAD_A_X = -2;
const ROAD_B_Z = 4;
const CRATERS: [number, number, number][] = [[24, -40, 7], [-60, -18, 6], [58, 52, 8], [-20, 74, 6], [12, -80, 5]];
// Paved lots under and around each building — flattened in the heightfield and
// painted as worn concrete in the ground vertex colours.
const PLAZAS: [number, number, number][] = [
  [-40, 40, 20], [40, -40, 20], [30, 26, 22], [-46, -30, 24],
  [42, 8, 18], [-30, -66, 14], [-8, -38, 16]
];

function distToSeg(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function riverDist(x: number, z: number): number {
  let d = Infinity;
  for (let i = 0; i < RIVER_POINTS.length - 1; i++) {
    d = Math.min(d, distToSeg(x, z, RIVER_POINTS[i][0], RIVER_POINTS[i][1], RIVER_POINTS[i + 1][0], RIVER_POINTS[i + 1][1]));
  }
  return d;
}

function roadDist(x: number, z: number): number {
  return Math.min(Math.abs(x - ROAD_A_X), Math.abs(z - ROAD_B_Z));
}

const smooth = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.max(0, Math.min(1, t));

function terrainHeight(x: number, z: number): number {
  let h =
    Math.sin(x * 0.021) * Math.cos(z * 0.026) * 3.2 +
    Math.sin(x * 0.05 + 1.7) * Math.cos(z * 0.043 - 0.6) * 1.4 +
    Math.sin(x * 0.1 + z * 0.08) * 0.5 +
    Math.sin(x * 0.16 + 3.1) * Math.cos(z * 0.13 + 1.2) * 0.3;

  const rd = riverDist(x, z);
  h -= Math.max(0, 1 - rd / 5.5) * 2.4;

  const roD = roadDist(x, z);
  if (roD < 4.4) {
    const t = smooth(1 - roD / 4.4);
    h = h * (1 - t) + 0.1 * t;
  }

  CRATERS.forEach(([cx, cz, cr]) => {
    const d = Math.hypot(x - cx, z - cz);
    if (d < cr) h -= Math.pow(1 - d / cr, 2) * 2.0;
  });

  PLAZAS.forEach(([px, pz, pr]) => {
    const d = Math.hypot(x - px, z - pz);
    if (d < pr) {
      const t = smooth(1 - d / pr);
      h = h * (1 - t) + 0.15 * t;
    }
  });

  return h;
}

function desertHeight(x: number, z: number): number {
  return (
    Math.sin(x * 0.03) * Math.cos(z * 0.035) * 1.8 +
    Math.sin(x * 0.07 + 2.1) * Math.cos(z * 0.05 - 0.8) * 0.9 +
    Math.sin(x * 0.12 + z * 0.09) * 0.4
  );
}

// ------------------------------------------------------------
// Ground plane with vertex colors
// ------------------------------------------------------------
function buildGround(scene: THREE.Scene, meta: MapMetadata, mapId: MapId, sunDir: THREE.Vector3):
  { getHeightAt: (x: number, z: number) => number; bounds: number } {
  const bounds = mapId === 'warzone' ? 100 : 90;
  const sub = mapId === 'warzone' ? 165 : 90;
  const geo = new THREE.PlaneGeometry(bounds * 2, bounds * 2, sub, sub);
  geo.rotateX(-Math.PI / 2);

  const hFn = mapId === 'warzone' ? terrainHeight : mapId === 'desert' ? desertHeight : (() => 0);
  const getHeightAt = (x: number, z: number) => hFn(x, z);

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;

  const grass = new THREE.Color(meta.groundGrass);
  const grassLow = new THREE.Color('#39482c');
  const grassDry = new THREE.Color('#8a7a4e');
  const grassLush = new THREE.Color('#3f5c2c');
  const dirt = new THREE.Color(meta.groundRock);
  const sand = new THREE.Color(meta.groundSand);
  const wetSand = new THREE.Color('#5d5748');
  const asphalt = new THREE.Color('#26292b');
  const asphaltWorn = new THREE.Color('#3a3d3c');
  const craterDirt = new THREE.Color('#5f584a');
  const pavement = new THREE.Color('#6d7168');
  const pavementWorn = new THREE.Color('#5a5e55');
  const warm = new THREE.Color(meta.sunColor);
  const cool = new THREE.Color(meta.hemisphereSky);
  const tmp = new THREE.Color();

  // First pass — displace vertices to the terrain heightfield.
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, hFn(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  const normals = geo.getAttribute('normal') as THREE.BufferAttribute;
  const sunUp = Math.max(0, sunDir.y);

  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = pos.getY(i);

    let c: THREE.Color;
    const rd = mapId === 'warzone' ? roadDist(x, z) : Infinity;
    const rivD = mapId === 'warzone' ? riverDist(x, z) : Infinity;

    if (mapId !== 'warzone' && mapId !== 'desert') {
      c = tmp.set(meta.groundBase);
    } else if (mapId === 'warzone' && rd < 4.4) {
      // Asphalt with worn tyre lines near the centre of each lane.
      tmp.copy(asphalt);
      tmp.lerp(asphaltWorn, clamp01(1 - Math.abs(((z % 6) + 6) % 6 - 3) / 3) * 0.4);
      c = tmp;
    } else if (mapId === 'warzone' && rd < 6.8) {
      // Dirt shoulder between the road and the meadow.
      tmp.copy(dirt).lerp(grass, clamp01((rd - 4.4) / 2.4));
      c = tmp;
    } else if (mapId === 'warzone' && rivD < 7.5) {
      // River bed: wet sand at the waterline blending into dry sand, then grass.
      tmp.copy(wetSand).lerp(sand, clamp01((rivD - 3.0) / 3.0));
      tmp.lerp(grass, clamp01((rivD - 5.5) / 2.0));
      c = tmp;
    } else if (mapId === 'desert') {
      c = tmp.copy(dirt).lerp(sand, (Math.sin(x * 0.11) * Math.cos(z * 0.09) + 1) * 0.5);
    } else {
      // Layered meadow variation: base grass -> dirt patches -> dry vs lush
      // zones -> height tint -> per-vertex micro variation.
      const patch = Math.sin(x * 0.16 + 2.0) * Math.cos(z * 0.21 + 1.0);
      const dryN = Math.sin(x * 0.09 + 1.1) * Math.cos(z * 0.07 - 0.4);
      const micro = Math.sin(x * 0.5 + z * 0.4) * 0.5 + 0.5;
      tmp.copy(grass).lerp(dirt, clamp01(patch * 0.9 + 0.35));
      tmp.lerp(grassDry, clamp01(dryN * 0.5 + 0.28) * 0.55);
      tmp.lerp(grassLush, clamp01(-dryN * 0.5 + 0.3) * 0.4);
      tmp.lerp(grassLow, clamp01((h + 2.5) / 6.0) * 0.5);
      tmp.offsetHSL(0, 0, (micro - 0.5) * 0.03);
      c = tmp;
    }

    // Crater bowls read as churned, darker dirt.
    if (mapId === 'warzone') {
      for (let k = 0; k < CRATERS.length; k++) {
        const cx = CRATERS[k][0], cz = CRATERS[k][1], cr = CRATERS[k][2];
        const d = Math.hypot(x - cx, z - cz);
        if (d < cr) c.lerp(craterDirt, clamp01(1 - d / cr) * 0.6);
      }
    }

    // Paved building lots: worn concrete that fades into the meadow at the rim
    // (never overwrites roads or the riverbed).
    if (mapId === 'warzone' && rd >= 6.8 && rivD >= 7.5) {
      for (let k = 0; k < PLAZAS.length; k++) {
        const px = PLAZAS[k][0], pz = PLAZAS[k][1], pr = PLAZAS[k][2];
        const d = Math.hypot(x - px, z - pz);
        if (d < pr) {
          const t = smooth(1 - d / pr);
          const wear = Math.sin(x * 0.35 + pz) * Math.cos(z * 0.3 + px);
          tmp.copy(pavement).lerp(pavementWorn, clamp01(wear * 0.5 + 0.4));
          c.lerp(tmp, t * 0.88);
        }
      }
    }

    // Baked slope lighting: sun-facing slopes warm up, shadowed slopes cool
    // down — gives the terrain real relief without extra runtime lights.
    const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
    const d = nx * sunDir.x + ny * sunDir.y + nz * sunDir.z;
    c.lerp(warm, clamp01(d) * 0.1 * (0.4 + sunUp));
    c.lerp(cool, clamp01(-d) * 0.09);

    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.02 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'ground';
  scene.add(mesh);

  return { getHeightAt, bounds };
}

// ------------------------------------------------------------
// Roads, river
// ------------------------------------------------------------
function buildRoads(scene: THREE.Scene, mats: MapMaterials) {
  const road = new THREE.Group();
  road.name = 'roads';
  const v = new THREE.Mesh(new THREE.BoxGeometry(8, 0.12, 200), mats.asphalt);
  v.position.set(ROAD_A_X, 0.06, 0);
  v.receiveShadow = true;
  road.add(v);
  const h = new THREE.Mesh(new THREE.BoxGeometry(200, 0.12, 8), mats.asphalt);
  h.position.set(0, 0.06, ROAD_B_Z);
  h.receiveShadow = true;
  road.add(h);
  for (let z = -94; z <= 94; z += 10) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 4.2), mats.roadMark);
    dash.position.set(ROAD_A_X, 0.13, z);
    road.add(dash);
  }
  for (let x = -94; x <= 94; x += 10) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.02, 0.24), mats.roadMark);
    dash.position.set(x, 0.13, ROAD_B_Z);
    road.add(dash);
  }
  [-3.6, 3.6].forEach((off) => {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.05, 200), mats.concreteDark);
    curb.position.set(ROAD_A_X + off, 0.1, 0);
    road.add(curb);
  });
  [-3.6, 3.6].forEach((off) => {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(200, 0.05, 0.18), mats.concreteDark);
    curb.position.set(0, 0.1, ROAD_B_Z + off);
    road.add(curb);
  });
  scene.add(road);
}

function buildRiver(scene: THREE.Scene, mats: MapMaterials) {
  // Local Z of this XZ-rotated plane maps to world Y, so animating local Z
  // later in the render loop produces gentle waves. Base offsets are stashed
  // in userData for the animation.
  const waterGeo = new THREE.PlaneGeometry(9, 190, 2, 40);
  waterGeo.rotateX(-Math.PI / 2);
  const zPos = waterGeo.getAttribute('position') as THREE.BufferAttribute;
  const baseZ = new Float32Array(zPos.count);
  for (let i = 0; i < zPos.count; i++) baseZ[i] = zPos.getZ(i);
  waterGeo.userData.baseZ = baseZ;

  const mat = mats.water.clone();
  mat.color.set('#2a6d78');
  mat.transparent = true;
  mat.opacity = 0.78;
  mat.roughness = 0.12;
  mat.metalness = 0.08;
  mat.emissive.set('#0c2a33');
  mat.emissiveIntensity = 0.3;
  const water = new THREE.Mesh(waterGeo, mat);
  water.position.set(-40, -1.25, -4);
  water.rotation.z = 0.5;
  water.name = 'water';
  scene.add(water);
}

// ------------------------------------------------------------
// Buildings
// ------------------------------------------------------------
interface BuildingResult {
  group: THREE.Group;
  colliders: CoverObstacle3D[];
  ladders: { x: number; z: number; topY: number; baseY: number }[];
}

// Bake local solids to world-space colliders for a placed group.
// Merge every static mesh inside `root` (buildings, vehicles, containers) into
// a single mesh per shared material. All static builders emit non-indexed
// primitives, so the merge is lossless; it collapses ~100 building draw calls
// down to ~15 (one per material) which keeps the whole arena well under the
// 200 draw-call budget once soldiers and the weapon viewmodel are added.
function mergeStaticWorld(scene: THREE.Scene, root: THREE.Group): void {
  scene.updateMatrixWorld(true);
  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    if ((mesh as unknown as { isInstancedMesh?: boolean }).isInstancedMesh) return;
    const m = mesh.material as THREE.Material;
    const b = buckets.get(m);
    if (b) b.push(mesh);
    else buckets.set(m, [mesh]);
  });

  const mergedGroup = new THREE.Group();
  mergedGroup.name = 'staticWorld';
  buckets.forEach((meshes, mat) => {
    const geos = meshes.map((m) => {
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrixWorld);
      return g;
    });
    let merged: THREE.BufferGeometry;
    if (geos.length === 1) {
      merged = geos[0];
    } else {
      merged = mergeGeometries(geos, false) ?? new THREE.BufferGeometry();
      geos.forEach((g) => g.dispose());
    }
    const mesh = new THREE.Mesh(merged, mat);
    // Unlit (glowing/transparent) materials must not cast shadows.
    mesh.castShadow = !(mat instanceof THREE.MeshBasicMaterial) && !(mat as THREE.Material).transparent;
    mesh.receiveShadow = true;
    mergedGroup.add(mesh);
  });

  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if ((mesh as unknown as { isMesh?: boolean }).isMesh && mesh.geometry) mesh.geometry.dispose();
  });
  scene.remove(root);
  scene.add(mergedGroup);
}

function bakeSolids(parts: Parts, x: number, y: number, z: number, ry: number): CoverObstacle3D[] {
  return parts.solids.map((s) => {
    const c = s.box.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(ry)).translate(new THREE.Vector3(x, y, z));
    return {
      mesh: parts.group, box: c, type: s.type, isVaultable: s.vaultable,
      blocksBullets: true, blocksMovement: true, explosive: s.explosive
    };
  });
}

function buildApartment(mats: MapMaterials, x: number, z: number, ry: number): BuildingResult {
  const parts = new Parts();
  const ladders: BuildingResult['ladders'] = [];
  const W = 14, D = 9, H1 = 3.0, H2 = 2.6, DOOR_W = 1.8;
  const wallMat = mats.concrete;
  const innerMat = mats.concreteDark;
  const roofY = H1 + H2 + 0.15;

  // Foundation plinth — grounds the building on its paved lot.
  parts.box(mats.concreteDark, W + 0.8, 0.35, D + 0.8, 0, 0.05, 0);

  const frontHalf = (W - DOOR_W) / 2;
  // Ground floor walls with door gaps
  parts.solid(wallMat, frontHalf, H1, 0.25, -(W - frontHalf) / 2, H1 / 2, D / 2);
  parts.solid(wallMat, frontHalf, H1, 0.25, (W - frontHalf) / 2, H1 / 2, D / 2);
  parts.solid(wallMat, frontHalf, H1, 0.25, -(W - frontHalf) / 2, H1 / 2, -D / 2);
  parts.solid(wallMat, frontHalf, H1, 0.25, (W - frontHalf) / 2, H1 / 2, -D / 2);
  parts.solid(wallMat, 0.25, H1, D, -W / 2, H1 / 2, 0);
  parts.solid(wallMat, 0.25, H1, D, W / 2, H1 / 2, 0);
  // Lintels over both doorways + door frames
  parts.box(wallMat, DOOR_W, 0.5, 0.3, 0, H1 - 0.25, D / 2);
  parts.box(wallMat, DOOR_W, 0.5, 0.3, 0, H1 - 0.25, -D / 2);
  parts.box(mats.metalDark, 0.1, H1 - 0.4, 0.3, -DOOR_W / 2 - 0.05, (H1 - 0.4) / 2 + 0.4, D / 2);
  parts.box(mats.metalDark, 0.1, H1 - 0.4, 0.3, DOOR_W / 2 + 0.05, (H1 - 0.4) / 2 + 0.4, D / 2);

  // Interior columns
  parts.box(innerMat, 0.3, H1, 0.3, -3, H1 / 2, 0);
  parts.box(innerMat, 0.3, H1, 0.3, 3, H1 / 2, 0);

  // Upper floor slab + walls + roof
  parts.solid(wallMat, W, 0.28, D, 0, H1, 0);
  parts.solid(wallMat, W, H2, 0.25, 0, H1 + H2 / 2, D / 2);
  parts.solid(wallMat, W, H2, 0.25, 0, H1 + H2 / 2, -D / 2);
  parts.solid(wallMat, 0.25, H2, D, -W / 2, H1 + H2 / 2, 0);
  parts.solid(wallMat, 0.25, H2, D, W / 2, H1 + H2 / 2, 0);

  // Upper windows: mix of lit (glowing) and dark panes, each with a dark frame
  // surround and a concrete sill. Front/back get 4, sides get 3. `n` is the
  // wall's outward normal so the frame/sill sit on the correct side.
  const putWindow = (wx: number, wy: number, wz: number, lit: boolean, n: [number, number, number]) => {
    const pane = lit ? mats.windowGlow : mats.glass;
    const nx = n[0], nz = n[2];
    if (Math.abs(nz) > 0) {
      parts.box(pane, 1.4, 1.2, 0.1, wx, wy, wz);
      parts.box(mats.metalDark, 1.55, 1.35, 0.06, wx, wy, wz - nz * 0.02);
      parts.box(mats.concrete, 1.65, 0.09, 0.22, wx, wy - 0.64, wz - nz * 0.05);
    } else {
      parts.box(pane, 0.1, 1.2, 1.3, wx, wy, wz);
      parts.box(mats.metalDark, 0.06, 1.35, 1.45, wx - nx * 0.02, wy, wz);
      parts.box(mats.concrete, 0.22, 0.09, 1.55, wx - nx * 0.05, wy - 0.64, wz);
    }
  };
  for (let i = 0; i < 4; i++) {
    const wx = -4.5 + i * 3;
    putWindow(wx, H1 + 1.4, D / 2 + 0.13, i % 2 === 0, [0, 0, 1]);
    putWindow(wx, H1 + 1.4, -D / 2 - 0.13, i % 2 === 1, [0, 0, -1]);
  }
  for (let i = 0; i < 3; i++) {
    const wz = -3 + i * 3;
    putWindow(-W / 2 - 0.13, H1 + 1.4, wz, i === 1, [-1, 0, 0]);
    putWindow(W / 2 + 0.13, H1 + 1.4, wz, i === 1, [1, 0, 0]);
  }

  // Roof slab + full parapet around the rooftop (provides rooftop cover).
  parts.solid(wallMat, W + 0.6, 0.3, D + 0.6, 0, H1 + H2, 0);
  const parapetY = roofY + 0.25;
  parts.solid(wallMat, W + 0.4, 0.5, 0.18, 0, parapetY, D / 2, 'building', true);
  parts.solid(wallMat, W + 0.4, 0.5, 0.18, 0, parapetY, -D / 2, 'building', true);
  parts.solid(wallMat, 0.18, 0.5, D + 0.4, -W / 2, parapetY, 0, 'building', true);
  parts.solid(wallMat, 0.18, 0.5, D + 0.4, W / 2, parapetY, 0, 'building', true);

  // Rooftop clutter: AC unit, water tank, antenna, vent pipe.
  parts.box(mats.metalDark, 1.7, 0.9, 1.2, 3, roofY + 0.45, -1);
  parts.box(mats.rust, 1.7, 0.05, 0.05, 3, roofY + 0.75, -1.4);
  parts.box(mats.rust, 1.7, 0.05, 0.05, 3, roofY + 0.5, -1.4);
  parts.cyl(mats.concreteDark, 0.7, 0.7, 1.4, 10, -3.5, roofY + 0.7, 1.6);
  parts.cyl(mats.metalDark, 0.03, 0.03, 3.4, 6, 0, roofY + 1.7, 0);
  parts.cyl(mats.metalDark, 0.12, 0.12, 0.6, 8, 1.5, roofY + 0.3, 2.3);

  // Exterior fire-escape ladder to the roof (sniper perch).
  parts.box(mats.metalDark, 0.08, H1 + H2, 0.08, 0, (H1 + H2) / 2, -D / 2 - 0.55);
  parts.box(mats.metalDark, 0.08, H1 + H2, 0.08, 0.4, (H1 + H2) / 2, -D / 2 - 0.55);
  for (let ly = 0.4; ly < H1 + H2 - 0.2; ly += 0.45) {
    parts.box(mats.metalDark, 0.6, 0.06, 0.06, 0.2, ly, -D / 2 - 0.55);
  }
  ladders.push({ x: 0, z: -D / 2 - 0.7, topY: H1 + H2 + 0.65, baseY: 0 });

  // Balconies
  for (let bx = -4.5; bx <= 4.5; bx += 9) {
    parts.solid(wallMat, 2.4, 0.14, 1.4, bx, H1 + 0.05, D / 2 + 0.8, 'building', true);
    parts.box(wallMat, 0.1, 1.0, 1.4, bx - 1.2, H1 + 0.55, D / 2 + 0.8);
    parts.box(wallMat, 0.1, 1.0, 1.4, bx + 1.2, H1 + 0.55, D / 2 + 0.8);
    parts.box(mats.metal, 2.4, 0.06, 0.05, bx, H1 + 0.95, D / 2 + 0.8);
    parts.box(mats.metal, 0.06, 0.06, 0.5, bx - 1.2, H1 + 0.8, D / 2 + 1.45);
    parts.box(mats.metal, 0.06, 0.06, 0.5, bx + 1.2, H1 + 0.8, D / 2 + 1.45);
    // Balcony glass door
    parts.box(mats.glass, 1.0, 1.6, 0.06, bx, H1 + 0.9, D / 2 + 0.1);
  }

  const group = parts.build();
  group.position.set(x, 0.15, z);
  group.rotation.y = ry;
  const c = Math.cos(ry), s = Math.sin(ry);
  const worldLadders = ladders.map((l) => ({
    x: x + l.x * c - l.z * s,
    z: z + l.x * s + l.z * c,
    topY: 0.15 + l.topY,
    baseY: 0.15 + l.baseY
  }));
  return { group, colliders: bakeSolids(parts, x, 0.15, z, ry), ladders: worldLadders };
}

function buildHangar(mats: MapMaterials, x: number, z: number, ry: number): BuildingResult {
  const parts = new Parts();
  const W = 26, D = 18, H = 7;
  parts.box(mats.concrete, W, 0.2, D, 0, 0.1, 0);
  parts.solid(mats.metal, 0.3, H, D, -W / 2, H / 2, 0);
  parts.solid(mats.metal, 0.3, H, D, W / 2, H / 2, 0);
  parts.solid(mats.metal, W, H, 0.3, 0, H / 2, -D / 2);
  const seg = (W - 10) / 2;
  parts.solid(mats.metal, seg, H, 0.3, -(W - seg) / 2, H / 2, D / 2);
  parts.solid(mats.metal, seg, H, 0.3, (W - seg) / 2, H / 2, D / 2);
  parts.solid(mats.metal, 10, 1.2, 0.3, 0, H - 0.6, D / 2);
  parts.solid(mats.metalDark, W, 0.3, D, 0, H, 0);
  for (let i = -W / 2 + 2; i < W / 2; i += 3.2) {
    parts.box(mats.metalDark, 0.24, 0.5, D, i, H - 0.1, 0);
  }
  // Office windows (lit) beside the rolling door + a sign strip.
  parts.box(mats.windowGlow, 2.4, 1.0, 0.12, -(W - 10) / 2 - 1.4, H - 2.4, D / 2 + 0.2);
  parts.box(mats.windowGlow, 2.4, 1.0, 0.12, (W - 10) / 2 + 1.4, H - 2.4, D / 2 + 0.2);
  parts.box(mats.metalDark, 5.5, 0.5, 0.12, 0, H - 0.9, D / 2 + 0.2);
  parts.box(mats.windowGlow, 4.5, 0.26, 0.1, 0, H - 0.9, D / 2 + 0.28);
  // Roof skylights + vents.
  parts.box(mats.glass, 12, 0.05, 1.2, 0, H + 0.16, 0);
  parts.box(mats.glass, 12, 0.05, 1.2, 0, H + 0.16, -6);
  parts.box(mats.metalDark, 1.1, 0.5, 1.1, -6, H + 0.28, 5);
  parts.box(mats.metalDark, 1.1, 0.5, 1.1, 6, H + 0.28, -5);
  for (let i = -3; i <= 3; i += 3) {
    parts.box(mats.metal, 3.4, 0.12, 1.6, i, 1.2, -6);
    parts.box(mats.metal, 3.4, 0.12, 1.6, i, 2.0, -6);
    parts.box(mats.wood, 3.2, 1.4, 1.4, i, 1.7, -6.4);
  }
  parts.box(mats.debris, 1.4, 1.2, 1.4, -8, 0.75, -6.5);
  parts.box(mats.debris, 1.4, 1.0, 1.4, -5.5, 0.65, -7.5);
  parts.box(mats.debris, 1.4, 1.3, 1.4, 7.5, 0.8, -5.5);
  parts.box(mats.metal, W - 4, 0.16, 0.16, 0, H - 1.2, 0);

  const group = parts.build();
  group.position.set(x, 0.15, z);
  group.rotation.y = ry;
  return { group, colliders: bakeSolids(parts, x, 0.15, z, ry), ladders: [] };
}

function buildRuins(mats: MapMaterials, x: number, z: number, ry: number): BuildingResult {
  const parts = new Parts();
  const ladders: BuildingResult['ladders'] = [];

  parts.solid(mats.brick, 10, 3.4, 0.6, -2, 1.7, -4);
  parts.solid(mats.brick, 8, 2.2, 0.6, 3, 1.1, 4, 'building', true);
  parts.solid(mats.brick, 0.6, 3.0, 8, -5, 1.5, 1);
  parts.solid(mats.brick, 0.6, 1.8, 6, 5, 0.9, -1, 'building', true);
  parts.sphere(mats.concreteDark, 3.4, 12, 0, 0.6, 0, 1, 0.55, 1);
  parts.box(mats.concrete, 0.3, 1.2, 0.3, 0, 1.6, 0);
  const rng = mulberry32(991);
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2, r = rng() * 4.5;
    parts.box(mats.debris, 0.7 + rng(), 0.5 + rng() * 0.9, 0.7 + rng(),
      Math.cos(a) * r, 0.3 + rng() * 0.3, Math.sin(a) * r, rng(), rng(), rng());
  }
  // Minaret (sniper perch)
  const tx = 6.2, tz = -5.5, th = 16;
  parts.solid(mats.concrete, 2.6, th, 2.6, tx, th / 2, tz);
  parts.solid(mats.concrete, 3.6, 0.3, 3.6, tx, th - 1.6, tz);
  parts.solid(mats.concrete, 0.18, 1.0, 3.6, tx - 1.8, th - 1.1, tz, 'building', true);
  parts.solid(mats.concrete, 0.18, 1.0, 3.6, tx + 1.8, th - 1.1, tz, 'building', true);
  parts.box(mats.brick, 2.2, 0.6, 2.2, tx, th + 0.3, tz);
  ladders.push({ x: tx, z: tz - 1.4, topY: th - 1.45, baseY: 0 });

  const group = parts.build();
  group.position.set(x, 0.15, z);
  group.rotation.y = ry;
  const c = Math.cos(ry), s = Math.sin(ry);
  const worldLadders = ladders.map((l) => ({
    x: x + l.x * c - l.z * s,
    z: z + l.x * s + l.z * c,
    topY: 0.15 + l.topY,
    baseY: 0.15 + l.baseY
  }));
  return { group, colliders: bakeSolids(parts, x, 0.15, z, ry), ladders: worldLadders };
}

function buildGasStation(mats: MapMaterials, x: number, z: number, ry: number): BuildingResult {
  const parts = new Parts();
  const W = 14, D = 10;

  parts.solid(mats.concreteDark, W, 0.4, D, 0, 4.6, 0);
  parts.box(mats.metal, W, 0.3, 0.5, 0, 4.3, D / 2);
  // Glowing sign band + price board on the canopy front.
  parts.box(mats.metalDark, 8.5, 1.1, 0.14, 0, 3.6, D / 2 + 0.06);
  parts.box(mats.windowGlow, 7.8, 0.55, 0.1, 0, 3.6, D / 2 + 0.16);
  parts.box(mats.metalDark, 2.4, 1.5, 0.1, 3.8, 2.0, D / 2 + 0.08);
  parts.box(mats.windowGlow, 2.0, 1.1, 0.1, 3.8, 2.0, D / 2 + 0.15);
  // Canopy edge trim.
  parts.box(mats.metal, W + 0.2, 0.16, 0.2, 0, 4.42, D / 2 + 0.1);
  parts.box(mats.metal, W + 0.2, 0.16, 0.2, 0, 4.42, -D / 2 - 0.1);
  [[-W / 2 + 0.8, -D / 2 + 0.8], [W / 2 - 0.8, -D / 2 + 0.8], [-W / 2 + 0.8, D / 2 - 0.8], [W / 2 - 0.8, D / 2 - 0.8]].forEach(([cx, cz]) => {
    parts.solid(mats.metal, 0.5, 4.6, 0.5, cx, 2.3, cz);
  });
  [-3.5, 3.5].forEach((px) => {
    parts.solid(mats.concrete, 1.6, 0.5, 2.6, px, 0.25, 1.5, 'building', true);
    parts.box(mats.metalDark, 0.7, 1.5, 1.0, px, 1.2, 1.5);
    parts.box(mats.glassWarm, 0.5, 0.5, 0.1, px, 1.3, 1.02);
  });
  // Shop: lit interior glow through the front glass.
  parts.solid(mats.concrete, 7, 3.2, 5, 0, 1.6, -3.4);
  parts.box(mats.windowGlow, 5.4, 1.5, 0.1, 0, 1.6, -0.95);
  parts.box(mats.metal, 0.2, 1.6, 0.14, -2.7, 1.6, -0.95);
  parts.box(mats.metal, 0.2, 1.6, 0.14, 2.7, 1.6, -0.95);
  parts.box(mats.metal, 5.8, 0.5, 0.3, 0, 0.4, -0.95);
  // Shop sign strip above the glass.
  parts.box(mats.windowGlow, 5.6, 0.35, 0.1, 0, 2.55, -0.95);
  parts.solid(mats.concreteDark, 7.4, 0.3, 5.4, 0, 3.4, -3.4);
  // Explosive fuel tanks
  [-2, 0, 2].forEach((tx) => {
    parts.solidGeo(mats.rust, new THREE.CylinderGeometry(1.0, 1.0, 3.2, 12), tx, 1.1, -6.6, 'building', false, true);
  });

  const group = parts.build();
  group.position.set(x, 0.15, z);
  group.rotation.y = ry;
  return { group, colliders: bakeSolids(parts, x, 0.15, z, ry), ladders: [] };
}

function buildWatchtower(mats: MapMaterials, x: number, z: number): BuildingResult {
  const gy = terrainHeight(x, z);
  const parts = new Parts();
  const ladders: BuildingResult['ladders'] = [];
  const H = 11;

  [[-2.2, -2.2], [2.2, -2.2], [-2.2, 2.2], [2.2, 2.2]].forEach(([lx, lz]) => {
    parts.solid(mats.metal, 0.32, H, 0.32, lx, H / 2, lz);
  });
  for (let ly = 2; ly < H - 2; ly += 2.4) {
    parts.box(mats.metal, 4.2, 0.12, 0.12, 0, ly, -2.1);
    parts.box(mats.metal, 0.12, 0.12, 4.2, -2.1, ly + 1.2, 0);
  }
  parts.solid(mats.metal, 5.4, 0.3, 5.4, 0, H, 0);
  [[-2.5, 0, true], [2.5, 0, true], [0, -2.5, false], [0, 2.5, false]].forEach(([rx, rz, horiz]) => {
    parts.solid(mats.metal, horiz ? 0.14 : 5.4, 1.0, horiz ? 5.4 : 0.14, rx as number, H + 0.65, rz as number, 'building', true);
    parts.box(mats.metal, horiz ? 0.1 : 5.4, 0.1, horiz ? 5.4 : 0.1, rx as number, H + 1.15, rz as number);
  });
  parts.box(mats.metalDark, 4.6, 0.16, 4.6, 0, H + 1.6, 0);
  for (let ly = 0.4; ly < H - 0.6; ly += 0.5) {
    parts.box(mats.rust, 0.9, 0.07, 0.07, 0, ly, 2.5);
  }
  parts.cyl(mats.glassWarm, 0.28, 0.34, 0.4, 10, 0, H + 0.15, 2.6, Math.PI / 2 - 0.35, 0, 0);
  parts.cyl(mats.windowGlow, 0.12, 0.12, 0.06, 10, 0, H + 0.12, 2.78, Math.PI / 2 - 0.35, 0, 0);
  ladders.push({ x, z: z + 2.45, topY: gy + H, baseY: gy });

  const group = parts.build();
  group.position.set(x, gy, z);
  return { group, colliders: bakeSolids(parts, x, gy, z, 0), ladders };
}

function buildBunker(mats: MapMaterials, x: number, z: number, ry: number): BuildingResult {
  const parts = new Parts();
  parts.solid(mats.dirt, 16, 2.6, 13, 0, 1.3, 0);
  parts.solid(mats.concrete, 7, 2.6, 0.6, 0, 1.3, 4.4);
  // Bunker window: dark glass + a lit slit so it reads as occupied at dusk.
  parts.box(mats.glass, 2.2, 2.0, 0.4, 0, 1.0, 4.4);
  parts.box(mats.windowGlow, 1.6, 0.28, 0.12, 0, 1.25, 4.75);
  parts.box(mats.metalDark, 0.24, 2.2, 0.3, -1.15, 1.0, 4.5);
  parts.box(mats.metalDark, 0.24, 2.2, 0.3, 1.15, 1.0, 4.5);
  parts.box(mats.metal, 0.4, 1.6, 0.4, -4, 0.8, 1);
  parts.box(mats.metal, 0.4, 1.6, 0.4, 4, 0.8, 1);
  parts.box(mats.concreteDark, 3.4, 0.3, 0.3, 0, 0.2, 4.6);
  // Radio antenna + vent mast on the mound.
  parts.cyl(mats.metalDark, 0.03, 0.03, 2.6, 6, -5, 2.2, -2.5);
  parts.cyl(mats.rust, 0.18, 0.24, 0.7, 8, 5.2, 2.15, -1.8);
  for (let a = -1; a <= 1; a += 0.5) {
    parts.box(mats.sand, 1.6, 0.7, 0.7, Math.sin(a) * 6, 0.35, 5.5 + Math.cos(a) * 2, 0, a, 0);
  }
  for (let a = -0.5; a <= 0.5; a += 0.5) {
    parts.box(mats.sand, 1.8, 0.6, 0.7, Math.sin(a) * 5, 0.3, 6.4 + Math.cos(a) * 1.5, 0, a * 0.6, 0);
  }

  const group = parts.build();
  group.position.set(x, 0.15, z);
  group.rotation.y = ry;
  return { group, colliders: bakeSolids(parts, x, 0.15, z, ry), ladders: [] };
}

function buildContainerYard(mats: MapMaterials, x: number, z: number, ry: number): BuildingResult {
  const parts = new Parts();
  const colors = ['#1e3a8a', '#991b1b', '#15803d', '#b45309', '#7c3aed', '#0e7490'];
  const rng = mulberry32(77);
  // One material instance per paint colour (shared across the whole yard) so
  // the static merge collapses every container side into ~6 draw calls.
  const paintCache = new Map<string, THREE.MeshStandardMaterial>();
  const paintFor = (hex: string): THREE.MeshStandardMaterial => {
    let m = paintCache.get(hex);
    if (!m) { m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.5, metalness: 0.5 }); paintCache.set(hex, m); }
    return m;
  };

  const place = (cx: number, cz: number, rot: number, stack: number) => {
    for (let s = 0; s < stack; s++) {
      const c = paintFor(colors[Math.floor(rng() * colors.length)]);
      const y = 1.3 + s * 2.6;
      parts.solid(c, 2.6, 2.6, 6.1, cx, y, cz, 'crate', false, false, rot);
      const ox = Math.sin(rot) * 1.3, oz = Math.cos(rot) * 1.3;
      // Side corrugation ribs.
      parts.box(c, 0.06, 2.2, 0.06, cx + ox, y, cz + oz, 0, rot, 0);
      parts.box(c, 0.06, 2.2, 0.06, cx - ox, y, cz - oz, 0, rot, 0);
      // Door panels at both ends + lock rods.
      parts.box(mats.metalDark, 2.7, 2.7, 0.1, cx, y, cz + 3.05, 0, rot, 0);
      parts.box(mats.metalDark, 2.7, 2.7, 0.1, cx, y, cz - 3.05, 0, rot, 0);
      parts.box(mats.rust, 0.1, 2.5, 0.14, cx - 0.9, y, cz + 3.05, 0, rot, 0);
      parts.box(mats.rust, 0.1, 2.5, 0.14, cx + 0.9, y, cz + 3.05, 0, rot, 0);
      // Corner castings.
      [[-1.3, 3.0], [1.3, 3.0], [-1.3, -3.0], [1.3, -3.0]].forEach(([ax, az]) => {
        parts.box(mats.metalDark, 0.24, 0.24, 0.24, cx + ax, y + 1.2, cz + az, 0, rot, 0);
        parts.box(mats.metalDark, 0.24, 0.24, 0.24, cx + ax, y - 1.2, cz + az, 0, rot, 0);
      });
    }
  };

  place(-7, -3, 0.12, 2);
  place(-7, 0, 0.12, 2);
  place(-7, 3, 0.12, 1);
  place(6.6, -3, -0.12, 2);
  place(6.6, 0, -0.12, 1);
  place(0, -5.5, 0, 3);
  place(-1.6, 6.2, 0.2, 2);

  const group = parts.build();
  group.position.set(x, 0.15, z);
  group.rotation.y = ry;
  return { group, colliders: bakeSolids(parts, x, 0.15, z, ry), ladders: [] };
}

function buildDestroyedVehicles(mats: MapMaterials, hFn: (x: number, z: number) => number): { group: THREE.Group; colliders: CoverObstacle3D[] } {
  const group = new THREE.Group();
  const colliders: CoverObstacle3D[] = [];
  const rng = mulberry32(555);

  const addCar = (x: number, z: number, ry: number, burned: boolean) => {
    const p = new Parts();
    const body = burned ? mats.rust : mats.metal;
    p.box(body, 2.2, 0.7, 4.2, 0, 0.55, 0);
    p.box(body, 1.9, 0.55, 2.1, 0, 1.15, -0.3);
    p.box(mats.glass, 1.7, 0.5, 0.06, 0, 1.1, 0.78);
    [[-1.05, 1.3], [1.05, 1.3], [-1.05, -1.3], [1.05, -1.3]].forEach(([wx, wz]) => {
      p.cyl(mats.metalDark, 0.42, 0.42, 0.3, 10, wx, 0.42, wz, Math.PI / 2, 0, 0);
    });
    if (burned) {
      for (let i = 0; i < 5; i++) {
        p.box(mats.debris, 0.4 + rng() * 0.3, 0.2 + rng() * 0.2, 0.4 + rng() * 0.3, (rng() - 0.5) * 2, 0.1, (rng() - 0.5) * 3, rng(), rng(), rng());
      }
    }
    const g = p.build();
    g.position.set(x, hFn(x, z), z);
    g.rotation.y = ry;
    group.add(g);
    colliders.push({ mesh: g, box: new THREE.Box3().setFromObject(g), type: 'car', isVaultable: true, blocksBullets: true, blocksMovement: true });
  };

  const addFlippedTruck = (x: number, z: number, ry: number) => {
    const p = new Parts();
    p.box(mats.rust, 2.6, 1.1, 5.6, 0, 0.6, 0);
    p.box(mats.metalDark, 2.6, 2.6, 1.2, 0, 1.6, -2.2);
    [[-1.3, 1.6], [1.3, 1.6], [-1.3, -1.6], [1.3, -1.6]].forEach(([wx, wz]) => {
      p.cyl(mats.metalDark, 0.5, 0.5, 0.35, 10, wx, 0.5, wz, Math.PI / 2, 0, 0);
    });
    const g = p.build();
    g.position.set(x, hFn(x, z), z);
    g.rotation.y = ry;
    g.rotation.z = Math.PI / 2 + 0.18;
    group.add(g);
    colliders.push({ mesh: g, box: new THREE.Box3().setFromObject(g), type: 'car', isVaultable: true, blocksBullets: true, blocksMovement: true });
  };

  const addTankHull = (x: number, z: number, ry: number) => {
    const p = new Parts();
    p.solid(mats.metalDark, 3.4, 0.8, 6.0, 0, 0.6, 0, 'car', true);
    p.box(mats.metal, 0.7, 0.9, 6.4, -2.0, 0.5, 0);
    p.box(mats.metal, 0.7, 0.9, 6.4, 2.0, 0.5, 0);
    p.box(mats.rust, 2.0, 0.6, 2.4, 0, 1.2, -0.4);
    p.cyl(mats.metalDark, 0.1, 0.1, 3.0, 8, 0, 1.3, -1.8, Math.PI / 2, 0, 0.06);
    for (let i = 0; i < 6; i++) {
      p.box(mats.debris, 0.6 + rng() * 0.4, 0.3 + rng() * 0.2, 0.6 + rng() * 0.4, (rng() - 0.5) * 4, 0.15, (rng() - 0.5) * 5, rng(), rng(), rng());
    }
    const g = p.build();
    g.position.set(x, hFn(x, z), z);
    g.rotation.y = ry;
    group.add(g);
    colliders.push({ mesh: g, box: new THREE.Box3().setFromObject(g), type: 'car', isVaultable: true, blocksBullets: true, blocksMovement: true });
  };

  addCar(14, 32, 0.5, true);
  addFlippedTruck(-22, 14, 0.3);
  addTankHull(-16, 50, -0.4);
  addCar(56, -8, -0.6, true);
  addCar(-52, 20, 0.9, false);

  return { group, colliders };
}

// ------------------------------------------------------------
// Street lamps — thin poles with glowing heads along both roads. Added to the
// static group so they merge into the shared metal/glow materials (zero extra
// draw calls). Decorative only (no colliders).
// ------------------------------------------------------------
function buildStreetLamps(mats: MapMaterials, parent: THREE.Group) {
  const lamp = (x: number, z: number, axis: 'x' | 'z', dir: 1 | -1) => {
    const h = terrainHeight(x, z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.13, 6.4, 6), mats.metalDark);
    pole.position.set(x, h + 3.2, z);
    parent.add(pole);

    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.6, 6), mats.metalDark);
    if (axis === 'x') arm.rotation.z = Math.PI / 2;
    else arm.rotation.x = Math.PI / 2;
    arm.position.set(x + (axis === 'x' ? dir * 0.75 : 0), h + 6.15, z + (axis === 'z' ? dir * 0.75 : 0));
    parent.add(arm);

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(axis === 'x' ? 0.6 : 0.42, 0.15, axis === 'z' ? 0.6 : 0.42),
      mats.windowGlow
    );
    head.position.set(x + (axis === 'x' ? dir * 1.45 : 0), h + 6.0, z + (axis === 'z' ? dir * 1.45 : 0));
    parent.add(head);
  };

  // Along the north-south road (x = ROAD_A_X), alternating sides.
  for (let z = -80; z <= 80; z += 16) {
    lamp(ROAD_A_X - 5.4, z, 'x', 1);
    lamp(ROAD_A_X + 5.4, z + 8, 'x', -1);
  }
  // Along the east-west road (z = ROAD_B_Z), alternating sides.
  for (let x = -80; x <= 80; x += 16) {
    lamp(x, ROAD_B_Z - 5.4, 'z', 1);
    lamp(x + 8, ROAD_B_Z + 5.4, 'z', -1);
  }
}

// ------------------------------------------------------------
// Instanced vegetation
// ------------------------------------------------------------
function buildVegetation(scene: THREE.Scene, mats: MapMaterials, rng: () => number, hFn: (x: number, z: number) => number, warzone: boolean) {
  const veg = new THREE.Group();
  veg.name = 'vegetation';
  const skipZone = (x: number, z: number) => {
    if (Math.abs(x) > 96 || Math.abs(z) > 96) return true;
    if (warzone && roadDist(x, z) < 6) return true;
    if (warzone && riverDist(x, z) < 8) return true;
    return false;
  };
  const place = (attempts: number, cb: (x: number, z: number) => boolean) => {
    const pts: [number, number][] = [];
    for (let i = 0; i < attempts && pts.length < 400; i++) {
      const x = (rng() * 2 - 1) * 96;
      const z = (rng() * 2 - 1) * 96;
      if (skipZone(x, z)) continue;
      if (pts.some(([px, pz]) => Math.hypot(px - x, pz - z) < 2.2)) continue;
      if (cb(x, z)) pts.push([x, z]);
    }
    return pts;
  };

  // Pines
  const pines = place(60, () => rng() > 0.5);
  {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 3.0, 6);
    const trunks = new THREE.InstancedMesh(trunkGeo, mats.trunk, pines.length);
    const c1 = new THREE.InstancedMesh(new THREE.ConeGeometry(2.3, 3.2, 7), mats.foliageDark, pines.length);
    const c2 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.8, 2.6, 7), mats.foliage, pines.length);
    const c3 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.3, 2.0, 7), mats.foliage, pines.length);
    const m = new THREE.Matrix4();
    pines.forEach(([x, z], i) => {
      const s = 0.8 + rng() * 0.6;
      const h = hFn(x, z);
      m.makeTranslation(x, h + 1.5 * s, z); trunks.setMatrixAt(i, m);
      m.makeTranslation(x, h + 3.6 * s, z); c1.setMatrixAt(i, m);
      m.makeTranslation(x, h + 5.4 * s, z); c2.setMatrixAt(i, m);
      m.makeTranslation(x, h + 6.8 * s, z); c3.setMatrixAt(i, m);
    });
    [trunks, c1, c2, c3].forEach((inst) => { inst.castShadow = true; inst.instanceMatrix.needsUpdate = true; veg.add(inst); });
    trunkGeo.dispose();
  }

  // Oaks
  const oaks = place(24, () => true);
  {
    const trunkGeo = new THREE.CylinderGeometry(0.28, 0.4, 2.4, 7);
    const trunks = new THREE.InstancedMesh(trunkGeo, mats.trunk, oaks.length);
    const canopy = new THREE.InstancedMesh(new THREE.SphereGeometry(2.4, 8, 6), mats.foliage, oaks.length);
    const canopy2 = new THREE.InstancedMesh(new THREE.SphereGeometry(1.8, 8, 6), mats.foliageDark, oaks.length);
    const m = new THREE.Matrix4();
    oaks.forEach(([x, z], i) => {
      const s = 0.9 + rng() * 0.5;
      const h = hFn(x, z);
      m.makeTranslation(x, h + 1.2 * s, z); trunks.setMatrixAt(i, m);
      m.makeTranslation(x + 0.3, h + 2.8 * s, z); canopy.setMatrixAt(i, m);
      m.makeTranslation(x - 0.8, h + 2.2 * s, z + 0.4); canopy2.setMatrixAt(i, m);
    });
    [trunks, canopy, canopy2].forEach((inst) => { inst.castShadow = true; inst.instanceMatrix.needsUpdate = true; veg.add(inst); });
    trunkGeo.dispose();
  }

  // Dead trees
  const dead = place(14, () => rng() > 0.6);
  {
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 3.6, 6);
    const trunks = new THREE.InstancedMesh(trunkGeo, mats.trunk, dead.length);
    const branchGeo = new THREE.CylinderGeometry(0.06, 0.09, 2.2, 5);
    const branches = new THREE.InstancedMesh(branchGeo, mats.trunk, dead.length * 3);
    const m = new THREE.Matrix4();
    dead.forEach(([x, z], i) => {
      const h = hFn(x, z);
      m.makeTranslation(x, h + 1.8, z); trunks.setMatrixAt(i, m);
      for (let b = 0; b < 3; b++) {
        m.compose(
          new THREE.Vector3(x + (rng() - 0.5) * 1.4, h + 2.2 + rng() * 1.4, z + (rng() - 0.5) * 1.4),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4 + rng() * 0.8, rng() * Math.PI, 0)),
          new THREE.Vector3(1, 1, 1)
        );
        branches.setMatrixAt(i * 3 + b, m);
      }
    });
    [trunks, branches].forEach((inst) => { inst.castShadow = true; inst.instanceMatrix.needsUpdate = true; veg.add(inst); });
    trunkGeo.dispose();
    branchGeo.dispose();
  }

  // Bushes
  const bushes = place(26, () => true);
  {
    const bush = new THREE.InstancedMesh(new THREE.SphereGeometry(0.9, 7, 5), mats.foliageDark, bushes.length);
    const m = new THREE.Matrix4();
    bushes.forEach(([x, z], i) => {
      const h = hFn(x, z);
      const s = 0.7 + rng() * 0.7;
      m.compose(
        new THREE.Vector3(x, h + 0.5 * s, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * Math.PI, 0)),
        new THREE.Vector3(s * 1.3, s * 0.7, s * 1.3)
      );
      bush.setMatrixAt(i, m);
    });
    bush.castShadow = true;
    bush.instanceMatrix.needsUpdate = true;
    veg.add(bush);
  }

  // Tall grass — dense pass with per-blade tilt for a wild meadow look.
  const grass = place(300, () => true);
  {
    const blade = new THREE.InstancedMesh(new THREE.ConeGeometry(0.14, 0.9, 4), mats.foliage, grass.length);
    const m = new THREE.Matrix4();
    grass.forEach(([x, z], i) => {
      const h = hFn(x, z);
      const s = 0.7 + rng() * 0.8;
      m.compose(
        new THREE.Vector3(x, h + 0.3 * s, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.4, rng() * Math.PI, (rng() - 0.5) * 0.4)),
        new THREE.Vector3(s, s, s)
      );
      blade.setMatrixAt(i, m);
    });
    blade.instanceMatrix.needsUpdate = true;
    veg.add(blade);
  }

  // Short tuft undergrowth for depth between the tall blades.
  const tufts = place(220, () => true);
  {
    const tuft = new THREE.InstancedMesh(new THREE.ConeGeometry(0.18, 0.5, 4), mats.foliageDark, tufts.length);
    const m = new THREE.Matrix4();
    tufts.forEach(([x, z], i) => {
      const h = hFn(x, z);
      const s = 0.6 + rng() * 0.6;
      m.compose(
        new THREE.Vector3(x, h + 0.18 * s, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * Math.PI, 0)),
        new THREE.Vector3(s, s, s)
      );
      tuft.setMatrixAt(i, m);
    });
    tuft.instanceMatrix.needsUpdate = true;
    veg.add(tuft);
  }

  // Wildflowers — per-instance colored dots scattered through the grass.
  const flowers = place(150, () => true);
  {
    const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 });
    const flower = new THREE.InstancedMesh(new THREE.SphereGeometry(0.09, 5, 4), flowerMat, flowers.length);
    const petalColors = [0xffd54a, 0xf8fafc, 0xe879f9, 0xf87171, 0x93c5fd];
    const m = new THREE.Matrix4();
    flowers.forEach(([x, z], i) => {
      const h = hFn(x, z);
      m.makeTranslation(x, h + 0.08, z);
      flower.setMatrixAt(i, m);
      flower.setColorAt(i, new THREE.Color(petalColors[i % petalColors.length]));
    });
    flower.instanceMatrix.needsUpdate = true;
    if (flower.instanceColor) flower.instanceColor.needsUpdate = true;
    veg.add(flower);
  }

  // Rocks
  const rocks = place(34, () => rng() > 0.4);
  {
    const rock = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), mats.rock, rocks.length);
    const m = new THREE.Matrix4();
    rocks.forEach(([x, z], i) => {
      const h = hFn(x, z);
      const s = 0.5 + rng() * 1.4;
      m.compose(
        new THREE.Vector3(x, h + s * 0.3, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI)),
        new THREE.Vector3(s * 1.3, s * 0.7, s)
      );
      rock.setMatrixAt(i, m);
    });
    rock.castShadow = true;
    rock.instanceMatrix.needsUpdate = true;
    veg.add(rock);
  }

  scene.add(veg);
}

// ------------------------------------------------------------
// Atmosphere — dust motes + god rays
// ------------------------------------------------------------
function buildAtmosphere(scene: THREE.Scene, meta: MapMetadata) {
  const count = 140;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() * 2 - 1) * 95;
    positions[i * 3 + 1] = Math.random() * 18;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * 95;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xdfe7ee, size: 0.22, transparent: true, opacity: 0.3,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
  }));
  dust.name = 'dust';
  scene.add(dust);

  const sunPos = new THREE.Vector3().setFromSphericalCoords(
    220, THREE.MathUtils.degToRad(90 - meta.sunElevation), THREE.MathUtils.degToRad(meta.sunAzimuth)
  );
  const rayGeo = new THREE.CylinderGeometry(6, 26, 220, 10, 1, true);
  const rayMat = new THREE.MeshBasicMaterial({
    color: meta.sunColor, transparent: true, opacity: 0.06,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false
  });
  const rays = new THREE.Mesh(rayGeo, rayMat);
  rays.position.copy(sunPos).multiplyScalar(0.5);
  rays.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sunPos.clone().normalize().multiplyScalar(-1));
  rays.name = 'godRays';
  scene.add(rays);

  // Soft ground-hugging mist pools over the river and low ground. The radial
  // alpha texture is generated at runtime (no external assets); headless
  // contexts simply get faint additive discs. All pools bake into ONE mesh to
  // keep the draw-call budget intact.
  const mistTex = makeRadialTexture();
  const mistSpots: [number, number, number, number][] = [
    [-40, -4, 30, 11], [-28, -30, 22, 9], [-10, -70, 26, 10],
    [24, -40, 20, 9], [58, 52, 24, 10], [-60, -18, 22, 9]
  ];
  const mistGeos: THREE.BufferGeometry[] = [];
  mistSpots.forEach(([mx, mz, mw, md]) => {
    const g = new THREE.PlaneGeometry(mw, md, 1, 1);
    g.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(mx, 0.55, mz));
    mistGeos.push(g);
  });
  const mistMerged = mergeGeometries(mistGeos, false) ?? new THREE.BufferGeometry();
  mistGeos.forEach((g) => g.dispose());
  const mist = new THREE.Mesh(mistMerged, new THREE.MeshBasicMaterial({
    color: '#c9d8e4', transparent: true, opacity: 0.09, map: mistTex,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false
  }));
  mist.name = 'mist';
  scene.add(mist);
}

// Procedural radial-gradient texture (white centre -> transparent rim), used for
// soft mist pools. Generated entirely in code — no external image assets.
let cachedMistTex: THREE.CanvasTexture | null = null;
function makeRadialTexture(): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  if (cachedMistTex) return cachedMistTex;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) return null;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.32)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  cachedMistTex = tex;
  return tex;
}

// ------------------------------------------------------------
// Gradient sky dome + sun glow (fully procedural, no textures)
// ------------------------------------------------------------
function buildSky(scene: THREE.Scene, meta: MapMetadata, sunDir: THREE.Vector3) {
  const R = 520;

  // Dusk colour ramp: deep zenith -> cool horizon base -> warm glow toward the
  // sun azimuth -> deeper cool on the opposite side. Below the horizon the dome
  // fades to a dark ground tint so there is never a visible seam.
  const zenith = new THREE.Color(meta.skyColor).offsetHSL(0.02, 0.1, -0.03);
  const horizon = new THREE.Color(meta.fogColor);
  const warmGlow = new THREE.Color(meta.sunColor);
  const coolHorizon = new THREE.Color(meta.hemisphereSky).multiplyScalar(0.85);
  const groundTint = horizon.clone().multiplyScalar(0.42);
  const sunH = new THREE.Vector3(sunDir.x, 0, sunDir.z);
  if (sunH.lengthSq() < 1e-6) sunH.set(1, 0, 0);
  sunH.normalize();

  const geo = new THREE.SphereGeometry(R, 32, 16);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const t = THREE.MathUtils.clamp(y / R, -1, 1);

    if (t >= 0) {
      // Vertical: horizon -> zenith (non-linear for a taller sky feel).
      tmp.copy(horizon).lerp(zenith, Math.pow(t, 0.72));
      // Azimuthal: warm toward the sun, cool away from it, strongest at the horizon.
      const hlen = Math.hypot(x, z);
      const align = hlen < 1e-4 ? 0 : (x * sunH.x + z * sunH.z) / hlen;
      const horizonFall = Math.pow(1 - t, 1.6);
      tmp.lerp(warmGlow, Math.max(0, align) * 0.5 * horizonFall);
      tmp.lerp(coolHorizon, Math.max(0, -align) * 0.32 * horizonFall);
    } else {
      tmp.copy(horizon).lerp(groundTint, Math.min(1, -t * 1.4));
    }

    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false
  }));
  dome.name = 'skyDome';
  dome.renderOrder = -10;
  scene.add(dome);

  // Layered sun: bright core + inner glow + wide corona (all unlit and
  // unaffected by fog/tonemapping so they stay crisp against the dome).
  const sunPos = sunDir.clone().multiplyScalar(R * 0.88);

  const core = new THREE.Mesh(
    new THREE.SphereGeometry(13, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff8e8, fog: false, toneMapped: false })
  );
  core.position.copy(sunPos);
  core.name = 'sunCore';
  scene.add(core);

  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(30, 16, 12),
    new THREE.MeshBasicMaterial({
      color: meta.sunColor, transparent: true, opacity: 0.42, fog: false, toneMapped: false,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  glow.position.copy(sunPos);
  glow.name = 'sunGlow';
  scene.add(glow);

  const corona = new THREE.Mesh(
    new THREE.SphereGeometry(72, 16, 12),
    new THREE.MeshBasicMaterial({
      color: meta.sunColor, transparent: true, opacity: 0.15, fog: false, toneMapped: false,
      blending: THREE.AdditiveBlending, depthWrite: false
    })
  );
  corona.position.copy(sunPos);
  corona.name = 'sunCorona';
  scene.add(corona);

  // Early stars for dusk/night themes — sparse, faint and only above the horizon.
  if (meta.theme === 'dusk' || meta.theme === 'night') {
    const starCount = 150;
    const starPos = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const dir = new THREE.Vector3(
        Math.random() * 2 - 1,
        Math.random() * 0.9 + 0.1,
        Math.random() * 2 - 1
      ).normalize();
      dir.multiplyScalar(R * 0.97);
      starPos[i * 3] = dir.x;
      starPos[i * 3 + 1] = dir.y;
      starPos[i * 3 + 2] = dir.z;
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true,
      opacity: 0.65, fog: false, toneMapped: false, depthWrite: false
    }));
    stars.name = 'stars';
    stars.renderOrder = -9;
    scene.add(stars);
  }
}

// ------------------------------------------------------------
// Loot items — each item renders as 2 draw calls (marker ring + one
// vertex-coloured body mesh) instead of 4-6.
// ------------------------------------------------------------
const LOOT_BODY_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.4 });

function buildLootItem(
  scene: THREE.Scene, id: string, type: LootItem3D['type'],
  nameAr: string, icon: string, color: string, x: number, z: number,
  hFn: (x: number, z: number) => number,
  weaponType?: WeaponType, grenadeType?: GrenadeType
): LootItem3D {
  const group = new THREE.Group();
  const y = hFn(x, z);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.55, 0.78, 20),
    new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.9 })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.04;
  group.add(ring);

  const pulse = new THREE.PointLight(color, 1.2, 5, 2);
  pulse.position.y = 0.8;
  group.add(pulse);

  // Collect every body part as a painted, world-transformed geometry, then
  // collapse them into a single vertex-coloured mesh.
  const pieces: THREE.BufferGeometry[] = [];
  const part = (geo: THREE.BufferGeometry, c: string, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => {
    const col = new THREE.Color(c);
    const cnt = geo.getAttribute('position').count;
    const arr = new Float32Array(cnt * 3);
    for (let i = 0; i < cnt; i++) {
      arr[i * 3] = col.r;
      arr[i * 3 + 1] = col.g;
      arr[i * 3 + 2] = col.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    geo.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(px, py, pz),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      new THREE.Vector3(sx, sy, sz)
    ));
    pieces.push(geo);
  };

  if (weaponType === 'rpg') {
    part(new THREE.CylinderGeometry(0.07, 0.07, 1.3, 8), '#2c5a34', 0, 0.3, 0, 0, 0, Math.PI / 2);
    part(new THREE.ConeGeometry(0.15, 0.34, 8), '#9a3412', 0.74, 0.3, 0, 0, 0, -Math.PI / 2);
  } else if (weaponType === 'awm' || weaponType === 'shotgun' || weaponType === 'mp5' || weaponType === 'ak47') {
    part(new THREE.BoxGeometry(1.0, 0.16, 0.22), '#11151b', 0, 0.32, 0);
    part(
      new THREE.CylinderGeometry(0.03, 0.03, weaponType === 'awm' ? 1.3 : weaponType === 'shotgun' ? 1.1 : 0.9, 8),
      '#0c1117', 0, 0.32, weaponType === 'awm' ? -0.95 : -0.7, Math.PI / 2, 0, 0
    );
    part(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 8), '#0c1117', 0, 0.46, 0.2, Math.PI / 2, 0, 0);
  } else if (type === 'medkit' || type === 'armor') {
    part(new THREE.BoxGeometry(0.7, 0.5, 0.4), color, 0, 0.42, 0);
    part(new THREE.BoxGeometry(0.16, 0.4, 0.06), '#ffffff', 0, 0.42, 0.22);
    part(new THREE.BoxGeometry(0.4, 0.16, 0.06), '#ffffff', 0, 0.42, 0.22);
  } else if (type === 'grenade') {
    part(new THREE.SphereGeometry(0.2, 10, 8), color, 0, 0.34, 0);
    part(new THREE.CylinderGeometry(0.02, 0.02, 0.16, 6), '#fbbf24', 0, 0.55, 0);
  } else {
    part(new THREE.BoxGeometry(0.55, 0.32, 0.32), color, 0, 0.36, 0);
  }

  const merged = mergeGeometries(pieces, false) ?? new THREE.BufferGeometry();
  const bodyMesh = new THREE.Mesh(merged, LOOT_BODY_MAT);
  bodyMesh.castShadow = true;
  group.add(bodyMesh);

  group.position.set(x, y, z);
  scene.add(group);

  return {
    id, type, weaponType, grenadeType, nameAr, icon, mesh: group,
    pos: new THREE.Vector3(x, y, z), isCollected: false, pulseLight: pulse
  };
}

// ------------------------------------------------------------
// Main entry point
// ------------------------------------------------------------
export function buildMapEnvironment(mapId: MapId, scene: THREE.Scene): MapEnvironment {
  const meta = MAP_CATALOG[mapId];
  const mats = makeMaterials(meta);
  const rng = mulberry32(mapId === 'warzone' ? 20240909 : mapId === 'desert' ? 7331 : 4411);

  const obstacles: CoverObstacle3D[] = [];
  const lootItems: LootItem3D[] = [];
  const ladders: { x: number; z: number; topY: number; baseY: number }[] = [];
  const explosives: CoverObstacle3D[] = [];

  // ---- Lighting rig (cinematic three-point) ----
  // Warm key (sun) + cool sky fill from the opposite azimuth + a soft top-down
  // skylight. Only the sun casts shadows. Everything is tuned so terrain,
  // cover and operators read clearly at range on dim mobile screens.
  scene.fog = new THREE.FogExp2(meta.fogColor, meta.fogDensity);

  const sunDir = new THREE.Vector3().setFromSphericalCoords(
    1, THREE.MathUtils.degToRad(90 - meta.sunElevation), THREE.MathUtils.degToRad(meta.sunAzimuth)
  );

  const hemi = new THREE.HemisphereLight(meta.hemisphereSky, meta.hemisphereGround, 1.15);
  scene.add(hemi);

  const ambient = new THREE.AmbientLight(meta.ambientColor, 0.5);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(meta.sunColor, 3.1);
  sun.position.copy(sunDir).multiplyScalar(120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 20;
  sun.shadow.camera.far = 300;
  const sc = mapId === 'warzone' ? 110 : 70;
  sun.shadow.camera.left = -sc;
  sun.shadow.camera.right = sc;
  sun.shadow.camera.top = sc;
  sun.shadow.camera.bottom = -sc;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // Cool sky fill from the opposite side (no shadow) — lifts the shadowed
  // faces so the dark side of buildings/terrain never goes pitch black.
  const fillDir = sunDir.clone().multiplyScalar(-1);
  fillDir.y = Math.max(0.25, fillDir.y);
  const fill = new THREE.DirectionalLight(meta.hemisphereSky, 0.6);
  fill.position.copy(fillDir).multiplyScalar(120);
  scene.add(fill);

  // Soft skylight from above — separates rooftops and hill crests from the sky.
  const skylight = new THREE.DirectionalLight(meta.hemisphereSky, 0.4);
  skylight.position.set(0, 130, 0);
  scene.add(skylight);

  // Ground
  const { getHeightAt, bounds } = buildGround(scene, meta, mapId, sunDir);

  // Roads + river
  if (mapId === 'warzone') {
    buildRoads(scene, mats);
    buildRiver(scene, mats);
  }

  // Buildings — staged into a single group so their meshes can be merged by
  // material afterwards (see mergeStaticWorld).
  const staticWorld = new THREE.Group();
  staticWorld.name = 'staticWorldRoot';
  scene.add(staticWorld);

  const placeBuilding = (b: BuildingResult) => {
    staticWorld.add(b.group);
    obstacles.push(...b.colliders);
    ladders.push(...b.ladders);
  };

  if (mapId === 'warzone') {
    placeBuilding(buildApartment(mats, -40, 40, 0.6));
    placeBuilding(buildApartment(mats, 40, -40, -0.7));
    placeBuilding(buildHangar(mats, 30, 26, -0.2));
    placeBuilding(buildRuins(mats, -46, -30, 0.5));
    placeBuilding(buildGasStation(mats, 42, 8, -0.1));
    placeBuilding(buildBunker(mats, -30, -66, 0.3));
    placeBuilding(buildContainerYard(mats, -8, -38, -0.15));
    [[-88, -88], [88, -88], [-88, 88], [88, 88]].forEach(([wx, wz]) => {
      placeBuilding(buildWatchtower(mats, wx, wz));
    });
  } else if (mapId === 'desert') {
    placeBuilding(buildRuins(mats, -14, -18, 0.4));
    placeBuilding(buildApartment(mats, 20, 16, -0.5));
  } else {
    placeBuilding(buildHangar(mats, 8, -6, 0));
    placeBuilding(buildContainerYard(mats, -16, 4, 0.2));
  }

  const vehicles = buildDestroyedVehicles(mats, getHeightAt);
  staticWorld.add(vehicles.group);
  obstacles.push(...vehicles.colliders);

  // Street lamps (warzone only) — merged with the static world.
  if (mapId === 'warzone') buildStreetLamps(mats, staticWorld);

  // Collapse all static geometry into one mesh per material (major draw-call
  // win — colliders are Box3 copies, so gameplay is unaffected).
  mergeStaticWorld(scene, staticWorld);

  // Explosive fuel tanks
  obstacles.forEach((o) => { if (o.explosive) explosives.push(o); });

  // Vegetation
  if (mapId !== 'warehouse') {
    buildVegetation(scene, mats, rng, getHeightAt, mapId === 'warzone');
  }

  // Atmosphere particles + gradient sky
  buildAtmosphere(scene, meta);
  buildSky(scene, meta, sunDir);

  // Loot
  const loot = (
    id: string, type: LootItem3D['type'], nameAr: string, icon: string, color: string,
    x: number, z: number, weaponType?: WeaponType, grenadeType?: GrenadeType
  ) => lootItems.push(buildLootItem(scene, id, type, nameAr, icon, color, x, z, getHeightAt, weaponType, grenadeType));

  if (mapId === 'warzone') {
    loot('loot-awm-1', 'weapon', 'قناصة AWM الأسطورية', '🎯', '#10b981', 88, 88, 'awm');
    loot('loot-shotgun-1', 'weapon', 'شوزن قتالي S1897', '💥', '#ef4444', 42, 12, 'shotgun');
    loot('loot-rpg-1', 'weapon', 'قاذف صواريخ RPG-7', '🚀', '#ea580c', 30, 24, 'rpg');
    loot('loot-mp5-1', 'weapon', 'رشاش MP5', '🔫', '#38bdf8', -40, 40, 'mp5');
    loot('loot-ammo-1', 'ammo', 'ذخيرة ثقيلة (+90)', '⚡', '#f59e0b', -2, 2);
    loot('loot-ammo-2', 'ammo', 'ذخيرة ثقيلة (+90)', '⚡', '#f59e0b', -46, -30);
    loot('loot-med-1', 'medkit', 'حقيبة إسعاف', '🩹', '#06b6d4', -30, -66);
    loot('loot-med-2', 'medkit', 'حقيبة إسعاف', '🩹', '#06b6d4', 40, -40);
    loot('loot-armor-1', 'armor', 'درع تكتيكي (Lv.2)', '🛡️', '#3b82f6', 30, 26);
    loot('loot-nade-frag', 'grenade', 'قنبلة شظايا', '💣', '#f97316', -8, -38, undefined, 'frag');
    loot('loot-nade-smoke', 'grenade', 'قنبلة دخانية', '🌫️', '#94a3b8', 42, 8, undefined, 'smoke');
    loot('loot-nade-flash', 'grenade', 'قنبلة صوتية (فلاش)', '⚪', '#fde047', -40, 40, undefined, 'flash');
  } else if (mapId === 'desert') {
    loot('loot-awm', 'weapon', 'قناصة AWM الأسطورية', '🎯', '#10b981', 40, -30, 'awm');
    loot('loot-shotgun', 'weapon', 'شوزن قتالي S1897', '💥', '#ef4444', -30, 30, 'shotgun');
    loot('loot-rpg', 'weapon', 'قاذف صواريخ RPG-7', '🚀', '#ea580c', 0, 0, 'rpg');
    loot('loot-ammo-1', 'ammo', 'ذخيرة ثقيلة (+90)', '⚡', '#f59e0b', 20, -10);
    loot('loot-med-1', 'medkit', 'حقيبة إسعاف', '🩹', '#06b6d4', -20, 10);
    loot('loot-armor-1', 'armor', 'درع تكتيكي (Lv.2)', '🛡️', '#3b82f6', -10, -20);
    loot('loot-nade-frag', 'grenade', 'قنبلة شظايا', '💣', '#f97316', 25, 20, undefined, 'frag');
  } else {
    loot('loot-awm', 'weapon', 'قناصة AWM الأسطورية', '🎯', '#10b981', 12, -14, 'awm');
    loot('loot-shotgun', 'weapon', 'شوزن قتالي S1897', '💥', '#ef4444', -14, -6, 'shotgun');
    loot('loot-rpg', 'weapon', 'قاذف صواريخ RPG-7', '🚀', '#ea580c', 0, 0, 'rpg');
    loot('loot-mp5', 'weapon', 'رشاش MP5', '🔫', '#38bdf8', -16, 8, 'mp5');
    loot('loot-ammo-1', 'ammo', 'ذخيرة ثقيلة (+90)', '⚡', '#f59e0b', 0, 12);
    loot('loot-med-1', 'medkit', 'حقيبة إسعاف', '🩹', '#06b6d4', -4, 6);
    loot('loot-nade-frag', 'grenade', 'قنبلة شظايا', '💣', '#f97316', 8, 4, undefined, 'frag');
  }

  // Safe zone
  const zoneRadius = mapId === 'warzone' ? 142 : 80;
  const zoneGeo = new THREE.CylinderGeometry(zoneRadius, zoneRadius, 60, 56, 1, true);
  const zoneMat = new THREE.MeshBasicMaterial({
    color: 0x06b6d4, transparent: true, opacity: 0.16,
    side: THREE.DoubleSide, depthWrite: false
  });
  const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
  zoneMesh.position.set(0, 30, 0);
  zoneMesh.name = 'zone';
  scene.add(zoneMesh);

  const safeZone: SafeZone3D = {
    center: new THREE.Vector2(0, 0),
    radius: zoneRadius,
    targetRadius: 14,
    targetCenter: new THREE.Vector2(0, 0),
    shrinkSpeed: 1.15,
    mesh: zoneMesh
  };

  const spawnA = new THREE.Vector3(-74, getHeightAt(-74, -74), -74);
  const spawnB = new THREE.Vector3(74, getHeightAt(74, 74), 74);

  return {
    obstacles, safeZone, lootItems, getHeightAt, spawnA, spawnB,
    bounds, sunDirection: sunDir, mapId, colliders: obstacles,
    ladders, explosives
  };
}
