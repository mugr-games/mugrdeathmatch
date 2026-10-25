// Maps built in code (original layouts). Each: name, boxes, sun, spawns, items, props, pads, flags, bounds, killZ.
// Units: 1 ≈ 1 inch, Z up. Materials: concrete, plate, metal, panel, hazard, neon.
import { ARENA } from './arena.js';
import { MV } from './pmove.js';
import { BoxWorld } from './collide.js';
import { floorGraph } from './nav.js';
import { ITEM_ROTATION } from './weapons.js';

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
export const MODE_MAPS = { soccer: 'pitch', parkour: 'course', mugrball: 'court' };

export const CODE_MAPS = { foundry, courtyard, skyline, warehouse, rooftops, bunker, ziggurat, docks, canyon, office, station, city, pitch, course, court };
