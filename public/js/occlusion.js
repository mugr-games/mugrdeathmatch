// Occlusion culling: skip drawing what's hidden behind walls. Each frame a few map chunks (and every player
// and ragdoll) are tested with sightlines from the eye through the collision world; anything no sightline
// reaches is moved to a layer the main camera doesn't draw. The sun's shadow camera still draws that layer,
// so hidden things keep casting shadows and nothing pops. Something seen stays drawn for a moment, so quick
// glimpses don't flicker.
import * as THREE from 'three';

export const HIDDEN_LAYER = 2;
const LINGER = 0.35; // seconds something stays drawn after it was last seen
const ZERO = [0, 0, 0];

// put every mesh under obj on the drawn or the hidden layer
export function setDrawn(obj, drawn) {
  if (obj.userData.drawn === drawn) return;
  obj.userData.drawn = drawn;
  obj.traverse((o) => { if (o.isMesh || o.isPoints || o.isLine) o.layers.set(drawn ? 0 : HIDDEN_LAYER); });
}

// can the eye see any of these points? A sightline that first hits something inside `box` (the thing itself)
// counts as seeing it.
export function seesAny(world, eye, points, box) {
  for (const p of points) {
    const tr = world.trace(eye, p, ZERO, ZERO);
    if (tr.fraction >= 0.995) return true;
    if (box) {
      const e = tr.endpos;
      if (e[0] >= box[0] - 2 && e[0] <= box[3] + 2 && e[1] >= box[1] - 2 && e[1] <= box[4] + 2 && e[2] >= box[2] - 2 && e[2] <= box[5] + 2) return true;
    }
  }
  return false;
}

export class Occlusion {
  constructor() {
    this.cells = [];
    this.next = 0;
    this.frustum = new THREE.Frustum();
    this.m = new THREE.Matrix4();
    this.b3 = new THREE.Box3();
    this.enabled = true;
  }

  // the map's chunks: [{ objects: [mesh...], box: [minx, miny, minz, maxx, maxy, maxz] }]
  setCells(cells) {
    this.cells = cells.map((c) => ({ ...c, seen: -1, points: samplePoints(c.box) }));
    this.next = 0;
  }

  // test `budget` chunks this frame (round robin), then show or hide every chunk
  update(world, camera, eye, now, budget = 10) {
    if (!world) return;
    if (!this.enabled) { for (const c of this.cells) for (const o of c.objects) setDrawn(o, true); return; }
    this.frustum.setFromProjectionMatrix(this.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const n = this.cells.length;
    for (let k = 0; k < Math.min(budget, n); k++) {
      const c = this.cells[this.next];
      this.next = (this.next + 1) % n;
      const b = c.box;
      this.b3.min.set(b[0], b[1], b[2]);
      this.b3.max.set(b[3], b[4], b[5]);
      if (!this.frustum.intersectsBox(this.b3)) continue; // off screen: the renderer skips it anyway
      const inside = eye[0] > b[0] - 96 && eye[0] < b[3] + 96 && eye[1] > b[1] - 96 && eye[1] < b[4] + 96 && eye[2] > b[2] - 96 && eye[2] < b[5] + 96;
      if (inside || seesAny(world, eye, c.points, b)) c.seen = now;
    }
    for (const c of this.cells) {
      const drawn = now - c.seen < LINGER;
      for (const o of c.objects) setDrawn(o, drawn);
    }
  }
}

// where to aim sightlines at a box: its centre, the middle of its top, and its corners pulled in a little
function samplePoints(b) {
  const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = (b[2] + b[5]) / 2;
  const pts = [[cx, cy, cz], [cx, cy, b[5] - 4]];
  for (const x of [0.12, 0.88]) for (const y of [0.12, 0.88]) for (const z of [0.15, 0.85]) {
    pts.push([b[0] + (b[3] - b[0]) * x, b[1] + (b[4] - b[1]) * y, b[2] + (b[5] - b[2]) * z]);
  }
  return pts;
}
