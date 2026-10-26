// Collision against a world made of axis-aligned boxes, with a uniform grid for broadphase.
// Same trace interface the movement code expects (Quake/Source style sweep with fraction + normal).

export const CONTENTS = { SOLID: 0x1, WATER: 0x20, SLIME: 0x10 };
export const MASK_PLAYERSOLID = 0x1;
export const MASK_SHOT = 0x1;

const EPS = 0.03125;

export class BoxWorld {
  // boxes: [{ mins:[x,y,z], maxs:[x,y,z], mat }]. pads: jump pads [{ mins, maxs, vel }].
  // cell: broadphase grid size (bigger for a huge world of big boxes).
  constructor(boxes, pads = [], cell = 256) {
    this.boxes = boxes.slice();
    this.pads = pads;
    this.cell = cell;
    this.grid = new Map();
    // moving things that aren't part of the map (cars): [{ mins, maxs, id, shotTop }], replaced every tick.
    // Traces skip the ones with id === skip (your own car), and ones they start inside (so you can always get
    // out of something that drove into you). shotTop: bullets pass over the box above this height (windows).
    this.dyn = [];
    this.skip = 0;
    this.stamp = new Int32Array(this.boxes.length + 256);
    this.off = new Uint8Array(this.boxes.length + 256); // switched-off boxes (broken props)
    this.check = 0;
    this.boxes.forEach((b, i) => this.insert(b, i));
    this.tw = { fraction: 1, startsolid: false, allsolid: false, normal: [0, 0, 0], endpos: [0, 0, 0], contents: 0, box: -1, ext: [0, 0, 0], start: [0, 0, 0], end: [0, 0, 0] };
  }

  insert(b, i) {
    const C = this.cell;
    for (let x = Math.floor(b.mins[0] / C); x <= Math.floor(b.maxs[0] / C); x++)
      for (let y = Math.floor(b.mins[1] / C); y <= Math.floor(b.maxs[1] / C); y++) {
        const k = x * 73856093 ^ y * 19349663;
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(i);
      }
  }

  // Extra solid box (a prop); returns its index for setEnabled.
  addBox(b) {
    const i = this.boxes.length;
    this.boxes.push(b);
    if (i >= this.stamp.length) {
      const s = new Int32Array(i * 2), o = new Uint8Array(i * 2);
      s.set(this.stamp); o.set(this.off);
      this.stamp = s; this.off = o;
    }
    this.insert(b, i);
    return i;
  }

  setEnabled(i, on) {
    this.off[i] = on ? 0 : 1;
  }

  pointContents() {
    return 0;
  }

  trace(start, end, mins, maxs) {
    const tw = this.tw;
    tw.fraction = 1;
    tw.startsolid = tw.allsolid = false;
    tw.normal[0] = tw.normal[1] = tw.normal[2] = 0;
    tw.contents = 0;
    tw.box = -1;
    tw.dyn = null;
    for (let i = 0; i < 3; i++) {
      const c = (mins[i] + maxs[i]) * 0.5;
      tw.ext[i] = (maxs[i] - mins[i]) * 0.5;
      tw.start[i] = start[i] + c;
      tw.end[i] = end[i] + c;
    }
    const lo0 = Math.min(tw.start[0], tw.end[0]) - tw.ext[0] - 1, hi0 = Math.max(tw.start[0], tw.end[0]) + tw.ext[0] + 1;
    const lo1 = Math.min(tw.start[1], tw.end[1]) - tw.ext[1] - 1, hi1 = Math.max(tw.start[1], tw.end[1]) + tw.ext[1] + 1;
    this.check++;
    const C = this.cell;
    const cx0 = Math.floor(lo0 / C), cx1 = Math.floor(hi0 / C), cy0 = Math.floor(lo1 / C), cy1 = Math.floor(hi1 / C);
    // very long traces (bullets) walk a lot of cells; that's fine for an arena-sized map
    for (let x = cx0; x <= cx1; x++) {
      for (let y = cy0; y <= cy1; y++) {
        const list = this.grid.get(x * 73856093 ^ y * 19349663);
        if (!list) continue;
        for (const i of list) {
          if (this.stamp[i] === this.check || this.off[i]) continue;
          this.stamp[i] = this.check;
          this.clip(this.boxes[i], i);
          if (tw.allsolid) break;
        }
      }
    }
    if (this.dyn.length && !tw.allsolid) {
      const lo2 = Math.min(tw.start[2], tw.end[2]) - tw.ext[2] - 1, hi2 = Math.max(tw.start[2], tw.end[2]) + tw.ext[2] + 1;
      const ray = tw.ext[0] === 0 && tw.ext[1] === 0 && tw.ext[2] === 0;
      for (const b of this.dyn) {
        if (b.id === this.skip || (this.skip2 && b.id === this.skip2)) continue;
        const top = ray && b.shotTop !== undefined ? b.shotTop : b.maxs[2];
        if (b.maxs[0] < lo0 || b.mins[0] > hi0 || b.maxs[1] < lo1 || b.mins[1] > hi1 || top < lo2 || b.mins[2] > hi2) continue;
        let inside = true;
        for (let a = 0; a < 3 && inside; a++) inside = tw.start[a] + tw.ext[a] > b.mins[a] && tw.start[a] - tw.ext[a] < (a === 2 ? top : b.maxs[a]);
        if (inside) continue;
        const f = tw.fraction;
        if (top !== b.maxs[2]) { DYN_SHOT.mins = b.mins; DYN_SHOT.maxs[0] = b.maxs[0]; DYN_SHOT.maxs[1] = b.maxs[1]; DYN_SHOT.maxs[2] = top; this.clip(DYN_SHOT, -1); }
        else this.clip(b, -1);
        if (tw.fraction < f) tw.dyn = b;
      }
    }
    for (let i = 0; i < 3; i++) tw.endpos[i] = start[i] + tw.fraction * (end[i] - start[i]);
    return tw;
  }

  clip(box, index) {
    const tw = this.tw;
    let enter = -1, leave = 1, ci = -1, cs = 0, getout = false, startout = false;
    for (let a = 0; a < 3; a++) {
      for (let sgn = -1; sgn <= 1; sgn += 2) {
        const dist = (sgn > 0 ? box.maxs[a] : -box.mins[a]) + tw.ext[a];
        const d1 = sgn * tw.start[a] - dist, d2 = sgn * tw.end[a] - dist;
        if (d2 > 0) getout = true;
        if (d1 > 0) startout = true;
        if (d1 > 0 && (d2 >= EPS || d2 >= d1)) return;
        if (d1 <= 0 && d2 <= 0) continue;
        if (d1 > d2) {
          let f = (d1 - EPS) / (d1 - d2);
          if (f < 0) f = 0;
          if (f > enter) { enter = f; ci = a; cs = sgn; }
        } else {
          let f = (d1 + EPS) / (d1 - d2);
          if (f > 1) f = 1;
          if (f < leave) leave = f;
        }
      }
    }
    if (!startout) {
      tw.startsolid = true;
      if (!getout) { tw.allsolid = true; tw.fraction = 0; }
      return;
    }
    if (enter < leave && enter > -1 && enter < tw.fraction) {
      tw.fraction = enter < 0 ? 0 : enter;
      tw.normal[0] = tw.normal[1] = tw.normal[2] = 0;
      tw.normal[ci] = cs;
      tw.contents = CONTENTS.SOLID;
      tw.box = index;
      tw.dyn = null;
    }
  }
}
const DYN_SHOT = { mins: null, maxs: [0, 0, 0] };

// Ray vs axis-aligned box (for hit volumes). Returns entry fraction or -1.
export function rayAABB(s, e, mins, maxs) {
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    const d = e[i] - s[i];
    if (Math.abs(d) < 1e-9) {
      if (s[i] < mins[i] || s[i] > maxs[i]) return -1;
      continue;
    }
    let a = (mins[i] - s[i]) / d, b = (maxs[i] - s[i]) / d;
    if (a > b) { const t = a; a = b; b = t; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return -1;
  }
  return t0;
}
