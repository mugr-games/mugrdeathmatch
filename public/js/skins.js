// Skins and charms: patterned finishes for guns and suits, and the little charms that hang off a gun.
// A finish is drawn in the material's own shader from each point's position on the model, so any shape
// takes it without texture coordinates. On the lowest graphics setting a finish is its plain main colour.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { isPotato } from './shaders.js';

// base: the main colour (and the whole look on potato); metal, rough; glsl: the pattern. It reads p (the
// point, in the model's own units times the scale) and sets col (colour), and may set emi (glow),
// rf (roughness) and mt (metalness). Helpers: sh(p) a hash, sn(p) smooth noise, sf(p) layered noise.
const FINISH = {
  gold: { base: '#e8b021', metal: 1, rough: 0.22, glsl: 'col = vec3(.93, .7, .16) * (.82 + .3 * sn(p * .9)); rf = .18 + .12 * sn(p * 3.);' },
  chrome: { base: '#dfe4ea', metal: 1, rough: 0.06, glsl: 'col = vec3(.92) * (.88 + .16 * sn(p * .6));' },
  carbon: { base: '#1d1f24', metal: 0.4, rough: 0.3, glsl: `
    vec2 q = (p.xy + p.yz + p.xz) * 2.4; vec2 c = floor(q); float w = mod(c.x + c.y, 2.);
    float th = fract(w > .5 ? q.x : q.y); col = mix(vec3(.04, .045, .05), vec3(.2, .21, .24), (.35 + .65 * sin(th * 3.1416)) * (.6 + .4 * w)); rf = .22 + .2 * w;` },
  arctic: { base: '#e6ecf0', metal: 0, rough: 0.7, glsl: `
    float a = sf(p * .3), b = sf(p * .55 + 7.);
    col = vec3(.93, .95, .97); col = mix(col, vec3(.62, .68, .73), step(.55, a)); col = mix(col, vec3(.32, .36, .4), step(.68, b));` },
  woodland: { base: '#4d5a32', metal: 0, rough: 0.8, glsl: `
    float a = sf(p * .28), b = sf(p * .5 + 3.), d = sf(p * .8 + 11.);
    col = vec3(.36, .42, .22); col = mix(col, vec3(.42, .3, .17), step(.52, a)); col = mix(col, vec3(.13, .16, .1), step(.64, b)); col = mix(col, vec3(.6, .58, .4), step(.75, d));` },
  tiger: { base: '#f08a1c', metal: 0.1, rough: 0.5, glsl: `
    float s = sin(p.x * 1.3 + p.z * .4 + sf(p * .35) * 6.); col = mix(vec3(.95, .5, .08), vec3(.05), smoothstep(.55, .7, s));` },
  neon: { base: '#0b0f1a', metal: 0.3, rough: 0.35, glsl: `
    vec3 g = abs(fract(p * .5) - .5); float line = 1. - smoothstep(.0, .06, min(g.x, min(g.y, g.z)));
    col = vec3(.03, .04, .07); emi = mix(vec3(0., .9, 1.), vec3(1., .2, .85), sn(p * .15)) * line * 2.2;` },
  galaxy: { base: '#1a0f3a', metal: 0.2, rough: 0.3, glsl: `
    float a = sf(p * .25), b = sf(p * .6 + 5.);
    col = mix(vec3(.05, .02, .14), vec3(.35, .12, .55), smoothstep(.4, .8, a)); col = mix(col, vec3(.08, .3, .6), smoothstep(.55, .9, b) * .7);
    float st = step(.988, sh(floor(p * 7.))); emi = vec3(1.) * st * 2.5 + col * .25;` },
  lava: { base: '#1a1210', metal: 0.1, rough: 0.85, glsl: `
    float a = sf(p * .45); float crack = 1. - smoothstep(.0, .05, abs(a - .5));
    col = mix(vec3(.07, .05, .045), vec3(.16, .1, .08), sn(p * 2.)); emi = vec3(1., .32, .04) * crack * 3. * (.6 + .4 * sn(p * .3)); rf = .9 - crack * .5;` },
  digital: { base: '#3a5f8a', metal: 0, rough: 0.7, glsl: `
    vec3 c = floor(p * 1.4); float a = sh(c), b = sh(floor(p * .7) + 3.);
    col = vec3(.2, .36, .55); col = mix(col, vec3(.55, .7, .85), step(.6, a)); col = mix(col, vec3(.08, .14, .24), step(.7, b));` },
  candy: { base: '#ff6fb5', metal: 0.1, rough: 0.25, glsl: `
    float s = fract((p.x + p.y + p.z) * .35); col = mix(vec3(1., .42, .72), vec3(.98, .96, .98), step(.5, s)); rf = .2;` },
  toxic: { base: '#6cff3a', metal: 0.2, rough: 0.4, glsl: `
    float a = sf(p * .4); col = mix(vec3(.08, .1, .06), vec3(.3, 1., .18), smoothstep(.45, .6, a)); emi = vec3(.25, 1., .12) * smoothstep(.55, .62, a) * 1.2;` },
};
export const FINISH_IDS = Object.keys(FINISH);

const GLSL_HELPERS = `
  varying vec3 vSkinP;
  float sh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float sn(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
    return mix(mix(mix(sh(i), sh(i + vec3(1, 0, 0)), f.x), mix(sh(i + vec3(0, 1, 0)), sh(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(sh(i + vec3(0, 0, 1)), sh(i + vec3(1, 0, 1)), f.x), mix(sh(i + vec3(0, 1, 1)), sh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
  float sf(vec3 p) { return sn(p) * .55 + sn(p * 2.1 + 17.) * .3 + sn(p * 4.3 + 31.) * .15; }`;

// a new material in a finish. scale: pattern size (bigger repeats it more often); dim: darker for the
// padded and armoured parts of a suit
export function finishMaterial(id, scale = 1, dim = 1) {
  const F = FINISH[id];
  if (!F) return null;
  if (isPotato()) return new THREE.MeshLambertMaterial({ color: new THREE.Color(F.base).multiplyScalar(dim) });
  const m = new THREE.MeshStandardMaterial({ color: F.base, metalness: F.metal, roughness: F.rough });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkinP;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvSkinP = position * ${scale.toFixed(3)};`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        ${GLSL_HELPERS}
        void skinPattern(vec3 p, inout vec3 col, inout vec3 emi, inout float rf, inout float mt) { ${F.glsl} }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 skCol = diffuseColor.rgb, skEmi = vec3(0.); float skRf = -1., skMt = -1.;
        skinPattern(vSkinP, skCol, skEmi, skRf, skMt);
        diffuseColor.rgb = skCol * ${dim.toFixed(3)};`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nif (skRf >= 0.) roughnessFactor = skRf;')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nif (skMt >= 0.) metalnessFactor = skMt;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += skEmi;');
  };
  m.customProgramCacheKey = () => `skin:${id}:${scale}:${dim}`;
  return m;
}

// ---------------------------------------------------------------- guns
// a gun in a finish: every part takes it except the ones that glow (sights, lights)
const gunMats = new Map();
export function applyGunSkin(root, id) {
  if (!FINISH[id]) return;
  const key = id + isPotato();
  if (!gunMats.has(key)) gunMats.set(key, finishMaterial(id, 1.4));
  const mat = gunMats.get(key);
  const keep = (m) => m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) * (m.emissiveIntensity ?? 1) > 0.3;
  root.traverse((o) => {
    if (!o.isMesh || o.userData.charm) return;
    o.material = Array.isArray(o.material) ? o.material.map((m) => (keep(m) ? m : mat)) : keep(o.material) ? o.material : mat;
  });
}

// ---------------------------------------------------------------- charms
const cm = new Map();
function cmat(color, rough = 0.5, metal = 0, glow = 0) {
  const key = [color, rough, metal, glow, isPotato()].join();
  if (!cm.has(key)) {
    const c = new THREE.Color(color);
    cm.set(key, isPotato()
      ? new THREE.MeshLambertMaterial({ color: c, emissive: glow ? c : 0x000000, emissiveIntensity: glow })
      : new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, emissive: glow ? c : 0x000000, emissiveIntensity: glow }));
  }
  return cm.get(key);
}
// a picture for a charm face, drawn once
const faces = new Map();
function faceMat(key, draw, size = 128) {
  if (!faces.has(key)) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    draw(g, size, () => { t.needsUpdate = true; });
    faces.set(key, new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, roughness: 0.45, side: THREE.DoubleSide }));
  }
  return faces.get(key);
}
// the game's hexagon badge, from the same picture as the browser icon
function badgeMat() {
  return faceMat('badge', (g, S, done) => {
    const img = new Image();
    img.onload = () => { g.drawImage(img, 0, 0, S, S); done(); };
    img.src = new URL('../badge.svg', import.meta.url).href;
  }, 256);
}
function dieMat(n) {
  return faceMat('die' + n, (g, S) => {
    g.fillStyle = '#f4f1ea'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#c4161c';
    const P = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] }[n];
    for (const [x, y] of P) { g.beginPath(); g.arc((x * S) / 4, (y * S) / 4, S * 0.09, 0, Math.PI * 2); g.fill(); }
  }, 64);
}

const sph = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);
// The charms, each built hanging from its ring at the origin, the body below. Units: the gun's (inches).
const CHARM_BUILD = {
  mugr(add) {
    // the hexagon badge, both sides, on a dark backing
    add(new THREE.CylinderGeometry(0.9, 0.9, 0.16, 6).rotateY(Math.PI / 6), cmat('#14161b', 0.4, 0.3), 0, 0, -1.05);
    for (const s of [-1, 1]) {
      const face = new THREE.PlaneGeometry(1.95, 1.95).rotateX(Math.PI / 2);
      if (s < 0) face.rotateZ(Math.PI);
      add(face, badgeMat(), 0, s * 0.09, -1.05);
    }
  },
  dice(add) {
    const g = new RoundedBoxGeometry(1, 1, 1, 2, 0.16);
    add(g, [1, 6, 2, 5, 3, 4].map(dieMat), 0, 0, -0.85, 0.4, 0.3, 0.2);
  },
  skull(add) {
    add(sph(0.6), cmat('#ece4cf', 0.6), 0, 0, -0.9);
    add(new RoundedBoxGeometry(0.62, 0.7, 0.36, 2, 0.12), cmat('#ece4cf', 0.6), 0.18, 0, -1.38);
    for (const y of [-0.22, 0.22]) add(sph(0.16, 10, 8), cmat('#141414', 0.8), 0.48, y, -0.92);
    add(new THREE.ConeGeometry(0.08, 0.16, 4).rotateZ(Math.PI / 2), cmat('#141414', 0.8), 0.56, 0, -1.12);
  },
  duck(add) {
    add(sph(0.55).scale(1.25, 1, 0.85), cmat('#ffd21a', 0.35), 0, 0, -1.15);
    add(sph(0.38), cmat('#ffd21a', 0.35), 0.38, 0, -0.62);
    add(new THREE.ConeGeometry(0.14, 0.32, 10).rotateZ(-Math.PI / 2), cmat('#ff7a10', 0.4), 0.78, 0, -0.66);
    for (const y of [-0.18, 0.18]) add(sph(0.06, 8, 6), cmat('#111111', 0.3), 0.66, y, -0.52);
    add(new THREE.ConeGeometry(0.2, 0.4, 8).rotateZ(Math.PI / 2), cmat('#ffd21a', 0.35), -0.62, 0, -1.02);
  },
  eightball(add) {
    add(sph(0.62, 18, 12), cmat('#0d0d10', 0.15, 0.1), 0, 0, -0.95);
    const label = faceMat('eight', (g, S) => {
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.48, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.font = `bold ${S * 0.6}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('8', S / 2, S * 0.54);
    }, 64);
    for (const s of [-1, 1]) {
      const d = new THREE.CircleGeometry(0.28, 20).rotateX(-Math.PI / 2);
      if (s < 0) d.rotateZ(Math.PI);
      add(d, label, 0, s * 0.63, -0.95);
    }
  },
  heart(add) {
    const shape = new THREE.Shape();
    shape.moveTo(0, -0.7);
    shape.bezierCurveTo(-0.9, -0.1, -0.7, 0.55, 0, 0.25);
    shape.bezierCurveTo(0.7, 0.55, 0.9, -0.1, 0, -0.7);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.22, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 3 }).translate(0, 0, -0.11).rotateX(Math.PI / 2);
    add(g, cmat('#e5163a', 0.25, 0.1, 0.15), 0, 0, -0.95);
  },
  star(add) {
    const shape = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.34 : 0.8;
      i ? shape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.18, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 }).translate(0, 0, -0.09).rotateX(Math.PI / 2);
    add(g, cmat('#ffcf3a', 0.25, 1, 0.2), 0, 0, -1);
  },
  crown(add) {
    const gold = cmat('#e8b021', 0.25, 1);
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.42, 16).rotateX(Math.PI / 2), gold, 0, 0, -1.2);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      add(new THREE.ConeGeometry(0.13, 0.42, 6).rotateX(Math.PI / 2), gold, Math.cos(a) * 0.43, Math.sin(a) * 0.43, -0.82);
      add(sph(0.07, 8, 6), cmat(i % 2 ? '#2a6aff' : '#ff2a4a', 0.2, 0, 1), Math.cos(a + 0.6) * 0.5, Math.sin(a + 0.6) * 0.5, -1.2);
    }
  },
  pizza(add) {
    const shape = new THREE.Shape([new THREE.Vector2(0, -0.85), new THREE.Vector2(-0.62, 0.4), new THREE.Vector2(0.62, 0.4)]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.14, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 1 }).translate(0, 0, -0.07).rotateX(Math.PI / 2);
    add(g, cmat('#f2c14a', 0.7), 0, 0, -0.95);
    add(new RoundedBoxGeometry(1.36, 0.26, 0.26, 2, 0.1), cmat('#c27a32', 0.8), 0, 0, -0.52); // the crust
    for (const [x, z] of [[-0.2, -0.8], [0.18, -0.95], [0, -1.25]]) for (const s of [-1, 1]) add(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 12), cmat('#b3261e', 0.6), x, s * 0.12, z);
  },
};
export const CHARM_IDS = Object.keys(CHARM_BUILD);

// a charm on a gun: a little chain from a ring on the gun's left side (the side you see), swinging.
// size: the gun model's size. Returns the pivot it swings on.
export function addCharm(gun, id, size) {
  const build = CHARM_BUILD[id];
  if (!build || !size) return null;
  const pivot = new THREE.Group();
  pivot.position.set(-size.x * 0.12, size.y / 2 + 0.25, -size.z * 0.05);
  pivot.scale.setScalar(Math.max(0.9, Math.min(1.8, size.x / 22)));
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.userData.charm = true;
    m.castShadow = false;
    body.add(m);
    return m;
  };
  // ring and chain
  const steel = cmat('#b9bec6', 0.3, 1);
  const body = new THREE.Group();
  body.position.z = -1.05;
  pivot.add(body);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 14).rotateY(Math.PI / 2), steel);
  ring.userData.charm = true;
  pivot.add(ring);
  for (let i = 0; i < 3; i++) {
    const l = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.035, 5, 10).rotateY(i % 2 ? 0 : Math.PI / 2), steel);
    l.position.z = -0.32 - i * 0.24;
    l.userData.charm = true;
    pivot.add(l);
  }
  build(add);
  gun.add(pivot);
  gun.userData.charm = pivot;
  return pivot;
}

// let a gun's charm swing: t time, kx/ky a push (how fast the gun moves or turns)
export function swingCharm(gun, t, kx = 0, ky = 0) {
  const p = gun?.userData.charm;
  if (!p) return;
  p.rotation.x = Math.sin(t * 2.6) * 0.1 + Math.max(-0.8, Math.min(0.8, kx));
  p.rotation.y = Math.sin(t * 2.1 + 1) * 0.08 + Math.max(-0.8, Math.min(0.8, ky));
}
