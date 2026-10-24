// "Foundry": an original arena built from boxes. Units match the movement code (1 unit ≈ 1 inch, Z up).
// A sunken central yard with a raised plinth, four corner blockhouses with rooftop catwalks, and cover.
// Materials: concrete, plate (floor tread), metal, panel, hazard, neon.

const B = [];
const box = (x0, y0, z0, x1, y1, z1, mat = 'concrete') =>
  B.push({ mins: [Math.min(x0, x1), Math.min(y0, y1), Math.min(z0, z1)], maxs: [Math.max(x0, x1), Math.max(y0, y1), Math.max(z0, z1)], mat });

// Straight stairs: start at (x, y) at height z0, climbing along dir ('+x', '-x', '+y', '-y').
function stairs(x, y, z0, dir, width, steps, mat = 'plate', rise = 16, run = 28) {
  for (let i = 0; i < steps; i++) {
    const a = i * run, b = (i + 1) * run, top = z0 + (i + 1) * rise;
    const w = width / 2;
    if (dir === '+x') box(x + a, y - w, z0, x + b, y + w, top, mat);
    if (dir === '-x') box(x - a, y - w, z0, x - b, y + w, top, mat);
    if (dir === '+y') box(x - w, y + a, z0, x + w, y + b, top, mat);
    if (dir === '-y') box(x - w, y - a, z0, x + w, y - b, top, mat);
  }
}

const S = 1792; // half size of the play space
const H = 896; // outer wall height

// ground and outer shell
box(-S - 64, -S - 64, -64, S + 64, S + 64, 0, 'plate');
box(-S - 64, -S - 64, 0, -S, S + 64, H, 'panel');
box(S, -S - 64, 0, S + 64, S + 64, H, 'panel');
box(-S, -S - 64, 0, S, -S, H, 'panel');
box(-S, S, 0, S, S + 64, H, 'panel');
// skirting and a lit band around the shell
box(-S, -S, 0, -S + 16, S, 48, 'hazard'); box(S - 16, -S, 0, S, S, 48, 'hazard');
box(-S, -S, 0, S, -S + 16, 48, 'hazard'); box(-S, S - 16, 0, S, S, 48, 'hazard');
box(-S, -S, 560, -S + 8, S, 572, 'neon'); box(S - 8, -S, 560, S, S, 572, 'neon');
box(-S, -S, 560, S, -S + 8, 572, 'neon'); box(-S, S - 8, 560, S, S, 572, 'neon');

// central plinth with stairs on two sides and a pillar for cover
box(-288, -288, 0, 288, 288, 112, 'concrete');
box(-288, -288, 112, 288, 288, 120, 'metal');
stairs(-288 - 7 * 28, 0, 0, '+x', 160, 7);
stairs(288 + 7 * 28, 0, 0, '-x', 160, 7);
box(-48, -48, 120, 48, 48, 264, 'panel');
box(-56, -56, 264, 56, 56, 276, 'neon');

// corner blockhouses: hollow, two doorways each, roof at 288 reached by stairs
const ROOF = 288;
for (const sx of [-1, 1]) {
  for (const sy of [-1, 1]) {
    const cx = sx * 1216, cy = sy * 1216;
    const x0 = cx - 320, x1 = cx + 320, y0 = cy - 320, y1 = cy + 320, t = 32;
    // walls with a door gap (160 wide, 128 tall) facing the middle on both axes
    const doorX = cx - sx * 0, doorY = cy;
    // wall facing centre along x
    const wx = sx > 0 ? x0 : x1 - t;
    box(wx, y0, 0, wx + t, doorY - 80, ROOF); box(wx, doorY + 80, 0, wx + t, y1, ROOF); box(wx, doorY - 80, 128, wx + t, doorY + 80, ROOF);
    // wall facing centre along y
    const wy = sy > 0 ? y0 : y1 - t;
    box(x0, wy, 0, doorX - 80, wy + t, ROOF); box(doorX + 80, wy, 0, x1, wy + t, ROOF); box(doorX - 80, wy, 128, doorX + 80, wy + t, ROOF);
    // the two outer walls touch the arena shell, so they're solid
    const ox = sx > 0 ? x1 - t : x0, oy = sy > 0 ? y1 - t : y0;
    box(ox, y0, 0, ox + t, y1, ROOF); box(x0, oy, 0, x1, oy + t, ROOF);
    // roof slab with a hatch-free top and a lit trim
    box(x0, y0, ROOF, x1, y1, ROOF + 16, 'metal');
    box(x0, y0, ROOF + 16, x1, y0 + 8, ROOF + 24, 'neon');
    box(x0, y1 - 8, ROOF + 16, x1, y1, ROOF + 24, 'neon');
    // inside: crates
    box(cx - 64, cy - 64, 0, cx + 64, cy + 64, 96, 'metal');
    // outside stairs up to roof level along the front wall, then a landing that bridges onto the roof
    const sx0 = cx - sx * 360, sy0 = cy - sy * 420;
    stairs(sx0, sy0, 0, sx > 0 ? '+x' : '-x', 96, 19);
    const edge = sy > 0 ? y0 : y1;
    box(sx0 + sx * 15 * 28, sy0 + sy * 48, ROOF, sx0 + sx * 19 * 28, edge + sy * 8, ROOF + 16, 'plate');
  }
}

// catwalks linking rooftops along the north and south edges
for (const sy of [-1, 1]) {
  const y = sy * 1216;
  box(-896, y - 64, ROOF, 896, y + 64, ROOF + 16, 'plate');
  box(-896, y - 64, ROOF + 16, 896, y - 56, ROOF + 56, 'metal');
  box(-896, y + 56, ROOF + 16, 896, y + 64, ROOF + 56, 'metal');
  // supports
  for (const x of [-512, 0, 512]) box(x - 24, y - 24, 0, x + 24, y + 24, ROOF, 'panel');
}

// mid-field cover: low walls and blocks
for (const s of [-1, 1]) {
  box(s * 640 - 16, -320, 0, s * 640 + 16, 320, 72, 'concrete');
  box(s * 640 - 16, -320, 72, s * 640 + 16, 320, 80, 'hazard');
  box(-96 + s * 560, s * 1000 - 96, 0, 96 + s * 560, s * 1000 + 96, 128, 'metal');
  box(s * 1216 - 160, -64, 0, s * 1216 + 160, 64, 56, 'concrete');
}
box(-900, -40, 0, -820, 40, 160, 'panel');
box(820, -40, 0, 900, 40, 160, 'panel');

export const ARENA = {
  name: 'Foundry',
  boxes: B,
  size: S,
  sun: { dir: [-0.45, -0.3, 0.84], color: [1.0, 0.92, 0.82], intensity: 3.2 },
  spawns: [
    [-1400, -1400, 0, 45], [1400, -1400, 0, 135], [-1400, 1400, 0, -45], [1400, 1400, 0, -135],
    [-1050, -1400, 0, 60], [1050, 1400, 0, -120], [-1050, 1400, 0, -60], [1050, -1400, 0, 120],
    [0, -1500, 0, 90], [0, 1500, 0, -90], [-1500, 0, 0, 0], [1500, 0, 0, 180],
    [200, 200, 120, 225], [-1216, -1216, ROOF + 16, 45], [1216, 1216, ROOF + 16, -135], [-640, 900, 0, -60],
  ].map(([x, y, z, yaw]) => ({ origin: [x, y, z + 1], yaw })),
  items: [
    ['health', 0, 160, 120], ['battery', 0, -160, 120], ['shotgun', -1216, -1216, 96], ['357', 1216, 1216, 96],
    ['ar2', -1216, 1216, ROOF + 16], ['ar2', 1216, -1216, ROOF + 16], ['health', -1500, 0, 0], ['health', 1500, 0, 0],
    ['ammo', 0, -1216, ROOF + 16], ['ammo', 0, 1216, ROOF + 16], ['vial', -640, -500, 0], ['vial', 640, 500, 0],
    ['battery', -1216, 1216, 96], ['battery', 1216, -1216, 96], ['shotgun', 1216, 1216, ROOF + 16], ['357', -1216, -1216, ROOF + 16],
    ['ammo', -640, 500, 0], ['ammo', 640, -500, 0],
  ].map(([kind, x, y, z]) => ({ kind, o: [x, y, z] })),
};
