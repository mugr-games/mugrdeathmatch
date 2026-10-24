// Turns a block-built map model (.fbx/.glb) into game data: collision boxes, spawn points and item spots.
// Usage: node tools/build_map.mjs <model> <out.json> [name]
// Surfaces are voxelised at half-block resolution, then merged into as few boxes as possible.
import fs from 'node:fs';

globalThis.self = globalThis;
globalThis.window = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }) };
const THREE = await import('three');
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');

const [, , input, output, name = 'Map'] = process.argv;
const SCALE = 0.4; // model centimetres -> game units (a 1 m block = 40 units; players are 72 tall)
const V = 20; // voxel size: half a block, so slabs and stair steps survive
const NON_SOLID = /ladder/i;

const buf = fs.readFileSync(input);
const root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length), '');
root.updateMatrixWorld(true);

// model space is Y-up; the game is Z-up: (x, y, z) -> (x, -z, y)
const toGame = (v) => [v.x * SCALE, -v.z * SCALE, v.y * SCALE];

const tris = [];
let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
root.traverse((o) => {
  if (!o.isMesh) return;
  const g = o.geometry, pos = g.attributes.position, idx = g.index;
  const n = idx ? idx.count : pos.count;
  const v = new THREE.Vector3();
  const get = (i) => toGame(v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(o.matrixWorld));
  for (let i = 0; i < n; i += 3) {
    const t = [get(i), get(i + 1), get(i + 2)];
    for (const p of t) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); }
    if (!NON_SOLID.test(o.name)) tris.push(t);
  }
});
lo = lo.map((x) => Math.floor(x / V) * V - V);
hi = hi.map((x) => Math.ceil(x / V) * V + V);
const dim = [0, 1, 2].map((k) => Math.round((hi[k] - lo[k]) / V));
const grid = new Uint8Array(dim[0] * dim[1] * dim[2]);
const at = (x, y, z) => (z * dim[1] + y) * dim[0] + x;
const inb = (x, y, z) => x >= 0 && y >= 0 && z >= 0 && x < dim[0] && y < dim[1] && z < dim[2];

// mark the voxel just behind every bit of surface
for (const [a, b, c] of tris) {
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
  const nl = Math.hypot(nx, ny, nz);
  if (nl < 1e-6) continue;
  const n = [nx / nl, ny / nl, nz / nl];
  const len = Math.max(Math.hypot(...e1), Math.hypot(...e2), Math.hypot(c[0] - b[0], c[1] - b[1], c[2] - b[2]));
  const k = Math.max(1, Math.ceil(len / 5));
  for (let i = 0; i <= k; i++) {
    for (let j = 0; j <= k - i; j++) {
      const u = i / k, w = j / k;
      const p = [0, 1, 2].map((d) => a[d] + e1[d] * u + e2[d] * w - n[d] * 4);
      const x = Math.floor((p[0] - lo[0]) / V), y = Math.floor((p[1] - lo[1]) / V), z = Math.floor((p[2] - lo[2]) / V);
      if (inb(x, y, z)) grid[at(x, y, z)] = 1;
    }
  }
}

// greedy merge into boxes
const used = new Uint8Array(grid.length);
const boxes = [];
for (let z = 0; z < dim[2]; z++) for (let y = 0; y < dim[1]; y++) for (let x = 0; x < dim[0]; x++) {
  const i = at(x, y, z);
  if (!grid[i] || used[i]) continue;
  let x1 = x;
  while (x1 + 1 < dim[0] && grid[at(x1 + 1, y, z)] && !used[at(x1 + 1, y, z)]) x1++;
  let y1 = y;
  const rowOk = (yy, zz) => { for (let xx = x; xx <= x1; xx++) if (!grid[at(xx, yy, zz)] || used[at(xx, yy, zz)]) return false; return true; };
  while (y1 + 1 < dim[1] && rowOk(y1 + 1, z)) y1++;
  let z1 = z;
  const layerOk = (zz) => { for (let yy = y; yy <= y1; yy++) if (!rowOk(yy, zz)) return false; return true; };
  while (z1 + 1 < dim[2] && layerOk(z1 + 1)) z1++;
  for (let zz = z; zz <= z1; zz++) for (let yy = y; yy <= y1; yy++) for (let xx = x; xx <= x1; xx++) used[at(xx, yy, zz)] = 1;
  boxes.push([lo[0] + x * V, lo[1] + y * V, lo[2] + z * V, lo[0] + (x1 + 1) * V, lo[1] + (y1 + 1) * V, lo[2] + (z1 + 1) * V]);
}

// invisible boundary so nobody walks off the edge of the model
const [bx0, by0, bz0] = lo, [bx1, by1, bz1] = hi;
const top = bz1 + 400;
boxes.push([bx0 - 64, by0 - 64, bz0 - 64, bx0, by1 + 64, top], [bx1, by0 - 64, bz0 - 64, bx1 + 64, by1 + 64, top]);
boxes.push([bx0, by0 - 64, bz0 - 64, bx1, by0, top], [bx0, by1, bz0 - 64, bx1, by1 + 64, top]);

// Reachable floor: flood-fill from the main ground level using the movement rules (step up one
// half-block, drop down any distance), so wall tops and sealed spaces never get spawns or items.
const air = (x, y, z) => inb(x, y, z) && !grid[at(x, y, z)];
const stand = (x, y, z) => z >= 1 && inb(x, y, z - 1) && grid[at(x, y, z - 1)] && air(x, y, z) && air(x, y, z + 1) && air(x, y, z + 2) && air(x, y, z + 3);
const levels = new Map();
for (let z = 1; z < dim[2] - 4; z++) for (let y = 0; y < dim[1]; y++) for (let x = 0; x < dim[0]; x++) if (stand(x, y, z)) levels.set(z, (levels.get(z) || 0) + 1);
const ground = [...levels].sort((a, b) => b[1] - a[1])[0][0];
let seed = null, best = Infinity;
for (let y = 0; y < dim[1]; y++) for (let x = 0; x < dim[0]; x++) {
  if (!stand(x, y, ground)) continue;
  const d = (x - dim[0] / 2) ** 2 + (y - dim[1] / 2) ** 2;
  if (d < best) { best = d; seed = [x, y, ground]; }
}
const reach = new Uint8Array(grid.length);
const queue = [seed];
reach[at(...seed)] = 1;
while (queue.length) {
  const [x, y, z] = queue.pop();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = x + dx, ny = y + dy;
    for (let nz = z + 1; nz >= Math.max(1, z - 40); nz--) {
      if (!stand(nx, ny, nz)) continue;
      // the column must be open from the landing spot up past our head
      let open = true;
      for (let k = nz; k <= Math.max(z, nz) + 3; k++) if (!air(nx, ny, k)) { open = false; break; }
      if (open && !reach[at(nx, ny, nz)]) { reach[at(nx, ny, nz)] = 1; queue.push([nx, ny, nz]); }
      break;
    }
  }
}

let reached = 0; for (let i = 0; i < reach.length; i++) reached += reach[i];
console.log('ground level', ground, 'z=', lo[2] + ground * V, 'seed', seed, 'reached cells', reached, 'levels', [...levels].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([z, n]) => (lo[2] + z * V) + ':' + n).join(' '));
// spawn/item spots: reachable, with a little room around
const spots = [];
for (let z = 1; z < dim[2] - 5; z++) for (let y = 2; y < dim[1] - 2; y += 2) for (let x = 2; x < dim[0] - 2; x += 2) {
  if (!reach[at(x, y, z)]) continue;
  let ok = true;
  for (let dz = 0; dz < 4 && ok; dz++) for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) if (!air(x + dx, y + dy, z + dz)) ok = false;
  // floor under the centre and most of the cells around it (block edges and stair lips are fine)
  let floor = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (grid[at(x + dx, y + dy, z - 1)]) floor++;
  if (!grid[at(x, y, z - 1)] || floor < 6) ok = false;
  if (ok) spots.push([lo[0] + (x + 0.5) * V, lo[1] + (y + 0.5) * V, lo[2] + z * V]);
}
function spread(list, n, avoid = []) {
  const out = [];
  const taken = avoid.slice();
  if (!list.length) return out;
  out.push(list[(list.length / 2) | 0]);
  taken.push(out[0]);
  while (out.length < n) {
    let best = null, bd = -1;
    for (let i = 0; i < list.length; i += 3) {
      const p = list[i];
      let d = Infinity;
      for (const q of taken) d = Math.min(d, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + ((p[2] - q[2]) * 3) ** 2);
      if (d > bd) { bd = d; best = p; }
    }
    if (!best) break;
    out.push(best);
    taken.push(best);
  }
  return out;
}
const spawnPts = spread(spots, 16);
const itemPts = spread(spots, 18, spawnPts);
const propPts = spread(spots, 10, [...spawnPts, ...itemPts]);
// flag bases: the reachable spots furthest apart along the map's long axis
const long = hi[1] - lo[1] > hi[0] - lo[0] ? 1 : 0;
const byLong = spots.slice().sort((a, b) => a[long] - b[long]);
const flagA = byLong[Math.floor(byLong.length * 0.02)], flagB = byLong[Math.floor(byLong.length * 0.98)];
const kinds = ['health', 'battery', 'shotgun', 'ammo', '357', 'health', 'ar2', 'vial', 'battery', 'ammo', 'shotgun', 'health', 'vial', 'ar2', '357', 'ammo', 'health', 'battery'];

const out = {
  name,
  model: input.replace(/^.*public[\\/]/, '').replace(/\\/g, '/'),
  scale: SCALE,
  bounds: [lo, hi],
  killZ: lo[2] - 200,
  boxes,
  spawns: spawnPts.map((p, i) => ({ origin: [p[0], p[1], p[2] + 1], yaw: (i * 97) % 360 })),
  items: itemPts.map((p, i) => ({ kind: kinds[i % kinds.length], o: [p[0], p[1], p[2]] })),
  props: propPts.map((p, i) => ({ kind: i % 3 === 0 ? 'barrel' : 'crate', o: [p[0], p[1], p[2]] })),
  flags: { red: flagA, blue: flagB },
};
fs.writeFileSync(output, JSON.stringify(out));
console.log(`${name}: ${tris.length} triangles -> grid ${dim.join('x')} -> ${boxes.length} boxes, ${spots.length} standable cells, ${out.spawns.length} spawns, ${out.items.length} items, ${out.props.length} props, flags ${JSON.stringify(out.flags)}`);
console.log('bounds', lo, hi);
