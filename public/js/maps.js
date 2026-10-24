// Client-side map loading: visuals plus the same collision boxes, spawns and items the server uses.
import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CODE_MAPS } from './mapdefs.js';
import { surfaceMaterial, neonMaterial } from './shaders.js';

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
};
function surf(mat, pal) {
  if (mat === 'neon') return neonMaterial(pal.neon);
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
  group.updateMatrixWorld(true);
  return {
    id, name: def.name, group,
    boxes: def.boxes.map((b) => ({ mins: b.slice(0, 3), maxs: b.slice(3, 6) })),
    spawns: def.spawns, bounds: def.bounds, sun: [-0.4, 0.35, 0.85], pads: [], killZ: def.killZ,
  };
}

function codeMap(id, def) {
  const pal = PALETTES[id] || PALETTES.foundry;
  const byMat = new Map();
  for (const b of def.boxes) {
    const g = new THREE.BoxGeometry(b.maxs[0] - b.mins[0], b.maxs[1] - b.mins[1], b.maxs[2] - b.mins[2]);
    g.translate((b.mins[0] + b.maxs[0]) / 2, (b.mins[1] + b.maxs[1]) / 2, (b.mins[2] + b.maxs[2]) / 2);
    if (!byMat.has(b.mat)) byMat.set(b.mat, []);
    byMat.get(b.mat).push(g);
  }
  const group = new THREE.Group();
  for (const [mat, geos] of byMat) {
    const mesh = new THREE.Mesh(mergeGeometries(geos), surf(mat, pal));
    mesh.castShadow = mat !== 'neon';
    mesh.receiveShadow = true;
    group.add(mesh);
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
  return { id, name: def.name, group, boxes: def.boxes, spawns: def.spawns, bounds: def.bounds, sun: (Array.isArray(def.sun) ? def.sun : def.sun?.dir) || [0.3, 0.3, 0.85], pads: def.pads || [], killZ: def.killZ };
}
