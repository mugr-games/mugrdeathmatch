// Walkable-floor graph of a map: every spot a standing player fits on (one node per grid cell and floor height),
// linked to neighbours you can walk to (up one step or down any drop) and through jump pads.
// Used to lay out spawns and items, and by the server's bots and zombies to find their way around.
import { MV } from './pmove.js';
import { BoxWorld } from './collide.js';

const HMIN = [-16, -16, 0], HMAX = [16, 16, 72];

// world: BoxWorld to test against; bounds [[x,y,z],[x,y,z]]; pads: jump pads; skipPads: leave out spots on pads
export function floorGraph(world, bounds, pads = [], { cell = 32, skipPads = false } = {}) {
  const C = cell;
  const [lo, hi] = bounds;
  const nx = Math.ceil((hi[0] - lo[0]) / C), ny = Math.ceil((hi[1] - lo[1]) / C);
  const cols = new Map();
  for (const b of world.boxes) {
    if (b.maxs[2] < lo[2] - 64 || b.maxs[2] > hi[2]) continue;
    const x0 = Math.max(0, Math.ceil((b.mins[0] - lo[0]) / C - 0.5)), x1 = Math.min(nx - 1, Math.floor((b.maxs[0] - lo[0]) / C - 0.5));
    const y0 = Math.max(0, Math.ceil((b.mins[1] - lo[1]) / C - 0.5)), y1 = Math.min(ny - 1, Math.floor((b.maxs[1] - lo[1]) / C - 0.5));
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
      const k = y * nx + x;
      if (!cols.has(k)) cols.set(k, new Set());
      cols.get(k).add(b.maxs[2]);
    }
  }
  const nodes = [], byCol = new Map();
  for (const [k, tops] of cols) {
    const ix = k % nx, iy = (k / nx) | 0, x = lo[0] + (ix + 0.5) * C, y = lo[1] + (iy + 0.5) * C;
    const have = new Set();
    for (const top of tops) {
      let z = top;
      if (world.trace([x, y, z + 1], [x, y, z + 1], HMIN, HMAX).startsolid) {
        // a kerb or step edge running through the cell: stand on top of it instead (else this cell would
        // fit at neither height and cut the floors on either side apart)
        const lift = z + MV.step + 1;
        if (world.trace([x, y, lift], [x, y, lift], HMIN, HMAX).startsolid) continue;
        const down = world.trace([x, y, lift], [x, y, z - 4], HMIN, HMAX);
        if (down.fraction === 1) continue;
        z = Math.round(down.endpos[2]);
      } else if (world.trace([x, y, z + 1], [x, y, z - 4], HMIN, HMAX).fraction === 1) continue;
      if (have.has(z)) continue;
      have.add(z);
      if (skipPads && pads.some((p) => x > p.mins[0] - 24 && x < p.maxs[0] + 24 && y > p.mins[1] - 24 && y < p.maxs[1] + 24 && Math.abs(z - p.maxs[2]) < 40)) continue;
      const n = { i: nodes.length, x, y, z: z + 1, ix, iy, n: [] };
      nodes.push(n);
      if (!byCol.has(k)) byCol.set(k, []);
      byCol.get(k).push(n);
    }
  }
  for (const a of nodes) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      if (!dx && !dy) continue;
      for (const b of byCol.get((a.iy + dy) * nx + a.ix + dx) || []) {
        if (b.z - a.z > MV.step) continue;
        const h = Math.max(a.z, b.z) + 2;
        if (world.trace([a.x, a.y, h], [b.x, b.y, h], HMIN, HMAX).fraction < 1) continue;
        a.n.push(b.i);
      }
    }
  }
  const g = { nodes, byCol, nx, ny, lo, C };
  // jump pads link the pad to wherever it throws you
  for (const p of pads) {
    const from = nearestNode(g, [(p.mins[0] + p.maxs[0]) / 2, (p.mins[1] + p.maxs[1]) / 2, p.maxs[2]], true);
    const to = nearestNode(g, p.to, true);
    if (from && to) from.n.push(to.i);
  }
  return g;
}

// The node under (or nearest to) a position. Fast path: the grid cell itself and its neighbours.
export function nearestNode(g, p, slow = false) {
  const ix = Math.floor((p[0] - g.lo[0]) / g.C), iy = Math.floor((p[1] - g.lo[1]) / g.C);
  let best = null, bd = Infinity;
  for (let r = 0; r <= 2 && !best; r++) {
    for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      for (const n of g.byCol.get((iy + dy) * g.nx + ix + dx) || []) {
        // prefer the floor you're standing on: below the feet counts less than above the head
        const dz = n.z - p[2];
        const d = (n.x - p[0]) ** 2 + (n.y - p[1]) ** 2 + (dz > 30 ? dz * 6 : dz * 1.5) ** 2;
        if (d < bd) { bd = d; best = n; }
      }
    }
  }
  if (best || !slow) return best;
  for (const n of g.nodes) {
    const d = (n.x - p[0]) ** 2 + (n.y - p[1]) ** 2 + ((n.z - p[2]) * 2) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

// Navigation for the server: the floor graph of a map with its doors (boxes that open later) left out, and
// every link that passes through a door tagged, so searches can skip closed doors.
export function buildNav(boxes, pads, bounds, doors = []) {
  const world = new BoxWorld(boxes, pads);
  const g = floorGraph(world, bounds, pads);
  g.edgeDoor = g.nodes.map((a) => a.n.map((j) => {
    const b = g.nodes[j];
    for (let d = 0; d < doors.length; d++) {
      const { mins, maxs } = doors[d];
      // the hull swept from a to b overlaps the door box
      if (Math.max(a.x, b.x) + 16 > mins[0] && Math.min(a.x, b.x) - 16 < maxs[0] && Math.max(a.y, b.y) + 16 > mins[1] && Math.min(a.y, b.y) - 16 < maxs[1] && Math.max(a.z, b.z) + 72 > mins[2] && Math.min(a.z, b.z) < maxs[2]) return d;
    }
    return -1;
  }));
  return g;
}

// Steps from every node to the nearest source (breadth first). open(door) says whether a door can be passed.
export function flowField(g, sources, open = () => true) {
  const dist = new Float32Array(g.nodes.length).fill(Infinity);
  const q = new Int32Array(g.nodes.length);
  let head = 0, tail = 0;
  for (const s of sources) if (s && dist[s.i] === Infinity) { dist[s.i] = 0; q[tail++] = s.i; }
  while (head < tail) {
    const i = q[head++], a = g.nodes[i], ed = g.edgeDoor && g.edgeDoor[i];
    for (let k = 0; k < a.n.length; k++) {
      const j = a.n[k];
      if (dist[j] !== Infinity) continue;
      if (ed && ed[k] >= 0 && !open(ed[k])) continue;
      dist[j] = dist[i] + 1;
      q[tail++] = j;
    }
  }
  return dist;
}

// Shortest path of nodes from a to b (A*), or null. maxVisit caps the work on huge maps.
export function findPath(g, a, b, open = () => true, maxVisit = 40000) {
  if (!a || !b) return null;
  const N = g.nodes.length;
  const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
  const heap = [], f = new Float32Array(N);
  const h = (n) => Math.hypot(n.x - b.x, n.y - b.y, n.z - b.z);
  const push = (i) => { heap.push(i); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (f[heap[p]] <= f[heap[c]]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l; if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } }
    return top;
  };
  gs[a.i] = 0; f[a.i] = h(a); push(a.i);
  let visited = 0;
  while (heap.length && visited++ < maxVisit) {
    const i = pop();
    if (closed[i]) continue;
    if (i === b.i) {
      const path = [];
      for (let c = i; c !== -1; c = from[c]) path.push(g.nodes[c]);
      return path.reverse();
    }
    closed[i] = 1;
    const n = g.nodes[i], ed = g.edgeDoor && g.edgeDoor[i];
    for (let k = 0; k < n.n.length; k++) {
      const j = n.n[k];
      if (closed[j] || (ed && ed[k] >= 0 && !open(ed[k]))) continue;
      const m = g.nodes[j];
      const cost = gs[i] + Math.hypot(m.x - n.x, m.y - n.y) + Math.max(0, m.z - n.z);
      if (cost < gs[j]) { gs[j] = cost; from[j] = i; f[j] = cost + h(m); push(j); }
    }
  }
  return null;
}

// Bounds that hold every box (for maps that don't give them)
export function boxBounds(boxes) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], b.mins[k]); hi[k] = Math.max(hi[k], b.maxs[k]); }
  return [lo, hi];
}
