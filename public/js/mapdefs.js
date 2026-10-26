// Maps built in code (original layouts). Each: name, boxes, sun, spawns, items, props, pads, flags, bounds, killZ.
// Units: 1 ≈ 1 inch, Z up. Materials: concrete, plate, metal, panel, hazard, neon.
import { ARENA } from './arena.js';
import { MV } from './pmove.js';
import { BoxWorld } from './collide.js';
import { floorGraph } from './nav.js';
import { ITEM_ROTATION } from './weapons.js';
import { HOSPITALS, HALF } from './citygen.js';

function builder() {
  const B = [];
  const box = (x0, y0, z0, x1, y1, z1, mat = 'concrete') =>
    B.push({ mins: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], maxs: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], mat });
  // straight stairs from (x, y) at z0 climbing along dir, `steps` steps of 16 up and 28 along
  const stairs = (x, y, z0, dir, width, steps, mat = 'plate') => {
    const w = width / 2;
    for (let i = 0; i < steps; i++) {
      const a = i * 28, b = (i + 1) * 28, top = z0 + (i + 1) * 16;
      if (dir === '+x') box(x + a, y - w, z0, x + b, y + w, top, mat);
      if (dir === '-x') box(x - a, y - w, z0, x - b, y + w, top, mat);
      if (dir === '+y') box(x - w, y + a, z0, x + w, y + b, top, mat);
      if (dir === '-y') box(x - w, y - a, z0, x + w, y - b, top, mat);
    }
  };
  return { B, box, stairs };
}

const sp = (x, y, z, yaw) => ({ origin: [x, y, z + 1], yaw });
const it = (kind, x, y, z) => ({ kind, o: [x, y, z] });

// Launch velocity that carries a player from `from` to `to` (feet positions) with the given upward speed.
function padVel(from, to, vz) {
  const g = MV.gravity, h = to[2] - from[2];
  const t = (vz + Math.sqrt(Math.max(0, vz * vz - 2 * g * h))) / g;
  return [(to[0] - from[0]) / t, (to[1] - from[1]) / t, vz];
}
function pad(x, y, z, to, vz = 650, r = 40) {
  return { mins: [x - r, y - r, z], maxs: [x + r, y + r, z + 4], vel: padVel([x, y, z], to, vz), to };
}

// ------------------------------------------------------------------ Foundry (arena.js) + its extras
const foundry = {
  ...ARENA,
  bounds: [[-ARENA.size, -ARENA.size, 0], [ARENA.size, ARENA.size, 900]],
  killZ: -1000,
  pads: [],
  props: [
    ['barrel', -700, 300, 0], ['barrel', 700, -300, 0], ['crate', -760, 180, 0], ['crate', 760, -180, 0],
    ['barrel', 300, -1450, 0], ['barrel', -300, 1450, 0], ['crate', 1500, 300, 0], ['crate', -1500, -300, 0],
    ['crate', 1450, 360, 0], ['barrel', -1000, 0, 0], ['barrel', 1000, 0, 0],
  ].map(([kind, x, y, z]) => ({ kind, o: [x, y, z] })),
  flags: { red: [-1400, -1400, 0], blue: [1400, 1400, 0] },
};

// ------------------------------------------------------------------ Courtyard
const courtyard = (() => {
  const { B, box, stairs } = builder();
  const X = 2000, Y = 1200, H = 760;
  box(-X - 64, -Y - 64, -64, X + 64, Y + 64, 0, 'plate');
  box(-X - 64, -Y - 64, 0, -X, Y + 64, H, 'panel'); box(X, -Y - 64, 0, X + 64, Y + 64, H, 'panel');
  box(-X, -Y - 64, 0, X, -Y, H, 'panel'); box(-X, Y, 0, X, Y + 64, H, 'panel');
  box(-X, -Y, 500, -X + 8, Y, 512, 'neon'); box(X - 8, -Y, 500, X, Y, 512, 'neon');
  // fortresses at both ends: a raised keep with a flag room and two stair approaches
  for (const s of [-1, 1]) {
    const x0 = s * X, x1 = s * (X - 560);
    box(x0, -420, 0, x1, 420, 160, 'concrete'); // keep platform
    box(x0, -420, 160, x1, -380, 330, 'panel'); box(x0, 380, 160, x1, 420, 330, 'panel'); // side walls
    box(x1 - s * 40, -420, 160, x1, -130, 330, 'panel'); box(x1 - s * 40, 130, 160, x1, 420, 330, 'panel'); // front wall with doorway
    box(x1 - s * 40, -130, 270, x1, 130, 330, 'panel');
    box(x0, -420, 330, x1, 420, 346, 'metal'); // roof
    box(x1 - s * 4, -130, 300, x1, 130, 306, 'neon');
    stairs(x1 - s * 10 * 28 - s * 0, -560, 0, s > 0 ? '+x' : '-x', 120, 10);
    stairs(x1 - s * 10 * 28, 560, 0, s > 0 ? '+x' : '-x', 120, 10);
    box(x1, -620, 0, x1 + s * 0.01, -500, 160, 'concrete'); // keeps the stair tops flush
    box(x1 - s * 4, -620, 0, x1, 620, 160, 'concrete'); // keep face
    box(x0, -620, 0, x1, -420, 160, 'concrete'); box(x0, 420, 0, x1, 620, 160, 'concrete'); // landings
  }
  // colonnades with upper galleries along both long walls
  for (const s of [-1, 1]) {
    const yIn = s * (Y - 260);
    box(-1400, s * Y, 256, 1400, yIn, 272, 'plate'); // gallery floor
    box(-1400, yIn - s * 8, 272, 1400, yIn, 312, 'metal'); // railing
    for (let x = -1300; x <= 1300; x += 260) box(x - 24, yIn - s * 0, 0, x + 24, yIn + s * 48, 256, 'concrete'); // pillars
    stairs(-1400 - 0, s * (Y - 130), 0, '-x', 120, 16);
    stairs(1400, s * (Y - 130), 0, '+x', 120, 16);
    box(-1400 - 16 * 28, s * Y, 0, -1400, s * (Y - 70), 256, 'concrete'); // stair support walls
    box(1400, s * Y, 0, 1400 + 16 * 28, s * (Y - 70), 256, 'concrete');
  }
  // two bridges across the middle between the galleries
  for (const x of [-500, 500]) {
    box(x - 80, -(Y - 260), 256, x + 80, Y - 260, 272, 'plate');
    box(x - 80, -(Y - 260), 272, x - 72, Y - 260, 304, 'metal'); box(x + 72, -(Y - 260), 272, x + 80, Y - 260, 304, 'metal');
  }
  // central plinth and low cover
  box(-160, -160, 0, 160, 160, 64, 'concrete'); box(-150, -150, 64, 150, 150, 72, 'hazard');
  for (const s of [-1, 1]) {
    box(s * 900 - 16, -300, 0, s * 900 + 16, 300, 70, 'concrete');
    box(s * 420 - 120, s * 520 - 16, 0, s * 420 + 120, s * 520 + 16, 70, 'concrete');
    box(s * 1200 - 60, -s * 400 - 60, 0, s * 1200 + 60, -s * 400 + 60, 120, 'metal');
  }
  return {
    name: 'Courtyard', boxes: B, sun: [0.35, -0.5, 0.8], bounds: [[-X, -Y, 0], [X, Y, H]], killZ: -1000, pads: [],
    spawns: [
      sp(-1700, -560, 160, 0), sp(-1700, 560, 160, 0), sp(-1600, 0, 160, 0), sp(-1250, -900, 0, 0), sp(-1250, 900, 0, 0), sp(-800, 0, 0, 0),
      sp(1700, -560, 160, 180), sp(1700, 560, 160, 180), sp(1600, 0, 160, 180), sp(1250, -900, 0, 180), sp(1250, 900, 0, 180), sp(800, 0, 0, 180),
      sp(0, -1050, 272, 90), sp(0, 1050, 272, -90), sp(-500, 0, 272, 0), sp(500, 0, 272, 180),
    ],
    items: [
      it('rpg', 0, 0, 72), it('health', -500, -700, 0), it('health', 500, 700, 0), it('battery', 0, -1050, 272), it('battery', 0, 1050, 272),
      it('sniper', -1400, 1050, 272), it('crossbow', 1400, -1050, 272), it('shotgun', -900, 500, 0), it('ar2', 900, -500, 0),
      it('ammo', -1200, 0, 0), it('ammo', 1200, 0, 0), it('vial', -500, 0, 272), it('vial', 500, 300, 272), it('357', 0, 700, 0),
      it('grenade', 0, -700, 0), it('health', -1700, 0, 160), it('health', 1700, 0, 160), it('ammo', 500, -300, 272),
    ],
    props: [
      ['barrel', -300, -300, 0], ['barrel', 300, 300, 0], ['crate', -700, 250, 0], ['crate', 700, -250, 0], ['crate', -700, 300, 0],
      ['barrel', -1100, -900, 0], ['barrel', 1100, 900, 0], ['crate', 0, -880, 0], ['crate', 0, 880, 0], ['barrel', -1500, -900, 0], ['barrel', 1500, 900, 0],
    ].map(([kind, x, y, z]) => ({ kind, o: [x, y, z] })),
    flags: { red: [-1850, 0, 160], blue: [1850, 0, 160] },
  };
})();

// ------------------------------------------------------------------ Skyline: platforms over a drop, linked by jump pads
const skyline = (() => {
  const { B, box, stairs } = builder();
  const plat = (cx, cy, z, w, d, mat = 'plate') => {
    box(cx - w / 2, cy - d / 2, z - 48, cx + w / 2, cy + d / 2, z, mat);
    box(cx - w / 2, cy - d / 2, z - 56, cx + w / 2, cy + d / 2, z - 48, 'neon');
  };
  // bases at both ends, side islands, and a central tower
  plat(-2200, 0, 0, 800, 900); plat(2200, 0, 0, 800, 900);
  plat(0, 0, 0, 1000, 1000, 'concrete');
  plat(-1000, -1100, 120, 600, 500); plat(1000, 1100, 120, 600, 500);
  plat(-1000, 1100, 120, 600, 500); plat(1000, -1100, 120, 600, 500);
  // base walls (half cover) and flag alcoves
  for (const s of [-1, 1]) {
    const bx = s * 2200;
    box(bx + s * 380, -450, 0, bx + s * 400, 450, 200, 'panel');
    box(bx - 120, -450, 0, bx + 120, -430, 90, 'concrete'); box(bx - 120, 430, 0, bx + 120, 450, 90, 'concrete');
    box(bx - s * 100, -200, 0, bx - s * 120, 200, 70, 'concrete');
    box(bx + s * 200, -120, 0, bx + s * 380, 120, 16, 'hazard');
  }
  // central tower: two floors reached by stairs, a sniper's nest on top
  box(-200, -200, 0, 200, 200, 240, 'concrete');
  box(-220, -220, 240, 220, 220, 256, 'metal');
  stairs(-200 - 15 * 28, -360, 0, '+x', 120, 15);
  box(-200, -420, 0, 200, -300, 240, 'concrete');
  box(-220, -220, 256, -200, 220, 300, 'metal'); box(200, -220, 256, 220, 220, 300, 'metal');
  for (const s of [-1, 1]) box(s * 360 - 60, s * -300 - 60, 0, s * 360 + 60, s * -300 + 60, 80, 'metal');

  const pads = [
    // bases <-> centre
    pad(-1880, 0, 0, [-420, 0, 0]), pad(1880, 0, 0, [420, 0, 0]),
    pad(-420, 120, 0, [-1900, 120, 0]), pad(420, -120, 0, [1900, -120, 0]),
    // centre <-> islands
    pad(-150, -460, 0, [-1000, -1050, 120], 600), pad(300, 420, 0, [1000, 1050, 120], 600),
    pad(-300, 420, 0, [-1000, 1050, 120], 600), pad(300, -420, 0, [1000, -1050, 120], 600),
    // islands -> bases
    pad(-1200, -1100, 120, [-2250, -300, 0], 520), pad(-1200, 1100, 120, [-2250, 300, 0], 520),
    pad(1200, 1100, 120, [2250, 300, 0], 520), pad(1200, -1100, 120, [2250, -300, 0], 520),
    // islands -> centre
    pad(-800, -1000, 120, [-250, -250, 0], 450), pad(800, 1000, 120, [250, 250, 0], 450),
    pad(-800, 1000, 120, [-250, 250, 0], 450), pad(800, -1000, 120, [250, -250, 0], 450),
  ];
  return {
    name: 'Skyline', boxes: B, sun: [0.5, 0.3, 0.8], bounds: [[-2600, -1400, -60], [2600, 1400, 400]], killZ: -500, pads,
    spawns: [
      sp(-2400, -300, 0, 0), sp(-2400, 300, 0, 0), sp(-2100, -350, 0, 0), sp(-2100, 350, 0, 0),
      sp(2400, -300, 0, 180), sp(2400, 300, 0, 180), sp(2100, -350, 0, 180), sp(2100, 350, 0, 180),
      sp(-1000, -1150, 120, 45), sp(1000, 1150, 120, -135), sp(-1000, 1150, 120, -45), sp(1000, -1150, 120, 135),
      sp(0, 380, 0, -90), sp(380, 0, 0, 180), sp(-380, 100, 0, 0), sp(0, 0, 256, 0),
    ],
    items: [
      it('sniper', 0, 0, 256), it('rpg', -430, -455, 0), it('health', -2250, 0, 0), it('health', 2250, 0, 0),
      it('battery', -1000, -1150, 120), it('battery', 1000, 1150, 120), it('crossbow', -1000, 1150, 120), it('shotgun', 1000, -1150, 120),
      it('ammo', -380, -100, 0), it('ammo', 380, 100, 0), it('grenade', 0, 420, 0), it('ar2', -2000, 0, 0), it('357', 2000, 0, 0),
      it('vial', -150, 150, 256), it('health', 150, -150, 256), it('ammo', -2350, 0, 0), it('ammo', 2350, 0, 0), it('vial', 0, 300, 0),
    ],
    props: [
      ['crate', -2050, -250, 0], ['crate', 2050, 250, 0], ['barrel', -2050, 250, 0], ['barrel', 2050, -250, 0],
      ['barrel', 350, 300, 0], ['barrel', -350, -200, 0], ['crate', -1100, -1000, 120], ['crate', 1100, 1000, 120],
    ].map(([kind, x, y, z]) => ({ kind, o: [x, y, z] })),
    flags: { red: [-2450, 0, 16], blue: [2450, 0, 16] },
  };
})();

// ------------------------------------------------------------------ automatic placement
// Spawns, items and props spread over every floor you can walk around on (the floor graph's biggest
// connected region), plus flag bases at the two far ends. Deterministic, so every run gets the same answer.
// Computed on first use: the browser only needs a map's geometry, so it never pays for this.
function autoLayout(m, counts = { spawns: 16, items: 24, props: 8 }, cell = 32) {
  let L = null;
  const layout = () => L || (L = computeLayout(m, counts, cell));
  for (const k of ['spawns', 'items', 'props', 'flags']) Object.defineProperty(m, k, { get: () => layout()[k], enumerable: true, configurable: true });
  return m;
}

function computeLayout(m, counts, cell) {
  const world = new BoxWorld(m.boxes, m.pads);
  const g = floorGraph(world, m.bounds, m.pads, { cell, skipPads: true });
  const { nodes } = g;
  const [lo, hi] = m.bounds;
  // the biggest region you can walk around in
  let main = [];
  const seen = new Uint8Array(nodes.length);
  for (const s of nodes) {
    if (seen[s.i]) continue;
    const comp = [], q = [s.i];
    seen[s.i] = 1;
    while (q.length) {
      const c = q.pop();
      comp.push(c);
      for (const j of nodes[c].n) if (!seen[j]) { seen[j] = 1; q.push(j); }
    }
    if (comp.length > main.length) main = comp;
  }
  // roomy spots only: all eight neighbours are standable at the same height too
  const at = new Set(main.map((i) => `${nodes[i].ix},${nodes[i].iy},${nodes[i].z}`));
  const roomy = main.map((i) => nodes[i]).filter((n) => {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (!at.has(`${n.ix + dx},${n.iy + dy},${n.z}`)) return false;
    return true;
  });
  const cx = (lo[0] + hi[0]) / 2, cy = (lo[1] + hi[1]) / 2;
  const step = Math.max(2, Math.round(roomy.length / 4000)); // big maps: sample candidates
  const spread = (n, taken) => {
    const out = [];
    while (out.length < n) {
      let pick = null, bd = -Infinity;
      for (let i = 0; i < roomy.length; i += step) {
        const p = roomy[i];
        let d = taken.length ? Infinity : -((p.x - cx) ** 2 + (p.y - cy) ** 2);
        for (const q of taken) d = Math.min(d, (p.x - q.x) ** 2 + (p.y - q.y) ** 2 + ((p.z - q.z) * 3) ** 2);
        if (d > bd) { bd = d; pick = p; }
      }
      if (!pick) break;
      out.push(pick);
      taken.push(pick);
    }
    return out;
  };
  const long = hi[0] - lo[0] >= hi[1] - lo[1] ? 'x' : 'y';
  const sorted = roomy.slice().sort((a, b) => a[long] - b[long]);
  const red = sorted[Math.floor(sorted.length * 0.02)], blue = sorted[Math.floor(sorted.length * 0.98)];
  const taken = [red, blue];
  const spawns = spread(counts.spawns, taken), items = spread(counts.items, taken), props = spread(counts.props, taken);
  const toward = (p) => (Math.atan2(cy - p.y, cx - p.x) * 180) / Math.PI;
  return {
    spawns: spawns.map((p) => ({ origin: [p.x, p.y, p.z], yaw: Math.round(toward(p)) })),
    items: items.map((p, i) => ({ kind: ITEM_ROTATION[i % ITEM_ROTATION.length], o: [p.x, p.y, p.z - 1] })),
    props: props.map((p, i) => ({ kind: i % 3 === 0 ? 'barrel' : 'crate', o: [p.x, p.y, p.z - 1] })),
    flags: { red: [red.x, red.y, red.z - 1], blue: [blue.x, blue.y, blue.z - 1] },
  };
}

// floor, four walls and a lit band around a rectangular play space
function shell(box, X, Y, H, wall = 'panel', floor = 'plate', trim = 520) {
  if (floor) box(-X - 64, -Y - 64, -64, X + 64, Y + 64, 0, floor);
  box(-X - 64, -Y - 64, 0, -X, Y + 64, H, wall); box(X, -Y - 64, 0, X + 64, Y + 64, H, wall);
  box(-X, -Y - 64, 0, X, -Y, H, wall); box(-X, Y, 0, X, Y + 64, H, wall);
  if (trim) {
    box(-X, -Y, trim, -X + 8, Y, trim + 12, 'neon'); box(X - 8, -Y, trim, X, Y, trim + 12, 'neon');
    box(-X, -Y, trim, X, -Y + 8, trim + 12, 'neon'); box(-X, Y - 8, trim, X, Y, trim + 12, 'neon');
  }
}

// ------------------------------------------------------------------ Warehouse: shelving aisles, a mezzanine catwalk and a loading dock
const warehouse = (() => {
  const { B, box, stairs } = builder();
  const X = 1800, Y = 1400;
  shell(box, X, Y, 640, 'panel', 'concrete', 560);
  // three rows of tall racks with gaps to run through
  for (const y of [-650, 0, 650]) for (const [a, b] of [[-1300, -700], [-450, 450], [700, 1300]]) {
    box(a, y - 40, 0, b, y + 40, 220, 'metal');
    box(a, y - 44, 216, b, y + 44, 224, 'hazard');
  }
  // mezzanine along both long walls, stairs at the ends
  for (const s of [-1, 1]) {
    const yIn = s * (Y - 170);
    box(-1500, s * Y, 256, 1500, yIn, 272, 'plate');
    box(-1500, yIn - s * 8, 272, 1500, yIn, 308, 'metal');
    stairs(-1500, s * (Y - 85), 0, '-x', 120, 16);
    stairs(1500, s * (Y - 85), 0, '+x', 120, 16);
    for (const x of [-1000, -300, 400, 1100]) box(x - 20, yIn, 0, x + 20, yIn + s * 40, 256, 'metal');
  }
  // loading dock: a raised bay with a few steps, and two stacks of pallets
  box(-X, -500, 0, -X + 420, 500, 64, 'concrete');
  stairs(-X + 420 + 4 * 28, 0, 0, '-x', 300, 4);
  box(X - 300, -1100, 0, X, -800, 120, 'metal');
  box(X - 300, 800, 0, X, 1100, 120, 'metal');
  return autoLayout({ name: 'Warehouse', boxes: B, sun: [0.3, -0.4, 0.86], bounds: [[-X, -Y, 0], [X, Y, 640]], killZ: -1000, pads: [] });
})();

// ------------------------------------------------------------------ Rooftops: roofs over a drop, plank bridges, pads to a central tower
const rooftops = (() => {
  const { B, box, stairs } = builder();
  const S = 800, half = 300; // roof centres 800 apart, roofs 600 wide
  for (const gx of [-1, 0, 1]) for (const gy of [-1, 0, 1]) {
    const cx = gx * S, cy = gy * S;
    box(cx - half, cy - half, -600, cx + half, cy + half, 0, gx === 0 && gy === 0 ? 'concrete' : 'plate');
    // parapets with gaps where the bridges arrive
    for (const sy of [-1, 1]) {
      box(cx - half, cy + sy * half - (sy > 0 ? 12 : 0), 0, cx - 50, cy + sy * half + (sy < 0 ? 12 : 0), 36, 'metal');
      box(cx + 50, cy + sy * half - (sy > 0 ? 12 : 0), 0, cx + half, cy + sy * half + (sy < 0 ? 12 : 0), 36, 'metal');
    }
    if (gx || gy) {
      box(cx - 70, cy - 70, 0, cx + 70, cy + 70, 72, 'metal'); // rooftop vent
      // water tank stand on the outer corner, away from the jump pads that face the middle
      const tx = gx || 1, ty = gy || -1;
      box(cx + tx * 150, cy + ty * 140, 0, cx + tx * 230, cy + ty * 220, 120, 'panel');
    }
  }
  // plank bridges between neighbouring roofs
  for (const g of [-1, 0, 1]) for (const k of [-1, 0]) {
    box(k * S + half, g * S - 40, -8, (k + 1) * S - half, g * S + 40, 0, 'plate');
    box(g * S - 40, k * S + half, -8, g * S + 40, (k + 1) * S - half, 0, 'plate');
  }
  // central tower with stairs, and pads from the corner roofs up to it
  box(-160, -160, 0, 160, 160, 288, 'concrete');
  box(-170, -170, 288, 170, 170, 300, 'metal');
  stairs(-160 - 18 * 28, -230, 0, '+x', 120, 18);
  box(-160, -290, 0, 160, -170, 288, 'concrete');
  const pads = [];
  for (const gx of [-1, 1]) for (const gy of [-1, 1]) pads.push(pad(gx * S - gx * 180, gy * S - gy * 180, 0, [gx * 60, gy * 60, 300], 820));
  return autoLayout({ name: 'Rooftops', boxes: B, sun: [-0.5, 0.25, 0.82], bounds: [[-S - half, -S - half, -40], [S + half, S + half, 320]], killZ: -500, pads });
})();

// ------------------------------------------------------------------ Bunker: nine rooms joined by doorways
const bunker = (() => {
  const { B, box, stairs } = builder();
  const R = 700, X = R * 1.5;
  shell(box, X, X, 420, 'concrete', 'concrete', 360);
  // interior walls on the room grid, each with a doorway in the middle of every room edge
  for (const k of [-0.5, 0.5]) {
    for (let r = -1; r <= 1; r++) {
      const a = r * R - R / 2, b = r * R + R / 2, door = r * R;
      box(k * R - 16, a, 0, k * R + 16, door - 80, 240, 'panel'); box(k * R - 16, door + 80, 0, k * R + 16, b, 240, 'panel');
      box(k * R - 16, door - 80, 150, k * R + 16, door + 80, 240, 'panel');
      box(a, k * R - 16, 0, door - 80, k * R + 16, 240, 'panel'); box(door + 80, k * R - 16, 0, b, k * R + 16, 240, 'panel');
      box(door - 80, k * R - 16, 150, door + 80, k * R + 16, 240, 'panel');
    }
  }
  // centre room: a raised platform with stairs on two sides
  box(-180, -180, 0, 180, 180, 96, 'metal');
  stairs(-180 - 6 * 28, 0, 0, '+x', 120, 6);
  stairs(180 + 6 * 28, 0, 0, '-x', 120, 6);
  // cover in the outer rooms
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    box(sx * R - 150, sy * R - 16, 0, sx * R + 150, sy * R + 16, 64, 'hazard');
    box(sx * R + sx * 200 - 40, sy * R - sy * 200 - 40, 0, sx * R + sx * 200 + 40, sy * R - sy * 200 + 40, 110, 'metal');
  }
  for (const s of [-1, 1]) {
    box(s * R - 16, -150, 0, s * R + 16, 150, 64, 'hazard');
    box(-150, s * R - 16, 0, 150, s * R + 16, 64, 'hazard');
  }
  return autoLayout({ name: 'Bunker', boxes: B, sun: [0.2, 0.45, 0.87], bounds: [[-X, -X, 0], [X, X, 420]], killZ: -1000, pads: [] });
})();

// ------------------------------------------------------------------ Ziggurat: a stepped temple in a pillared plaza
const ziggurat = (() => {
  const { B, box, stairs } = builder();
  const X = 1900;
  shell(box, X, X, 700, 'panel', 'concrete', 600);
  // four terraces, 96 high each, with stairs up the middle of every side
  [1300, 1000, 700, 400].forEach((w, i) => {
    const z0 = i * 96, h = w / 2, reach = h + 6 * 28;
    box(-h, -h, z0, h, h, z0 + 96, i % 2 ? 'concrete' : 'panel');
    box(-h, -h, z0 + 90, h, h, z0 + 96, i === 3 ? 'hazard' : 'concrete');
    stairs(-reach, 0, z0, '+x', 160, 6); stairs(reach, 0, z0, '-x', 160, 6);
    stairs(0, -reach, z0, '+y', 160, 6); stairs(0, reach, z0, '-y', 160, 6);
  });
  box(-60, -60, 384, 60, 60, 400, 'neon'); // beacon on the top
  // a ring of pillars and low walls around the temple
  for (let a = 0; a < 16; a++) {
    const t = (a / 16) * Math.PI * 2, x = Math.cos(t) * 1500, y = Math.sin(t) * 1500;
    box(x - 40, y - 40, 0, x + 40, y + 40, a % 2 ? 300 : 120, a % 2 ? 'concrete' : 'metal');
  }
  for (const s of [-1, 1]) {
    box(s * 1150 - 16, -250, 0, s * 1150 + 16, 250, 70, 'hazard');
    box(-250, s * 1150 - 16, 0, 250, s * 1150 + 16, 70, 'hazard');
  }
  return autoLayout({ name: 'Ziggurat', boxes: B, sun: [-0.35, -0.45, 0.82], bounds: [[-X, -X, 0], [X, X, 700]], killZ: -1000, pads: [] });
})();

// ------------------------------------------------------------------ Docks: two piers over water, bridges, containers, pads across
const docks = (() => {
  const { B, box, stairs } = builder();
  const L = 2300, W = 1000, GAP = 650;
  for (const s of [-1, 1]) {
    const x0 = s * GAP, x1 = s * L;
    box(x0, -W, -600, x1, W, 0, 'plate'); // pier deck
    box(x1, -W, 0, x1 + s * 40, W, 360, 'panel'); // back wall
    box(x0, -W, -600, x1, -W - 40, 120, 'panel'); box(x0, W, -600, x1, W + 40, 120, 'panel'); // side railings
    // shipping containers in rows, some stacked two high
    for (const [cx, cy, stack] of [[1100, -560, 2], [1100, 0, 1], [1100, 560, 2], [1700, -330, 1], [1700, 330, 2]]) {
      const x = s * cx;
      for (let k = 0; k < stack; k++) box(x - 120, cy - 48, k * 96, x + 120, cy + 48, k * 96 + 96, k ? 'metal' : 'panel');
    }
    // stairs up onto the single container in the middle row
    stairs(s * (1100 - 120 - 6 * 28), 0, 0, s > 0 ? '+x' : '-x', 80, 6);
    box(s * 800 - 60, -900, 0, s * 800 + 60, -780, 260, 'metal'); // crane base
  }
  // two bridges across the water
  for (const y of [-650, 650]) {
    box(-GAP, y - 70, -12, GAP, y + 70, 0, 'plate');
    box(-GAP, y - 78, 0, GAP, y - 70, 36, 'metal'); box(-GAP, y + 70, 0, GAP, y + 78, 36, 'metal');
  }
  // a small platform in the middle, reached by pads from both piers
  box(-160, -160, -600, 160, 160, 64, 'concrete');
  const pads = [
    pad(-GAP - 140, 0, 0, [-60, 0, 64], 560), pad(GAP + 140, 0, 0, [60, 0, 64], 560),
    pad(-100, 100, 64, [-GAP - 320, 100, 0], 520), pad(100, -100, 64, [GAP + 320, -100, 0], 520),
  ];
  return autoLayout({ name: 'Docks', boxes: B, sun: [0.45, 0.35, 0.82], bounds: [[-L, -W, -40], [L, W, 400]], killZ: -400, pads });
})();

// ------------------------------------------------------------------ Canyon: a long valley with ledges on both sides, a stone bridge and raised bases at the ends
const canyon = (() => {
  const { B, box, stairs } = builder();
  const X = 2400, Y = 900, V = 500; // valley floor is |y| < V, ledges are V..Y at 160
  box(-X - 64, -Y - 64, -64, X + 64, Y + 64, 0, 'concrete');
  for (const s of [-1, 1]) {
    box(-X, s * V, 0, X, s * Y, 160, 'concrete'); // ledge
    box(-X - 64, s * Y, 0, X + 64, s * (Y + 64), 760, 'panel'); // cliff
    box(s * X, -Y, 0, s * (X + 64), Y, 760, 'panel'); // end cliffs
    // ramps from the valley onto each ledge
    for (const x of [-1500, 300, 1700]) stairs(x * s, s * (V - 280), 0, s > 0 ? '+y' : '-y', 128, 10, 'plate');
    // raised base at each end of the valley
    box(s * 2000, -V, 0, s * X, V, 96, 'metal');
    box(s * 2000, -V, 90, s * (2000 + 12), V, 96, 'hazard');
    stairs(s * (2000 - 6 * 28), 0, 0, s > 0 ? '+x' : '-x', 260, 6);
    // rocks along the ledges for cover
    for (const x of [-1800, -900, -300, 600, 1300]) box(x * s - 60, s * (V + 120), 160, x * s + 60, s * (V + 240), 160 + 70 + ((x / 100) & 1) * 40, 'hazard');
  }
  // stone bridge across the middle, high enough to walk under
  box(-110, -V, 144, 110, V, 160, 'plate');
  box(-110, -V, 160, -100, V, 196, 'metal'); box(100, -V, 160, 110, V, 196, 'metal');
  // boulders and broken pillars in the valley
  for (const [x, y, w, h] of [[-1500, -150, 80, 110], [-1100, 220, 120, 70], [-600, -260, 70, 150], [-450, 120, 60, 60], [500, 250, 90, 130], [800, -180, 120, 64], [1250, 60, 70, 150], [-200, -360, 60, 90], [250, 360, 60, 90]]) {
    box(x - w, y - w, 0, x + w, y + w, h, 'hazard');
  }
  return autoLayout({ name: 'Canyon', boxes: B, sun: [0.55, -0.2, 0.8], bounds: [[-X, -Y, 0], [X, Y, 760]], killZ: -1000, pads: [] });
})();

// ------------------------------------------------------------------ Office: two wings over a double-height atrium, cubicles downstairs, a bridge upstairs
const office = (() => {
  const { B, box, stairs } = builder();
  const X = 1400, Y = 1000, A = 300, F = 192; // atrium is |x| < A, upper floor at F
  shell(box, X, Y, 460, 'panel', 'plate', 420);
  for (const s of [-1, 1]) {
    box(s * A, -Y, F - 16, s * X, Y, F, 'concrete'); // upper floor slab
    // ground floor: a wall down the wing with three doorways
    for (const [a, b] of [[-Y, -580], [-420, -80], [80, 420], [580, Y]]) box(s * 850 - 12, a, 0, s * 850 + 12, b, F - 16, 'panel');
    // cubicles between the atrium and that wall
    for (const y of [-700, -350, 0, 350, 700]) {
      box(s * 420, y - 6, 0, s * 760, y + 6, 60, 'metal');
      box(s * 586 - 6, y - 110, 0, s * 586 + 6, y + 110, 60, 'metal');
    }
    // outer offices: desks by the wall
    for (const y of [-800, -300, 300, 800]) box(s * 1150, y - 70, 0, s * 1290, y + 70, 36, 'plate');
    // upstairs: meeting rooms with glass-height walls and doorways, low railing over the atrium
    for (const y of [-500, 500]) {
      box(s * 700, y - 8, F, s * X, y + 8, F + 100, 'panel');
      box(s * 700 - 8, y > 0 ? y : -Y + 260, F, s * 700 + 8, y > 0 ? Y - 260 : y, F + 100, 'panel');
    }
    for (const [a, b] of [[-Y, -700], [-380, -80], [80, 380], [700, Y]]) box(s * A - 6, a, F, s * A + 6, b, F + 40, 'metal');
    box(s * 1000 - 50, -50, F, s * 1000 + 50, 50, F + 40, 'hazard'); // water cooler stand
  }
  // stairs up from the atrium floor to each wing, and a bridge between the wings
  stairs(A - 12 * 28, 540, 0, '-x', 150, 12);
  stairs(-(A - 12 * 28), -540, 0, '+x', 150, 12);
  box(-A, -60, F - 16, A, 60, F, 'plate');
  box(-A, -66, F, A, -60, F + 36, 'metal'); box(-A, 60, F, A, 66, F + 36, 'metal');
  // reception desk and planters in the atrium
  box(-140, 380, 0, 140, 440, 44, 'plate');
  for (const [x, y] of [[-200, -400], [200, -400], [-200, 250], [200, 250]]) box(x - 30, y - 30, 0, x + 30, y + 30, 48, 'hazard');
  return autoLayout({ name: 'Office', boxes: B, sun: [-0.3, 0.5, 0.81], bounds: [[-X, -Y, 0], [X, Y, 460]], killZ: -1000, pads: [] });
})();

// ------------------------------------------------------------------ Station: two platforms either side of a sunken track bed, stopped trains, a footbridge
const station = (() => {
  const { B, box, stairs } = builder();
  const X = 2000, Y = 900, T = 250, D = 64; // track bed is |y| < T, D below the platforms
  box(-X - 64, -Y - 64, -D - 64, X + 64, Y + 64, -D, 'concrete'); // track bed
  for (const s of [-1, 1]) box(-X - 64, s * T, -D, X + 64, s * (Y + 64), 0, 'plate'); // platforms
  shell(box, X, Y, 480, 'panel', null, 400);
  // rails
  for (const y of [-170, -80, 80, 170]) box(-X, y - 3, -D, X, y + 3, -D + 6, 'metal');
  // two stopped trains with a gap between them to slip through
  box(-1200, -230, -D, 200, -20, 96, 'panel'); box(-1200, -232, 40, 200, -18, 56, 'neon');
  box(-200, 20, -D, 1200, 230, 96, 'panel'); box(-200, 18, 40, 1200, 232, 56, 'neon');
  // steps out of the track bed
  for (const x of [-1750, 600, 1850]) stairs(x, -T + 4 * 28, -D, '-y', 120, 4);
  for (const x of [-1750, -650, 1850]) stairs(x, T - 4 * 28, -D, '+y', 120, 4);
  // footbridge over the tracks with stairs down to each platform
  box(1420, -420, 144, 1580, 420, 160, 'plate');
  box(1420, -420, 160, 1428, 420, 196, 'metal'); box(1572, -420, 160, 1580, 420, 196, 'metal');
  stairs(1500, 420 + 280, 0, '-y', 160, 10); stairs(1500, -420 - 280, 0, '+y', 160, 10);
  // platform furniture: columns, benches, kiosks
  for (const s of [-1, 1]) {
    for (let x = -1600; x <= 1200; x += 400) box(x - 24, s * 620 - 24, 0, x + 24, s * 620 + 24, 400, 'concrete');
    for (const x of [-1400, -600, 200, 1000]) box(x - 70, s * 760 - 16, 0, x + 70, s * 760 + 16, 22, 'metal');
    box(s * -300 - 90, s * 420 - 60, 0, s * -300 + 90, s * 420 + 60, 110, 'hazard');
    box(s * -1000 - 50, s * 450 - 50, 0, s * -1000 + 50, s * 450 + 50, 72, 'metal');
  }
  return autoLayout({ name: 'Station', boxes: B, sun: [0.2, -0.55, 0.81], bounds: [[-X, -Y, -D], [X, Y, 480]], killZ: -1000, pads: [] });
})();

// ------------------------------------------------------------------ City: an open-world downtown. A street grid with shops you can walk into
// and climb onto, apartment courtyards, parks, parking lots, building sites and towers. In zombies the
// middle of town is fenced off from four districts, opened by buying your way through the barricades.
const city = (() => {
  const { B, box, stairs } = builder();
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const E = 3000, LINES = [-2800, -1400, 0, 1400, 2800], SW = 180, F = 1608; // street half width, fence lines
  box(-E - 700, -E - 700, -64, E + 700, E + 700, 0, 'plate'); // asphalt everywhere
  // tall buildings around the edge of town
  box(E - 20, -E - 700, 0, E + 700, E + 700, 900, 'panel'); box(-E - 700, -E - 700, 0, -E + 20, E + 700, 900, 'panel');
  box(-E, E - 20, 0, E, E + 700, 900, 'panel'); box(-E, -E - 700, 0, E, -E + 20, 900, 'panel');

  // ---- block builders: (cx, cy) is the block centre, blocks are 1040 square with an 8 high pavement
  const shop = (cx, cy, flip) => {
    const hx = 400, hy = 280, top = 232, s = flip ? -1 : 1;
    const x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy;
    // walls: two doorways on each long side, a shop window on each short side
    for (const y of [y0, y1 - 16]) {
      box(x0, y, 8, cx - 260, y + 16, top, 'panel'); box(cx - 140, y, 8, cx + 140, y + 16, top, 'panel'); box(cx + 260, y, 8, x1, y + 16, top, 'panel');
      box(cx - 260, y, 140, cx - 140, y + 16, top, 'panel'); box(cx + 140, y, 140, cx + 260, y + 16, top, 'panel');
    }
    for (const x of [x0, x1 - 16]) {
      box(x, y0, 8, x + 16, cy - 60, top, 'panel'); box(x, cy + 60, 8, x + 16, y1, top, 'panel');
      box(x, cy - 60, 8, x + 16, cy + 60, 60, 'panel'); box(x, cy - 60, 140, x + 16, cy + 60, top, 'panel');
    }
    box(x0, y0, top, x1, y1, top + 16, 'concrete'); // roof
    for (const y of [y0, y1 - 10]) box(x0, y, top + 16, x1, y + 10, top + 40, 'metal'); // parapet
    // inside: shelves and a counter
    for (const x of [cx - 200, cx, cx + 200]) box(x - 70, cy - 20, 8, x + 70, cy + 20, 70, 'metal');
    box(cx - 120, y0 + 60, 8, cx + 120, y0 + 100, 52, 'plate');
    // stairs up the outside to the roof, along a long side
    const sy = s > 0 ? y1 + 60 : y0 - 60;
    stairs(cx - 330, sy, 8, '+x', 100, 15, 'plate');
    box(cx - 330 + 15 * 28, s > 0 ? y1 : sy - 50, top, cx + 120, s > 0 ? sy + 50 : y0, top + 16, 'concrete'); // landing onto the roof
  };
  const tower = (cx, cy) => {
    const h = 900 + ((rnd() * 5) | 0) * 120;
    box(cx - 380, cy - 380, 8, cx + 380, cy + 380, h, 'panel');
    for (const z of [300, 600]) box(cx - 390, cy - 390, z, cx + 390, cy + 390, z + 14, 'concrete');
    for (const [x, y] of [[-440, -440], [440, -440], [-440, 440], [440, 440]]) box(cx + x - 30, cy + y - 30, 8, cx + x + 30, cy + y + 30, 48, 'grass'); // planters
  };
  const car = (x, y, along) => {
    const [hx, hy] = along === 'x' ? [95, 42] : [42, 95];
    box(x - hx, y - hy, 2, x + hx, y + hy, 46, 'metal');
    box(x - hx * 0.55, y - hy * 0.85, 46, x + hx * 0.55, y + hy * 0.85, 74, 'metal');
  };
  const parking = (cx, cy) => {
    box(cx - 520, cy - 520, 0, cx + 520, cy + 520, 4, 'plate'); // lot surface
    for (const s of [-1, 1]) { box(cx - 520, cy + s * 504 - 8, 0, cx - 120, cy + s * 504 + 8, 40, 'concrete'); box(cx + 120, cy + s * 504 - 8, 0, cx + 520, cy + s * 504 + 8, 40, 'concrete'); }
    for (const row of [-300, 0, 300]) for (const x of [-380, -190, 0, 190, 380]) if (rnd() < 0.7) car(cx + x, cy + row, 'y');
    box(cx - 60, cy + 420, 4, cx + 60, cy + 470, 90, 'panel'); // ticket booth
  };
  const park = (cx, cy) => {
    box(cx - 470, cy - 470, 8, cx + 470, cy + 470, 12, 'grass');
    for (let i = 0; i < 9; i++) {
      const x = cx + (rnd() - 0.5) * 760, y = cy + (rnd() - 0.5) * 760;
      if (Math.hypot(x - cx, y - cy) < 200) continue;
      box(x - 12, y - 12, 12, x + 12, y + 12, 150, 'metal'); // trunk
      box(x - 70, y - 70, 150, x + 70, y + 70, 230, 'grass'); // canopy
    }
    box(cx - 120, cy - 120, 12, cx + 120, cy + 120, 30, 'concrete'); // gazebo floor
    for (const [x, y] of [[-110, -110], [110, -110], [-110, 110], [110, 110]]) box(cx + x - 8, cy + y - 8, 30, cx + x + 8, cy + y + 8, 170, 'metal');
    box(cx - 130, cy - 130, 170, cx + 130, cy + 130, 182, 'panel'); // gazebo roof
    for (const s of [-1, 1]) box(cx + s * 300 - 60, cy - 14, 12, cx + s * 300 + 60, cy + 14, 30, 'plate'); // benches
  };
  const plaza = (cx, cy) => {
    box(cx - 470, cy - 470, 8, cx + 470, cy + 470, 12, 'concrete');
    box(cx - 130, cy - 130, 12, cx + 130, cy + 130, 40, 'concrete'); // fountain basin
    box(cx - 30, cy - 30, 40, cx + 30, cy + 30, 120, 'panel'); box(cx - 60, cy - 60, 120, cx + 60, cy + 60, 132, 'neon');
    for (const [x, y] of [[-320, -320], [320, -320], [-320, 320], [320, 320]]) box(cx + x - 50, cy + y - 50, 12, cx + x + 50, cy + y + 50, 56, 'grass'); // planters
    box(cx - 200, cy - 400, 12, cx + 200, cy - 384, 60, 'metal'); // low wall
  };
  const apartment = (cx, cy, open) => {
    // a U of flats around a courtyard; the open side faces `open`, with a stairway up to a balcony at the back
    const t = 140, h = 560;
    const sides = { n: [cx - 440, cy + 440 - t, cx + 440, cy + 440], s: [cx - 440, cy - 440, cx + 440, cy - 440 + t], e: [cx + 440 - t, cy - 440, cx + 440, cy + 440], w: [cx - 440, cy - 440, cx - 440 + t, cy + 440] };
    for (const [k, b] of Object.entries(sides)) if (k !== open) box(b[0], b[1], 8, b[2], b[3], h, 'panel');
    const back = { n: 's', s: 'n', e: 'w', w: 'e' }[open];
    const bb = sides[back];
    if (back === 'n' || back === 's') {
      const y = back === 'n' ? bb[1] : bb[3], s = back === 'n' ? -1 : 1;
      box(cx - 300, Math.min(y, y + s * 90), 152, cx + 300, Math.max(y, y + s * 90), 168, 'concrete');
      stairs(cx - 300 - 10 * 28, y + s * 45, 8, '+x', 80, 10, 'plate');
    } else {
      const x = back === 'e' ? bb[0] : bb[2], s = back === 'e' ? -1 : 1;
      box(Math.min(x, x + s * 90), cy - 300, 152, Math.max(x, x + s * 90), cy + 300, 168, 'concrete');
      stairs(x + s * 45, cy - 300 - 10 * 28, 8, '+y', 80, 10, 'plate');
    }
    for (let i = 0; i < 4; i++) { const x = cx + (rnd() - 0.5) * 300, y = cy + (rnd() - 0.5) * 300; box(x - 30, y - 30, 8, x + 30, y + 30, 40 + rnd() * 30, 'metal'); }
  };
  const site = (cx, cy) => {
    // building site: a scaffold with two decks and stairs, stacked materials, a crane mast
    box(cx - 300, cy - 200, 160, cx + 300, cy + 200, 176, 'plate');
    box(cx - 300, cy - 200, 320, cx + 100, cy + 200, 336, 'plate');
    for (const [x, y] of [[-300, -200], [300, -200], [-300, 200], [300, 200], [100, -200], [100, 200]]) box(cx + x - 8, cy + y - 8, 8, cx + x + 8, cy + y + 8, 336, 'metal');
    stairs(cx - 300 - 10 * 28, cy - 250, 8, '+x', 90, 10, 'plate');
    box(cx - 300, cy - 300, 160, cx - 200, cy - 200, 176, 'plate'); // landing onto the first deck
    stairs(cx - 160, cy + 250, 176, '+x', 90, 10, 'plate');
    box(cx + 120, cy + 200, 320, cx + 220, cy + 300, 336, 'plate'); // landing onto the second deck
    box(cx + 100, cy + 200, 320, cx + 120, cy + 300, 336, 'plate');
    for (let i = 0; i < 6; i++) { const x = cx + (rnd() - 0.5) * 800, y = cy + (rnd() > 0.5 ? 380 : -380); box(x - 40, y - 40, 8, x + 40, y + 40, 40 + ((rnd() * 2) | 0) * 40, 'hazard'); }
    box(cx + 330, cy - 330, 8, cx + 430, cy - 230, 700, 'metal'); // crane mast
  };

  const blocks = [-2100, -700, 700, 2100];
  const plan = {
    '-700,-700': (x, y) => park(x, y), '700,-700': (x, y) => shop(x, y, true), '-700,700': (x, y) => shop(x, y, false), '700,700': (x, y) => plaza(x, y),
    '-2100,2100': (x, y) => tower(x, y), '-700,2100': (x, y) => apartment(x, y, 's'), '700,2100': (x, y) => shop(x, y, true), '2100,2100': (x, y) => site(x, y),
    '-2100,-2100': (x, y) => site(x, y), '-700,-2100': (x, y) => parking(x, y), '700,-2100': (x, y) => apartment(x, y, 'n'), '2100,-2100': (x, y) => tower(x, y),
    '2100,700': (x, y) => apartment(x, y, 'w'), '2100,-700': (x, y) => parking(x, y), '-2100,700': (x, y) => park(x, y), '-2100,-700': (x, y) => shop(x, y, false),
  };
  for (const bx of blocks) for (const by of blocks) {
    box(bx - 520, by - 520, 0, bx + 520, by + 520, 8, 'concrete'); // pavement
    plan[bx + ',' + by](bx, by);
  }

  // ---- fences between the middle of town and the four districts, with gaps where the barricades go
  const doors = [];
  const WALL = 640, GAP_H = 200;
  const fence = (axis, at, from, to, gaps) => {
    let a = from;
    for (const [g0, g1, cost] of [...gaps, [to, to]]) {
      if (g0 > a) { if (axis === 'x') box(a, at - 12, 0, g0, at + 12, WALL, 'concrete'); else box(at - 12, a, 0, at + 12, g0, WALL, 'concrete'); }
      if (g1 > g0) {
        if (axis === 'x') box(g0, at - 12, GAP_H, g1, at + 12, WALL, 'concrete'); else box(at - 12, g0, GAP_H, at + 12, g1, WALL, 'concrete');
        doors.push({ mins: axis === 'x' ? [g0, at - 24, 0] : [at - 24, g0, 0], maxs: axis === 'x' ? [g1, at + 24, GAP_H] : [at + 24, g1, GAP_H], cost, name: 'Debris' });
      }
      a = g1;
    }
  };
  fence('x', F, -E, E, [[-2800 - SW, -2800 + SW, 1500], [-SW, SW, 750], [2800 - SW, 2800 + SW, 1500]]);
  fence('x', -F, -E, E, [[-2800 - SW, -2800 + SW, 1500], [-SW, SW, 1000], [2800 - SW, 2800 + SW, 1500]]);
  fence('y', F, -F + 12, F - 12, [[-SW, SW, 1000]]);
  fence('y', -F, -F + 12, F - 12, [[-SW, SW, 1250]]);

  // ---- streets: parked cars along the kerbs (spaced so you can always walk between them) and lamps on the
  // corners; crossings and barricade gaps kept clear
  const nearFence = (x, y) => Math.abs(Math.abs(x) - F) < 260 || Math.abs(Math.abs(y) - F) < 260;
  for (const c of LINES) for (let t = -E + 150; t < E - 150; t += 520) {
    if (LINES.some((l) => Math.abs(t - l) < SW + 140)) continue;
    for (const side of [-1, 1]) {
      if (rnd() < 0.45) continue;
      const along = c + side * 130;
      if (!nearFence(t, along) && Math.abs(t) > 250) car(t, along, 'x');
      if (!nearFence(along, t) && Math.abs(t) > 250 && rnd() < 0.8) car(along, t, 'y');
    }
  }
  for (const x of LINES) for (const y of LINES) for (const [dx, dy] of [[1, 1], [-1, -1]]) {
    const lx = x + dx * (SW + 20), ly = y + dy * (SW + 20);
    if (Math.abs(lx) < E - 40 && Math.abs(ly) < E - 40) { box(lx - 5, ly - 5, 8, lx + 5, ly + 5, 300, 'metal'); box(lx - 14, ly - 14, 300, lx + 14, ly + 14, 310, 'neon'); }
  }

  // ---- zombies: the box, perk machines and wall weapons, on pavements next to the streets
  const buys = [
    { kind: 'box', o: [450, 700, 12] },
    { kind: 'perk', what: 'quick', o: [-400, -230, 12] },
    { kind: 'wall', what: '357', o: [230, 400, 12] }, { kind: 'wall', what: 'smg1', o: [-230, 900, 8] }, { kind: 'wall', what: 'shotgun', o: [900, -230, 8] },
    { kind: 'perk', what: 'jugg', o: [230, 2300, 8] }, { kind: 'wall', what: 'ar2', o: [-230, 1950, 8] }, { kind: 'wall', what: 'lmg', o: [1400, 2300, 0] },
    { kind: 'perk', what: 'speed', o: [230, -2300, 8] }, { kind: 'wall', what: 'crossbow', o: [-230, -1950, 8] }, { kind: 'wall', what: 'autoshotgun', o: [1400, -2300, 0] },
    { kind: 'perk', what: 'double', o: [2300, 230, 8] }, { kind: 'wall', what: 'sniper', o: [2000, -230, 8] },
    { kind: 'perk', what: 'stamina', o: [-2300, 230, 8] }, { kind: 'wall', what: 'grenade', o: [-2000, -230, 8] },
  ];
  return autoLayout({ name: 'City', boxes: B, sun: [0.4, 0.3, 0.86], bounds: [[-E, -E, -40], [E, E, 700]], killZ: -1000, pads: [], doors, buys, zstart: [0, 0, 1] }, { spawns: 24, items: 30, props: 12 });
})();

// ------------------------------------------------------------------ Pitch (soccer): a walled pitch with two goals
// Red defends the goal at -X and scores in the one at +X. 'clip' boxes are invisible walls that keep the
// ball (and players) in; `decor` is drawn but never collides (pitch lines, nets, stands, floodlights).
// The Ballcourt (mugrball) is the same stadium with cover to fight behind and a hoop above each goal.
const stadium = (court) => {
  const { B, box } = builder();
  const D = [];
  const deco = (x0, y0, z0, x1, y1, z1, mat) => D.push({ mins: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], maxs: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], mat });
  const X = 1600, Y = 1000, GW = 220, GH = 170, GD = 150, BH = 110, TOP = 720;
  box(-X - 500, -Y - 500, -64, X + 500, Y + 500, 0, 'grass');
  // advertising boards down the sides, and clip above them up to the roof
  for (const s of [-1, 1]) {
    box(-X - 24, s > 0 ? Y : -Y - 24, 0, X + 24, s > 0 ? Y + 24 : -Y, BH, 'panel');
    box(-X - 24, s > 0 ? Y : -Y - 24, BH, X + 24, s > 0 ? Y + 24 : -Y, TOP, 'clip');
  }
  // the ends, with the goal mouths left open
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? X : -X - 24, x1 = x0 + 24;
    box(x0, -Y, 0, x1, -GW - 8, BH, 'panel');
    box(x0, GW + 8, 0, x1, Y, BH, 'panel');
    box(x0, -Y, BH, x1, -GW - 8, TOP, 'clip');
    box(x0, GW + 8, BH, x1, Y, TOP, 'clip');
    box(x0, -GW - 8, GH + 8, x1, GW + 8, TOP, 'clip');
    // posts and crossbar
    const px0 = s > 0 ? X - 4 : -X - 4, px1 = px0 + 8;
    box(px0, -GW - 8, 0, px1, -GW, GH + 8, 'line');
    box(px0, GW, 0, px1, GW + 8, GH + 8, 'line');
    box(px0, -GW - 8, GH, px1, GW + 8, GH + 8, 'line');
    // the goal: back, sides and roof (invisible walls, with nets drawn on them)
    const bx = s * (X + GD), inner = s * X;
    box(bx, -GW - 8, 0, bx + s * 10, GW + 8, GH + 8, 'clip');
    box(inner, -GW - 8, 0, bx, -GW, GH + 8, 'clip');
    box(inner, GW, 0, bx, GW + 8, GH + 8, 'clip');
    box(inner, -GW - 8, GH, bx, GW + 8, GH + 8, 'clip');
    deco(bx, -GW, 0, bx + s * 2, GW, GH, 'net');
    deco(inner, -GW - 2, 0, bx, -GW, GH, 'net');
    deco(inner, GW, 0, bx, GW + 2, GH, 'net');
    deco(inner, -GW, GH - 2, bx, GW, GH, 'net');
  }
  box(-X - 24, -Y - 24, TOP, X + 24, Y + 24, TOP + 20, 'clip'); // a lid, so a huge chip can't leave
  // lines: halfway, centre circle, touchlines, penalty and goal areas
  const line = (x0, y0, x1, y1) => deco(x0, y0, 0, x1, y1, 0.6, 'line');
  line(-3, -Y, 3, Y);
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2, r = 230;
    line(Math.cos(a) * r - 9, Math.sin(a) * r - 9, Math.cos(a) * r + 9, Math.sin(a) * r + 9);
  }
  line(-X, -Y, X, -Y + 6); line(-X, Y - 6, X, Y); line(-X, -Y, -X + 6, Y); line(X - 6, -Y, X, Y);
  for (const s of [-1, 1]) {
    const e = s * X;
    for (const [d, w] of [[420, 520], [160, 300]]) {
      line(Math.min(e, e - s * d), -w, Math.max(e, e - s * d), -w + 6);
      line(Math.min(e, e - s * d), w - 6, Math.max(e, e - s * d), w);
      line(e - s * d - 3, -w, e - s * d + 3, w);
    }
  }
  // stands and floodlights beyond the boards (out of reach)
  for (const s of [-1, 1]) {
    for (let k = 0; k < 5; k++) deco(-X, s * (Y + 80 + k * 70), 0, X, s * (Y + 150 + k * 70), 40 + k * 45, 'concrete');
    for (const x of [-X, X]) {
      deco(x - 14, s * (Y + 450) - 14, 0, x + 14, s * (Y + 450) + 14, 900, 'metal');
      deco(x - 70, s * (Y + 450) - 20, 900, x + 70, s * (Y + 450) + 20, 960, 'neon');
    }
  }
  const hoops = [], items = [];
  if (court) {
    // a hoop above each goal: backboard, arm and a ring of 38 (the ball goes through it going down)
    const HZ = 330, HR = 38;
    for (const s of [-1, 1]) {
      const hx = s * (X - 80);
      box(s * (X - 24), -110, HZ - 50, s * (X - 10), 110, HZ + 110, 'metal');
      deco(s * (X - 26), -60, HZ - 30, s * (X - 24), 60, HZ + 50, 'line'); // the square on the board
      deco(s * (X - 24), -4, HZ - 3, hx + s * HR, 4, HZ + 1, 'metal');
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2, cx = hx + Math.cos(a) * HR, cy = Math.sin(a) * HR;
        deco(cx - 5.5, cy - 5.5, HZ - 2, cx + 5.5, cy + 5.5, HZ + 2, 'hazard');
      }
      hoops.push({ o: [hx, 0, HZ], r: HR });
    }
    // cover: crates and low walls, the centre circle left clear
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        box(sx * 650 - 55, sy * 420 - 55, 0, sx * 650 + 55, sy * 420 + 55, 96, 'plate');
        box(sx * 1150 - 45, sy * 360 - 45, 0, sx * 1150 + 45, sy * 360 + 45, 72, 'plate');
        box(sx * 380 - 30, sy * 720 - 110, 0, sx * 380 + 30, sy * 720 + 110, 110, 'panel');
      }
      box(-100, sx * 520 - 24, 0, 100, sx * 520 + 24, 64, 'concrete');
      // health and ammo behind the cover, armour by the goals, a rocket launcher by the halfway walls
      items.push({ kind: 'health', o: [sx * 520, 420, 0] }, { kind: 'ammo', o: [sx * 520, -420, 0] });
      items.push({ kind: 'battery', o: [sx * 1150, 230, 0] }, { kind: 'vial', o: [sx * 1150, -230, 0] });
      items.push({ kind: sx > 0 ? 'rpg' : 'shotgun', o: [0, sx * 620, 0] });
    }
  }
  const spawns = [];
  for (const [team, sx] of [['red', -1], ['blue', 1]]) {
    for (let i = 0; i < 8; i++) spawns.push({ origin: [sx * (300 + (i % 4) * 280), (i < 4 ? -1 : 1) * (250 + (i % 2) * 300), 1], yaw: sx > 0 ? 180 : 0, team });
  }
  return {
    name: court ? 'Ballcourt' : 'Pitch', boxes: B, decor: D, sun: [0.35, 0.45, 0.82], bounds: [[-X - 200, -Y - 200, -40], [X + 200, Y + 200, TOP]], killZ: -500, pads: [],
    spawns, items, props: [], flags: { red: [-X + 200, 0, 0], blue: [X - 200, 0, 0] },
    soccer: { goalX: X, goalW: GW, goalH: GH, center: [0, 0, 60] }, ...(court ? { hoops } : {}),
  };
};
const pitch = stadium(false);
const court = stadium(true);

// ------------------------------------------------------------------ Bank (heist): a small branch bank on a street
// The crew starts by the getaway van. Lobby (public) → teller counter → staff door (keycard) → corridor →
// security office (camera monitors, alarm wiring, alarm panel), manager's office (a keycard on the desk) and
// the vault room (hack panel, vault door, cash carts and deposit boxes). A back door opens onto the alley.
// `heist` holds everything the heist needs: guards and their routes, cameras, staff, interactive spots.
// Guards, cameras and staff have a minimum difficulty (0 easy, 1 normal, 2 hard).
const bank = (() => {
  const { B, box } = builder();
  const D = [];
  const deco = (x0, y0, z0, x1, y1, z1, mat) => D.push({ mins: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], maxs: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], mat });
  const H = 220; // ceiling
  // ground: the street in front, the alley on the east side, a back lot behind
  box(-1500, -1400, -64, 1500, 1100, 0, 'concrete');
  deco(-1500, -1300, 0, 1500, -760, 0.4, 'asphalt'); // road
  for (let x = -1450; x < 1500; x += 220) deco(x, -1034, 0.4, x + 110, -1026, 0.8, 'line');
  deco(-1500, -760, 0, 1500, -748, 6, 'concrete'); // kerb
  // the block around it: buildings either side, a wall behind, the far side of the street
  box(-1500, -520, 0, -660, 1000, 380, 'brick');
  box(920, -520, 0, 1500, 1000, 420, 'brick');
  box(-1500, 1000, 0, 1500, 1100, 260, 'brick');
  box(-1500, -1400, 0, 1500, -1310, 460, 'panel');
  for (const [x0, x1] of [[-1500, 1500]]) { box(x0 - 20, -1400, 0, x0, 1100, 600, 'clip'); box(x1, -1400, 0, x1 + 20, 1100, 600, 'clip'); }
  box(-1520, -1420, 600, 1520, 1120, 620, 'clip');
  // parked cars to hide behind, and the getaway van
  for (const [x, y] of [[-480, -900], [300, -960], [820, -880], [-200, -1180], [1150, -1160]]) box(x - 85, y - 40, 0, x + 85, y + 40, 58, 'metal');
  box(-1160, -850, 0, -900, -750, 112, 'clip'); // the van (drawn by the heist view)
  // ---- the bank: stone walls, a glass front, a flat roof
  box(-640, -520, 0, -70, -500, H, 'stone');
  box(70, -520, 0, 640, -500, H, 'stone');
  box(-70, -520, 150, 70, -500, H, 'stone');
  for (const x of [-480, 330]) deco(x, -522, 60, x + 150, -520, 150, 'glass');
  box(-640, 500, 0, 640, 520, H, 'stone');
  box(-640, -500, 0, -620, 500, H, 'stone');
  box(620, -500, 0, 640, 40, H, 'stone');
  box(620, 120, 0, 640, 500, H, 'stone');
  box(620, 40, 140, 640, 120, H, 'stone');
  box(-640, -520, H, 640, 520, H + 20, 'plate');
  deco(-120, -560, 160, 120, -522, 200, 'neon'); // the sign over the door
  deco(-620, -500, 0, 620, 500, 0.5, 'marble');
  // lobby: pillars, benches, the teller counter (you can jump over it) and the gate at its end
  for (const x of [-300, 300]) box(x - 22, -282, 0, x + 22, -238, H, 'stone');
  for (const x of [-420, 420]) box(x - 70, -420, 0, x + 70, -396, 22, 'wood');
  box(-620, -150, 0, 480, -125, 46, 'wood');
  deco(-620, -152, 46, 480, -123, 50, 'marble');
  deco(482, -140, 0, 618, -134, 40, 'wood');
  // teller desks and the wall behind them, with the staff door (keycard)
  for (const x of [-250, 250]) box(x - 70, -60, 0, x + 70, -40, 40, 'wood');
  box(-620, 0, 0, -40, 20, H, 'panel');
  box(40, 0, 0, 620, 20, H, 'panel');
  box(-40, 0, 140, 40, 20, H, 'panel');
  // the corridor's north wall, with doorways into the three back rooms
  for (const [x0, x1] of [[-620, -470], [-400, -140], [-70, 150], [220, 620]]) box(x0, 140, 0, x1, 160, H, 'panel');
  for (const [x0, x1] of [[-470, -400], [-140, -70], [150, 220]]) box(x0, 140, 140, x1, 160, H, 'panel');
  box(-260, 160, 0, -240, 500, H, 'panel');
  box(80, 160, 0, 100, 500, H, 'panel');
  // security office: the monitor desk and the alarm wiring box
  box(-600, 300, 0, -540, 420, 40, 'metal');
  deco(-610, 300, 40, -600, 420, 100, 'neon');
  box(-620, 200, 70, -604, 240, 120, 'hazard');
  // manager's office
  box(-160, 330, 0, 0, 390, 38, 'wood');
  // the vault: thick walls, the round door (a door box) and the hack panel beside it
  box(100, 290, 0, 300, 310, H, 'metal');
  box(420, 290, 0, 620, 310, H, 'metal');
  box(300, 290, 160, 420, 310, H, 'metal');
  box(256, 284, 40, 284, 290, 90, 'hazard');
  for (const x of [100, 600]) box(x, 310, 0, x + 20, 500, 180, 'metal'); // deposit boxes along both sides
  for (const [x, y] of [[170, 430], [270, 470], [450, 470], [550, 430]]) box(x - 26, y - 18, 0, x + 26, y + 18, 34, 'metal'); // cash carts
  // health and ammo: at the van, and a little inside
  const items = [
    { kind: 'ammo', o: [-1180, -660, 0] }, { kind: 'health', o: [-1100, -620, 0] }, { kind: 'battery', o: [-1020, -620, 0] },
    { kind: 'ammo', o: [-560, 230, 0] }, { kind: 'health', o: [560, 60, 0] },
  ];
  const spawns = [[-1180, -690], [-1100, -680], [-1020, -680], [-940, -690]].map(([x, y]) => ({ origin: [x, y, 1], yaw: 30 }));
  return {
    name: 'Bank', boxes: B, decor: D, sun: [0.45, 0.35, 0.8], bounds: [[-1500, -1400, -40], [1500, 1100, 400]], killZ: -500, pads: [],
    spawns, items, props: [],
    doors: [
      { mins: [-40, 2, 0], maxs: [40, 18, 140], name: 'staff' },
      { mins: [300, 292, 0], maxs: [420, 308, 160], name: 'vault' },
      { mins: [622, 40, 0], maxs: [638, 120, 140], name: 'back' },
    ],
    heist: {
      title: 'The Bank Job', loot: 'cash', boxLoot: 'deposit', escape: 'van', cartDraw: [0, 52],
      inside: [[-620, -500, 0], [620, 500, H]],
      restricted: [[-620, -125, 0], [620, 500, H]], // behind the counter and everything past it
      van: { o: [-1050, -690, 0], r: 170 },
      alarms: [[-580, -300, 0], [-450, 460, 0]],
      phones: [[-250, -82, 0], [250, -82, 0], [-80, 410, 0]],
      exits: [[0, -700, 0], [780, -300, 0]],
      keycard: [-80, 360, 40],
      terminal: [-520, 360, 0],
      wiring: [-575, 220, 0],
      panel: [270, 262, 0],
      doorUse: { staff: [[0, -18, 0], [0, 38, 0]], back: [[598, 80, 0]], vault: [[360, 270, 0]] },
      carts: [[170, 378, 0], [270, 418, 0], [450, 418, 0], [550, 378, 0]],
      boxes: [[140, 330], [140, 356], [140, 382], [140, 472], [580, 330], [580, 356], [580, 382], [580, 472]].map(([x, y]) => [x, y, 0]),
      guards: [
        { o: [-110, -460], yaw: 90, post: true, look: [60, 130] },
        { route: [[-500, -320], [450, -320], [450, -440], [-500, -440]] },
        { route: [[-520, -90], [420, -90]] },
        { o: [180, 230], yaw: 20, post: true, look: [-30, 70] },
        { route: [[-560, 80], [560, 80], [-430, 80], [-430, 250], [-430, 80]], min: 1 },
        { o: [-470, 330], yaw: 180, post: true, look: [150, 210], cams: true, min: 1 },
        { route: [[-600, -600], [760, -600], [760, 700], [-560, 700], [760, 700], [760, -600]], min: 2 },
        { route: [[-200, -300], [540, -300], [550, -100], [0, -90], [0, 80], [-430, 80], [-430, 250], [-430, 80], [0, 80], [0, -90], [550, -100]], captain: true, min: 1 },
      ],
      cameras: [
        { o: [-600, -480, 190], yaw: 45, sweep: 35 },
        { o: [600, -480, 190], yaw: 135, sweep: 35 },
        { o: [0, -12, 190], yaw: -90, sweep: 55 },
        { o: [600, 180, 190], yaw: 172, sweep: 22 },
        { o: [-600, 40, 190], yaw: 0, sweep: 18, min: 1 },
        { o: [655, -535, 200], yaw: 70, sweep: 28, min: 1 },
      ],
      staff: [
        { o: [-250, -82], yaw: -90, kind: 'teller' },
        { o: [250, -82], yaw: -90, kind: 'teller' },
        { o: [-80, 430], yaw: -90, kind: 'manager' },
        { o: [-300, -380], kind: 'customer', route: [[-300, -380], [-100, -250], [200, -330], [350, -440], [0, -460]] },
        { o: [200, -330], kind: 'customer', route: [[200, -330], [-200, -440], [-450, -300], [0, -250]] },
        { o: [100, -450], kind: 'customer', route: [[100, -450], [-350, -250], [350, -250]], min: 1 },
      ],
      police: [[1450, -1100], [1450, -880], [780, 960], [-300, 960], [-1440, -1240]],
    },
  };
})();

// ------------------------------------------------------------------ Course (parkour): a run through the sky
// Stepping stones, a staircase climb, narrow beams, jump pads and sprint gaps, with checkpoints. Fall and you
// go back to your last checkpoint.
const course = (() => {
  const { B, box } = builder();
  const D = [];
  const deco = (x0, y0, z0, x1, y1, z1, mat) => D.push({ mins: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], maxs: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], mat });
  const pads = [];
  box(-200, -250, -40, 200, 250, 0, 'plate'); // start
  for (let i = 0; i < 6; i++) { const x = 330 + i * 180, y = i % 2 ? 40 : -40; box(x - 40, y - 40, -40, x + 40, y + 40, 0, 'hazard'); }
  box(1380, -150, -40, 1580, 150, 0, 'plate'); // checkpoint 1
  for (let i = 0; i < 8; i++) { const x0 = 1680 + i * 140; box(x0, -70, -40, x0 + 110, 70, 28 * (i + 1), 'concrete'); }
  box(2860, -150, -40, 3060, 150, 224, 'plate'); // checkpoint 2
  box(3060, -12, 200, 3560, 12, 224, 'metal'); // beams
  box(3560, -40, 200, 3640, 40, 224, 'plate');
  box(3588, 40, 200, 3612, 400, 224, 'metal');
  box(3560, 400, 200, 3640, 480, 224, 'plate');
  box(3640, 428, 200, 4140, 452, 224, 'metal');
  box(4140, 340, -40, 4340, 540, 224, 'plate'); // checkpoint 3
  pads.push(pad(4300, 440, 224, [4600, 440, 520], 820));
  box(4500, 360, 480, 4700, 520, 520, 'plate');
  for (let i = 0; i < 4; i++) { const x = 4850 + i * 250; box(x - 50, 390, 480, x + 50, 490, 520, 'hazard'); }
  box(5800, 340, 480, 6000, 540, 520, 'plate'); // checkpoint 4
  pads.push(pad(5965, 440, 520, [6310, 440, 800], 820));
  box(6200, 320, 760, 6420, 560, 800, 'plate'); // the finish
  // the finish arch and checkpoint markers
  deco(6380, 330, 800, 6400, 350, 960, 'neon'); deco(6380, 530, 800, 6400, 550, 960, 'neon'); deco(6380, 330, 950, 6400, 550, 970, 'neon');
  const checkpoints = [
    { o: [0, 0, 0], yaw: 0 },
    { o: [1480, 0, 0], yaw: 0, box: [1380, -150, -10, 1580, 150, 140] },
    { o: [2960, 0, 224], yaw: 0, box: [2860, -150, 214, 3060, 150, 364] },
    { o: [4220, 440, 224], yaw: 0, box: [4140, 340, 214, 4340, 540, 364] },
    { o: [5880, 440, 520], yaw: 0, box: [5800, 340, 510, 6000, 540, 660] },
    { o: [6290, 440, 800], yaw: 0, box: [6200, 320, 790, 6420, 560, 940], finish: true },
  ];
  for (const c of checkpoints.slice(1, -1)) {
    const [x0, y0, z0, x1, y1] = c.box, z = z0 + 10;
    for (const [x, y] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) deco(x - 4, y - 4, z, x + 4, y + 4, z + 70, 'neon');
  }
  const spawns = [];
  for (let i = 0; i < 16; i++) spawns.push({ origin: [-120 + (i % 4) * 80, -150 + Math.floor(i / 4) * 100, 1], yaw: 0 });
  return {
    name: 'Sky Course', boxes: B, decor: D, sun: [-0.3, 0.4, 0.86], bounds: [[-250, -300, -300], [6500, 650, 1000]], killZ: -300, pads,
    spawns, items: [], props: [], flags: { red: [0, 0, 0], blue: [6290, 440, 800] }, checkpoints,
  };
})();

// maps only played in their own mode (not in the normal rotation)
// ------------------------------------------------------------------ Asylum (zombies): a walled hospital around a courtyard
// You start in the courtyard. Four wings (north wards, east surgery, south offices, west kitchens) are behind
// barricades, and the corner rooms that join them behind dearer ones. Plays as a normal arena too.
const asylum = (() => {
  const { B, box, stairs } = builder();
  const D = [];
  const deco = (x0, y0, z0, x1, y1, z1, mat) => D.push({ mins: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], maxs: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], mat });
  const E = 1600, C = 450, H = 260, DOOR = 170;
  const doors = [];
  box(-E - 300, -E - 300, -64, E + 300, E + 300, 0, 'tile');
  deco(-C, -C, 0, C, C, 0.5, 'grass');
  // the outer wall, tall and grim
  box(-E - 40, -E - 40, 0, E + 40, -E, 420, 'stone'); box(-E - 40, E, 0, E + 40, E + 40, 420, 'stone');
  box(-E - 40, -E, 0, -E, E, 420, 'stone'); box(E, -E, 0, E + 40, E, 420, 'stone');
  // a wall along x (at y) or y (at x) from a to b, with barricaded doorways [centre, cost]
  const wall = (axis, at, a, b, gaps, mat = 'panel') => {
    let p = a;
    for (const [c, cost] of [...gaps, [b + DOOR / 2, 0]]) {
      const g0 = c - DOOR / 2, g1 = c + DOOR / 2;
      if (g0 > p) { if (axis === 'x') box(p, at - 12, 0, g0, at + 12, H, mat); else box(at - 12, p, 0, at + 12, g0, H, mat); }
      if (cost) {
        if (axis === 'x') box(g0, at - 12, 160, g1, at + 12, H, mat); else box(at - 12, g0, 160, at + 12, g1, H, mat);
        doors.push({ mins: axis === 'x' ? [g0, at - 20, 0] : [at - 20, g0, 0], maxs: axis === 'x' ? [g1, at + 20, 160] : [at + 20, g1, 160], cost, name: 'Boarded door' });
      }
      p = Math.max(p, g1);
    }
  };
  // the courtyard ring: one barricade into each wing
  wall('x', C, -C, C, [[0, 750]], 'stone'); wall('x', -C, -C, C, [[0, 1000]], 'stone');
  wall('y', C, -C, C, [[0, 1000]], 'stone'); wall('y', -C, -C, C, [[0, 1250]], 'stone');
  // wings to corner rooms (the wings are x or y in -C..C; corners beyond both)
  for (const s of [-1, 1]) {
    wall('y', s * C, s > 0 ? C : -E, s > 0 ? E : -C, [[s * 1000, 1500]]); // N/S wings into the corner rooms beside them
    wall('y', -s * C, s > 0 ? C : -E, s > 0 ? E : -C, [[s * 1000, 1500]]);
    wall('x', s * C, C, E, [[1000, 1500]]); wall('x', s * C, -E, -C, [[-1000, 1500]]);
  }
  // the courtyard: a dry fountain, benches, two dead trees
  box(-70, -70, 0, 70, 70, 30, 'stone'); box(-18, -18, 30, 18, 18, 90, 'stone'); deco(-60, -60, 30, 60, 60, 31, 'water');
  for (const [x, y] of [[-260, 200], [260, -200], [-260, -200], [260, 200]]) box(x - 50, y - 14, 0, x + 50, y + 14, 20, 'wood');
  for (const [x, y] of [[-300, 320], [300, -320]]) { box(x - 10, y - 10, 0, x + 10, y + 10, 200, 'wood'); deco(x - 70, y - 4, 150, x + 70, y + 4, 156, 'wood'); deco(x - 4, y - 60, 175, x + 4, y + 60, 181, 'wood'); }
  // north wing: two wards of beds either side of a corridor
  box(-C, 900, 0, -60, 920, H, 'panel'); box(60, 900, 0, C, 920, H, 'panel');
  for (const x of [-360, -240, -120, 120, 240, 360]) for (const y of [700, 1150, 1400]) { box(x - 22, y - 44, 0, x + 22, y + 44, 24, 'metal'); deco(x - 20, y - 42, 24, x + 20, y + 42, 30, 'tile'); }
  // east wing: the operating theatre (a table under a lamp) and a raised viewing gallery
  box(700, -120, 0, 900, -40, 36, 'metal'); deco(760, -110, 200, 840, -50, 206, 'neon');
  box(1250, -C, 0, E, C, 80, 'tile'); stairs(1250, 0, 0, '-x', 140, 5, 'tile');
  box(1250, -C, 80, 1270, -90, 120, 'metal'); box(1250, 90, 80, 1270, C, 120, 'metal'); // gallery rail, open at the stairs
  for (const y of [-300, -150, 150, 300]) box(1000, y - 30, 0, 1080, y + 30, 50, 'metal');
  // south wing: offices with desks and filing cabinets
  box(-C, -900, 0, -60, -880, H, 'panel'); box(60, -900, 0, C, -880, H, 'panel');
  for (const [x, y] of [[-300, -650], [300, -650], [-300, -1200], [300, -1200], [0, -1400]]) { box(x - 60, y - 30, 0, x + 60, y + 30, 36, 'wood'); box(x - 90, y + 50, 0, x - 60, y + 80, 90, 'metal'); }
  // west wing: the kitchen and the boiler room
  box(-1100, -300, 0, -800, -220, 44, 'metal'); box(-1100, 220, 0, -800, 300, 44, 'metal');
  box(-1450, -120, 0, -1250, 120, 160, 'metal'); deco(-1440, -110, 160, -1260, 110, 166, 'hazard');
  for (const y of [-500, 500]) box(-1000, y - 40, 0, -920, y + 40, 70, 'wood');
  // corner rooms: storage with crates to climb
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const cx = sx * 1050, cy = sy * 1050;
    box(cx - 60, cy - 60, 0, cx + 60, cy + 60, 70, 'wood'); box(cx + sx * 120 - 50, cy - 40, 0, cx + sx * 120 + 50, cy + 40, 40, 'wood');
    box(cx - 200, cy + sy * 200 - 30, 0, cx - 80, cy + sy * 200 + 30, 110, 'metal');
  }
  // flickering ward lights
  for (const [x, y] of [[0, 700], [0, 1300], [800, 0], [1300, 0], [0, -700], [0, -1300], [-800, 0], [-1300, 0], [1050, 1050], [-1050, -1050], [1050, -1050], [-1050, 1050]]) deco(x - 30, y - 6, H - 8, x + 30, y + 6, H - 4, 'neon');
  const buys = [
    { kind: 'box', o: [0, 1300, 1] },
    { kind: 'perk', what: 'quick', o: [-200, 380, 1] }, { kind: 'wall', what: '357', o: [200, -380, 1] }, { kind: 'wall', what: 'smg1', o: [380, 200, 1] },
    { kind: 'perk', what: 'jugg', o: [1100, 250, 1] }, { kind: 'wall', what: 'shotgun', o: [700, 300, 1] }, { kind: 'wall', what: 'ar2', o: [1450, -300, 81] },
    { kind: 'perk', what: 'double', o: [200, -1000, 1] }, { kind: 'wall', what: 'autoshotgun', o: [-200, -1450, 1] },
    { kind: 'perk', what: 'speed', o: [-1150, 400, 1] }, { kind: 'wall', what: 'crossbow', o: [-700, -350, 1] },
    { kind: 'perk', what: 'stamina', o: [1050, 1250, 1] }, { kind: 'wall', what: 'lmg', o: [-1250, -1250, 1] }, { kind: 'wall', what: 'sniper', o: [1250, -1250, 1] }, { kind: 'wall', what: 'grenade', o: [-1250, 1250, 1] },
  ];
  return autoLayout({ name: 'Asylum', boxes: B, decor: D, sun: [0.3, -0.5, 0.6], bounds: [[-E, -E, -40], [E, E, 500]], killZ: -500, pads: [], doors, buys, zstart: [0, 260, 1] }, { spawns: 16, items: 22, props: 8 });
})();

// ------------------------------------------------------------------ Harvest (autumn): a farm at harvest time
// A fenced farmyard round the farmhouse, a two-floor barn with a hayloft, the silo, a tractor, hay bales, the
// pumpkin patch and a corn maze, all under autumn trees. In zombies you start in the yard; the gates are barricaded.
const harvest = (() => {
  const { B, box, stairs } = builder();
  const D = [];
  const deco = (x0, y0, z0, x1, y1, z1, mat) => D.push({ mins: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], maxs: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], mat });
  const E = 2000, YX = 650, YY = 550, FH = 110, GATE = 180;
  const doors = [];
  box(-E - 300, -E - 300, -64, E + 300, E + 300, 0, 'leaves');
  // the cornfield all round the edge: too tall to see over
  box(-E - 60, -E - 60, 0, E + 60, -E, 320, 'corn'); box(-E - 60, E, 0, E + 60, E + 60, 320, 'corn');
  box(-E - 60, -E, 0, -E, E, 320, 'corn'); box(E, -E, 0, E + 60, E, 320, 'corn');
  // tree: a trunk you can hide behind, a canopy of autumn leaves above
  const tree = (x, y, h = 210) => {
    box(x - 13, y - 13, 0, x + 13, y + 13, h, 'wood');
    deco(x - 90, y - 90, h - 30, x + 90, y + 90, h + 40, 'foliage');
    deco(x - 60, y - 60, h + 40, x + 60, y + 60, h + 90, 'foliage');
  };
  // the yard fence, with a barricaded gate on each side
  const fence = (axis, at, a, b, gap, cost) => {
    const g0 = gap - GATE / 2, g1 = gap + GATE / 2;
    if (axis === 'x') { box(a, at - 6, 0, g0, at + 6, FH, 'wood'); box(g1, at - 6, 0, b, at + 6, FH, 'wood'); }
    else { box(at - 6, a, 0, at + 6, g0, FH, 'wood'); box(at - 6, g1, 0, at + 6, b, FH, 'wood'); }
    doors.push({ mins: axis === 'x' ? [g0, at - 18, 0] : [at - 18, g0, 0], maxs: axis === 'x' ? [g1, at + 18, FH] : [at + 18, g1, FH], cost, name: 'Gate' });
  };
  fence('x', YY, -YX, YX, 0, 750); fence('x', -YY, -YX, YX, 0, 1000);
  fence('y', YX, -YY, YY, 0, 1000); fence('y', -YX, -YY, YY, 200, 1250);
  // the farmhouse in the yard: porch, two rooms, a doorway each way
  const fx = -200, fy = 200;
  box(fx - 220, fy - 140, 0, fx + 220, fy - 124, 200, 'wood'); box(fx - 220, fy + 124, 0, fx + 220, fy + 140, 200, 'wood');
  box(fx - 220, fy - 140, 0, fx - 204, fy - 40, 200, 'wood'); box(fx - 220, fy + 40, 0, fx - 204, fy + 140, 200, 'wood'); box(fx - 220, fy - 40, 140, fx - 204, fy + 40, 200, 'wood');
  box(fx + 204, fy - 140, 0, fx + 220, fy - 40, 200, 'wood'); box(fx + 204, fy + 40, 0, fx + 220, fy + 140, 200, 'wood'); box(fx + 204, fy - 40, 140, fx + 220, fy + 40, 200, 'wood');
  box(fx - 10, fy - 124, 0, fx + 10, fy - 30, 200, 'wood'); box(fx - 10, fy + 30, 0, fx + 10, fy + 124, 200, 'wood');
  box(fx - 240, fy - 160, 200, fx + 240, fy + 160, 216, 'roof');
  box(fx - 300, fy - 140, 0, fx - 220, fy + 140, 12, 'wood'); // porch
  box(fx + 60, fy - 100, 0, fx + 160, fy - 60, 34, 'wood'); // kitchen table
  // the yard: hay bales, a well, a scarecrow, trees
  for (const [x, y, n] of [[250, -250, 2], [350, -180, 1], [-450, -300, 3], [480, 300, 1]]) for (let k = 0; k < n; k++) box(x - 30, y - 20 + k * 42, 0, x + 30, y + 20 + k * 42, 40, 'hay');
  box(200, 250, 0, 260, 310, 40, 'stone');
  tree(-500, 420); tree(520, -420); tree(-520, -60, 240);
  // east: the barn, two floors; stairs up to the hayloft; big doors at both ends
  const bx = 1250, by = 300, BW = 360, BL = 520, BH = 300;
  box(bx - BW, by - BL, 0, bx + BW, by - BL + 16, BH, 'barn'); box(bx - BW, by + BL - 16, 0, bx + BW, by + BL, BH, 'barn');
  box(bx - BW, by - BL, 0, bx - BW + 16, by - 120, BH, 'barn'); box(bx - BW, by + 120, 0, bx - BW + 16, by + BL, BH, 'barn'); box(bx - BW, by - 120, 200, bx - BW + 16, by + 120, BH, 'barn');
  box(bx + BW - 16, by - BL, 0, bx + BW, by - 120, BH, 'barn'); box(bx + BW - 16, by + 120, 0, bx + BW, by + BL, BH, 'barn'); box(bx + BW - 16, by - 120, 200, bx + BW, by + 120, BH, 'barn');
  box(bx - BW, by - BL, BH, bx + BW, by + BL, BH + 20, 'roof');
  box(bx - BW + 16, by + 120, 150, bx + BW - 16, by + BL - 16, 164, 'wood'); // hayloft floor
  for (let i = 0; i < 9; i++) box(bx + 200 - i * 28 - 28, by + 40, 0, bx + 200 - i * 28, by + 110, (i + 1) * 16 + 6, 'wood');
  for (const [x, y] of [[bx - 200, by + 300], [bx + 100, by + 380], [bx + 200, by + 220]]) box(x - 30, y - 20, 164, x + 30, y + 20, 204, 'hay');
  for (const [x, y] of [[bx - 220, by - 300], [bx + 200, by - 380], [bx, by - 200]]) box(x - 40, y - 26, 0, x + 40, y + 26, 52, 'hay');
  // the silo and the tractor
  box(1500, -1300, 0, 1700, -1100, 520, 'metal'); deco(1490, -1310, 520, 1710, -1090, 560, 'roof');
  box(900, -900, 0, 1060, -820, 70, 'tractor'); box(1000, -920, 0, 1060, -800, 130, 'tractor');
  for (const [x, y] of [[920, -930], [920, -790]]) box(x - 30, y - 12, 0, x + 30, y + 12, 60, 'roof');
  tree(800, -400); tree(1500, 1100, 240); tree(1700, -500);
  // west: the pumpkin patch (big ones to hide behind, small ones underfoot), an old cart
  for (let i = 0; i < 40; i++) {
    const x = -900 - (i % 8) * 120 - ((i * 37) % 40), y = -900 + Math.floor(i / 8) * 260 + ((i * 53) % 60);
    if (i % 5 === 0) box(x - 26, y - 26, 0, x + 26, y + 26, 40, 'pumpkin'); else deco(x - 12, y - 12, 0, x + 12, y + 12, 18, 'pumpkin');
  }
  box(-1500, 700, 0, -1300, 800, 50, 'wood'); box(-1500, 690, 50, -1300, 700, 90, 'wood');
  tree(-1300, 1300); tree(-1700, -1500); tree(-800, 1500, 230);
  // north and south: the corn maze (south) and an orchard (north)
  const maze = [
    [-1400, -1700, -200, -1680], [-1400, -1700, -1380, -1100], [-1100, -1500, -1080, -800], [-1100, -1500, -300, -1480],
    [-800, -1300, -780, -700], [-600, -1700, -580, -1200], [-400, -1300, -100, -1280], [-200, -1100, -180, -700],
    [100, -1500, 120, -900], [100, -1500, 700, -1480], [400, -1300, 420, -700], [400, -1300, 900, -1280], [700, -1100, 1200, -1080], [1200, -1700, 1220, -1100],
  ];
  for (const [x0, y0, x1, y1] of maze) box(x0, y0, 0, x1, y1, 180, 'corn');
  for (const x of [-500, -150, 200]) for (const y of [900, 1250, 1600]) tree(x, y, 190);
  const buys = [
    { kind: 'box', o: [bx, by - 300, 1] },
    { kind: 'perk', what: 'quick', o: [-400, 420, 1] }, { kind: 'wall', what: '357', o: [380, -420, 1] }, { kind: 'wall', what: 'smg1', o: [-560, -200, 1] },
    { kind: 'perk', what: 'jugg', o: [bx + 100, by + 300, 165] }, { kind: 'wall', what: 'shotgun', o: [bx - 250, by - 400, 1] }, { kind: 'wall', what: 'ar2', o: [1300, -900, 1] },
    { kind: 'perk', what: 'speed', o: [0, 900, 1] }, { kind: 'wall', what: 'crossbow', o: [-200, 1400, 1] },
    { kind: 'perk', what: 'double', o: [-1000, 0, 1] }, { kind: 'wall', what: 'autoshotgun', o: [-1500, 600, 1] },
    { kind: 'perk', what: 'stamina', o: [0, -1600, 1] }, { kind: 'wall', what: 'lmg', o: [800, -1600, 1] }, { kind: 'wall', what: 'sniper', o: [1600, -1500, 1] }, { kind: 'wall', what: 'grenade', o: [-1600, -1200, 1] },
  ];
  return autoLayout({ name: 'Harvest', mood: 'fall', boxes: B, decor: D, sun: [-0.6, -0.5, 0.45], bounds: [[-E, -E, -40], [E, E, 600]], killZ: -500, pads: [], doors, buys, zstart: [0, 0, 1] }, { spawns: 18, items: 24, props: 10 });
})();

// ------------------------------------------------------------------ Hollow (autumn): a village in the woods
// A cobbled square with a well, the chapel (climb the bell tower), log cabins, a graveyard, and a creek with a
// covered bridge. Leaves everywhere.
const hollow = (() => {
  const { B, box, stairs } = builder();
  const D = [];
  const deco = (x0, y0, z0, x1, y1, z1, mat) => D.push({ mins: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], maxs: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], mat });
  const E = 1800;
  // ground in two halves either side of the creek (a channel 48 deep from y -760 to -560)
  box(-E - 200, -560, -64, E + 200, E + 200, 0, 'leaves');
  box(-E - 200, -E - 200, -64, E + 200, -760, 0, 'leaves');
  box(-E - 200, -760, -112, E + 200, -560, -48, 'cobble');
  deco(-E - 200, -760, -46, E + 200, -560, -44, 'water');
  // banks: a step down at each end so you can climb out
  for (const x of [-1500, 600, 1500]) { stairs(x, -644, -48, '+y', 120, 3, 'cobble'); stairs(x, -676, -48, '-y', 120, 3, 'cobble'); }
  // woods all round: a ring of big trunks against a hedge
  box(-E - 60, -E - 60, 0, E + 60, -E, 300, 'foliage'); box(-E - 60, E, 0, E + 60, E + 60, 300, 'foliage');
  box(-E - 60, -E, 0, -E, E, 300, 'foliage'); box(E, -E, 0, E + 60, E, 300, 'foliage');
  const tree = (x, y, h = 230) => {
    box(x - 15, y - 15, 0, x + 15, y + 15, h, 'wood');
    deco(x - 100, y - 100, h - 40, x + 100, y + 100, h + 40, 'foliage');
    deco(x - 70, y - 70, h + 40, x + 70, y + 70, h + 100, 'foliage');
  };
  // the square: cobbles, the well, market stalls
  deco(-500, -400, 0, 500, 400, 0.5, 'cobble');
  box(-50, -50, 0, 50, 50, 40, 'stone'); box(-50, -50, 40, -40, 50, 120, 'wood'); box(40, -50, 40, 50, 50, 120, 'wood'); box(-55, -55, 120, 55, 55, 130, 'roof');
  for (const [x, y] of [[-320, -250], [320, 250], [320, -250]]) { box(x - 70, y - 30, 0, x + 70, y + 30, 40, 'wood'); deco(x - 80, y - 40, 110, x + 80, y + 40, 116, 'awning'); for (const dx of [-70, 70]) box(x + dx - 4, y - 4, 40, x + dx + 4, y + 4, 110, 'wood'); }
  // the chapel to the north: nave with a doorway, and the bell tower with stairs to the top
  const cx = 0, cy = 900;
  box(cx - 260, cy - 300, 0, cx - 60, cy - 284, 260, 'stone'); box(cx + 60, cy - 300, 0, cx + 260, cy - 284, 260, 'stone'); box(cx - 60, cy - 300, 180, cx + 60, cy - 284, 260, 'stone');
  box(cx - 260, cy + 284, 0, cx + 260, cy + 300, 260, 'stone');
  box(cx - 260, cy - 300, 0, cx - 244, cy + 300, 260, 'stone'); box(cx + 244, cy - 300, 0, cx + 260, cy + 300, 260, 'stone');
  box(cx - 280, cy - 320, 260, cx + 280, cy + 320, 280, 'roof');
  for (const y of [cy - 150, cy - 50, cy + 50]) for (const x of [cx - 150, cx + 70]) box(x, y - 14, 0, x + 80, y + 14, 22, 'wood'); // pews
  box(cx - 60, cy + 200, 0, cx + 60, cy + 260, 40, 'stone'); // altar
  const tx = cx + 380, ty = cy + 120;
  // the bell tower: a doorway on the south side, a stair round the inside walls, the belfry floor on top
  box(tx - 100, ty + 84, 0, tx + 100, ty + 100, 440, 'stone'); box(tx + 84, ty - 84, 0, tx + 100, ty + 84, 440, 'stone');
  box(tx - 100, ty - 84, 0, tx - 84, ty + 84, 440, 'stone'); box(tx - 100, ty - 100, 0, tx - 84, ty - 84, 440, 'stone');
  box(tx - 20, ty - 100, 0, tx + 100, ty - 84, 440, 'stone'); box(tx - 84, ty - 100, 140, tx - 20, ty - 84, 440, 'stone');
  for (let i = 0; i < 26; i++) {
    const side = Math.floor(i / 6) % 4, k = i % 6;
    const [x0, y0] = [[tx - 60 + k * 22, ty - 70], [tx + 50, ty - 60 + k * 22], [tx + 60 - k * 22, ty + 50], [tx - 70, ty + 60 - k * 22]][side];
    box(x0 - 12, y0 - 14, 0, x0 + 12, y0 + 14, (i + 1) * 16, 'wood');
  }
  box(tx - 26, ty - 84, 400, tx + 84, ty + 84, 416, 'wood'); // the belfry floor, past the top of the stair
  for (const [x, y] of [[tx - 100, ty - 100], [tx + 84, ty - 100], [tx - 100, ty + 84], [tx + 84, ty + 84]]) box(x, y, 440, x + 16, y + 16, 600, 'stone');
  box(tx - 110, ty - 110, 600, tx + 110, ty + 110, 620, 'roof');
  // graveyard beside the chapel: a low wall and headstones
  box(-800, 650, 0, -350, 662, 50, 'stone'); box(-800, 1250, 0, -350, 1262, 50, 'stone'); box(-812, 650, 0, -800, 1262, 50, 'stone');
  for (let i = 0; i < 12; i++) { const x = -740 + (i % 4) * 110, y = 750 + Math.floor(i / 4) * 160; box(x - 18, y - 5, 0, x + 18, y + 5, 46 + (i % 3) * 8, 'stone'); }
  // log cabins round the square, each with a doorway and a window
  const cabin = (x, y, doorEast) => {
    const w = 170, d = 130, h = 170, t = 7;
    box(x - w, y - d, 0, x + w, y - d + 14, h, 'logs'); box(x - w, y + d - 14, 0, x + w, y + d, h, 'logs');
    const dx = doorEast ? x + w : x - w, wx = doorEast ? x - w : x + w;
    box(dx - t, y - d, 0, dx + t, y - 40, h, 'logs'); box(dx - t, y + 40, 0, dx + t, y + d, h, 'logs'); box(dx - t, y - 40, 130, dx + t, y + 40, h, 'logs');
    box(wx - t, y - d, 0, wx + t, y + d, 70, 'logs'); box(wx - t, y - d, 130, wx + t, y + d, h, 'logs');
    box(wx - t, y - d, 70, wx + t, y - 40, 130, 'logs'); box(wx - t, y + 40, 70, wx + t, y + d, 130, 'logs');
    box(x - w - 20, y - d - 20, h, x + w + 20, y + d + 20, h + 16, 'roof');
    box(x - 60, y - 40, 0, x + 20, y + 10, 34, 'wood');
  };
  cabin(-900, 100, true); cabin(900, 100, false); cabin(-900, -300, true); cabin(900, -350, false); cabin(1300, 900, false);
  // the covered bridge over the creek
  box(-80, -800, 0, 80, -520, 12, 'wood');
  for (const x of [-80, 66]) { box(x, -800, 12, x + 14, -520, 60, 'wood'); for (const y of [-790, -660, -530]) box(x, y, 12, x + 14, y + 12, 180, 'wood'); }
  box(-100, -820, 180, 100, -500, 196, 'roof');
  // a footbridge at the east end, logs at the west
  box(1200, -780, 0, 1260, -540, 10, 'wood');
  box(-1300, -700, -48, -1240, -620, -10, 'wood');
  // south bank: a mill and its pond edge, stacked logs
  box(-200, -1300, 0, 200, -1100, 180, 'stone'); box(-200, -1316, 180, 200, -1084, 196, 'roof'); box(-60, -1100, 0, 60, -1090, 120, 'wood');
  for (const [x, y] of [[600, -1100], [-700, -1200], [1000, -1400]]) for (let k = 0; k < 3; k++) box(x - 70, y - 14 + k * 30, 0, x + 70, y + 14 + k * 30, 28 - k * 0, 'logs');
  // trees everywhere outside the square
  for (const [x, y] of [[-600, -500], [650, 500], [-1400, 600], [1400, -100], [-1200, -1100], [1300, -1300], [-300, -1500], [500, 1500], [-1500, 1500], [1600, 1600], [-1500, -300], [1500, 400], [300, -1500], [-1000, 1400], [800, 1200]]) tree(x, y);
  return autoLayout({ name: 'Hollow', mood: 'fall', boxes: B, decor: D, sun: [0.6, -0.4, 0.45], bounds: [[-E, -E, -120], [E, E, 700]], killZ: -500, pads: [] }, { spawns: 16, items: 24, props: 10 });
})();

export const MODE_MAPS = { soccer: 'pitch', parkour: 'course', mugrball: 'court', heist: 'bank', freeplay: 'county' };

// ------------------------------------------------------------------ The Art House (heist): a museum on a city street
// Lobby with the ticket desk → three galleries (paintings, sculptures, display cases) → the staff door (keycard)
// → the back corridor: security room (monitors, alarm wiring), the curator's office (a keycard on the desk) and the
// strongroom behind a vault door, where the private collection is: paintings to cut from their frames and cases of
// jewels to smash. A back door opens onto the loading dock in the alley; the van waits on the street.
const arthouse = (() => {
  const { B, box } = builder();
  const D = [];
  const deco = (x0, y0, z0, x1, y1, z1, mat) => D.push({ mins: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], maxs: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], mat });
  const H = 300;
  box(-1500, -1400, -64, 1500, 1100, 0, 'concrete');
  deco(-1500, -1300, 0, 1500, -760, 0.4, 'asphalt');
  for (let x = -1450; x < 1500; x += 220) deco(x, -1034, 0.4, x + 110, -1026, 0.8, 'line');
  deco(-1500, -760, 0, 1500, -748, 6, 'concrete');
  box(-1500, -520, 0, -760, 1000, 420, 'brick');
  box(900, -520, 0, 1500, 1000, 460, 'brick');
  box(-1500, 1000, 0, 1500, 1100, 300, 'brick');
  box(-1500, -1400, 0, 1500, -1310, 460, 'panel');
  box(-1520, -1400, 0, -1500, 1100, 700, 'clip'); box(1500, -1400, 0, 1520, 1100, 700, 'clip');
  box(-1520, -1420, 700, 1520, 1120, 720, 'clip');
  for (const [x, y] of [[-480, -900], [300, -960], [820, -880], [-200, -1180], [1150, -1160]]) box(x - 85, y - 40, 0, x + 85, y + 40, 58, 'metal');
  box(-1160, -850, 0, -900, -750, 112, 'clip'); // the van
  // ---- the museum: a stone front with columns, glass windows, a tall entrance
  box(-700, -540, 0, -80, -520, H, 'stone'); box(80, -540, 0, 700, -520, H, 'stone'); box(-80, -540, 200, 80, -520, H, 'stone');
  for (const x of [-560, 300]) deco(x, -542, 60, x + 260, -540, 220, 'glass');
  for (const x of [-640, -330, 330, 640]) box(x - 18, -600, 0, x + 18, -560, H, 'marble'); // the portico
  box(-700, -620, H - 20, 700, -540, H, 'marble');
  deco(-160, -620, H + 4, 160, -600, H + 40, 'neon');
  box(-700, 600, 0, 700, 620, H, 'stone');
  box(-700, -520, 0, -680, 600, H, 'stone');
  box(680, -520, 0, 700, 340, H, 'stone'); box(680, 430, 0, 700, 600, H, 'stone'); box(680, 340, 150, 700, 430, H, 'stone');
  box(-720, -560, H, 720, 640, H + 20, 'plate');
  deco(-680, -520, 0, 680, 600, 0.5, 'marble');
  // lobby: the ticket desk, benches, two sculptures on plinths, columns
  box(-200, -300, 0, 200, -270, 46, 'wood'); deco(-204, -304, 46, 204, -266, 50, 'marble');
  for (const x of [-420, 420]) box(x - 70, -440, 0, x + 70, -416, 22, 'wood');
  for (const x of [-480, 480]) { box(x - 30, -330, 0, x + 30, -270, 70, 'marble'); deco(x - 14, -314, 70, x + 14, -286, 150, 'stone'); }
  for (const x of [-300, 300]) box(x - 20, -220, 0, x + 20, -180, H, 'marble');
  // the wall between the lobby and the galleries (three openings)
  for (const [x0, x1] of [[-680, -520], [-400, -60], [60, 400], [520, 680]]) box(x0, -140, 0, x1, -120, H, 'panel');
  for (const [x0, x1] of [[-520, -400], [-60, 60], [400, 520]]) box(x0, -140, 200, x1, -120, H, 'panel');
  // galleries: two partitions with doorways, a centre plinth, cases, paintings on every wall
  for (const x of [-260, 240]) { box(x, -120, 0, x + 20, 40, H, 'panel'); box(x, 140, 0, x + 20, 300, H, 'panel'); box(x, 40, 200, x + 20, 140, H, 'panel'); }
  box(-60, 40, 0, 60, 160, 50, 'marble'); deco(-24, 76, 50, 24, 124, 190, 'stone');
  for (const x of [-470, 470]) { box(x - 60, 60, 0, x + 60, 100, 38, 'wood'); deco(x - 56, 62, 38, x + 56, 98, 60, 'glass'); }
  const art = (x0, y0, x1, y1) => deco(x0, y0, 90, x1, y1, 200, 'painting');
  for (const y of [-100, 60, 200]) { art(-679, y, -676, y + 80); art(676, y, 679, y + 80); }
  for (const x of [-620, -420, -180, 120, 420, 600]) art(x - 50, 296, x + 50, 299);
  for (const y of [-80, 180]) { art(-239, y, -236, y + 70); art(236, y, 239, y + 70); art(-264, y, -261, y + 70); art(261, y, 264, y + 70); }
  // the staff door (keycard) into the back corridor
  box(-680, 300, 0, -40, 320, H, 'panel'); box(40, 300, 0, 680, 320, H, 'panel'); box(-40, 300, 150, 40, 320, H, 'panel');
  // the corridor's north wall: doorways to the security room and the office, the strongroom's vault door
  for (const [x0, x1] of [[-680, -500], [-430, -160], [-90, 300], [420, 680]]) box(x0, 440, 0, x1, 460, H, [x0 >= 420 || x1 === 300 ? 'metal' : 'panel'][0]);
  for (const [x0, x1] of [[-500, -430], [-160, -90]]) box(x0, 440, 140, x1, 460, H, 'panel');
  box(300, 440, 160, 420, 460, H, 'metal');
  box(256, 434, 40, 284, 440, 90, 'hazard'); // the lock panel
  box(-260, 460, 0, -240, 600, H, 'panel');
  box(60, 460, 0, 80, 600, H, 'metal');
  // security room: monitor desk and the alarm wiring
  box(-660, 500, 0, -600, 580, 40, 'metal'); deco(-670, 500, 40, -660, 580, 100, 'neon');
  box(-680, 470, 70, -664, 510, 120, 'hazard');
  // the curator's office
  box(-160, 505, 0, 0, 550, 38, 'wood');
  art(-239, 480, -236, 560);
  // the strongroom: easels with the private collection and glass cases of jewels
  for (const [x, y] of [[220, 510], [330, 550], [440, 550], [540, 510]]) box(x - 12, y + 22, 0, x + 12, y + 34, 60, 'wood');
  for (const [x, y] of [[110, 490], [110, 560], [650, 490], [650, 560]]) box(x - 18, y - 18, 0, x + 18, y + 18, 34, 'wood');
  const items = [
    { kind: 'ammo', o: [-1180, -660, 0] }, { kind: 'health', o: [-1100, -620, 0] }, { kind: 'battery', o: [-1020, -620, 0] },
    { kind: 'ammo', o: [-560, 380, 0] }, { kind: 'health', o: [560, 380, 0] },
  ];
  const spawns = [[-1180, -690], [-1100, -680], [-1020, -680], [-940, -690]].map(([x, y]) => ({ origin: [x, y, 1], yaw: 30 }));
  return {
    name: 'The Art House', boxes: B, decor: D, sun: [0.4, 0.3, 0.85], bounds: [[-1500, -1400, -40], [1500, 1100, 420]], killZ: -500, pads: [],
    spawns, items, props: [],
    doors: [
      { mins: [-40, 302, 0], maxs: [40, 318, 150], name: 'staff' },
      { mins: [300, 442, 0], maxs: [420, 458, 160], name: 'vault' },
      { mins: [682, 340, 0], maxs: [698, 430, 150], name: 'back' },
    ],
    heist: {
      title: 'The Art House',
      labels: {
        keycard: 'Take the curator\'s keycard', cardWhere: 'curator\'s office, or the head of security', staff: 'Open the staff door', back: 'Open the loading dock door',
        cams: 'Loop the cameras', camsWhere: 'security room', wires: 'Cut the alarm wiring', vault: 'the strongroom', hack: 'Hack the strongroom lock', drill: 'Set up the thermal drill',
        cart: 'Cut the painting from its frame', carts: 'the paintings', box: 'Smash the display case', boxes: 'jewel cases', escape: 'Get in the van and go', ride: 'the van', bagFull: 'Get it to the van (G throws it)', opened: 'THE STRONGROOM IS OPEN',
      },
      loot: 'painting', boxLoot: 'case', escape: 'van', bagCash: 42000, boxCash: 4500, cartDraw: [0, 16],
      board: { lo: [-1250, -1000], hi: [900, 660], rooms: [['LOBBY', -80, -420], ['WEST GALLERY', -560, 250], ['GRAND GALLERY', -110, 250], ['EAST GALLERY', 300, 250], ['CORRIDOR', -80, 400], ['SECURITY', -620, 590], ['CURATOR', -200, 590], ['STRONGROOM', 300, 590], ['STREET', -300, -820], ['ALLEY', 760, 300]] },
      inside: [[-680, -520, 0], [680, 600, H]],
      restricted: [[-680, 300, 0], [680, 600, H]],
      van: { o: [-1050, -690, 0], r: 170 },
      alarms: [[-650, -300, 0], [-640, 380, 0]],
      phones: [[-150, -250, 0], [150, -250, 0], [-80, 575, 0]],
      exits: [[0, -700, 0], [780, 385, 0]],
      keycard: [-80, 528, 40],
      terminal: [-570, 540, 0],
      wiring: [-620, 480, 0],
      panel: [270, 405, 0],
      doorUse: { staff: [[0, 280, 0], [0, 340, 0]], back: [[650, 385, 0]], vault: [[360, 420, 0]] },
      carts: [[220, 510, 0], [330, 550, 0], [440, 550, 0], [540, 510, 0]],
      boxes: [[150, 490, 0], [150, 560, 0], [610, 490, 0], [610, 560, 0]],
      guards: [
        { o: [-120, -470], yaw: 90, post: true, look: [60, 130] },
        { route: [[-550, -360], [550, -360], [550, -200], [-550, -200]] },
        { route: [[-450, -50], [-450, 250], [0, 220], [450, 250], [450, -50], [0, -40]] },
        { o: [100, 270], yaw: 250, post: true, look: [-40, 60] },
        { route: [[-600, 380], [600, 380]], min: 1 },
        { o: [-560, 540], yaw: 180, post: true, look: [150, 210], cams: true, min: 1 },
        { route: [[-650, -660], [780, -660], [780, 700], [780, -660]], min: 2 },
        { route: [[-300, -250], [300, -250], [0, -60], [0, 220], [-500, 220], [0, 220]], captain: true, min: 1 },
      ],
      cameras: [
        { o: [-660, -500, 250], yaw: 45, sweep: 35 },
        { o: [660, -500, 250], yaw: 135, sweep: 35 },
        { o: [0, -110, 250], yaw: 90, sweep: 50 },
        { o: [-660, -100, 250], yaw: 45, sweep: 25 },
        { o: [660, -100, 250], yaw: 135, sweep: 25, min: 1 },
        { o: [-660, 330, 250], yaw: 0, sweep: 20, min: 1 },
      ],
      staff: [
        { o: [0, -250], yaw: -90, kind: 'teller' },
        { o: [-80, 575], yaw: -90, kind: 'manager' },
        { o: [-450, 0], kind: 'customer', route: [[-450, 0], [-450, 220], [0, 220], [450, 220], [450, 0], [0, -360]] },
        { o: [300, -350], kind: 'customer', route: [[300, -350], [0, 220], [-450, 150], [-300, -350]] },
        { o: [100, 0], kind: 'customer', route: [[100, 0], [450, 150], [-200, -380]], min: 1 },
      ],
      police: [[1450, -1100], [1450, -880], [780, 960], [-300, 960], [-1440, -1240]],
    },
  };
})();

// ------------------------------------------------------------------ The Compound (heist): a walled estate by the sea
// A raid in the spirit of the island-mansion jobs: the crew comes ashore at the dock, west of the walls. In through
// the drainage grate under the west wall (cut it) or round to the guarded main gate on the south side. Grounds with
// patrols, a fountain and a pool; the house: the foyer, the office wing behind a keycard door (security room, the
// boss's study with his keycard, the vault full of gold and a row of safes). Out the same way to the boat.
const mansion = (() => {
  const { B, box } = builder();
  const D = [];
  const deco = (x0, y0, z0, x1, y1, z1, mat) => D.push({ mins: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], maxs: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], mat });
  const W = 320, H = 280;
  box(-1700, -1100, -64, 1300, 1200, 0, 'grass');
  deco(-1700, -1100, 0, -1300, 1200, 3, 'water'); // the shallows by the dock
  deco(-1300, -1100, 0, -1060, 1200, 0.5, 'sand');
  deco(-1300, -900, 0, 1300, -700, 0.5, 'asphalt'); // the coast road
  box(-1720, -1100, 0, -1700, 1200, 700, 'clip'); box(1300, -1100, 0, 1320, 1200, 700, 'clip');
  box(-1700, -1120, 0, 1300, -1100, 700, 'clip'); box(-1700, 1200, 0, 1300, 1220, 700, 'clip');
  box(-1720, -1120, 700, 1320, 1220, 720, 'clip');
  // the dock and the getaway boat (drawn by the heist view)
  box(-1400, 40, 0, -1100, 240, 12, 'wood');
  box(-1560, 80, 0, -1410, 200, 60, 'clip');
  // ---- the walls, a gate on the south side, the drainage grate (a door) in the west wall
  box(-900, -520, 0, -100, -500, W, 'stucco'); box(100, -520, 0, 900, -500, W, 'stucco');
  for (const x of [-120, 100]) box(x, -540, 0, x + 20, -480, W + 40, 'stone'); // gate posts
  box(-900, 880, 0, 900, 900, W, 'stucco');
  box(900, -520, 0, 920, 900, W, 'stucco');
  box(-920, -520, 0, -900, 100, W, 'stucco'); box(-920, 180, 0, -900, 900, W, 'stucco'); box(-920, 100, 140, -900, 180, W, 'stucco');
  box(150, -620, 0, 280, -540, 150, 'stucco'); // gatehouse outside
  // ---- the grounds: a fountain, palms, the pool, an outbuilding, hedges
  box(-90, -340, 0, 90, -160, 30, 'stone'); deco(-80, -330, 30, 80, -170, 32, 'water'); deco(-12, -262, 30, 12, -238, 110, 'stone');
  deco(520, -320, 0, 860, -40, 2, 'water'); box(500, -340, 0, 880, -320, 12, 'stone'); box(500, -40, 0, 880, -20, 12, 'stone');
  box(-860, -460, 0, -600, -260, 240, 'stucco'); deco(-870, -470, 240, -590, -250, 270, 'roof');
  for (const [x0, y0, x1, y1] of [[-860, 640, -600, 680], [600, 640, 860, 680], [-860, 260, -760, 560], [760, 260, 860, 560]]) box(x0, y0, 0, x1, y1, 70, 'hedge');
  for (const [x, y] of [[-620, -180], [-400, -330], [400, -420], [700, 100], [-700, 760], [700, 760], [-300, 760], [300, 760]]) { box(x - 10, y - 10, 0, x + 10, y + 10, 320, 'bark'); deco(x - 90, y - 90, 300, x + 90, y + 90, 330, 'palm'); }
  // ---- the house
  box(-520, 0, 0, -70, 20, H, 'stucco'); box(70, 0, 0, 520, 20, H, 'stucco'); box(-70, 0, 200, 70, 20, H, 'stucco');
  for (const x of [-420, -250, 250, 420]) deco(x - 50, -2, 80, x + 50, 0, 200, 'glass');
  for (const x of [-140, 140]) box(x - 18, -110, 0, x + 18, -74, H, 'marble'); // porch columns
  box(-180, -120, H - 16, 180, 0, H, 'stucco');
  box(-520, 600, 0, 520, 620, H, 'stucco');
  box(-520, 0, 0, -500, 600, H, 'stucco'); box(500, 0, 0, 520, 600, H, 'stucco');
  box(-540, -20, H, 540, 640, H + 20, 'roof');
  deco(-500, 20, 0, 500, 600, 0.5, 'marble');
  // foyer: columns, sofas, a statue
  for (const x of [-250, 250]) box(x - 22, 118, 0, x + 22, 162, H, 'marble');
  for (const x of [-400, 400]) box(x - 80, 60, 0, x + 80, 100, 30, 'leather');
  box(-30, 130, 0, 30, 190, 50, 'marble'); deco(-14, 146, 50, 14, 174, 150, 'gold');
  // the office wing door (keycard), the corridor, its rooms
  box(-500, 260, 0, -40, 280, H, 'stucco'); box(40, 260, 0, 500, 280, H, 'stucco'); box(-40, 260, 150, 40, 280, H, 'stucco');
  for (const [x0, x1] of [[-500, -380], [-310, -130], [-60, 260], [380, 500]]) box(x0, 400, 0, x1, 420, H, x0 >= 380 ? 'metal' : 'stucco');
  for (const [x0, x1] of [[-380, -310], [-130, -60]]) box(x0, 400, 140, x1, 420, H, 'stucco');
  box(260, 400, 160, 380, 420, H, 'metal');
  box(216, 394, 40, 244, 400, 90, 'hazard');
  box(-200, 420, 0, -180, 600, H, 'stucco');
  box(100, 420, 0, 120, 600, H, 'metal');
  box(-480, 460, 0, -420, 560, 40, 'metal'); deco(-490, 460, 40, -480, 560, 100, 'neon');
  box(-500, 440, 70, -484, 480, 120, 'hazard');
  box(-120, 500, 0, 40, 550, 38, 'wood');
  deco(-179, 460, 90, -176, 560, 200, 'painting');
  // the vault: gold stacked on pallets, safes along the walls
  for (const x of [170, 270, 370, 460]) box(x - 26, 556, 0, x + 26, 584, 20, 'wood');
  for (const x of [140, 480]) box(x - 16, 433, 0, x + 16, 457, 50, 'metal');
  const items = [
    { kind: 'ammo', o: [-1200, -40, 0] }, { kind: 'health', o: [-1200, 320, 0] }, { kind: 'battery', o: [-1150, 380, 0] },
    { kind: 'ammo', o: [-450, 340, 0] }, { kind: 'health', o: [450, 340, 0] },
  ];
  const spawns = [[-1220, 60], [-1220, 120], [-1220, 180], [-1220, 240]].map(([x, y]) => ({ origin: [x, y, 13], yaw: 0 }));
  return {
    name: 'The Compound', boxes: B, decor: D, sun: [0.5, 0.25, 0.8], bounds: [[-1700, -1100, -40], [1300, 1200, 420]], killZ: -500, pads: [], mood: 'day',
    spawns, items, props: [],
    doors: [
      { mins: [-40, 262, 0], maxs: [40, 278, 150], name: 'staff' },
      { mins: [260, 402, 0], maxs: [380, 418, 160], name: 'vault' },
      { mins: [-918, 100, 0], maxs: [-902, 180, 140], name: 'back' },
    ],
    heist: {
      title: 'The Compound',
      labels: {
        keycard: 'Take the boss\'s keycard', cardWhere: 'the boss\'s study, or the head of security', staff: 'Open the office wing', back: 'Cut through the drainage grate',
        cams: 'Loop the cameras', camsWhere: 'security room', wires: 'Cut the alarm wiring', vault: 'the vault', hack: 'Crack the vault', drill: 'Set up the drill',
        cart: 'Bag the gold', carts: 'the gold', box: 'Crack the safe', boxes: 'safes', escape: 'Get on the boat and go', ride: 'the boat', bagFull: 'Get it to the boat (G throws it)', opened: 'THE VAULT IS OPEN',
      },
      loot: 'gold', boxLoot: 'safe', escape: 'boat', bagCash: 52000, boxCash: 9000, cartDraw: [0, 55], backNeed: 4,
      board: { lo: [-1450, -760], hi: [1000, 940], rooms: [['DOCK', -1340, 300], ['GROUNDS', -700, 0], ['GATE', -60, -600], ['FOYER', -80, 220], ['CORRIDOR', -80, 360], ['SECURITY', -470, 590], ['STUDY', -140, 590], ['VAULT', 240, 590], ['POOL', 620, -180]] },
      inside: [[-900, -500, 0], [900, 880, 400]],
      restricted: [[-900, -500, 0], [900, 880, 400]],
      van: { o: [-1250, 140, 0], r: 200 },
      alarms: [[-480, 40, 0], [-470, 578, 0]],
      phones: [[-60, 570, 0], [400, 40, 0]],
      exits: [[0, -700, 0], [-1000, 140, 0]],
      keycard: [-40, 525, 40],
      terminal: [-390, 510, 0],
      wiring: [-440, 440, 0],
      panel: [230, 365, 0],
      doorUse: { staff: [[0, 240, 0], [0, 300, 0]], back: [[-950, 140, 0], [-860, 140, 0]], vault: [[320, 380, 0]] },
      carts: [[170, 515, 0], [270, 515, 0], [370, 515, 0], [460, 515, 0]],
      boxes: [[140, 485, 0], [480, 485, 0]],
      guards: [
        { o: [-60, -570], yaw: -90, post: true, look: [-150, -30] },
        { o: [60, -570], yaw: -90, post: true, look: [-150, -30] },
        { route: [[-560, -420], [800, -420], [800, 800], [-800, 800], [-800, -150]] },
        { o: [0, 230], yaw: -90, post: true, look: [-150, -30] },
        { route: [[-700, -100], [-700, 700], [700, 700], [700, -100]], min: 1 },
        { route: [[-450, 340], [450, 340]], min: 1 },
        { o: [-360, 545], yaw: 180, post: true, look: [150, 210], cams: true },
        { route: [[-560, -460], [850, -460], [850, 850], [-850, 850], [-850, -200]], min: 2 },
        { route: [[-300, 100], [300, 100], [0, 230], [0, 340], [-400, 340], [0, 340]], captain: true },
      ],
      cameras: [
        { o: [-880, -480, 300], yaw: 45, sweep: 35 },
        { o: [880, -480, 300], yaw: 135, sweep: 35 },
        { o: [0, 30, 240], yaw: 90, sweep: 45 },
        { o: [-490, 290, 240], yaw: 0, sweep: 20, min: 1 },
        { o: [-880, 860, 300], yaw: -45, sweep: 30, min: 1 },
        { o: [880, 860, 300], yaw: -135, sweep: 30, min: 2 },
      ],
      staff: [
        { o: [-60, 570], yaw: -90, kind: 'manager' },
        { o: [300, 120], kind: 'customer', route: [[300, 120], [-300, 120], [-300, 200], [300, 200]] },
        { o: [600, -200], kind: 'customer', route: [[600, -200], [200, -350], [-300, -300], [200, -350]] },
      ],
      police: [[1200, -1000], [0, -1000], [-600, -1000], [1200, 1100]],
    },
  };
})();

// ------------------------------------------------------------------ Mugr County (free roam): built a cell at a time by citygen.js
const county = {
  name: 'Mugr County', boxes: [], stream: true, pads: [], items: [], props: [], flags: null, killZ: -160, mood: 'city', sun: [0.45, 0.3, 0.84],
  bounds: [[-HALF, -HALF, -200], [HALF, HALF, 8000]],
  spawns: HOSPITALS.flatMap((h) => h.spawns),
};

// the jobs you can pick in the Heist menu (each map carries its own heist data)
export const HEIST_MAPS = ['bank', 'arthouse', 'mansion'];
export const CODE_MAPS = { county, arthouse, mansion, foundry, courtyard, skyline, warehouse, rooftops, bunker, ziggurat, docks, canyon, office, station, city, pitch, course, court, bank, asylum, harvest, hollow };
