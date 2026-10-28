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
  knife: { kind: 'weapon', length: 13 },
  bat: { kind: 'weapon', length: 32 },
  katana: { kind: 'weapon', length: 38 },
  axe: { kind: 'weapon', length: 32 },
  sledge: { kind: 'weapon', length: 34 },
  deagle: { kind: 'weapon', length: 11 },
  uzi: { kind: 'weapon', length: 13 },
  ak: { kind: 'weapon', length: 36 },
  dmr: { kind: 'weapon', length: 42 },
  double: { kind: 'weapon', length: 36 },
  flashbang: { kind: 'weapon', length: 5 },
  machete: { kind: 'weapon', length: 24 },
  pan: { kind: 'weapon', length: 20 },
  golf: { kind: 'weapon', length: 38 },
  wrench: { kind: 'weapon', length: 18 },
  shovel: { kind: 'weapon', length: 40 },
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
export const WEAPON_SLOT = { crowbar: 'crowbar', pistol: 'pistol', '357': 'revolver', smg1: 'smg', ar2: 'rifle', shotgun: 'shotgun', crossbow: 'crossbow', sniper: 'sniper', rpg: 'rocket', grenade: 'grenade', lmg: 'lmg', autoshotgun: 'autoshotgun', railgun: 'railgun', claws: 'claws', knife: 'knife', bat: 'bat', katana: 'katana', axe: 'axe', sledge: 'sledge', machete: 'machete', pan: 'pan', golf: 'golf', wrench: 'wrench', shovel: 'shovel', deagle: 'deagle', uzi: 'uzi', ak: 'ak', dmr: 'dmr', double: 'double', flashbang: 'flashbang' };
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
// Surface detail drawn once into small textures: stippled polymer, brushed and parkerized steel with fine
// scratches, wood grain, woven fabric. Each becomes a normal map (from a height field) and a roughness map.
const DETAIL = new Map();
function detail(kind) {
  if (DETAIL.has(kind)) return DETAIL.get(kind);
  const S = 128, hgt = new Float32Array(S * S), alb = new Float32Array(S * S);
  let seed = { stipple: 3, brushed: 7, park: 11, grain: 13, fabric: 17 }[kind] || 1;
  const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const lattice = Array.from({ length: 32 * 32 }, R);
  const vn = (x, y) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, L = (a, b) => lattice[((a & 31) * 32 + (b & 31))]; const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy); return L(i, j) * (1 - sx) * (1 - sy) + L(i + 1, j) * sx * (1 - sy) + L(i, j + 1) * (1 - sx) * sy + L(i + 1, j + 1) * sx * sy; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = y * S + x, u = (x / S) * 32, v = (y / S) * 32;
    let h = 0.5, a = 1;
    if (kind === 'stipple') { h = vn(u * 2, v * 2) * 0.6 + R() * 0.4; a = 0.9 + 0.1 * vn(u * 0.3, v * 0.3); }
    else if (kind === 'brushed') { h = vn(u * 0.08, v * 6) * 0.7 + R() * 0.15; a = 0.85 + 0.15 * vn(u * 0.2, v * 0.4); }
    else if (kind === 'park') { h = vn(u * 3, v * 3) * 0.5 + R() * 0.5; a = 0.85 + 0.15 * vn(u * 0.25, v * 0.25); }
    else if (kind === 'grain') { const w = v * 0.35 + vn(u * 0.15, v * 0.15) * 4; h = 0.5 + 0.5 * Math.sin(w * 6 + vn(u * 2, v * 0.3) * 2); a = 0.75 + 0.25 * h; }
    else if (kind === 'fabric') { h = (Math.sin(u * 12) * Math.sin(v * 12) * 0.5 + 0.5) * 0.7 + R() * 0.3; a = 0.88 + 0.12 * vn(u * 0.4, v * 0.4); }
    hgt[k] = h; alb[k] = a;
  }
  // scratches on metal
  if (kind === 'brushed' || kind === 'park') for (let n = 0; n < 40; n++) { let x = R() * S, y = R() * S; const a = R() * Math.PI, len = 6 + R() * 30; for (let t = 0; t < len; t++) { x += Math.cos(a); y += Math.sin(a); const k = ((y | 0) & (S - 1)) * S + ((x | 0) & (S - 1)); hgt[k] -= 0.35; alb[k] = Math.min(1.15, alb[k] + 0.3); } }
  const nc = document.createElement('canvas'), rc = document.createElement('canvas'), ac = document.createElement('canvas');
  for (const c of [nc, rc, ac]) c.width = c.height = S;
  const nd = nc.getContext('2d').createImageData(S, S), rd = rc.getContext('2d').createImageData(S, S), ad = ac.getContext('2d').createImageData(S, S);
  const H = (x, y) => hgt[((y + S) % S) * S + ((x + S) % S)];
  const strength = kind === 'grain' ? 1.5 : kind === 'brushed' ? 2 : 3;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), k = (y * S + x) * 4;
    nd.data[k] = (-dx / l * 0.5 + 0.5) * 255; nd.data[k + 1] = (-dy / l * 0.5 + 0.5) * 255; nd.data[k + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[k + 3] = 255;
    const r = Math.max(0, Math.min(255, (0.55 + (0.5 - hgt[y * S + x]) * 0.5) * 255));
    rd.data[k] = rd.data[k + 1] = rd.data[k + 2] = r; rd.data[k + 3] = 255;
    const a = Math.max(0, Math.min(255, alb[y * S + x] * 220));
    ad.data[k] = ad.data[k + 1] = ad.data[k + 2] = a; ad.data[k + 3] = 255;
  }
  nc.getContext('2d').putImageData(nd, 0, 0); rc.getContext('2d').putImageData(rd, 0, 0); ac.getContext('2d').putImageData(ad, 0, 0);
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2); if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  const out = { normal: tex(nc), rough: tex(rc), albedo: tex(ac, true) };
  DETAIL.set(kind, out);
  return out;
}
function detailed(kind, o, scale = 0.6) {
  const d = detail(kind);
  return new THREE.MeshStandardMaterial({ ...o, normalMap: d.normal, normalScale: new THREE.Vector2(scale, scale), roughnessMap: d.rough, map: d.albedo });
}
const M = {
  polymer: () => detailed('stipple', { color: 0x2a2d33, roughness: 0.85, metalness: 0.05 }, 0.5),
  steel: () => detailed('brushed', { color: 0x8a9098, roughness: 0.42, metalness: 0.92 }, 0.35),
  dark: () => detailed('park', { color: 0x3a3d43, roughness: 0.7, metalness: 0.8 }, 0.45),
  wood: () => detailed('grain', { color: 0x8a5e36, roughness: 0.7, metalness: 0 }, 0.4),
  olive: () => detailed('fabric', { color: 0x5a6644, roughness: 0.9, metalness: 0.05 }, 0.6),
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

// A part cut from a side profile: points [x forward, z up], given thickness across, with rounded edges. holes:
// cut-outs (a trigger guard's opening, a thumbhole). Real guns are mostly flat profiles like this.
function slab(pts, width, mat, x = 0, y = 0, z = 0, bevel = 0.16, holes = []) {
  const v = (p) => p.map(([px, pz]) => new THREE.Vector2(px, pz));
  const sh = new THREE.Shape(v(pts));
  for (const h of holes) sh.holes.push(new THREE.Path(v(h)));
  const b = Math.min(bevel, width * 0.3), d = Math.max(0.02, width - b * 2);
  const geo = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: b > 0, bevelSize: b, bevelThickness: b, bevelSegments: 2, curveSegments: 6 });
  geo.translate(0, 0, -d / 2).rotateX(Math.PI / 2);
  return part(geo, mat, x, y, z);
}
// shallow grooves or slots along a side: count dark strips from x0, step apart
function grooves(g, mat, x0, step, count, y, z, w, h, d = 0.08) {
  for (let i = 0; i < count; i++) for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(w, d, h), mat, x0 + i * step, s * y, z));
}
const BLACK = () => new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.9 });

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
  // a wrecking bar: a hex-section steel bar painted red, a gooseneck hook with a split nail-pulling claw at one
  // end, a bent flat chisel at the other, bare steel showing where it's worn
  crowbar(g) {
    const red = M.paint(0xb3261e), steel = M.steel(), dark = M.dark();
    const hex = (len) => new THREE.CylinderGeometry(0.82, 0.82, len, 6).rotateZ(Math.PI / 2);
    // a flat wedge pointing along -X from x = 0: `base` tall where it joins, `tip` at the end, `width` across
    const wedge = (len, base, tip, width) => {
      const shape = new THREE.Shape([new THREE.Vector2(0, -base / 2), new THREE.Vector2(-len, -tip / 2), new THREE.Vector2(-len, tip / 2), new THREE.Vector2(0, base / 2)]);
      return new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false }).translate(0, 0, -width / 2).rotateX(Math.PI / 2);
    };
    g.add(part(hex(22), red, -1, 0, 0)); // the shaft
    // the gooseneck: up and curling back over the shaft
    const neck = new THREE.CurvePath();
    neck.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(9.9, 0, 0), new THREE.Vector3(15.6, 0, 0), new THREE.Vector3(15.6, 0, 4.4)));
    neck.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(15.6, 0, 4.4), new THREE.Vector3(15.6, 0, 7.9), new THREE.Vector3(12.2, 0, 7.6)));
    g.add(part(new THREE.TubeGeometry(neck, 36, 0.82, 6), red));
    g.add(part(new THREE.CylinderGeometry(0.84, 0.84, 1.1, 6).rotateZ(Math.PI / 2), steel, 12.4, 0, 7.62, 0, 0.05, 0)); // worn paint
    // the claw: two flat prongs split by a notch, angled back down toward the shaft
    for (const y of [-0.48, 0.48]) g.add(part(wedge(3.6, 1.5, 0.25, 0.78), steel, 12, y, 7.5, 0, -0.5, 0));
    // the other end: a short bend, then a flat chisel wider than the bar
    g.add(part(hex(3), red, -13.4, 0, 0.2, 0, 0.16, 0));
    g.add(part(wedge(3.4, 1.55, 0.22, 1.9), steel, -14.7, 0, 0.42, 0, 0.16, 0));
    g.add(part(new THREE.CylinderGeometry(0.86, 0.86, 3.2, 6).rotateZ(Math.PI / 2), dark, -4.5, 0, 0)); // grip wear: darker steel where it's held
  },
  // the melee weapons: each lies along +X with the handle toward -X and the business end at +X
  // a combat knife: rubber grip, a guard, a clip point blade with a darker spine
  knife(g) {
    const steel = M.steel(), dark = M.dark(), grip = M.polymer();
    g.add(part(rbox(5.4, 1.15, 1.4, 0.5), grip, -3.4, 0, 0)); // grip
    for (let x = -5.4; x < -1.2; x += 0.9) g.add(part(new THREE.TorusGeometry(0.62, 0.08, 4, 10).rotateY(Math.PI / 2), dark, x, 0, 0)); // grip rings
    g.add(part(rbox(0.5, 1.5, 2.6, 0.2), dark, -0.5, 0, 0)); // guard
    g.add(part(rbox(0.7, 1.2, 1.2, 0.3), dark, -6.3, 0, 0)); // pommel
    const blade = new THREE.Shape([new THREE.Vector2(0, -0.55), new THREE.Vector2(5.2, -0.4), new THREE.Vector2(7, 0.2), new THREE.Vector2(5.6, 0.45), new THREE.Vector2(0, 0.6)]);
    g.add(part(new THREE.ExtrudeGeometry(blade, { depth: 0.16, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.08, bevelSegments: 1 }).translate(0, 0, -0.08).rotateX(Math.PI / 2), steel, -0.2, 0, 0));
    g.add(part(rbox(4.2, 0.24, 0.22, 0.08), dark, 2, 0, 0.5)); // the spine
  },
  // a wooden baseball bat: a thin taped handle swelling to a fat barrel, a knob at the end
  bat(g) {
    const wood = M.wood(), tape = M.dark();
    const pts = [[0, -16], [0.85, -16], [0.9, -15.4], [0.62, -15], [0.6, -7], [0.75, -3], [1.15, 3], [1.35, 9], [1.38, 14.4], [1.2, 15.8], [0, 16]];
    g.add(part(new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), 16).rotateZ(-Math.PI / 2), wood));
    g.add(part(new THREE.CylinderGeometry(0.66, 0.66, 7, 14).rotateZ(Math.PI / 2), tape, -11, 0, 0)); // grip tape
  },
  // a katana: a cord-wrapped hilt, a round guard and a long, slightly curved blade
  katana(g) {
    const steel = M.steel(), dark = M.dark(), wrap = M.paint(0x1a1a24);
    g.add(part(rbox(10, 1.2, 1.5, 0.5), wrap, -14, 0, 0)); // hilt
    for (let x = -18.4; x < -9.6; x += 1.1) g.add(part(rbox(0.5, 1.28, 1.6, 0.2), M.paint(0xc8a24a), x, 0, 0, 0, 0.5, 0)); // the diamond wrap
    g.add(part(new THREE.CylinderGeometry(1.8, 1.8, 0.35, 20).rotateZ(Math.PI / 2), dark, -8.8, 0, 0)); // the guard
    g.add(part(rbox(0.9, 1.1, 1.3, 0.2), M.paint(0xc8a24a), -8.2, 0, 0)); // the collar
    const curve = new THREE.Shape();
    curve.moveTo(0, -0.55); curve.quadraticCurveTo(14, -0.4, 27, 0.9); curve.lineTo(26.2, 1.45); curve.quadraticCurveTo(13, 0.6, 0, 0.55); curve.closePath();
    g.add(part(new THREE.ExtrudeGeometry(curve, { depth: 0.14, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.06, bevelSegments: 1 }).translate(0, 0, -0.07).rotateX(Math.PI / 2), steel, -8, 0, 0));
  },
  // a fire axe: a red handle, a wedge blade one way and a spike the other
  axe(g) {
    const red = M.paint(0xb3261e), steel = M.steel(), dark = M.dark();
    g.add(part(rbox(30, 1.2, 1.6, 0.55), red, -1, 0, 0));
    g.add(part(rbox(5, 1.3, 1.7, 0.5), dark, -13, 0, 0)); // grip
    g.add(part(rbox(3, 1.6, 3.2, 0.4), steel, 13, 0, 0)); // the eye
    const blade = new THREE.Shape([new THREE.Vector2(-1.4, 1.2), new THREE.Vector2(1.4, 1.2), new THREE.Vector2(2.4, 6.6), new THREE.Vector2(-2.6, 6.6)]);
    g.add(part(new THREE.ExtrudeGeometry(blade, { depth: 0.4, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 1 }).translate(0, 0, -0.2).rotateX(Math.PI / 2), steel, 13, 0, 0));
    g.add(part(new THREE.ConeGeometry(0.75, 5, 4).rotateX(-Math.PI / 2), dark, 13, 0, -3.8)); // the spike
  },
  // a sledgehammer: a long wooden handle and a heavy steel head across the end
  sledge(g) {
    const wood = M.wood(), steel = M.dark(), grip = M.polymer();
    g.add(part(rbox(30, 1.3, 1.5, 0.6), wood, -2, 0, 0));
    g.add(part(rbox(6, 1.45, 1.65, 0.6), grip, -14, 0, 0));
    g.add(part(rbox(3.6, 3.6, 9.5, 0.6), steel, 14.6, 0, 0)); // the head
    for (const z of [-4.9, 4.9]) g.add(part(new THREE.CylinderGeometry(1.85, 1.85, 0.5, 4).rotateY(Math.PI / 4).rotateX(Math.PI / 2), steel, 14.6, 0, z)); // striking faces
  },
  // a machete: a riveted grip and a long, wide blade that sweeps up to the tip
  machete(g) {
    const steel = M.steel(), grip = M.polymer(), dark = M.dark();
    g.add(part(rbox(6.5, 1.2, 1.6, 0.55), grip, -8.5, 0, 0));
    for (const x of [-10, -7]) for (const y of [-0.62, 0.62]) g.add(part(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 8).rotateX(Math.PI / 2), steel, x, y, 0)); // rivets
    g.add(part(rbox(0.6, 1.4, 2.2, 0.2), dark, -5, 0, 0));
    const blade = new THREE.Shape([new THREE.Vector2(0, -0.9), new THREE.Vector2(15, -1.4), new THREE.Vector2(17.5, -0.4), new THREE.Vector2(16.5, 1.1), new THREE.Vector2(0, 0.7)]);
    g.add(part(new THREE.ExtrudeGeometry(blade, { depth: 0.12, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.06, bevelSegments: 1 }).translate(0, 0, -0.06).rotateX(Math.PI / 2), steel, -4.7, 0, 0));
  },
  // a cast-iron frying pan held by its handle
  pan(g) {
    const iron = M.dark(), grip = M.polymer();
    g.add(part(rbox(10, 1.1, 1.3, 0.45), grip, -5, 0, 0)); // the handle
    g.add(part(new THREE.CylinderGeometry(0.75, 0.75, 0.6, 12).rotateX(Math.PI / 2), iron, -10, 0, 0)); // hanging hole end
    const pan = new THREE.LatheGeometry([[0, 0], [4.6, 0], [5.3, 0.35], [5.6, 1.6], [5.3, 1.65], [5.0, 0.55], [0, 0.45]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
    g.add(part(pan.translate(0, -0.8, 0), iron, 5.2, 0, 0)); // the pan, its face to the side
  },
  // a golf club: a long thin shaft, a rubber grip and a metal club head at the bottom
  golf(g) {
    const steel = M.steel(), grip = M.polymer();
    g.add(part(new THREE.CylinderGeometry(0.28, 0.42, 36, 10).rotateZ(Math.PI / 2), steel, 0, 0, 0));
    g.add(part(new THREE.CylinderGeometry(0.55, 0.62, 9, 12).rotateZ(Math.PI / 2), grip, -14, 0, 0));
    g.add(part(rbox(1.2, 1.4, 4.2, 0.5), steel, 18.2, 0, -1.6, 0, 0.2, 0)); // the head
  },
  // a pipe wrench: a heavy handle with an adjustable jaw at the end
  wrench(g) {
    const red = M.paint(0xb3261e), steel = M.steel(), dark = M.dark();
    g.add(part(rbox(14, 1.2, 1.8, 0.5), red, -2, 0, 0));
    g.add(part(rbox(3.4, 1.5, 4.4, 0.4), dark, 6.2, 0, 1)); // the jaw body
    g.add(part(rbox(4.2, 1.3, 1.1, 0.3), steel, 7, 0, 3.4)); // the hook jaw
    g.add(part(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 14).rotateX(Math.PI / 2), steel, 4.2, 0, 1.6)); // adjusting nut
  },
  // a shovel: a long wooden shaft, a D handle and a pointed steel blade
  shovel(g) {
    const wood = M.wood(), steel = M.dark();
    g.add(part(new THREE.CylinderGeometry(0.62, 0.62, 30, 10).rotateZ(Math.PI / 2), wood, -2, 0, 0));
    g.add(part(new THREE.TorusGeometry(1.6, 0.35, 6, 14, Math.PI).rotateY(Math.PI / 2).rotateX(Math.PI / 2), wood, -18.4, 0, 0)); // D handle
    const blade = new THREE.Shape([new THREE.Vector2(0, -3.2), new THREE.Vector2(7, -3.0), new THREE.Vector2(10, 0), new THREE.Vector2(7, 3.0), new THREE.Vector2(0, 3.2)]);
    g.add(part(new THREE.ExtrudeGeometry(blade, { depth: 0.2, bevelEnabled: false }).translate(0, 0, -0.1), steel, 13, 0, 0)); // flat, facing up
  },
  // a striker-fired polymer pistol: a squared steel slide with rear serrations, a polymer frame with an
  // undercut trigger guard, an angled textured grip, a dust-cover rail and three-dot sights
  pistol(g) {
    const poly = M.polymer(), steel = M.dark(), black = BLACK();
    g.add(slab([[-3.7, 0.85], [4.6, 0.85], [4.6, 2.25], [4.35, 2.6], [-3.45, 2.6], [-3.7, 2.3]], 1.9, steel, 0, 0, 0, 0.14));
    g.add(slab([[4.25, 0.9], [4.25, 0.25], [1.5, 0.05], [1.05, -1.55], [0.55, -1.8], [-0.95, -1.8], [-1.45, -1.25], [-1.75, -0.75], [-2.7, -5.1], [-5.05, -5.1], [-4.25, 0.05], [-4.6, 0.45], [-3.75, 0.9]],
      1.75, poly, 0, 0, 0, 0.18, [[[0.6, -0.15], [0.35, -1.35], [-0.75, -1.35], [-1.25, -0.6], [-0.95, -0.15]]]));
    g.add(slab([[-0.15, -0.2], [0.0, -0.95], [-0.3, -1.15], [-0.5, -0.95], [-0.35, -0.2]], 0.4, steel, 0, 0, 0, 0.05)); // trigger
    for (let i = 0; i < 6; i++) g.add(part(new THREE.BoxGeometry(0.12, 1.96, 1.25), black, -3.25 + i * 0.22, 0, 1.75)); // serrations
    grooves(g, black, -4.4, 0.32, 7, 0.88, -2.6, 0.16, 3.4, 0.04); // grip texture
    g.add(part(new THREE.BoxGeometry(2.2, 0.06, 0.95), black, 1.0, 0.95, 1.95)); // ejection port
    g.add(part(new THREE.BoxGeometry(0.7, 0.05, 0.5), M.steel(), 1.0, 0.98, 1.95)); // the barrel hood in it
    g.add(part(new THREE.BoxGeometry(1.6, 0.25, 0.35), M.steel(), -0.6, 0.98, 0.65)); // slide stop
    for (let i = 0; i < 3; i++) g.add(part(new THREE.BoxGeometry(0.35, 1.8, 0.22), poly, 2.2 + i * 0.6, 0, 0.12)); // rail
    g.add(part(rbox(2.45, 1.95, 0.42, 0.15), poly, -3.9, 0, -5.25, 0, 0.21, 0)); // magazine base
    g.add(part(new THREE.BoxGeometry(0.35, 0.45, 0.5), steel, 4.15, 0, 2.8)); // front sight
    for (const s of [-0.45, 0.45]) g.add(part(new THREE.BoxGeometry(0.5, 0.42, 0.5), steel, -3.1, s, 2.8)); // rear sight
    const white = new THREE.MeshBasicMaterial({ color: 0xf0f0e8 });
    g.add(part(new THREE.BoxGeometry(0.4, 0.2, 0.2), white, 4.15, 0, 2.9));
    for (const s of [-0.45, 0.45]) g.add(part(new THREE.BoxGeometry(0.52, 0.18, 0.18), white, -3.1, s, 2.9));
    g.add(part(new THREE.CircleGeometry(0.3, 14).rotateY(Math.PI / 2), black, 4.62, 0, 1.6)); // the bore
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
  // a roller-delayed SMG: a stamped tube receiver, a cocking tube over the barrel, a slim handguard, a curved
  // steel magazine, a polymer trigger group and a retracted two-rod stock
  smg(g) {
    const poly = M.polymer(), steel = M.dark(), black = BLACK();
    g.add(slab([[-6, 0], [5.2, 0], [5.2, 2.4], [-6, 2.4]], 2.2, steel, 0, 0, 0, 0.5));
    for (let i = 0; i < 5; i++) g.add(part(new THREE.BoxGeometry(0.25, 2.25, 0.5), black, -4 + i * 1.6, 0, 1.2)); // stamped ribs
    g.add(part(tube(0.62, 8.5), steel, 7.2, 0, 2.05)); // cocking tube
    g.add(slab([[5.2, 0.1], [10.2, 0.35], [10.2, 1.85], [5.2, 2.05]], 2.5, poly, 0, 0, 0, 0.4)); // handguard
    grooves(g, black, 6, 0.9, 5, 1.22, 1.0, 0.45, 1.1, 0.06);
    barrel(g, 0.42, 2.8, 10, 1.1, steel);
    g.add(part(new THREE.TorusGeometry(0.75, 0.16, 6, 14).rotateY(Math.PI / 2), steel, 11.6, 0, 2.6)); // front sight hood
    g.add(slab([[0.9, 0.05], [2.6, 0.05], [3.4, -3.6], [3.2, -6.0], [1.6, -6.2], [1.0, -3.6]], 1.3, steel, 0, 0, 0, 0.12)); // curved magazine
    g.add(slab([[-0.3, 0.05], [-0.8, -0.9], [-1.6, -4.3], [-3.4, -4.3], [-3.0, -0.4], [-2.5, 0.05]], 1.6, poly, 0, 0, 0, 0.2)); // grip
    triggerGuard(g, -0.4, -0.85, poly);
    for (const s of [-0.9, 0.9]) g.add(part(tube(0.28, 6.5), steel, -9.2, s, 1.3)); // stock rods
    g.add(part(rbox(1.2, 2.6, 3.4, 0.4), poly, -12.6, 0, 1.0)); // butt pad
    g.add(part(new THREE.CylinderGeometry(0.75, 0.75, 1.0, 14).rotateX(Math.PI / 2), steel, -5.2, 0, 2.95)); // rear sight drum
    g.add(part(new THREE.BoxGeometry(1.0, 0.5, 0.5), steel, 3.6, 1.35, 2.05)); // cocking handle
  },
  // an AR-pattern rifle: a flat-top upper with a full rail, a lower with its magazine well, a free-floated
  // slotted handguard, a polymer magazine, an A2 grip, a buffer tube and a collapsible stock, a red-dot sight
  rifle(g) {
    const poly = M.polymer(), steel = M.dark(), black = BLACK();
    g.add(slab([[-5.5, 1.0], [6.5, 1.0], [6.5, 2.6], [-5.5, 2.6]], 2.2, steel, 0, 0, 0, 0.2)); // upper
    g.add(slab([[-5.5, 1.05], [4.2, 1.05], [4.2, -1.0], [3.4, -1.6], [1.0, -1.6], [0.6, -0.4], [-1.6, -0.4], [-5.2, 0.2]], 2.0, steel, 0, 0, 0, 0.2)); // lower
    rail(g, -5.5, 12, 2.7, steel);
    g.add(slab([[6.5, 0.85], [17.5, 0.85], [17.5, 2.65], [6.5, 2.65]], 2.5, poly, 0, 0, 0, 0.45)); // handguard
    grooves(g, black, 8, 1.8, 5, 1.24, 1.6, 1.1, 0.4, 0.06); // M-LOK slots
    rail(g, 6.6, 10.8, 2.8, steel);
    barrel(g, 0.42, 5, 17.5, 1.75, steel);
    g.add(part(tube(0.72, 2.2, 12), steel, 23.4, 0, 1.75)); // muzzle brake
    for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(1.1, 0.2, 0.45), black, 23.5, s * 0.66, 1.75));
    g.add(slab([[1.0, -1.6], [3.4, -1.6], [3.9, -4.5], [3.4, -7.4], [1.2, -7.6], [1.0, -4.6]], 1.6, poly, 0, 0, 0, 0.15)); // magazine
    grooves(g, black, 1.5, 0.5, 3, 0.81, -6.6, 0.2, 0.6, 0.04);
    g.add(slab([[-0.9, -0.4], [-1.6, -4.6], [-3.2, -4.7], [-3.0, -0.4]], 1.5, poly, 0, 0, 0, 0.25)); // grip
    triggerGuard(g, -0.2, -0.9, steel);
    g.add(part(tube(0.65, 5), steel, -8, 0, 1.6)); // buffer tube
    g.add(slab([[-7.5, 2.4], [-14, 2.6], [-14.4, 2.2], [-14.4, -1.8], [-13.6, -2.0], [-9, 0.2], [-7.5, 0.7]], 2.0, poly, 0, 0, 0, 0.3)); // stock
    g.add(part(new THREE.BoxGeometry(2.2, 0.06, 0.9), black, 0.6, 1.12, 1.8)); // ejection port
    g.add(part(new THREE.CylinderGeometry(0.42, 0.42, 0.6, 10).rotateZ(Math.PI / 2), steel, -3.6, 1.2, 2.0)); // forward assist
    g.add(part(new THREE.BoxGeometry(1.2, 2.6, 0.45), steel, -5.6, 0, 2.6)); // charging handle
    g.add(part(new THREE.BoxGeometry(2.6, 1.6, 1.6), steel, -1, 0, 3.6)); // red dot
    g.add(part(new THREE.CircleGeometry(0.6, 14).rotateY(Math.PI / 2), M.glass(), 0.32, 0, 3.7));
  },
  // a pump shotgun: a milled receiver, the barrel over a magazine tube, a grooved wooden fore-end, a wooden
  // stock with a pistol wrist, a bead sight and spare shells on a side saddle
  shotgun(g) {
    const steel = M.dark(), wood = M.wood(), black = BLACK();
    g.add(slab([[-6, -0.2], [2, -0.2], [2, 2.6], [-5, 2.8], [-6, 2.4]], 2.2, steel, 0, 0, 0, 0.3)); // receiver
    barrel(g, 0.55, 20, 2, 2.0, steel);
    g.add(part(tube(0.55, 17), steel, 10.5, 0, 0.8)); // magazine tube
    g.add(slab([[6, -0.1], [13, -0.1], [13, 1.7], [6, 1.7]], 2.6, wood, 0, 0, 0, 0.45)); // fore-end
    grooves(g, black, 6.8, 0.8, 8, 1.27, 0.8, 0.22, 1.2, 0.05);
    g.add(slab([[-6, 0.2], [-6, 2.4], [-9, 1.8], [-18, 2.1], [-18.4, 1.7], [-18.4, -3.0], [-17.6, -3.2], [-9.5, -1.2], [-7.2, -1.0]], 2.0, wood, 0, 0, 0, 0.35)); // stock
    g.add(part(rbox(0.8, 2.1, 5.2, 0.3), M.polymer(), -18.6, 0, -0.5, 0, 0.05, 0)); // recoil pad
    triggerGuard(g, -4.2, -0.8, steel);
    g.add(part(new THREE.SphereGeometry(0.32, 8, 6), M.steel(), 21.6, 0, 2.7)); // bead sight
    g.add(part(new THREE.BoxGeometry(3, 0.06, 1.1), black, -2.2, 1.13, 1.6)); // ejection port
    const hull = new THREE.MeshStandardMaterial({ color: 0xa8231c, roughness: 0.55 }), brass = new THREE.MeshStandardMaterial({ color: 0xc9a04a, metalness: 0.9, roughness: 0.3 });
    g.add(part(rbox(5, 0.5, 2.4, 0.2), M.polymer(), -3, 1.35, 1.2));
    for (let i = 0; i < 4; i++) { g.add(part(new THREE.CylinderGeometry(0.42, 0.42, 2.2, 10), hull, -4.6 + i * 1.05, 1.75, 1.35)); g.add(part(new THREE.CylinderGeometry(0.44, 0.44, 0.5, 10), brass, -4.6 + i * 1.05, 1.75, 0.15)); }
  },
  // a big-bore semi-auto pistol: a long steel slide over a fluted fixed barrel, a steel frame with rubber
  // grip panels and an exposed hammer
  deagle(g) {
    const steel = M.steel(), dark = M.dark(), rubber = M.polymer(), black = BLACK();
    g.add(slab([[-4.3, 1.0], [1.7, 1.0], [1.7, 2.95], [-4.1, 2.95], [-4.3, 2.6]], 1.95, steel, 0, 0, 0, 0.14)); // slide
    g.add(slab([[1.5, 1.15], [6.5, 1.15], [6.5, 2.95], [1.5, 2.95]], 1.55, steel, 0, 0, 0, 0.12)); // barrel
    for (const z of [1.6, 2.4]) for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(4.2, 0.06, 0.28), dark, 4.2, s * 0.79, z)); // flutes
    g.add(slab([[4.0, 1.05], [4.0, 0.5], [1.2, 0.3], [0.9, -1.4], [0.4, -1.75], [-1.1, -1.75], [-1.6, -1.1], [-1.9, -0.6], [-2.9, -5.3], [-5.5, -5.3], [-4.7, 0.2], [-4.95, 0.7], [-4.25, 1.05]],
      1.85, steel, 0, 0, 0, 0.18, [[[0.55, -0.1], [0.3, -1.35], [-0.85, -1.35], [-1.35, -0.55], [-1.05, -0.1]]]));
    g.add(slab([[-2.05, -0.9], [-2.85, -5.0], [-5.25, -5.0], [-4.6, -0.45]], 2.05, rubber, 0, 0, 0, 0.2)); // grip panels
    grooves(g, black, -4.6, 0.36, 6, 1.03, -2.8, 0.18, 3.6, 0.03);
    for (let i = 0; i < 7; i++) g.add(part(new THREE.BoxGeometry(0.12, 2.0, 1.4), black, -3.9 + i * 0.22, 0, 1.95)); // serrations
    g.add(part(new THREE.BoxGeometry(0.7, 0.6, 1.0), dark, -4.55, 0, 2.6, 0, 0.4, 0)); // hammer
    g.add(slab([[-0.15, -0.15], [0.0, -0.95], [-0.3, -1.15], [-0.5, -0.95], [-0.35, -0.15]], 0.4, dark, 0, 0, 0, 0.05)); // trigger
    g.add(part(new THREE.BoxGeometry(0.4, 0.5, 0.5), dark, 6.1, 0, 3.15)); // front sight
    g.add(part(new THREE.BoxGeometry(0.5, 1.2, 0.45), dark, -3.7, 0, 3.15)); // rear sight
    g.add(part(new THREE.CircleGeometry(0.42, 3).rotateY(Math.PI / 2).rotateX(Math.PI / 2), black, 6.52, 0, 2.05)); // the triangular bore
  },
  // a micro SMG: a boxy stamped receiver, the magazine up through the grip, a short barrel nut, a top cocking
  // knob and a wire stock folded down the side
  uzi(g) {
    const steel = M.dark(), poly = M.polymer(), black = BLACK();
    g.add(slab([[-5, 0], [5.4, 0], [5.4, 2.4], [-5, 2.4]], 2.3, steel, 0, 0, 0, 0.45));
    for (let i = 0; i < 6; i++) g.add(part(new THREE.BoxGeometry(0.3, 2.2, 0.25), black, -3.8 + i * 1.4, 0, 2.38)); // ribbed top
    g.add(part(tube(0.75, 1.4, 14), steel, 6.0, 0, 1.2)); // barrel nut
    barrel(g, 0.36, 1.6, 6.6, 1.2, steel);
    g.add(slab([[1.0, 0.05], [0.5, -4.6], [-1.6, -4.6], [-1.4, 0.05]], 1.75, poly, 0, 0, 0, 0.2)); // grip
    g.add(part(rbox(1.5, 1.25, 2.2, 0.15), steel, -0.65, 0, -5.6, 0, 0.1, 0)); // magazine
    g.add(slab([[3.4, 0.05], [3.2, -1.3], [1.2, -1.4], [1.0, 0.05]], 1.2, steel, 0, 0, 0, 0.12, [[[2.9, -0.15], [2.75, -1.0], [1.45, -1.05], [1.3, -0.15]]])); // trigger guard
    g.add(part(new THREE.SphereGeometry(0.5, 10, 8), steel, 1.0, 0, 2.75)); // cocking knob
    for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.3, 0.6, 0.9), steel, 4.4, s * 0.5, 2.8)); // front sight ears
    for (const s of [-1, 1]) g.add(part(tube(0.18, 9), steel, -1.6, s * 1.35, 0.5)); // folded wire stock
    g.add(part(rbox(0.5, 3, 2.4, 0.2), steel, 2.9, 0, 0.5)); // its butt plate
  },
  // an AK-pattern rifle: a stamped receiver with a ribbed dust cover, wooden handguards, a gas block and a
  // slant brake, a curved steel magazine, a wooden grip and a long wooden stock
  ak(g) {
    const steel = M.dark(), wood = M.wood(), black = BLACK();
    g.add(slab([[-5.5, 0], [6.5, 0], [6.5, 2.0], [5.8, 2.4], [-4.8, 2.6], [-5.5, 2.0]], 2.0, steel, 0, 0, 0, 0.25)); // receiver
    for (let i = 0; i < 6; i++) g.add(part(new THREE.BoxGeometry(0.2, 1.7, 0.2), black, -4 + i * 1.3, 0, 2.55)); // dust cover ribs
    g.add(slab([[6.5, 0.25], [13.5, 0.45], [13.5, 1.85], [6.5, 1.85]], 2.35, wood, 0, 0, 0, 0.45)); // lower handguard
    g.add(slab([[7, 2.0], [13, 2.0], [13, 2.75], [7.3, 2.9]], 1.65, wood, 0, 0, 0, 0.35)); // upper handguard
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) g.add(part(new THREE.CircleGeometry(0.22, 10).rotateX(s * Math.PI / 2), black, 8.6 + i * 1.6, s * 0.84, 2.45)); // vent holes
    barrel(g, 0.4, 7.5, 13.5, 1.15, steel);
    g.add(part(rbox(1.2, 1.4, 2.4, 0.2), steel, 13.9, 0, 1.7)); // gas block
    g.add(part(rbox(1.2, 1.1, 3.0, 0.2), steel, 18.4, 0, 1.6)); // front sight block
    g.add(part(new THREE.BoxGeometry(0.2, 0.2, 0.9), steel, 18.4, 0, 3.4));
    g.add(part(tube(0.6, 1.6, 12), steel, 21.6, 0, 1.15)); // slant brake
    g.add(slab([[1.6, 0.05], [4.0, 0.05], [5.2, -3.0], [5.0, -6.2], [2.6, -6.6], [2.0, -3.4]], 1.4, steel, 0, 0, 0, 0.15)); // magazine
    for (let i = 0; i < 4; i++) g.add(part(new THREE.BoxGeometry(0.15, 1.45, 0.4), black, 2.6 + i * 0.6, 0, -1.4 - i * 1.3)); // its ribs
    g.add(slab([[-1.0, 0.05], [-1.6, -4.2], [-3.4, -4.2], [-3.2, -0.5], [-2.6, 0.05]], 1.55, wood, 0, 0, 0, 0.25)); // grip
    g.add(slab([[0.8, 0.05], [0.7, -1.2], [-0.9, -1.3], [-0.9, 0.05]], 0.4, steel, 0, 0, 0, 0.08, [[[0.55, -0.15], [0.45, -1.0], [-0.65, -1.05], [-0.65, -0.15]]])); // trigger guard
    g.add(slab([[-5.5, 0.2], [-5.5, 2.0], [-16, 0.9], [-16.4, 0.6], [-16.4, -3.4], [-15.6, -3.6], [-9, -1.0]], 1.9, wood, 0, 0, 0, 0.35)); // stock
    g.add(part(rbox(0.5, 2.0, 4.2, 0.2), steel, -16.6, 0, -1.4)); // butt plate
    g.add(part(new THREE.BoxGeometry(1.4, 0.8, 0.4), steel, 3.5, 0, 2.9)); // rear sight leaf
    g.add(slab([[-3.5, 1.3], [2.5, 1.5], [2.5, 1.9], [-3.5, 1.7]], 0.15, steel, 0, 1.05, 0, 0.04)); // selector lever
  },
  // a marksman rifle: a long railed receiver, a free-float handguard, a straight 10-round magazine, a
  // thumbhole stock with a cheek riser, a muzzle brake and a long scope
  dmr(g) {
    const steel = M.dark(), poly = M.polymer(), black = BLACK(), tan = M.paint(0x8a7a5a);
    g.add(slab([[-6, 0], [8, 0], [8, 2.6], [-6, 2.6]], 2.4, steel, 0, 0, 0, 0.25));
    rail(g, -6, 14, 2.7, steel);
    g.add(slab([[8, 0.3], [18.5, 0.3], [18.5, 2.5], [8, 2.5]], 2.5, tan, 0, 0, 0, 0.5)); // handguard
    grooves(g, black, 9.5, 2, 5, 1.26, 1.4, 1.2, 0.4, 0.06);
    barrel(g, 0.5, 7, 18.5, 1.4, steel);
    g.add(part(tube(0.78, 2.4, 12), steel, 26.4, 0, 1.4)); // muzzle brake
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.4, 0.2, 0.5), black, 25.7 + i * 0.7, s * 0.7, 1.4));
    g.add(part(rbox(2.4, 1.6, 4.5, 0.2), steel, 2, 0, -2.2)); // magazine
    g.add(slab([[-1.5, 0.05], [-2.3, -4.4], [-4.0, -4.4], [-3.6, -0.4], [-3.0, 0.05]], 1.6, tan, 0, 0, 0, 0.25)); // grip
    triggerGuard(g, -0.8, -0.9, steel);
    g.add(slab([[-6, 0.2], [-6, 2.4], [-17, 2.6], [-17.6, 2.3], [-17.6, -2.6], [-16.8, -2.8], [-12, -0.6], [-7, -0.8]], 1.9, tan, 0, 0, 0, 0.35, [[[-8.2, 0.9], [-12.2, 1.2], [-12.4, -0.2], [-9.2, -0.3]]])); // thumbhole stock
    g.add(part(rbox(4.5, 1.8, 0.8, 0.3), tan, -13.5, 0, 3.0)); // cheek riser
    g.add(part(rbox(0.8, 2.0, 5.6, 0.3), poly, -17.9, 0, -0.1)); // recoil pad
    optic(g, 1, 5.2, 11, 1.1, steel, M.glass());
    for (const x of [-2, 4]) g.add(part(rbox(1.0, 1.6, 2.0, 0.2), steel, x, 0, 4.0)); // scope rings
    g.add(part(new THREE.CylinderGeometry(0.6, 0.6, 1.0, 12), M.steel(), 1, 0, 6.8)); // turret
    g.add(part(new THREE.BoxGeometry(2, 0.06, 1), black, 1.5, 1.22, 1.5)); // ejection port
  },
  // a side-by-side double barrel: two barrels with a rib between, a steel action, a wooden splinter fore-end,
  // twin triggers and a wooden stock with a straight wrist
  double(g) {
    const steel = M.steel(), dark = M.dark(), wood = M.wood(), black = BLACK();
    for (const s of [-0.72, 0.72]) {
      g.add(part(tube(0.72, 20, 16), dark, 8.4, s, 1.4)); // barrels
      g.add(part(new THREE.CircleGeometry(0.5, 14).rotateY(Math.PI / 2), black, 18.42, s, 1.4)); // bores
    }
    g.add(part(new THREE.BoxGeometry(20, 0.5, 0.3), dark, 8.4, 0, 2.1)); // the rib
    g.add(slab([[-4.5, -0.4], [0, -0.4], [0, 2.4], [-4.5, 2.4]], 2.7, steel, -1.6, 0, 0, 0.35)); // action
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) g.add(part(new THREE.CircleGeometry(0.45, 12).rotateX(s * Math.PI / 2), M.dark(), -4.4 + i * 1.3, s * 1.36, 1.0)); // engraving
    g.add(slab([[1, 0.15], [9, 0.45], [9, 1.25], [1, 1.15]], 2.5, wood, 0, 0, 0, 0.4)); // fore-end
    g.add(slab([[-6.1, -0.3], [-6.1, 2.2], [-9.5, 1.6], [-18.2, 1.8], [-18.6, 1.4], [-18.6, -3.0], [-17.8, -3.2], [-9.5, -1.0], [-7.4, -1.2]], 2.0, wood, 0, 0, 0, 0.35)); // stock
    g.add(slab([[-2.4, -0.4], [-2.5, -1.5], [-4.6, -1.6], [-4.8, -0.4]], 0.35, steel, 0, 0, 0, 0.08, [[[-2.7, -0.55], [-2.75, -1.25], [-4.4, -1.3], [-4.5, -0.55]]])); // trigger guard
    for (const x of [-3.3, -4.0]) g.add(slab([[x, -0.4], [x + 0.12, -1.0], [x - 0.15, -1.15], [x - 0.3, -0.4]], 0.3, dark, 0, 0, 0, 0.05)); // twin triggers
    g.add(part(new THREE.BoxGeometry(1.4, 0.5, 0.35), steel, -4.6, 0.35, 2.55, 0, 0, 0.4)); // top lever
    g.add(part(new THREE.SphereGeometry(0.28, 8, 6), M.steel(), 18, 0, 2.4)); // bead
  },
  // a flashbang: a perforated steel can with a spoon and a pull ring
  flashbang(g) {
    const steel = M.steel(), dark = M.dark(), black = BLACK();
    g.add(part(new THREE.CylinderGeometry(1.25, 1.25, 4.2, 16).rotateX(Math.PI / 2), M.paint(0x3d4a3a), 0, 0, 0));
    for (let r = 0; r < 3; r++) for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + r * 0.4;
      g.add(part(new THREE.CircleGeometry(0.22, 8).lookAt(new THREE.Vector3(Math.cos(a), Math.sin(a), 0)), black, Math.cos(a) * 1.27, Math.sin(a) * 1.27, -1.2 + r * 1.2));
    }
    g.add(part(new THREE.CylinderGeometry(0.8, 1.0, 1.0, 12).rotateX(Math.PI / 2), dark, 0, 0, 2.55)); // fuse head
    g.add(part(new THREE.BoxGeometry(0.5, 0.8, 4.2), steel, -1.4, 0, 1.0, 0, 0.18, 0)); // spoon
    g.add(part(new THREE.TorusGeometry(0.75, 0.11, 6, 14), steel, 0.8, 0, 3.2, 0, Math.PI / 2, 0)); // pull ring
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
    g.add(part(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 12), M.steel(), 1, 0, 6.1)); // elevation turret
    g.add(part(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 12).rotateX(Math.PI / 2), M.steel(), 1, 1.85, 4.4)); // windage turret
    g.add(part(tube(1.0, 3, 10), steel, 33, 0, 1.4)); // muzzle brake
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) g.add(part(new THREE.BoxGeometry(0.5, 0.2, 0.6), M.polymer(), 32 + i * 0.9, s * 0.95, 1.4));
    g.add(part(new THREE.SphereGeometry(0.75, 10, 8), steel, 0.2, 2.6, 1.0)); // bolt knob
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
  // a zombie's fist (they punch; no claws): grey-green rotting skin, a torn sleeve, split knuckles
  claws(g) {
    const skin = new THREE.MeshStandardMaterial({ color: 0x6b7a5a, roughness: 0.85 });
    const rag = new THREE.MeshStandardMaterial({ color: 0x3a4232, roughness: 0.95 });
    const blood = new THREE.MeshStandardMaterial({ color: 0x3a0806, roughness: 0.3 });
    const bone = new THREE.MeshStandardMaterial({ color: 0xcfc6a8, roughness: 0.5 });
    g.add(part(rbox(12, 4.6, 4.2, 1.6), skin, -5, 0, 0)); // forearm
    g.add(part(rbox(4, 5.4, 5, 1), rag, -10, 0, 0.1)); // torn sleeve
    for (const [x, y] of [[-12.3, 1.8], [-12.6, -1.2]]) g.add(part(rbox(2, 1.2, 1.2, 0.3), rag, x, y, -2.2, 0.3, 0, 0)); // rag strips
    g.add(part(rbox(5.6, 6, 4.8, 1.6), skin, 3.2, 0, 0.2)); // fist
    for (let i = 0; i < 4; i++) g.add(part(new THREE.SphereGeometry(0.95, 8, 6), i === 1 ? bone : skin, 6, -2.1 + i * 1.4, 1.4)); // knuckles
    g.add(part(rbox(2.4, 1.6, 1.6, 0.6), skin, 3.6, 2.9, -0.6, 0, 0, -0.4)); // thumb
    g.add(part(rbox(3, 2.4, 0.4, 0.15), blood, 1, -0.8, 2.25)); // blood on the back of the hand
    g.add(part(rbox(5, 0.4, 2.6, 0.15), blood, -4, 2.32, 0.3)); // and down the arm
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
    // a wooden crate: a dark core, planks on every face with gaps between them, cross braces, steel corners
    const wood = M.wood(), dark = M.dark();
    g.add(part(new THREE.BoxGeometry(38, 38, 38), new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 1 }), 0, 0, 20));
    for (let i = 0; i < 4; i++) {
      const z = 4.8 + i * 9.6;
      for (const s of [-1, 1]) { g.add(part(rbox(39.6, 1.6, 8.8, 0.4), wood, 0, s * 19.2, z)); g.add(part(rbox(1.6, 39.6, 8.8, 0.4), wood, s * 19.2, 0, z)); }
    }
    for (let i = 0; i < 4; i++) g.add(part(rbox(9.4, 39.6, 1.6, 0.4), wood, -14.4 + i * 9.6, 0, 39.2));
    for (const s of [-1, 1]) {
      const brace = part(rbox(50, 1.2, 4, 0.3), wood, 0, s * 20.2, 20); brace.rotation.x = 0; brace.rotation.y = 0.78; g.add(brace);
      const brace2 = part(rbox(1.2, 50, 4, 0.3), wood, s * 20.2, 0, 20); brace2.rotation.x = 0.78; g.add(brace2);
    }
    for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [1.5, 38.5]) g.add(part(new THREE.BoxGeometry(5, 5, 3), dark, x * 18.6, y * 18.6, z));
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
