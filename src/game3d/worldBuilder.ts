import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SoldierMesh, SoldierRig, WeaponType } from './types3d';

// ============================================================
// Procedural tactical operator + first-person weapon viewmodels.
// Every mesh is built from primitives — no external models.
// Convention: the character faces -Z (forward). The gun barrel
// points toward -Z so it matches the camera yaw convention used
// in the arena (forward = (-sin yaw, 0, -cos yaw)).
// ============================================================

const SKIN = 0xc9a07a;

interface ZoneMaterials {
  head: THREE.MeshStandardMaterial[];
  body: THREE.MeshStandardMaterial[];
  limb: THREE.MeshStandardMaterial[];
}

export function createSoldierMesh(isEnemy: boolean = false): SoldierMesh {
  const root = new THREE.Group();
  root.name = 'soldier';

  // ---- Palette (dark olive/tactical black + cyan for player, maroon + red for enemy) ----
  const accent = isEnemy ? 0xf43f5e : 0x22d3ee;
  const fabricHex = isEnemy ? 0x3a2226 : 0x242c26;
  const vestHex = isEnemy ? 0x261416 : 0x171c18;
  const metalHex = 0x11151b;

  const mk = (color: number, roughness: number, metalness: number) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness });

  const fabric = mk(fabricHex, 0.92, 0.02);
  const fabricDark = mk(isEnemy ? 0x2a1619 : 0x171d19, 0.94, 0.02);
  const vest = mk(vestHex, 0.85, 0.06);
  const accentMat = mk(accent, 0.45, 0.35);
  const accentDark = mk(isEnemy ? 0xb91c3c : 0x0891b2, 0.55, 0.3);
  const metal = mk(metalHex, 0.5, 0.75);
  const skin = mk(SKIN, 0.8, 0.05);
  const glass = mk(0x0b0f14, 0.12, 0.85);
  const webbing = mk(isEnemy ? 0x58102b : 0x155e75, 0.9, 0.05);

  const zoneMat: ZoneMaterials = { head: [], body: [], limb: [] };

  // Geometry-merge buffers (see add() below).
  interface MergeBucket { mat: THREE.Material; meshes: THREE.Mesh[]; }
  const mergeBuckets = new Map<THREE.Object3D, Map<THREE.Material, MergeBucket>>();
  const seenMats = new Set<THREE.MeshStandardMaterial>();

  const finalize = (parent: THREE.Object3D) => {
    const byMat = mergeBuckets.get(parent);
    if (!byMat) return;
    byMat.forEach((bucket) => {
      const geos = bucket.meshes.map((m) => {
        m.updateMatrix();
        const g = m.geometry.clone();
        g.applyMatrix4(m.matrix);
        return g;
      });
      let merged: THREE.BufferGeometry;
      if (geos.length === 1) {
        merged = geos[0];
      } else {
        merged = mergeGeometries(geos, false) ?? new THREE.BufferGeometry();
        geos.forEach((g) => g.dispose());
      }
      bucket.meshes.forEach((m) => m.geometry.dispose());
      const mesh = new THREE.Mesh(merged, bucket.mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
    });
    mergeBuckets.delete(parent);
  };

  // ---- helpers ----
  const box = (w: number, h: number, d: number, mat: THREE.Material) =>
    new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  const cyl = (rt: number, rb: number, h: number, seg: number, mat: THREE.Material) =>
    new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);

  const add = (mesh: THREE.Mesh, parent: THREE.Object3D, zone: keyof ZoneMaterials, _shadow = true) => {
    // Buffer meshes per (parent, material) instead of adding them directly.
    // At finalize time each bucket collapses into a single merged mesh, which
    // keeps the animated rig hierarchy intact while cutting the per-soldier
    // draw-call count from ~90 down to ~40. Every soldier mesh is
    // single-material, so a plain material key is sufficient.
    const m = mesh.material as THREE.Material;
    if (m instanceof THREE.MeshStandardMaterial && !seenMats.has(m)) {
      seenMats.add(m);
      zoneMat[zone].push(m);
    }
    let byMat = mergeBuckets.get(parent);
    if (!byMat) { byMat = new Map(); mergeBuckets.set(parent, byMat); }
    let bucket = byMat.get(m);
    if (!bucket) { bucket = { mat: m, meshes: [] }; byMat.set(m, bucket); }
    bucket.meshes.push(mesh);
    return mesh;
  };

  // ===================== LEGS =====================
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.14, 0.92, 0);
  legR.position.set(0.14, 0.92, 0);
  root.add(legL, legR);

  [legL, legR].forEach((leg, i) => {
    const sign = i === 0 ? -1 : 1;
    // Thigh
    const thigh = box(0.19, 0.5, 0.21, fabric);
    thigh.position.set(0, -0.25, 0);
    add(thigh, leg, 'limb');
    // Cargo pocket on outer thigh
    const pocket = box(0.04, 0.16, 0.17, fabricDark);
    pocket.position.set(sign * 0.12, -0.28, 0.01);
    add(pocket, leg, 'limb', false);
    // Knee pad
    const knee = box(0.17, 0.15, 0.15, fabricDark);
    knee.position.set(0, -0.5, -0.09);
    add(knee, leg, 'limb');
    // Shin
    const shin = box(0.15, 0.34, 0.16, fabric);
    shin.position.set(0, -0.63, 0);
    add(shin, leg, 'limb');
    // Boot
    const boot = box(0.17, 0.14, 0.3, fabricDark);
    boot.position.set(0, -0.8, -0.05);
    add(boot, leg, 'limb');
    // Boot sole + tread lines — sole bottom rests exactly on the ground (y=0)
    // so the feet never sink into the terrain.
    const sole = box(0.18, 0.04, 0.32, metal);
    sole.position.set(0, -0.9, -0.05);
    add(sole, leg, 'limb');
    for (let t = -0.1; t <= 0.1; t += 0.05) {
      const tread = box(0.19, 0.02, 0.05, metal);
      tread.position.set(0, -0.915, -0.05 + t);
      add(tread, leg, 'limb', false);
    }
  });

  // Thigh holster on right leg (straps + grip)
  const holster = box(0.06, 0.2, 0.15, fabricDark);
  holster.position.set(0.15, -0.34, 0.1);
  add(holster, legR, 'limb');
  const holsterGrip = box(0.05, 0.09, 0.05, metal);
  holsterGrip.position.set(0.15, -0.26, 0.12);
  holsterGrip.rotation.x = 0.3;
  add(holsterGrip, legR, 'limb', false);

  // ===================== TORSO =====================
  const torso = new THREE.Group();
  torso.position.set(0, 1.24, 0);
  root.add(torso);

  // Pelvis / belt
  const pelvis = box(0.4, 0.16, 0.26, fabricDark);
  pelvis.position.set(0, -0.26, 0);
  add(pelvis, torso, 'body');
  const belt = box(0.42, 0.07, 0.27, vest);
  belt.position.set(0, -0.18, 0);
  add(belt, torso, 'body');
  const buckle = box(0.07, 0.08, 0.04, accentMat);
  buckle.position.set(0, -0.18, -0.15);
  add(buckle, torso, 'body', false);

  // Chest core
  const chest = box(0.4, 0.42, 0.26, fabric);
  chest.position.set(0, 0.02, 0);
  add(chest, torso, 'body');

  // Plate carrier vest (front plate)
  const plate = box(0.34, 0.34, 0.09, vest);
  plate.position.set(0, 0.03, -0.16);
  add(plate, torso, 'body');
  // Side plates
  [-1, 1].forEach((s) => {
    const side = box(0.08, 0.3, 0.2, vest);
    side.position.set(s * 0.22, 0.03, 0);
    add(side, torso, 'body');
  });
  // MOLLE webbing rows (thin horizontal straps on vest)
  for (let r = 0; r < 3; r++) {
    const strap = box(0.3, 0.025, 0.03, webbing);
    strap.position.set(0, 0.14 - r * 0.07, -0.21);
    add(strap, torso, 'body', false);
  }

  // 3 chest magazine pouches with visible mag tips
  for (let i = -1; i <= 1; i++) {
    const pouch = box(0.09, 0.13, 0.06, vest);
    pouch.position.set(i * 0.1, 0.14, -0.21);
    add(pouch, torso, 'body');
    const magTip = box(0.06, 0.05, 0.03, accentMat);
    magTip.position.set(i * 0.1, 0.22, -0.23);
    add(magTip, torso, 'body', false);
  }

  // Radio on left shoulder + antenna
  const radio = box(0.09, 0.14, 0.07, vest);
  radio.position.set(-0.25, 0.26, -0.06);
  add(radio, torso, 'body');
  const antenna = cyl(0.006, 0.006, 0.34, 6, accentMat);
  antenna.position.set(-0.25, 0.42, -0.06);
  antenna.rotation.z = -0.25;
  add(antenna, torso, 'body', false);

  // Hydration tube from back over right shoulder
  const tube = cyl(0.02, 0.02, 0.6, 8, webbing);
  tube.position.set(0.17, 0.3, 0.05);
  tube.rotation.z = -0.7;
  add(tube, torso, 'body', false);
  const tubeTip = cyl(0.02, 0.02, 0.1, 8, accentMat);
  tubeTip.position.set(0.22, 0.5, -0.08);
  tubeTip.rotation.z = -0.5;
  add(tubeTip, torso, 'body', false);

  // Shoulder pads
  [-1, 1].forEach((s) => {
    const pad = box(0.17, 0.06, 0.2, vest);
    pad.position.set(s * 0.27, 0.26, 0);
    add(pad, torso, 'body');
  });

  // Backpack
  const pack = box(0.34, 0.44, 0.2, vest);
  pack.position.set(0, 0.0, 0.22);
  add(pack, torso, 'body');
  // Bedroll on top
  const bedroll = cyl(0.09, 0.09, 0.4, 10, fabricDark);
  bedroll.rotation.x = Math.PI / 2;
  bedroll.position.set(0, 0.27, 0.22);
  add(bedroll, torso, 'body');
  // Dangling carabiner
  const carabiner = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 6, 12), metal);
  carabiner.position.set(-0.2, -0.1, 0.33);
  add(carabiner, torso, 'body', false);
  // Pack straps over chest
  [-1, 1].forEach((s) => {
    const strap = box(0.05, 0.4, 0.02, fabricDark);
    strap.position.set(s * 0.16, 0.05, -0.13);
    add(strap, torso, 'body', false);
  });

  // ===================== HEAD =====================
  const head = new THREE.Group();
  head.position.set(0, 1.62, 0);
  root.add(head);

  // Balaclava-wrapped head
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.145, 16, 12), fabricDark);
  add(skull, head, 'head');
  // Jaw / chin detail
  const jaw = box(0.15, 0.09, 0.14, fabric);
  jaw.position.set(0, -0.11, -0.03);
  add(jaw, head, 'head', false);
  // Eye strip (goggles / glasses)
  const goggles = box(0.22, 0.07, 0.04, glass);
  goggles.position.set(0, 0.02, -0.14);
  add(goggles, head, 'head');
  // Tactical helmet (dome)
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.6),
    vest
  );
  helmet.position.set(0, 0.05, 0);
  add(helmet, head, 'head');
  // Helmet rail + NVG mount (stowed up)
  const rail = box(0.18, 0.02, 0.05, metal);
  rail.position.set(0, 0.14, -0.13);
  add(rail, head, 'head', false);
  const nvgMount = box(0.08, 0.07, 0.06, accentDark);
  nvgMount.position.set(0, 0.19, -0.14);
  add(nvgMount, head, 'head');
  // Mic boom
  const mic = cyl(0.008, 0.008, 0.12, 6, accentMat);
  mic.position.set(0.16, 0.02, -0.1);
  mic.rotation.z = 0.6;
  add(mic, head, 'head', false);
  // Ear protectors
  [-1, 1].forEach((s) => {
    const ear = box(0.03, 0.09, 0.09, vest);
    ear.position.set(s * 0.16, 0.0, 0.0);
    add(ear, head, 'head');
  });

  // ===================== ARMS =====================
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.44, 1.44, 0);
  armR.position.set(0.44, 1.44, 0);
  root.add(armL, armR);

  [armL, armR].forEach((arm) => {
    // Upper arm (sleeve)
    const upper = box(0.14, 0.32, 0.15, fabric);
    upper.position.set(0, -0.16, 0);
    add(upper, arm, 'limb');
    // Rolled sleeve cuff
    const cuff = cyl(0.09, 0.09, 0.05, 8, fabricDark);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.set(0, -0.33, 0);
    add(cuff, arm, 'limb');
    // Elbow pad
    const elbow = box(0.12, 0.1, 0.11, vest);
    elbow.position.set(0, -0.36, 0.09);
    add(elbow, arm, 'limb', false);
    // Forearm (lighter sleeve)
    const forearm = box(0.11, 0.28, 0.12, fabricDark);
    forearm.position.set(0, -0.55, 0);
    add(forearm, arm, 'limb');
    // Tactical glove
    const glove = box(0.11, 0.1, 0.13, fabric);
    glove.position.set(0, -0.72, 0);
    add(glove, arm, 'limb');
    // Knuckle accent
    const knuckle = box(0.12, 0.03, 0.05, accentMat);
    knuckle.position.set(0, -0.73, -0.08);
    add(knuckle, arm, 'limb', false);
  });

  // ===================== WEAPON (in recoil group) =====================
  const recoil = new THREE.Group();
  recoil.position.set(0.3, 1.36, 0.34);
  root.add(recoil);

  const gun = new THREE.Group();
  recoil.add(gun);
  const gunMetal = mk(0x0c1117, 0.35, 0.8);
  const gunPoly = mk(0x1a1f26, 0.55, 0.35);
  const wood = mk(0x6b4a2b, 0.6, 0.15);

  // Receiver
  const receiver = box(0.09, 0.12, 0.4, gunMetal);
  receiver.position.set(0, 0.02, -0.05);
  add(receiver, gun, 'body', false);
  // Handguard
  const handguard = box(0.08, 0.09, 0.3, wood);
  handguard.position.set(0, 0.0, -0.36);
  add(handguard, gun, 'body', false);
  // Barrel
  const barrel = cyl(0.022, 0.022, 0.4, 10, gunMetal);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.02, -0.62);
  add(barrel, gun, 'body', false);
  // Muzzle brake
  const brake = cyl(0.03, 0.026, 0.09, 10, gunMetal);
  brake.rotation.x = Math.PI / 2;
  brake.position.set(0, 0.02, -0.82);
  add(brake, gun, 'body', false);
  // Curved magazine
  const mag = new THREE.Group();
  mag.position.set(0, -0.12, -0.05);
  const magBody = box(0.06, 0.2, 0.11, gunPoly);
  magBody.position.set(0, -0.02, 0);
  magBody.rotation.x = 0.18;
  add(magBody, mag, 'body', false);
  gun.add(mag);
  // Stock
  const stock = box(0.07, 0.1, 0.26, gunPoly);
  stock.position.set(0, 0.02, 0.28);
  add(stock, gun, 'body', false);
  // Pistol grip
  const grip = box(0.05, 0.11, 0.06, gunPoly);
  grip.position.set(0, -0.08, 0.12);
  grip.rotation.x = 0.25;
  add(grip, gun, 'body', false);
  // Vertical foregrip
  const foregrip = box(0.04, 0.09, 0.05, gunPoly);
  foregrip.position.set(0, -0.06, -0.4);
  foregrip.rotation.x = 0.15;
  add(foregrip, gun, 'body', false);
  // Red-dot optic on rail
  const opticBody = box(0.05, 0.05, 0.1, gunMetal);
  opticBody.position.set(0, 0.1, -0.08);
  add(opticBody, gun, 'body', false);
  const opticGlass = cyl(0.022, 0.022, 0.02, 10, glass);
  opticGlass.rotation.z = Math.PI / 2;
  opticGlass.position.set(0, 0.1, -0.12);
  add(opticGlass, gun, 'body', false);
  // Accent stripe on receiver
  const stripe = box(0.092, 0.015, 0.1, accentMat);
  stripe.position.set(0, 0.085, -0.05);
  add(stripe, gun, 'body', false);

  // Muzzle anchor + flash light
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0.3, 1.36, -0.5);
  root.add(muzzle);
  const muzzleLight = new THREE.PointLight(0xffd27a, 0, 9, 1.8);
  muzzleLight.position.copy(muzzle.position);
  root.add(muzzleLight);

  // Muzzle flash mesh (hidden until firing)
  const flashMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.34, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  flashMesh.rotation.x = Math.PI / 2;
  flashMesh.position.set(0, 0, -0.18);
  flashMesh.visible = false;
  muzzle.add(flashMesh);

  // Bake buffered parts into merged geometry per material. The rig hierarchy
  // (torso/head/limbs/gun) stays fully animatable — only the draw calls drop.
  [legL, legR, armL, armR, torso, head, mag, gun].forEach(finalize);

  // ===================== HIT ZONES =====================
  // Attached to the animated groups so they follow crouch/prone poses.
  const hitHead = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
  hitHead.userData.isHitZone = 'head';
  head.add(hitHead);

  const hitBody = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.85, 0.42), new THREE.MeshBasicMaterial({ visible: false }));
  hitBody.position.set(0, -0.1, 0);
  hitBody.userData.isHitZone = 'body';
  torso.add(hitBody);

  const hitLimbs: THREE.Mesh[] = [];
  [legL, legR, armL, armR].forEach((limb, i) => {
    const hb = new THREE.Mesh(
      new THREE.BoxGeometry(i < 2 ? 0.22 : 0.18, 0.9, 0.26),
      new THREE.MeshBasicMaterial({ visible: false })
    );
    hb.position.set(0, i < 2 ? -0.45 : -0.4, 0);
    hb.userData.isHitZone = 'limb';
    limb.add(hb);
    hitLimbs.push(hb);
  });

  // ---- skin switching ----
  const palette = { fabric, fabricDark, vest, accentMat, accentDark, metal, glass, webbing, skin, gunMetal, gunPoly, wood };
  // Readability: faint self-illumination so operators read against the terrain
  // at range without looking emissive up close.
  fabric.emissive.set(isEnemy ? 0x1c0710 : 0x07120c);
  fabric.emissiveIntensity = isEnemy ? 0.34 : 0.16;
  vest.emissive.set(isEnemy ? 0x150509 : 0x050a07);
  vest.emissiveIntensity = isEnemy ? 0.3 : 0.14;
  const baseEmissive: WeakMap<THREE.MeshStandardMaterial, number> = new WeakMap();
  const collect = (ms: THREE.MeshStandardMaterial[]) =>
    ms.forEach((m) => { if (!baseEmissive.has(m)) baseEmissive.set(m, m.emissive.getHex()); });

  const setSkin = (enemy: boolean) => {
    const ac = enemy ? 0xf43f5e : 0x22d3ee;
    const acd = enemy ? 0xb91c3c : 0x0891b2;
    fabric.color.set(enemy ? 0x3a2226 : 0x242c26);
    fabricDark.color.set(enemy ? 0x2a1619 : 0x171d19);
    vest.color.set(enemy ? 0x261416 : 0x171c18);
    accentMat.color.set(ac);
    accentDark.color.set(acd);
    webbing.color.set(enemy ? 0x58102b : 0x155e75);
    accentMat.emissive.set(ac);
    fabric.emissive.set(enemy ? 0x1c0710 : 0x07120c);
    fabric.emissiveIntensity = enemy ? 0.34 : 0.16;
    vest.emissive.set(enemy ? 0x150509 : 0x050a07);
    vest.emissiveIntensity = enemy ? 0.3 : 0.14;
  };

  const flashTimers: number[] = [];
  const flashHit = (zone: 'head' | 'body' | 'limb') => {
    const mats = zoneMat[zone];
    collect(mats);
    mats.forEach((m) => {
      m.emissive.set(0xff2222);
      m.emissiveIntensity = 1.4;
    });
    const t = window.setTimeout(() => {
      mats.forEach((m) => {
        m.emissive.setHex(baseEmissive.get(m) ?? 0);
        m.emissiveIntensity = 0;
      });
    }, 90);
    flashTimers.push(t);
  };

  const setMuzzleFlash = (on: boolean) => {
    flashMesh.visible = on;
    if (on) flashMesh.rotation.z = Math.random() * Math.PI * 2;
    muzzleLight.intensity = on ? 6 : 0;
  };

  const rig: SoldierRig = { leftLeg: legL, rightLeg: legR, leftArm: armL, rightArm: armR, recoil };

  return {
    root, torso, head, gun, muzzle, muzzleLight, rig,
    hitHead, hitBody, hitLimbs, accentColor: accent,
    setSkin, flashHit, setMuzzleFlash
  };
}

// ============================================================
// First-person weapon viewmodels (distinct silhouette per weapon)
// ============================================================
export interface WeaponViewModel {
  group: THREE.Group;
  muzzle: THREE.Object3D;
  mag: THREE.Group;
  bolt: THREE.Group;
  muzzleLight: THREE.PointLight;
}

export function createWeaponViewModel(type: WeaponType): WeaponViewModel {
  const group = new THREE.Group();
  const gunMetal = new THREE.MeshStandardMaterial({ color: 0x0c1117, roughness: 0.35, metalness: 0.85 });
  const gunPoly = new THREE.MeshStandardMaterial({ color: 0x1a1f26, roughness: 0.55, metalness: 0.35 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.6, metalness: 0.15 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x0b0f14, roughness: 0.12, metalness: 0.85 });

  const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
    return m;
  };
  const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, seg = 12) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };

  const mag = new THREE.Group();
  const bolt = new THREE.Group();
  group.add(mag, bolt);

  // Barrel axis points -Z (out of the screen / toward target)
  if (type === 'ak47') {
    box(0.07, 0.1, 0.34, gunMetal, 0, 0, 0.05);                 // receiver
    box(0.06, 0.08, 0.26, wood, 0, 0.01, -0.26);                // handguard
    const b = cyl(0.02, 0.02, 0.42, gunMetal, 0, 0.01, -0.55);  b.rotation.x = Math.PI / 2;
    cyl(0.028, 0.024, 0.08, gunMetal, 0, 0.01, -0.78).rotation.x = Math.PI / 2; // muzzle
    const m = box(0.05, 0.16, 0.09, gunPoly, 0, -0.1, 0.02);    m.rotation.x = 0.2; m.userData.mag = true; mag.add(m);
    box(0.06, 0.09, 0.24, wood, 0, 0.01, 0.26);                 // stock
    box(0.04, 0.1, 0.05, gunPoly, 0, -0.08, 0.14).rotation.x = 0.3; // grip
    box(0.04, 0.06, 0.1, gunMetal, 0, 0.07, 0);                 // iron sight block
  } else if (type === 'awm') {
    box(0.07, 0.1, 0.36, gunPoly, 0, 0, 0.02);                  // receiver
    const b = cyl(0.02, 0.02, 0.72, gunMetal, 0, 0.02, -0.6);   b.rotation.x = Math.PI / 2; // long barrel
    box(0.03, 0.05, 0.08, gunMetal, 0, -0.07, -0.9);            // muzzle brake
    const m = box(0.05, 0.13, 0.08, gunPoly, 0, -0.1, 0.04);    m.rotation.x = 0.25; m.userData.mag = true; mag.add(m);
    box(0.06, 0.1, 0.3, gunPoly, 0, 0.02, 0.3);                 // stock
    const scope = cyl(0.04, 0.04, 0.3, gunMetal, 0, 0.1, 0.02); scope.rotation.x = Math.PI / 2;
    cyl(0.045, 0.045, 0.03, glass, 0, 0.1, -0.12).rotation.x = Math.PI / 2;
    const bl = cyl(0.02, 0.02, 0.12, gunMetal, 0.06, -0.02, 0.1); bl.rotation.z = Math.PI / 2; bl.userData.bolt = true; bolt.add(bl);
  } else if (type === 'shotgun') {
    const barrel = cyl(0.035, 0.035, 0.7, gunMetal, 0, 0.02, -0.4); barrel.rotation.x = Math.PI / 2;
    const tube = cyl(0.028, 0.028, 0.5, gunMetal, 0, -0.05, -0.28); tube.rotation.x = Math.PI / 2;
    box(0.06, 0.09, 0.3, wood, 0, 0, 0.1);                      // receiver
    const pump = box(0.07, 0.07, 0.18, wood, 0, -0.04, -0.35);  pump.userData.bolt = true; bolt.add(pump);
    box(0.05, 0.09, 0.26, wood, 0, 0.01, 0.32);                 // stock
    box(0.04, 0.1, 0.05, gunPoly, 0, -0.08, 0.18).rotation.x = 0.3;
  } else if (type === 'mp5') {
    box(0.06, 0.09, 0.3, gunMetal, 0, 0, 0.02);                 // receiver
    const b = cyl(0.016, 0.016, 0.3, gunMetal, 0, 0.02, -0.28); b.rotation.x = Math.PI / 2;
    box(0.05, 0.06, 0.08, gunMetal, 0, -0.05, -0.42);           // fore
    const m = box(0.045, 0.14, 0.06, gunMetal, 0, -0.1, 0.04);  m.userData.mag = true; mag.add(m);
    box(0.05, 0.07, 0.24, gunPoly, 0, 0.02, 0.22);              // collapsible stock
    box(0.04, 0.09, 0.05, gunPoly, 0, -0.08, 0.12).rotation.x = 0.3;
  } else if (type === 'pistol') {
    box(0.05, 0.07, 0.24, gunMetal, 0, 0, 0);                   // slide
    box(0.04, 0.1, 0.12, gunPoly, 0, -0.08, -0.02).rotation.x = 0.2; // grip
    const m = box(0.04, 0.08, 0.05, gunMetal, 0, -0.06, -0.08); m.userData.mag = true; mag.add(m);
    cyl(0.012, 0.012, 0.05, gunMetal, 0, 0.02, -0.14).rotation.x = Math.PI / 2; // barrel tip
  } else {
    // rpg — green tube + warhead
    const tube = cyl(0.055, 0.055, 0.9, new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.5, metalness: 0.4 }), 0, 0, 0);
    tube.rotation.x = Math.PI / 2;
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.24, 10), new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.4, metalness: 0.5 }));
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, 0, -0.58);
    group.add(cone);
    cyl(0.06, 0.06, 0.1, gunMetal, 0, 0, 0.48).rotation.x = Math.PI / 2;   // rear vent
    box(0.04, 0.1, 0.06, gunPoly, 0, -0.09, 0.1).rotation.x = 0.3;         // grip
    box(0.05, 0.06, 0.08, gunMetal, 0, 0.08, 0.05);                        // sight
  }

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, type === 'rpg' ? -0.66 : type === 'awm' ? -0.95 : type === 'shotgun' ? -0.72 : type === 'mp5' ? -0.4 : type === 'pistol' ? -0.14 : -0.8);
  group.add(muzzle);

  const muzzleLight = new THREE.PointLight(0xffd27a, 0, 8, 1.8);
  muzzleLight.position.copy(muzzle.position);
  group.add(muzzleLight);

  const flashMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.07, 0.26, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  flashMesh.rotation.x = Math.PI / 2;
  flashMesh.position.z = -0.12;
  flashMesh.visible = false;
  muzzle.add(flashMesh);

  return { group, muzzle, mag, bolt, muzzleLight };
}
