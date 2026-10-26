// Free roam vehicles, built in code: a side profile extruded into door panels, bonnet and boot, a glass cabin
// with pillars and a roof, a real interior (dashboard with lit dials, steering wheel, seats) so first person
// driving works, wheels that turn and steer, head and brake lights, police light bars and the taxi sign.
// Bikes get a frame, tank, seat, bars and a rider. Static parts are merged per material; a cheap box stands in far away.
// Model frame: x forward, y left, z up, origin on the ground under the middle.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VEHICLES, PAINTS, unpackMods } from './vehicle.js';
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
  // estate: the roof runs all the way back
  wagon: { dash: 0.34, rf: 0.06, rr: -0.84, rear: -0.95, nose: 0.48, tail: 0.6, belt: 0.55, r: 14 },
  // minivan and kei car: a short bonnet and a tall, long cabin
  minivan: { dash: 0.62, rf: 0.22, rr: -0.9, rear: -0.97, nose: 0.46, tail: 0.62, belt: 0.52, r: 15 },
  kei: { dash: 0.6, rf: 0.46, rr: -0.88, rear: -0.95, nose: 0.5, tail: 0.6, belt: 0.5, r: 11 },
  // square off-roader with a spare wheel on the back and a roof rack
  boxy: { dash: 0.48, rf: 0.38, rr: -0.92, rear: -0.97, nose: 0.62, tail: 0.64, belt: 0.6, r: 18, spare: true, rack: true },
  // electric saloon: one long sweep of glass down to a short tail
  fastback: { dash: 0.3, rf: 0, rr: -0.5, rear: -0.88, nose: 0.42, tail: 0.55, belt: 0.55, r: 15 },
  sportsedan: { dash: 0.34, rf: 0.06, rr: -0.42, rear: -0.62, nose: 0.48, tail: 0.55, belt: 0.55, r: 15, wing: true },
  limo: { dash: 0.5, rf: 0.4, rr: -0.72, rear: -0.84, nose: 0.48, tail: 0.55, belt: 0.55, r: 14 },
  // convertible: no roof, just a windscreen and roll hoops
  roadster: { dash: 0.2, rf: -0.02, rr: -0.3, rear: -0.55, nose: 0.48, tail: 0.6, belt: 0.62, r: 13, open: true },
  // wedge supercar: a long flat nose and the cabin pushed forward
  wedge: { dash: 0.12, rf: -0.2, rr: -0.46, rear: -0.74, nose: 0.3, tail: 0.64, belt: 0.52, r: 14 },
  // tow truck: a tall cab, a bed, and the boom off the back
  tow: { dash: 0.58, rf: 0.42, rr: 0.08, rear: 0.04, nose: 0.6, tail: 0.5, belt: 0.56, r: 17, bed: true, boom: true },
};

const MAT = {};
function mats() {
  if (MAT.ready) return MAT;
  const P = isPotato();
  const std = (o) => (P ? new THREE.MeshLambertMaterial(o) : new THREE.MeshStandardMaterial(o));
  // one-sided: tinted from outside, clear from the driver's seat
  MAT.glass = P ? new THREE.MeshLambertMaterial({ color: 0x1c2a36, transparent: true, opacity: 0.5, depthWrite: false })
    : new THREE.MeshPhysicalMaterial({ color: 0x223442, metalness: 0.2, roughness: 0.04, transparent: true, opacity: 0.42, depthWrite: false, envMapIntensity: 1.6 });
  MAT.trim = std({ color: 0x1a1b1d, roughness: 0.6, metalness: 0.2 });
  MAT.inside = std({ color: 0x2a2b2e, roughness: 0.9 });
  MAT.seat = std({ color: 0x3a342e, roughness: 0.85 });
  MAT.tire = std({ color: 0x141414, roughness: 0.95 });
  MAT.rim = std({ color: 0xb8bcc2, roughness: 0.25, metalness: 0.9 });
  MAT.chrome = std({ color: 0xd8dce0, roughness: 0.15, metalness: 1 });
  MAT.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 1.6 });
  MAT.tailOff = new THREE.MeshStandardMaterial({ color: 0x5a0d0d, emissive: 0x5a0606, emissiveIntensity: 1 });
  MAT.tailOn = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 4, toneMapped: false });
  MAT.dial = new THREE.MeshBasicMaterial({ color: 0x2a5878 });
  MAT.red = new THREE.MeshBasicMaterial({ color: 0xff2020, toneMapped: false });
  MAT.blue = new THREE.MeshBasicMaterial({ color: 0x2050ff, toneMapped: false });
  MAT.dark = std({ color: 0x0c0c0e, roughness: 0.5 });
  MAT.taxi = new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc840, emissiveIntensity: 1.2 });
  MAT.smoke = new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.5, depthWrite: false });
  MAT.burnt = std({ color: 0x1b1816, roughness: 0.95 });
  MAT.plate = std({ color: 0xe8e8e0, roughness: 0.5 });
  MAT.caliper = std({ color: 0xb02020, roughness: 0.4, metalness: 0.4 });
  MAT.ready = true;
  return MAT;
}
// customs parts: rims, window tint, underglow
const RIMS = [null, 0x18191b, 0xc9a23e, 0xf0f0ee];
const NEON = [0, 0xff2a2a, 0x2a6aff, 0x2aff6a, 0xa040ff, 0xff4fd8, 0xffffff];
const modMats = new Map();
function modMat(key, make) { if (!modMats.has(key)) modMats.set(key, make()); return modMats.get(key); }
const rimMat = (i) => modMat('rim' + i, () => new THREE.MeshStandardMaterial({ color: RIMS[i], metalness: i === 3 ? 0.3 : 0.9, roughness: i === 3 ? 0.35 : 0.22 }));
const tintMat = (i) => modMat('tint' + i, () => (isPotato() ? new THREE.MeshLambertMaterial({ color: 0x0a0d12, transparent: true, opacity: i === 1 ? 0.7 : 0.88, depthWrite: false })
  : new THREE.MeshPhysicalMaterial({ color: 0x0c1016, metalness: 0.3, roughness: 0.05, transparent: true, opacity: i === 1 ? 0.66 : 0.87, depthWrite: false, envMapIntensity: 1.6 })));
const neonMat = (i) => modMat('neon' + i, () => new THREE.MeshBasicMaterial({ color: NEON[i], transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
const mergeNI = (list) => mergeGeometries(list.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; }));
// a fitted spoiler: 1 a ducktail lip on the boot, 2 a race wing on stands
const wings = new Map();
function wingGeo(k, type) {
  const key = k + ':' + type;
  if (wings.has(key)) return wings.get(key);
  const V = VEHICLES[k], S = shape(k), hx = V.hx, hy = V.hy, zt = S.zt;
  const g = type === 1 ? mergeNI([extrude([[-hx + 1, zt - 0.5], [-hx + 16, zt - 0.5], [-hx - 1, zt + 5]], -hy + 5, hy - 5, 0.5)])
    : mergeNI([extrude([[-hx + 2, zt + 14], [-hx + 20, zt + 15], [-hx + 18, zt + 17.5], [-hx, zt + 16.5]], -hy + 2, hy - 2, 0.6), box(3, 2, 15, -hx + 10, hy * 0.6, zt + 7), box(3, 2, 15, -hx + 10, -hy * 0.6, zt + 7)]);
  g.computeVertexNormals();
  wings.set(key, g);
  return g;
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
// smooth outline through key points (Catmull-Rom), as [x, z] pairs
function smooth(keys, per = 6) {
  const curve = new THREE.CatmullRomCurve3(keys.map(([x, z]) => new THREE.Vector3(x, z, 0)), false, 'centripetal');
  return curve.getPoints(Math.max(2, (keys.length - 1) * per)).map((p) => [p.x, p.y]);
}
// a rounded tyre (a lathe of its cross-section) with the axle along y
function tyreGeo(r, w) {
  const t = r * 0.32, pts = [];
  for (let k = 0; k <= 10; k++) { const a = -Math.PI / 2 + (k / 10) * Math.PI; pts.push(new THREE.Vector2(r - t + Math.cos(a) * t, Math.sin(a) * (w / 2))); }
  const g = new THREE.LatheGeometry(pts, 22);
  return g; // lathe spins round y: the axle
}
function wheelGeo(r, w) {
  const tire = tyreGeo(r, w);
  // the rim: a dish, five spokes, a centre cap and the brake disc behind
  const parts = [];
  const dish = new THREE.CylinderGeometry(r * 0.66, r * 0.66, w * 0.7, 18);
  parts.push(dish.toNonIndexed());
  for (let k = 0; k < 5; k++) {
    const s = new THREE.BoxGeometry(r * 1.2, 1.6, r * 0.16);
    s.rotateY((k / 5) * Math.PI);
    s.translate(0, w * 0.38, 0);
    parts.push(s.toNonIndexed());
  }
  const cap = new THREE.CylinderGeometry(r * 0.16, r * 0.16, 2, 10);
  cap.translate(0, w * 0.4, 0);
  parts.push(cap.toNonIndexed());
  const disc = new THREE.CylinderGeometry(r * 0.52, r * 0.52, 1.2, 18);
  disc.translate(0, -w * 0.05, 0);
  parts.push(disc.toNonIndexed());
  const caliper = new THREE.BoxGeometry(r * 0.32, 3, r * 0.42);
  caliper.translate(-r * 0.36, w * 0.12, r * 0.22);
  return { tire, rim: mergeGeometries(parts.map((g) => { g.deleteAttribute('uv'); return g; })), caliper };
}

// ------------------------------------------------------------------ cars
const built = new Map();
function buildCar(V) {
  const S = STYLE[V.style];
  const hx = V.hx, hy = V.hy, H = V.h, r = S.r, c = 8;
  const zb = H * S.belt, zn = H * S.nose * 0.92, zt = S.box ? H : H * S.tail * 0.97;
  const xd = hx * S.dash, xf = hx * S.rf, xr = hx * S.rr, xq = hx * S.rear;
  const wf = V.wb / 2, wr = -V.wb / 2;
  const paint = [], glass = [], trim = [], inside = [], seat = [], head = [], tail = [], chrome = [], plate = [];
  // ---- the side profile: a rounded nose, the bonnet rising to the windscreen, the beltline, the boot and tail
  const nose = smooth([[hx - 8, c + 1], [hx - 1, c + 6], [hx + 1, (c + zn) * 0.5], [hx - 2, zn - 1], [hx - 10, zn + 1.5], [hx * 0.62, zn + 3.5], [xd + 6, zb - 1.5], [xd, zb]], 4);
  const tailK = S.box ? [[xq, zb], [-hx + 2, zb], [-hx, zb - 6], [-hx - 1, (c + zb) * 0.5], [-hx + 1, c + 5], [-hx + 8, c + 1]]
    : [[xq, zb], [xq - (xq + hx) * 0.35, zt + 0.5], [-hx + 6, zt], [-hx, zt - 4], [-hx - 1, (c + zt) * 0.5], [-hx + 1, c + 5], [-hx + 8, c + 1]];
  const tailP = smooth(tailK, 4);
  const arch = (cx, R) => { const out = []; for (let k = 0; k <= 12; k++) { const a = (k / 12) * Math.PI; out.push([cx + Math.cos(a) * R, r - 1 + Math.sin(a) * R]); } return out; };
  // round the car: nose, bonnet, beltline, boot, tail, then along the bottom over both wheel arches
  const sideFix = [...nose, ...tailP, ...arch(wr, r + 4).sort((a, b) => a[0] - b[0]), ...arch(wf, r + 4).sort((a, b) => a[0] - b[0])];
  for (const s of [-1, 1]) paint.push(extrude(sideFix, s > 0 ? hy - 5 : -hy, s > 0 ? hy : -hy + 5, 1.5));
  // bonnet and boot: solid across the car with rounded top edges
  paint.push(extrude([...nose, [xd, c + 6], [hx - 8, c + 6]], -hy + 4, hy - 4, 2.5));
  if (!S.box && !S.bed) paint.push(extrude([...tailP, [-hx + 8, c + 6], [xq, c + 6]], -hy + 4, hy - 4, 2.5));
  inside.push(box(xd - xq, hy * 2 - 8, 3, (xd + xq) / 2, 0, c + 6));
  // ---- the glasshouse: windscreen, a crowned roof, the rear window; pillars and a painted roof skin
  if (S.open) {
    // a convertible: the windscreen in its frame, roll hoops behind the seats, a flat deck over the hood well
    const ws = smooth([[xd, zb], [xd - (xd - xf) * 0.55, zb + (H - zb) * 0.75], [xf, H - 2]], 4);
    glass.push(extrude([...ws, [xf - 2.5, H - 2], [xd - 2.5, zb]], -hy + 7, hy - 7, 0.8));
    paint.push(box(3, hy * 2 - 12, 3, xf, 0, H - 1.5));
    for (const s of [-1, 1]) {
      paint.push(strut([xd, zb], [xf, H - 2], s * (hy - 6.5), 4, 3));
      trim.push(box(xd - xq, 1.2, 1.4, (xd + xq) / 2, s * (hy - 4.6), zb + 0.6));
    }
    for (const [x, y] of V.seat) trim.push(box(4, hy * 0.5, 20, x - 24, y, zb + 10));
    const deck = V.seat[0][0] - 30;
    paint.push(box(Math.max(4, deck - xq), hy * 2 - 10, 3, (deck + xq) / 2, 0, zb - 1));
  } else if (!S.box) {
    const crown = smooth([[xd, zb], [xd - (xd - xf) * 0.55, zb + (H - zb) * 0.72], [xf, H - 2], [(xf + xr) / 2, H], [xr, H - 2], [xq + (xr - xq) * 0.45, zb + (H - zb) * 0.7], [xq, zb]], 5);
    glass.push(extrude(crown, -hy + 6, hy - 6, 2));
    const top = crown.filter(([x]) => x <= xf + 2 && x >= xr - 2);
    paint.push(extrude([...top.map(([x, z]) => [x, z + 1.8]), ...top.slice().reverse().map(([x, z]) => [x, z - 2.5])], -hy + 7, hy - 7, 1.5));
    for (const s of [-1, 1]) {
      const y = s * (hy - 6.5);
      paint.push(strut([xd, zb], [xf, H - 2], y, 4.5, 3.5), strut([xq, zb], [xr, H - 2], y, S.style === 'hatch' || S.style === 'suv' ? 6 : 9, 3.5));
      paint.push(box(4.5, 3.5, H - zb, (xf + xr) / 2 + 2, y, (zb + H) / 2)); // B pillar
      trim.push(box(xd - xq, 1.2, 1.4, (xd + xq) / 2, s * (hy - 4.6), zb + 0.6)); // window seal
    }
  } else {
    // van: a short cab with a deep windscreen, then the box
    glass.push(extrude(smooth([[xd, zb], [xd - (xd - xf) * 0.5, (zb + H) * 0.52], [xf, H - 6], [xr, H - 6], [xr, zb]], 3), -hy + 6, hy - 6, 1.5));
    paint.push(extrude([[-hx, c + 2], [xr, c + 2], [xr, H], [-hx + 2, H], [-hx, H - 3]], -hy, hy, 2));
    paint.push(box(xf - xr + 6, hy * 2 - 4, 6, (xf + xr) / 2, 0, H - 3));
    for (const s of [-1, 1]) paint.push(strut([xd, zb], [xf, H - 4], s * (hy - 6), 5, 3));
    trim.push(box(1, hy * 1.6, H * 0.6, -hx - 0.5, 0, H * 0.5)); // rear doors' seam
  }
  if (S.bed) {
    for (const s of [-1, 1]) paint.push(box(hx + xq - 4, 4, zb - c - 2, (xq - 4 - hx) / 2, s * (hy - 2), (zb + c + 2) / 2));
    paint.push(box(4, hy * 2, zb - c - 2, -hx + 2, 0, (zb + c + 2) / 2));
    trim.push(box(hx + xq - 8, hy * 2 - 8, 2, (xq - 8 - hx) / 2, 0, c + 12));
  }
  // ---- details: bumpers, grille, lights, mirrors, door lines, handles, skirts, exhausts, plates
  trim.push(extrude(smooth([[hx - 6, c + 2], [hx + 2, c + 4], [hx + 2.5, c + 13], [hx - 4, c + 15]], 3).concat([[hx - 6, c + 15]]), -hy + 1, hy - 1, 1)); // front lip
  trim.push(box(4, hy * 1.9, 9, -hx - 0.5, 0, c + 7)); // rear bumper insert / diffuser
  const gz = (c + zn) * 0.55;
  trim.push(box(2, hy * (S.style === 'muscle' || S.style === 'suv' ? 1.15 : 0.9), (zn - c) * 0.32, hx + 0.6, 0, gz)); // grille
  chrome.push(box(1, hy * (S.style === 'muscle' || S.style === 'suv' ? 1.2 : 0.95), 1.2, hx + 1.4, 0, gz + (zn - c) * 0.17));
  for (const s of [-1, 1]) {
    // headlight: a chrome reflector under clear glass, with a light strip
    chrome.push(box(3, hy * 0.34, 7, hx - 1.5, s * hy * 0.64, zn - 6.5));
    head.push(box(1, hy * 0.3, 1.6, hx + 0.6, s * hy * 0.64, zn - 3.5));
    glass.push(box(1.5, hy * 0.38, 8, hx + 0.4, s * hy * 0.64, zn - 6.5));
    // tail light
    tail.push(box(2, hy * 0.42, 5, -hx - 0.6, s * hy * 0.6, (S.box ? H * 0.42 : zt - 7)));
    // mirror on an arm
    trim.push(box(5, 6, 2, xd - 3, s * (hy + 2), zb + 2));
    paint.push(box(5, 6, 6, xd - 4, s * (hy + 6), zb + 5));
    glass.push(box(0.6, 5, 4.5, xd - 6.6, s * (hy + 6), zb + 5));
    // door seams and handles
    const doors = V.seats > 2 && !S.box && !S.bed ? [xd - 3, (xf + xr) / 2 + 4, xq + 2] : [xd - 3, (xf + xr) / 2 - (V.seats > 2 ? 0 : 20)];
    for (const x of doors) trim.push(box(0.8, 0.6, zb - c - 10, x, s * (hy + 0.25), (zb + c + 4) / 2));
    for (let k = 0; k < doors.length - 1; k++) chrome.push(box(6, 0.8, 1.6, doors[k + 1] + 8, s * (hy + 0.4), zb - 6));
    // side skirt
    trim.push(box(wf - wr - (r + 5) * 2, 2, 4, (wf + wr) / 2, s * (hy - 0.5), c + 2));
  }
  for (const s of S.style === 'muscle' || S.style === 'super' || S.style === 'coupe' ? [-1, 1] : [1]) {
    const ex = new THREE.CylinderGeometry(2.4, 2.4, 6, 10).rotateZ(Math.PI / 2);
    ex.translate(-hx - 2, s * hy * 0.45, c + 4);
    chrome.push(ex.toNonIndexed());
  }
  plate.push(box(0.6, 20, 6, hx + 2.8, 0, c + 9), box(0.6, 20, 6, -hx - 1.4, 0, c + 13));
  // ---- interior: dashboard with a hood over the dials, centre console, seats with headrests
  inside.push(box(12, hy * 2 - 10, 10, xd - 6, 0, zb - 6));
  inside.push(box(6, hy * 0.6, 3, xd - 10, V.seat[0][1], zb + 0.5));
  inside.push(box(18, 10, zb - c - 14, xd - 16, 0, (zb + c) / 2 - 2));
  const sz = V.seat[0][2];
  for (const [x, y] of V.seat) {
    seat.push(box(22, hy * 0.62, 6, x, y, sz + 2));
    seat.push(strut([x - 13, sz + 4], [x - 17, sz + 30], y, hy * 0.6, 6));
    seat.push(box(5, hy * 0.34, 7, x - 18, y, sz + 34));
  }
  const dials = box(0.4, 7, 2.6, xd - 10.3, V.seat[0][1], zb - 2.5);
  if (S.bar) { trim.push(box(9, hy * 1.4, 3, (xf + xr) / 2, 0, H + 1)); }
  if (S.sign) trim.push(box(8, 20, 3, (xf + xr) / 2, 0, H + 1));
  if (S.spare) {
    const t = new THREE.CylinderGeometry(r + 2, r + 2, 9, 16).rotateZ(Math.PI / 2);
    t.translate(-hx - 5, 0, zt - r - 4);
    trim.push(t);
    chrome.push(box(1, r, r, -hx - 9.6, 0, zt - r - 4));
  }
  if (S.rack) {
    for (const s of [-1, 1]) trim.push(box(xf - xr, 2.5, 3, (xf + xr) / 2, s * (hy - 9), H + 3));
    for (const x of [xf - 6, (xf + xr) / 2, xr + 6]) trim.push(box(3, hy * 2 - 16, 2, x, 0, H + 4.5));
  }
  const beacon = [];
  if (S.boom) {
    // the tow rig: a frame on the bed, the boom with its cable and hook, the wheel lift; amber beacons on the cab
    trim.push(box(14, hy * 1.4, 16, xq - 10, 0, zb + 8));
    trim.push(strut([xq - 10, zb + 16], [-hx - 6, zb + 46], 0, 8, 8));
    trim.push(box(1.5, 1.5, 26, -hx - 6, 0, zb + 32));
    chrome.push(box(5, 3, 7, -hx - 6, 0, zb + 16));
    trim.push(box(10, hy * 1.9, 6, -hx - 2, 0, c + 12));
    beacon.push(box(7, hy * 1.2, 4, (xf + xr) / 2, 0, H + 2));
  }
  if (S.wing) { paint.push(extrude([[-hx + 2, zt + 9], [-hx + 18, zt + 10], [-hx + 16, zt + 12], [-hx, zt + 11]], -hy + 2, hy - 2, 0.6)); for (const s of [-1, 1]) trim.push(box(3, 2, 9, -hx + 9, s * hy * 0.7, zt + 4)); }
  const nonIdx = (list) => mergeGeometries(list.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; }));
  const out = {
    paint: nonIdx(paint), glass: nonIdx(glass), trim: nonIdx(trim), inside: nonIdx(inside), seat: nonIdx(seat),
    head: mergeGeometries(head), tail: mergeGeometries(tail), chrome: nonIdx(chrome), plate: mergeGeometries(plate), dials,
    wheels: [[wf, hy - 9, r], [wf, -hy + 9, r], [wr, hy - 9, r], [wr, -hy + 9, r]], wheel: wheelGeo(r, 11), r,
    lod: mergeGeometries([box(hx * 2, hy * 2, zb - c, 0, 0, (zb + c) / 2), box(Math.max(10, xf - xr), hy * 2 - 10, H - zb, (xf + xr) / 2, 0, (zb + H) / 2)]),
    sw: { x: xd - 22, y: V.seat[0][1], z: zb - 3, r: hy * 0.27 }, bar: S.bar ? { x: (xf + xr) / 2, z: H + 3.5, w: hy * 0.6 } : null, sign: !!S.sign, roof: H,
    beacon: beacon.length ? mergeGeometries(beacon) : null, zt,
  };
  for (const k of ['paint', 'glass', 'inside', 'seat', 'trim', 'chrome']) out[k].computeVertexNormals();
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

// ------------------------------------------------------------------ aircraft
// A fuselage turned on a lathe (nose to tail along x), wings and a tail, a glass canopy, landing gear, and a
// propeller or jet nozzles. Model frame as the cars: x forward, y left, z up, wheels on the ground at z 0.
function lathe(profile, segs = 16) {
  // profile: [[x, radius]] from nose to tail; lathe spins round y, so build on y and turn it onto x
  const pts = profile.map(([x, r]) => new THREE.Vector2(Math.max(0.01, r), -x));
  const g = new THREE.LatheGeometry(pts, segs);
  g.rotateZ(Math.PI / 2); // y axis -> x axis
  return g;
}
function wing(span, chord, root, tip, sweep, z, x, thick = 3) {
  // a tapered wing (both sides) as an extruded plan shape, flat in z
  const s = new THREE.Shape();
  s.moveTo(x + root / 2, 0);
  s.lineTo(x + root / 2 - sweep, span / 2);
  s.lineTo(x + root / 2 - sweep - tip, span / 2);
  s.lineTo(x - root / 2, 0);
  s.lineTo(x + root / 2 - sweep - tip, -span / 2);
  s.lineTo(x + root / 2 - sweep, -span / 2);
  s.lineTo(x + root / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelSize: 1, bevelThickness: 1, bevelSegments: 1 });
  g.translate(0, 0, z);
  return g;
}
function fin(x, len, h, sweep, z, thick = 3) {
  const s = new THREE.Shape();
  s.moveTo(x, 0); s.lineTo(x - sweep, h); s.lineTo(x - sweep - len * 0.45, h); s.lineTo(x - len, 0); s.lineTo(x, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: false });
  g.rotateX(Math.PI / 2); // shape y -> z
  g.translate(0, thick / 2, z);
  return g;
}
// a helicopter: a rounded cabin with a big bubble windscreen, a tail boom with a fin and tail rotor, skids, and
// the main rotor on a mast (spun by the model)
function buildHeli(V) {
  const hx = V.hx, R = V.hy * 1.15, zc = V.h * 0.5;
  const paint = [], glass = [], trim = [], chrome = [];
  const cabin = lathe([[hx * 0.55, R * 0.4], [hx * 0.45, R * 0.85], [hx * 0.2, R], [-hx * 0.15, R * 0.95], [-hx * 0.35, R * 0.6]], 18);
  cabin.translate(0, 0, zc);
  paint.push(cabin);
  const bubble = new THREE.SphereGeometry(1, 18, 12, -Math.PI / 2, Math.PI, 0, Math.PI);
  bubble.scale(R * 0.95, R * 0.92, R * 0.85).rotateZ(-Math.PI / 2).translate(hx * 0.42, 0, zc + 4);
  glass.push(bubble);
  for (const s of [-1, 1]) glass.push(box(hx * 0.3, 1, R * 0.7, hx * 0.05, s * (R * 0.94), zc + R * 0.2));
  const boom = new THREE.CylinderGeometry(R * 0.18, R * 0.32, hx * 1.05, 10).rotateZ(Math.PI / 2);
  boom.translate(-hx * 0.85, 0, zc + R * 0.35);
  paint.push(boom);
  paint.push(fin(-hx * 1.25, hx * 0.22, R * 1.6, hx * 0.1, zc + R * 0.35));
  paint.push(wing(R * 1.8, 0, hx * 0.16, hx * 0.1, 4, zc + R * 0.4, -hx * 1.15, 2));
  // engine cowling and the rotor mast
  paint.push(box(hx * 0.45, R * 1.2, R * 0.5, -hx * 0.1, 0, zc + R * 1.05));
  chrome.push(new THREE.CylinderGeometry(4, 5, R * 0.6, 10).rotateX(Math.PI / 2).translate(0, 0, zc + R * 1.5));
  // skids
  for (const s of [-1, 1]) {
    const skid = new THREE.CylinderGeometry(2.4, 2.4, hx * 1.25, 8).rotateZ(Math.PI / 2);
    skid.translate(hx * 0.05, s * R * 0.95, 3);
    trim.push(skid);
    for (const x of [hx * 0.3, -hx * 0.2]) trim.push(strut([x, 3], [x * 0.8, zc - R * 0.7], s * R * 0.85, 3, 3));
  }
  const nonIdx = (list) => mergeGeometries(list.map((g) => { const n = g.index ? g.toNonIndexed() : g; if (n.attributes.uv) n.deleteAttribute('uv'); return n; }));
  const out = { air: true, heli: true, paint: nonIdx(paint), glass: nonIdx(glass), trim: nonIdx(trim), chrome: nonIdx(chrome), head: null, tail: null, wheels: [], wheel: null, r: 10,
    rotor: { z: zc + R * 1.8, r: V.span / 2 }, tailRotor: { x: -hx * 1.32, y: R * 0.25, z: zc + R * 1.1, r: R * 0.9 }, prop: null,
    lod: mergeGeometries([box(hx * 1.2, R * 2, R * 2, 0, 0, zc), box(hx * 1.1, 8, 8, -hx * 0.85, 0, zc + R * 0.35)]), roof: zc + R };
  for (const k of ['paint', 'glass', 'trim', 'chrome']) out[k].computeVertexNormals();
  return out;
}

function buildPlane(V) {
  if (V.heli) return buildHeli(V);
  const hx = V.hx, span = V.span, st = V.style;
  const jet = !!V.jet, fighter = st === 'fighter', biz = st === 'bizjet', bi = st === 'biplane';
  const R = fighter ? 34 : biz ? 46 : 28; // fuselage radius
  const zc = fighter ? 52 : biz ? 64 : bi ? 56 : 50; // fuselage centre height
  const paint = [], glass = [], trim = [], chrome = [], head = [];
  const nose = fighter ? [[hx, 1], [hx * 0.8, R * 0.45], [hx * 0.5, R * 0.85], [hx * 0.2, R]] : jet ? [[hx, 2], [hx * 0.9, R * 0.6], [hx * 0.7, R * 0.95], [hx * 0.5, R]] : [[hx, R * 0.55], [hx * 0.85, R * 0.9], [hx * 0.6, R]];
  const body = lathe([...nose, [-hx * 0.3, R * 0.95], [-hx * 0.75, R * 0.5], [-hx, R * 0.18]]);
  body.translate(0, 0, zc);
  paint.push(body);
  // wings
  if (fighter) paint.push(wing(span, 0, hx * 0.9, hx * 0.18, hx * 0.62, zc - 6, -hx * 0.15, 4));
  else if (biz) paint.push(wing(span, 0, hx * 0.42, hx * 0.16, hx * 0.3, zc - R * 0.6, -hx * 0.05, 5));
  else {
    paint.push(wing(span, 0, hx * 0.42, hx * 0.32, 4, bi ? zc - R * 0.8 : zc + R * 0.85, hx * 0.15, 4));
    if (bi) {
      paint.push(wing(span * 0.95, 0, hx * 0.4, hx * 0.32, 4, zc + R * 1.9, hx * 0.18, 4));
      for (const s of [-1, 1]) for (const k of [0.25, 0.42]) trim.push(box(3, 3, R * 2.7, hx * 0.15, s * span * k, zc + R * 0.55));
    } else for (const s of [-1, 1]) trim.push(strut([hx * 0.1, zc - R * 0.6], [hx * 0.1, zc + R * 0.85], s * span * 0.2, 4, 3)); // struts
  }
  // the tail
  const tx = -hx * 0.62;
  paint.push(wing(fighter ? span * 0.45 : span * 0.36, 0, hx * 0.3, hx * 0.16, hx * 0.12, zc + (biz ? R * 1.6 : 0), -hx * 0.85, 3));
  paint.push(fin(-hx * 0.62, hx * 0.38, fighter ? R * 2.4 : biz ? R * 1.9 : R * 2.2, hx * 0.22, zc + R * 0.4));
  if (fighter) paint.push(fin(-hx * 0.62, hx * 0.38, R * 2.2, hx * 0.22, zc + R * 0.4).rotateX(0));
  // canopy or windows
  const cab = new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  if (fighter) { cab.scale(hx * 0.32, R * 0.62, R * 0.72); cab.translate(hx * 0.42, 0, zc + R * 0.55); }
  else if (biz) { cab.scale(hx * 0.16, R * 0.85, R * 0.6); cab.translate(hx * 0.62, 0, zc + R * 0.35); }
  else { cab.scale(hx * 0.32, R * 0.92, R * 0.95); cab.translate(hx * 0.32, 0, zc + R * 0.35); }
  glass.push(cab);
  if (biz) for (let k = 0; k < 7; k++) for (const s of [-1, 1]) glass.push(box(10, 1, 9, hx * 0.38 - k * 26, s * (R - 0.5), zc + R * 0.3));
  // engines
  if (fighter) {
    for (const s of [-1, 1]) { const intake = new THREE.CylinderGeometry(R * 0.38, R * 0.42, hx * 0.5, 12).rotateZ(Math.PI / 2); intake.translate(hx * 0.05, s * R * 0.95, zc - R * 0.2); paint.push(intake); }
    const noz = new THREE.CylinderGeometry(R * 0.5, R * 0.42, 30, 14).rotateZ(Math.PI / 2); noz.translate(-hx - 10, 0, zc); chrome.push(noz);
  } else if (biz) {
    for (const s of [-1, 1]) { const pod = new THREE.CylinderGeometry(R * 0.42, R * 0.36, hx * 0.42, 14).rotateZ(Math.PI / 2); pod.translate(-hx * 0.55, s * R * 1.5, zc + R * 0.5); paint.push(pod); trim.push(box(hx * 0.12, R * 0.9, 5, -hx * 0.55, s * R * 1.1, zc + R * 0.5)); }
  } else {
    const spinner = new THREE.ConeGeometry(R * 0.4, 24, 12).rotateZ(-Math.PI / 2); spinner.translate(hx + 10, 0, zc); chrome.push(spinner);
  }
  // landing gear: two mains and a nose wheel
  const gear = (x, y, r) => { trim.push(box(3, 3, zc - R * 0.6 - r, x, y, (zc - R * 0.6 + r) / 2)); const w = new THREE.CylinderGeometry(r, r, 7, 14); w.translate(x, y, r); trim.push(w); };
  gear(hx * (bi ? 0.42 : 0.62), 0, 9);
  for (const s of [-1, 1]) gear(-hx * (bi ? -0.25 : 0.05), s * R * (fighter ? 1.2 : 1.6), 12);
  // nav lights: red left wingtip, green right
  head.push(box(5, 3, 3, 0, span / 2 - 4, (bi ? zc - R * 0.8 : fighter ? zc - 4 : zc + R * 0.85) + 4));
  const navR = box(5, 3, 3, 0, -span / 2 + 4, (bi ? zc - R * 0.8 : fighter ? zc - 4 : zc + R * 0.85) + 4);
  for (const g of paint) if (!g.attributes.normal) g.computeVertexNormals();
  return {
    air: true, paint: mergeGeometries(paint.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; })),
    glass: mergeGeometries(glass.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; })),
    trim: mergeGeometries(trim.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; })),
    chrome: mergeGeometries(chrome.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { g.deleteAttribute('uv'); return g; })),
    head: mergeGeometries(head), tail: null, navR, wheels: [], wheel: null, r: 12,
    prop: !jet ? { x: hx + 6, z: zc, r: bi ? 46 : 40 } : null, nozzle: fighter ? { x: -hx - 25, z: zc, r: R * 0.42 } : null,
    lod: mergeGeometries([box(hx * 2, R * 2, R * 2, 0, 0, zc), box(hx * 0.5, span, 4, 0, 0, zc)]), roof: zc + R,
  };
}

function shape(k) {
  if (!built.has(k)) { const V = VEHICLES[k]; built.set(k, V.air ? buildPlane(V) : V.bike ? buildBike(V) : buildCar(V)); }
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
  constructor(k, paint, mods = 0) {
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
    // the body leans on its springs (into corners, nose down under braking); the wheels stay put
    this.body3 = new THREE.Group();
    this.near.add(this.body3);
    const police = V.style === 'police';
    this.paint = paintMat(paint, police);
    const mesh = (geo, m, shadow = true) => { if (!geo) return null; const o = new THREE.Mesh(geo, m); o.castShadow = shadow; o.receiveShadow = true; this.body3.add(o); return o; };
    this.body = mesh(S.paint, this.paint);
    const md = unpackMods(mods);
    const car = !V.air && !S.bike && S.zt !== undefined;
    if (S.glass) mesh(S.glass, car && md.tint ? tintMat(md.tint) : M.glass, false);
    if (car && md.wing) mesh(wingGeo(k, md.wing), this.paint);
    if (S.beacon) this.beacon = mesh(S.beacon, M.taxi, false);
    mesh(S.trim, M.trim);
    if (S.inside) mesh(S.inside, M.inside, false);
    mesh(S.seat, M.seat, false);
    mesh(S.chrome, M.chrome, false);
    if (S.head) mesh(S.head, M.head, false);
    this.tail = S.tail ? mesh(S.tail, M.tailOff, false) : null;
    if (S.dials) mesh(S.dials, M.dial, false);
    if (S.plate) mesh(S.plate, M.plate, false);
    if (police && !S.bike) {
      // black doors and bonnet on a white car read as police from a mile off
      this.body.material = paintMat(2, true);
      const W = V.hy * 2 + 0.6;
      const doors = new THREE.Mesh(new THREE.BoxGeometry(V.hx * 0.9, W, V.h * 0.22), paintMat(1, true));
      doors.position.set(0, 0, V.h * 0.38);
      this.body3.add(doors);
    }
    if (S.rotor) {
      // the main rotor: four blades and a blur disc; the tail rotor
      this.rotor = new THREE.Group();
      this.rotor.position.set(0, 0, S.rotor.z);
      for (let k = 0; k < 4; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(S.rotor.r, 7, 1.2), M.trim); b.position.x = S.rotor.r / 2; const arm = new THREE.Group(); arm.rotation.z = (k / 4) * Math.PI * 2; arm.add(b); this.rotor.add(arm); }
      const disc = new THREE.Mesh(new THREE.CircleGeometry(S.rotor.r, 32), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide }));
      this.rotor.add(disc);
      this.rotor.userData.disc = disc;
      this.body3.add(this.rotor);
      this.tailRotor = new THREE.Group();
      this.tailRotor.position.set(S.tailRotor.x, S.tailRotor.y, S.tailRotor.z);
      for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(3, 1, S.tailRotor.r * 2), M.trim); b.rotation.y = k * Math.PI / 2; this.tailRotor.add(b); }
      this.body3.add(this.tailRotor);
    }
    if (S.prop) {
      this.prop = new THREE.Group();
      this.prop.position.set(S.prop.x, 0, S.prop.z);
      const blade = new THREE.Mesh(new THREE.BoxGeometry(2, 5, S.prop.r * 2), M.trim);
      const blade2 = blade.clone(); blade2.rotation.x = Math.PI / 2;
      const disc = new THREE.Mesh(new THREE.CircleGeometry(S.prop.r, 24).rotateY(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
      this.prop.add(blade, blade2, disc);
      this.prop.userData.disc = disc;
      this.near.add(this.prop);
    }
    if (S.nozzle) {
      this.flame = new THREE.Mesh(new THREE.ConeGeometry(S.nozzle.r, 90, 12).rotateZ(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      this.flame.position.set(S.nozzle.x - 40, 0, S.nozzle.z);
      this.near.add(this.flame);
    }
    if (S.navR) { const n = new THREE.Mesh(S.navR, new THREE.MeshBasicMaterial({ color: 0xff2020 })); this.near.add(n); }
    // wheels: spin and (at the front) steer
    this.wheels = S.wheels.map(([x, y, z], i) => {
      const pivot = new THREE.Group();
      pivot.position.set(x, y, z);
      const spin = new THREE.Group();
      const tire = new THREE.Mesh(S.wheel.tire, M.tire);
      const rim = new THREE.Mesh(S.wheel.rim, car && md.rim ? rimMat(md.rim) : M.rim);
      tire.castShadow = true;
      spin.add(tire, rim);
      pivot.add(spin);
      if (S.wheel.caliper) pivot.add(new THREE.Mesh(S.wheel.caliper, M.caliper));
      if (y < 0) pivot.scale.y = -1; // the rim faces out on both sides
      this.near.add(pivot);
      return { pivot, spin, front: i < (S.bike ? 1 : 2) };
    });
    // underglow: a soft pool of colour on the road under the car
    if (car && md.neon) {
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(V.hx * 2, V.hy * 2.3), neonMat(md.neon));
      glow.position.z = 1.5;
      this.near.add(glow);
    }
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
      this.body3.add(this.sw);
    }
    if (S.bar) {
      this.lights = [new THREE.Mesh(new THREE.BoxGeometry(6, S.bar.w, 3), M.red), new THREE.Mesh(new THREE.BoxGeometry(6, S.bar.w, 3), M.blue)];
      this.lights[0].position.set(S.bar.x, S.bar.w / 2, S.bar.z);
      this.lights[1].position.set(S.bar.x, -S.bar.w / 2, S.bar.z);
      this.body3.add(...this.lights);
    }
    if (S.sign) { const sg = new THREE.Mesh(new THREE.BoxGeometry(7, 18, 6), M.taxi); sg.position.set((VEHICLES[k].hx * (STYLE[V.style].rf + STYLE[V.style].rr)) / 2, 0, S.roof + 5); this.body3.add(sg); }
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
    for (const o of this.occ) { this.body3.remove(o); o.userData.dispose?.(); }
    this.occ = [];
    list.forEach((look, s) => {
      if (look < 0 || s === skip || s >= this.V.seat.length) return;
      const p = person(look, this.S.bike);
      const [x, y, z] = this.V.seat[s];
      p.position.set(x, y, z + (this.S.bike ? 6 : 0));
      if (this.S.bike) p.rotation.y = 0.25;
      this.body3.add(p);
      this.occ.push(p);
    });
  }

  // flags from the server: siren, brake, burning, wrecked
  update(dt, t, st) {
    const S = this.S, V = this.V;
    const lod = st.lod ?? st.dist > 2600;
    this.near.visible = !lod;
    this.far.visible = lod;
    if (st.wreck && !this.burnt) {
      this.burnt = true;
      const M = mats();
      this.body.material = M.burnt;
      this.far.material = M.burnt;
    }
    if (lod) return;
    if (this.rotor) { const k = st.thr || 0; this.rotor.rotation.z += dt * k * 28; this.tailRotor.rotation.y += dt * k * 60; this.rotor.userData.disc.material.opacity = 0.05 + k * 0.18; }
    if (this.prop) { this.prop.rotation.x += dt * (8 + (st.thr || 0) * 70); this.prop.userData.disc.material.opacity = 0.08 + (st.thr || 0) * 0.25; }
    if (this.flame) { const k = st.thr || 0; this.flame.visible = k > 0.05; this.flame.scale.set(0.4 + k * 0.9 + Math.random() * 0.1, 1, 1); }
    // wheels roll with the speed, the front ones turn with the steering
    this.spin += (st.speed * dt) / S.r;
    for (const w of this.wheels) {
      w.spin.rotation.y = this.spin;
      w.pivot.rotation.z = w.front ? -st.steer * 0.5 : 0;
    }
    if (this.swSpin) this.swSpin.rotation.x = st.steer * 2.4;
    // body roll and pitch from cornering and braking, on a soft spring
    if (!V.air && !S.bike) {
      const acc = (st.speed - (this.lastSpeed ?? st.speed)) / Math.max(dt, 1e-3);
      this.lastSpeed = st.speed;
      const lat = st.speed * Math.abs(st.speed) * Math.tan(st.steer * 0.5) / V.wb;
      const wantRoll = Math.max(-0.07, Math.min(0.07, lat * 1.4e-6));
      const wantPitch = Math.max(-0.05, Math.min(0.05, -acc * 2.2e-5));
      this.rollV = (this.rollV || 0) + ((wantRoll - this.body3.rotation.x) * 60 - (this.rollV || 0) * 9) * dt;
      this.pitchV = (this.pitchV || 0) + ((wantPitch - this.body3.rotation.y) * 60 - (this.pitchV || 0) * 9) * dt;
      this.body3.rotation.x += this.rollV * dt;
      this.body3.rotation.y += this.pitchV * dt;
    }
    if (this.tail) this.tail.material = st.brake ? mats().tailOn : mats().tailOff;
    if (this.beacon) this.beacon.visible = Math.floor(t * 3) % 2 === 0;
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
