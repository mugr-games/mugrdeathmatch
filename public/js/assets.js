// Model slots, credits and the loader. Drop a .glb/.gltf/.fbx (or a folder holding one) into public/models
// named after the slot; anything missing gets a built-in placeholder so the game always runs.
import * as THREE from 'three';
import { api } from './net.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const SF = 'https://sketchfab.com/3d-models/';
export const SLOTS = {
  player: { kind: 'character', height: 72, credit: ['PS1/Low Poly Night Vision Special Forces Soldier', 'Jellypack', SF + 'ps1low-poly-night-vision-special-forces-soldier-afb42573fa5f4fd2af09c9929d9ccd93'] },
  crowbar: { kind: 'weapon', length: 30, credit: ['PBR Crowbar Game Ready', 'Eric Wallbank', SF + 'pbr-crowbar-game-ready-7be0661092ae444882d19814e5de2853'] },
  pistol: { kind: 'weapon', length: 11, credit: ['Colt M1911', 'Ole Gunnar Isager', SF + 'colt-m1911-26adfd631730494ab0fc80c806eada77'] },
  revolver: { kind: 'weapon', length: 14, credit: ['GameReady: Colt Python Revolver', 'HYQQM', SF + 'gameready-colt-python-revolver-3def6e3980e64dfa832f298004ce1b94'] },
  smg: { kind: 'weapon', length: 22, credit: ['SMG-M32', 'Frostoise', SF + 'smg-m32-3a5f98f75e804e5888379cbe640cc883'] },
  rifle: { kind: 'weapon', length: 34, credit: ['AR-181', 'Frostoise', SF + 'ar-181-f32fe06215434fb2a159d29343079a1e'] },
  shotgun: { kind: 'weapon', length: 38, credit: ['Low-Poly Remington 870', 'TastyTony', SF + 'low-poly-remington-870-8766498ce778479aa03c3b6078937510'] },
  medkit: { kind: 'item', size: 18, credit: ['Sci-fi Medkit | Game Asset', 'Alpha One', SF + 'sci-fi-medkit-game-asset-c8ab9cf08805498ca624141efb0433bb'] },
  armor: { kind: 'item', size: 22, credit: ['Low Poly Game Ready Armor Vest', 'DanlyVostok', SF + 'low-poly-game-ready-armor-vest-90c084b9a56441b1afcfa9293b6fe4af'] },
  ammo: { kind: 'item', size: 16, credit: ['AmmoCans_GameReady_Animated_PBR_FREE!', 'Alexandr Chub', SF + 'ammocans-gameready-animated-pbr-free-4d14272e44bd4bb6898d91b223296606'] },
  crate: { kind: 'prop', size: 40, credit: ['Sci-Fi crate / ammunition box (1)', 'ul1tka', SF + 'sci-fi-crate-ammunition-box-1-69fe3211493c4a4db26ad0c4e2e49a83'] },
  crossbow: { kind: 'weapon', length: 30, credit: ['Low-Poly Compound Crossbow', 'TastyTony', SF + 'low-poly-compound-crossbow-1f99819559d94b38a7430cd6b533cf82'] },
  sniper: { kind: 'weapon', length: 46, credit: ['Modern Sniper Rifle | Free Lowpoly', 'Vlasov Daniil', SF + 'modern-sniper-rifle-free-lowpoly-45c99509f1ee4c2a8c9c3336d3e2ff5a'] },
  rocket: { kind: 'weapon', length: 40, credit: ['Low-Poly RPG-7', 'TastyTony', SF + 'low-poly-rpg-7-5243ac034391491f9a47f797ea212afe'] },
  grenade: { kind: 'weapon', length: 5, credit: ['M67 Fragmentation Grenade', 'Vextin', SF + 'm67-fragmentation-grenade-05e2a29118c3408eaa574bcec6997aba'] },
  // original stand-ins only (no credit line): built from parts below
  lmg: { kind: 'weapon', length: 40 },
  autoshotgun: { kind: 'weapon', length: 34 },
  railgun: { kind: 'weapon', length: 40 },
  claws: { kind: 'weapon', length: 20 },
  megahealth: { kind: 'item', size: 22 },
  heavyarmor: { kind: 'item', size: 26 },
  pw_damage: { kind: 'item', size: 18 },
  pw_haste: { kind: 'item', size: 18 },
  pw_boots: { kind: 'item', size: 18 },
  barrels: { kind: 'prop', size: 48, credit: ['FREE Lowpoly Barrels Set', 'step', SF + 'free-lowpoly-barrels-set-18860cfaa1054b33a5c99bca9250e8da'] },
};

export const MAP_CREDITS = {
  csdm: ['CS Death Match Map Minecraft', 'alpez791', SF + 'cs-death-match-map-minecraft-6866c8c0a1b64bd99e02bb0ceb59967c', 'Geometry only; surfaces use this game\'s own procedural shaders.'],
};

// weapon id -> model slot
export const WEAPON_SLOT = { crowbar: 'crowbar', pistol: 'pistol', '357': 'revolver', smg1: 'smg', ar2: 'rifle', shotgun: 'shotgun', crossbow: 'crossbow', sniper: 'sniper', rpg: 'rocket', grenade: 'grenade', lmg: 'lmg', autoshotgun: 'autoshotgun', railgun: 'railgun', claws: 'claws' };
export const ITEM_SLOT = { health: 'medkit', vial: 'medkit', battery: 'armor', ammo: 'ammo', megahealth: 'megahealth', heavyarmor: 'heavyarmor', damage: 'pw_damage', haste: 'pw_haste', boots: 'pw_boots' };

let available = {};
export function setAvailable(map) {
  available = map || {};
}
export function hasModel(slot) {
  return !!available[slot];
}

const loaded = new Map();

function loaderFor(path, manager) {
  return /\.fbx$/i.test(path) ? new FBXLoader(manager) : new GLTFLoader(manager);
}

export function loadFile(path, manager) {
  return new Promise((resolve, reject) => {
    loaderFor(path, manager).load(api('/' + path), (r) => resolve(r.scene ? { scene: r.scene, animations: r.animations || [] } : { scene: r, animations: r.animations || [] }), undefined, reject);
  });
}

// Returns a prototype { object, animations, real } already oriented to the game's axes (Z up, +X forward) and scaled.
export function loadSlot(slot) {
  if (!loaded.has(slot)) {
    loaded.set(slot, (async () => {
      const def = SLOTS[slot];
      let raw = null;
      if (available[slot]) {
        try { raw = await loadFile(available[slot]); } catch (e) { console.warn(`model ${slot} failed to load`, e); }
      }
      if (!raw) return { object: placeholder(slot), animations: [], real: false };
      prepMaterials(raw.scene);
      return { object: normalize(raw.scene, def), animations: raw.animations, real: true };
    })());
  }
  return loaded.get(slot);
}

// Each use needs its own copy; skinned models need their skeletons cloned too.
export function instance(proto) {
  return SkeletonUtils.clone(proto.object);
}

function prepMaterials(root) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    const mats = [].concat(o.material).map((m) => {
      if (m.isMeshStandardMaterial) return m;
      // FBX gives Phong/Lambert; convert so it reacts to the environment like everything else
      const s = new THREE.MeshStandardMaterial({
        color: m.color, map: m.map, normalMap: m.normalMap, emissive: m.emissive, emissiveMap: m.emissiveMap,
        transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, side: m.side, roughness: 0.6, metalness: 0.2,
      });
      s.name = m.name;
      return s;
    });
    o.material = Array.isArray(o.material) ? mats : mats[0];
    if (o.isSkinnedMesh) o.frustumCulled = false;
  });
}

// Model files come Y-up in metres or centimetres at arbitrary scale; the game is Z-up in inches-ish units.
function normalize(scene, def) {
  const yToZ = new THREE.Group();
  yToZ.rotation.x = Math.PI / 2;
  yToZ.add(scene);
  const holder = new THREE.Group();
  holder.add(yToZ);
  holder.updateMatrixWorld(true);
  let box = new THREE.Box3().setFromObject(holder, true);
  const size = box.getSize(new THREE.Vector3());

  if (def.kind === 'character') {
    // glTF characters face +Z, which is -Y after the turn above; face +X instead
    holder.rotation.z = Math.PI / 2;
    holder.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(holder, true);
    const h = box.max.z - box.min.z || 1;
    holder.scale.setScalar(def.height / h);
  } else if (def.kind === 'weapon') {
    orientWeapon(holder, size);
    holder.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(holder, true);
    holder.scale.setScalar(def.length / Math.max(1e-3, box.max.x - box.min.x));
  } else {
    holder.scale.setScalar(def.size / Math.max(size.x, size.y, size.z, 1e-3));
  }
  holder.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(holder, true);
  const c = box.getCenter(new THREE.Vector3());
  // characters and items stand on z=0; weapons are centred on their grip area
  const out = new THREE.Group();
  holder.position.set(-c.x, -c.y, def.kind === 'weapon' ? -c.z : -box.min.z);
  out.add(holder);
  out.userData.size = box.getSize(new THREE.Vector3());
  out.userData.kind = def.kind;
  return out;
}

// Point the barrel along +X and the grip down (-Z) using the mesh's shape: the longest axis is the barrel,
// the heavier end is the stock/grip, and parts hanging off the barrel line (grip, magazine) go down.
function orientWeapon(holder, size) {
  const axes = [size.x, size.y, size.z];
  const long = axes.indexOf(Math.max(...axes));
  const rest = [0, 1, 2].filter((a) => a !== long);
  const vert = axes[rest[0]] >= axes[rest[1]] ? rest[0] : rest[1];
  const pts = [];
  const v = new THREE.Vector3();
  holder.updateMatrixWorld(true);
  holder.traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    const step = Math.max(1, Math.floor(pos.count / 2000));
    for (let i = 0; i < pos.count; i += step) pts.push(v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld).toArray());
  });
  const box = new THREE.Box3().setFromObject(holder, true);
  const c = box.getCenter(new THREE.Vector3()).toArray();
  const mean = [0, 0, 0];
  for (const p of pts) for (let k = 0; k < 3; k++) mean[k] += p[k] / pts.length;
  const fwdSign = mean[long] > c[long] ? -1 : 1; // mass sits behind the middle, so the muzzle is the other way
  const upSign = mean[vert] < c[vert] ? 1 : -1; // grip/magazine below the middle
  const f = new THREE.Vector3().setComponent(long, fwdSign);
  const u = new THREE.Vector3().setComponent(vert, upSign);
  const l = new THREE.Vector3().crossVectors(u, f);
  // rotation that takes (f, l, u) to (+X, +Y, +Z)
  const m = new THREE.Matrix4().makeBasis(f, l, u).invert();
  holder.quaternion.setFromRotationMatrix(m);
}

// ------------------------------------------------------------------ stand-ins (until the real files exist)
// Built from simple parts in the game's frame: +X forward (muzzle), +Z up, sized in game units.
const M = {
  polymer: () => new THREE.MeshStandardMaterial({ color: 0x23262b, roughness: 0.75, metalness: 0.05 }),
  steel: () => new THREE.MeshStandardMaterial({ color: 0x6c7178, roughness: 0.32, metalness: 0.9 }),
  dark: () => new THREE.MeshStandardMaterial({ color: 0x2f3237, roughness: 0.4, metalness: 0.75 }),
  wood: () => new THREE.MeshStandardMaterial({ color: 0x6e4b2c, roughness: 0.65, metalness: 0 }),
  olive: () => new THREE.MeshStandardMaterial({ color: 0x4e5a3a, roughness: 0.8, metalness: 0.05 }),
  paint: (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2 }),
  glass: () => new THREE.MeshStandardMaterial({ color: 0x0b1820, roughness: 0.05, metalness: 0.2, emissive: new THREE.Color(0.1, 0.35, 0.5), emissiveIntensity: 1.5 }),
};

function part(geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.rotation.set(rx, ry, rz);
  o.castShadow = o.receiveShadow = true;
  return o;
}
const rbox = (w, d, h, r = 0.35) => new RoundedBoxGeometry(w, d, h, 2, Math.min(r, w / 2, d / 2, h / 2) * 0.99);
const tube = (r, len, seg = 16) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2); // along X

// barrel with a muzzle ring at its front end
function barrel(g, r, len, x0, z, mat) {
  g.add(part(tube(r, len), mat, x0 + len / 2, 0, z));
  g.add(part(tube(r * 1.35, len * 0.06), mat, x0 + len * 0.97, 0, z));
}
// pistol grip angled back like a real one
function grip(g, x, z, h, mat) {
  g.add(part(rbox(2.6, 2.2, h, 0.5), mat, x, 0, z - h / 2, 0, -0.28, 0));
}
function triggerGuard(g, x, z, mat) {
  g.add(part(new THREE.TorusGeometry(1.1, 0.18, 6, 14, Math.PI), mat, x, 0, z, Math.PI / 2, 0, Math.PI));
}
function rail(g, x0, len, z, mat) {
  g.add(part(rbox(len, 1.2, 0.5, 0.1), mat, x0 + len / 2, 0, z));
  for (let x = x0 + 0.6; x < x0 + len; x += 1.2) g.add(part(new THREE.BoxGeometry(0.5, 1.3, 0.35), mat, x, 0, z + 0.4));
}
function optic(g, x, z, len, r, steel, glass) {
  g.add(part(tube(r, len), steel, x, 0, z));
  g.add(part(tube(r * 1.25, len * 0.18), steel, x + len * 0.42, 0, z));
  g.add(part(tube(r * 1.25, len * 0.18), steel, x - len * 0.42, 0, z));
  g.add(part(new THREE.CircleGeometry(r * 1.1, 16).rotateY(Math.PI / 2), glass, x + len * 0.52, 0, z));
  g.add(part(new THREE.BoxGeometry(1, 1, 1.4), steel, x - len * 0.2, 0, z - r - 0.5));
  g.add(part(new THREE.BoxGeometry(1, 1, 1.4), steel, x + len * 0.2, 0, z - r - 0.5));
}

const BUILD = {
  crowbar(g) {
    const red = M.paint(0xa8261d), steel = M.steel();
    const path = new THREE.CurvePath();
    path.add(new THREE.LineCurve3(new THREE.Vector3(-14, 0, 0), new THREE.Vector3(11, 0, 0)));
    path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(11, 0, 0), new THREE.Vector3(16, 0, 0), new THREE.Vector3(15.5, 0, 4)));
    path.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(15.5, 0, 4), new THREE.Vector3(15, 0, 6.5), new THREE.Vector3(12.5, 0, 5.5)));
    g.add(part(new THREE.TubeGeometry(path, 40, 0.75, 8), red));
    g.add(part(new THREE.ConeGeometry(0.8, 2.5, 8).rotateZ(Math.PI / 2), steel, -15.2, 0, 0.2, 0, 0, 0.15));
  },
  pistol(g) {
    const poly = M.polymer(), steel = M.dark();
    g.add(part(rbox(9, 2.0, 2.2, 0.4), steel, 0.5, 0, 1.6)); // slide
    for (let i = 0; i < 5; i++) g.add(part(new THREE.BoxGeometry(0.2, 2.1, 1.4), poly, -3 + i * 0.5, 0, 1.7)); // serrations
    g.add(part(rbox(7.5, 1.9, 1.4, 0.3), poly, 0, 0, 0.0)); // frame
    barrel(g, 0.45, 1.2, 4.9, 1.6, steel);
    grip(g, -2.6, -0.4, 5, poly);
    triggerGuard(g, 0.2, -0.6, poly);
    g.add(part(new THREE.BoxGeometry(0.5, 0.6, 0.6), steel, 4.4, 0, 2.95)); // front sight
    g.add(part(new THREE.BoxGeometry(0.6, 1.2, 0.6), steel, -3.2, 0, 2.95)); // rear sight
  },
  revolver(g) {
    const steel = M.steel(), wood = M.wood(), dark = M.dark();
    barrel(g, 0.6, 6.5, 2.5, 1.9, steel);
    g.add(part(rbox(3.8, 1.7, 3, 0.4), steel, 0.6, 0, 1.2)); // frame
    const drum = part(tube(1.6, 2.6, 6), dark, 1.2, 0, 1.2);
    g.add(drum);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.add(part(tube(0.35, 2.7, 8), steel, 1.2, Math.cos(a) * 1.05, 1.2 + Math.sin(a) * 1.05));
    }
    g.add(part(rbox(2.6, 1.5, 4.6, 0.6), wood, -2.6, 0, -1.4, 0, -0.45, 0)); // grip
    triggerGuard(g, -0.4, -0.5, steel);
    g.add(part(new THREE.BoxGeometry(1.2, 0.6, 1), steel, -1.5, 0, 3.1, 0, 0.5, 0)); // hammer
  },
  smg(g) {
    const poly = M.polymer(), steel = M.dark();
    g.add(part(rbox(12, 2.6, 3.2, 0.5), poly, 0, 0, 0.8));
    barrel(g, 0.5, 6, 6, 1.2, steel);
    g.add(part(tube(1.0, 4.5), steel, 9.5, 0, 1.2)); // suppressor
    rail(g, -4, 8, 2.5, steel);
    g.add(part(rbox(1.8, 1.6, 7, 0.3), steel, 2.2, 0, -3.5, 0, 0.12, 0)); // magazine
    grip(g, -2.5, -0.8, 4.5, poly);
    triggerGuard(g, -0.6, -0.9, poly);
    g.add(part(rbox(5, 1.2, 2.2, 0.3), poly, -8.5, 0, 0.6)); // folded stock
    g.add(part(new THREE.BoxGeometry(2.4, 1.6, 1.6), steel, -1, 0, 3.4)); // red dot
    g.add(part(new THREE.CircleGeometry(0.55, 12).rotateY(Math.PI / 2), M.glass(), 0.25, 0, 3.4));
  },
  rifle(g) {
    const poly = M.polymer(), steel = M.dark(), acc = M.paint(0x3f6f8f);
    g.add(part(rbox(14, 2.8, 3.4, 0.5), poly, 1, 0, 0.6)); // receiver
    g.add(part(rbox(10, 3.2, 3.0, 0.6), acc, 8, 0, 0.9)); // handguard
    for (let i = 0; i < 4; i++) g.add(part(new THREE.BoxGeometry(1.2, 3.3, 0.5), steel, 4.5 + i * 2.2, 0, 1.6)); // vents
    barrel(g, 0.55, 6, 13, 0.9, steel);
    rail(g, -4, 14, 2.6, steel);
    g.add(part(rbox(2, 1.8, 7, 0.3), steel, 2.5, 0, -3.6, 0, 0.18, 0)); // curved-ish magazine
    grip(g, -2.4, -0.9, 4.8, poly);
    triggerGuard(g, -0.4, -1, poly);
    g.add(part(rbox(9, 2.2, 3.8, 0.6), poly, -10, 0, 0.2)); // stock
    optic(g, 1, 4.6, 6, 1.0, steel, M.glass());
  },
  shotgun(g) {
    const steel = M.dark(), wood = M.wood();
    barrel(g, 0.75, 24, -2, 1.6, steel);
    g.add(part(tube(0.65, 20), steel, 8, 0, 0.1)); // magazine tube
    g.add(part(rbox(7, 2.2, 2.2, 0.6), wood, 9, 0, 0.1)); // pump
    for (let i = 0; i < 5; i++) g.add(part(new THREE.BoxGeometry(0.3, 2.3, 2.3), M.polymer(), 6.5 + i * 1.2, 0, 0.1));
    g.add(part(rbox(8, 2.4, 3.2, 0.5), steel, -3.5, 0, 0.9)); // receiver
    triggerGuard(g, -4.5, -0.8, steel);
    g.add(part(rbox(11, 2.2, 3.6, 0.8), wood, -12.5, 0, -0.4, 0, 0.12, 0)); // stock
    g.add(part(new THREE.SphereGeometry(0.4, 8, 6), steel, 21.5, 0, 2.5)); // bead sight
  },
  crossbow(g) {
    const poly = M.polymer(), steel = M.steel(), acc = M.paint(0x8a3324);
    g.add(part(rbox(20, 2.2, 2.4, 0.5), poly, 0, 0, 0)); // body
    g.add(part(rbox(8, 2, 4, 0.7), poly, -12, 0, -0.6, 0, 0.1, 0)); // stock
    grip(g, -4, -1, 4.2, poly);
    // limbs: two arcs either side of the front
    for (const sgn of [-1, 1]) {
      const arc = part(new THREE.TorusGeometry(9, 0.45, 6, 18, Math.PI * 0.42), acc, 8, 0, 0, 0, 0, 0);
      arc.rotation.set(Math.PI / 2, 0, sgn > 0 ? Math.PI * 0.54 : -Math.PI * 0.54 - Math.PI * 0.42);
      arc.position.set(1.2, 0, 0.4);
      g.add(arc);
      g.add(part(new THREE.CylinderGeometry(0.8, 0.8, 0.8, 12).rotateX(Math.PI / 2), steel, 4.5, sgn * 8.4, 0.4)); // cams
    }
    const string = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(4.5, -8.4, 0.4), new THREE.Vector3(-1, 0, 0.6), new THREE.Vector3(4.5, 8.4, 0.4)]);
    g.add(new THREE.Line(string, new THREE.LineBasicMaterial({ color: 0xd9d4c4 })));
    g.add(part(tube(0.25, 16), steel, 3, 0, 1.4)); // loaded bolt
    optic(g, -2, 3.3, 5, 0.8, M.dark(), M.glass());
  },
  sniper(g) {
    const poly = M.olive(), steel = M.dark();
    barrel(g, 0.6, 26, 6, 1.4, steel);
    g.add(part(rbox(14, 2.8, 3.4, 0.6), poly, 2, 0, 0.7)); // chassis
    g.add(part(rbox(12, 2.4, 4.4, 0.8), poly, -11, 0, 0.2)); // stock
    g.add(part(rbox(4, 2.6, 1.4, 0.4), poly, -13, 0, 3.0)); // cheek rest
    g.add(part(new THREE.CylinderGeometry(0.7, 0.7, 2, 6), steel, 0.2, 1.8, 1.4, Math.PI / 2, 0, 0.6)); // bolt handle
    grip(g, -4, -0.9, 4.6, poly);
    triggerGuard(g, -2, -1, steel);
    g.add(part(rbox(2, 1.6, 4, 0.3), steel, 1.5, 0, -2.3)); // box magazine
    optic(g, 1, 4.4, 13, 1.25, steel, M.glass());
    for (const sgn of [-1, 1]) g.add(part(new THREE.CylinderGeometry(0.3, 0.3, 7, 6), steel, 12, sgn * 1.4, -2.8, sgn * 0.25, 0, 0)); // bipod legs
  },
  rocket(g) {
    const tube1 = M.olive(), steel = M.dark(), acc = M.paint(0x9a8a4a);
    g.add(part(tube(2.2, 34, 20), tube1, 2, 0, 0)); // launch tube
    g.add(part(new THREE.CylinderGeometry(2.2, 3.6, 5, 20, 1, true).rotateZ(-Math.PI / 2), steel, -16.5, 0, 0)); // rear flare
    g.add(part(tube(2.6, 1.2), steel, 19, 0, 0)); // front lip
    g.add(part(tube(2.5, 6), acc, -2, 0, 0)); // heat shield
    g.add(part(rbox(2.6, 2, 5, 0.4), steel, 1, 0, -4.2, 0, -0.2, 0)); // front grip
    g.add(part(rbox(2.6, 2, 5, 0.4), steel, -7, 0, -4.2, 0, -0.2, 0)); // rear grip
    g.add(part(new THREE.BoxGeometry(3, 2.4, 2), steel, 4, 0, 3)); // sight
    g.add(part(new THREE.ConeGeometry(1.8, 5, 16).rotateZ(-Math.PI / 2), M.paint(0x5b6248), 21.5, 0, 0)); // loaded warhead
  },
  grenade(g) {
    const body = M.olive(), steel = M.steel();
    g.add(part(new THREE.SphereGeometry(2.2, 18, 14), body, 0, 0, 0));
    g.add(part(new THREE.CylinderGeometry(0.9, 1.1, 1.4, 12), steel, 0, 0, 2.3)); // fuse
    g.add(part(new THREE.BoxGeometry(0.6, 0.9, 4), steel, -1.2, 0, 1.3, 0, 0.35, 0)); // lever
    g.add(part(new THREE.TorusGeometry(0.8, 0.12, 6, 14), steel, 0.6, 0, 3.1, 0, Math.PI / 2, 0)); // pin ring
  },
  medkit(g) {
    const shell = M.paint(0xe6e6e2), red = M.paint(0xcf2f2a), dark = M.dark();
    g.add(part(rbox(17, 11, 9, 1.4), shell, 0, 0, 4.5));
    g.add(part(rbox(17.2, 11.2, 1, 0.3), M.polymer(), 0, 0, 6.2)); // lid seam
    g.add(part(rbox(3, 7.5, 0.6, 0.2), red, 0, 0, 9.1));
    g.add(part(rbox(7.5, 3, 0.6, 0.2), red, 0, 0, 9.1));
    g.add(part(new THREE.TorusGeometry(2.6, 0.45, 6, 16, Math.PI), dark, 0, 0, 9.0, Math.PI / 2, 0, 0)); // handle
    for (const sx of [-1, 1]) g.add(part(rbox(1.6, 2, 2.2, 0.3), dark, sx * 6.5, 5.6, 6)); // latches
  },
  armor(g) {
    const fabric = M.olive(), plate = M.paint(0x5a6450), strap = M.polymer();
    g.add(part(rbox(5, 17, 20, 2), fabric, 0, 0, 10)); // vest body
    g.add(part(rbox(1.2, 12, 12, 1), plate, 2.8, 0, 12)); // front plate
    for (const sy of [-1, 1]) {
      g.add(part(rbox(4.6, 3.6, 6, 1), fabric, 0, sy * 6.5, 21.5)); // shoulders
      g.add(part(rbox(5.4, 1.2, 1.6, 0.3), strap, 0, sy * 8.6, 8)); // side straps
    }
    for (let i = 0; i < 3; i++) g.add(part(rbox(1.4, 3.4, 4, 0.4), fabric, 3.2, -5 + i * 5, 4.2)); // pouches
  },
  ammo(g) {
    const box = M.olive(), steel = M.steel(), brass = new THREE.MeshStandardMaterial({ color: 0xc9a04a, metalness: 0.9, roughness: 0.3 });
    g.add(part(rbox(15, 7, 8, 0.8), box, 0, 0, 4));
    g.add(part(rbox(15.4, 7.4, 1.4, 0.4), box, 0, 0, 8.4)); // lid
    g.add(part(new THREE.BoxGeometry(4, 1.6, 1), steel, 0, 0, 9.4)); // handle
    g.add(part(new THREE.BoxGeometry(15.1, 7.1, 1.4), M.paint(0xd8c25a), 0, 0, 4)); // stencil band
    for (let i = 0; i < 4; i++) g.add(part(new THREE.CylinderGeometry(0.45, 0.45, 3, 8), brass, -4 + i * 2.6, -4.2, 2, Math.PI / 2, 0, 0)); // loose rounds
  },
  lmg(g) {
    const poly = M.polymer(), steel = M.dark(), olive = M.olive();
    g.add(part(rbox(16, 3.4, 4, 0.6), olive, 0, 0, 0.8)); // receiver
    barrel(g, 0.7, 18, 8, 1.2, steel);
    g.add(part(tube(1.5, 9), steel, 12, 0, 1.2)); // barrel shroud
    for (let i = 0; i < 6; i++) g.add(part(tube(1.6, 0.4), poly, 8.5 + i * 1.4, 0, 1.2));
    g.add(part(rbox(5, 6, 5, 0.8), olive, 1, -3.5, -2.2)); // ammo box on the side
    g.add(part(rbox(8, 1, 1, 0.2), M.paint(0xc9a04a), 3, -1.2, 2.6, 0, 0, 0.1)); // belt
    grip(g, -3, -1, 4.8, poly);
    triggerGuard(g, -1, -1.1, poly);
    g.add(part(rbox(10, 2.6, 4.2, 0.6), poly, -12, 0, 0.2)); // stock
    g.add(part(new THREE.BoxGeometry(3, 2.6, 1.6), steel, 4, 0, 3.4)); // carry handle
    for (const s of [-1, 1]) g.add(part(new THREE.CylinderGeometry(0.3, 0.3, 7, 6), steel, 18, s * 1.6, -2.8, s * 0.25, 0, 0)); // bipod
  },
  autoshotgun(g) {
    const poly = M.polymer(), steel = M.dark(), acc = M.paint(0x8a3324);
    g.add(part(rbox(14, 3, 3.8, 0.6), poly, 0, 0, 0.8));
    barrel(g, 0.8, 14, 7, 1.6, steel);
    g.add(part(rbox(10, 3.2, 2.6, 0.6), acc, 10, 0, 0.0)); // handguard
    g.add(part(new THREE.CylinderGeometry(3.4, 3.4, 2.8, 16).rotateX(Math.PI / 2), steel, 2, 0, -3.2)); // drum magazine
    grip(g, -3.5, -0.9, 4.6, poly);
    triggerGuard(g, -1.5, -1, poly);
    g.add(part(rbox(9, 2.4, 4, 0.6), poly, -11, 0, 0.4)); // stock
    rail(g, -4, 9, 2.9, steel);
  },
  railgun(g) {
    const body = M.paint(0x3a4450), steel = M.steel(), glow = new THREE.MeshStandardMaterial({ color: 0x0a1830, emissive: new THREE.Color(0.2, 0.6, 1.4), emissiveIntensity: 2.2, roughness: 0.3 });
    g.add(part(rbox(18, 3.6, 4.4, 0.8), body, 0, 0, 0.8)); // body
    for (const z of [3.6, -1.4]) g.add(part(rbox(22, 1.2, 1.2, 0.3), steel, 14, 0, z)); // twin rails
    for (let i = 0; i < 5; i++) g.add(part(new THREE.TorusGeometry(2.4, 0.45, 8, 16).rotateY(Math.PI / 2), glow, 6 + i * 4.5, 0, 1.1)); // coils
    g.add(part(tube(1.2, 6), glow, -3, 0, 4)); // charge cell
    grip(g, -3, -1.2, 4.8, M.polymer());
    triggerGuard(g, -1, -1.3, steel);
    g.add(part(rbox(9, 2.8, 4.4, 0.8), body, -12, 0, 0.4)); // stock
  },
  claws(g) {
    const skin = M.paint(0x5c7a44), nail = new THREE.MeshStandardMaterial({ color: 0xd8d2b8, roughness: 0.4 });
    g.add(part(rbox(12, 5, 4.5, 1.6), skin, -4, 0, 0)); // forearm
    g.add(part(rbox(6, 6.5, 3.5, 1.4), skin, 4, 0, 0.3)); // hand
    for (let i = 0; i < 4; i++) {
      const y = -2.4 + i * 1.6;
      g.add(part(rbox(4, 1.2, 1.2, 0.4), skin, 8.4, y, 0.6 - Math.abs(y) * 0.2, 0, 0.2, 0)); // fingers
      g.add(part(new THREE.ConeGeometry(0.5, 4, 6).rotateZ(-Math.PI / 2), nail, 12, y, 0.2 - Math.abs(y) * 0.2, 0, 0.45, 0)); // claws
    }
  },
  megahealth(g) {
    const glow = new THREE.MeshStandardMaterial({ color: 0x0a2a14, emissive: new THREE.Color(0.2, 1.4, 0.5), emissiveIntensity: 1.6, roughness: 0.3 });
    g.add(part(rbox(5, 16, 5, 1), glow, 0, 0, 9));
    g.add(part(rbox(5, 5, 16, 1), glow, 0, 0, 9));
    g.add(part(new THREE.TorusGeometry(10, 0.6, 8, 32).rotateY(Math.PI / 2), M.steel(), 0, 0, 9));
  },
  heavyarmor(g) {
    BUILD.armor(g);
    const plate = M.paint(0x3a6a9a);
    g.add(part(rbox(1.6, 14, 15, 1), plate, 3.6, 0, 12)); // bigger front plate
    for (const sy of [-1, 1]) g.add(part(rbox(5, 5, 4, 1.4), plate, 0, sy * 7, 23)); // pauldrons
  },
  pw_damage(g) { powerOrb(g, 0x9a3cff, (h) => { for (let i = 0; i < 6; i++) h.add(part(new THREE.ConeGeometry(1.4, 6, 6), M.paint(0x3a1060), 0, 0, 0, (i % 3) * 1.05, Math.floor(i / 3) * Math.PI, 0)); }); },
  pw_haste(g) { powerOrb(g, 0xffc23a, (h) => { for (const s of [-1, 1]) h.add(part(rbox(1, 7, 2, 0.3), M.paint(0x6a4a00), 0, s * 1.5, s * 1.8, s * 0.6, 0, 0)); }); },
  pw_boots(g) {
    const leather = M.paint(0x3a3a40), sole = M.dark(), glow = new THREE.MeshStandardMaterial({ color: 0x062a28, emissive: new THREE.Color(0.2, 1.3, 1.2), emissiveIntensity: 1.8 });
    for (const s of [-1, 1]) {
      g.add(part(rbox(5, 4.5, 9, 1.4), leather, -1, s * 3.2, 7)); // shaft
      g.add(part(rbox(10, 4.5, 3, 1.2), leather, 1.5, s * 3.2, 2.5)); // foot
      g.add(part(rbox(10.4, 4.8, 1.2, 0.4), sole, 1.5, s * 3.2, 0.6)); // sole
      g.add(part(tube(1.2, 3), glow, -2, s * 3.2, 1.2)); // spring
    }
  },
  crate(g) {
    g.add(part(rbox(40, 40, 40, 2), M.wood(), 0, 0, 20));
    for (const z of [3, 37]) g.add(part(rbox(41, 41, 3, 0.6), M.dark(), 0, 0, z));
  },
  barrels(g) {
    const b = part(new THREE.CylinderGeometry(12, 12, 36, 24).rotateX(Math.PI / 2), M.paint(0x3d6e9e), 0, 0, 18);
    g.add(b);
    for (const z of [6, 18, 30]) g.add(part(new THREE.TorusGeometry(12.1, 0.6, 6, 24), M.dark(), 0, 0, z));
  },
};

// glowing orb in a cage for timed powerups; inner(holder) adds the symbol
function powerOrb(g, color, inner) {
  const c = new THREE.Color(color);
  const orb = new THREE.MeshStandardMaterial({ color: c.clone().multiplyScalar(0.15), emissive: c, emissiveIntensity: 1.8, roughness: 0.2, transparent: true, opacity: 0.85 });
  g.add(part(new THREE.SphereGeometry(6, 24, 18), orb, 0, 0, 9));
  for (let i = 0; i < 3; i++) g.add(part(new THREE.TorusGeometry(7.5, 0.35, 6, 32), M.steel(), 0, 0, 9, (i * Math.PI) / 3, Math.PI / 2, 0));
  const h = new THREE.Group();
  h.position.z = 9;
  inner(h);
  g.add(h);
}

function placeholder(slot) {
  const g = new THREE.Group();
  (BUILD[slot] || BUILD.crate)(g);
  const def = SLOTS[slot];
  g.userData.kind = def.kind;
  g.userData.size = new THREE.Box3().setFromObject(g).getSize(new THREE.Vector3());
  return g;
}
