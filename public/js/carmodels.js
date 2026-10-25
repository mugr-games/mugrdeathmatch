// Free roam vehicles, built in code: a side profile extruded into door panels, bonnet and boot, a glass cabin
// with pillars and a roof, a real interior (dashboard with lit dials, steering wheel, seats) so first person
// driving works, wheels that turn and steer, head and brake lights, police light bars and the taxi sign.
// Bikes get a frame, tank, seat, bars and a rider. Static parts are merged per material; a cheap box stands in far away.
// Model frame: x forward, y left, z up, origin on the ground under the middle.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VEHICLES, PAINTS } from './vehicle.js';
import { SUIT_COLORS } from './avatar.js';
import { isPotato } from './shaders.js';

// cabin shape per body style, as fractions of the half length (hx) and the height (h):
// dash: windscreen bottom, rf / rr: roof front and back, rear: rear window bottom, nose / tail: bonnet and boot height
const STYLE = {
  hatch: { dash: 0.34, rf: 0.02, rr: -0.72, rear: -0.92, nose: 0.5, tail: 0.6, belt: 0.56, r: 13 },
  sedan: { dash: 0.34, rf: 0.06, rr: -0.42, rear: -0.62, nose: 0.48, tail: 0.55, belt: 0.55, r: 14 },
  taxi: { dash: 0.34, rf: 0.06, rr: -0.42, rear: -0.62, nose: 0.48, tail: 0.55, belt: 0.55, r: 14, sign: true },
  police: { dash: 0.34, rf: 0.06, rr: -0.42, rear: -0.62, nose: 0.48, tail: 0.55, belt: 0.55, r: 14, bar: true },
  suv: { dash: 0.42, rf: 0.24, rr: -0.9, rear: -0.97, nose: 0.55, tail: 0.6, belt: 0.58, r: 17 },
  pickup: { dash: 0.42, rf: 0.22, rr: -0.16, rear: -0.2, nose: 0.55, tail: 0.5, belt: 0.56, r: 16, bed: true },
  van: { dash: 0.66, rf: 0.5, rr: 0.3, rear: 0.3, nose: 0.55, tail: 1, belt: 0.52, r: 15, box: true },
  muscle: { dash: 0.22, rf: -0.06, rr: -0.42, rear: -0.72, nose: 0.5, tail: 0.55, belt: 0.58, r: 15 },
  coupe: { dash: 0.24, rf: -0.06, rr: -0.4, rear: -0.74, nose: 0.42, tail: 0.55, belt: 0.56, r: 14 },
  super: { dash: 0.2, rf: -0.12, rr: -0.42, rear: -0.7, nose: 0.36, tail: 0.6, belt: 0.55, r: 14, wing: true },
};

const MAT = {};
function mats() {
  if (MAT.ready) return MAT;
  const P = isPotato();
  const std = (o) => (P ? new THREE.MeshLambertMaterial(o) : new THREE.MeshStandardMaterial(o));
  MAT.glass = P ? new THREE.MeshLambertMaterial({ color: 0x1c2a36, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false })
    : new THREE.MeshPhysicalMaterial({ color: 0x223442, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.6 });
  MAT.trim = std({ color: 0x1a1b1d, roughness: 0.6, metalness: 0.2 });
  MAT.inside = std({ color: 0x2a2b2e, roughness: 0.9 });
  MAT.seat = std({ color: 0x3a342e, roughness: 0.85 });
  MAT.tire = std({ color: 0x141414, roughness: 0.95 });
  MAT.rim = std({ color: 0xb8bcc2, roughness: 0.25, metalness: 0.9 });
  MAT.chrome = std({ color: 0xd8dce0, roughness: 0.15, metalness: 1 });
  MAT.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 1.6 });
  MAT.tailOff = new THREE.MeshStandardMaterial({ color: 0x5a0d0d, emissive: 0x5a0606, emissiveIntensity: 1 });
  MAT.tailOn = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 4, toneMapped: false });
  MAT.dial = new THREE.MeshBasicMaterial({ color: 0x7fd8ff });
  MAT.red = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
  MAT.blue = new THREE.MeshBasicMaterial({ color: 0x2050ff, toneMapped: false });
  MAT.dark = std({ color: 0x0c0c0e, roughness: 0.5 });
  MAT.taxi = new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc840, emissiveIntensity: 1.2 });
  MAT.smoke = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.5, depthWrite: false });
  MAT.burnt = std({ color: 0x1b1816, roughness: 0.95 });
  MAT.ready = true;
  return MAT;
}
const paints = new Map();
export function paintMat(i, police) {
  const key = (police ? 'p' : '') + i;
  if (paints.has(key)) return paints.get(key);
  const color = new THREE.Color(PAINTS[i % PAINTS.length]);
  const m = isPotato() ? new THREE.MeshLambertMaterial({ color })
    : new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
  paints.set(key, m);
  return m;
}

// ------------------------------------------------------------------ geometry helpers
function box(sx, sy, sz, x, y, z) {
  const g = new THREE.BoxGeometry(sx, sy, sz);
  g.translate(x, y, z);
  return g;
}
// a side profile (points in x, z) extruded across y from y0 to y1
function extrude(pts, y0, y1, bevel = 0) {
  const s = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? s.lineTo(x, z) : s.moveTo(x, z)));
  const depth = Math.max(0.5, y1 - y0 - bevel * 2);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(Math.PI / 2); // shape y -> z, extrusion -> -y
  g.translate(0, y1 - bevel, 0);
  return g;
}
// a strut from a to b (x, z) at y, w thick
function strut(a, b, y, w, t = w) {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  const g = new THREE.BoxGeometry(len, t, w);
  g.rotateY(-Math.atan2(dz, dx));
  g.translate((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2);
  return g;
}
function wheelGeo(r, w) {
  const tire = new THREE.CylinderGeometry(r, r, w, 18);
  const rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.6, 12);
  const hub = new THREE.CylinderGeometry(r * 0.2, r * 0.2, w + 1.4, 8);
  return { tire, rim: mergeGeometries([rim, hub]) };
}

// ------------------------------------------------------------------ cars
const built = new Map();
function buildCar(V) {
  const S = STYLE[V.style];
  const hx = V.hx, hy = V.hy, H = V.h, r = S.r, c = 9;
  const zb = H * S.belt, zn = H * S.nose * 0.9, zt = S.box ? H : H * S.tail * 0.95;
  const xd = hx * S.dash, xf = hx * S.rf, xr = hx * S.rr, xq = hx * S.rear;
  const wf = V.wb / 2, wr = -V.wb / 2;
  const paint = [], glass = [], trim = [], inside = [], seat = [], head = [], tail = [], chrome = [];
  // the side profile: arches round the wheels
  const arch = (cx) => { const out = []; for (let k = 0; k <= 8; k++) { const a = Math.PI - (k / 8) * Math.PI; out.push([cx + Math.cos(a) * (r + 3), r + Math.sin(a) * (r + 3)]); } return out; };
  const sidePts = [[-hx, c + 2], ...arch(wr), ...arch(wf), [hx, c + 2], [hx, zn], [hx - 6, zn + 2], [xd, zb], [xq, zb], [-hx + 4, zt], [-hx, zt - 2]];
  for (const s of [-1, 1]) paint.push(extrude(sidePts, s > 0 ? hy - 4 : -hy, s > 0 ? hy : -hy + 4));
  // bonnet and boot (solid wedges across the car), the floor
  paint.push(extrude([[xd, zb], [hx - 6, zn + 2], [hx, zn], [hx, c + 6], [xd, c + 6]], -hy + 3, hy - 3, 1.5));
  if (!S.box && !S.bed) paint.push(extrude([[-hx, zt - 2], [-hx + 4, zt], [xq, zb], [xq, c + 6], [-hx, c + 6]], -hy + 3, hy - 3, 1.5));
  inside.push(box(xd - xq, hy * 2 - 8, 3, (xd + xq) / 2, 0, c + 6));
  // the glass cabin, its roof and pillars
  if (!S.box) {
    glass.push(extrude([[xd, zb], [xf, H - 3], [xr, H - 3], [xq, zb]], -hy + 6, hy - 6));
    paint.push(box(xf - xr + 4, hy * 2 - 8, 3, (xf + xr) / 2, 0, H - 1.5));
    for (const s of [-1, 1]) {
      const y = s * (hy - 6);
      paint.push(strut([xd, zb], [xf, H - 2], y, 4, 3), strut([xq, zb], [xr, H - 2], y, 5, 3));
      paint.push(box(4, 3, H - zb, (xf + xr) / 2 + 2, y, (zb + H) / 2)); // B pillar
    }
  } else {
    // van: a short cab with a windscreen, then the box
    glass.push(extrude([[xd, zb], [xf, H - 6], [xr, H - 6], [xr, zb]], -hy + 6, hy - 6));
    paint.push(box(hx + xr, hy * 2, H - c - 2, (-hx + xr) / 2, 0, (H + c + 2) / 2));
    paint.push(box(xf - xr + 6, hy * 2 - 4, 6, (xf + xr) / 2, 0, H - 3));
    for (const s of [-1, 1]) paint.push(strut([xd, zb], [xf, H - 4], s * (hy - 6), 5, 3));
  }
  if (S.bed) {
    // the pickup bed: sides, tailgate and floor
    for (const s of [-1, 1]) paint.push(box(-xq - hx * 0.02 + hx, 4, zb - c, (xq - 6 - hx) / 2, s * (hy - 2), (zb + c) / 2));
    paint.push(box(4, hy * 2, zb - c, -hx + 2, 0, (zb + c) / 2));
    paint.push(box(hx + xq - 8, hy * 2 - 8, 3, (xq - 8 - hx) / 2, 0, c + 10));
  }
  // bumpers, grille, mirrors, plates
  trim.push(box(6, hy * 2 + 2, 10, hx, 0, c + 10), box(6, hy * 2 + 2, 10, -hx, 0, c + 10));
  trim.push(box(2, hy * 1.1, (zn - c) * 0.35, hx + 1.5, 0, (zn + c) * 0.55));
  for (const s of [-1, 1]) trim.push(box(6, 6, 5, xd - 4, s * (hy + 3), zb + 4));
  chrome.push(box(1, 18, 6, hx + 3.5, 0, c + 10), box(1, 18, 6, -hx - 3.5, 0, c + 10));
  // lights
  for (const s of [-1, 1]) {
    head.push(box(2, hy * 0.36, 6, hx + 0.5, s * hy * 0.66, zn - 7));
    tail.push(box(2, hy * 0.34, 6, -hx - 0.5, s * hy * 0.66, (S.box ? H * 0.45 : zt - 8)));
  }
  // interior: dashboard, dials, centre console, seats
  inside.push(box(10, hy * 2 - 10, 12, xd - 5, 0, zb - 5));
  inside.push(box(16, 10, zb - c - 14, xd - 14, 0, (zb + c) / 2 - 2));
  const sz = V.seat[0][2];
  for (const [x, y] of V.seat) {
    seat.push(box(22, hy * 0.62, 7, x, y, sz + 2));
    seat.push(strut([x - 13, sz + 4], [x - 17, sz + 30], y, hy * 0.6, 6));
    seat.push(box(5, hy * 0.36, 7, x - 17, y, sz + 33));
  }
  const dials = box(0.5, 9, 4, xd - 10.5, V.seat[0][1], zb - 1);
  if (S.bar) { trim.push(box(8, hy * 1.3, 4, (xf + xr) / 2, 0, H + 1)); }
  if (S.sign) trim.push(box(8, 20, 3, (xf + xr) / 2, 0, H + 1));
  if (S.wing) { paint.push(box(6, hy * 1.8, 2, -hx + 8, 0, zt + 8)); for (const s of [-1, 1]) trim.push(box(3, 2, 8, -hx + 8, s * hy * 0.7, zt + 4)); }
  const out = {
    paint: mergeGeometries(paint.map((g) => g.toNonIndexed())), glass: mergeGeometries(glass.map((g) => g.toNonIndexed())),
    trim: mergeGeometries(trim), inside: mergeGeometries(inside.map((g) => g.toNonIndexed())), seat: mergeGeometries(seat.map((g) => g.toNonIndexed())),
    head: mergeGeometries(head), tail: mergeGeometries(tail), chrome: mergeGeometries(chrome), dials,
    wheels: [[wf, hy - 9, r], [wf, -hy + 9, r], [wr, hy - 9, r], [wr, -hy + 9, r]], wheel: wheelGeo(r, 10), r,
    lod: mergeGeometries([box(hx * 2, hy * 2, zb - c, 0, 0, (zb + c) / 2), box(Math.max(10, xf - xr), hy * 2 - 10, H - zb, (xf + xr) / 2, 0, (zb + H) / 2)]),
    sw: { x: xd - 22, y: V.seat[0][1], z: zb - 3, r: hy * 0.27 }, bar: S.bar ? { x: (xf + xr) / 2, z: H + 3.5, w: hy * 0.6 } : null, sign: !!S.sign, roof: H,
  };
  for (const k of ['paint', 'glass', 'inside', 'seat']) out[k].computeVertexNormals();
  return out;
}

// ------------------------------------------------------------------ bikes
function buildBike(V) {
  const pedal = V.style === 'bmx';
  const r = pedal ? 11 : V.style === 'dirt' ? 15 : V.style === 'scooter' ? 9 : 14;
  const wf = V.wb / 2, wr = -V.wb / 2;
  const paint = [], trim = [], seat = [], head = [], tail = [], chrome = [];
  if (pedal) {
    trim.push(strut([wr, r], [0, r + 4], 0, 2.4), strut([0, r + 4], [wf - 4, r + 22], 0, 2.4), strut([wr, r], [-6, r + 20], 0, 2.4), strut([-6, r + 20], [wf - 4, r + 22], 0, 2.4));
    paint.push(strut([0, r + 4], [-6, r + 20], 0, 3));
    trim.push(strut([wf, r], [wf - 4, r + 26], 0, 2.4));
    seat.push(box(10, 5, 2.5, -7, 0, r + 22));
    chrome.push(box(2, 22, 2, wf - 5, 0, r + 27));
  } else {
    const scooter = V.style === 'scooter';
    paint.push(box(scooter ? 30 : 26, 14, scooter ? 10 : 14, scooter ? 4 : 6, 0, r + (scooter ? 8 : 18))); // tank / floorboard
    paint.push(strut([wf - 2, r + 8], [wf - 10, r + 30], 0, 10, 6)); // front fairing
    paint.push(box(26, 13, 10, wr + 16, 0, r + 14)); // tail
    trim.push(box(26, 9, 12, -2, 0, r + 6)); // engine
    seat.push(box(26, 12, 4, wr + 20, 0, r + 22));
    trim.push(strut([wf, r], [wf - 8, r + 30], 3, 2.5), strut([wf, r], [wf - 8, r + 30], -3, 2.5)); // forks
    trim.push(strut([wr, r], [wr + 22, r + 6], 0, 3)); // swingarm
    chrome.push(box(2, 26, 2, wf - 9, 0, r + 32));
    head.push(box(2, 7, 5, wf - 4, 0, r + 26));
    tail.push(box(2, 7, 3, wr + 3, 0, r + 18));
    chrome.push(strut([-6, r + 2], [wr + 6, r + 10], -8, 3)); // exhaust
  }
  const wheel = pedal
    ? { tire: new THREE.CylinderGeometry(r, r, 3, 18), rim: new THREE.CylinderGeometry(r * 0.85, r * 0.85, 3.4, 10) }
    : wheelGeo(r, V.style === 'scooter' ? 7 : 9);
  return {
    bike: true, pedal, paint: mergeGeometries(paint.map((g) => g.index ? g.toNonIndexed() : g)), trim: mergeGeometries(trim), seat: mergeGeometries(seat), chrome: mergeGeometries(chrome),
    head: head.length ? mergeGeometries(head) : null, tail: tail.length ? mergeGeometries(tail) : null,
    wheels: [[wf, 0, r], [wr, 0, r]], wheel, r, bars: [wf - 7, r + (pedal ? 27 : 32)],
    lod: box(V.hx * 2, 10, r * 2 + 10, 0, 0, r + 5),
  };
}

function shape(k) {
  if (!built.has(k)) { const V = VEHICLES[k]; built.set(k, V.bike ? buildBike(V) : buildCar(V)); }
  return built.get(k);
}

// a seated person (drivers, passengers, riders): torso, head with the visor glow, arms forward
function person(look, bike) {
  const g = new THREE.Group();
  const suit = SUIT_COLORS[(look >> 2) % SUIT_COLORS.length];
  const cloth = new THREE.MeshStandardMaterial({ color: new THREE.Color(...suit.rgb), roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.5, metalness: 0.3 });
  const visor = new THREE.MeshBasicMaterial({ color: 0x8ff0ff });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  add(new THREE.BoxGeometry(12, 18, 22), cloth, -2, 0, 14);
  add(new THREE.SphereGeometry(6.5, 12, 10), skin, 0, 0, 31);
  add(new THREE.BoxGeometry(2, 9, 2.5), visor, 5.8, 0, 32);
  for (const s of [-1, 1]) {
    const arm = add(new THREE.BoxGeometry(18, 4.5, 4.5), cloth, 8, s * 9, 18);
    arm.rotation.y = 0.35;
    if (bike) { const leg = add(new THREE.BoxGeometry(16, 5, 5), cloth, 6, s * 7, 2); leg.rotation.y = 0.5; }
    else add(new THREE.BoxGeometry(18, 5.5, 5.5), cloth, 8, s * 5, 4);
  }
  g.userData.dispose = () => { cloth.dispose(); skin.dispose(); visor.dispose(); };
  return g;
}

// ------------------------------------------------------------------ one vehicle in the world
export class CarModel {
  constructor(k, paint) {
    const M = mats();
    const V = VEHICLES[k];
    const S = shape(k);
    this.k = k;
    this.V = V;
    this.S = S;
    this.root = new THREE.Group();
    this.root.matrixAutoUpdate = false;
    this.near = new THREE.Group();
    this.root.add(this.near);
    const police = V.style === 'police';
    this.paint = paintMat(paint, police);
    const mesh = (geo, m, shadow = true) => { if (!geo) return null; const o = new THREE.Mesh(geo, m); o.castShadow = shadow; o.receiveShadow = true; this.near.add(o); return o; };
    this.body = mesh(S.paint, this.paint);
    if (S.glass) mesh(S.glass, M.glass, false);
    mesh(S.trim, M.trim);
    if (S.inside) mesh(S.inside, M.inside, false);
    mesh(S.seat, M.seat, false);
    mesh(S.chrome, M.chrome, false);
    if (S.head) mesh(S.head, M.head, false);
    this.tail = S.tail ? mesh(S.tail, M.tailOff, false) : null;
    if (S.dials) mesh(S.dials, M.dial, false);
    if (police && !S.bike) {
      // black doors and bonnet on a white car read as police from a mile off
      this.body.material = paintMat(2, true);
      const W = V.hy * 2 + 0.6;
      const doors = new THREE.Mesh(new THREE.BoxGeometry(V.hx * 0.9, W, V.h * 0.22), paintMat(1, true));
      doors.position.set(0, 0, V.h * 0.38);
      this.near.add(doors);
    }
    // wheels: spin and (at the front) steer
    this.wheels = S.wheels.map(([x, y, z], i) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(S.wheel.tire, M.tire);
      const rim = new THREE.Mesh(S.wheel.rim, M.rim);
      tire.castShadow = true;
      spin.add(tire, rim);
      pivot.add(spin);
      this.near.add(pivot);
      return { pivot, spin, front: i < (S.bike ? 1 : 2) };
    });
    // steering wheel or handlebars
    if (S.sw) {
      this.sw = new THREE.Group();
      this.sw.position.set(S.sw.x, S.sw.y, S.sw.z);
      this.sw.rotation.y = -0.45;
      const rimG = new THREE.Mesh(new THREE.TorusGeometry(S.sw.r, 1.3, 6, 20), M.trim);
      rimG.rotation.y = Math.PI / 2;
      this.swSpin = new THREE.Group();
      this.swSpin.add(rimG);
      for (let k2 = 0; k2 < 3; k2++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(1, S.sw.r * 2, 1.4), M.trim); sp.rotation.x = (k2 * Math.PI) / 3; this.swSpin.add(sp); }
      this.sw.add(this.swSpin);
      this.near.add(this.sw);
    }
    if (S.bar) {
      this.lights = [new THREE.Mesh(new THREE.BoxGeometry(6, S.bar.w, 3), M.red), new THREE.Mesh(new THREE.BoxGeometry(6, S.bar.w, 3), M.blue)];
      this.lights[0].position.set(S.bar.x, S.bar.w / 2, S.bar.z);
      this.lights[1].position.set(S.bar.x, -S.bar.w / 2, S.bar.z);
      this.near.add(...this.lights);
    }
    if (S.sign) { const sg = new THREE.Mesh(new THREE.BoxGeometry(7, 18, 6), M.taxi); sg.position.set((VEHICLES[k].hx * (STYLE[V.style].rf + STYLE[V.style].rr)) / 2, 0, S.roof + 5); this.near.add(sg); }
    // far away: one box
    this.far = new THREE.Mesh(S.lod, this.paint);
    this.far.visible = false;
    this.root.add(this.far);
    this.occ = [];
    this.spin = 0;
    this.burnt = false;
  }

  // occupants by seat: suit look index or -1 (skip: the seat to leave empty, your own in first person)
  setOccupants(list, skip = -1) {
    const key = list.join(',') + '|' + skip;
    if (key === this.occKey) return;
    this.occKey = key;
    for (const o of this.occ) { this.near.remove(o); o.userData.dispose?.(); }
    this.occ = [];
    list.forEach((look, s) => {
      if (look < 0 || s === skip || s >= this.V.seat.length) return;
      const p = person(look, this.S.bike);
      const [x, y, z] = this.V.seat[s];
      p.position.set(x, y, z + (this.S.bike ? 6 : 0));
      if (this.S.bike) p.rotation.y = 0.25;
      this.near.add(p);
      this.occ.push(p);
    });
  }

  // flags from the server: siren, brake, burning, wrecked
  update(dt, t, st) {
    const S = this.S, V = this.V;
    const lod = st.dist > 2600;
    this.near.visible = !lod;
    this.far.visible = lod;
    if (st.wreck && !this.burnt) {
      this.burnt = true;
      const M = mats();
      this.body.material = M.burnt;
      this.far.material = M.burnt;
    }
    if (lod) return;
    // wheels roll with the speed, the front ones turn with the steering
    this.spin += (st.speed * dt) / S.r;
    for (const w of this.wheels) {
      w.spin.rotation.y = this.spin;
      w.pivot.rotation.z = w.front ? -st.steer * 0.5 : 0;
    }
    if (this.swSpin) this.swSpin.rotation.x = st.steer * 2.4;
    if (this.tail) this.tail.material = st.brake ? mats().tailOn : mats().tailOff;
    if (this.lights) {
      const on = st.siren && Math.floor(t * 6) % 2 === 0;
      this.lights[0].visible = !st.siren || on;
      this.lights[1].visible = !st.siren || !on;
    }
  }

  dispose() {
    for (const o of this.occ) o.userData.dispose?.();
    this.root.traverse((o) => { if (o.geometry && !o.geometry.userData.shared) { /* shared shapes stay for the next car */ } });
  }
}

// where the driver's hands go on the wheel (model frame), for first person
export function wheelInfo(k) {
  const S = shape(k);
  return S.sw ? { ...S.sw } : S.bars ? { x: S.bars[0], y: 0, z: S.bars[1], r: 10, bike: true } : null;
}
