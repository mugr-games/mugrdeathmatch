// How the emotes move (the list of them is in cosmetics.js). Each pose says where the feet and hands go, and
// the legs and arms reach there, so feet stay planted and hands land where they mean to. Captain Clark and
// Lord Verity are keyframed move by move from their videos, in beats of their music.
import * as THREE from 'three';
import { reachArm } from './avatar.js';
import { EMOTE } from './cosmetics.js';
const TAU = Math.PI * 2;
const ease = (k) => k * k * (3 - 2 * k);
const clamp01 = (k) => Math.max(0, Math.min(1, k));
const mix = (a, b, k) => a + (b - a) * k;
const _h = new THREE.Vector3();

// A leg reaching for a foot target in the body's own space (the feet stay put however the hips swing):
// x forward, y out to its side from where the leg joins the hips, z height of the ankle above the ground
// (1.5 is standing). The thigh is 18 long, the shin 15.5; the knee bends forward. The foot is kept level
// with the ground, plus toe (+ toes down, - heel down). Set the hips first.
const _p = new THREE.Vector3(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion(), _eu = new THREE.Euler();
function leg(av, L, x, y, z, toe = 0) {
  const H = av.hips;
  _qa.copy(H.quaternion).invert();
  const yw = av.danceYaw || 0, fy = L.s * (5 + y); // the feet turn with the way the dance faces
  _p.set(x * Math.cos(yw) - fy * Math.sin(yw), x * Math.sin(yw) + fy * Math.cos(yw), z).sub(H.position).applyQuaternion(_qa).sub(L.hip.position); // hip joint to ankle
  const dz = -_p.z, roll = Math.atan2(_p.y, dz), down = Math.hypot(dz, _p.y);
  const L1 = 18, L2 = 15.5, D = Math.max(4, Math.min(33.3, Math.hypot(_p.x, down)));
  const knee = Math.PI - Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + L2 * L2 - D * D) / (2 * L1 * L2))));
  const a = Math.atan2(_p.x, down) + Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))));
  L.hip.rotation.set(roll, -a, 0);
  L.knee.rotation.set(0, knee, 0);
  _qb.copy(H.quaternion).multiply(L.hip.quaternion).multiply(L.knee.quaternion).invert();
  L.foot.quaternion.copy(_qb).multiply(_qa.setFromEuler(_eu.set(0, toe, 0)));
}

// a hand reaching for a point in the torso's space (x forward, y left, z up from the waist; shoulders at z 19)
function hand(av, i, x, y, z) {
  const A = av.arms[i];
  reachArm(A.upper, A.fore, A.sh.position, _h.set(x, y, z), A.s);
}

// an arm set straight from angles: lift forward (0 hangs down, -PI/2 straight ahead, -PI straight up),
// spread out to its side, and the elbow bend (negative bends forward)
function arm(av, i, lift, spread, elbow) {
  const A = av.arms[i];
  A.upper.rotation.set(A.s * spread, lift, 0);
  A.fore.rotation.set(0, elbow, 0);
}

// the body: hip height and offset, which way the dance faces (yaw), hips rolled, leaned and twisted, the
// torso and head on top. Offsets, lean and roll are the dancer's own (they turn with yaw).
function body(av, { hipZ = 37.5, hx = 0, hy = 0, yaw = 0, roll = 0, lean = 0, twist = 0, tLean = 0, tRoll = 0, tTwist = 0, nod = 0, turn = 0, tilt = 0 }) {
  av.danceYaw = yaw;
  av.hips.rotation.order = 'ZYX';
  av.hips.position.set(hx * Math.cos(yaw) - hy * Math.sin(yaw), hx * Math.sin(yaw) + hy * Math.cos(yaw), hipZ);
  av.hips.rotation.set(roll, lean, yaw + twist);
  av.torso.rotation.set(tRoll, tLean, tTwist);
  av.head.rotation.set(tilt, nod, turn);
}

// ---------------------------------------------------------------- keyframed routines
// A routine is a list of keys [beat, changes]: each key only lists what changes, the rest carries on from the
// key before. Between keys the body eases from one pose to the next. Hands: hR/hL are in the torso's space
// as [forward, out to that side, up from the waist]; wR/wL are fixed points in the dancer's space as
// [forward, out, height off the ground] (for hands flat on a wall); wall blends from the first to the second.
// Feet fR/fL: [forward, out from the hip, ankle height, toe tilt].
const POSE0 = {
  hipZ: 37.5, hx: 0, hy: 0, yaw: 0, roll: 0, lean: 0, twist: 0, tLean: 0, tRoll: 0, tTwist: 0, nod: 0, turn: 0, tilt: 0,
  fR: [0, 1.5, 1.5, 0], fL: [0, 1.5, 1.5, 0], hR: [1, 12, -4], hL: [1, 12, -4], wR: [20, 7, 56], wL: [20, 7, 56], wall: 0,
};
// everything back to standing square on, for the start of a new move
const RESET = { hx: 0, hy: 0, yaw: 0, roll: 0, lean: 0, twist: 0, tLean: 0, tRoll: 0, tTwist: 0, nod: 0, turn: 0, tilt: 0, wall: 0, fR: [0, 1.5, 1.5, 0], fL: [0, 1.5, 1.5, 0] };

function routine(len, keys) {
  keys.sort((a, b) => a[0] - b[0]);
  let prev = POSE0;
  return { len, keys: keys.map(([b, f]) => { prev = { ...prev, ...f }; return [b, prev]; }) };
}

const _w = new THREE.Vector3(), _m = new THREE.Matrix4();
function play(av, R, beats) {
  const b = ((beats % R.len) + R.len) % R.len, K = R.keys;
  let i = K.length - 1;
  while (i > 0 && K[i][0] > b) i--;
  const [b0, A] = K[i], [b1, B] = i + 1 < K.length ? K[i + 1] : [R.len + K[0][0], K[0][1]];
  const u = ease(clamp01((b - b0) / Math.max(1e-3, b1 - b0)));
  const P = {};
  for (const k in A) P[k] = Array.isArray(A[k]) ? A[k].map((v, j) => mix(v, B[k][j], u)) : mix(A[k], B[k], u);
  body(av, P);
  leg(av, av.legs[0], ...P.fR);
  leg(av, av.legs[1], ...P.fL);
  // a fixed point in the dancer's space, brought into the torso's space
  av.hips.updateMatrix();
  av.torso.updateMatrix();
  _m.multiplyMatrices(av.hips.matrix, av.torso.matrix).invert();
  for (const i of [0, 1]) {
    const s = av.arms[i].s, h = i ? P.hL : P.hR, w = i ? P.wL : P.wR, yw = P.yaw;
    _h.set(h[0], s * h[1], h[2]);
    if (P.wall > 0.001) {
      _w.set(w[0] * Math.cos(yw) - s * w[1] * Math.sin(yw), w[0] * Math.sin(yw) + s * w[1] * Math.cos(yw), w[2]).applyMatrix4(_m);
      _h.lerp(_w, P.wall);
    }
    reachArm(av.arms[i].upper, av.arms[i].fore, av.arms[i].sh.position, _h, s);
  }
}

// moves used more than once, as keys from beat b0 up to b1
// Lord Verity's walk: hips swung out to one side on every beat, the other foot tapping in, hands low and flat
// patting the air down
function hipWalk(b0, b1) {
  const keys = [];
  for (let k = b0; k < b1; k++) {
    const side = k % 2 ? 1 : -1;
    const planted = [1, 4, 1.5, 0], tap = [5, 0, 2.4, 0.35];
    keys.push([k, { ...RESET, hipZ: 34.8, hy: 6 * side, roll: 0.2 * side, twist: 0.12 * side, tRoll: -0.24 * side, tTwist: -0.12 * side, tilt: 0.12 * side, tLean: 0.12, nod: 0.08,
      fL: side > 0 ? planted : tap, fR: side < 0 ? planted : tap, hR: [12, 20, 1], hL: [12, 20, 1] }]);
    keys.push([k + 0.5, { hipZ: 36.6, hy: 0, roll: 0, twist: 0, tRoll: 0, tTwist: 0, tilt: 0, hR: [11, 18, 6], hL: [11, 18, 6] }]);
  }
  return keys;
}
// both hands at the chest, fingers pointing at yourself, elbows out, shoulders shimmying
function selfPoint(b0, b1) {
  const keys = [];
  for (let k = b0; k < b1; k++) {
    keys.push([k, { ...RESET, hipZ: 37, tLean: -0.1, nod: -0.05, tTwist: 0.14 * (k % 2 ? 1 : -1), fR: [0, 3, 1.5, 0], fL: [0, 3, 1.5, 0], hR: [9, 4, 15], hL: [9, 4, 15] }]);
    keys.push([k + 0.5, { hipZ: 36, tTwist: 0 }]);
  }
  return keys;
}
// the disco point: turned to the left, the right hand up by the head, the left pointing down across the body,
// pumping on the beat with the knees
function discoPoint(b0, b1) {
  const keys = [];
  for (let k = b0; k < b1; k++) {
    keys.push([k, { ...RESET, yaw: 0.55, hipZ: 33.5, tTwist: -0.25, tLean: 0.05, nod: 0.2, turn: -0.3, fR: [-4, 2, 1.5, 0], fL: [7, 1, 1.5, 0], hR: [-1, 10, 33], hL: [18, -7, 5] }]);
    keys.push([k + 0.5, { hipZ: 35.5, hR: [0, 10, 31], hL: [15, -4, 9] }]);
  }
  return keys;
}
// Captain Clark at the wall: side on, hands flat on it, rocking from leaning back (hips in, head back) to
// bending over and dropping into a deep squat, two beats a time
function wallTwerk(b0, b1) {
  const keys = [];
  for (let k = b0; k < b1; k += 2) {
    const feet = { fR: [-5, 3, 1.5, 0], fL: [-5, 3, 1.5, 0] }, wide = { fR: [-5, 6, 1.5, 0], fL: [-5, 6, 1.5, 0] };
    keys.push([k, { ...RESET, yaw: Math.PI / 2, wall: 1, wR: [17, 7, 57], wL: [17, 7, 57], hipZ: 35.5, hx: 3, lean: -0.05, tLean: -0.3, nod: -0.4, ...feet }]);
    keys.push([k + 0.5, { hipZ: 31, hx: -3, lean: 0.15, tLean: 0.55, nod: 0.1 }]);
    keys.push([k + 1, { hipZ: 21, hx: -6, lean: 0.2, tLean: 0.5, nod: 0.25, ...wide }]);
    keys.push([k + 1.5, { hipZ: 29, hx: -3, lean: 0.1, tLean: 0.35, nod: 0, ...feet }]);
  }
  return keys;
}

const ROUTINES = {
  // "The Great Captain Clark": a hopping kick on the spot, a spin and a skip over to the wall, the wall
  // twerk, a "one second" finger up, the crane kick, the wall again, and a hop back out. 32 beats.
  clark: routine(32, [
    // hop-kick: arms out low, one leg flicked back then kicked forward, then the other
    [0, { ...RESET, hipZ: 37, roll: 0.06, hR: [2, 19, 8], hL: [2, 19, 8] }],
    [0.5, { hipZ: 38.5, roll: 0, tLean: 0.05, fR: [0, 1.5, 3.5, 0.2], fL: [-11, 2, 15, 0.7], hR: [1, 13, -3], hL: [1, 13, -3] }],
    [1, { hipZ: 37, tLean: 0, fR: [0, 1.5, 1.5, 0], fL: [0, 2, 1.5, 0], hR: [3, 17, 6], hL: [3, 17, 6] }],
    [1.5, { hipZ: 38.5, tLean: -0.1, fL: [14, 2, 14, -0.2], hR: [13, 13, 17], hL: [-5, 16, 8] }],
    [2, { hipZ: 37, tLean: 0, fL: [2, 2, 1.5, 0], hR: [4, 18, 10], hL: [4, 18, 10] }],
    [2.5, { hipZ: 38.5, fR: [-11, 2, 15, 0.7], fL: [0, 1.5, 3.5, 0.2], hR: [1, 13, -3], hL: [1, 13, -3] }],
    // the spin round to the side and a skip to the wall
    [3, { hipZ: 36, yaw: 0.8, roll: -0.1, tTwist: 0.3, fR: [0, 1.5, 1.5, 0], fL: [0, 1.5, 1.5, 0], hR: [10, 14, 14], hL: [-4, 15, 10] }],
    [3.5, { yaw: 1.4, hipZ: 37.5, roll: 0, fL: [4, 2, 6, 0.2] }],
    [4, { yaw: Math.PI / 2, hipZ: 38.5, tTwist: 0, fR: [-3, 1.5, 4, 0.2], fL: [5, 1.5, 1.5, 0], hR: [6, 14, 6], hL: [6, 14, 6] }],
    [4.5, { hipZ: 37, fR: [3, 1.5, 1.5, 0], fL: [-6, 1.5, 6, 0.4] }],
    [5, { hipZ: 38.5, fR: [-6, 1.5, 6, 0.4], fL: [3, 1.5, 1.5, 0] }],
    [5.5, { hipZ: 36, tLean: 0.2, fR: [-5, 3, 1.5, 0], fL: [-5, 3, 1.5, 0], wall: 1, wR: [17, 7, 57], wL: [17, 7, 57] }],
    ...wallTwerk(6, 14),
    // off the wall and round to the front: one finger up, "one second", a little bounce and a knee lift
    [14.6, { ...RESET, yaw: 0.3, hipZ: 37.5, hR: [4, 16, 8], hL: [4, 16, 8] }],
    [15, { yaw: 0, hR: [5, 14, 32], hL: [1, 12, -4], tilt: 0.1, nod: -0.05 }],
    [16, { hipZ: 36.5 }], [16.5, { hipZ: 37.5 }], [17, { hipZ: 36.5 }],
    [17.5, { hipZ: 37.5, fL: [5, 1, 9, 0.3] }], [18, { hipZ: 36.5, fL: [0, 1.5, 1.5, 0] }], [18.5, { hipZ: 37.5 }],
    // the crane kick: side on, one knee high, a hand out in front and the other raised behind
    [19, { ...RESET, yaw: Math.PI / 2, hipZ: 36.5, tLean: 0.05, fL: [12, 1, 24, 0.6], hR: [-6, 13, 31], hL: [17, 3, 25] }],
    [20, { hipZ: 36, hL: [18, 3, 27] }],
    [21, { hipZ: 36.5, hL: [16, 3, 24] }],
    [21.6, { hipZ: 35, fL: [-5, 3, 1.5, 0], fR: [-5, 3, 1.5, 0], hR: [6, 14, 8], hL: [6, 14, 8], wall: 0.6, wR: [17, 7, 57], wL: [17, 7, 57] }],
    ...wallTwerk(22, 30),
    // hop back out to the front, arms out
    [30, { ...RESET, yaw: 1, hipZ: 38.5, fR: [-6, 2, 8, 0.4], fL: [2, 2, 1.5, 0], hR: [4, 20, 14], hL: [4, 20, 14] }],
    [30.5, { yaw: 0.4, hipZ: 37 }],
    [31, { yaw: 0, hipZ: 38.5, fR: [2, 2, 1.5, 0], fL: [-6, 2, 8, 0.4] }],
    [31.5, { hipZ: 37, fL: [0, 1.5, 1.5, 0], hR: [2, 19, 8], hL: [2, 19, 8] }],
  ]),
  // Lord Verity, "move dem hips": the hip walk with flat hands patting down, pointing at himself, the disco
  // point, the walk again, reaching out to you, pointing at himself, the disco point, a finger to the sky,
  // and walking it out. 32 beats.
  verity: routine(32, [
    ...hipWalk(0, 4),
    ...selfPoint(4, 8),
    ...discoPoint(8, 12),
    ...hipWalk(12, 16),
    [16, { ...RESET, hipZ: 36, tLean: 0.15, hR: [20, 7, 17], hL: [20, 7, 17] }],
    [17, { hipZ: 37, tLean: 0.2, hR: [21, 6, 18], hL: [21, 6, 18] }],
    ...selfPoint(18, 20),
    ...discoPoint(20, 24),
    [24, { ...RESET, yaw: -0.3, hipZ: 37, tLean: -0.1, nod: -0.25, turn: 0.15, hR: [9, 9, 41], hL: [2, 11, 2] }],
    [25, { hipZ: 35.5, hR: [10, 8, 43] }],
    [25.5, { hipZ: 37 }],
    ...hipWalk(26, 32),
  ]),
};

// ---------------------------------------------------------------- the dances
// t: seconds since the emote started; b: beats
const POSES = {
  // The Griddy: knees bent and bouncing, heels tapping out in front one after the other as you skip, arms
  // pumping back and forth against the legs, and every few bars both hands make goggles round the eyes
  griddy(av, t, b) {
    const k = Math.floor(b), p = b - k, side = k % 2; // which foot taps this beat
    const bounce = Math.abs(Math.sin(Math.PI * b));
    const goggles = (Math.floor(b / 2) % 8) >= 6; // the last two bars of eight
    const hipZ = 33.5 + bounce * 2.2;
    body(av, { hipZ, hx: -1, lean: 0.06, tLean: 0.22 + bounce * 0.06, tTwist: (side ? 1 : -1) * 0.18 * Math.sin(Math.PI * p), nod: goggles ? -0.05 : 0.1 + bounce * 0.1, roll: (side ? 1 : -1) * 0.05 });
    for (const L of av.legs) {
      const tapping = (L.s > 0) === !!side;
      if (tapping) {
        // the heel kicks out and taps down, toes up
        const reach = Math.sin(Math.PI * p);
        leg(av, L, 4 + reach * 8, 1.5, 1.5 + Math.max(0, Math.sin(TAU * p)) * 3, -0.55 * reach);
      } else {
        // the standing foot does a little skip back under you
        leg(av, L, -3 - Math.sin(Math.PI * p) * 3, 1.5, 1.5 + Math.max(0, Math.sin(Math.PI * p)) * 1.6, 0.15);
      }
    }
    if (goggles) {
      // thumbs and fingers round the eyes, elbows out
      const wob = Math.sin(TAU * b) * 0.6;
      for (const i of [0, 1]) hand(av, i, 9, av.arms[i].s * 3.4, 29 + wob);
    } else {
      for (const i of [0, 1]) {
        const s = av.arms[i].s, swing = Math.sin(Math.PI * b) * (s > 0 ? 1 : -1);
        hand(av, i, 4 + swing * 11, s * 13, 7 + Math.abs(swing) * 5);
      }
    }
  },

  clark(av, t, b) { play(av, ROUTINES.clark, b); },
  verity(av, t, b) { play(av, ROUTINES.verity, b); },

  // a friendly wave with the right hand, weight on one hip
  wave(av, t) {
    const k = ease(clamp01(t * 4)) * ease(clamp01((2.6 - t) * 4));
    body(av, { hipZ: 37.5, hy: k * 1.5, roll: k * 0.04, tRoll: -k * 0.06, nod: -0.05, tilt: k * 0.1 });
    for (const L of av.legs) leg(av, L, 0, 1.5, 1.5);
    hand(av, 0, mix(2, 8, k), mix(-12, -17 + Math.sin(t * 11) * 4 * k, k), mix(-3, 38, k));
    arm(av, 1, 0.05, 0.1, -0.2);
  },

  // the dab: face into the left elbow, right arm thrown out and up
  dab(av, t) {
    const k = ease(clamp01(t * 6)) * ease(clamp01((2.2 - t) * 5));
    body(av, { hipZ: 37.5 - k, roll: -k * 0.05, tLean: k * 0.25, tTwist: k * 0.25, tRoll: k * 0.12, nod: k * 0.55, turn: k * 0.5 });
    for (const L of av.legs) leg(av, L, 0, 2, 1.5);
    hand(av, 1, mix(2, 9, k), mix(12, -8, k), mix(-3, 29, k));
    hand(av, 0, mix(2, 10, k), mix(-12, -30, k), mix(-3, 31, k));
  },
};

// pose an avatar for one frame of an emote; false once a one-off emote has finished
export function emotePose(av, id, t) {
  const E = EMOTE[id], pose = POSES[id];
  if (!E || !pose) return false;
  if (!E.loop && t > E.len) return false;
  pose(av, t, (t * E.bpm) / 60);
  return true;
}

// back to a neutral body once an emote ends (the dances turn joints the normal animation never touches)
export function clearPose(av) {
  av.hips.position.x = 0;
  av.hips.rotation.order = 'XYZ';
  av.danceYaw = 0;
  for (const o of [av.hips, av.torso, av.head]) o.rotation.set(0, 0, 0);
  for (const A of av.arms) { A.upper.rotation.set(0, 0, 0); A.fore.rotation.set(0, 0, 0); }
  for (const L of av.legs) { L.hip.rotation.set(0, 0, 0); L.knee.rotation.set(0, 0, 0); L.foot.rotation.set(0, 0, 0); }
}
