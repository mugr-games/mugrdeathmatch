// Client-side map loading: visuals plus the same collision boxes, spawns and items the server uses.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CODE_MAPS } from './mapdefs.js';
import { surfaceMaterial, neonMaterial } from './shaders.js';
import { decorate } from './mapdetail.js';

const CHUNK = 1024; // map chunk size for culling

// Each code-built map gets its own palette so they don't all look alike.
const PALETTES = {
  foundry: { concrete: '#9a958c', plate: '#7d8188', metal: '#6f757d', panel: ['#8a8478', '#6b6458'], hazard: '#e8b400', neon: '#56d8ff' },
  courtyard: { concrete: '#b9a98c', plate: '#8f877a', metal: '#6d6a66', panel: ['#c2b29a', '#9c8a70'], hazard: '#c8642e', neon: '#ffb45a' },
  skyline: { concrete: '#8c96a6', plate: '#6f7a8c', metal: '#5d6573', panel: ['#9aa6b8', '#7a8698'], hazard: '#e05a8a', neon: '#c46bff' },
  warehouse: { concrete: '#8e8a82', plate: '#6e6e6a', metal: '#4f6a86', panel: ['#7f7a70', '#5f5a50'], hazard: '#f0b020', neon: '#ffe08a' },
  rooftops: { concrete: '#a39c94', plate: '#6a625a', metal: '#5a5f66', panel: ['#9c7a64', '#7a5a46'], hazard: '#d24a3a', neon: '#ff8a5a' },
  bunker: { concrete: '#6f716c', plate: '#5a5c58', metal: '#4a4d50', panel: ['#7a7c74', '#5c5e58'], hazard: '#d8b030', neon: '#7cff8a' },
  ziggurat: { concrete: '#c2a878', plate: '#9a8a6a', metal: '#7a6a4e', panel: ['#d0b488', '#a88c62'], hazard: '#2f8a8a', neon: '#5affd8' },
  docks: { concrete: '#8a9096', plate: '#5f6a72', metal: '#3f6f8a', panel: ['#a8503a', '#7a3a2a'], hazard: '#f0c020', neon: '#5ad2ff' },
  canyon: { concrete: '#c28a5c', plate: '#8a6a4a', metal: '#6a5a4a', panel: ['#b0704a', '#8a5034'], hazard: '#9a6a46', neon: '#ffb070' },
  office: { concrete: '#a8a8a2', plate: '#6a6e74', metal: '#8a9098', panel: ['#d8d4cc', '#b8b2a6'], hazard: '#4a8a5a', neon: '#e8f4ff' },
  station: { concrete: '#9a9c98', plate: '#5c5e60', metal: '#5a6670', panel: ['#d0d4d0', '#2f6aa8'], hazard: '#e8c020', neon: '#ffd060' },
  city: { concrete: '#a19d96', plate: '#3c3f44', metal: '#5e6670', panel: ['#a8705a', '#7c4e3e'], hazard: '#d8a820', neon: '#ffd890', grass: ['#4e7a36', '#3a5a28'] },
  pitch: { concrete: '#8f9298', plate: '#5c6066', metal: '#b8bec6', panel: ['#1f56b8', '#173f88'], hazard: '#e8c020', neon: '#fff4d8', grass: ['#3f8f3a', '#347a30'] },
  court: { concrete: '#8f9298', plate: '#5a5248', metal: '#c4cad2', panel: ['#b8401f', '#8a2f16'], hazard: '#ff6a1a', neon: '#fff4d8', grass: ['#3f8f3a', '#347a30'] },
  arthouse: { concrete: '#a8a49c', plate: '#3a3a3c', metal: '#7c8590', panel: ['#ece6da', '#d8d0c0'], hazard: '#c8a040', neon: '#fff0c8', stone: ['#e0d8c8', '#c4b8a4'], brick: ['#8e5a48', '#b0a596'], wood: ['#5a3a24', '#3a2416'], marble: ['#f2eee6', '#d8d2c6'] },
  mansion: { concrete: '#b8b0a0', plate: '#5a4a40', metal: '#7c8590', panel: ['#e8dcc4', '#d0c0a0'], hazard: '#c8a040', neon: '#ffe0a0', stone: ['#d8ccb4', '#b8a88c'], wood: ['#6a4428', '#4a2c18'], marble: ['#f0ece2', '#dcd4c4'], grass: ['#5a8a3a', '#3e6a2a'], stucco: '#efe2c8' },
  bank: { concrete: '#9a968f', plate: '#2f3236', metal: '#7c8590', panel: ['#cfc8b8', '#b4ab98'], hazard: '#c8a040', neon: '#ffd890', stone: ['#d8d0c2', '#b9ae9c'], brick: ['#8e4a38', '#b0a596'], wood: ['#6e4a2c', '#4e331e'], marble: ['#ece8e0', '#cfc8bc'] },
  asylum: { concrete: '#8f8c84', plate: '#4a4c4e', metal: '#7a8088', panel: ['#b8c0a8', '#8e9680'], hazard: '#b89a40', neon: '#d8f0ff', stone: ['#8a8478', '#6a6458'], wood: ['#6a5038', '#463424'], tile: ['#c8ccc0', '#a8ae9e'], grass: ['#4a5a32', '#3a3424'] },
  harvest: { concrete: '#a8a090', plate: '#5a5048', metal: '#8a8e90', panel: ['#b89a70', '#8a7050'], hazard: '#d8a040', neon: '#ffd890', stone: ['#9a9284', '#7a7264'], wood: ['#8a6440', '#5a4028'], grass: ['#8a8a3a', '#6a4a2c'], corn: ['#c8b058', '#8a7a34'], foliage: ['#d06a1e', '#8a2e10'] },
  hollow: { concrete: '#9a948a', plate: '#4a4440', metal: '#7a7a7a', panel: ['#b0a080', '#8a7a5a'], hazard: '#c84a2a', neon: '#ffcf80', stone: ['#9a948a', '#6e685e'], wood: ['#7a5636', '#503622'], grass: ['#7a7a34', '#5a4028'], cobble: ['#8e887c', '#4a4238'], foliage: ['#e0821e', '#9a3812'] },
  course: { concrete: '#c8c2b8', plate: '#4f5a6e', metal: '#9aa4b0', panel: ['#8a92a8', '#6a7288'], hazard: '#ffcf1a', neon: '#ff4fd8' },
};
// goal nets: a white grid you can see through
let netMat = null;
function net() {
  if (!netMat) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 3;
    g.strokeRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 1);
    netMat = new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide, depthWrite: false });
  }
  return netMat;
}

// windows: dark, shiny and a little see-through
let glass = null;
function glassMat() {
  return (glass ||= new THREE.MeshStandardMaterial({ color: 0x9fc4d8, metalness: 0.9, roughness: 0.08, transparent: true, opacity: 0.45 }));
}

// creeks and fountains: dark, glossy, see-through
let water = null;
function waterMat() {
  return (water ||= new THREE.MeshStandardMaterial({ color: 0x24404e, metalness: 0.2, roughness: 0.05, transparent: true, opacity: 0.78 }));
}

// paintings hung on gallery walls: a gilt frame round a canvas of colour (one texture, varied by the box's uv)
let gallery = null;
function paintingWall() {
  if (gallery) return gallery;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#b08a3a'; g.fillRect(0, 0, 256, 192);
  g.fillStyle = '#2a2420'; g.fillRect(12, 12, 232, 168);
  let s = 7;
  const R = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 30; i++) { g.fillStyle = `hsla(${R() * 360},55%,${35 + R() * 40}%,.8)`; g.beginPath(); g.ellipse(16 + R() * 224, 16 + R() * 160, 6 + R() * 40, 5 + R() * 30, R() * 3, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return (gallery = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
}

function surf(mat, pal) {
  if (mat === 'neon') return neonMaterial(pal.neon);
  if (mat === 'line') return surfaceMaterial('concrete', { color: '#f4f4ee', bump: 0.2 });
  if (mat === 'stone') { const c = pal.stone || ['#c8c2b8', '#a8a294']; return surfaceMaterial('stone', { color: c[0], color2: c[1] }); }
  if (mat === 'marble') { const c = pal.marble || ['#ece8e0', '#cfc8bc']; return surfaceMaterial('marble', { color: c[0], color2: c[1], bump: 0.6 }); }
  if (mat === 'asphalt') return surfaceMaterial('asphalt', { color: pal.asphalt || '#3a3b3e', bump: 1.2 });
  if (mat === 'tile') { const c = pal.tile || ['#d8d4cc', '#b8b0a2']; return surfaceMaterial('tile', { color: c[0], color2: c[1], bump: 0.8 }); }
  if (mat === 'cobble') { const c = pal.cobble || ['#8a8478', '#4a4034']; return surfaceMaterial('cobble', { color: c[0], color2: c[1], bump: 2 }); }
  if (mat === 'leaves') { const c = pal.grass || ['#6a7a36', '#5a4430']; return surfaceMaterial('leaves', { color: c[0], color2: c[1] }); }
  if (mat === 'brick') { const c = pal.brick || ['#9b5640', '#b5aa9c']; return surfaceMaterial('brick', { color: c[0], color2: c[1] }); }
  if (mat === 'wood') { const c = pal.wood || ['#8a6438', '#5e4126']; return surfaceMaterial('wood', { color: c[0], color2: c[1] }); }
  if (mat === 'glass') return glassMat();
  if (mat === 'water') return waterMat();
  if (mat === 'corn') { const c = pal.corn || ['#c8b058', '#8a7a34']; return surfaceMaterial('grass', { color: c[0], color2: c[1], bump: 2.2 }); }
  if (mat === 'foliage') { const c = pal.foliage || ['#d06a1e', '#8a2e10']; return surfaceMaterial('grass', { color: c[0], color2: c[1], bump: 2.5 }); }
  if (mat === 'hay') return surfaceMaterial('wood', { color: '#d8b860', color2: '#a8883a', bump: 2 });
  if (mat === 'roof') return surfaceMaterial('brick', { color: '#5a4a44', color2: '#32282a' });
  if (mat === 'barn') return surfaceMaterial('wood', { color: '#9a2a1e', color2: '#661a12' });
  if (mat === 'tractor') return surfaceMaterial('metal', { color: '#2f7a2a' });
  if (mat === 'pumpkin') return surfaceMaterial('clay', { color: '#e8761a' });
  if (mat === 'logs') return surfaceMaterial('wood', { color: '#7a5232', color2: '#4a3020', bump: 2.2 });
  if (mat === 'awning') return surfaceMaterial('hazard', { color: '#c03a2a' });
  if (mat === 'stucco') return surfaceMaterial('clay', { color: pal.stucco || '#e8dcc4' });
  if (mat === 'hedge') return surfaceMaterial('grass', { color: '#2f5a26', color2: '#244a1e', bump: 3 });
  if (mat === 'palm') return surfaceMaterial('grass', { color: '#3f7a2a', color2: '#2a5a1e', bump: 2.5 });
  if (mat === 'bark') return surfaceMaterial('wood', { color: '#6a4a30', color2: '#4a3020', bump: 2 });
  if (mat === 'sand') return surfaceMaterial('dirt', { color: '#d8c290', color2: '#c2a878', bump: 0.8 });
  if (mat === 'leather') return surfaceMaterial('clay', { color: '#5a3424' });
  if (mat === 'gold') return new THREE.MeshStandardMaterial({ color: 0xe8b830, metalness: 1, roughness: 0.25 });
  if (mat === 'painting') return paintingWall();
  if (mat === 'grass') return surfaceMaterial('grass', { color: (pal.grass || ['#4e7a36'])[0], color2: (pal.grass || [0, '#3a5a28'])[1] });
  if (mat === 'panel') return surfaceMaterial('panel', { color: pal.panel[0], color2: pal.panel[1] });
  if (mat === 'hazard') return surfaceMaterial('hazard', { color: pal.hazard });
  if (mat === 'plate' || mat === 'metal') return surfaceMaterial(mat, { color: pal[mat] });
  return surfaceMaterial('concrete', { color: pal.concrete });
}

// Surfaces for the block remake, by mesh name (and material name where one mesh holds several).
const BLOCK_SURF = {
  Floor: (m) => (/top/i.test(m) ? surfaceMaterial('grass', { color: '#5f8f3a', color2: '#6b4b31' }) : /side/i.test(m) ? surfaceMaterial('grassside', { color: '#5f8f3a', color2: '#6b4b31' }) : surfaceMaterial('dirt', { color: '#5f8f3a', color2: '#6b4b31' })),
  Floor1: () => surfaceMaterial('brick', { color: '#4f8f86', color2: '#2f5550' }),
  Barrel: () => surfaceMaterial('barrel', { color: '#7a5634', color2: '#3b3b3e' }),
  Wall: () => surfaceMaterial('stone', { color: '#8d8d8d', color2: '#6c6c6c' }),
  StairWhite: () => surfaceMaterial('stone', { color: '#d6d4cf', color2: '#a9a7a3' }),
  Stair: () => surfaceMaterial('stone', { color: '#8a8a8a', color2: '#707070' }),
  Ladder: () => surfaceMaterial('wood', { color: '#8a6438', color2: '#5e4126' }),
  Building: () => surfaceMaterial('clay', { color: '#a89a92' }),
  Box: () => surfaceMaterial('crate', { color: '#a57c48', color2: '#6a4a2a' }),
  WallVillager: () => surfaceMaterial('clay', { color: '#5d6b36' }),
  Bricks: () => surfaceMaterial('brick', { color: '#9b5640', color2: '#b5aa9c' }),
};

// Image requests from the model file are answered with a blank pixel: we texture everything ourselves.
const BLANK = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
function blankManager() {
  const m = new THREE.LoadingManager();
  m.setURLModifier((url) => (/\.(png|jpe?g|tga|bmp|dds|webp)(\?|$)/i.test(url) ? BLANK : url));
  return m;
}

// Block models often store one material group per face (thousands of draw calls). Re-order the index so
// every material's triangles are contiguous, leaving one group per distinct material.
function consolidate(mesh) {
  const g = mesh.geometry;
  if (!Array.isArray(mesh.material) || g.groups.length <= 1) return;
  const unique = [...new Set(mesh.material)];
  const src = g.index ? g.index.array : null;
  const buckets = unique.map(() => []);
  for (const gr of g.groups) {
    const b = buckets[unique.indexOf(mesh.material[gr.materialIndex])];
    for (let i = gr.start; i < gr.start + gr.count; i++) b.push(src ? src[i] : i);
  }
  const total = buckets.reduce((n, b) => n + b.length, 0);
  const index = new Uint32Array(total);
  g.clearGroups();
  let start = 0;
  buckets.forEach((b, k) => {
    index.set(b, start);
    g.addGroup(start, b.length, k);
    start += b.length;
  });
  g.setIndex(new THREE.BufferAttribute(index, 1));
  mesh.material = unique;
}

export async function loadMap(id, progress = () => {}) {
  if (CODE_MAPS[id]) return codeMap(id, CODE_MAPS[id]);
  progress('Downloading map');
  const def = await fetch(`maps/${id}/map.json`).then((r) => {
    if (!r.ok) throw new Error(`Map "${id}" is missing on the server.`);
    return r.json();
  });
  progress('Building map');
  const loader = /\.fbx$/i.test(def.model) ? new FBXLoader(blankManager()) : new GLTFLoader(blankManager());
  const raw = await new Promise((res, rej) => loader.load(def.model, res, undefined, rej));
  const model = raw.scene || raw;
  model.traverse((o) => {
    if (!o.isMesh) return;
    const pick = BLOCK_SURF[o.name] || (() => surfaceMaterial('stone', { color: '#8a8a8a' }));
    const mats = [].concat(o.material).map((m) => pick(m.name || ''));
    o.material = Array.isArray(o.material) ? mats : mats[0];
    consolidate(o);
    o.castShadow = true;
    o.receiveShadow = true;
  });
  // model is Y-up in centimetres; the game is Z-up with 40 units per block (same transform as tools/build_map.mjs)
  const group = new THREE.Group();
  const turn = new THREE.Group();
  turn.rotation.x = Math.PI / 2;
  turn.scale.setScalar(def.scale);
  turn.add(model);
  group.add(turn);
  const boxes = def.boxes.map((b) => ({ mins: b.slice(0, 3), maxs: b.slice(3, 6) }));
  // block maps carry no materials: the ground level counts as grass
  const detail = decorate(id, boxes, def.bounds, undefined, { grassBelow: 104 }); // the block map's ground is at z 100
  group.add(detail.group);
  group.updateMatrixWorld(true);
  return {
    id, name: def.name, group, boxes,
    spawns: def.spawns, bounds: def.bounds, sun: [-0.4, 0.35, 0.85], pads: [], killZ: def.killZ, tick: detail.tick,
  };
}

function codeMap(id, def) {
  const pal = PALETTES[id] || PALETTES.foundry;
  // the map in square chunks, one merged mesh per material in each: the renderer skips chunks off screen,
  // and occlusion culling skips the ones hidden behind walls (each box goes in the chunk of its centre)
  const chunks = new Map(); // "cx,cy" -> { byMat: Map(mat -> geometries), box: [min xyz, max xyz] }
  for (const b of def.boxes) {
    if (b.mat === 'clip') continue; // invisible walls
    const g = new THREE.BoxGeometry(b.maxs[0] - b.mins[0], b.maxs[1] - b.mins[1], b.maxs[2] - b.mins[2]);
    g.translate((b.mins[0] + b.maxs[0]) / 2, (b.mins[1] + b.maxs[1]) / 2, (b.mins[2] + b.maxs[2]) / 2);
    const key = Math.floor((b.mins[0] + b.maxs[0]) / 2 / CHUNK) + ',' + Math.floor((b.mins[1] + b.maxs[1]) / 2 / CHUNK);
    let c = chunks.get(key);
    if (!c) chunks.set(key, (c = { byMat: new Map(), box: [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity] }));
    if (!c.byMat.has(b.mat)) c.byMat.set(b.mat, []);
    c.byMat.get(b.mat).push(g);
    for (let i = 0; i < 3; i++) { c.box[i] = Math.min(c.box[i], b.mins[i]); c.box[i + 3] = Math.max(c.box[i + 3], b.maxs[i]); }
  }
  const group = new THREE.Group();
  const cells = [];
  for (const c of chunks.values()) {
    const objects = [];
    for (const [mat, geos] of c.byMat) {
      const mesh = new THREE.Mesh(mergeGeometries(geos), surf(mat, pal));
      mesh.castShadow = mat !== 'neon';
      mesh.receiveShadow = true;
      group.add(mesh);
      objects.push(mesh);
    }
    cells.push({ objects, box: c.box });
  }
  // jump pads: a glowing disc with a faint beam showing which way it throws you
  for (const p of def.pads || []) {
    const c = [(p.mins[0] + p.maxs[0]) / 2, (p.mins[1] + p.maxs[1]) / 2, p.maxs[2]];
    const r = (p.maxs[0] - p.mins[0]) / 2;
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, 4, 28).rotateX(Math.PI / 2), neonMaterial(pal.neon));
    disc.position.set(c[0], c[1], c[2] - 2);
    group.add(disc);
    const dir = new THREE.Vector3(...p.vel).normalize();
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(r * 0.15, r * 0.7, 120, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.neon).multiplyScalar(1.6), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dir);
    beam.position.set(c[0] + dir.x * 60, c[1] + dir.y * 60, c[2] + dir.z * 60);
    group.add(beam);
  }
  // drawn but never collides: pitch lines, nets, stands, markers
  const decoMats = new Map();
  for (const b of def.decor || []) {
    const sx = b.maxs[0] - b.mins[0], sy = b.maxs[1] - b.mins[1], sz = b.maxs[2] - b.mins[2];
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (b.mat === 'net') {
      // one grid square every 16 units on every face
      const uv = g.attributes.uv, n = g.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const ax = Math.abs(n.getX(i)) > 0.5 ? [sy, sz] : Math.abs(n.getY(i)) > 0.5 ? [sx, sz] : [sx, sy];
        uv.setXY(i, uv.getX(i) * ax[0] / 16, uv.getY(i) * ax[1] / 16);
      }
    }
    g.translate((b.mins[0] + b.maxs[0]) / 2, (b.mins[1] + b.maxs[1]) / 2, (b.mins[2] + b.maxs[2]) / 2);
    if (!decoMats.has(b.mat)) decoMats.set(b.mat, []);
    decoMats.get(b.mat).push(g);
  }
  for (const [mat, geos] of decoMats) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat === 'net' ? net() : surf(mat, pal));
    mesh.castShadow = mat !== 'net' && mat !== 'line' && mat !== 'neon';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  // the pitch stays clean: no litter, tufts or wall clutter on a football ground
  const detail = def.soccer || def.heist || def.stream ? { group: new THREE.Group(), tick: () => {} } : decorate(id, def.boxes.filter((b) => b.mat !== 'clip'), def.bounds, pal);
  group.add(detail.group);
  return { id, name: def.name, group, cells, boxes: def.boxes, spawns: def.spawns, bounds: def.bounds, sun: (Array.isArray(def.sun) ? def.sun : def.sun?.dir) || [0.3, 0.3, 0.85], pads: def.pads || [], killZ: def.killZ, tick: detail.tick, mood: def.mood || 'day', stream: !!def.stream };
}
