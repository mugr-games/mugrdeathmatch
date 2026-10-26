// Free roam in the browser: Mugr County streamed in around you (detailed chunks close by, simple shapes further
// out, a painted map to the horizon), the collision you predict against, traffic, people and police, your car
// (first person with your hands on the wheel, or a chase camera), traffic lights, money on the ground, and the
// HUD: cash, wanted stars, radar, speedometer, prompts, the phone (buy cars and bikes, call your garage, the
// map) and the gun shop counter.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, N, RW, KERB, CHUNK, genCell, district, D, DISTRICT_NAMES, isWater, isUrban, roadH, roadV, hasSignal, signal, exits, DIRS, RIGHT, PLACES, CITIES, TOWNS, AIRFIELDS, hash, cellOf } from './citygen.js';
import { VEHICLES, PAINTS, PAINT_NAMES, seatPos, carBoxes } from './vehicle.js';
import { CarModel, wheelInfo } from './carmodels.js';
import { surfaceMaterial, neonMaterial, isPotato } from './shaders.js';
import { SUIT_COLORS } from './avatar.js';
import { WEAPONS, WEAPON_INDEX, GUN_SHOP, ARMOR_PRICE } from './weapons.js';
import { WEAPON_SLOT } from './assets.js';
import { BoxWorld } from './collide.js';
import { viewDir } from './sim.js';
import { esc } from './hud.js';

const DEG = Math.PI / 180;
const CW = G * CHUNK; // chunk width
const $ = (id) => document.getElementById(id);
const angDiff = (a, b) => ((b - a) % 360 + 540) % 360 - 180;
const money = (n) => '$' + Math.round(n).toLocaleString();
const mph = (u) => Math.round(u * 0.0568);
const lerp = (a, b, k) => a + (b - a) * k;
const MAP_COL = { [D.OCEAN]: '#1d4a66', [D.LAKE]: '#2a5a7a', [D.CITY]: '#6a6a6c', [D.SUBURB]: '#56664a', [D.TOWN]: '#5e6450', [D.BEACH]: '#c8b080', [D.FARM]: '#6e6a3a', [D.FOREST]: '#2e4e26', [D.DESERT]: '#b49a68', [D.FIELD]: '#4a6a36', [D.MOUNTAIN]: '#8a7a68', [D.AIRPORT]: '#7a7e74', [D.AIRBASE]: '#7a6e5a' };
const BLIP = { gas: '#ff5a3a', gun: '#ffd23a', hospital: '#ffffff', police: '#3a7aff' };
// draw distance in chunks: detailed, then simple shapes
const RANGE = { potato: [1, 3], low: [2, 5], medium: [2, 7], high: [3, 8] };
const FOG = { potato: 0.00009, low: 0.00006, medium: 0.000042, high: 0.000036 };
// full-detail distances: people (beyond: a simple figure), cars (beyond: a box), people sitting in cars
const DETAIL = { potato: [700, 700, 500], low: [1000, 1000, 700], medium: [1700, 1600, 1100], high: [2400, 2200, 1500] };
const TILE = 3; // far chunks are merged into tiles this many chunks across (one draw each)
// each cell is generated once and kept a while (collision, close detail and far shapes all come from it)
const CELLS = new Map();
function cell(i, j) {
  const k = i + ',' + j;
  let c = CELLS.get(k);
  if (c) { CELLS.delete(k); CELLS.set(k, c); return c; }
  c = genCell(i, j, true);
  CELLS.set(k, c);
  if (CELLS.size > 500) CELLS.delete(CELLS.keys().next().value);
  return c;
}

// ------------------------------------------------------------------ materials
const VARIANT = {
  facade: [['#b9b3a8', '#8a8478'], ['#d8d2c6', '#9a948a'], ['#8f969c', '#6a7076'], ['#c4b49a', '#9a8a70']],
  curtain: [['#5a6a7a', '#3e5a78'], ['#4a5866', '#2e4660'], ['#6a7276', '#527088'], ['#7a6a5a', '#4a5e70']],
  brickwin: [['#8e4a38'], ['#a0583e'], ['#6e3a30'], ['#9a6a4e']],
  stuccowin: [['#e0d2b8'], ['#d8b8a0'], ['#c8d4c8'], ['#e8dcc8']],
  neon: ['#ff4f8a', '#4fd6ff', '#ffd24f', '#7dff6a'],
};
const FLAT = {
  asphalt: '#3a3b3e', pave: '#a8a49c', grass: '#4e7a36', lawn: '#4f8a38', forest: '#3a5a2a', soil: '#6a5236', sand: '#d2bc88', rock: '#8a7a68',
  concrete: '#a19d96', facade: '#b0aa9e', curtain: '#4a5e70', brickwin: '#8e4a38', stuccowin: '#d8ccb4', siding: '#d8d0c0', siding2: '#9ab0c0', siding3: '#c8b890', siding4: '#a8c0a0',
  roof: '#5a4a44', roof2: '#4a4e58', barn: '#9a2a1e', silo: '#b8bcc0', clinic: '#e8e8e4', precinct: '#6e7a8e', bark: '#5a4030', cactus: '#4a7a3a', water: '#24404e',
};
function canvasMat(w, h, draw, emissive = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, emissiveMap: emissive ? t : null, emissive: emissive ? 0xffffff : 0, emissiveIntensity: emissive ? 1.1 : 0, roughness: 0.6 });
}
function signMat(text, bg, fg, sub) {
  return canvasMat(512, 128, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg; g.font = '900 72px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, sub ? h * 0.42 : h / 2);
    if (sub) { g.font = '700 26px Inter, system-ui, sans-serif'; g.fillText(sub, w / 2, h * 0.82); }
  });
}
const ADS = [['DRINK FIZZ', '#e23b3b'], ['NYX R · 0-60 IN 2.9', '#151515'], ['FILL & GO · OPEN 24/7', '#d82a2a'], ['MUGR ARMS', '#2a2a2a'], ['COUNTY GENERAL', '#2a6ad8'], ['VISIT SUNDOWN', '#e88a1e']];
let MATS = null;
function material(key) {
  MATS ||= new Map();
  if (MATS.has(key)) return MATS.get(key);
  const [name, v] = key.split('#');
  const vi = +v || 0;
  let m;
  const sm = (type, c, c2, bump) => surfaceMaterial(type, { color: c, color2: c2 || c, bump });
  switch (name) {
    case 'asphalt': m = sm('asphalt', '#3a3b3e', null, 1.2); break;
    case 'pave': m = sm('tile', '#b4b0a8', '#a29e96', 0.6); break;
    case 'grass': m = sm('grass', '#4e7a36', '#5a4a30'); break;
    case 'lawn': m = sm('grass', '#4f8a38', '#3f6a2c'); break;
    case 'forest': m = sm('leaves', '#3a5a2a', '#4a3a26'); break;
    case 'soil': m = sm('dirt', '#6a5236', '#4a3a26'); break;
    case 'dirt': m = sm('dirt', '#5a4430', '#3a2a1e'); break;
    case 'sand': m = sm('dirt', '#d8c290', '#c2a878', 0.8); break;
    case 'rock': m = sm('stone', '#8a7a68', '#6a5c4c', 2); break;
    case 'concrete': m = sm('concrete', '#a19d96'); break;
    case 'tile': m = sm('tile', '#d0ccc4', '#b0aca4'); break;
    case 'stone': m = sm('stone', '#b8b0a2', '#948c80'); break;
    case 'metal': m = sm('metal', '#7a8088'); break;
    case 'gunmetal': m = sm('metal', '#2a2c30'); break;
    case 'pump': m = sm('panel', '#d83a2a', '#e8e4dc'); break;
    case 'canopy': m = sm('panel', '#e8e4dc', '#d83a2a'); break;
    case 'shelf': m = sm('metal', '#c8c4bc'); break;
    case 'wood': m = sm('wood', '#8a6438', '#5e4126'); break;
    case 'fence': m = sm('wood', '#c8c0b0', '#9a9284'); break;
    case 'bark': m = sm('wood', '#5a4030', '#3a2a1e', 2); break;
    case 'cactus': m = sm('grass', '#4a7a3a', '#3a6a2e', 2); break;
    case 'barn': m = sm('wood', '#9a2a1e', '#661a12'); break;
    case 'silo': m = sm('metal', '#b8bcc0'); break;
    case 'roof': m = sm('brick', '#5a4a44', '#32282a'); break;
    case 'roof2': m = sm('brick', '#4a4e58', '#2a2e36'); break;
    case 'siding': m = sm('siding', '#d8d0c0'); break;
    case 'siding2': m = sm('siding', '#9ab0c0'); break;
    case 'siding3': m = sm('siding', '#c8b890'); break;
    case 'siding4': m = sm('siding', '#a8c0a0'); break;
    case 'clinic': m = sm('facade', '#e8e8e4', '#c8ccd0'); break;
    case 'precinct': m = sm('brickwin', '#6e7a8e'); break;
    case 'hangar': m = sm('panel', '#9aa0a6', '#7a8086'); break;
    case 'chain': m = new THREE.MeshStandardMaterial({ color: 0x9aa0a4, metalness: 0.7, roughness: 0.4, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }); break;
    case 'army': m = sm('metal', '#4a5636'); break;
    case 'facade': case 'curtain': case 'brickwin': case 'stuccowin': { const c = VARIANT[name][vi % 4]; m = sm(name, c[0], c[1] || c[0]); break; }
    case 'awning': m = sm('hazard', ['#c03a2a', '#2a6a3a', '#2a4a8a', '#c88a1a'][vi % 4]); break;
    case 'neon': m = neonMaterial(VARIANT.neon[vi % 4]); break;
    case 'neonred': m = neonMaterial('#ff3a2a'); break;
    case 'line': m = sm('concrete', '#e8e8e2', null, 0.2); break;
    case 'yline': m = sm('concrete', '#e8b81e', null, 0.2); break;
    case 'glass': m = new THREE.MeshStandardMaterial({ color: 0x9fc4d8, metalness: 0.9, roughness: 0.08, transparent: true, opacity: 0.45 }); break;
    case 'water': m = new THREE.MeshStandardMaterial({ color: 0x1f4a5e, metalness: 0.3, roughness: 0.06, transparent: true, opacity: 0.86 }); break;
    case 'corn': m = sm('grass', '#c8b058', '#8a7a34', 2.2); break;
    case 'wheat': m = sm('grass', '#d8c070', '#b09a48', 1.5); break;
    case 'gassign': m = signMat('FILL & GO', '#d82a2a', '#ffffff', 'FUEL · SNACKS · 24/7'); break;
    case 'gunsign': m = signMat('MUGR ARMS', '#1c1c1c', '#ffcf3a', 'GUNS · AMMO · ARMOUR'); break;
    case 'redcross': m = canvasMat(128, 128, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 128, 128); g.fillStyle = '#e02020'; g.fillRect(44, 12, 40, 104); g.fillRect(12, 44, 104, 40); }); break;
    case 'copsign': m = signMat('POLICE', '#1a3a8a', '#ffffff', 'MUGR COUNTY'); break;
    case 'billboard': { const a = ADS[vi % ADS.length]; m = signMat(a[0], a[1], '#ffffff'); break; }
    default: m = sm('concrete', '#a19d96');
  }
  MATS.set(key, m);
  return m;
}
const VARIED = new Set(['facade', 'curtain', 'brickwin', 'stuccowin', 'awning', 'neon', 'billboard']);
const matKey = (b) => (VARIED.has(b.mat) ? b.mat + '#' + ((hash(Math.floor(b.mins[0] / 97), Math.floor(b.mins[1] / 97), 3) * 4) | 0) : b.mat);

// a gable roof over a box
function prism(b) {
  const [x0, y0, z0] = b.mins, [x1, y1, z1] = b.maxs;
  const g = new THREE.BufferGeometry();
  let v;
  if (b.axis === 'x') {
    const ym = (y0 + y1) / 2;
    v = [[x0, y0, z0], [x1, y0, z0], [x1, ym, z1], [x0, ym, z1], [x0, y1, z0], [x1, y1, z0]];
  } else {
    const xm = (x0 + x1) / 2;
    v = [[x0, y0, z0], [x0, y1, z0], [xm, y1, z1], [xm, y0, z1], [x1, y0, z0], [x1, y1, z0]];
  }
  const faces = b.axis === 'x' ? [[0, 1, 2], [0, 2, 3], [5, 4, 3], [5, 3, 2], [0, 3, 4], [1, 5, 2]] : [[0, 3, 2], [0, 2, 1], [4, 5, 2], [4, 2, 3], [0, 4, 3], [1, 2, 5]];
  const pos = [], uv = [];
  for (const f of faces) for (const k of f) { pos.push(...v[k]); uv.push(0, 0); }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}
function boxGeo(b) {
  const g = new THREE.BoxGeometry(b.maxs[0] - b.mins[0], b.maxs[1] - b.mins[1], b.maxs[2] - b.mins[2]).toNonIndexed();
  g.translate((b.mins[0] + b.maxs[0]) / 2, (b.mins[1] + b.maxs[1]) / 2, (b.mins[2] + b.maxs[2]) / 2);
  return g;
}

// shared shapes for instanced trees, lamps and lights
let PARTS = null;
function parts() {
  if (PARTS) return PARTS;
  const P = isPotato();
  const lam = (c, o = {}) => (P ? new THREE.MeshLambertMaterial({ color: c, ...o }) : new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, ...o }));
  PARTS = {
    trunk: new THREE.CylinderGeometry(0.6, 1, 1, 6).rotateX(Math.PI / 2).translate(0, 0, 0.5),
    oak: leafy(),
    pine: pine(),
    palm: palmCrown(),
    barkM: lam(0x5a4030), leafM: lam(0xffffff, { vertexColors: true }), pineM: lam(0x2a4a2e, { vertexColors: true }), palmM: lam(0x5a8a32, { vertexColors: true }),
    pole: new THREE.CylinderGeometry(3, 4, 300, 6).rotateX(Math.PI / 2).translate(0, 0, 150),
    arm: new THREE.BoxGeometry(70, 4, 4).translate(-35, 0, 296),
    head: new THREE.BoxGeometry(24, 12, 5).translate(-66, 0, 292),
    poleM: lam(0x3a3e44, { metalness: 0.5 }), headM: new THREE.MeshStandardMaterial({ color: 0xfff6e0, emissive: 0xfff0d0, emissiveIntensity: 0.8 }),
    sigPole: new THREE.CylinderGeometry(3, 3, 230, 6).rotateX(Math.PI / 2).translate(0, 0, 115),
    sigBox: new THREE.BoxGeometry(10, 16, 46).translate(0, 0, 210),
    lamp: new THREE.SphereGeometry(5, 8, 6),
    red: new THREE.MeshBasicMaterial({ color: 0xff2a1a, toneMapped: false }), amber: new THREE.MeshBasicMaterial({ color: 0xffb81a, toneMapped: false }), green: new THREE.MeshBasicMaterial({ color: 0x2aff6a, toneMapped: false }),
    cash: new THREE.BoxGeometry(14, 8, 5), cashM: new THREE.MeshStandardMaterial({ color: 0x3f8a3a, emissive: 0x1f5a1a, emissiveIntensity: 0.8 }),
  };
  return PARTS;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler();
// tree shapes in a unit box (scaled per tree): lumpy, with shade toward the bottom and the inside (vertex colours)
function shade(geo, lo = 0.55) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, p = geo.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = lo + (1 - lo) * ((p.getZ(i) - b.min.z) / Math.max(1e-6, b.max.z - b.min.z)); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
function lumpy(geo, amt, seed) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const n = 1 + amt * Math.sin(x * 7.1 + seed) * Math.sin(y * 6.3 + seed * 2) * Math.sin(z * 5.7 + seed * 3); p.setXYZ(i, x * n, y * n, z * n); }
  geo.computeVertexNormals();
  return geo;
}
function leafy() {
  const blobs = [[0, 0, 0, 1], [0.45, 0.2, -0.15, 0.7], [-0.4, 0.3, -0.1, 0.68], [0.1, -0.45, -0.12, 0.7], [-0.15, 0, 0.45, 0.62]];
  const geos = blobs.map(([x, y, z, r], k) => lumpy(new THREE.IcosahedronGeometry(r, 2), 0.12, k).translate(x, y, z).toNonIndexed());
  geos.forEach((g) => g.deleteAttribute('uv'));
  return shade(mergeGeometries(geos), 0.45);
}
function pine() {
  const geos = [];
  for (let k = 0; k < 4; k++) { const g = new THREE.ConeGeometry(1 - k * 0.2, 0.42, 10).rotateX(Math.PI / 2).translate(0, 0, 0.2 + k * 0.22); lumpy(g, 0.06, k); geos.push(g.toNonIndexed()); }
  geos.forEach((g) => g.deleteAttribute('uv'));
  return shade(mergeGeometries(geos), 0.5);
}
function palmCrown() {
  const geos = [];
  for (let k = 0; k < 8; k++) {
    const leaf = new THREE.SphereGeometry(1, 8, 4).scale(0.9, 0.16, 0.05).translate(0.85, 0, -0.18);
    leaf.rotateY(0.35).rotateZ((k / 8) * Math.PI * 2);
    geos.push(leaf.toNonIndexed());
  }
  geos.forEach((g) => g.deleteAttribute('uv'));
  return shade(mergeGeometries(geos), 0.6);
}

// ------------------------------------------------------------------ the view
export class CityView {
  constructor(game) {
    this.g = game;
    this.on = false;
    this.root = null;
    this.chunks = new Map(); // "ci,cj" -> { near: Group|null, far: Mesh|null }
    this.cells = new Set(); // collision cells added to the world
    this.cars = new Map();
    this.peds = new Map();
    this.cash = new Map();
    this.state = { cash: 0, cars: [], guns: 0 };
    this.me = null;
    this.firstPerson = false;
    this.phone = null;
    this.shop = null;
    this.notes = [];
    this.missiles = new Map();
  }

  get active() { return this.on; }

  setup(fp) {
    this.clear();
    if (!fp) return;
    const g = this.g;
    this.on = true;
    this.root = new THREE.Group();
    g.scene.add(this.root);
    this.state = { cash: fp.cash, cars: fp.cars, guns: fp.guns };
    const q = g.settings.quality in RANGE ? g.settings.quality : 'medium';
    this.range = RANGE[q];
    this.fogD = FOG[q];
    this.detail = DETAIL[q];
    this.tiles = new Map();
    this.dirty = new Set();
    this.firstPerson = !!g.settings.driveFirst;
    this.backdrop();
    $('fp-hud').hidden = false;
    document.body.classList.add('fp-on');
    this.radarCtx = $('fp-radar').getContext('2d');
    this.hudKey = '';
  }

  clear() {
    if (!this.on) return;
    const g = this.g;
    for (const c of this.chunks.values()) this.dropChunk(c);
    this.chunks.clear();
    for (const t of this.tiles.values()) { this.root.remove(t); t.geometry.dispose(); }
    this.tiles.clear();
    if (this.farPeds) { this.root.remove(this.farPeds); this.farPeds = null; }
    this.cells.clear();
    for (const id of [...this.cars.keys()]) this.removeCar(id);
    for (const id of [...this.peds.keys()]) this.removePed(id);
    for (const c of this.cash.values()) this.root.remove(c.obj);
    this.cash.clear();
    for (const ms of this.missiles.values()) this.root.remove(ms.obj);
    this.missiles.clear();
    if (this.bigMap) this.toggleBigMap();
    g.scene.remove(this.root);
    this.root = null;
    this.on = false;
    this.closePhone();
    this.closeShop();
    this.audio(false);
    $('fp-hud').hidden = true;
    document.body.classList.remove('fp-on', 'fp-driving');
  }

  // ---------------------------------------------------------------- the world: collision near you, chunks to see
  // the far distance: the whole county as one painted plane, and the sea
  backdrop() {
    const n = N * 2;
    const data = new Uint8Array(n * n * 4);
    const col = { [D.OCEAN]: [31, 74, 94], [D.LAKE]: [31, 74, 94], [D.CITY]: [118, 116, 112], [D.SUBURB]: [96, 112, 78], [D.TOWN]: [104, 110, 86], [D.BEACH]: [210, 188, 136], [D.FARM]: [110, 106, 56], [D.FOREST]: [52, 82, 40], [D.DESERT]: [196, 168, 120], [D.FIELD]: [86, 118, 58], [D.MOUNTAIN]: [128, 114, 98], [D.AIRPORT]: [110, 120, 96], [D.AIRBASE]: [180, 160, 120] };
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) data.set([...col[district(i - N, j - N)], 255], (j * n + i) * 4);
    const tex = new THREE.DataTexture(data, n, n);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    const land = new THREE.Mesh(new THREE.PlaneGeometry(G * n, G * n), new THREE.MeshLambertMaterial({ map: tex }));
    land.position.z = -6;
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(G * n * 6, G * n * 6), new THREE.MeshStandardMaterial({ color: 0x1f4a5e, roughness: 0.08, metalness: 0.3 }));
    sea.position.z = -34;
    land.receiveShadow = false;
    this.root.add(land, sea);
  }

  // collision for prediction: the cells around you
  ensureCollision(x, y, r) {
    const w = this.g.world;
    const ci = cellOf(x), cj = cellOf(y);
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) {
      if (i < -N || j < -N || i >= N || j >= N) continue;
      const k = i + ',' + j;
      if (this.cells.has(k)) continue;
      this.cells.add(k);
      for (const b of cell(i, j).boxes) w.addBox(b);
    }
    // a long drive: start again with just what's near
    if (w.boxes.length > 60000) {
      this.g.world = new BoxWorld([], [], 512);
      this.cells.clear();
      this.ensureCollision(x, y, r);
    }
  }

  buildNear(ci, cj) {
    const byMat = new Map();
    const add = (key, geo) => { let l = byMat.get(key); if (!l) byMat.set(key, (l = [])); l.push(geo); };
    const trees = [], lamps = [], signals = [];
    for (let i = ci * CHUNK; i < (ci + 1) * CHUNK; i++) for (let j = cj * CHUNK; j < (cj + 1) * CHUNK; j++) {
      if (i < -N || j < -N || i >= N || j >= N) continue;
      const c = cell(i, j);
      for (const b of c.boxes) if (b.mat !== 'clip') add(matKey(b), boxGeo(b));
      for (const b of c.deco) add(matKey(b), boxGeo(b));
      for (const r of c.roofs) add(r.mat, prism(r));
      for (const y of c.cyls) {
        const geo = new THREE.CylinderGeometry(y.r, y.r, y.h, 16).rotateX(Math.PI / 2).toNonIndexed();
        geo.deleteAttribute('uv'); geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        geo.translate(y.x, y.y, y.z + y.h / 2);
        add(y.mat, geo);
        const cap = new THREE.SphereGeometry(y.r, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI / 2).toNonIndexed();
        cap.translate(y.x, y.y, y.z + y.h);
        add(y.cap, cap);
      }
      if (c.water) add('water', boxGeo({ mins: [c.water[0], c.water[1], c.water[4] - 1], maxs: [c.water[2], c.water[3], c.water[4]] }));
      trees.push(...c.trees);
      lamps.push(...c.lamps);
      signals.push(...c.signals);
    }
    const grp = new THREE.Group();
    const noShadow = new Set(['line', 'yline', 'water', 'glass', 'asphalt', 'pave', 'lawn', 'grass', 'sand', 'soil', 'forest', 'rock', 'tile']);
    for (const [key, list] of byMat) {
      const geo = mergeGeometries(list.map((g) => (g.index ? g.toNonIndexed() : g)));
      const mesh = new THREE.Mesh(geo, material(key));
      mesh.castShadow = !noShadow.has(key.split('#')[0]) || key === 'rock';
      mesh.receiveShadow = true;
      grp.add(mesh);
    }
    const P = parts();
    // trees: a trunk and a canopy each
    if (trees.length) {
      const trunk = new THREE.InstancedMesh(P.trunk, P.barkM, trees.length);
      const kinds = { oak: [], pine: [], palm: [], shrub: [], street: [] };
      trees.forEach((t, k) => {
        const th = t.kind === 'shrub' ? 0.01 : t.kind === 'pine' ? t.h * 0.35 : t.kind === 'palm' ? t.h : t.h * 0.5;
        _m.compose(_p.set(t.x, t.y, t.z), _q.identity(), _s.set(t.kind === 'palm' ? 7 : 10, t.kind === 'palm' ? 7 : 10, th));
        trunk.setMatrixAt(k, _m);
        kinds[t.kind]?.push(t);
      });
      trunk.castShadow = true;
      grp.add(trunk);
      const leaf = (list, geo, mat, place, tint) => {
        if (!list.length) return;
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((t, k) => { place(t); im.setMatrixAt(k, _m); if (tint) im.setColorAt(k, tint(t)); });
        im.castShadow = true;
        grp.add(im);
      };
      const green = (t) => _c.setHSL(0.24 + hash(t.x | 0, t.y | 0, 4) * 0.1, 0.45, 0.24 + hash(t.y | 0, t.x | 0, 5) * 0.1);
      leaf([...kinds.oak, ...kinds.street, ...kinds.shrub], P.oak, P.leafM, (t) => _m.compose(_p.set(t.x, t.y, t.z + (t.kind === 'shrub' ? t.h * 0.4 : t.h * 0.62)), _q.identity(), _s.set(t.r, t.r, t.kind === 'shrub' ? t.h * 0.6 : t.h * 0.42)), green);
      leaf(kinds.pine, P.pine, P.pineM, (t) => _m.compose(_p.set(t.x, t.y, t.z + t.h * 0.18), _q.identity(), _s.set(t.r, t.r, t.h * 0.85)));
      leaf(kinds.palm, P.palm, P.palmM, (t) => _m.compose(_p.set(t.x, t.y, t.z + t.h), _q.identity(), _s.set(t.r, t.r, t.r)));
    }
    // street lamps
    if (lamps.length) {
      for (const [geo, mat] of [[P.pole, P.poleM], [P.arm, P.poleM], [P.head, P.headM]]) {
        const im = new THREE.InstancedMesh(geo, mat, lamps.length);
        lamps.forEach((l, k) => { _q.setFromAxisAngle(_s.set(0, 0, 1), (l.yaw + 180) * DEG); _m.compose(_p.set(l.x, l.y, l.z), _q, _s.set(1, 1, 1)); im.setMatrixAt(k, _m); });
        im.castShadow = mat === P.poleM;
        grp.add(im);
      }
    }
    // traffic lights: a pole on the far right of every approach, lamps lit from the shared clock
    let lights = null;
    if (signals.length) {
      const heads = [];
      for (const s of signals) for (const d of exits(s.i, s.j)) {
        const into = (d + 2) % 4; // traffic arriving from that road moves this way
        const x = s.x + DIRS[into][0] * (RW + 30) + RIGHT[into][0] * (RW + 30), y = s.y + DIRS[into][1] * (RW + 30) + RIGHT[into][1] * (RW + 30);
        heads.push({ i: s.i, j: s.j, axis: into % 2 ? 'ns' : 'ew', x, y, face: (into * 90 + 180) % 360 });
      }
      const poles = new THREE.InstancedMesh(P.sigPole, P.poleM, heads.length), boxes = new THREE.InstancedMesh(P.sigBox, P.poleM, heads.length);
      heads.forEach((h, k) => { _q.setFromAxisAngle(_s.set(0, 0, 1), h.face * DEG); _m.compose(_p.set(h.x, h.y, KERB), _q, _s.set(1, 1, 1)); poles.setMatrixAt(k, _m); boxes.setMatrixAt(k, _m); });
      grp.add(poles, boxes);
      lights = { heads, lamps: [P.red, P.amber, P.green].map((m) => { const im = new THREE.InstancedMesh(P.lamp, m, heads.length); grp.add(im); return im; }), at: -1 };
    }
    return { grp, lights };
  }

  // far away: buildings and ground as flat colours, one mesh per chunk
  buildFar(ci, cj) {
    const geos = [];
    const col = (hex, geo) => { _c.set(hex); const n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let k = 0; k < n; k++) { a[k * 3] = _c.r; a[k * 3 + 1] = _c.g; a[k * 3 + 2] = _c.b; } geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); geo.deleteAttribute('uv'); geo.deleteAttribute('normal'); return geo; };
    for (let i = ci * CHUNK; i < (ci + 1) * CHUNK; i++) for (let j = cj * CHUNK; j < (cj + 1) * CHUNK; j++) {
      if (i < -N || j < -N || i >= N || j >= N) continue;
      const c = cell(i, j);
      const dd = district(i, j);
      if (!isWater(dd)) geos.push(col(FLAT[c.ground] || '#4e7a36', boxGeo({ mins: [i * G, j * G, -2], maxs: [(i + 1) * G, (j + 1) * G, 0] })));
      for (const b of c.boxes) if (b.maxs[2] > 180 && b.maxs[2] - b.mins[2] > 120) geos.push(col(FLAT[b.mat] || '#a19d96', boxGeo(b)));
    }
    if (!geos.length) return null;
    const geo = mergeGeometries(geos);
    geo.computeVertexNormals();
    return geo;
  }

  // the far chunks of one tile merged into a single mesh (left out: chunks drawn in detail)
  buildTile(key) {
    const old = this.tiles.get(key);
    if (old) { this.root.remove(old); old.geometry.dispose(); this.tiles.delete(key); }
    const [ta, tb] = key.split(',').map(Number);
    const geos = [];
    for (let a = ta * TILE; a < (ta + 1) * TILE; a++) for (let b = tb * TILE; b < (tb + 1) * TILE; b++) {
      const c = this.chunks.get(a + ',' + b);
      if (c && c.farGeo && !c.near) geos.push(c.farGeo);
    }
    if (!geos.length) return;
    const mesh = new THREE.Mesh(mergeGeometries(geos), FAR_MAT || (FAR_MAT = new THREE.MeshLambertMaterial({ vertexColors: true })));
    this.root.add(mesh);
    this.tiles.set(key, mesh);
  }
  tileOf(a, b) { return Math.floor(a / TILE) + ',' + Math.floor(b / TILE); }

  dropNear(c) {
    if (!c.near) return;
    this.root?.remove(c.near.grp);
    c.near.grp.traverse((x) => x.geometry && !Object.values(PARTS || {}).includes(x.geometry) && x.geometry.dispose());
    c.near = null;
  }
  dropChunk(c) {
    this.dropNear(c);
    c.farGeo?.dispose();
    c.farGeo = undefined;
  }

  stream(eye, budgetMs = 6) {
    const [nearR, farR] = this.range;
    const ci = Math.floor(eye[0] / CW), cj = Math.floor(eye[1] / CW);
    // drop what's out of range
    for (const [k, c] of this.chunks) {
      const [a, b] = k.split(',').map(Number);
      const d = Math.max(Math.abs(a - ci), Math.abs(b - cj));
      if (d > farR + 1) { this.dropChunk(c); this.chunks.delete(k); this.dirty.add(this.tileOf(a, b)); }
      else if (d > nearR + 1 && c.near) { this.dropNear(c); this.dirty.add(this.tileOf(a, b)); }
    }
    // build the nearest missing ones first, a few each frame
    const t0 = performance.now();
    for (let r = 0; r <= farR; r++) {
      for (let a = ci - r; a <= ci + r; a++) for (let b = cj - r; b <= cj + r; b++) {
        if (Math.max(Math.abs(a - ci), Math.abs(b - cj)) !== r) continue;
        if (a * CHUNK >= N || b * CHUNK >= N || (a + 1) * CHUNK <= -N || (b + 1) * CHUNK <= -N) continue;
        const k = a + ',' + b;
        let c = this.chunks.get(k);
        if (!c) this.chunks.set(k, (c = { near: null, farGeo: undefined }));
        if (r <= nearR && !c.near) {
          c.near = this.buildNear(a, b);
          this.root.add(c.near.grp);
          // take it out of its far tile straight away so it isn't drawn twice
          if (c.farGeo) this.buildTile(this.tileOf(a, b));
        } else if (r > nearR && c.farGeo === undefined) {
          c.farGeo = this.buildFar(a, b);
          this.dirty.add(this.tileOf(a, b));
        } else continue;
        if (performance.now() - t0 > budgetMs) break;
      }
      if (performance.now() - t0 > budgetMs) break;
    }
    // rebuild a couple of changed tiles each frame
    let n = 0;
    for (const key of this.dirty) { this.dirty.delete(key); this.buildTile(key); if (++n >= 2) break; }
  }

  // traffic lights from the shared clock
  updateLights(t) {
    for (const c of this.chunks.values()) {
      const L = c.near?.lights;
      if (!L || t - L.at < 0.2) continue;
      L.at = t;
      L.heads.forEach((h, k) => {
        const st = signal(h.i, h.j, h.axis, this.g.serverTime + (performance.now() / 1000 - this.g.serverRecv));
        [0, 1, 2].forEach((lamp) => {
          const lit = (st === 2 && lamp === 0) || (st === 1 && lamp === 1) || (st === 0 && lamp === 2);
          const dx = Math.cos(h.face * DEG) * 6, dy = Math.sin(h.face * DEG) * 6;
          _m.compose(_p.set(h.x + dx, h.y + dy, KERB + [224, 210, 196][lamp]), _q.identity(), _s.setScalar(lit ? 1 : 0.0001));
          L.lamps[lamp].setMatrixAt(k, _m);
        });
      });
      for (const im of L.lamps) im.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- network
  message(m) {
    if (m.k === 'state') { this.state = { cash: m.cash, cars: m.cars, guns: m.guns }; if (this.phone) this.renderPhone(); if (this.shop) this.renderShop(); }
    else if (m.k === 'note') this.note(m.text);
    else if (m.k === 'shop') this.openShop(m);
  }

  snapshot(m) {
    if (!this.on) return;
    this.me = m.fp || this.me;
    if (m.fv) {
      const seen = new Set();
      for (const r of m.fv) {
        seen.add(r[0]);
        let c = this.cars.get(r[0]);
        if (!c) {
          c = { id: r[0], k: r[1], snaps: [], model: new CarModel(r[1], r[10]), paint: r[10] };
          this.root.add(c.model.root);
          this.cars.set(r[0], c);
        }
        c.snaps.push({ t: m.st, o: [r[2], r[3], r[4]], yaw: r[5], v: [r[6], r[7], r[14] || 0], steer: r[8] / 100, flags: r[9], pitch: (r[12] || 0) / 10, roll: (r[13] || 0) / 10, thr: (r[15] || 0) / 100 });
        while (c.snaps.length > 12) c.snaps.shift();
        c.occ = [0, 1, 2, 3].map((s) => { const l = (r[11] >> (s * 6)) & 63; return l === 63 ? -1 : l; });
        c.flags = r[9];
      }
      for (const id of [...this.cars.keys()]) if (!seen.has(id)) this.removeCar(id);
      this.mineFar = m.fmv || null;
    }
    if (m.fn) {
      const seen = new Set();
      for (const r of m.fn) {
        seen.add(r[0]);
        let n = this.peds.get(r[0]);
        if (!n) {
          n = { id: r[0], snaps: [], obj: null, look: r[8], kind: r[5] & 3, pos: [r[1], r[2], r[3] + 36] };
          this.peds.set(r[0], n);
        }
        n.flags = r[5];
        n.snaps.push({ t: m.st, o: [r[1], r[2], r[3]], yaw: r[4], v: [r[6], r[7]] });
        while (n.snaps.length > 12) n.snaps.shift();
      }
      for (const id of [...this.peds.keys()]) if (!seen.has(id)) this.removePed(id);
    }
    // missiles in the air
    if (m.fx) {
      const seen = new Set();
      for (const [id, x, y, z, vx, vy, vz] of m.fx) {
        seen.add(id);
        let ms = this.missiles.get(id);
        if (!ms) {
          const obj = new THREE.Group();
          const body = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 60, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, metalness: 0.4, roughness: 0.4 }));
          const fire = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xffb050, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
          fire.scale.setScalar(50); fire.position.x = -40;
          obj.add(body, fire);
          this.root.add(obj);
          this.missiles.set(id, (ms = { obj, o: [x, y, z], v: [vx, vy, vz], at: performance.now() / 1000 }));
          this.g.sound.launch('rocket', [x, y, z]);
        }
        ms.o = [x, y, z]; ms.v = [vx, vy, vz]; ms.at = performance.now() / 1000;
      }
      for (const [id, ms] of this.missiles) if (!seen.has(id)) { this.root.remove(ms.obj); this.missiles.delete(id); }
    }
    if (m.fm) {
      const seen = new Set();
      const P = parts();
      for (const [id, x, y, z] of m.fm) {
        seen.add(id);
        if (this.cash.has(id)) continue;
        const obj = new THREE.Group();
        for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(P.cash, P.cashM); b.position.set((k - 1) * 4, (k % 2) * 3, k * 5); b.rotation.z = k * 0.4; obj.add(b); }
        obj.position.set(x, y, z + 6);
        this.root.add(obj);
        this.cash.set(id, { obj });
      }
      for (const [id, c] of this.cash) if (!seen.has(id)) { this.root.remove(c.obj); this.cash.delete(id); }
    }
  }

  makePed(n) {
    n.making = true;
    this.g.makeCharacter(n.look >> 2, n.kind === 1 ? WEAPON_SLOT.pistol : null, n.look & 3).then((c) => {
      n.making = false;
      if (!this.peds.has(n.id) || !this.root) { c.dispose(); return; }
      n.obj = c;
      this.root.add(c.root);
    });
  }

  removeCar(id) {
    const c = this.cars.get(id);
    if (!c) return;
    for (const r of c.riders?.values() || []) r.obj?.dispose();
    this.root?.remove(c.model.root);
    c.model.dispose();
    this.cars.delete(id);
  }
  removePed(id) {
    const n = this.peds.get(id);
    if (!n) return;
    if (n.obj) { this.root?.remove(n.obj.root); n.obj.dispose(); }
    this.peds.delete(id);
  }

  event(ev) {
    const g = this.g, me = g.myId;
    switch (ev.e) {
      case 'shot': if (ev.id < 0) this.peds.get(ev.id)?.obj?.fire(); return false;
      case 'pdie': {
        const n = this.peds.get(ev.id);
        g.spawnRagdoll(ev.id, ev.o, ev.y, ev.vv || [0, 0, 0], false, ev.look >> 2, ev.look & 3);
        g.sound.death(ev.o);
        this.removePed(ev.id);
        if (ev.k === me) g.sound.hitTick();
        return true;
      }
      case 'vboom': g.explosion(ev.o); g.shake = Math.max(g.shake || 0, 10); return true;
      case 'vhit': g.sound.impact(ev.o); if (ev.k > 3) g.sound.play('debris', ev.o, 0.5); return true;
      case 'venter': case 'vexit': if (ev.id === me) { g.sound.ui(ev.e === 'venter' ? 700 : 500); this.lookAt = 0; } return true;
      case 'cash': g.sound.pickup('ammo'); this.toast(`+${money(ev.n)}`); return true;
      case 'robbed': this.note(`You got ${money(ev.n)} from the till. The police are on their way!`); return true;
      case 'wanted': if (ev.w === 0 && !ev.jamal) this.note('You lost the police.'); else if (ev.w) g.sound.ui(300); return true;
      case 'lock': this.lockAt = performance.now() / 1000; return true;
      case 'flare': this.flares(ev.o); return true;
      case 'kill': if (ev.v === me) this.wasted(); return false;
      case 'bought': g.sound.pickup('weapon'); return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- your car
  myCar() {
    const ps = this.g.ps;
    if (ps.car) return { state: ps.car, k: ps.car.k, id: ps.car.id, seat: 0, own: true };
    if (ps.seat) { const c = this.cars.get(ps.seat.v); if (c && c.pose) return { state: c.pose, k: c.k, id: c.id, seat: ps.seat.s }; }
    return null;
  }
  // drivers can't shoot; passengers can
  unarmed() { return this.on && !!this.g.ps.car; }

  // before predicting: other cars as solid boxes, and the ground under you
  beforePredict() {
    if (!this.on) return;
    const g = this.g, ps = g.ps;
    this.ensureCollision(ps.origin[0], ps.origin[1], 2);
    const dyn = [];
    for (const c of this.cars.values()) if (c.pose && c.id !== ps.car?.id) for (const b of carBoxes(c.pose, c.id)) dyn.push(b);
    g.world.dyn = dyn;
  }

  // the camera when you're in a car: first person from the seat, or a chase camera behind
  camera(dt) {
    const car = this.myCar();
    if (!car || !this.g.ps.alive) { this.camCar = null; return null; }
    const g = this.g, s = car.state, V = VEHICLES[car.k];
    if (V.air) return this.flyCamera(dt, car);
    const yawCar = s.yaw;
    // the view turns with the car; when you leave the mouse alone it settles back to looking ahead
    if (this.camCar !== car.id) { this.camCar = car.id; this.lastCarYaw = yawCar; this.setYaw = g.yaw = yawCar; this.mouseAt = 0; this.chase = null; }
    if (g.yaw !== this.setYaw) this.mouseAt = performance.now() / 1000;
    g.yaw += angDiff(this.lastCarYaw, yawCar);
    this.lastCarYaw = yawCar;
    const idle = performance.now() / 1000 - this.mouseAt > 1.4;
    if (idle) { g.yaw += angDiff(g.yaw, yawCar) * Math.min(1, dt * 3); g.pitch += ((this.firstPerson ? 4 : 10) - g.pitch) * Math.min(1, dt * 3); }
    const off = angDiff(yawCar, g.yaw);
    if (this.firstPerson && Math.abs(off) > 150) g.yaw = yawCar + Math.sign(off) * 150;
    this.setYaw = g.yaw;
    const err = car.own ? g.smoothErr : [0, 0, 0];
    if (this.firstPerson) {
      const local = car.seat === 0 ? V.eye : [V.seat[car.seat][0] - 2, V.seat[car.seat][1], V.eye[2]];
      const e = seatPos(s, local);
      return { eye: [e[0] + err[0], e[1] + err[1], e[2] + err[2]], yaw: g.yaw, pitch: g.pitch };
    }
    // chase camera: behind and above, pulled in so it never goes through walls
    const target = [s.o[0] + err[0], s.o[1] + err[1], s.o[2] + V.h + 22];
    const dist = V.bike ? 190 : 230 + V.hx * 1.2;
    const f = viewDir(g.yaw, Math.max(-10, g.pitch));
    const want = [target[0] - f[0] * dist, target[1] - f[1] * dist, target[2] - f[2] * dist + 30];
    g.world.skip = car.id;
    const tr = g.world.trace(target, want, [-8, -8, -8], [8, 8, 8]);
    g.world.skip = 0;
    const k = Math.max(0.15, tr.fraction - 0.03);
    this.chase = this.chase === null || this.chase === undefined ? k : Math.min(k, this.chase + dt * 1.5);
    const eye = [target[0] + (want[0] - target[0]) * this.chase, target[1] + (want[1] - target[1]) * this.chase, target[2] + (want[2] - target[2]) * this.chase];
    const d = [target[0] - eye[0], target[1] - eye[1], target[2] - 14 - eye[2]];
    return { eye, yaw: Math.atan2(d[1], d[0]) / DEG, pitch: -Math.atan2(d[2], Math.hypot(d[0], d[1])) / DEG };
  }

  // aircraft: the mouse is where you want to go (the plane turns to follow); the camera sits behind, or in the cockpit
  flyCamera(dt, car) {
    const g = this.g, s = car.state, V = VEHICLES[car.k];
    if (this.camCar !== car.id) { this.camCar = car.id; g.yaw = s.yaw; g.pitch = -(s.pitch || 0); this.chase = null; }
    const err = car.own ? g.smoothErr : [0, 0, 0];
    if (this.firstPerson) {
      const e = seatPos(s, V.eye);
      return { eye: [e[0] + err[0], e[1] + err[1], e[2] + err[2]], yaw: g.yaw, pitch: g.pitch, roll: s.roll || 0 };
    }
    const target = [s.o[0] + err[0], s.o[1] + err[1], s.o[2] + 60];
    const dist = 420 + V.hx * 1.6;
    const f = viewDir(g.yaw, g.pitch);
    const want = [target[0] - f[0] * dist, target[1] - f[1] * dist, target[2] - f[2] * dist + 60];
    g.world.skip = car.id;
    const tr = g.world.trace(target, want, [-8, -8, -8], [8, 8, 8]);
    g.world.skip = 0;
    const k = Math.max(0.15, tr.fraction - 0.03);
    this.chase = this.chase === null || this.chase === undefined ? k : Math.min(k, this.chase + dt * 1.5);
    const eye = [target[0] + (want[0] - target[0]) * this.chase, target[1] + (want[1] - target[1]) * this.chase, target[2] + (want[2] - target[2]) * this.chase];
    return { eye, yaw: g.yaw, pitch: g.pitch };
  }

  toggleView() {
    this.firstPerson = !this.firstPerson;
    this.g.settings.driveFirst = this.firstPerson;
    return this.firstPerson;
  }

  // ---------------------------------------------------------------- every frame
  update(dt, t, eye) {
    if (!this.on) return;
    const g = this.g, ps = g.ps;
    if (g.scene.fog?.density !== undefined && Math.abs(g.scene.fog.density - this.fogD) > 1e-9) g.scene.fog.density = this.fogD;
    this.stream(eye);
    this.updateLights(t);
    const rt = g.renderTime;
    const [pedNear, carNear, occNear] = this.detail;
    const mine = ps.car ? ps.car.id : -1;
    const ride = this.myCar();
    // cars: interpolated, except the one you drive (predicted)
    for (const c of this.cars.values()) {
      let o, yaw, steer, v;
      if (c.id === mine) {
        const s = ps.car;
        o = [s.o[0] + g.smoothErr[0], s.o[1] + g.smoothErr[1], s.o[2] + g.smoothErr[2]];
        yaw = s.yaw; steer = s.steer; v = s.v;
        c.att = [s.pitch || 0, s.roll || 0, s.thr || 0];
      } else {
        const S = c.snaps;
        if (!S.length) continue;
        let a = S[0], b = S[0];
        for (let i = 0; i < S.length; i++) { if (S[i].t <= rt) a = S[i]; b = S[i]; if (S[i].t >= rt) break; }
        const f = b.t > a.t ? Math.max(0, Math.min(1.5, (rt - a.t) / (b.t - a.t))) : 0;
        o = [lerp(a.o[0], b.o[0], f), lerp(a.o[1], b.o[1], f), lerp(a.o[2], b.o[2], f)];
        yaw = a.yaw + angDiff(a.yaw, b.yaw) * f; steer = lerp(a.steer, b.steer, f); v = b.v;
        c.att = [lerp(a.pitch || 0, b.pitch || 0, f), lerp(a.roll || 0, b.roll || 0, f), b.thr || 0];
      }
      c.pose = { k: c.k, o, yaw, v: [v[0], v[1], v[2] || 0], steer, pitch: c.att[0], roll: c.att[1], thr: c.att[2] };
      const speed = Math.hypot(v[0], v[1]) * Math.sign(v[0] * Math.cos(yaw * DEG) + v[1] * Math.sin(yaw * DEG) || 1);
      const d = Math.hypot(o[0] - eye[0], o[1] - eye[1]);
      const inside = ride && ride.id === c.id && this.firstPerson;
      const close = d < occNear * 0.7;
      c.model.setOccupants(!close && d < occNear ? c.occ || [] : [], inside ? ride.seat : -1);
      this.riders(c, close ? c.occ || [] : [], inside ? ride.seat : -1, dt);
      c.model.update(dt, t, { thr: c.att[2], lod: d > (VEHICLES[c.k].air ? carNear * 3 : carNear) && !inside, dist: d, speed, steer, brake: !!(c.flags & 2), siren: !!(c.flags & 1), wreck: !!(c.flags & 16) });
      if (VEHICLES[c.k].air) {
        _e.set(c.att[1] * DEG, -c.att[0] * DEG, yaw * DEG, 'ZYX');
        c.model.root.matrix.makeRotationFromEuler(_e).setPosition(o[0], o[1], o[2]);
      } else c.model.root.matrix.makeRotationZ(yaw * DEG).setPosition(o[0], o[1], o[2]);
      c.model.root.matrixWorldNeedsUpdate = true;
      c.model.root.visible = d < (VEHICLES[c.k].air ? 40000 : 12000);
      // smoke and flames from wrecks and badly damaged cars
      if ((c.flags & 40) && d < 4000 && Math.random() < dt * (c.flags & 8 ? 14 : 5)) this.puff(o, VEHICLES[c.k], yaw, !!(c.flags & 8));
      // horns
      if (c.flags & 4 && c.id !== mine && t - (c.hornAt || 0) > 0.45 && d < 3000) { c.hornAt = t; this.horn([o[0], o[1], o[2] + 30], 0.5); }
    }
    this.hands(ride);
    // people: full characters up close, one batch of simple figures further out
    if (!this.farPeds) {
      const geo = mergeGeometries([new THREE.CapsuleGeometry(9, 44, 2, 6).rotateX(Math.PI / 2).translate(0, 0, 34), new THREE.SphereGeometry(7, 8, 6).translate(0, 0, 66)].map((x) => x.toNonIndexed()));
      this.farPeds = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), 96);
      this.farPeds.count = 0;
      this.farPeds.frustumCulled = false;
      this.root.add(this.farPeds);
    }
    let far = 0;
    for (const n of this.peds.values()) {
      const S = n.snaps;
      if (!S.length) continue;
      let a = S[0], b = S[0];
      for (let i = 0; i < S.length; i++) { if (S[i].t <= rt) a = S[i]; b = S[i]; if (S[i].t >= rt) break; }
      const f = b.t > a.t ? Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))) : 1;
      const o = [lerp(a.o[0], b.o[0], f), lerp(a.o[1], b.o[1], f), lerp(a.o[2], b.o[2], f)];
      const yaw = a.yaw + angDiff(a.yaw, b.yaw) * f, yr = yaw * DEG, v = b.v;
      n.pos = [o[0], o[1], o[2] + 36];
      const d = Math.hypot(o[0] - eye[0], o[1] - eye[1]);
      // characters are made when people come close and dropped when they're well away
      if (d < pedNear * 1.15 && !n.obj && !n.making) this.makePed(n);
      else if (d > pedNear * 1.8 && n.obj) { this.root.remove(n.obj.root); n.obj.dispose(); n.obj = null; }
      if (d > pedNear || !n.obj) {
        if (n.obj) n.obj.root.visible = false;
        if (d < 4500 && far < 96) {
          const suit = SUIT_COLORS[(n.look >> 2) % SUIT_COLORS.length];
          _m.compose(_p.set(o[0], o[1], o[2]), _q.identity(), _s.set(1, 1, 1));
          this.farPeds.setMatrixAt(far, _m);
          this.farPeds.setColorAt(far, n.kind === 1 ? _c.set(0x2a4aa8) : _c.setRGB(...suit.rgb));
          far++;
        }
        continue;
      }
      n.obj.root.visible = true;
      n.obj.animate(dt, { speed: Math.hypot(v[0], v[1]), fwdSpeed: v[0] * Math.cos(yr) + v[1] * Math.sin(yr), sideSpeed: v[0] * Math.sin(yr) - v[1] * Math.cos(yr), ground: true, ducked: !!(n.flags & 32), pitch: n.flags & 4 ? -60 : 0, alive: true });
      n.obj.root.matrix.makeRotationZ(yr).setPosition(o[0], o[1], o[2]);
      n.obj.root.matrixWorldNeedsUpdate = true;
    }
    this.farPeds.count = far;
    this.farPeds.instanceMatrix.needsUpdate = true;
    if (this.farPeds.instanceColor) this.farPeds.instanceColor.needsUpdate = true;
    for (const c of this.cash.values()) c.obj.rotation.z = t * 2;
    const nowS = performance.now() / 1000;
    for (const ms of this.missiles.values()) {
      const k = nowS - ms.at;
      ms.obj.position.set(ms.o[0] + ms.v[0] * k, ms.o[1] + ms.v[1] * k, ms.o[2] + ms.v[2] * k);
      ms.obj.rotation.set(0, -Math.atan2(ms.v[2], Math.hypot(ms.v[0], ms.v[1])), Math.atan2(ms.v[1], ms.v[0]), 'ZYX');
      if (Math.random() < dt * 30) this.puff([ms.obj.position.x, ms.obj.position.y, ms.obj.position.z - 20], { hx: 0, h: 0 }, 0, false);
    }
    const locked = (this.me?.[8] || 0) || nowS - (this.lockAt || 0) < 1;
    if (locked && nowS - (this.beepAt || 0) > 0.25) { this.beepAt = nowS; g.sound.ui(1800); }
    $('fp-lock').hidden = !locked;
    if (this.bigMap && t - (this.bigMapAt || 0) > 0.25) { this.bigMapAt = t; this.drawBigMap(); }
    this.audio(!!ps.car && ps.alive);
    this.updateHud(t);
    if ((t - (this.radarAt || 0)) > 0.08) { this.radarAt = t; this.drawRadar(eye); }
  }

  // the people in a car, as real characters sitting in their seats
  riders(c, occ, skip, dt) {
    c.riders ||= new Map();
    const V = VEHICLES[c.k];
    for (let s = 0; s < V.seat.length; s++) {
      const look = s === skip ? -1 : occ[s] ?? -1;
      let r = c.riders.get(s);
      if (r && r.look !== look) { if (r.obj) { c.model.body3.remove(r.obj.root); r.obj.dispose(); } c.riders.delete(s); r = null; }
      if (look < 0) continue;
      if (!r) {
        r = { look, obj: null };
        c.riders.set(s, r);
        this.g.makeCharacter(look >> 2, null, look & 3).then((ch) => {
          if (c.riders.get(s) !== r || !this.cars.has(c.id)) { ch.dispose(); return; }
          r.obj = ch;
          const [x, y, z] = V.seat[s];
          ch.root.matrix.makeTranslation(x, y, z - (V.bike ? -2 : 4));
          ch.root.matrixWorldNeedsUpdate = true;
          c.model.body3.add(ch.root);
        });
      }
      if (r.obj) r.obj.animate(dt, { sit: { wheel: s === 0, steer: c.pose?.steer || 0, bike: !!V.bike } });
    }
    for (const [s, r] of c.riders) if (s >= V.seat.length) c.riders.delete(s);
  }

  // a puff of smoke (or fire) from the bonnet
  puff(o, V, yaw, fire) {
    const g = this.g;
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ color: fire ? 0xff8a2a : 0x333333, transparent: true, opacity: fire ? 0.9 : 0.55, depthWrite: false, blending: fire ? THREE.AdditiveBlending : THREE.NormalBlending }));
    const fx = Math.cos(yaw * DEG), fy = Math.sin(yaw * DEG);
    m.position.set(o[0] + fx * V.hx * 0.6 + (Math.random() - 0.5) * 20, o[1] + fy * V.hx * 0.6 + (Math.random() - 0.5) * 20, o[2] + V.h * 0.7);
    m.scale.setScalar(fire ? 30 : 40);
    g.addEffect(m, fire ? 0.6 : 1.6, (e, k) => { m.position.z += (fire ? 60 : 45) * (1 / 60); m.scale.setScalar((fire ? 30 : 40) * (1 + k * 2)); m.material.opacity = (fire ? 0.9 : 0.55) * (1 - k); });
  }

  flares(o) {
    for (let k = 0; k < 8; k++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xfff0c0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.position.set(o[0], o[1], o[2]);
      const v = [(Math.random() - 0.5) * 600, (Math.random() - 0.5) * 600, -100 - Math.random() * 300];
      s.scale.setScalar(40);
      this.g.addEffect(s, 2.2, (e, kk, dt) => { s.position.x += v[0] * dt; s.position.y += v[1] * dt; s.position.z += v[2] * dt; v[2] -= 300 * dt; s.material.opacity = 1 - kk; });
    }
    this.g.sound.ui(500);
  }
  // WASTED, like the old days
  wasted() {
    const el = $('fp-wasted');
    el.hidden = false;
    document.body.classList.add('fp-dead');
    clearTimeout(this.wastedT);
    this.wastedT = setTimeout(() => { el.hidden = true; document.body.classList.remove('fp-dead'); }, 4500);
  }

  // your hands on the wheel in first person
  hands(ride) {
    const show = ride && ride.seat === 0 && this.firstPerson;
    const c = show ? this.cars.get(ride.id) : null;
    if (this.handCar && this.handCar !== c) { this.handCar.model.body3.remove(this.handGrp); this.handCar = null; }
    if (!c) return;
    if (!this.handGrp) {
      const info = this.g.info.get(this.g.myId);
      const suit = SUIT_COLORS[(info?.color | 0) % SUIT_COLORS.length];
      const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(...suit.rgb), roughness: 0.8 });
      const glove = new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.6 });
      this.handGrp = new THREE.Group();
      for (const s of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(30, 5, 5), cloth);
        const hand = new THREE.Mesh(new THREE.BoxGeometry(6, 5, 7), glove);
        arm.userData.side = s; hand.userData.side = s;
        this.handGrp.add(arm, hand);
      }
    }
    if (this.handCar !== c) { c.model.body3.add(this.handGrp); this.handCar = c; }
    const w = wheelInfo(c.k), V = VEHICLES[c.k];
    if (!w) return;
    const st = c.pose.steer * 2.4 * (w.bike ? 0 : 1);
    let k = 0;
    for (const s of [-1, 1]) {
      // the hand on the rim (turning with the wheel), the forearm back toward the shoulder
      const a = (s > 0 ? 0.25 : -0.25) * Math.PI + st;
      const hx = w.x, hy = w.y + (w.bike ? s * 12 : Math.cos(a) * w.r * s), hz = w.z + (w.bike ? 0 : Math.sin(Math.abs(a)) * w.r * 0.4);
      const sx = V.seat[0][0] - 12, sy = V.seat[0][1] + s * 10, sz = V.eye[2] - 18;
      const arm = this.handGrp.children[k++], hand = this.handGrp.children[k++];
      hand.position.set(hx, hy, hz);
      arm.position.set((hx + sx) / 2, (hy + sy) / 2, (hz + sz) / 2);
      arm.rotation.set(0, Math.atan2(sz - hz, hx - sx), Math.atan2(hy - sy, hx - sx));
      arm.scale.x = Math.hypot(hx - sx, hy - sy, hz - sz) / 30;
    }
  }

  // ---------------------------------------------------------------- sound: your engine, horns, sirens
  audio(on) {
    const snd = this.g.sound, c = snd.ctx;
    if (!c) return;
    if (on && !this.engine) {
      const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), gn = c.createGain();
      o.type = 'sawtooth'; o2.type = 'square';
      f.type = 'lowpass'; f.frequency.value = 600;
      gn.gain.value = 0;
      o.connect(f); o2.connect(f); f.connect(gn).connect(snd.master);
      o.start(); o2.start();
      this.engine = { o, o2, f, gn };
    }
    if (!on && this.engine) {
      const e = this.engine;
      e.gn.gain.setTargetAtTime(0, c.currentTime, 0.05);
      setTimeout(() => { e.o.stop(); e.o2.stop(); }, 300);
      this.engine = null;
    }
    if (this.engine) {
      const s = this.g.ps.car, V = VEHICLES[s.k];
      const sp = Math.hypot(s.v[0], s.v[1]) / V.top;
      const gear = Math.min(4, Math.floor(sp * 5));
      const rpm = 0.25 + ((sp * 5 - gear) * 0.6 + gear * 0.08) * (gear ? 1 : 1.3);
      const thr = this.g.keys.has('KeyW') ? 1 : 0.4;
      const base = V.pedal ? 0 : V.bike ? 70 : V.style === 'muscle' ? 34 : 44;
      const now = c.currentTime;
      this.engine.o.frequency.setTargetAtTime(base * (1 + rpm * 2.2), now, 0.05);
      this.engine.o2.frequency.setTargetAtTime(base * 0.5 * (1 + rpm * 2.2), now, 0.05);
      this.engine.f.frequency.setTargetAtTime(300 + rpm * 1400 * thr, now, 0.08);
      this.engine.gn.gain.setTargetAtTime(V.pedal ? 0 : 0.05 + 0.05 * thr, now, 0.1);
    }
    // the nearest siren wails
    let best = null, bd = 4000;
    const eye = this.g.eyePos || [0, 0, 0];
    for (const car of this.cars.values()) if (car.flags & 1 && car.pose) { const d = Math.hypot(car.pose.o[0] - eye[0], car.pose.o[1] - eye[1]); if (d < bd) { bd = d; best = car; } }
    if (best && !this.siren) {
      const o = c.createOscillator(), gn = c.createGain();
      o.type = 'triangle'; gn.gain.value = 0;
      o.connect(gn).connect(snd.master); o.start();
      this.siren = { o, gn };
    }
    if (this.siren) {
      const now = c.currentTime;
      if (!best) { const s = this.siren; s.gn.gain.setTargetAtTime(0, now, 0.1); setTimeout(() => s.o.stop(), 400); this.siren = null; }
      else {
        const t = performance.now() / 1000;
        this.siren.o.frequency.setTargetAtTime(700 + 450 * (0.5 + 0.5 * Math.sin(t * 2.6)), now, 0.03);
        this.siren.gn.gain.setTargetAtTime(0.09 * (1 - bd / 4000), now, 0.1);
      }
    }
  }
  horn(pos, vol = 0.8) {
    const snd = this.g.sound;
    if (!snd.ctx) return;
    const out = snd.out(pos, vol, 0.05), t = snd.ctx.currentTime;
    for (const f of [392, 494]) snd.tone(out, t, 'square', f, f, 0.35, 0.12, 0.01);
  }

  // ---------------------------------------------------------------- HUD
  note(text) {
    const el = $('fp-note');
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this.noteT);
    this.noteT = setTimeout(() => { el.hidden = true; }, 6500);
  }
  toast(text) {
    const el = document.createElement('div');
    el.className = 'fp-toast';
    el.textContent = text;
    $('fp-hud').appendChild(el);
    setTimeout(() => el.remove(), 1600);
  }
  updateHud(t) {
    const me = this.me;
    if (!me) return;
    const [cash, wanted, flash, vid, seat, prompt, rob] = me;
    $('fp-cash').textContent = money(cash);
    const stars = $('fp-stars');
    const sk = wanted + '|' + flash;
    if (stars.dataset.k !== sk) { stars.dataset.k = sk; stars.innerHTML = [1, 2, 3, 4, 5].map((k) => `<i class="${k <= wanted ? 'on' : ''}">★</i>`).join(''); stars.classList.toggle('flash', !!flash); stars.hidden = !wanted; }
    let p = '';
    if (rob > 0) p = `<span>Emptying the till… keep aiming</span><span class="bar"><span style="width:${rob}%"></span></span>`;
    else if (prompt) { const [k, text] = prompt.split('|'); p = (k ? `<b>${esc(k)}</b>` : '') + esc(text); }
    else if (this.g.ps.car && VEHICLES[this.g.ps.car.k].air) p = `<small><b>W</b>/<b>S</b> throttle · steer with the mouse · <b>A</b>/<b>D</b> rudder · <b>Q</b> flares${VEHICLES[this.g.ps.car.k].guns ? ' · <b>click</b> cannon · <b>right click</b> missile' : ''} · <b>E</b> bail out</small>`;
    else if (this.g.ps.car || this.g.ps.seat) p = `<small><b>E</b> get out · <b>F</b> ${this.firstPerson ? 'chase camera' : 'first person'}${this.g.ps.car ? ' · <b>Space</b> handbrake · <b>H</b> horn' : ''}</small>`;
    const pe = $('fp-prompt');
    if (pe.dataset.p !== p) { pe.dataset.p = p; pe.innerHTML = p; pe.hidden = !p; }
    // speedometer
    const car = this.myCar();
    const sp = $('fp-speed');
    if (car) {
      const v = car.state.v;
      sp.hidden = false;
      const V = VEHICLES[car.k];
      if (V.air) sp.innerHTML = `<b>${Math.round(Math.hypot(v[0], v[1], v[2] || 0) * 0.0494)}</b><small>KT</small><span>ALT ${Math.max(0, Math.round(car.state.o[2] / 12)).toLocaleString()} FT · THROTTLE ${Math.round((car.state.thr || 0) * 100)}%</span><span>${esc(V.name)}</span>`;
      else sp.innerHTML = `<b>${mph(Math.hypot(v[0], v[1]))}</b><small>MPH</small><span>${esc(V.name)}</span>`;
    } else sp.hidden = true;
    // the weapon HUD steps aside at the wheel
    document.body.classList.toggle('fp-driving', !!this.g.ps.car);
  }

  // ---------------------------------------------------------------- radar: the streets around you, turning with you
  drawRadar(eye) {
    const ctx = this.radarCtx;
    if (!ctx) return;
    const W = ctx.canvas.width, R = W / 2, range = 3600, s = R / range;
    const yaw = (this.myCar() && !this.firstPerson ? this.myCar().state.yaw : this.g.yaw) * DEG;
    const sn = Math.sin(yaw), cs = Math.cos(yaw);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#2b3a2c'; ctx.fillRect(0, 0, W, W);
    ctx.setTransform(sn * s, -cs * s, -cs * s, -sn * s, R, R);
    const ci = cellOf(eye[0]), cj = cellOf(eye[1]);
    const COL = MAP_COL;
    for (let i = ci - 3; i <= ci + 3; i++) for (let j = cj - 3; j <= cj + 3; j++) { ctx.fillStyle = COL[district(i, j)]; ctx.fillRect(i * G - eye[0] - 2, j * G - eye[1] - 2, G + 4, G + 4); }
    ctx.lineCap = 'butt';
    for (let i = ci - 3; i <= ci + 4; i++) for (let j = cj - 3; j <= cj + 4; j++) {
      const h = roadH(i, j), v = roadV(i, j);
      ctx.strokeStyle = '#cfcfc8';
      if (h) { ctx.lineWidth = RW * 2 * (h === 2 ? 1.2 : 1); ctx.beginPath(); ctx.moveTo(i * G - eye[0] - RW, j * G - eye[1]); ctx.lineTo((i + 1) * G - eye[0] + RW, j * G - eye[1]); ctx.stroke(); }
      if (v) { ctx.lineWidth = RW * 2 * (v === 2 ? 1.2 : 1); ctx.beginPath(); ctx.moveTo(i * G - eye[0], j * G - eye[1] - RW); ctx.lineTo(i * G - eye[0], (j + 1) * G - eye[1] + RW); ctx.stroke(); }
    }
    const blip = (x, y, color, r = 70, shape = 'dot') => {
      let dx = x - eye[0], dy = y - eye[1];
      const d = Math.hypot(dx, dy);
      if (d > range * 0.92) { dx *= (range * 0.92) / d; dy *= (range * 0.92) / d; }
      ctx.fillStyle = color;
      ctx.beginPath();
      if (shape === 'sq') ctx.rect(dx - r, dy - r, r * 2, r * 2); else ctx.arc(dx, dy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 25; ctx.strokeStyle = '#000'; ctx.stroke();
    };
    for (const p of PLACES) {
      if (Math.abs(p.door[0] - eye[0]) > range * 2 || Math.abs(p.door[1] - eye[1]) > range * 2) continue;
      const near = Math.hypot(p.door[0] - eye[0], p.door[1] - eye[1]) < range * 1.6;
      if (!near && p.type !== 'gun') continue;
      blip(p.door[0], p.door[1], { gas: '#ff5a3a', gun: '#ffd23a', hospital: '#ffffff', police: '#3a7aff' }[p.type], 130, 'sq');
    }
    const t = performance.now() / 1000;
    for (const c of this.cars.values()) {
      if (!c.pose) continue;
      if (c.flags & 128) blip(c.pose.o[0], c.pose.o[1], Math.floor(t * 4) % 2 ? '#ff3030' : '#3060ff', 75);
      else if (c.flags & 64) blip(c.pose.o[0], c.pose.o[1], '#3adc7a', 95, 'sq');
    }
    if (this.mineFar) blip(this.mineFar[1], this.mineFar[2], '#3adc7a', 95, 'sq');
    for (const pl of this.g.players.values()) if (pl.pos) blip(pl.pos[0], pl.pos[1], '#ff9a3a', 70);
    for (const n of this.peds.values()) if (n.kind === 1 && n.flags & 16) blip(n.pos[0], n.pos[1], '#3a7aff', 55);
    ctx.restore();
    // you: an arrow in the middle, pointing up
    ctx.setTransform(1, 0, 0, 1, R, R);
    const look = this.myCar() && !this.firstPerson ? angDiff(this.myCar().state.yaw, this.g.yaw) * DEG : 0;
    ctx.rotate(-look);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 3); ctx.lineTo(-6, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(R, R, R - 2, 0, Math.PI * 2); ctx.stroke();
    // where you are
    const d = district(ci, cj), c = CITIES.find((x) => ci >= x.rect[0] && ci <= x.rect[2] && cj >= x.rect[1] && cj <= x.rect[3]) || TOWNS.find((x) => ci >= x.rect[0] && ci <= x.rect[2] && cj >= x.rect[1] && cj <= x.rect[3]);
    const name = c ? c.name : DISTRICT_NAMES[d];
    const z = $('fp-zone');
    if (z.textContent !== name) {
      z.textContent = name;
      // a new area: its name comes up big in the corner for a moment
      const a = $('fp-area');
      a.textContent = name;
      a.classList.remove('show'); void a.offsetWidth; a.classList.add('show');
    }
  }

  // ---------------------------------------------------------------- the phone
  // keyboard and wheel: arrows/wheel to move, Enter or click to choose, Backspace or right click to go back
  phoneOpen() { return !!this.phone; }
  togglePhone() { if (this.phone) this.closePhone(); else this.openPhone(); }
  openPhone() {
    if (!this.on) return;
    this.closeShop();
    this.phone = { screen: 'home', sel: 0, paint: 0, item: null };
    $('fp-phone').hidden = false;
    this.g.sound.ui(1100);
    this.renderPhone();
  }
  closePhone() {
    if (!this.phone) return;
    this.phone = null;
    $('fp-phone').hidden = true;
    this.g.sound?.ui(700);
  }
  phoneItems() {
    const P = this.phone;
    if (P.screen === 'home') return [{ k: 'cars', label: 'Motors', icon: '🚗', sub: 'Buy a car' }, { k: 'bikes', label: 'Moto', icon: '🏍️', sub: 'Bikes & BMX' }, { k: 'planes', label: 'Aero', icon: '✈️', sub: 'Buy a plane' }, { k: 'garage', label: 'Garage', icon: '🔑', sub: `${this.state.cars.length} owned` }, { k: 'contacts', label: 'Contacts', icon: '📞', sub: 'Jamal' }, { k: 'map', label: 'Map', icon: '🗺️', sub: 'M for the big map' }];
    if (P.screen === 'contacts') return [{ k: 'jamal', label: 'Jamal', sub: 'Lose your wanted level · $1,000' }];
    if (P.screen === 'garage' && this.g.ps.car && !(this.cars.get(this.g.ps.car.id)?.flags & 64)) return [{ save: true }, ...this.state.cars.map((c, n) => ({ n, V: VEHICLES[c.k], c: c.c }))];
    if (P.screen === 'cars' || P.screen === 'bikes' || P.screen === 'planes') return VEHICLES.map((V, i) => ({ V, i })).filter(({ V }) => V.shop === P.screen).sort((a, b) => a.V.price - b.V.price);
    if (P.screen === 'garage') return this.state.cars.map((c, n) => ({ n, V: VEHICLES[c.k], c: c.c }));
    if (P.screen === 'paint') return PAINTS.map((p, i) => ({ i }));
    return [];
  }
  renderPhone() {
    const P = this.phone;
    if (!P) return;
    const items = this.phoneItems();
    P.sel = Math.max(0, Math.min(items.length - 1, P.sel));
    let body = '';
    const title = { home: 'Mugr OS', cars: 'Motors', bikes: 'Moto', planes: 'Aero', garage: 'Garage', contacts: 'Contacts', map: 'Map', paint: 'Pick a colour' }[P.screen];
    if (P.screen === 'home') body = `<div class="apps">${items.map((it, k) => `<div class="app${k === P.sel ? ' on' : ''}" data-k="${k}"><span class="ic">${it.icon}</span><b>${it.label}</b><small>${esc(it.sub)}</small></div>`).join('')}</div>`;
    else if (P.screen === 'cars' || P.screen === 'bikes' || P.screen === 'planes') body = `<ul class="list">${items.map(({ V }, k) => `<li class="${k === P.sel ? 'on' : ''}${V.price > this.state.cash ? ' dim' : ''}" data-k="${k}"><b>${esc(V.name)}</b><span class="price">${money(V.price)}</span><small>${esc(V.blurb || '')}${V.air ? ' Delivered to the airport.' : ''}</small><span class="meter"><i style="width:${Math.round((V.top / (V.air ? 4300 : 2800)) * 100)}%"></i></span></li>`).join('')}</ul>`;
    else if (P.screen === 'garage') body = items.length ? `<ul class="list">${items.map((it, k) => it.save ? `<li class="${k === P.sel ? 'on' : ''} save" data-k="${k}"><b>Save this vehicle</b><small>Keep the one you're driving: call it any time</small></li>` : `<li class="${k === P.sel ? 'on' : ''}" data-k="${k}"><b>${esc(it.V.name)}</b><span class="price"><i class="sw" style="background:${PAINTS[it.c]}"></i></span><small>${it.V.air ? 'Enter: have it waiting at the airport' : 'Enter: bring it to me'}</small></li>`).join('')}</ul>` : '<p class="empty">No vehicles yet. Buy one, or drive something and save it here.</p>';
    else if (P.screen === 'contacts') body = `<ul class="list">${items.map((it, k) => `<li class="${k === P.sel ? 'on' : ''}" data-k="${k}"><b>📞 ${esc(it.label)}</b><small>${esc(it.sub)}</small></li>`).join('')}</ul>`;
    else if (P.screen === 'paint') body = `<p class="pick">${esc(P.item.V.name)} · ${money(P.item.V.price)}</p><div class="paints">${items.map(({ i }, k) => `<i class="sw${k === P.sel ? ' on' : ''}" data-k="${k}" title="${PAINT_NAMES[i]}" style="background:${PAINTS[i]}"></i>`).join('')}</div><p class="pick">${PAINT_NAMES[P.sel]} · Enter to buy</p>`;
    else if (P.screen === 'map') body = '<canvas id="fp-map" width="300" height="300"></canvas><p class="legend"><i style="background:#ff5a3a"></i>Gas <i style="background:#ffd23a"></i>Guns <i style="background:#fff"></i>Hospital <i style="background:#3adc7a"></i>Your car</p>';
    $('fp-phone').innerHTML = `<div class="bar"><span>${new Date().toTimeString().slice(0, 5)}</span><span>${money(this.state.cash)}</span></div><h3>${title}</h3>${body}<div class="keys">${P.screen === 'home' ? '<b>↑↓←→</b> move · <b>Enter</b> open · <b>P</b> close' : '<b>↑↓</b> move · <b>Enter</b> choose · <b>Backspace</b> back'}</div>`;
    $('fp-phone').querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    if (P.screen === 'map') this.drawMap();
  }
  // the big map (M): the whole county, landscape, with everything on it; the wheel zooms in on you
  toggleBigMap() {
    this.bigMap = !this.bigMap;
    const el = $('fp-bigmap');
    el.hidden = !this.bigMap;
    if (!this.bigMap) return;
    this.closePhone();
    this.bigZoom ||= 1;
    const cv = $('fp-bigcanvas');
    cv.width = Math.round(el.clientWidth * Math.min(2, devicePixelRatio));
    cv.height = Math.round(el.clientHeight * Math.min(2, devicePixelRatio));
    this.drawBigMap();
  }
  drawBigMap() {
    const cv = $('fp-bigcanvas');
    if (!cv || !cv.width) return;
    const ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, n = N * 2;
    const o = this.g.ps.origin;
    // fit the whole county across the screen; zooming keeps you in the middle
    const s = (Math.max(W / n, H / n) * 0.98) * this.bigZoom;
    const cx = this.bigZoom > 1 ? o[0] / G + N : N, cy = this.bigZoom > 1 ? N - o[1] / G : N;
    const pt = (x, y) => [W / 2 + ((x / G + N) - cx) * s, H / 2 + ((N - y / G) - cy) * s];
    // the land, roads and names only change with the zoom: drawn once and kept (zoomed in, it follows you)
    const key = `${W}x${H}x${this.bigZoom}` + (this.bigZoom > 1 ? `@${Math.round(cx * 4)},${Math.round(cy * 4)}` : '');
    if (this.mapBase?.key === key) { ctx.drawImage(this.mapBase.cv, 0, 0); return this.drawBlips(ctx, pt, s); }
    ctx.fillStyle = MAP_COL[D.OCEAN]; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const [x, y] = pt((i - N) * G, (j - N + 1) * G);
      if (x > W || y > H || x + s < 0 || y + s < 0) continue;
      ctx.fillStyle = MAP_COL[district(i - N, j - N)]; ctx.fillRect(x, y, s + 0.6, s + 0.6);
    }
    // roads: town streets thin, highways bold
    for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
      for (const [kind, ax, ay, bx, by] of [[roadH(i, j), i, j, i + 1, j], [roadV(i, j), i, j, i, j + 1]]) {
        if (!kind || (kind === 1 && s < 7)) continue;
        const a = pt(ax * G, ay * G), b = pt(bx * G, by * G);
        ctx.strokeStyle = kind === 2 ? 'rgba(245,226,160,.85)' : 'rgba(220,220,214,.55)'; ctx.lineWidth = kind === 2 ? Math.max(1.5, s * 0.14) : Math.max(0.7, s * 0.1);
        ctx.beginPath(); ctx.moveTo(...a); ctx.lineTo(...b); ctx.stroke();
      }
    }
    const font = Math.round(Math.max(11, Math.min(22, s * 1.2)));
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // runways
    for (const a of AIRFIELDS) {
      const [x0, y0] = pt(a.min[0], (a.runwayJ + 1) * G - 600), [x1, y1] = pt(a.max[0], a.runwayJ * G + 600);
      ctx.fillStyle = '#2e3034'; ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      const [lx, ly] = pt(a.center[0], a.max[1]);
      ctx.font = `800 ${font}px Inter, system-ui, sans-serif`; ctx.fillStyle = a.military ? '#ffb4a0' : '#e8f0ff';
      ctx.fillText((a.military ? '⚠ ' : '✈ ') + a.name, lx, ly - font);
    }
    const r = Math.max(3, s * 0.18);
    for (const p of PLACES) { const [x, y] = pt(p.door[0], p.door[1]); ctx.fillStyle = BLIP[p.type]; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.strokeRect(x - r, y - r, r * 2, r * 2); }
    ctx.font = `900 ${font + 6}px Inter, system-ui, sans-serif`; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,.7)'; ctx.lineWidth = 4;
    for (const c of CITIES) { const [x, y] = pt(((c.rect[0] + c.rect[2] + 1) / 2) * G, ((c.rect[1] + c.rect[3] + 1) / 2) * G); ctx.strokeText(c.name.toUpperCase(), x, y); ctx.fillText(c.name.toUpperCase(), x, y); }
    ctx.font = `700 ${font}px Inter, system-ui, sans-serif`;
    for (const c of TOWNS) { const [x, y] = pt(((c.rect[0] + c.rect[2] + 1) / 2) * G, ((c.rect[1] + c.rect[3] + 1) / 2) * G); ctx.strokeText(c.name, x, y); ctx.fillText(c.name, x, y); }
    const keep = this.mapBase?.cv || document.createElement('canvas');
    keep.width = W; keep.height = H;
    keep.getContext('2d').drawImage(cv, 0, 0);
    this.mapBase = { key, cv: keep };
    this.drawBlips(ctx, pt, s);
  }
  // your vehicle, police, other players, you
  drawBlips(ctx, pt, s) {
    const r = Math.max(3, s * 0.18);
    const o = this.g.ps.origin;
    const mine = [...this.cars.values()].find((c) => c.flags & 64);
    const mp = mine?.pose ? mine.pose.o : this.mineFar ? [this.mineFar[1], this.mineFar[2]] : null;
    if (mp) { const [x, y] = pt(mp[0], mp[1]); ctx.fillStyle = '#3adc7a'; ctx.fillRect(x - r * 1.3, y - r * 1.3, r * 2.6, r * 2.6); }
    for (const c of this.cars.values()) if (c.flags & 128 && c.pose) { const [x, y] = pt(c.pose.o[0], c.pose.o[1]); ctx.fillStyle = Math.floor(performance.now() / 250) % 2 ? '#ff3030' : '#3060ff'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    for (const pl of this.g.players.values()) if (pl.pos) { const [x, y] = pt(pl.pos[0], pl.pos[1]); ctx.fillStyle = '#ff9a3a'; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); }
    const [px, py] = pt(o[0], o[1]);
    ctx.save(); ctx.translate(px, py); ctx.rotate(-(this.g.yaw - 90) * DEG);
    const a = Math.max(8, r * 2.4);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -a); ctx.lineTo(a * 0.7, a * 0.8); ctx.lineTo(0, a * 0.35); ctx.lineTo(-a * 0.7, a * 0.8); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  bigMapWheel(dy) {
    if (!this.bigMap) return false;
    this.bigZoom = Math.max(1, Math.min(6, this.bigZoom * (dy > 0 ? 0.8 : 1.25)));
    this.drawBigMap();
    return true;
  }

  drawMap() {
    const cv = $('fp-map');
    if (!cv) return;
    const ctx = cv.getContext('2d'), n = N * 2, s = cv.width / n;
    const COL = MAP_COL;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { ctx.fillStyle = COL[district(i - N, j - N)]; ctx.fillRect(i * s, (n - 1 - j) * s, s + 0.5, s + 0.5); }
    ctx.strokeStyle = 'rgba(230,230,220,.55)'; ctx.lineWidth = 0.8;
    for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
      if (roadH(i, j) === 2) { ctx.beginPath(); ctx.moveTo((i + N) * s, (N - j) * s); ctx.lineTo((i + N + 1) * s, (N - j) * s); ctx.stroke(); }
      if (roadV(i, j) === 2) { ctx.beginPath(); ctx.moveTo((i + N) * s, (N - j) * s); ctx.lineTo((i + N) * s, (N - j - 1) * s); ctx.stroke(); }
    }
    const pt = (x, y) => [(x / G + N) * s, (N - y / G) * s];
    for (const p of PLACES) { const [x, y] = pt(p.door[0], p.door[1]); ctx.fillStyle = { gas: '#ff5a3a', gun: '#ffd23a', hospital: '#ffffff', police: '#3a7aff' }[p.type]; ctx.fillRect(x - 2, y - 2, 4, 4); }
    ctx.font = '700 10px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
    for (const c of [...CITIES, ...TOWNS]) { const [x, y] = pt(((c.rect[0] + c.rect[2] + 1) / 2) * G, ((c.rect[1] + c.rect[3] + 1) / 2) * G); ctx.fillText(c.name, x, y); }
    const mine = [...this.cars.values()].find((c) => c.flags & 64);
    const mp = mine?.pose ? mine.pose.o : this.mineFar ? [this.mineFar[1], this.mineFar[2]] : null;
    if (mp) { const [x, y] = pt(mp[0], mp[1]); ctx.fillStyle = '#3adc7a'; ctx.fillRect(x - 3, y - 3, 6, 6); }
    const o = this.g.ps.origin, [x, y] = pt(o[0], o[1]);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000';
    ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
  // returns true when the key was for the phone or the shop
  key(code) {
    const ui = this.phone ? 'phone' : this.shop ? 'shop' : null;
    if (!ui) return false;
    const P = ui === 'phone' ? this.phone : this.shop;
    const items = ui === 'phone' ? this.phoneItems() : this.shop.items;
    const cols = ui === 'phone' && P.screen === 'home' ? 2 : ui === 'phone' && P.screen === 'paint' ? 6 : 1;
    if (code === 'ArrowDown') P.sel = Math.min(items.length - 1, P.sel + cols);
    else if (code === 'ArrowUp') P.sel = Math.max(0, P.sel - cols);
    else if (code === 'ArrowRight' && cols > 1) P.sel = Math.min(items.length - 1, P.sel + 1);
    else if (code === 'ArrowLeft' && cols > 1) P.sel = Math.max(0, P.sel - 1);
    else if (code === 'Enter' || code === 'NumpadEnter') { ui === 'phone' ? this.phoneChoose() : this.shopChoose(); return true; }
    else if (code === 'Backspace') { if (ui === 'phone') this.phoneBack(); else this.closeShop(); return true; }
    else return false;
    this.g.sound.ui(1300);
    ui === 'phone' ? this.renderPhone() : this.renderShop();
    return true;
  }
  wheel(dir) {
    if (!this.phone && !this.shop) return false;
    this.key(dir > 0 ? 'ArrowDown' : 'ArrowUp');
    return true;
  }
  click(button) {
    if (!this.phone && !this.shop) return false;
    this.key(button === 2 ? 'Backspace' : 'Enter');
    return true;
  }
  phoneBack() {
    const P = this.phone;
    if (P.screen === 'home') return this.closePhone();
    P.sel = 0;
    P.screen = P.screen === 'paint' ? P.item.V.shop : 'home';
    this.g.sound.ui(800);
    this.renderPhone();
  }
  phoneChoose() {
    const P = this.phone, items = this.phoneItems(), it = items[P.sel];
    if (!it) return;
    this.g.sound.ui(1500);
    if (P.screen === 'home') { P.screen = it.k; P.sel = 0; }
    else if (P.screen === 'cars' || P.screen === 'bikes' || P.screen === 'planes') {
      if (it.V.price > this.state.cash) { this.note(`You need ${money(it.V.price - this.state.cash)} more. Rob a gas station?`); return; }
      P.item = it; P.screen = 'paint'; P.sel = 0;
    } else if (P.screen === 'paint') { this.g.send({ t: 'fp', k: 'buy', id: P.item.V.id, paint: P.sel }); this.closePhone(); return; }
    else if (P.screen === 'garage') { this.g.send(it.save ? { t: 'fp', k: 'save' } : { t: 'fp', k: 'call', n: it.n }); this.closePhone(); return; }
    else if (P.screen === 'contacts') { this.note('Calling Jamal…'); this.g.send({ t: 'fp', k: 'jamal' }); this.closePhone(); return; }
    else if (P.screen === 'map') { this.closePhone(); this.toggleBigMap(); return; }
    this.renderPhone();
  }

  // ---------------------------------------------------------------- the gun shop counter
  openShop(m) {
    this.closePhone();
    const items = m.items.map(([w, price, ammo]) => ({ w, price, ammo })).concat([{ armor: true, price: m.armor }]);
    this.shop = { items, sel: this.shop?.sel || 0 };
    $('fp-shop').hidden = false;
    this.renderShop();
  }
  closeShop() {
    if (!this.shop) return;
    this.shop = null;
    $('fp-shop').hidden = true;
  }
  renderShop() {
    const S = this.shop;
    if (!S) return;
    const ps = this.g.ps;
    const rows = S.items.map((it, k) => {
      if (it.armor) return `<li class="${k === S.sel ? 'on' : ''}"><b>Body armour</b><span class="price">${money(it.price)}</span><small>${ps.armor >= 100 ? 'Full' : 'Fills your armour'}</small></li>`;
      const wi = WEAPON_INDEX[it.w], W = WEAPONS[wi];
      const own = (this.state.guns >> wi) & 1 || (ps.owned >> wi) & 1;
      return `<li class="${k === S.sel ? 'on' : ''}${own ? ' own' : ''}"><b>${esc(W.name)}</b><span class="price">${own ? (W.ammo ? 'Ammo ' + money(it.ammo) : 'Owned') : money(it.price)}</span><small>${own ? 'Yours (kept between visits)' : `${W.damage * (W.pellets || 1)} damage · ${W.clip > 0 ? W.clip + ' rounds' : 'single shot'}`}</small></li>`;
    });
    $('fp-shop').innerHTML = `<h3>MUGR ARMS</h3><p class="cash">${money(this.state.cash)}</p><ul class="list">${rows.join('')}</ul><div class="keys"><b>↑↓</b> or wheel · <b>Enter</b> buy · <b>Backspace</b> leave</div>`;
    $('fp-shop').querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }
  shopChoose() {
    const S = this.shop, it = S.items[S.sel];
    if (!it) return;
    if (it.armor) this.g.send({ t: 'fp', k: 'armor' });
    else {
      const wi = WEAPON_INDEX[it.w];
      const own = (this.state.guns >> wi) & 1 || (this.g.ps.owned >> wi) & 1;
      this.g.send({ t: 'fp', k: own ? 'ammo' : 'gun', w: it.w });
    }
  }
}
let FAR_MAT = null;
