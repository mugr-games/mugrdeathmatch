// Cars and bikes for free roam: the catalogue and the driving model. Shared by the server and the driver's
// browser, which predicts its own car exactly like it predicts walking (same state, same input, same answer).
// The body collides as two square boxes, front and back, so a long car fits down a street at any angle.
// Car state: { k (catalogue index), id, o (centre of the floor), v, yaw (degrees), steer (-1 left .. 1 right), g (on the ground) }
import { BTN, pmove } from './pmove.js';

const DEG = Math.PI / 180;
// style: the body the client draws. shop: where you buy it on the phone ('cars' or 'bikes'), null if you can't.
// top: top speed (units/s; 1000 ≈ 57 mph), accel, brake. hx, hy, h: half length, half width, height.
// wb: wheelbase. seats: driver first. hp: how much damage before it burns.
export const VEHICLES = [
  { id: 'pip', name: 'Pip', style: 'hatch', shop: 'cars', price: 3200, top: 1350, accel: 560, hx: 78, hy: 38, h: 56, wb: 112, seats: 4, hp: 700, mass: 1, blurb: 'A tiny hatchback. Parks anywhere.' },
  { id: 'meridian', name: 'Meridian', style: 'sedan', shop: 'cars', price: 6800, top: 1550, accel: 600, hx: 96, hy: 41, h: 56, wb: 140, seats: 4, hp: 850, mass: 1.2, blurb: 'The family saloon everyone has.' },
  { id: 'haybale', name: 'Haybale', style: 'pickup', shop: 'cars', price: 9400, top: 1450, accel: 600, hx: 104, hy: 43, h: 68, wb: 160, seats: 2, hp: 1050, mass: 1.5, blurb: 'Farm pickup with a bed in the back.' },
  { id: 'courier', name: 'Courier', style: 'van', shop: 'cars', price: 7600, top: 1250, accel: 500, hx: 106, hy: 44, h: 86, wb: 160, seats: 2, hp: 1050, mass: 1.8, blurb: 'Box van. Slow, but it pushes.' },
  { id: 'bastion', name: 'Bastion', style: 'suv', shop: 'cars', price: 14500, top: 1550, accel: 640, hx: 100, hy: 44, h: 74, wb: 150, seats: 4, hp: 1150, mass: 1.7, blurb: 'Big four-by-four. Climbs kerbs.' },
  { id: 'thunderhoof', name: 'Thunderhoof', style: 'muscle', shop: 'cars', price: 27000, top: 2050, accel: 860, hx: 100, hy: 43, h: 52, wb: 150, seats: 2, hp: 950, mass: 1.4, blurb: 'V8 muscle car. Loud and quick.' },
  { id: 'vela', name: 'Vela GT', style: 'coupe', shop: 'cars', price: 54000, top: 2400, accel: 1000, hx: 92, hy: 42, h: 48, wb: 140, seats: 2, hp: 850, mass: 1.2, blurb: 'Grand tourer. Fast and sure-footed.' },
  { id: 'nyx', name: 'Nyx R', style: 'super', shop: 'cars', price: 135000, top: 2800, accel: 1300, hx: 94, hy: 45, h: 44, wb: 142, seats: 2, hp: 850, mass: 1.2, blurb: 'The fastest thing on four wheels.' },
  { id: 'cab', name: 'Cab', style: 'taxi', shop: null, price: 0, top: 1500, accel: 600, hx: 96, hy: 41, h: 56, wb: 140, seats: 4, hp: 850, mass: 1.2 },
  { id: 'cruiser', name: 'Police Cruiser', style: 'police', shop: null, price: 0, top: 2200, accel: 950, hx: 98, hy: 42, h: 58, wb: 145, seats: 4, hp: 1300, mass: 1.4 },
  { id: 'sprocket', name: 'Sprocket', style: 'bmx', shop: 'bikes', bike: true, pedal: true, price: 350, top: 650, accel: 300, hx: 32, hy: 10, h: 40, wb: 52, seats: 1, hp: 250, mass: 0.3, blurb: 'A BMX. Pedal power.' },
  { id: 'zip', name: 'Zip 50', style: 'scooter', shop: 'bikes', bike: true, price: 1700, top: 1100, accel: 460, hx: 38, hy: 12, h: 44, wb: 58, seats: 2, hp: 350, mass: 0.5, blurb: 'Little scooter. Goes forever.' },
  { id: 'mudlark', name: 'Mudlark', style: 'dirt', shop: 'bikes', bike: true, price: 6600, top: 1800, accel: 850, hx: 42, hy: 12, h: 48, wb: 64, seats: 2, hp: 420, mass: 0.6, blurb: 'Dirt bike. Light and twitchy.' },
  { id: 'kestrel', name: 'Kestrel 1000', style: 'sport', shop: 'bikes', bike: true, price: 19500, top: 2650, accel: 1200, hx: 44, hy: 13, h: 46, wb: 66, seats: 2, hp: 450, mass: 0.7, blurb: 'Superbike. Hold on.' },
  // aircraft: thrust, top speed, stall (too slow to fly), vr (lift-off speed), turn (degrees a second), span (wingspan)
  { id: 'skylark', name: 'Skylark', style: 'prop', air: true, shop: 'planes', price: 48000, thrust: 950, top: 1900, stall: 650, vr: 720, turn: 58, hx: 150, hy: 28, h: 74, span: 440, wb: 200, seats: 2, hp: 600, mass: 2, blurb: 'Four-seat prop plane. Easy to fly.' },
  { id: 'duster', name: 'Duster', style: 'biplane', air: true, shop: 'planes', price: 26000, thrust: 800, top: 1650, stall: 520, vr: 600, turn: 70, hx: 130, hy: 26, h: 80, span: 400, wb: 180, seats: 1, hp: 500, mass: 1.8, blurb: 'Old crop-duster biplane. Nimble and slow.' },
  { id: 'comet', name: 'Comet', style: 'bizjet', air: true, jet: true, shop: 'planes', price: 420000, thrust: 1900, top: 3400, stall: 1050, vr: 1150, turn: 36, hx: 260, hy: 44, h: 110, span: 780, wb: 300, seats: 4, hp: 900, mass: 4, blurb: 'Business jet. Very fast, very wide turns.' },
  { id: 'talon', name: 'Talon F-9', style: 'fighter', air: true, jet: true, guns: true, shop: null, price: 0, thrust: 3300, top: 4300, stall: 950, vr: 1050, turn: 88, hx: 230, hy: 40, h: 92, span: 470, wb: 260, seats: 1, hp: 1000, mass: 3, blurb: 'Military fighter with a cannon and missiles. Only at Fort Talon.' },
];
export const VEHICLE_INDEX = Object.fromEntries(VEHICLES.map((v, i) => [v.id, i]));
// paint for bought cars and traffic
export const PAINTS = ['#c8ccd0', '#1c1d20', '#f2f2ee', '#b3261e', '#1e4fa8', '#2f7a3a', '#e8b21e', '#d8641e', '#6a3a8a', '#7a8088', '#3a5a6a', '#8a6a4a'];
export const PAINT_NAMES = ['Silver', 'Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Orange', 'Purple', 'Grey', 'Teal', 'Bronze'];

for (const V of VEHICLES) {
  V.brake ??= V.bike ? 1500 : 1900;
  V.rev ??= V.pedal ? 150 : 480;
  V.grip ??= V.bike ? 12 : 10;
  V.steerMax ??= V.bike ? 0.55 : 0.62;
  V.mins = [-V.hy, -V.hy, 0];
  V.maxs = [V.hy, V.hy, V.h * 0.82];
  V.off = V.hx - V.hy; // the two collision boxes sit this far ahead of and behind the middle
  // where people sit (x forward, y left, z up from the floor) and their eyes; the driver is on the left
  if (V.air) {
    V.seat = [[V.hx * 0.3, 0, 26], [V.hx * 0.05, 0, 26], [-V.hx * 0.15, 12, 26], [-V.hx * 0.15, -12, 26]].slice(0, V.seats);
    V.eye = [V.hx * 0.34, 0, 66];
  } else if (V.bike) {
    V.seat = [[-4, 0, 26], [-28, 0, 30]].slice(0, V.seats);
    V.eye = [-2, 0, 62];
  } else {
    const sz = Math.max(14, V.h - 44), back = -V.hx * 0.42;
    V.seat = [[-V.hx * 0.08, V.hy * 0.45, sz], [-V.hx * 0.08, -V.hy * 0.45, sz], [back, V.hy * 0.45, sz], [back, -V.hy * 0.45, sz]].slice(0, V.seats);
    V.eye = [V.seat[0][0] - 2, V.seat[0][1], V.h - 11];
  }
  V.belt = V.bike ? 0 : V.air ? V.h * 0.8 : V.h * 0.55; // bullets go over the doors and through the windows
}

export function newCar(k, id, o, yaw) {
  return { k, id, o: o.slice(), v: [0, 0, 0], yaw, steer: 0, g: true, pitch: 0, roll: 0, thr: 0 };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const STEP = 24, GRAV = 800;
const _a = [0, 0, 0], _b = [0, 0, 0];

// both collision boxes moved by d: the earliest hit
function sweep(world, c, V, fx, fy, d, out) {
  out.f = 1; out.n[0] = out.n[1] = out.n[2] = 0; out.dyn = null;
  for (let s = -1; s <= 1; s += 2) {
    _a[0] = c.o[0] + fx * V.off * s; _a[1] = c.o[1] + fy * V.off * s; _a[2] = c.o[2];
    _b[0] = _a[0] + d[0]; _b[1] = _a[1] + d[1]; _b[2] = _a[2] + d[2];
    const tr = world.trace(_a, _b, V.mins, V.maxs);
    if (tr.allsolid) continue; // stuck inside the map: let it move rather than freeze
    if (tr.fraction < out.f) { out.f = tr.fraction; out.n[0] = tr.normal[0]; out.n[1] = tr.normal[1]; out.n[2] = tr.normal[2]; out.dyn = tr.dyn; }
  }
  return out;
}
const SW = { f: 1, n: [0, 0, 0], dyn: null };

// does the car fit here at this heading?
function fits(world, c, V, yaw) {
  const fx = Math.cos(yaw * DEG), fy = Math.sin(yaw * DEG);
  for (let s = -1; s <= 1; s += 2) {
    _a[0] = c.o[0] + fx * V.off * s; _a[1] = c.o[1] + fy * V.off * s; _a[2] = c.o[2] + 0.5;
    const tr = world.trace(_a, _a, V.mins, V.maxs);
    if (tr.startsolid) return false;
  }
  return true;
}

// slide along whatever we hit (up to three surfaces); returns the hardest hit into a wall or car
function slide(world, c, V, fx, fy, dt, res) {
  const d = [c.v[0] * dt, c.v[1] * dt, c.v[2] * dt];
  for (let it = 0; it < 3; it++) {
    const r = sweep(world, c, V, fx, fy, d, SW);
    c.o[0] += d[0] * r.f; c.o[1] += d[1] * r.f; c.o[2] += d[2] * r.f;
    if (r.f >= 1) break;
    const n = r.n;
    const into = c.v[0] * n[0] + c.v[1] * n[1] + c.v[2] * n[2];
    if (into < 0) {
      const wall = n[2] < 0.7;
      if (wall && -into > res.hit) { res.hit = -into; res.dyn = r.dyn; res.n = n.slice(); }
      const k = wall ? 1.15 : 1; // walls bounce you off a little
      c.v[0] -= n[0] * into * k; c.v[1] -= n[1] * into * k; c.v[2] -= n[2] * into * k;
    }
    const left = 1 - r.f;
    const dn = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
    d[0] = (d[0] - n[0] * dn) * left; d[1] = (d[1] - n[1] * dn) * left; d[2] = (d[2] - n[2] * dn) * left;
  }
}

// One step of driving. cmd: { fwd (throttle / brake), side (steering, right is +), buttons (JUMP: handbrake) }.
// Returns { hit (speed into a wall or car), dyn (the car hit, if any), n } for the server's damage and shoves.
export function vmove(world, c, cmd, dt) {
  const V = VEHICLES[c.k];
  const res = { hit: 0, dyn: null, n: null };
  let fx = Math.cos(c.yaw * DEG), fy = Math.sin(c.yaw * DEG);
  let vf = c.v[0] * fx + c.v[1] * fy;
  let vs = c.v[0] * fy - c.v[1] * fx; // to the right
  const dead = !!c.dead;
  const thr = dead ? 0 : clamp(cmd.fwd || 0, -1, 1);
  const hb = dead || !!(cmd.buttons & BTN.JUMP);
  const want = dead ? 0 : clamp(cmd.side || 0, -1, 1);
  // the wheel turns toward the stick, and comes back to the middle faster
  const rate = want * c.steer < 0 || Math.abs(want) < Math.abs(c.steer) ? 7 : 4;
  c.steer += clamp(want - c.steer, -rate * dt, rate * dt);
  if (c.g) {
    if (thr > 0) {
      if (vf < -15) vf = Math.min(0, vf + V.brake * thr * dt);
      else { const r = Math.max(0, vf) / V.top; vf += V.accel * thr * (1 - r * r) * dt; }
    } else if (thr < 0) {
      if (vf > 15) vf = Math.max(0, vf + V.brake * thr * dt);
      else if (vf > -V.rev) vf = Math.max(-V.rev, vf + V.accel * 0.7 * thr * dt);
    } else vf -= Math.sign(vf) * Math.min(Math.abs(vf), (70 + Math.abs(vf) * 0.22) * dt); // rolling to a stop
    if (hb) vf -= Math.sign(vf) * Math.min(Math.abs(vf), V.brake * 0.55 * dt);
    if (vf > V.top * 1.05) vf -= (vf - V.top) * Math.min(1, dt * 2);
    // tyres grip sideways; the handbrake lets the back slide out
    vs *= Math.max(0, 1 - (hb && Math.abs(vf) > 200 ? 1.6 : V.grip) * dt);
    const ang = c.steer * V.steerMax * (1 - 0.55 * Math.min(1, Math.abs(vf) / V.top));
    let yr = (vf / V.wb) * Math.tan(ang) / DEG; // degrees per second, clockwise for a right turn
    if (hb && Math.abs(vf) > 300) yr *= 1.4;
    const ny = c.yaw - yr * dt;
    if (yr && fits(world, c, V, ny)) {
      c.yaw = ((ny % 360) + 360) % 360;
      fx = Math.cos(c.yaw * DEG); fy = Math.sin(c.yaw * DEG);
    } else if (yr) { vf *= 1 - Math.min(1, dt * 3); }
    c.v[0] = fx * vf + fy * vs;
    c.v[1] = fy * vf - fx * vs;
    c.v[2] = 0;
  } else {
    c.v[2] -= GRAV * dt;
  }
  // move: slide along walls, and step up kerbs (like walking up a stair) when that gets further
  const start = c.o.slice(), startV = c.v.slice();
  slide(world, c, V, fx, fy, dt, res);
  if (c.g) {
    const flat = [c.o.slice(), c.v.slice()];
    const flatDist = (c.o[0] - start[0]) ** 2 + (c.o[1] - start[1]) ** 2;
    if (flatDist < (startV[0] * dt) ** 2 + (startV[1] * dt) ** 2 - 1) {
      c.o = start.slice(); c.v = startV.slice();
      const up = sweep(world, c, V, fx, fy, [0, 0, STEP], SW);
      c.o[2] += STEP * up.f;
      const res2 = { hit: 0, dyn: null, n: null };
      slide(world, c, V, fx, fy, dt, res2);
      const down = sweep(world, c, V, fx, fy, [0, 0, -STEP - 2], SW);
      c.o[2] -= (STEP + 2) * down.f;
      const stepDist = (c.o[0] - start[0]) ** 2 + (c.o[1] - start[1]) ** 2;
      if (stepDist <= flatDist + 1 || down.f >= 1 || down.n[2] < 0.7) { c.o = flat[0]; c.v = flat[1]; }
      else { res.hit = res2.hit; res.dyn = res2.dyn; res.n = res2.n; }
    }
  }
  // on the ground? (stick to it going down a kerb)
  const drop = sweep(world, c, V, fx, fy, [0, 0, c.g ? -STEP : -2], SW);
  if (drop.f < 1 && drop.n[2] > 0.7 && c.v[2] <= 1) {
    c.o[2] -= (c.g ? STEP : 2) * drop.f;
    if (!c.g && c.v[2] < -500) res.hit = Math.max(res.hit, -c.v[2] - 500);
    c.g = true;
    c.v[2] = 0;
  } else c.g = false;
  const sp = Math.hypot(c.v[0], c.v[1], c.v[2]);
  if (sp > 4000) for (let k = 0; k < 3; k++) c.v[k] *= 4000 / sp;
  return res;
}

// ------------------------------------------------------------------ flying
// Mouse-aim flight: the plane turns toward where you look (cmd.yaw and cmd.pitch), as fast as its airspeed
// allows; W and S set the throttle; A and D add rudder (and steer on the ground). On the runway, look up past
// the lift-off speed to take off. Too slow and it stalls and drops. Land gently (nose level, wings level, not
// too fast down) or crash. Returns { crash, hit } for the server.
const wrap = (a) => ((a % 360) + 360) % 360;
const SKY_LIMIT = 98000; // past the coast: the plane turns itself back toward land
const angTo = (a, b) => ((b - a) % 360 + 540) % 360 - 180;
export function amove(world, c, cmd, dt) {
  const V = VEHICLES[c.k];
  const res = { hit: 0, dyn: null, n: null, crash: false };
  const dead = !!c.dead;
  c.pitch ||= 0; c.roll ||= 0; c.thr ||= 0;
  c.thr = clamp(c.thr + (dead ? -1 : cmd.fwd || 0) * dt * 0.6, 0, 1);
  const side = dead ? 0 : clamp(cmd.side || 0, -1, 1);
  if (c.g) {
    const fx = Math.cos(c.yaw * DEG), fy = Math.sin(c.yaw * DEG);
    let s = c.v[0] * fx + c.v[1] * fy;
    s += (c.thr * V.thrust - V.thrust * (s / V.top) * Math.abs(s / V.top) - Math.sign(s) * 50) * dt;
    if (c.thr < 0.02 && (cmd.fwd || 0) < 0) s -= Math.sign(s) * Math.min(Math.abs(s), 700 * dt);
    if (Math.abs(s) < 2 && c.thr < 0.02) s = 0;
    s = Math.max(-80, s);
    let turn = -side * 40 * Math.min(1, Math.abs(s) / 200);
    if (s > 300 && !dead) turn += clamp(angTo(c.yaw, cmd.yaw) * 1.5, -18, 18);
    c.yaw = wrap(c.yaw + turn * dt);
    const want = dead ? 0 : clamp(-(cmd.pitch || 0), 0, 14);
    if (s > V.vr && want > 3) c.pitch = Math.min(want, c.pitch + 10 * dt); else c.pitch = Math.max(0, c.pitch - 20 * dt);
    c.roll -= c.roll * Math.min(1, dt * 6);
    const nx = Math.cos(c.yaw * DEG), ny = Math.sin(c.yaw * DEG);
    c.v[0] = nx * s; c.v[1] = ny * s; c.v[2] = 0;
    if (c.pitch > 6 && s > V.vr) { c.g = false; c.v[2] = s * Math.sin(c.pitch * DEG) * 0.5; c.o[2] += 2; }
  } else {
    let sp = Math.hypot(c.v[0], c.v[1], c.v[2]);
    const auth = clamp((sp - V.stall * 0.5) / (V.stall * 0.7), 0.12, 1);
    const turn = V.turn * auth;
    let aimYaw = cmd.yaw;
    if (Math.abs(c.o[0]) > SKY_LIMIT || Math.abs(c.o[1]) > SKY_LIMIT) aimYaw = Math.atan2(-c.o[1], -c.o[0]) / DEG;
    let dy = dead ? 0 : clamp(angTo(c.yaw, aimYaw) * 2.5, -turn, turn);
    dy += -side * turn * 0.35;
    const wantP = dead ? -40 : clamp(-(cmd.pitch || 0), -70, 75);
    const dp = clamp((wantP - c.pitch) * 3, -turn * 0.9, turn * 0.9);
    c.yaw = wrap(c.yaw + dy * dt);
    c.pitch = clamp(c.pitch + dp * dt, -85, 85);
    const wantRoll = dead ? c.roll + 90 * dt : clamp((-dy / V.turn) * 75, -80, 80); // bank into the turn (right wing down is +)
    c.roll += (wantRoll - c.roll) * Math.min(1, dt * 4);
    const sinP = Math.sin(c.pitch * DEG), cosP = Math.cos(c.pitch * DEG);
    sp += (c.thr * V.thrust - V.thrust * (sp / V.top) * (sp / V.top) - 700 * sinP) * dt;
    sp = Math.max(0, sp);
    c.v[0] = cosP * Math.cos(c.yaw * DEG) * sp; c.v[1] = cosP * Math.sin(c.yaw * DEG) * sp; c.v[2] = sinP * sp;
    if (sp < V.stall) { const k = 1 - sp / V.stall; c.v[2] -= 1100 * k; c.pitch -= 35 * k * dt; }
  }
  // move, and see what we hit
  const fx = Math.cos(c.yaw * DEG), fy = Math.sin(c.yaw * DEG);
  const d = [c.v[0] * dt, c.v[1] * dt, c.v[2] * dt];
  const r = sweep(world, c, V, fx, fy, d, SW);
  c.o[0] += d[0] * r.f; c.o[1] += d[1] * r.f; c.o[2] += d[2] * r.f;
  if (r.f < 1) {
    const n = r.n;
    const into = -(c.v[0] * n[0] + c.v[1] * n[1] + c.v[2] * n[2]);
    const gentle = n[2] > 0.7 && c.v[2] > -480 && Math.abs(c.roll) < 30 && c.pitch < 16 && c.pitch > -8;
    if (gentle || (c.g && n[2] > 0.7)) { c.g = true; c.v[2] = 0; c.pitch = Math.max(0, c.pitch); }
    else if (into > 200) { res.crash = true; res.hit = into; res.dyn = r.dyn; c.v = [0, 0, 0]; c.dead = true; }
    else { c.v[0] += n[0] * into; c.v[1] += n[1] * into; c.v[2] += n[2] * into; }
  }
  if (c.g) {
    const drop = sweep(world, c, V, fx, fy, [0, 0, -STEP], SW);
    if (drop.f < 1 && drop.n[2] > 0.7) c.o[2] -= STEP * drop.f;
    else if (Math.hypot(c.v[0], c.v[1]) > 30) { c.g = false; }
  }
  if (c.o[2] > 26000) { c.o[2] = 26000; if (c.v[2] > 0) c.v[2] = 0; }
  return res;
}

// local seat offset -> world position on a car
export function seatPos(c, local, out = [0, 0, 0]) {
  const fx = Math.cos(c.yaw * DEG), fy = Math.sin(c.yaw * DEG);
  out[0] = c.o[0] + fx * local[0] - fy * local[1];
  out[1] = c.o[1] + fy * local[0] + fx * local[1];
  out[2] = c.o[2] + local[2];
  return out;
}

// the two collision boxes of a car, for everyone else's traces
export function carBoxes(c, id) {
  const V = VEHICLES[c.k];
  const fx = Math.cos(c.yaw * DEG), fy = Math.sin(c.yaw * DEG);
  const out = [];
  for (let s = -1; s <= 1; s += 2) {
    const x = c.o[0] + fx * V.off * s, y = c.o[1] + fy * V.off * s;
    out.push({ mins: [x - V.hy, y - V.hy, c.o[2]], maxs: [x + V.hy, y + V.hy, c.o[2] + V.maxs[2]], id, shotTop: c.o[2] + (V.belt || V.maxs[2]) });
  }
  return out;
}

// is point p (feet, with a person's radius) touching the car's body? returns the local position or null
export function touches(c, p, pad = 16, zr = 72) {
  const V = VEHICLES[c.k];
  const fx = Math.cos(c.yaw * DEG), fy = Math.sin(c.yaw * DEG);
  const dx = p[0] - c.o[0], dy = p[1] - c.o[1];
  const lx = dx * fx + dy * fy, ly = -dx * fy + dy * fx;
  if (Math.abs(lx) > V.hx + pad || Math.abs(ly) > V.hy + pad) return null;
  if (p[2] + zr < c.o[2] || p[2] > c.o[2] + V.h) return null;
  return [lx, ly];
}

// Walking or driving: what one command does to a player. Drivers steer their car (and sit in it);
// passengers ride along (the server moves them with the car).
export function moveAny(world, ps, cmd, dt, rules) {
  if (ps.car) {
    world.skip = ps.car.id;
    const r = VEHICLES[ps.car.k].air ? amove(world, ps.car, cmd, dt) : vmove(world, ps.car, cmd, dt);
    world.skip = 0;
    const V = VEHICLES[ps.car.k];
    seatPos(ps.car, V.seat[0], ps.origin);
    ps.velocity[0] = ps.car.v[0]; ps.velocity[1] = ps.car.v[1]; ps.velocity[2] = ps.car.v[2];
    ps.onGround = true;
    return r;
  }
  // (passengers sit still; the server moves them with the vehicle)
  if (ps.seat) return null;
  pmove(world, ps, cmd, dt, rules);
  return null;
}

const r3 = (v) => Math.round(v * 1000) / 1000;
export const packCar = (c) => c && [c.k, c.id, ...c.o.map((v) => Math.round(v * 100) / 100), ...c.v.map((v) => Math.round(v * 100) / 100), r3(c.yaw), r3(c.steer), c.g ? 1 : 0, c.dead ? 1 : 0, r3(c.pitch || 0), r3(c.roll || 0), r3(c.thr || 0)];
export const unpackCar = (a) => a && { k: a[0], id: a[1], o: [a[2], a[3], a[4]], v: [a[5], a[6], a[7]], yaw: a[8], steer: a[9], g: !!a[10], dead: !!a[11], pitch: a[12] || 0, roll: a[13] || 0, thr: a[14] || 0 };
