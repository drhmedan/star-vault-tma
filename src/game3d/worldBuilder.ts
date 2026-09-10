import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SoldierMesh, SoldierRig, WeaponType, SoldierPalette, WeaponSkinColors } from './types3d';

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
  // Weapon parts live in a sub-group so `setWeapon` can swap them without
  // touching the muzzle anchor / light / flash below.
  const gunParts = new THREE.Group();
  gun.add(gunParts);

  // Weapon materials — one shared set across every swap so the merged gun
  // stays a constant handful of draw calls.
  const gunMats: GunMats = {
    metal: mk(0x11161c, 0.35, 0.85),
    poly: mk(0x1a1f26, 0.55, 0.35),
    wood: mk(0x6b4a2b, 0.6, 0.15),
    glass: mk(0x0b0f14, 0.12, 0.85),
    accent: mk(0x3a4046, 0.5, 0.6),
    tube: mk(0x4a5a3a, 0.5, 0.4),
    head: mk(0x9a3412, 0.4, 0.5)
  };

  // Muzzle anchor + flash light (children of the gun so they track the weapon).
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, -0.84);
  gun.add(muzzle);
  const muzzleLight = new THREE.PointLight(0xffd27a, 0, 9, 1.8);
  muzzleLight.position.set(0, 0, 0);
  muzzle.add(muzzleLight);

  // Star-shaped muzzle flash (hidden until firing).
  const flashMesh = makeMuzzleFlash();
  flashMesh.visible = false;
  muzzle.add(flashMesh);

  // Held-weapon builder: swaps the gun mesh to match the equipped weapon,
  // merging per material so draw calls stay constant across swaps.
  const setWeapon = (type: WeaponType) => {
    gunParts.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((m as unknown as { isMesh?: boolean }).isMesh && m.geometry) m.geometry.dispose();
    });
    gunParts.clear();

    const rig = buildGunRig(type, gunMats);

    // Gloved hands gripping the weapon (added to the body so they merge into
    // the same poly bucket — no extra draw calls).
    rig.hands.forEach((h, i) => {
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.12), gunMats.poly);
      hand.position.copy(h);
      if (i === 0) hand.rotation.x = 0.35;
      hand.castShadow = true;
      rig.body.add(hand);
    });

    // Merge the whole rig (body + magazine + bolt + hands) into a few meshes.
    const merged = mergeIntoGroup(rig.group);
    rig.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if ((m as unknown as { isMesh?: boolean }).isMesh && m.geometry) m.geometry.dispose();
    });
    gunParts.add(merged);

    muzzle.position.z = rig.muzzleZ;
  };
  setWeapon('ak47');

  // Bake buffered body parts into merged geometry per material. The rig
  // hierarchy (torso/head/limbs) stays fully animatable — only the draw calls
  // drop. The gun is handled by setWeapon above.
  [legL, legR, armL, armR, torso, head].forEach(finalize);

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

  // Re-tint the operator palette to the equipped skin. The readability
  // emissive (a faint self-glow so soldiers read against terrain) is
  // recomputed from the new fabric/vest colours.
  const tint = (c: number, f: number) => new THREE.Color(c).multiplyScalar(f);
  const setPalette = (p: SoldierPalette) => {
    fabric.color.set(p.fabric);
    fabricDark.color.set(p.fabricDark);
    vest.color.set(p.vest);
    accentMat.color.set(p.accent);
    accentDark.color.copy(tint(p.accent, 0.62));
    webbing.color.set(p.webbing);
    fabric.emissive.copy(tint(p.fabric, 0.1));
    fabric.emissiveIntensity = 0.3;
    vest.emissive.copy(tint(p.vest, 0.1));
    vest.emissiveIntensity = 0.25;
    accentMat.emissive.set(p.accent);
  };

  const setWeaponSkin = (colors: WeaponSkinColors) => {
    gunMats.poly.color.set(colors.poly);
    gunMats.metal.color.set(colors.metal);
    gunMats.accent.color.set(colors.accent);
    gunMats.wood.color.set(colors.wood);
    gunMats.tube.color.set(colors.tube);
  };

  return {
    root, torso, head, gun, muzzle, muzzleLight, rig,
    hitHead, hitBody, hitLimbs, accentColor: accent,
    setSkin, setPalette, setWeaponSkin, flashHit, setMuzzleFlash, setWeapon
  };
}

// ============================================================
// Weapon geometry — a single builder shared by the first-person
// viewmodel and the third-person soldier weapon. Barrel points -Z,
// receiver around the origin, stock toward +Z, grip -Y.
// ============================================================
export interface GunMats {
  metal: THREE.MeshStandardMaterial;
  poly: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
  glass: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
  tube: THREE.MeshStandardMaterial;
  head: THREE.MeshStandardMaterial;
}

interface GunRig {
  group: THREE.Group;
  body: THREE.Group;
  mag: THREE.Group;
  bolt: THREE.Group;
  muzzleZ: number;
  hands: THREE.Vector3[];
}

export function buildGunRig(type: WeaponType, m: GunMats): GunRig {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const mag = new THREE.Group();
  const bolt = new THREE.Group();
  group.add(body, mag, bolt);

  const box = (w: number, h: number, d: number, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, rz = 0, parent: THREE.Object3D = body) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const cyl = (rt: number, rb: number, h: number, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, rz = 0, seg = 12, parent: THREE.Object3D = body) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, 0, rz);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const sph = (r: number, mat: THREE.Material, x = 0, y = 0, z = 0, parent: THREE.Object3D = body) => {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  let muzzleZ = -0.8;
  const hands: THREE.Vector3[] = [];

  if (type === 'ak47') {
    // Receiver + dust cover
    box(0.075, 0.1, 0.42, m.metal, 0, 0.01, -0.02);
    box(0.065, 0.03, 0.36, m.poly, 0, 0.075, -0.02);
    // Barrel + gas tube + front sight post + hood
    cyl(0.02, 0.02, 0.52, m.metal, 0, 0.02, -0.5, Math.PI / 2);
    cyl(0.012, 0.012, 0.36, m.metal, 0, 0.065, -0.3, Math.PI / 2);
    box(0.012, 0.1, 0.014, m.metal, 0, 0.07, -0.62);
    box(0.034, 0.02, 0.02, m.metal, 0, 0.12, -0.62);
    // Wooden handguard (upper + lower)
    box(0.062, 0.03, 0.3, m.wood, 0, 0.05, -0.32);
    box(0.062, 0.06, 0.3, m.wood, 0, -0.015, -0.32);
    // Slanted muzzle brake
    cyl(0.03, 0.025, 0.09, m.metal, 0, 0.02, -0.79, Math.PI / 2);
    // Curved magazine (two angled segments)
    box(0.05, 0.12, 0.085, m.poly, 0, -0.11, -0.02, -0.32, 0, mag);
    box(0.05, 0.09, 0.08, m.poly, 0, -0.19, -0.07, -0.55, 0, mag);
    // Wooden stock + sling swivel
    box(0.058, 0.1, 0.27, m.wood, 0, 0.005, 0.27);
    box(0.05, 0.04, 0.06, m.metal, 0, -0.05, 0.4);
    // Pistol grip + trigger guard
    box(0.04, 0.11, 0.05, m.poly, 0, -0.09, 0.16, 0.25);
    box(0.02, 0.02, 0.07, m.metal, 0, -0.055, 0.05);
    // Rear sight leaf
    box(0.02, 0.03, 0.1, m.metal, 0, 0.075, 0.12);
    muzzleZ = -0.85;
    hands.push(new THREE.Vector3(0, -0.08, 0.15), new THREE.Vector3(0, -0.02, -0.3));
  } else if (type === 'awm') {
    // Receiver + bolt handle (on the right)
    box(0.07, 0.11, 0.44, m.metal, 0, 0.01, 0);
    box(0.065, 0.04, 0.38, m.poly, 0, 0.075, -0.01);
    cyl(0.014, 0.014, 0.1, m.metal, 0.055, -0.01, 0.05, 0, Math.PI / 2, 8, bolt);
    // Long barrel + two bands + brake
    cyl(0.018, 0.018, 0.75, m.metal, 0, 0.02, -0.55, Math.PI / 2);
    cyl(0.03, 0.03, 0.03, m.accent, 0, 0.02, -0.42, Math.PI / 2);
    cyl(0.03, 0.03, 0.03, m.accent, 0, 0.02, -0.75, Math.PI / 2);
    box(0.04, 0.05, 0.09, m.metal, 0, 0.02, -0.97);
    // Scope: tube + objective bell + ocular + lens + rings
    cyl(0.045, 0.045, 0.34, m.metal, 0, 0.115, 0.02, Math.PI / 2);
    cyl(0.055, 0.045, 0.07, m.metal, 0, 0.115, -0.18, Math.PI / 2);
    cyl(0.05, 0.04, 0.06, m.metal, 0, 0.115, 0.2, Math.PI / 2);
    cyl(0.04, 0.04, 0.02, m.glass, 0, 0.115, -0.22, Math.PI / 2);
    box(0.06, 0.03, 0.04, m.accent, 0, 0.115, -0.06);
    box(0.06, 0.03, 0.04, m.accent, 0, 0.115, 0.1);
    // Magazine
    box(0.05, 0.14, 0.08, m.poly, 0, -0.12, 0.02, 0.12, 0, mag);
    // Stock with cheek riser + butt pad
    box(0.06, 0.11, 0.34, m.poly, 0, 0, 0.38);
    box(0.06, 0.06, 0.2, m.poly, 0, 0.09, 0.3);
    box(0.065, 0.12, 0.03, m.poly, 0, 0, 0.56);
    // Folded bipod under the fore-end
    cyl(0.008, 0.008, 0.36, m.metal, -0.035, -0.05, -0.52, 0, 0.08, 6);
    cyl(0.008, 0.008, 0.36, m.metal, 0.035, -0.05, -0.52, 0, -0.08, 6);
    // Grip
    box(0.04, 0.1, 0.05, m.poly, 0, -0.09, 0.16, 0.25);
    muzzleZ = -1.02;
    hands.push(new THREE.Vector3(0, -0.08, 0.15), new THREE.Vector3(0, -0.02, -0.5));
  } else if (type === 'shotgun') {
    // Barrel + tube magazine + bead sight
    cyl(0.03, 0.03, 0.78, m.metal, 0, 0.02, -0.42, Math.PI / 2);
    cyl(0.024, 0.024, 0.56, m.metal, 0, -0.05, -0.3, Math.PI / 2);
    sph(0.014, m.metal, 0, 0.05, -0.8);
    // Pump forend (in bolt group for cycling)
    box(0.065, 0.075, 0.2, m.wood, 0, -0.02, -0.34, 0, 0, bolt);
    // Receiver + trigger guard
    box(0.06, 0.09, 0.32, m.poly, 0, 0, 0.06);
    box(0.02, 0.02, 0.08, m.metal, 0, -0.06, 0.04);
    // Wooden stock
    box(0.05, 0.1, 0.3, m.wood, 0, 0.005, 0.32);
    muzzleZ = -0.82;
    hands.push(new THREE.Vector3(0, -0.09, 0.12), new THREE.Vector3(0, -0.03, -0.34));
  } else if (type === 'mp5') {
    // Receiver + barrel + 3-lug muzzle
    box(0.06, 0.1, 0.34, m.metal, 0, 0.01, 0.02);
    box(0.055, 0.03, 0.3, m.poly, 0, 0.07, 0.02);
    cyl(0.016, 0.016, 0.24, m.metal, 0, 0.02, -0.28, Math.PI / 2);
    cyl(0.021, 0.021, 0.05, m.metal, 0, 0.02, -0.42, Math.PI / 2);
    // Front sight ring + post
    cyl(0.032, 0.032, 0.04, m.metal, 0, 0.06, -0.26, Math.PI / 2);
    box(0.012, 0.06, 0.012, m.metal, 0, 0.085, -0.26);
    // Curved magazine
    box(0.045, 0.15, 0.06, m.poly, 0, -0.12, 0.02, 0.28, 0, mag);
    // Vertical foregrip
    box(0.035, 0.1, 0.05, m.poly, 0, -0.08, -0.2, 0.15);
    // Collapsible stock (butt + two rods)
    box(0.05, 0.09, 0.26, m.poly, 0, 0.02, 0.28);
    cyl(0.008, 0.008, 0.2, m.metal, -0.03, 0.02, 0.16, Math.PI / 2, 0, 6);
    cyl(0.008, 0.008, 0.2, m.metal, 0.03, 0.02, 0.16, Math.PI / 2, 0, 6);
    // Drum rear sight
    cyl(0.035, 0.035, 0.05, m.metal, 0, 0.06, 0.12, Math.PI / 2);
    // Grip
    box(0.035, 0.1, 0.05, m.poly, 0, -0.09, 0.14, 0.28);
    muzzleZ = -0.46;
    hands.push(new THREE.Vector3(0, -0.08, 0.13), new THREE.Vector3(0, -0.05, -0.2));
  } else if (type === 'pistol') {
    // Slide with rear serrations
    box(0.05, 0.07, 0.26, m.metal, 0, 0.02, 0);
    for (let i = 0; i < 3; i++) box(0.051, 0.02, 0.02, m.accent, 0, 0.055, 0.07 - i * 0.03);
    // Frame + barrel tip
    box(0.045, 0.05, 0.22, m.poly, 0, -0.02, 0.01);
    cyl(0.012, 0.012, 0.04, m.metal, 0, 0.02, -0.15, Math.PI / 2);
    // Sights + hammer
    box(0.012, 0.02, 0.02, m.metal, 0, 0.065, -0.11);
    box(0.012, 0.02, 0.02, m.metal, 0, 0.065, 0.11);
    box(0.03, 0.03, 0.02, m.metal, 0, 0.05, 0.12);
    // Grip + trigger guard
    box(0.04, 0.11, 0.11, m.poly, 0, -0.09, -0.02, 0.18);
    box(0.02, 0.02, 0.06, m.metal, 0, -0.03, 0.02);
    muzzleZ = -0.17;
    hands.push(new THREE.Vector3(0, -0.08, -0.01));
  } else {
    // RPG-7 — launch tube + warhead + rear flare + wooden shield
    cyl(0.055, 0.055, 1.0, m.tube, 0, 0, 0, Math.PI / 2);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.28, 12), m.head);
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, 0, -0.62);
    cone.castShadow = true;
    body.add(cone);
    cyl(0.075, 0.04, 0.22, m.metal, 0, 0, 0.55, Math.PI / 2);
    cyl(0.062, 0.062, 0.3, m.wood, 0, 0, 0.15, Math.PI / 2);
    // Iron sights
    box(0.012, 0.08, 0.014, m.metal, 0, 0.075, -0.35);
    cyl(0.04, 0.04, 0.03, m.metal, 0, 0.075, 0.3, Math.PI / 2);
    // Grips + trigger guard
    box(0.045, 0.1, 0.06, m.poly, 0, -0.09, 0.1, 0.25);
    box(0.02, 0.02, 0.07, m.metal, 0, -0.05, 0.08);
    muzzleZ = -0.76;
    hands.push(new THREE.Vector3(0, -0.08, 0.09), new THREE.Vector3(0, -0.05, -0.05));
  }

  return { group, body, mag, bolt, muzzleZ, hands };
}

// Merge every mesh inside `root` into one mesh per shared material (all gun
// parts are non-indexed after conversion, so the merge never fails). Returns a
// fresh group holding the merged meshes; the source meshes are NOT disposed by
// this helper (callers own them).
function mergeIntoGroup(root: THREE.Object3D): THREE.Group {
  const out = new THREE.Group();
  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!(m as unknown as { isMesh?: boolean }).isMesh) return;
    const mat = m.material as THREE.Material;
    const b = buckets.get(mat);
    if (b) b.push(m);
    else buckets.set(mat, [m]);
  });
  buckets.forEach((meshes, mat) => {
    const geos = meshes.map((m) => {
      m.updateMatrix();
      const g = m.geometry.clone().toNonIndexed();
      g.applyMatrix4(m.matrix);
      return g;
    });
    let merged: THREE.BufferGeometry;
    if (geos.length === 1) merged = geos[0];
    else {
      merged = mergeGeometries(geos, false) ?? new THREE.BufferGeometry();
      geos.forEach((g) => g.dispose());
    }
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = true;
    out.add(mesh);
  });
  return out;
}

// Star-shaped additive muzzle flash — three crossed spikes + a hot core.
function makeMuzzleFlash(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xffd27a, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false
  });
  const spikeGeo = new THREE.ConeGeometry(0.05, 0.3, 6);
  for (let i = 0; i < 3; i++) {
    const spike = new THREE.Mesh(spikeGeo, mat);
    spike.rotation.x = -Math.PI / 2; // apex points forward (-Z)
    spike.rotation.z = (i / 3) * Math.PI;
    spike.position.set(0, 0, -0.18);
    spike.scale.set(1, i === 0 ? 1.5 : 0.7, 1);
    group.add(spike);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat);
  core.position.set(0, 0, -0.1);
  group.add(core);
  return group;
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

export function createWeaponViewModel(type: WeaponType, skin?: WeaponSkinColors): WeaponViewModel {
  const group = new THREE.Group();

  const gunMats: GunMats = {
    metal: new THREE.MeshStandardMaterial({ color: 0x11161c, roughness: 0.35, metalness: 0.85 }),
    poly: new THREE.MeshStandardMaterial({ color: 0x1a1f26, roughness: 0.55, metalness: 0.35 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.6, metalness: 0.15 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0b0f14, roughness: 0.12, metalness: 0.85 }),
    accent: new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.5, metalness: 0.6 }),
    tube: new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.5, metalness: 0.4 }),
    head: new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.4, metalness: 0.5 })
  };

  // Equipped weapon skin re-tints the shared material set before the rig is
  // merged, so the whole viewmodel carries the skin at no extra draw cost.
  if (skin) {
    gunMats.poly.color.set(skin.poly);
    gunMats.metal.color.set(skin.metal);
    gunMats.accent.color.set(skin.accent);
    gunMats.wood.color.set(skin.wood);
    gunMats.tube.color.set(skin.tube);
  }

  const rig = buildGunRig(type, gunMats);

  // Merge the whole rig (body + magazine + bolt) into one mesh per material so
  // the viewmodel stays cheap despite the extra detail.
  const merged = mergeIntoGroup(rig.group);
  rig.group.traverse((o) => {
    const m = o as THREE.Mesh;
    if ((m as unknown as { isMesh?: boolean }).isMesh && m.geometry) m.geometry.dispose();
  });
  group.add(merged);

  // Empty anchor groups — kept so the public interface (and a future reload
  // animation) has stable attachment points.
  const mag = new THREE.Group();
  const bolt = new THREE.Group();
  group.add(mag, bolt);

  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.02, rig.muzzleZ);
  group.add(muzzle);

  // Flash first so it stays muzzle.children[0] (the render loop toggles it).
  const flash = makeMuzzleFlash();
  flash.visible = false;
  muzzle.add(flash);

  const muzzleLight = new THREE.PointLight(0xffd27a, 0, 8, 1.8);
  muzzleLight.position.set(0, 0, -0.08);
  muzzle.add(muzzleLight);

  return { group, muzzle, mag: rig.mag, bolt: rig.bolt, muzzleLight };
}
