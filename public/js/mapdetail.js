// Decoration for every map, generated from its collision boxes: trims along wall bases and tops, wall lamps
// with a soft spill of light, pipes on brackets, vents, rubble, floor stains and litter, grass and flowers on
// grassy ground, and dust drifting in the air. Purely visual: nothing here collides, and it's seeded by the
// map id so every player sees the same layout. Units: Source units, Z up.
import * as THREE from 'three';
import { BoxWorld } from './collide.js';
import { isPotato } from './shaders.js';

// small seeded random numbers (mulberry32)
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261);

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// a soft blotch with ragged edges, for stains
const STAIN = canvasTex(128, (g, s) => {
  for (let i = 0; i < 26; i++) {
    const x = s / 2 + (Math.random() - 0.5) * s * 0.45, y = s / 2 + (Math.random() - 0.5) * s * 0.45, r = s * (0.08 + Math.random() * 0.2);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(0,0,0,0.13)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, s, s);
  }
});
// a round soft glow, for light spilling onto walls and for dust motes
const GLOW = canvasTex(64, (g, s) => {
  const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, s, s);
});

const DEFAULT_PAL = { concrete: '#8a8a8a', plate: '#6e6e6a', metal: '#5a5f66', panel: ['#8a8478', '#6b6458'], hazard: '#e8b400', neon: '#ffd890', grass: ['#5f8f3a', '#4a7a2c'] };

// boxes: [{ mins, maxs, mat }]; pal: the map's palette; opts.grassBelow: tops at or below this z count as
// grass (block maps, whose boxes carry no materials)
export function decorate(id, boxes, bounds, pal = DEFAULT_PAL, opts = {}) {
  const potato = isPotato();
  const R = rng(hash(id));
  const world = new BoxWorld(boxes);
  const [lo, hi] = bounds;
  const inBounds = (p) => p[0] > lo[0] && p[0] < hi[0] && p[1] > lo[1] && p[1] < hi[1];
  const solid = (p) => world.trace(p, p, [0, 0, 0], [0, 0, 0]).startsolid;
  // the floor under a point: [z, box index] or null
  const floorBelow = (x, y, z0, z1) => {
    const tr = world.trace([x, y, z0], [x, y, z1], [0, 0, 0], [0, 0, 0]);
    if (tr.startsolid || tr.fraction >= 1 || tr.normal[2] < 0.9) return null;
    return [tr.endpos[2], tr.box];
  };
  const clearAbove = (x, y, z, h) => world.trace([x, y, z + 1], [x, y, z + h], [0, 0, 0], [0, 0, 0]).fraction >= 1;

  const lists = new Map(); // kind -> [{ m: Matrix4, c: Color? }]
  const put = (kind, m, c) => { if (!lists.has(kind)) lists.set(kind, []); lists.get(kind).push({ m, c }); };
  const mat4 = (x, y, z, sx, sy, sz, yaw = 0, roll = 0, pitch = 0) =>
    new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(roll, pitch, yaw, 'ZYX')), new THREE.Vector3(sx, sy, sz));
  const dens = potato ? 0.45 : 1;
  const metal = new THREE.Color(pal.metal), dark = new THREE.Color(pal.metal).multiplyScalar(0.45);
  const lampColors = [new THREE.Color('#ffe2b0'), new THREE.Color('#ffe2b0'), new THREE.Color(pal.neon)];

  // ---------------------------------------------------------------- walls
  for (const b of boxes) {
    if (b.mat === 'neon' || b.mat === 'hazard') continue;
    const w = b.maxs[0] - b.mins[0], d = b.maxs[1] - b.mins[1], h = b.maxs[2] - b.mins[2];
    if (h < 110 || Math.min(w, d) > 140 || Math.max(w, d) < 150) continue;
    const a = w < d ? 0 : 1, l = 1 - a; // thin axis, long axis
    const L = b.maxs[l] - b.mins[l], mid = (b.mins[l] + b.maxs[l]) / 2;
    for (const s of [-1, 1]) {
      const face = s > 0 ? b.maxs[a] : b.mins[a];
      const at = (along, z, off = 0) => { const p = [0, 0, z]; p[a] = face + s * off; p[l] = along; return p; };
      const probe = at(mid, b.mins[2] + 40, 18);
      if (!inBounds(probe) || solid(probe)) continue;
      const fl = floorBelow(probe[0], probe[1], b.mins[2] + 60, b.mins[2] - 200);
      const base = fl ? fl[0] : b.mins[2];
      const top = b.maxs[2];
      if (top - base < 100) continue;
      const strip = (z, depth, height, kind, from = b.mins[l], to = b.maxs[l]) => {
        const p = at((from + to) / 2, z, depth / 2);
        const sc = [0, 0, height];
        sc[a] = depth; sc[l] = to - from;
        put(kind, mat4(p[0], p[1], p[2], sc[0], sc[1], sc[2]));
      };
      strip(base + 4, 2.4, 8, 'base'); // baseboard
      strip(base + 9, 1.2, 1.4, 'trim'); // its top edge
      if (top < hi[2] + 200) strip(top - 3, 3, 6, 'trim'); // cap under the top edge
      // wall lamps with light spilling down the wall
      if (top - base >= 160) {
        const n = Math.max(1, Math.floor(L / 420));
        const lz = base + Math.min(top - base - 40, 170);
        const lc = lampColors[Math.floor(R() * lampColors.length)];
        for (let i = 0; i < n; i++) {
          const along = b.mins[l] + (L / n) * (i + 0.5);
          if (solid(at(along, lz, 24))) continue;
          const hp = at(along, lz, 4);
          const hs = [0, 0, 7];
          hs[a] = 8; hs[l] = 16;
          put('housing', mat4(hp[0], hp[1], hp[2], hs[0], hs[1], hs[2]));
          const pp = at(along, lz - 2.5, 8.2);
          const ps = [0, 0, 1.2];
          ps[a] = 0.6; ps[l] = 13;
          put('lamp', mat4(pp[0], pp[1], pp[2], ps[0], ps[1], ps[2]), lc);
          if (!potato) {
            // a soft pool of light on the wall below the lamp (a quad facing out of the wall)
            const gp = at(along, lz - 30, 0.8);
            const yaw = a === 0 ? (s > 0 ? Math.PI / 2 : -Math.PI / 2) : (s > 0 ? Math.PI : 0);
            put('spill', mat4(gp[0], gp[1], gp[2], 150, 1, 120, yaw), lc);
          }
        }
      }
      // pipes on brackets
      if (L >= 300 && R() < 0.32 * (potato ? 0.6 : 1)) {
        const r = 2 + R() * 2.5;
        const pz = base + 70 + R() * Math.max(0, Math.min(220, top - base - 110));
        const p = at(mid, pz, 5 + r);
        put('pipe', mat4(p[0], p[1], p[2], L - 8, r, r, l === 0 ? 0 : Math.PI / 2));
        for (let x = b.mins[l] + 40; x < b.maxs[l] - 20; x += 150) {
          const bp = at(x, pz, (5 + r) / 2);
          const bs = [0, 0, 2];
          bs[a] = 5 + r; bs[l] = 2.5;
          put('housing', mat4(bp[0], bp[1], bp[2], bs[0], bs[1], bs[2]));
        }
        if (R() < 0.5) { // a second, thinner pipe below
          const p2 = at(mid, pz - 10, 4 + r * 0.6);
          put('pipe', mat4(p2[0], p2[1], p2[2], L - 8, r * 0.55, r * 0.55, l === 0 ? 0 : Math.PI / 2));
        }
      }
      // a vent grille near the floor
      if (R() < 0.25 * dens) {
        const along = b.mins[l] + 30 + R() * Math.max(1, L - 60);
        const vp = at(along, base + 26, 0.8);
        const vs = [0, 0, 22];
        vs[a] = 1.6; vs[l] = 38;
        put('housing', mat4(vp[0], vp[1], vp[2], vs[0], vs[1], vs[2]));
        for (let k = 0; k < 4; k++) {
          const sp = at(along, base + 18 + k * 5, 1.8);
          const ss = [0, 0, 1.4];
          ss[a] = 0.8; ss[l] = 34;
          put('base', mat4(sp[0], sp[1], sp[2], ss[0], ss[1], ss[2]));
        }
      }
      // rubble at the foot of the wall
      if (R() < 0.35 * dens) {
        const along = b.mins[l] + R() * L;
        for (let k = 0, n = 3 + Math.floor(R() * 5); k < n; k++) {
          const p = at(along + (R() - 0.5) * 50, 0, 4 + R() * 16);
          const fz = floorBelow(p[0], p[1], base + 30, base - 60);
          if (!fz) continue;
          const sz = 1.5 + R() * 4;
          put('rock', mat4(p[0], p[1], fz[0] + sz * 0.5, sz, sz * (0.7 + R() * 0.6), sz * 0.7, R() * 6, R(), R()));
        }
      }
    }
  }

  // ---------------------------------------------------------------- floors: sample the map from above
  const area = (hi[0] - lo[0]) * (hi[1] - lo[1]);
  const samples = Math.round(Math.min(3500, Math.max(400, area / 9000)) * dens);
  const flowerColors = ['#f2e14a', '#ffffff', '#c47cff', '#ff6a5a', '#7ab8ff'].map((c) => new THREE.Color(c));
  const grassA = new THREE.Color((pal.grass || DEFAULT_PAL.grass)[0]), grassB = new THREE.Color((pal.grass || DEFAULT_PAL.grass)[1]);
  for (let i = 0; i < samples; i++) {
    const x = lo[0] + R() * (hi[0] - lo[0]), y = lo[1] + R() * (hi[1] - lo[1]);
    const fl = floorBelow(x, y, hi[2] + 400, lo[2] - 400);
    if (!fl) continue;
    const [z, bi] = fl;
    if (!clearAbove(x, y, z, 60)) continue;
    const mat = boxes[bi]?.mat;
    if (mat === 'neon' || mat === 'hazard') continue;
    const grass = mat === 'grass' || (opts.grassBelow !== undefined && !mat && z <= opts.grassBelow);
    const roll = R();
    if (grass) {
      // a patch of tufts of blades, sometimes with flowers
      for (let c = 0; c < 4; c++) {
        const cx = x + (R() - 0.5) * 80, cy = y + (R() - 0.5) * 80;
        if (!floorBelow(cx, cy, z + 2, z - 2)) continue; // stay on this ground
        const n = 6 + Math.floor(R() * 6), tint = grassA.clone().lerp(grassB, R());
        for (let k = 0; k < n; k++) {
          const hgt = 6 + R() * 9;
          put('blade', mat4(cx + (R() - 0.5) * 8, cy + (R() - 0.5) * 8, z + hgt / 2, 1, 1, hgt, R() * 6, (R() - 0.5) * 0.5, (R() - 0.5) * 0.5), tint);
        }
        if (R() < 0.2) put('flower', mat4(cx + 2, cy, z + 9 + R() * 4, 1.6, 1.6, 1.6), flowerColors[Math.floor(R() * flowerColors.length)]);
      }
    } else if (roll < 0.5) {
      const s = 30 + R() * 90;
      put('stain', mat4(x, y, z + 0.35 + R() * 0.1, s, s * (0.6 + R() * 0.8), 1, R() * 6));
    } else if (roll < 0.72) {
      // litter: scraps of paper indoors, dry leaves outdoors (lit by the sun: big open bounds)
      const n = 1 + Math.floor(R() * 3);
      for (let k = 0; k < n; k++) {
        put('scrap', mat4(x + (R() - 0.5) * 30, y + (R() - 0.5) * 30, z + 0.5, 4 + R() * 5, 3 + R() * 4, 1, R() * 6), R() < 0.5 ? new THREE.Color('#d8d2c2') : new THREE.Color('#8a6a3a'));
      }
    } else if (roll < 0.86) {
      for (let k = 0, n = 2 + Math.floor(R() * 4); k < n; k++) {
        const sz = 1.2 + R() * 3;
        put('rock', mat4(x + (R() - 0.5) * 24, y + (R() - 0.5) * 24, z + sz * 0.4, sz, sz, sz * 0.7, R() * 6, R(), R()));
      }
    }
  }

  // ---------------------------------------------------------------- build the instanced meshes
  const group = new THREE.Group();
  group.name = 'details';
  const std = (o) => (potato ? new THREE.MeshLambertMaterial(o) : new THREE.MeshStandardMaterial(o));
  const unit = new THREE.BoxGeometry(1, 1, 1);
  const flat = new THREE.PlaneGeometry(1, 1);
  const KINDS = {
    base: [unit, std({ color: dark, roughness: 0.6, metalness: 0.3 })],
    trim: [unit, std({ color: new THREE.Color(pal.plate).multiplyScalar(0.8), roughness: 0.5, metalness: 0.4 })],
    housing: [unit, std({ color: dark, roughness: 0.5, metalness: 0.5 })],
    lamp: [unit, new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 4, toneMapped: true })],
    spill: [flat.clone().rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ map: GLOW, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false })],
    pipe: [new THREE.CylinderGeometry(1, 1, 1, 12).rotateZ(Math.PI / 2), std({ color: metal, roughness: 0.35, metalness: 0.75 })],
    rock: [new THREE.DodecahedronGeometry(0.6, 0), std({ color: new THREE.Color(pal.concrete).multiplyScalar(0.75), roughness: 0.95 })],
    stain: [flat, new THREE.MeshBasicMaterial({ map: STAIN, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })],
    scrap: [flat, std({ color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 })],
    blade: [new THREE.ConeGeometry(0.7, 1, 3).rotateX(Math.PI / 2), std({ color: 0xffffff, roughness: 0.9 })],
    flower: [new THREE.IcosahedronGeometry(1, 0), std({ color: 0xffffff, roughness: 0.6, emissive: 0x111111 })],
  };
  for (const [kind, list] of lists) {
    const [geo, mat] = KINDS[kind];
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach(({ m, c }, i) => { mesh.setMatrixAt(i, m); if (c) mesh.setColorAt(i, c); });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.receiveShadow = kind !== 'spill' && kind !== 'stain' && kind !== 'lamp';
    mesh.castShadow = false;
    mesh.frustumCulled = false; // instances spread over the whole map
    if (kind === 'stain' || kind === 'spill') mesh.renderOrder = 1;
    group.add(mesh);
  }
  // lamps glow in their instance colour
  KINDS.lamp[1].onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\ntotalEmissiveRadiance *= vColor;\n#endif');
  };

  // ---------------------------------------------------------------- dust drifting in the air
  let tick = () => {};
  if (!potato) {
    const n = Math.round(Math.min(2500, area / 6000));
    const pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = lo[0] + R() * (hi[0] - lo[0]);
      pos[i * 3 + 1] = lo[1] + R() * (hi[1] - lo[1]);
      pos[i * 3 + 2] = Math.max(lo[2], 0) + 10 + R() * Math.min(400, hi[2] - Math.max(lo[2], 0));
      seed[i] = R() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    const uniforms = { uTime: { value: 0 }, uMap: { value: GLOW }, uColor: { value: new THREE.Color(pal.neon).lerp(new THREE.Color('#ffffff'), 0.6) } };
    const dust = new THREE.Points(geo, new THREE.ShaderMaterial({
      uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float seed; uniform float uTime; varying float vA;
        void main() {
          vec3 p = position + vec3(sin(uTime * .13 + seed) * 22., cos(uTime * .11 + seed * 1.3) * 22., sin(uTime * .09 + seed * .7) * 10.);
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          gl_PointSize = clamp(900. / -mv.z, 1., 6.);
          vA = smoothstep(2600., 300., -mv.z) * (.5 + .5 * sin(uTime * .7 + seed * 3.));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uMap; uniform vec3 uColor; varying float vA;
        void main() { gl_FragColor = vec4(uColor * texture2D(uMap, gl_PointCoord).a * vA * .35, 1.); }`,
    }));
    dust.frustumCulled = false;
    group.add(dust);
    tick = (t) => { uniforms.uTime.value = t; };
  }
  return { group, tick };
}
