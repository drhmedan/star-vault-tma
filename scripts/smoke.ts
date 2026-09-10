// ============================================================
// Headless runtime smoke-test for the 3D tactical shooter.
// Builds every map, soldier and weapon viewmodel in a real
// Three.js scene (no WebGL needed — geometry/material only) and
// verifies structural invariants, triangle budget and draw-call
// budget. Run via:  node scripts/run-smoke.mjs
// ============================================================
import * as THREE from 'three';
import { buildMapEnvironment, MAP_CATALOG } from '../src/game3d/mapRegistry';
import { createSoldierMesh, createWeaponViewModel } from '../src/game3d/worldBuilder';
import { sound } from '../src/audio/soundEngine';
import type { WeaponType } from '../src/game3d/types3d';

type MapId = 'warehouse' | 'desert' | 'warzone';

let failures = 0;
function check(cond: boolean, label: string): void {
  // eslint-disable-next-line no-console
  console.log(`${cond ? '  ✓' : '  ✗ FAIL'} ${label}`);
  if (!cond) failures += 1;
}

function countDrawCalls(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    if (o.visible === false) return;
    const anyO = o as unknown as { isMesh?: boolean; isInstancedMesh?: boolean; isLine?: boolean; isSprite?: boolean; isPoints?: boolean };
    if (anyO.isMesh || anyO.isLine || anyO.isSprite || anyO.isPoints) n += 1;
  });
  return n;
}

function countTriangles(root: THREE.Object3D): number {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!(mesh as unknown as { isMesh?: boolean }).isMesh) return;
    const g = mesh.geometry;
    if (!g) return;
    const base = g.index ? g.index.count / 3 : (g.getAttribute('position')?.count ?? 0) / 3;
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    n += base * inst;
  });
  return Math.round(n);
}

function countGeometries(root: THREE.Object3D): number {
  const set = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if ((mesh as unknown as { isMesh?: boolean }).isMesh && mesh.geometry) set.add(mesh.geometry);
  });
  return set.size;
}

function buildScene(mapId: MapId): void {
  console.log(`\n━━━ Map: ${mapId} (${MAP_CATALOG[mapId].nameAr}) ━━━`);
  const scene = new THREE.Scene();
  const env = buildMapEnvironment(mapId, scene);

  check(env.obstacles.length > 10, `obstacles: ${env.obstacles.length} (expected >10)`);
  check(env.lootItems.length >= 5, `lootItems: ${env.lootItems.length} (expected >=5)`);
  check(env.spawnA && env.spawnB, 'spawnA / spawnB defined');
  const dist = env.spawnA.distanceTo(env.spawnB);
  console.log(`   spawn distance: ${dist.toFixed(1)} m (distant-spawn requirement: >=40)`);
  check(dist >= 40, 'spawns are far apart (>=40 m)');

  // Terrain height sanity
  let hOk = true;
  for (let i = 0; i < 200; i++) {
    const x = (Math.random() * 2 - 1) * env.bounds;
    const z = (Math.random() * 2 - 1) * env.bounds;
    const h = env.getHeightAt(x, z);
    if (!Number.isFinite(h) || Math.abs(h) > 60) hOk = false;
  }
  check(hOk, 'getHeightAt returns finite, bounded heights across the map');

  // Lights / fog / sky
  let lights = 0;
  let fog: THREE.FogExp2 | null = null;
  scene.traverse((o) => { if ((o as THREE.Light).isLight) lights += 1; });
  fog = scene.fog as THREE.FogExp2 | null;
  check(lights >= 3, `lights: ${lights} (hemi + ambient + sun expected)`);
  check(!!fog, `FogExp2 present (density ${fog ? fog.density : 'n/a'})`);

  const ground = scene.getObjectByName('ground');
  check(!!ground, 'ground mesh present');
  const veg = scene.getObjectByName('vegetation');
  if (mapId === 'warehouse') check(true, 'vegetation skipped on warehouse (by design)');
  else check(!!veg, 'vegetation group present');

  // Budgets
  const tris = countTriangles(scene);
  const draw = countDrawCalls(scene);
  const geos = countGeometries(scene);
  console.log(`   triangles: ${tris.toLocaleString()}  draw calls: ${draw}  geometries: ${geos}`);
  check(tris < 100_000, 'triangle budget <100k');
  check(draw < 200, 'draw-call budget <200');
  check(geos < 400, 'unique geometry count <400');

  if (mapId === 'warzone') {
    check(env.ladders.length >= 1, `ladders: ${env.ladders.length}`);
    check(env.explosives.length >= 1, `explosives: ${env.explosives.length}`);
    check(env.colliders === env.obstacles || env.colliders.length > 0, 'colliders alias wired');
    check(scene.getObjectByName('dust') !== null, 'dust motes present');
    check(scene.getObjectByName('godRays') !== null, 'god rays present');
  }

  // Dispose to keep the process light
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if ((mesh as unknown as { isMesh?: boolean }).isMesh) {
      mesh.geometry?.dispose();
      const m = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
      else if (m) m.dispose();
    }
  });
}

console.log('━━━ Maps ━━━');
buildScene('warehouse');
buildScene('desert');
buildScene('warzone');

console.log('━━━ Soldiers ━━━');
for (const enemy of [false, true]) {
  const s = createSoldierMesh(enemy);
  check(!!s.root && !!s.torso && !!s.head && !!s.gun, `${enemy ? 'enemy' : 'player'} soldier core parts present`);
  check(!!s.rig.leftLeg && !!s.rig.rightLeg && !!s.rig.leftArm && !!s.rig.rightArm, 'rig limbs present');
  check(!!s.hitHead && !!s.hitBody && s.hitLimbs.length === 4, 'hit zones (head/body/4 limbs) present');
  check(typeof s.setSkin === 'function' && typeof s.setMuzzleFlash === 'function', 'setSkin / setMuzzleFlash hooks present');
  check(typeof s.setPalette === 'function' && typeof s.setWeaponSkin === 'function', 'setPalette / setWeaponSkin hooks present');
  // Procedural skins must apply without throwing (palette + weapon re-tint).
  s.setPalette({ fabric: 0x2a323c, fabricDark: 0x1e242c, vest: 0x232a33, accent: 0x93c5fd, webbing: 0x475569 });
  s.setWeaponSkin({ poly: 0x150a1f, metal: 0x1a1226, accent: 0x8b5cf6, wood: 0x241238, tube: 0x6d28d9 });
  const tris = countTriangles(s.root);
  console.log(`   ${enemy ? 'enemy' : 'player'} soldier triangles: ${tris}`);
  check(tris < 15_000, 'soldier triangle budget <15k');
}

console.log('\n━━━ Weapon viewmodels ━━━');
const weaponTypes: WeaponType[] = ['ak47', 'awm', 'shotgun', 'mp5', 'pistol', 'rpg'];
for (const wt of weaponTypes) {
  const vm = createWeaponViewModel(wt);
  check(!!vm.group && !!vm.muzzle && !!vm.mag && !!vm.muzzleLight, `viewmodel ${wt}: group/muzzle/mag/muzzleLight present`);
  const tris = countTriangles(vm.group);
  console.log(`   ${wt} viewmodel triangles: ${tris}`);
  check(tris < 8000, `viewmodel ${wt} triangle budget <8k`);
}

console.log('\n━━━ Skins (procedural re-tint) ━━━');
{
  const skinned = createWeaponViewModel('ak47', { poly: 0x2a0a0d, metal: 0x1a0d0f, accent: 0xdc2626, wood: 0x3d1518, tube: 0x7f1d1d });
  const tris = countTriangles(skinned.group);
  check(tris > 0, 'skinned viewmodel renders geometry');
  check(tris < 8000, 'skinned viewmodel triangle budget <8k');
}

console.log('\n━━━ Runtime budget estimate (warzone + 2 soldiers + viewmodel) ━━━');
{
  const scene = new THREE.Scene();
  const env = buildMapEnvironment('warzone', scene);
  const p = createSoldierMesh(false);
  const e = createSoldierMesh(true);
  const vm = createWeaponViewModel('ak47');
  scene.add(p.root, e.root, vm.group);
  const draws = countDrawCalls(scene);
  const tris = countTriangles(scene);
  console.log(`   runtime draw calls: ${draws}   runtime triangles: ${tris.toLocaleString()}`);
  check(draws < 200, 'runtime draw-call budget <200 (map + 2 soldiers + viewmodel)');
  check(tris < 100_000, 'runtime triangle budget <100k');
  void env;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((m as unknown as { isMesh?: boolean }).isMesh) {
      m.geometry?.dispose();
      const mm = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mm)) mm.forEach((x) => x.dispose());
      else if (mm) mm.dispose();
    }
  });
}

console.log('\n━━━ Audio engine (headless no-op path) ━━━');
check(typeof sound.playGunshot === 'function', 'sound API present');
try {
  sound.playGunshot('ak47');
  sound.playSpatialShot('awm', 20, -0.5);
  sound.playExplosion();
  sound.playFootstep('grass', false);
  sound.playReload();
  sound.playCountdown(3);
  sound.playVictory();
  sound.playDefeat();
  check(true, 'all sound methods callable without AudioContext (no throw)');
} catch (err) {
  check(false, `sound methods threw: ${(err as Error).message}`);
}

console.log('\n━━━ Result ━━━');
if (failures === 0) {
  console.log('✅ ALL SMOKE CHECKS PASSED');
  process.exit(0);
} else {
  console.log(`❌ ${failures} CHECK(S) FAILED`);
  process.exit(1);
}
