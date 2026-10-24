// Ragdolls: a verlet skeleton (points joined by fixed-length sticks) that falls and tumbles through the map,
// drawn in the same suit and with the same head as the live player. Purely visual, so each client simulates its own.
import * as THREE from 'three';
import { avatarMaterials, headGroup } from './avatar.js';

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
  // origin: feet position, yaw in degrees, vel: velocity at death, color: suit colour index, model: character
  constructor(world, origin, yaw, vel, color, ducked, model = 0) {
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

    // meshes
    const M = avatarMaterials(color);
    const suit = M.suit, pad = M.pad;
    this.mats = Object.values(M);
    this.group = new THREE.Group();
    this.parts = [];
    for (const [a, b, r] of BONES) {
      if (!r) continue;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 12), r > 5 ? suit : pad);
      m.castShadow = true;
      this.group.add(m);
      this.parts.push({ m, a, b, r });
    }
    this.head = headGroup(model, M);
    this.group.add(this.head);
    this.joints = NAMES.filter((n) => n !== 'head').map((n) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(n.includes('hand') || n.includes('foot') ? 2.8 : 3.4, 8, 6), pad);
      this.group.add(m);
      return { n, m };
    });
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

  sync() {
    const up = new THREE.Vector3(0, 1, 0), d = new THREE.Vector3();
    for (const { m, a, b } of this.parts) {
      const pa = this.p[a], pb = this.p[b];
      d.set(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]);
      const len = d.length();
      m.position.set((pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2);
      m.quaternion.setFromUnitVectors(up, d.normalize());
      m.scale.set(1, len, 1);
    }
    for (const { n, m } of this.joints) m.position.set(...this.p[n]);
    const hp = this.p.head, np = this.p.neck, ch = this.p.chest;
    // the face looks where the chest faces: perpendicular to the shoulders, away from the spine
    const left = new THREE.Vector3(this.p.lsh[0] - this.p.rsh[0], this.p.lsh[1] - this.p.rsh[1], this.p.lsh[2] - this.p.rsh[2]);
    const spine = new THREE.Vector3(hp[0] - ch[0], hp[1] - ch[1], hp[2] - ch[2]).normalize();
    const face = new THREE.Vector3().crossVectors(left, spine).normalize();
    left.crossVectors(spine, face);
    this.head.matrix.makeBasis(face, left, spine).setPosition(np[0], np[1], np[2] - 1);
    this.head.matrixAutoUpdate = false;
    this.head.matrixWorldNeedsUpdate = true;
  }

  // where a death camera should look
  center() {
    return this.p.chest;
  }

  dispose() {
    this.group.traverse((o) => { if (!o.geometry?.userData.keep) o.geometry?.dispose(); });
    this.mats.forEach((m) => m.dispose());
  }
}

function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
