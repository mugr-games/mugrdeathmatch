// Ragdolls: a verlet skeleton (points joined by fixed-length sticks) that falls and tumbles through the map,
// drawn as the player's own character: the same model, colours, cosmetics and visor, its body parts placed on
// the skeleton every frame. Purely visual, so each client simulates its own.
import * as THREE from 'three';
import { Avatar } from './avatar.js';

// joint positions for a standing body facing +X, feet at 0 (game units)
const JOINTS = {
  head: [0, 0, 66], neck: [0, 0, 58], chest: [0, 0, 48], pelvis: [0, 0, 36],
  lsh: [0, 11, 55], rsh: [0, -11, 55], lhand: [6, 13, 33], rhand: [6, -13, 33],
  lhip: [0, 5, 34], rhip: [0, -5, 34], lknee: [2, 5, 18], rknee: [2, -5, 18], lfoot: [3, 5, 1], rfoot: [3, -5, 1],
};
// sticks that are drawn (with radius) and extra hidden ones that keep the torso from folding up
const BONES = [
  ['head', 'neck', 0], ['neck', 'chest', 6.5], ['chest', 'pelvis', 7], ['neck', 'lsh', 3.6], ['neck', 'rsh', 3.6],
  ['lsh', 'lhand', 2.7], ['rsh', 'rhand', 2.7], ['pelvis', 'lhip', 4], ['pelvis', 'rhip', 4],
  ['lhip', 'lknee', 3.5], ['rhip', 'rknee', 3.5], ['lknee', 'lfoot', 3.1], ['rknee', 'rfoot', 3.1],
];
const STIFF = [['lsh', 'rsh'], ['lhip', 'rhip'], ['lsh', 'pelvis'], ['rsh', 'pelvis'], ['chest', 'lhip'], ['chest', 'rhip'], ['head', 'chest'], ['lsh', 'chest'], ['rsh', 'chest']];
const NAMES = Object.keys(JOINTS);
const R = 2.5; // collision radius of every joint
const GRAVITY = 600;

export class Ragdoll {
  // origin: feet position, yaw in degrees, vel: velocity at death, color: suit colour index, model: character,
  // cos: the cosmetics they wore
  constructor(world, origin, yaw, vel, color, ducked, model = 0, cos = {}) {
    this.world = world;
    this.t = 0;
    const c = Math.cos((yaw * Math.PI) / 180), s = Math.sin((yaw * Math.PI) / 180);
    const squash = ducked ? 0.6 : 1;
    this.p = {};
    this.q = {};
    for (const n of NAMES) {
      const [x, y, z] = JOINTS[n];
      const p = [origin[0] + x * c - y * s, origin[1] + x * s + y * c, origin[2] + z * squash + 1];
      // a little random spin so no two deaths look the same
      const j = n === 'head' || n.endsWith('hand') ? 0.08 : 0.03;
      const v = [vel[0] + (Math.random() - 0.5) * 60, vel[1] + (Math.random() - 0.5) * 60, vel[2] + (Math.random() - 0.3) * 40];
      this.p[n] = p;
      this.q[n] = [p[0] - v[0] * (1 / 60) * (1 + j), p[1] - v[1] * (1 / 60) * (1 + j), p[2] - v[2] * (1 / 60)];
    }
    this.links = [...BONES.map(([a, b]) => [a, b]), ...STIFF].map(([a, b]) => [a, b, dist(this.p[a], this.p[b])]);

    // the character, taken apart: every body part becomes its own piece placed on the skeleton
    const av = (this.avatar = new Avatar(color, model, cos));
    this.group = new THREE.Group();
    const [rArm, lArm] = av.arms, [rLeg, lLeg] = av.legs;
    this.pieces = {
      hips: av.hips, torso: av.torso, head: av.head,
      rsh: rArm.sh, rup: rArm.upper, rfore: rArm.fore, lsh: lArm.sh, lup: lArm.upper, lfore: lArm.fore,
      rthigh: rLeg.hip, rshin: rLeg.knee, rfoot: rLeg.foot, lthigh: lLeg.hip, lshin: lLeg.knee, lfoot: lLeg.foot,
    };
    for (const g of Object.values(this.pieces)) {
      this.group.add(g); // out of the avatar's hierarchy: each piece is placed in the world directly
      g.matrixAutoUpdate = false;
    }
    av.hand.visible = false; // no weapon
    this.sync();
  }

  step(dt) {
    this.t += dt;
    if (this.sleep > 1.5) return; // settled: stop simulating
    const sub = 2, h = dt / sub;
    for (let k = 0; k < sub; k++) {
      let moving = 0;
      for (const n of NAMES) {
        const p = this.p[n], q = this.q[n];
        const v = [(p[0] - q[0]) * 0.995, (p[1] - q[1]) * 0.995, (p[2] - q[2]) * 0.995 - GRAVITY * h * h];
        const next = [p[0] + v[0], p[1] + v[1], p[2] + v[2]];
        const tr = this.world.trace(p, next, [-R, -R, -R], [R, R, R]);
        this.q[n] = p.slice();
        if (tr.fraction < 1) {
          // stop at the surface, keep a bit of the slide along it (friction)
          const e = tr.endpos.slice();
          this.p[n] = e;
          const nrm = tr.normal;
          const vn = v[0] * nrm[0] + v[1] * nrm[1] + v[2] * nrm[2];
          const tv = [v[0] - vn * nrm[0], v[1] - vn * nrm[1], v[2] - vn * nrm[2]];
          this.q[n] = [e[0] - tv[0] * 0.6, e[1] - tv[1] * 0.6, e[2] - tv[2] * 0.6];
        } else this.p[n] = next;
        moving += Math.abs(v[0]) + Math.abs(v[1]) + Math.abs(v[2]);
      }
      // keep every stick its length (a few passes)
      for (let it = 0; it < 6; it++) {
        for (const [a, b, len] of this.links) {
          const pa = this.p[a], pb = this.p[b];
          const d = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
          const l = Math.hypot(d[0], d[1], d[2]) || 1e-6;
          const f = ((l - len) / l) * 0.5;
          // move both ends, but never push a joint through a wall
          const na = [pa[0] + d[0] * f, pa[1] + d[1] * f, pa[2] + d[2] * f];
          const nb = [pb[0] - d[0] * f, pb[1] - d[1] * f, pb[2] - d[2] * f];
          if (this.world.trace(pa, na, [-R, -R, -R], [R, R, R]).fraction === 1) this.p[a] = na;
          if (this.world.trace(pb, nb, [-R, -R, -R], [R, R, R]).fraction === 1) this.p[b] = nb;
        }
      }
      this.sleep = moving / NAMES.length < 0.15 ? (this.sleep || 0) + h : 0;
    }
    this.sync();
  }

  // place every body part from the skeleton. Each part's own frame is X forward, Y left, Z up, like the
  // standing character; limbs hang along their -Z from the joint they pivot on.
  sync() {
    const P = (n) => V(this.p[n]);
    const pelvis = P('pelvis'), neck = P('neck'), lsh = P('lsh'), rsh = P('rsh');
    const up = neck.clone().sub(pelvis).normalize();
    const left = orthogonal(lsh.clone().sub(rsh), up);
    const fwd = new THREE.Vector3().crossVectors(left, up);
    const torsoAt = lsh.clone().add(rsh).multiplyScalar(0.5).addScaledVector(up, -19);
    const hipsLeft = orthogonal(P('lhip').sub(P('rhip')), up);
    place(this.pieces.torso, fwd, left, up, torsoAt);
    place(this.pieces.hips, new THREE.Vector3().crossVectors(hipsLeft, up), hipsLeft, up, torsoAt.clone().addScaledVector(up, -4));
    const headUp = P('head').sub(neck).normalize();
    const headLeft = orthogonal(left.clone(), headUp);
    place(this.pieces.head, new THREE.Vector3().crossVectors(headLeft, headUp), headLeft, headUp, neck);
    place(this.pieces.lsh, fwd, left, up, lsh);
    place(this.pieces.rsh, fwd, left, up, rsh);
    // a limb from one joint toward the next; the lower part starts `len` along it (arms are kept straight)
    const limb = (upper, lower, from, to, len) => {
      const d = to.clone().sub(from).normalize();
      const z = d.clone().negate();
      const x = orthogonal(fwd.clone(), z);
      const y = new THREE.Vector3().crossVectors(z, x);
      place(upper, x, y, z, from);
      if (lower) place(lower, x, y, z, from.clone().addScaledVector(d, len));
    };
    limb(this.pieces.lup, this.pieces.lfore, lsh, P('lhand'), 12);
    limb(this.pieces.rup, this.pieces.rfore, rsh, P('rhand'), 12);
    limb(this.pieces.lthigh, null, P('lhip'), P('lknee'));
    limb(this.pieces.rthigh, null, P('rhip'), P('rknee'));
    limb(this.pieces.lshin, this.pieces.lfoot, P('lknee'), P('lfoot'), 15.5);
    limb(this.pieces.rshin, this.pieces.rfoot, P('rknee'), P('rfoot'), 15.5);
  }

  // where a death camera should look
  center() {
    return this.p.chest;
  }

  dispose() {
    this.group.traverse((o) => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); });
    this.avatar.dispose();
  }
}

const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
// v made perpendicular to the unit vector n, then unit length (any perpendicular if they line up)
function orthogonal(v, n) {
  v.addScaledVector(n, -v.dot(n));
  if (v.lengthSq() < 1e-6) { v.set(n.z, n.x, n.y); v.addScaledVector(n, -v.dot(n)); }
  return v.normalize();
}
function place(obj, x, y, z, at) {
  obj.matrix.makeBasis(x, y, z).setPosition(at);
  obj.matrixWorldNeedsUpdate = true;
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
