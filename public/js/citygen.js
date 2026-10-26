// Mugr County, the free roam world, built from code. The server and every browser generate the same world a
// cell at a time, so nothing is downloaded and only the part near somebody is ever built. The world is a grid of
// 2048-unit cells (a city block each), 80 across: about 4 km. Three cities, three towns, farms, forest, desert,
// a river with a lake, beaches, a mountain, an airport and a military airbase, joined by roads on the grid lines
// (one lane each way, traffic on the right).
// Only exact arithmetic decides anything solid (no sin, cos or pow), so every machine builds identical walls.
// Units: 1 ≈ 1 inch, Z up.

export const G = 2048; // one cell
export const N = 40; // cells from the middle to each edge
export const HALF = G * N;
export const RW = 150; // road half width
export const LANE = 75; // lane centre, from the middle of the road
export const SWALK = 120; // pavement width beside town roads
export const KERB = 8; // pavement height
export const CHUNK = 2; // cells per side of a render chunk
export const SPEED = [0, 820, 1350]; // traffic speed on town streets and on highways
const W = N * 2;

export const D = { OCEAN: 0, LAKE: 1, CITY: 2, SUBURB: 3, TOWN: 4, BEACH: 5, FARM: 6, FOREST: 7, DESERT: 8, FIELD: 9, MOUNTAIN: 10, AIRPORT: 11, AIRBASE: 12 };
export const DISTRICT_NAMES = ['Ocean', 'Mirror Lake', 'City', 'Suburbs', 'Town', 'Beach', 'Farmland', 'Woods', 'Desert', 'Grassland', 'Mount Mugr', 'Mugr International', 'Fort Talon Air Base'];

// [first cell i, first cell j, last cell i, last cell j]
export const CITIES = [
  { id: 'halcyon', name: 'Port Halcyon', rect: [8, -34, 30, -12], core: [19, -23], coreR: 5, tint: 0 },
  { id: 'bayreach', name: 'Bayreach', rect: [-34, 12, -16, 30], core: [-25, 21], coreR: 4, tint: 1 },
  { id: 'sundown', name: 'Sundown', rect: [14, 16, 32, 32], core: [23, 24], coreR: 3.5, tint: 2 },
];
export const TOWNS = [
  { id: 'pinecrest', name: 'Pinecrest', rect: [-30, -16, -25, -11] },
  { id: 'dustwater', name: 'Dustwater', rect: [-4, 22, 0, 26] },
  { id: 'millbrook', name: 'Millbrook', rect: [-12, -32, -8, -28] },
];
const PEAK = [-20, -24], PEAK_R2 = 14; // Mount Mugr
// Airfields: a runway along x on one row of cells, the apron (where planes park) on the next, hangars behind.
// The airbase is fenced, guarded and defended by missile sites.
export const AIRFIELDS = [
  { id: 'airport', name: 'Mugr International', rect: [4, 3, 13, 8], runwayJ: 5, apronJ: 6, hangarJ: 7, military: false },
  { id: 'airbase', name: 'Fort Talon Air Base', rect: [-11, 9, -3, 14], runwayJ: 11, apronJ: 12, hangarJ: 13, military: true, gateI: -7 },
  // the city airport: on the south side of Port Halcyon, by the sea
  { id: 'cityport', name: 'Halcyon City Airport', rect: [19, -34, 29, -30], runwayJ: -32, apronJ: -31, hangarJ: -30, military: false },
];
export const airfieldAt = (i, j) => AIRFIELDS.find((a) => i >= a.rect[0] && i <= a.rect[2] && j >= a.rect[1] && j <= a.rect[3]) || null;
for (const a of AIRFIELDS) {
  const [ai, aj, bi, bj] = a.rect;
  // parking spots on the apron, nose to the runway; the middle of the base; missile sites at its corners
  a.stands = [];
  for (let i = ai + 1; i < bi; i++) for (const x of [512, 1536]) a.stands.push([i * G + x, a.apronJ * G + 900, 0, 270]);
  a.center = [((ai + bi + 1) / 2) * G, ((aj + bj + 1) / 2) * G, 0];
  a.min = [ai * G, aj * G]; a.max = [(bi + 1) * G, (bj + 1) * G];
  a.sams = a.military ? [[ai * G + 600, aj * G + 600], [(bi + 1) * G - 600, aj * G + 600], [ai * G + 600, (bj + 1) * G - 600], [(bi + 1) * G - 600, (bj + 1) * G - 600]] : [];
}
export const inAirfield = (a, x, y) => x >= a.min[0] && x <= a.max[0] && y >= a.min[1] && y <= a.max[1];

// ------------------------------------------------------------------ deterministic noise
export function hash(i, j, k = 0) {
  let h = Math.imul(i | 0, 374761393) ^ Math.imul(j | 0, 668265263) ^ Math.imul(k | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export function rng(seed) {
  let a = Math.floor(seed * 4294967296) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// smooth value noise from the hash (arithmetic only)
function vnoise(x, y, k) {
  const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j, k), b = hash(i + 1, j, k), c = hash(i, j + 1, k), d = hash(i + 1, j + 1, k);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ------------------------------------------------------------------ districts
const inRect = (i, j, r, m = 0) => i >= r[0] - m && i <= r[2] + m && j >= r[1] - m && j <= r[3] + m;
export const cityAt = (i, j, m = 0) => CITIES.find((c) => inRect(i, j, c.rect, m)) || null;
export const townAt = (i, j, m = 0) => TOWNS.find((t) => inRect(i, j, t.rect, m)) || null;
function coast(i, j) {
  const u = (i + 0.5) / N, v = (j + 0.5) / N;
  const u2 = u * u, v2 = v * v;
  const m = u2 * u2 * u2 + v2 * v2 * v2; // a rounded square
  const r = 0.86 + 0.09 * vnoise(u * 3 + 7, v * 3 + 7, 1) + 0.04 * vnoise(u * 9, v * 9, 2);
  const r2 = r * r;
  return m < r2 * r2 * r2;
}
const isLake = (i, j) => (j === -1 && i <= 2) || (i >= 1 && i <= 5 && j >= -3 && j <= 1);
function biome(i, j) {
  if (j >= 8) return i >= -12 ? D.DESERT : D.FOREST;
  const n = hash(i >> 2, j >> 2, 5);
  if (i < 8) return n < 0.3 ? D.FOREST : D.FARM;
  return n < 0.22 ? D.FOREST : D.FIELD;
}
const DIST = new Uint8Array(W * W);
for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) {
  let d;
  if (airfieldAt(i, j)) d = airfieldAt(i, j).military ? D.AIRBASE : D.AIRPORT;
  else if (cityAt(i, j)) d = D.CITY;
  else if (townAt(i, j)) d = D.TOWN;
  else if (!coast(i, j) && !cityAt(i, j, 1)) d = D.OCEAN;
  else if (isLake(i, j)) d = D.LAKE;
  else if (cityAt(i, j, 3)) d = D.SUBURB;
  else if ((i - PEAK[0]) * (i - PEAK[0]) + (j - PEAK[1]) * (j - PEAK[1]) <= PEAK_R2) d = D.MOUNTAIN;
  else d = biome(i, j);
  DIST[(i + N) * W + j + N] = d;
}
// sand where the countryside meets the sea
const BEACHY = new Set([D.FARM, D.FOREST, D.DESERT, D.FIELD, D.SUBURB]);
{
  const turn = [];
  for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) {
    const d = DIST[(i + N) * W + j + N];
    if (!BEACHY.has(d)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => district(i + a, j + b) === D.OCEAN)) turn.push((i + N) * W + j + N);
  }
  for (const k of turn) DIST[k] = D.BEACH;
}
export function district(i, j) {
  if (i < -N || j < -N || i >= N || j >= N) return D.OCEAN;
  return DIST[(i + N) * W + j + N];
}
export const isWater = (d) => d === D.OCEAN || d === D.LAKE;
export const isUrban = (d) => d === D.CITY || d === D.SUBURB || d === D.TOWN;
export const isAir = (d) => d === D.AIRPORT || d === D.AIRBASE;

// ------------------------------------------------------------------ roads
// roadH(i, j): along y = jG from x = iG to (i+1)G, between cells (i, j-1) and (i, j).
// roadV(i, j): along x = iG from y = jG to (j+1)G, between cells (i-1, j) and (i, j).
// 0: none, 1: town street, 2: highway (every 8th line across the countryside, bridges over the lake)
const RH = new Uint8Array(W * (W + 1)), RV = new Uint8Array((W + 1) * W);
const mod8 = (n) => ((n % 8) + 8) % 8;
function roadKind(a, b, line) {
  if (a === D.OCEAN && b === D.OCEAN) return 0;
  if (isAir(a) && isAir(b)) return 0; // nothing crosses a runway
  if (isAir(a) || isAir(b)) return isUrban(a) || isUrban(b) ? 1 : mod8(line) === 0 ? 2 : 0; // city streets run round the city airport
  const urban = isUrban(a) || isUrban(b);
  if (a === D.OCEAN || b === D.OCEAN) return urban ? 1 : 0; // seafront avenues
  if (urban) return 1;
  return mod8(line) === 0 ? 2 : 0;
}
for (let i = -N; i < N; i++) for (let j = -N; j <= N; j++) RH[(i + N) * (W + 1) + j + N] = roadKind(district(i, j - 1), district(i, j), j);
for (let i = -N; i <= N; i++) for (let j = -N; j < N; j++) RV[(i + N) * W + j + N] = roadKind(district(i - 1, j), district(i, j), i);
export function roadH(i, j) {
  if (i < -N || i >= N || j < -N || j > N) return 0;
  return RH[(i + N) * (W + 1) + j + N];
}
export function roadV(i, j) {
  if (i < -N || i > N || j < -N || j >= N) return 0;
  return RV[(i + N) * W + j + N];
}

// directions: 0 east (+x), 1 north (+y), 2 west, 3 south
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
// the road leaving node (i, j) in direction d
export function roadFrom(i, j, d) {
  return d === 0 ? roadH(i, j) : d === 1 ? roadV(i, j) : d === 2 ? roadH(i - 1, j) : roadV(i, j - 1);
}
export function exits(i, j) {
  const out = [];
  for (let d = 0; d < 4; d++) if (roadFrom(i, j, d)) out.push(d);
  return out;
}
// lanes keep to the right: the right of a direction
export const RIGHT = [[0, -1], [1, 0], [0, 1], [-1, 0]];
// traffic lights where town streets cross
export function hasSignal(i, j) {
  const e = exits(i, j);
  if (e.length < 3) return false;
  if (!e.some((d) => roadFrom(i, j, d) === 1)) return false;
  return e.some((d) => d % 2 === 0) && e.some((d) => d % 2 === 1);
}
export const CYCLE = 22;
// light for traffic moving along an axis ('ns' or 'ew') at a node: 0 green, 1 amber, 2 red
export function signal(i, j, axis, t) {
  const p = (t + hash(i, j, 9) * CYCLE) % CYCLE;
  const ns = p < 9 ? 0 : p < 11 ? 1 : 2;
  const ew = p < 11 ? 2 : p < 20 ? 0 : 1;
  return axis === 'ns' ? ns : ew;
}

// ------------------------------------------------------------------ places: shops, gas stations, hospitals, police
// Fixed cells near each city's middle; rural gas stations sit at highway crossings.
const PLACE_DEFS = {
  halcyon: [['gas', 6, 3], ['gas', -7, -5], ['gas', 2, -9], ['gas', -5, 8], ['gas', 9, -6], ['gun', 3, -3], ['gun', -6, 5], ['hospital', -3, -4], ['police', 4, 4]],
  bayreach: [['gas', 5, -4], ['gas', -6, 6], ['gas', 3, 8], ['gun', -4, -3], ['gun', 6, 5], ['hospital', 3, 3], ['police', -5, 4]],
  sundown: [['gas', 6, 3], ['gas', -5, -5], ['gas', 2, 7], ['gun', -3, 4], ['hospital', 4, -4], ['police', -5, 1]],
};
export const PLACE_NAMES = { gas: 'Fill & Go', gun: 'Mugr Arms', hospital: 'County General', police: 'County Police' };
const PLACE_AT = new Map(); // "i,j" -> { type, ... }
{
  const add = (type, i, j, where) => {
    const k = i + ',' + j;
    if (PLACE_AT.has(k)) return;
    PLACE_AT.set(k, { type, i, j, where });
  };
  for (const c of CITIES) for (const [type, di, dj] of PLACE_DEFS[c.id]) add(type, c.core[0] + di, c.core[1] + dj, c.name);
  for (const t of TOWNS) {
    const [a, b, c2, d2] = t.rect;
    add('gas', a + 1, b + 1, t.name);
    add('gun', c2 - 1, d2 - 1, t.name);
    add('hospital', a + 1, d2 - 1, t.name);
  }
  // highway crossings out in the country get a gas station on one corner
  for (let i = -N + 8; i < N; i += 8) for (let j = -N + 8; j < N; j += 8) {
    if (hash(i, j, 21) > 0.4) continue;
    const d = district(i, j);
    if (isUrban(d) || isWater(d) || isAir(d) || d === D.MOUNTAIN) continue;
    if (!roadH(i, j) || !roadV(i, j)) continue;
    add('gas', i, j, DISTRICT_NAMES[d]);
  }
}
export const placeAt = (i, j) => PLACE_AT.get(i + ',' + j) || null;

// ------------------------------------------------------------------ one cell
// Returns { boxes (solid, drawn), deco (drawn only), roofs (gable roofs), cyls, trees, lamps, signals,
// water, walk (the pavement loop people walk), spots (gas station, gun shop, hospital, police) }.
// visual: false skips everything the server doesn't need.
export function genCell(i, j, visual = true) {
  const out = { i, j, boxes: [], deco: [], roofs: [], cyls: [], trees: [], lamps: [], signals: [], water: null, walk: null, spots: [], ground: null };
  const d = district(i, j);
  const x0 = i * G, y0 = j * G, x1 = x0 + G, y1 = y0 + G;
  const R = rng(hash(i, j, 77));
  // details that are only drawn take their own random numbers, so walls come out the same with or without them
  const RV = rng(hash(i, j, 78));
  const box = (ax, ay, az, bx, by, bz, mat) => out.boxes.push({ mins: [Math.min(ax, bx), Math.min(ay, by), Math.min(az, bz)], maxs: [Math.max(ax, bx), Math.max(ay, by), Math.max(az, bz)], mat });
  const deco = visual ? (ax, ay, az, bx, by, bz, mat) => out.deco.push({ mins: [Math.min(ax, bx), Math.min(ay, by), Math.min(az, bz)], maxs: [Math.max(ax, bx), Math.max(ay, by), Math.max(az, bz)], mat }) : () => {};
  const tree = visual ? (x, y, z, h, r, kind) => out.trees.push({ x, y, z, h, r, kind }) : () => {};
  const L = roadV(i, j), Rr = roadV(i + 1, j), B = roadH(i, j), T = roadH(i, j + 1);
  const urban = isUrban(d);

  // ---- ground
  if (isWater(d)) {
    out.water = [x0, y0, x1, y1, -30];
    // decks under any road along this cell's edges (bridges and seafront avenues), with rails on the water side
    const deck = (ax, ay, bx, by) => { box(ax, ay, -40, bx, by, 0, 'concrete'); };
    const rail = (ax, ay, bx, by) => { box(ax, ay, 0, bx, by, 40, 'concrete'); };
    const cl = B ? RW : 0, ct = T ? RW : 0, cL = L ? RW : 0, cR = Rr ? RW : 0;
    if (L) { deck(x0, y0, x0 + RW, y1); rail(x0 + RW, y0 + cl + (B ? 0 : 0), x0 + RW + 12, y1 - ct); }
    if (Rr) { deck(x1 - RW, y0, x1, y1); rail(x1 - RW - 12, y0 + cl, x1 - RW, y1 - ct); }
    if (B) { deck(x0, y0, x1, y0 + RW); rail(x0 + cL, y0 + RW, x1 - cR, y0 + RW + 12); }
    if (T) { deck(x0, y1 - RW, x1, y1); rail(x0 + cL, y1 - RW - 12, x1 - cR, y1 - RW); }
    // bridge piers
    if (visual) {
      if (L || Rr) for (let y = y0 + 256; y < y1; y += 512) { if (L) deco(x0 - 40, y - 30, -600, x0 + 40, y + 30, -40, 'concrete'); if (Rr) deco(x1 - 40, y - 30, -600, x1 + 40, y + 30, -40, 'concrete'); }
      if (B || T) for (let x = x0 + 256; x < x1; x += 512) { if (B) deco(x - 30, y0 - 40, -600, x + 30, y0 + 40, -40, 'concrete'); if (T) deco(x - 30, y1 - 40, -600, x + 30, y1 + 40, -40, 'concrete'); }
    }
  } else {
    const gmat = isAir(d) ? (d === D.AIRBASE ? 'sand' : 'grass') : urban ? 'asphalt' : d === D.DESERT || d === D.BEACH ? 'sand' : d === D.MOUNTAIN ? 'rock' : d === D.FOREST ? 'forest' : d === D.FARM ? 'soil' : 'grass';
    box(x0, y0, -64, x1, y1, 0, gmat);
    out.ground = gmat;
    // country roads are drawn on top of the grass and sand
    if (!urban) {
      if (L) deco(x0, y0, 0, x0 + RW, y1, 0.6, 'asphalt');
      if (Rr) deco(x1 - RW, y0, 0, x1, y1, 0.6, 'asphalt');
      if (B) deco(x0, y0, 0, x1, y0 + RW, 0.6, 'asphalt');
      if (T) deco(x0, y1 - RW, 0, x1, y1, 0.6, 'asphalt');
    }
  }

  // ---- markings for the roads on this cell's left and bottom edges (each line belongs to one cell)
  if (visual) {
    const mark = (axis, at, from, to, kind) => {
      const z = 0.8;
      if (kind === 1) {
        // town street: double yellow line
        for (const s of [-1, 1]) axis === 'x' ? deco(at + s * 4, from, 0, at + s * 9, to, z, 'yline') : deco(from, at + s * 4, 0, to, at + s * 9, z, 'yline');
      } else {
        // highway: dashed yellow down the middle, white lines at the edges
        for (let t = from + 60; t < to - 120; t += 240) axis === 'x' ? deco(at - 3, t, 0, at + 3, t + 120, z, 'yline') : deco(t, at - 3, 0, t + 120, at + 3, z, 'yline');
        for (const s of [-1, 1]) axis === 'x' ? deco(at + s * (RW - 16), from, 0, at + s * (RW - 10), to, z, 'line') : deco(from, at + s * (RW - 16), 0, to, at + s * (RW - 10), z, 'line');
      }
    };
    const crossAt = (ni, nj) => exits(ni, nj).length > 2 || (exits(ni, nj).some((e) => e % 2 === 0) && exits(ni, nj).some((e) => e % 2 === 1));
    if (L) mark('x', x0, y0 + (crossAt(i, j) ? RW : 0), y1 - (crossAt(i, j + 1) ? RW : 0), L);
    if (B) mark('y', y0, x0 + (crossAt(i, j) ? RW : 0), x1 - (crossAt(i + 1, j) ? RW : 0), B);
    // zebra crossings and traffic lights at this cell's bottom-left node
    if (hasSignal(i, j)) {
      out.signals.push({ i, j, x: x0, y: y0 });
      for (const dd of exits(i, j)) {
        const [dx, dy] = DIRS[dd];
        for (let k = -RW + 20; k < RW - 20; k += 40) {
          if (dx) deco(x0 + dx * (RW + 10), y0 + k, 0, x0 + dx * (RW + 70), y0 + k + 22, 0.8, 'line');
          else deco(x0 + k, y0 + dy * (RW + 10), 0, x0 + k + 22, y0 + dy * (RW + 70), 0.8, 'line');
        }
        // stop line across the lane coming in
        const [rx, ry] = RIGHT[(dd + 2) % 4];
        if (dx) deco(x0 + dx * (RW + 80), y0 + (ry > 0 ? 0 : -RW + 10), 0, x0 + dx * (RW + 92), y0 + (ry > 0 ? RW - 10 : 0), 0.8, 'line');
        else deco(x0 + (rx > 0 ? 0 : -RW + 10), y0 + dy * (RW + 80), 0, x0 + (rx > 0 ? RW - 10 : 0), y0 + dy * (RW + 92), 0.8, 'line');
      }
    }
  }

  if (isWater(d)) return out;

  // ---- the block: pavement and the lot inside it
  const px0 = x0 + (L ? RW : 0), px1 = x1 - (Rr ? RW : 0), py0 = y0 + (B ? RW : 0), py1 = y1 - (T ? RW : 0);
  let lot;
  if (urban) {
    // the pavement, its corners cut back where two roads meet so cars can turn without mounting the kerb
    const n = 50, nBL = L && B ? n : 0, nBR = Rr && B ? n : 0, nTL = L && T ? n : 0, nTR = Rr && T ? n : 0;
    const nl = L ? n : 0, nr = Rr ? n : 0;
    box(px0 + nl, py0, 0, px1 - nr, py1, KERB, 'pave');
    if (nl) box(px0, py0 + nBL, 0, px0 + nl, py1 - nTL, KERB, 'pave');
    if (nr) box(px1 - nr, py0 + nBR, 0, px1, py1 - nTR, KERB, 'pave');
    lot = [px0 + (L ? SWALK : 0), py0 + (B ? SWALK : 0), px1 - (Rr ? SWALK : 0), py1 - (T ? SWALK : 0)];
    if (L && Rr && B && T) out.walk = [x0 + RW + 60, y0 + RW + 60, x1 - RW - 60, y1 - RW - 60];
    // street lamps and trees along the kerb
    if (visual) {
      const along = (ax, ay, bx, by, yaw) => {
        const len = Math.abs(bx - ax) + Math.abs(by - ay), n = Math.max(1, Math.floor(len / 420));
        for (let k = 0; k < n; k++) {
          const f = (k + 0.5) / n, x = ax + (bx - ax) * f, y = ay + (by - ay) * f;
          if (k % 2 === 0) out.lamps.push({ x, y, z: KERB, yaw });
          else if (d !== D.CITY || RV() < 0.5) tree(x, y, KERB, 190 + RV() * 60, 60 + RV() * 20, 'street');
        }
      };
      if (L) along(px0 + 22, py0 + 200, px0 + 22, py1 - 200, 180);
      if (Rr) along(px1 - 22, py0 + 200, px1 - 22, py1 - 200, 0);
      if (B) along(px0 + 200, py0 + 22, px1 - 200, py0 + 22, 270);
      if (T) along(px0 + 200, py1 - 22, px1 - 200, py1 - 22, 90);
    }
  } else {
    lot = [x0 + (L ? RW + 60 : 0), y0 + (B ? RW + 60 : 0), x1 - (Rr ? RW + 60 : 0), y1 - (T ? RW + 60 : 0)];
  }
  const base = urban ? KERB : 0;
  const ctx = { out, box, deco, tree, R, RV, lot, base, i, j, d, visual, edges: { L, R: Rr, B, T } };

  const place = placeAt(i, j);
  if (isAir(d)) airfield(ctx, airfieldAt(i, j));
  else if (place) buildPlace(ctx, place);
  else if (d === D.CITY) cityLot(ctx);
  else if (d === D.SUBURB) suburbLot(ctx);
  else if (d === D.TOWN) townLot(ctx);
  else if (d === D.FARM) farm(ctx);
  else if (d === D.FOREST) forest(ctx);
  else if (d === D.DESERT) desert(ctx);
  else if (d === D.FIELD) field(ctx);
  else if (d === D.BEACH) beach(ctx);
  else if (d === D.MOUNTAIN) mountain(ctx);
  return out;
}

// ------------------------------------------------------------------ lot builders
// which edge of the lot faces a road (for buildings with a front): 'B', 'T', 'L', 'R'
function frontOf(ctx, prefer) {
  const e = ctx.edges;
  for (const s of prefer || ['B', 'T', 'L', 'R']) if (e[s]) return s;
  return 'B';
}
// local frame on a lot: u along the front, v going back from the road. Returns a mapper for rects and points.
function lotFrame(lot, side) {
  const [lx0, ly0, lx1, ly1] = lot;
  const pt = (u, v) => side === 'B' ? [lx0 + u, ly0 + v] : side === 'T' ? [lx1 - u, ly1 - v] : side === 'L' ? [lx0 + v, ly1 - u] : [lx1 - v, ly0 + u];
  const width = side === 'B' || side === 'T' ? lx1 - lx0 : ly1 - ly0;
  const depth = side === 'B' || side === 'T' ? ly1 - ly0 : lx1 - lx0;
  // facing the road (from the building out to the street), in degrees
  const yaw = side === 'B' ? 270 : side === 'T' ? 90 : side === 'L' ? 180 : 0;
  return { pt, width, depth, yaw, rect: (u0, v0, u1, v1) => { const a = pt(u0, v0), b = pt(u1, v1); return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]; } };
}

const FACADES = ['facade', 'curtain', 'brickwin'];
// city colours: Port Halcyon is warm stone and glass, Bayreach cool greys and brick, Sundown pastel stucco
function cityDensity(i, j) {
  const c = cityAt(i, j);
  if (!c) return 0;
  const di = i - c.core[0], dj = j - c.core[1];
  const dc = Math.sqrt(di * di + dj * dj) / c.coreR;
  return Math.max(0, Math.min(1, 1.25 - dc * 0.42));
}

function cityLot(ctx) {
  const { R, lot, i, j } = ctx;
  const rho = cityDensity(i, j);
  const r = R();
  if (r < 0.07 && rho < 0.85) return park(ctx);
  if (r < 0.13 && rho < 0.9) return parkingLot(ctx);
  if (rho > 0.5) return towers(ctx, rho);
  if (rho > 0.18) return midrise(ctx, rho);
  return lowrise(ctx);
}

function towers(ctx, rho) {
  const { R, lot, box, deco, base } = ctx;
  const [lx0, ly0, lx1, ly1] = lot;
  const mat = FACADES[(R() * 2) | 0];
  const tower = (ax, ay, bx, by, h) => {
    // a podium with shops, the shaft, one or two setbacks and a crown
    const podium = 260 + ((R() * 2) | 0) * 150;
    box(ax, ay, base, bx, by, base + podium, R() < 0.5 ? 'facade' : 'brickwin');
    let inset = 60 + R() * 80, z = base + podium;
    const tiers = h > 3500 ? 3 : 2;
    for (let t = 0; t < tiers; t++) {
      const top = t === tiers - 1 ? base + h : z + (base + h - z) * (t === 0 ? 0.65 : 0.6);
      if (bx - ax - inset * 2 < 200 || by - ay - inset * 2 < 200) break;
      box(ax + inset, ay + inset, z, bx - inset, by - inset, top, mat);
      if (ctx.visual) deco(ax + inset - 6, ay + inset - 6, top - 14, bx - inset + 6, by - inset + 6, top, 'concrete'); // cornice
      z = top;
      inset += 90 + R() * 70;
    }
    // roof clutter: plant rooms, a water tank, an aerial on the tallest
    if (ctx.visual) {
      const cx = (ax + bx) / 2, cy = (ay + by) / 2;
      deco(cx - 120, cy - 90, z, cx + 60, cy + 90, z + 110, 'metal');
      deco(cx + 80, cy - 50, z, cx + 160, cy + 30, z + 60, 'metal');
      if (h > 4000) { deco(cx - 6, cy - 6, z + 110, cx + 6, cy + 6, z + 700, 'metal'); deco(cx - 10, cy - 10, z + 690, cx + 10, cy + 10, z + 710, 'neon'); }
    }
  };
  const tall = 1300 + rho * rho * 5600;
  if (R() < 0.55) tower(lx0 + 40, ly0 + 40, lx1 - 40, ly1 - 40, tall * (0.6 + R() * 0.4));
  else {
    const mx = (lx0 + lx1) / 2, my = (ly0 + ly1) / 2;
    for (const [ax, ay, bx, by] of [[lx0, ly0, mx - 40, my - 40], [mx + 40, ly0, lx1, my - 40], [lx0, my + 40, mx - 40, ly1], [mx + 40, my + 40, lx1, ly1]]) {
      if (R() < 0.15) { if (ctx.visual) plazaPatch(ctx, ax, ay, bx, by); continue; }
      tower(ax + 20, ay + 20, bx - 20, by - 20, (900 + rho * 3600) * (0.5 + R() * 0.5));
    }
  }
}

function plazaPatch(ctx, ax, ay, bx, by) {
  const { deco, tree, base } = ctx;
  deco(ax, ay, base, bx, by, base + 0.5, 'tile');
  const cx = (ax + bx) / 2, cy = (ay + by) / 2;
  deco(cx - 80, cy - 80, base, cx + 80, cy + 80, base + 30, 'stone');
  for (const [x, y] of [[ax + 80, ay + 80], [bx - 80, ay + 80], [ax + 80, by - 80], [bx - 80, by - 80]]) tree(x, y, base, 200, 70, 'street');
}

// shops along the street fronts: awnings and signs at the bottom, a few floors on top
function shopFront(ctx, side, u0, u1, depth, h, mat) {
  const { lot, box, deco, R, base } = ctx;
  const f = lotFrame(lot, side);
  const r = f.rect(u0, 0, u1, depth);
  box(r[0], r[1], base, r[2], r[3], base + h, mat);
  if (!ctx.visual) return;
  // awning over the pavement and a lit sign
  const a = f.rect(u0 + 30, -70, u1 - 30, 0);
  deco(a[0], a[1], base + 150, a[2], a[3], base + 160, 'awning');
  const s = f.rect(u0 + 60, -6, u1 - 60, 0);
  if (ctx.RV() < 0.7) deco(s[0], s[1], base + 172, s[2], s[3], base + 200, 'neon');
  // roof edge
  deco(r[0] - 4, r[1] - 4, base + h, r[2] + 4, r[3] + 4, base + h + 16, 'concrete');
}

function midrise(ctx, rho) {
  const { lot, R, box, deco } = ctx;
  const [lx0, ly0, lx1, ly1] = lot;
  const depth = 380 + R() * 140;
  const mats = ['brickwin', 'facade', 'brickwin', 'stuccowin'];
  // buildings along each street edge, split into two or three
  for (const side of ['B', 'T']) {
    const f = lotFrame(lot, side);
    let u = 0;
    while (u < f.width - 100) {
      const w = Math.min(f.width - u, 360 + R() * 420);
      shopFront(ctx, side, u, u + w, depth, 420 + rho * 1400 * (0.5 + R() * 0.5), mats[(R() * 4) | 0]);
      u += w;
    }
  }
  for (const side of ['L', 'R']) {
    const f = lotFrame(lot, side);
    let u = depth;
    while (u < f.width - depth - 100) {
      const w = Math.min(f.width - depth - u, 340 + R() * 360);
      shopFront(ctx, side, u, u + w, depth, 380 + rho * 1200 * (0.5 + R() * 0.5), mats[(R() * 4) | 0]);
      u += w;
    }
  }
  // the courtyard: parking or a garden
  if (ctx.visual) {
    const c = [lx0 + depth, ly0 + depth, lx1 - depth, ly1 - depth];
    if (c[2] - c[0] > 200 && c[3] - c[1] > 200) deco(c[0], c[1], ctx.base, c[2], c[3], ctx.base + 0.5, ctx.RV() < 0.5 ? 'lawn' : 'concrete');
  }
}

function lowrise(ctx) {
  const { lot, R } = ctx;
  const mats = ['stuccowin', 'brickwin', 'stuccowin'];
  // one or two rows of shops facing the streets, parking behind
  const sides = ['B', 'T', 'L', 'R'].filter((s) => ctx.edges[s]);
  let first = true;
  for (const side of sides.slice(0, 2)) {
    const f = lotFrame(lot, side);
    let u = first ? 0 : 520;
    const end = first ? f.width : f.width - 520;
    while (u < end - 200) {
      const w = Math.min(end - u, 300 + R() * 300);
      if (R() < 0.85) shopFront(ctx, side, u, u + w, 360 + R() * 100, 220 + ((R() * 3) | 0) * 120, mats[(R() * 3) | 0]);
      u += w + 40;
    }
    first = false;
  }
  if (ctx.visual) {
    const [lx0, ly0, lx1, ly1] = lot;
    ctx.deco(lx0 + 500, ly0 + 500, ctx.base, lx1 - 500, ly1 - 500, ctx.base + 0.5, 'asphalt');
  }
}

function park(ctx) {
  const { lot, R, deco, tree, box, base } = ctx;
  const [lx0, ly0, lx1, ly1] = lot;
  if (ctx.visual) deco(lx0, ly0, base, lx1, ly1, base + 0.6, 'lawn');
  const cx = (lx0 + lx1) / 2, cy = (ly0 + ly1) / 2;
  // paths crossing the park, a fountain in the middle
  if (ctx.visual) { deco(cx - 50, ly0, base, cx + 50, ly1, base + 1, 'tile'); deco(lx0, cy - 50, base, lx1, cy + 50, base + 1, 'tile'); }
  box(cx - 150, cy - 150, base, cx + 150, cy + 150, base + 34, 'stone');
  if (ctx.visual) {
    deco(cx - 132, cy - 132, base + 34, cx + 132, cy + 132, base + 36, 'water');
    deco(cx - 20, cy - 20, base + 34, cx + 20, cy + 20, base + 120, 'stone');
  }
  for (let k = 0; k < 16; k++) {
    const x = lx0 + 80 + R() * (lx1 - lx0 - 160), y = ly0 + 80 + R() * (ly1 - ly0 - 160);
    if (Math.abs(x - cx) < 110 || Math.abs(y - cy) < 110) continue;
    box(x - 10, y - 10, base, x + 10, y + 10, base + 140, 'bark');
    tree(x, y, base, 300 + R() * 160, 120 + R() * 50, 'oak');
  }
  for (const s of [-1, 1]) for (const t of [-1, 1]) if (ctx.visual) deco(cx + s * 260 - 50, cy + t * 90 - 12, base, cx + s * 260 + 50, cy + t * 90 + 12, base + 22, 'wood'); // benches
}

function parkingLot(ctx) {
  const { lot, deco, box, base } = ctx;
  const [lx0, ly0, lx1, ly1] = lot;
  if (ctx.visual) {
    deco(lx0, ly0, base, lx1, ly1, base + 0.5, 'asphalt');
    for (let x = lx0 + 100; x < lx1 - 100; x += 130) {
      for (const y of [ly0 + 200, ly1 - 420]) deco(x - 3, y, base, x + 3, y + 220, base + 1, 'line');
    }
  }
  box((lx0 + lx1) / 2 - 60, (ly0 + ly1) / 2 - 40, base, (lx0 + lx1) / 2 + 60, (ly0 + ly1) / 2 + 40, base + 100, 'stuccowin'); // pay booth
}

// ---- suburbs: houses with gardens, driveways and gable roofs
const HOUSE_COLORS = ['siding', 'siding2', 'siding3', 'siding4'];
function house(ctx, side, u0, v0, u1, v1) {
  const { lot, box, deco, R, base, out } = ctx;
  const f = lotFrame(lot, side);
  const w = u1 - u0, dpt = v1 - v0;
  const hu0 = u0 + w * 0.15, hu1 = u1 - w * 0.15, hv0 = v0 + dpt * 0.28, hv1 = v1 - dpt * 0.12;
  const r = f.rect(hu0, hv0, hu1, hv1);
  const h = 210 + R() * 40;
  const mat = HOUSE_COLORS[(R() * 4) | 0];
  box(r[0], r[1], base, r[2], r[3], base + h, mat);
  if (!ctx.visual) return;
  // the roof ridge runs along the front
  const along = side === 'B' || side === 'T' ? 'x' : 'y';
  out.roofs.push({ mins: [r[0] - 18, r[1] - 18, base + h], maxs: [r[2] + 18, r[3] + 18, base + h + 90 + ctx.RV() * 30], axis: along, mat: ctx.RV() < 0.5 ? 'roof' : 'roof2' });
  // garden, driveway, front door, a window either side
  const g = f.rect(u0 + 10, v0, u1 - 10, v1 - 10);
  deco(g[0], g[1], base, g[2], g[3], base + 0.5, 'lawn');
  const dw = f.rect(u1 - w * 0.15 - 110, v0, u1 - w * 0.15 - 10, hv0 + 20);
  deco(dw[0], dw[1], base, dw[2], dw[3], base + 1, 'concrete');
  const door = f.rect((hu0 + hu1) / 2 - 22, hv0 - 3, (hu0 + hu1) / 2 + 22, hv0);
  deco(door[0], door[1], base, door[2], door[3], base + 90, 'wood');
  for (const s of [-1, 1]) {
    const c = (hu0 + hu1) / 2 + s * w * 0.2;
    const wr = f.rect(c - 34, hv0 - 2, c + 34, hv0);
    deco(wr[0], wr[1], base + 90, wr[2], wr[3], base + 160, 'glass');
  }
  if (ctx.RV() < 0.5) { const p = f.pt(u0 + w * 0.12, v0 + dpt * 0.15); ctx.tree(p[0], p[1], base, 260 + ctx.RV() * 80, 100, 'oak'); }
  // fence along the back
  const fe = f.rect(u0, v1 - 6, u1, v1);
  deco(fe[0], fe[1], base, fe[2], fe[3], base + 50, 'fence');
}

function suburbLot(ctx) {
  const { lot, R } = ctx;
  if (R() < 0.06) return park(ctx);
  if (R() < 0.08) return lowrise(ctx);
  // houses along the bottom and top streets, back to back
  for (const side of ['B', 'T']) {
    if (!ctx.edges[side]) continue;
    const f = lotFrame(lot, side);
    const n = 3 + ((R() * 2) | 0);
    for (let k = 0; k < n; k++) house(ctx, side, (f.width / n) * k, 0, (f.width / n) * (k + 1), f.depth / 2 - 10);
  }
}

function townLot(ctx) {
  const { R } = ctx;
  if (R() < 0.45) return lowrise(ctx);
  return suburbLot(ctx);
}

// ---- countryside
function clearOfRoads(ctx, x, y, m = 60) {
  const [lx0, ly0, lx1, ly1] = ctx.lot;
  return x > lx0 + m && x < lx1 - m && y > ly0 + m && y < ly1 - m;
}
function farm(ctx) {
  const { lot, R, box, deco, base, out } = ctx;
  const [lx0, ly0, lx1, ly1] = lot;
  const crop = ['corn', 'wheat', 'soil'][(R() * 3) | 0];
  if (ctx.visual) {
    // crop rows (drawn only: you can push through a corn field)
    if (crop === 'corn') for (let y = ly0 + 40; y < ly1 - 40; y += 70) deco(lx0 + 40, y, 0, lx1 - 40, y + 26, 70 + ctx.RV() * 10, 'corn');
    else if (crop === 'wheat') deco(lx0 + 40, ly0 + 40, 0, lx1 - 40, ly1 - 40, 26, 'wheat');
    else for (let y = ly0 + 40; y < ly1 - 40; y += 60) deco(lx0 + 40, y, 0, lx1 - 40, y + 30, 6, 'dirt');
  }
  if (R() < 0.35) {
    // a farmstead in one corner: barn, silo, house
    const cx = lx0 + 500, cy = ly0 + 500;
    box(cx - 260, cy - 180, 0, cx + 260, cy + 180, 280, 'barn');
    if (ctx.visual) out.roofs.push({ mins: [cx - 280, cy - 196, 280], maxs: [cx + 280, cy + 196, 420], axis: 'x', mat: 'roof' });
    box(cx + 320, cy - 90, 0, cx + 500, cy + 90, 640, 'silo');
    if (ctx.visual) out.cyls.push({ x: cx + 410, y: cy, z: 0, r: 92, h: 640, mat: 'silo', cap: 'metal' });
    box(cx - 260, cy + 300, 0, cx + 40, cy + 520, 230, 'siding');
    if (ctx.visual) out.roofs.push({ mins: [cx - 278, cy + 282, 230], maxs: [cx + 58, cy + 538, 330], axis: 'x', mat: 'roof2' });
    if (ctx.visual) for (let k = 0; k < 6; k++) deco(cx - 400 + k * 140, cy - 300, 0, cx - 380 + k * 140, cy - 290, 60, 'fence');
  }
  if (ctx.visual) for (let k = 0; k < 6; k++) { const x = lx0 + 30, y = ly0 + 100 + k * 260; ctx.tree(x, y, 0, 320 + ctx.RV() * 120, 120, 'oak'); }
}

function forest(ctx) {
  const { lot, R, box } = ctx;
  const [lx0, ly0, lx1, ly1] = lot;
  const n = 34 + ((R() * 20) | 0);
  for (let k = 0; k < n; k++) {
    const x = lx0 + R() * (lx1 - lx0), y = ly0 + R() * (ly1 - ly0);
    if (!clearOfRoads(ctx, x, y, 40)) continue;
    const pine = R() < 0.7;
    const h = pine ? 420 + R() * 380 : 300 + R() * 200;
    box(x - 11, y - 11, 0, x + 11, y + 11, 160, 'bark');
    ctx.tree(x, y, 0, h, pine ? 90 + R() * 40 : 140 + R() * 60, pine ? 'pine' : 'oak');
  }
  if (R() < 0.4) { const x = lx0 + 200 + R() * (lx1 - lx0 - 400), y = ly0 + 200 + R() * (ly1 - ly0 - 400); box(x - 60, y - 50, 0, x + 70, y + 60, 60 + R() * 50, 'rock'); }
}

function desert(ctx) {
  const { lot, R, box, deco } = ctx;
  const [lx0, ly0, lx1, ly1] = lot;
  // a mesa now and then: stacked rock that steps in as it climbs
  if (R() < 0.12) {
    let ax = lx0 + 120 + R() * 200, ay = ly0 + 120 + R() * 200, bx = lx1 - 120 - R() * 200, by = ly1 - 120 - R() * 200;
    let z = 0;
    const steps = 2 + ((R() * 3) | 0);
    for (let k = 0; k < steps; k++) {
      const top = z + 300 + R() * 400;
      box(ax, ay, z, bx, by, top, 'rock');
      z = top;
      ax += 60 + R() * 120; ay += 60 + R() * 120; bx -= 60 + R() * 120; by -= 60 + R() * 120;
      if (bx - ax < 200 || by - ay < 200) break;
    }
    return;
  }
  const n = 6 + ((R() * 8) | 0);
  for (let k = 0; k < n; k++) {
    const x = lx0 + R() * (lx1 - lx0), y = ly0 + R() * (ly1 - ly0);
    if (!clearOfRoads(ctx, x, y, 50)) continue;
    if (R() < 0.6) {
      const h = 120 + R() * 110;
      box(x - 9, y - 9, 0, x + 9, y + 9, h, 'cactus');
      if (ctx.visual) { deco(x + 9, y - 6, h * 0.45, x + 34, y + 6, h * 0.55, 'cactus'); deco(x + 24, y - 6, h * 0.55, x + 34, y + 6, h * 0.8, 'cactus'); }
    } else {
      const s = 30 + R() * 80;
      box(x - s, y - s * 0.8, 0, x + s, y + s * 0.8, s * (0.5 + R() * 0.5), 'rock');
    }
  }
  const RV = ctx.RV;
  if (ctx.visual) for (let k = 0; k < 10; k++) { const x = lx0 + RV() * (lx1 - lx0), y = ly0 + RV() * (ly1 - ly0); if (clearOfRoads(ctx, x, y)) ctx.tree(x, y, 0, 40 + RV() * 30, 40 + RV() * 20, 'shrub'); }
}

function field(ctx) {
  const { lot, R, box } = ctx;
  const [lx0, ly0, lx1, ly1] = lot;
  const n = 3 + ((R() * 6) | 0);
  for (let k = 0; k < n; k++) {
    const x = lx0 + R() * (lx1 - lx0), y = ly0 + R() * (ly1 - ly0);
    if (!clearOfRoads(ctx, x, y, 80)) continue;
    box(x - 11, y - 11, 0, x + 11, y + 11, 150, 'bark');
    ctx.tree(x, y, 0, 320 + R() * 160, 150 + R() * 50, 'oak');
  }
  const RV = ctx.RV;
  if (ctx.visual) for (let k = 0; k < 14; k++) { const x = lx0 + RV() * (lx1 - lx0), y = ly0 + RV() * (ly1 - ly0); if (clearOfRoads(ctx, x, y)) ctx.tree(x, y, 0, 50 + RV() * 30, 50 + RV() * 30, 'shrub'); }
  // a billboard by the highway
  if (R() < 0.12 && ctx.edges.B) {
    const x = (lx0 + lx1) / 2, y = ly0 + 40;
    box(x - 180, y - 8, 0, x - 164, y + 8, 300, 'metal'); box(x + 164, y - 8, 0, x + 180, y + 8, 300, 'metal');
    ctx.deco(x - 260, y - 4, 300, x + 260, y + 4, 560, 'billboard');
  }
}

function beach(ctx) {
  const { lot, R, box, deco } = ctx;
  const [lx0, ly0, lx1, ly1] = lot;
  for (let k = 0; k < 5; k++) {
    const x = lx0 + R() * (lx1 - lx0), y = ly0 + R() * (ly1 - ly0);
    if (!clearOfRoads(ctx, x, y, 80)) continue;
    box(x - 8, y - 8, 0, x + 8, y + 8, 300, 'bark');
    ctx.tree(x, y, 0, 360 + R() * 140, 130, 'palm');
  }
  if (R() < 0.3) {
    // a lifeguard tower on stilts
    const x = (lx0 + lx1) / 2, y = (ly0 + ly1) / 2;
    for (const [a, b] of [[-50, -50], [50, -50], [-50, 50], [50, 50]]) box(x + a - 5, y + b - 5, 0, x + a + 5, y + b + 5, 120, 'wood');
    box(x - 70, y - 70, 120, x + 70, y + 70, 130, 'wood');
    box(x - 60, y - 60, 130, x + 60, y + 60, 220, 'siding2');
  }
  const RV = ctx.RV;
  if (ctx.visual) for (let k = 0; k < 6; k++) { const x = lx0 + RV() * (lx1 - lx0), y = ly0 + RV() * (ly1 - ly0); if (clearOfRoads(ctx, x, y)) { deco(x - 2, y - 2, 0, x + 2, y + 2, 90, 'metal'); deco(x - 50, y - 50, 90, x + 50, y + 50, 96, 'awning'); } }
}

function mountain(ctx) {
  const { lot, R, box, i, j } = ctx;
  const [lx0, ly0, lx1, ly1] = lot;
  const di = i + 0.5 - PEAK[0], dj = j + 0.5 - PEAK[1];
  const k = Math.max(0, 1 - (di * di + dj * dj) / (PEAK_R2 + 4));
  const H = 600 + 6800 * k;
  // stacked rock: wide at the bottom, stepping in toward the peak
  let ax = lx0 + 40, ay = ly0 + 40, bx = lx1 - 40, by = ly1 - 40, z = 0;
  const steps = 4;
  for (let s = 0; s < steps; s++) {
    const top = z + H / steps * (0.7 + R() * 0.6);
    box(ax, ay, z, bx, by, top, 'rock');
    z = top;
    // step in on the sides that face away from the peak
    const pull = 90 + R() * 120;
    if (di > 0) bx -= pull; else ax += pull;
    if (dj > 0) by -= pull; else ay += pull;
    if (di * di < 1) { ax += pull * 0.5; bx -= pull * 0.5; }
    if (dj * dj < 1) { ay += pull * 0.5; by -= pull * 0.5; }
    if (bx - ax < 300 || by - ay < 300) break;
  }
  if (k > 0.85 && ctx.visual) ctx.deco((ax + bx) / 2 - 8, (ay + by) / 2 - 8, z, (ax + bx) / 2 + 8, (ay + by) / 2 + 8, z + 600, 'metal'); // the radio mast on top
}

// ------------------------------------------------------------------ airfields
function airfield(ctx, af) {
  const { box, deco, i, j, visual } = ctx;
  const x0 = i * G, y0 = j * G, x1 = x0 + G, y1 = y0 + G;
  const [ai, aj, bi, bj] = af.rect;
  if (j === af.runwayJ) {
    // the runway, with its shoulder up to the apron
    deco(x0, y0 + 600, 0, x1, y1, 0.6, 'asphalt');
    if (visual) {
      for (let x = x0 + 60; x < x1; x += 420) deco(x, y0 + 994, 0, x + 220, y0 + 1006, 0.8, 'line');
      deco(x0, y0 + 640, 0, x1, y0 + 652, 0.8, 'line'); deco(x0, y0 + 1348, 0, x1, y0 + 1360, 0.8, 'line');
      if (i === ai || i === bi) for (let k = 0; k < 8; k++) { const xa = i === ai ? x0 + 120 : x1 - 520; deco(xa, y0 + 690 + k * 80, 0, xa + 400, y0 + 730 + k * 80, 0.8, 'line'); }
      for (let x = x0 + 128; x < x1; x += 512) for (const y of [y0 + 620, y0 + 1380]) deco(x - 6, y - 6, 0, x + 6, y + 6, 10, 'neon');
    }
  } else if (j === af.apronJ) {
    deco(x0, y0, 0, x1, y1 - 200, 0.6, 'concrete');
    if (visual && i > ai && i < bi) for (const x of [512, 1536]) { deco(x0 + x - 4, y0 + 300, 0, x0 + x + 4, y0 + 1500, 0.8, 'yline'); deco(x0 + x - 300, y0 + 1500, 0, x0 + x + 300, y0 + 1508, 0.8, 'yline'); }
  } else if (j === af.hangarJ) {
    deco(x0, y0, 0, x1, y1 - 300, 0.6, 'concrete');
    const mid = Math.floor((ai + bi) / 2);
    if (!af.military && i === mid) {
      // the terminal: a long glass building, with the control tower beside it
      box(x0 + 80, y0 + 500, 0, x1 - 80, y1 - 120, 520, 'curtain');
      if (visual) deco(x0 + 60, y0 + 480, 520, x1 - 60, y1 - 100, 540, 'concrete');
    } else if (!af.military && i === mid + 1) {
      box(x0 + 800, y0 + 900, 0, x0 + 1100, y0 + 1200, 1500, 'concrete');
      box(x0 + 740, y0 + 840, 1500, x0 + 1160, y0 + 1260, 1520, 'concrete');
      if (visual) { deco(x0 + 750, y0 + 850, 1520, x0 + 1150, y0 + 1250, 1680, 'glass'); deco(x0 + 740, y0 + 840, 1680, x0 + 1160, y0 + 1260, 1700, 'concrete'); }
    } else if (i > ai && i < bi) {
      // a hangar, open to the apron
      const hx0 = x0 + 160, hx1 = x1 - 160, hy0 = y0 + 120, hy1 = y0 + 1500, H = 560;
      box(hx0, hy1 - 20, 0, hx1, hy1, H, 'hangar');
      box(hx0, hy0, 0, hx0 + 20, hy1, H, 'hangar'); box(hx1 - 20, hy0, 0, hx1, hy1, H, 'hangar');
      box(hx0, hy0, H - 120, hx1, hy0 + 20, H, 'hangar');
      box(hx0 - 10, hy0 - 10, H, hx1 + 10, hy1 + 10, H + 24, 'hangar');
    }
  } else if (!af.military && j === af.hangarJ + 1 && visual) {
    deco(x0 + 100, y0 + 100, 0, x1 - 100, y1 - 100, 0.5, 'asphalt');
    for (let x = x0 + 200; x < x1 - 200; x += 130) deco(x - 3, y0 + 300, 0, x + 3, y0 + 520, 1, 'line');
  } else if (af.military && j === af.hangarJ + 1) {
    // barracks
    box(x0 + 300, y0 + 400, 0, x1 - 300, y0 + 900, 260, 'precinct');
  }
  if (!af.military) return;
  // the fence round the base, with a gate on the south side
  const H = 300;
  if (i === ai) box(x0, y0, 0, x0 + 16, y1, H, 'chain');
  if (i === bi) box(x1 - 16, y0, 0, x1, y1, H, 'chain');
  if (j === bj) box(x0, y1 - 16, 0, x1, y1, H, 'chain');
  if (j === aj) {
    if (i === af.gateI) { box(x0, y0, 0, x0 + 700, y0 + 16, H, 'chain'); box(x1 - 700, y0, 0, x1, y0 + 16, H, 'chain'); if (visual) deco(x0 + 700, y0 - 4, 120, x1 - 700, y0 + 20, 132, 'hazard'); }
    else box(x0, y0, 0, x1, y0 + 16, H, 'chain');
  }
  // missile launchers on the corners
  for (const [sx, sy] of af.sams) {
    if (Math.floor(sx / G) !== i || Math.floor(sy / G) !== j) continue;
    box(sx - 90, sy - 90, 0, sx + 90, sy + 90, 60, 'concrete');
    if (visual) { deco(sx - 50, sy - 60, 60, sx + 50, sy + 60, 120, 'army'); for (const k of [-30, 0, 30]) deco(sx - 40, sy + k - 9, 120, sx + 70, sy + k + 9, 140, 'metal'); }
  }
}

// ------------------------------------------------------------------ places
function buildPlace(ctx, place) {
  const t = place.type;
  if (t === 'gas') gasStation(ctx, place);
  else if (t === 'gun') gunShop(ctx, place);
  else if (t === 'hospital') hospital(ctx, place);
  else police(ctx, place);
}

// walls of a shop you can walk into: a doorway in the front, windows either side, a roof
function shell(ctx, f, u0, v0, u1, v1, h, mat, door) {
  const { box, deco, base } = ctx;
  const T = 16;
  const r = (a, b, c, e) => f.rect(a, b, c, e);
  const wall = (a, b, c, e, z0 = 0, z1 = h) => { const q = r(a, b, c, e); box(q[0], q[1], base + z0, q[2], q[3], base + z1, mat); };
  // front wall with the door and two windows
  wall(u0, v0, door[0], v0 + T, 0, 40); wall(u0, v0, u0 + 60, v0 + T); wall(door[0] - 60, v0, door[0], v0 + T);
  wall(u0 + 60, v0, door[0] - 60, v0 + T, 150, h);
  wall(door[1], v0, u1, v0 + T, 0, 40); wall(u1 - 60, v0, u1, v0 + T); wall(door[1], v0, door[1] + 60, v0 + T);
  wall(door[1] + 60, v0, u1 - 60, v0 + T, 150, h);
  wall(door[0], v0, door[1], v0 + T, 120, h);
  if (ctx.visual) {
    const g1 = r(u0 + 60, v0 + 4, door[0] - 60, v0 + 12), g2 = r(door[1] + 60, v0 + 4, u1 - 60, v0 + 12);
    deco(g1[0], g1[1], base + 40, g1[2], g1[3], base + 150, 'glass');
    deco(g2[0], g2[1], base + 40, g2[2], g2[3], base + 150, 'glass');
  }
  wall(u0, v1 - T, u1, v1);
  wall(u0, v0, u0 + T, v1); wall(u1 - T, v0, u1, v1);
  const roof = r(u0, v0, u1, v1);
  box(roof[0], roof[1], base + h, roof[2], roof[3], base + h + 14, 'concrete');
  if (ctx.visual) {
    const fl = r(u0 + T, v0 + T, u1 - T, v1 - T);
    deco(fl[0], fl[1], base, fl[2], fl[3], base + 0.6, 'tile');
  }
}

function gasStation(ctx, place) {
  const { lot, box, deco, base, out } = ctx;
  const side = frontOf(ctx);
  const f = lotFrame(lot, side);
  const u = (x) => (x / 1300) * Math.min(f.width, 1300);
  const pt = (a, b, z = 0) => { const p = f.pt(a, b); return [p[0], p[1], base + z]; };
  const rect = (a, b, c, e) => f.rect(a, b, c, e);
  if (ctx.visual) { const fc = rect(0, 0, f.width, 1200); deco(fc[0], fc[1], base, fc[2], fc[3], base + 0.6, 'concrete'); }
  // the canopy over two pump islands
  const can = rect(u(180), 150, u(1020), 560);
  box(can[0], can[1], base + 250, can[2], can[3], base + 276, 'canopy');
  if (ctx.visual) deco(can[0] - 4, can[1] - 4, base + 262, can[2] + 4, can[3] + 4, base + 274, 'neonred');
  for (const a of [u(300), u(900)]) for (const b of [250, 460]) { const q = rect(a - 12, b - 12, a + 12, b + 12); box(q[0], q[1], base, q[2], q[3], base + 250, 'metal'); }
  for (const a of [u(400), u(800)]) {
    const isl = rect(a - 80, 320, a + 80, 390);
    box(isl[0], isl[1], base, isl[2], isl[3], base + 10, 'concrete');
    for (const s of [-1, 1]) { const p = rect(a + s * 40 - 18, 340, a + s * 40 + 18, 370); box(p[0], p[1], base + 10, p[2], p[3], base + 96, 'pump'); }
  }
  // the shop
  const su0 = u(300), su1 = u(1000), sv0 = 750, sv1 = 1150;
  shell(ctx, f, su0, sv0, su1, sv1, 220, 'stuccowin', [(su0 + su1) / 2 - 50, (su0 + su1) / 2 + 50]);
  const mid = (su0 + su1) / 2;
  const counter = rect(mid - 170, 1010, mid + 170, 1050);
  box(counter[0], counter[1], base, counter[2], counter[3], base + 44, 'wood');
  for (const a of [su0 + 40, su1 - 100]) { const sh = rect(a, 800, a + 60, 1100); box(sh[0], sh[1], base, sh[2], sh[3], base + 80, 'shelf'); }
  // the sign by the road
  const pole = rect(f.width - 120, 50, f.width - 100, 70);
  box(pole[0], pole[1], base, pole[2], pole[3], base + 460, 'metal');
  if (ctx.visual) { const sg = rect(f.width - 230, 44, f.width + 10, 76); deco(sg[0], sg[1], base + 360, sg[2], sg[3], base + 480, 'gassign'); }
  const inside = rect(su0 + 16, sv0 + 16, su1 - 16, sv1 - 16);
  out.spots.push({
    type: 'gas', id: place.i + ',' + place.j, name: PLACE_NAMES.gas, where: place.where,
    clerk: pt(mid, 1095), yaw: f.yaw, front: pt(mid, 960), till: pt(mid, 1030, 46),
    inside: { mins: [inside[0], inside[1], base], maxs: [inside[2], inside[3], base + 220] }, door: pt(mid, sv0 - 60),
  });
}

function gunShop(ctx, place) {
  const { lot, box, deco, base, out } = ctx;
  const side = frontOf(ctx);
  const f = lotFrame(lot, side);
  const pt = (a, b, z = 0) => { const p = f.pt(a, b); return [p[0], p[1], base + z]; };
  const rect = (a, b, c, e) => f.rect(a, b, c, e);
  const W0 = Math.min(f.width, 1000);
  const su0 = (f.width - W0) / 2 + 80, su1 = su0 + W0 - 160, sv0 = 120, sv1 = 720;
  shell(ctx, f, su0, sv0, su1, sv1, 260, 'brickwin', [(su0 + su1) / 2 - 55, (su0 + su1) / 2 + 55]);
  const mid = (su0 + su1) / 2;
  const counter = rect(mid - 220, 540, mid + 220, 580);
  box(counter[0], counter[1], base, counter[2], counter[3], base + 46, 'wood');
  if (ctx.visual) {
    const g = rect(mid - 216, 542, mid + 216, 578);
    deco(g[0], g[1], base + 46, g[2], g[3], base + 50, 'glass');
    // racks of guns on the back wall
    for (let k = 0; k < 7; k++) {
      const a = mid - 300 + k * 100;
      for (const z of [90, 140, 190]) { const q = rect(a - 34, sv1 - 22, a + 34, sv1 - 16); deco(q[0], q[1], base + z, q[2], q[3], base + z + 10, 'gunmetal'); }
    }
    const sg = rect(su0 + 120, sv0 - 8, su1 - 120, sv0);
    deco(sg[0], sg[1], base + 180, sg[2], sg[3], base + 240, 'gunsign');
    // the lot in front
    const fc = rect(0, 0, f.width, sv0);
    deco(fc[0], fc[1], base, fc[2], fc[3], base + 0.5, 'concrete');
  }
  out.spots.push({ type: 'gun', id: place.i + ',' + place.j, name: PLACE_NAMES.gun, where: place.where, clerk: pt(mid, 640), yaw: f.yaw, front: pt(mid, 470), door: pt(mid, sv0 - 60) });
}

function hospital(ctx, place) {
  const { lot, box, deco, base, out } = ctx;
  const side = frontOf(ctx);
  const f = lotFrame(lot, side);
  const pt = (a, b, z = 0) => { const p = f.pt(a, b); return [p[0], p[1], base + z]; };
  const rect = (a, b, c, e) => f.rect(a, b, c, e);
  const b1 = rect(120, 520, f.width - 120, f.depth - 60);
  box(b1[0], b1[1], base, b1[2], b1[3], base + 820, 'clinic');
  const b2 = rect(f.width * 0.3, 360, f.width * 0.7, 520);
  box(b2[0], b2[1], base, b2[2], b2[3], base + 260, 'clinic');
  if (ctx.visual) {
    const c = rect(f.width * 0.32, 220, f.width * 0.68, 360);
    deco(c[0], c[1], base + 230, c[2], c[3], base + 246, 'concrete'); // entrance canopy
    const s = rect(f.width / 2 - 70, 512, f.width / 2 + 70, 520);
    deco(s[0], s[1], base + 280, s[2], s[3], base + 420, 'redcross');
    const fc = rect(0, 0, f.width, 520);
    deco(fc[0], fc[1], base, fc[2], fc[3], base + 0.5, 'concrete');
  }
  const back = (f.yaw + 180) % 360;
  out.spots.push({
    type: 'hospital', id: place.i + ',' + place.j, name: PLACE_NAMES.hospital, where: place.where,
    spawns: [pt(f.width / 2 - 120, 300, 1), pt(f.width / 2, 300, 1), pt(f.width / 2 + 120, 300, 1)].map((o) => ({ origin: o, yaw: f.yaw })), back, door: pt(f.width / 2, 280),
  });
}

function police(ctx, place) {
  const { lot, box, deco, base, out } = ctx;
  const side = frontOf(ctx);
  const f = lotFrame(lot, side);
  const pt = (a, b, z = 0) => { const p = f.pt(a, b); return [p[0], p[1], base + z]; };
  const rect = (a, b, c, e) => f.rect(a, b, c, e);
  const b1 = rect(160, 640, f.width - 160, f.depth - 80);
  box(b1[0], b1[1], base, b1[2], b1[3], base + 520, 'precinct');
  if (ctx.visual) {
    const s = rect(f.width / 2 - 200, 632, f.width / 2 + 200, 640);
    deco(s[0], s[1], base + 380, s[2], s[3], base + 450, 'copsign');
    const fc = rect(0, 0, f.width, 640);
    deco(fc[0], fc[1], base, fc[2], fc[3], base + 0.5, 'asphalt');
    for (let k = 0; k < 6; k++) { const a = 200 + k * ((f.width - 400) / 5); const q = rect(a - 3, 380, a + 3, 600); deco(q[0], q[1], base, q[2], q[3], base + 1, 'line'); }
  }
  out.spots.push({ type: 'police', id: place.i + ',' + place.j, name: PLACE_NAMES.police, where: place.where, door: pt(f.width / 2, 560), yaw: f.yaw });
}

// every place with its spot (where the clerk stands, the hospital doors), worked out once
export const PLACES = [];
for (const p of PLACE_AT.values()) {
  const c = genCell(p.i, p.j, false);
  for (const s of c.spots) PLACES.push({ ...s, i: p.i, j: p.j });
}
export const HOSPITALS = PLACES.filter((p) => p.type === 'hospital');

// ------------------------------------------------------------------ helpers for traffic and people
export const cellOf = (v) => Math.floor(v / G);
// the lane point on a road nearest to (x, y) within the cell, or null: { x, y, dir, i, j } where (i, j) is the
// node the lane is heading to
// yaw (optional): prefer lanes going roughly that way
export function nearestLane(x, y, yaw) {
  const i = cellOf(x), j = cellOf(y);
  const fx = x - i * G, fy = y - j * G;
  let best = null, bd = Infinity;
  const consider = (d, px, py, dir, ni, nj) => {
    if (yaw !== undefined) { const off = Math.abs(((yaw - dir * 90) % 360 + 540) % 360 - 180); if (off > 100) d += 900; }
    if (d < bd) { bd = d; best = { x: px, y: py, dir, i: ni, j: nj }; }
  };
  // the four edges of this cell
  if (roadV(i, j)) { const t = Math.max(RW + 40, Math.min(G - RW - 40, fy)); consider(fx, i * G + LANE, j * G + t, 1, i, j + 1); consider(fx + 1, i * G - LANE, j * G + t, 3, i, j); }
  if (roadV(i + 1, j)) { const t = Math.max(RW + 40, Math.min(G - RW - 40, fy)); consider(G - fx, (i + 1) * G + LANE, j * G + t, 1, i + 1, j + 1); consider(G - fx + 1, (i + 1) * G - LANE, j * G + t, 3, i + 1, j); }
  if (roadH(i, j)) { const t = Math.max(RW + 40, Math.min(G - RW - 40, fx)); consider(fy, i * G + t, j * G - LANE, 0, i + 1, j); consider(fy + 1, i * G + t, j * G + LANE, 2, i, j); }
  if (roadH(i, j + 1)) { const t = Math.max(RW + 40, Math.min(G - RW - 40, fx)); consider(G - fy, i * G + t, (j + 1) * G - LANE, 0, i + 1, j + 1); consider(G - fy + 1, i * G + t, (j + 1) * G + LANE, 2, i, j + 1); }
  return best;
}
export const nodePos = (i, j) => [i * G, j * G];
export function worldMapInfo() {
  return { N, G, cities: CITIES.map((c) => ({ name: c.name, rect: c.rect })), towns: TOWNS.map((t) => ({ name: t.name, rect: t.rect })) };
}
