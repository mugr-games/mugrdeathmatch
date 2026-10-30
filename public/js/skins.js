// Skins and charms: patterned finishes for guns and suits, and the little charms that hang off a gun.
// A finish is drawn in the material's own shader from each point's position on the model, so any shape
// takes it without texture coordinates. On the lowest graphics setting the same pattern goes on a cheaper
// Lambert material (no shine).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { isPotato } from './shaders.js';

// base: the main colour; metal, rough; glsl: the pattern. It reads p (the
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
  // battle pass, season 1
  hazard: { base: '#f2c40d', metal: 0.2, rough: 0.5, glsl: `
    float s = fract((p.x + p.y + p.z) * .22); col = mix(vec3(.98, .76, .04), vec3(.04), step(.5, s)); rf = .45 + .2 * sn(p * 3.);` },
  circuit: { base: '#0b3a1c', metal: 0.3, rough: 0.4, glsl: `
    vec3 q = p * .8; vec3 g = abs(fract(q) - .5); float tr = 1. - smoothstep(.0, .05, min(g.x, min(g.y, g.z)));
    col = vec3(.02, .17, .08); emi = vec3(.2, 1., .45) * tr * step(.45, sh(floor(q))) * 1.6;
    vec3 f = fract(q * 2.) - .5; col = mix(col, vec3(.85, .68, .28), step(.86, sh(floor(q * 2.))) * (1. - smoothstep(.12, .2, length(f))));` },
  sakura: { base: '#ffc4dc', metal: 0, rough: 0.55, glsl: `
    col = mix(vec3(.99, .93, .95), vec3(1., .62, .8), smoothstep(.45, .7, sf(p * .4)));
    vec3 f = fract(p * 1.2) - .5; col = mix(col, vec3(.93, .28, .55), step(.72, sh(floor(p * 1.2))) * (1. - smoothstep(.15, .3, length(f))));` },
  zebra: { base: '#e8e8e8', metal: 0, rough: 0.6, glsl: `
    float s = sin(p.x * 1.6 + p.z * .3 + sf(p * .3) * 7.); col = mix(vec3(.95), vec3(.03), step(.15, s));` },
  aurora: { base: '#0a0f24', metal: 0.2, rough: 0.35, glsl: `
    float a = sf(p * .2 + vec3(0., 0., p.x * .1)); float band = smoothstep(.35, .55, a) * (1. - smoothstep(.6, .85, a));
    col = vec3(.02, .03, .09); emi = mix(vec3(.1, 1., .6), vec3(.65, .2, 1.), sn(p * .12)) * band * 1.7;` },
  static: { base: '#8a8a8a', metal: 0, rough: 0.6, glsl: `
    float n = sh(floor(p * 6.)); col = vec3(n * .78 + .1) - step(.5, fract(p.z * 2.)) * .08;` },
  diamond: { base: '#bfe6ff', metal: 0.6, rough: 0.08, glsl: `
    col = mix(vec3(.78, .92, 1.), vec3(.38, .66, .95), sh(floor(p * .9))); emi = vec3(.35, .55, .8) * step(.94, sh(floor(p * 4.))) * 1.6; rf = .05; mt = .6;` },
  void: { base: '#0a0512', metal: 0.3, rough: 0.3, glsl: `
    float a = sf(p * .35); float e = 1. - smoothstep(.0, .06, abs(a - .5));
    col = vec3(.02, .01, .04); emi = vec3(.55, .1, 1.) * e * 2.5 + vec3(.1, 0., .2) * sn(p * .5) * .4;` },
  backrooms: { base: '#d4c06a', metal: 0, rough: 0.85, glsl: `
    col = mix(vec3(.84, .76, .42), vec3(.76, .68, .34), step(.5, fract((p.x + p.y) * .6)));
    col = mix(col, vec3(.52, .44, .22), smoothstep(.55, .8, sf(p * .18)) * .65);` },
  mugrhex: { base: '#ff8c14', metal: 0.3, rough: 0.4, glsl: `
    vec2 q = (p.xy + p.yz * .5) * .6, r = vec2(1., 1.732), h = r * .5;
    vec2 a = mod(q, r) - h, b = mod(q - h, r) - h, g = dot(a, a) < dot(b, b) ? a : b;
    float edge = smoothstep(.4, .46, max(abs(g.x) * .866 + abs(g.y) * .5, abs(g.y)));
    col = mix(vec3(.08, .08, .09), vec3(1., .55, .08), edge); emi = vec3(1., .45, .05) * edge * .6;` },
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
  const potato = isPotato();
  const m = potato ? new THREE.MeshLambertMaterial({ color: F.base }) : new THREE.MeshStandardMaterial({ color: F.base, metalness: F.metal, roughness: F.rough });
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
  m.customProgramCacheKey = () => `skin:${id}:${scale}:${dim}:${potato}`;
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
  // battle pass, season 1
  dogtag(add) {
    add(new RoundedBoxGeometry(0.85, 0.08, 1.35, 2, 0.04), cmat('#c9ced6', 0.3, 1), 0, 0, -1.05);
    add(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 10), cmat('#2a2d33', 0.6), 0, 0, -0.5);
    for (const z of [-0.85, -1.05, -1.25]) add(new THREE.BoxGeometry(0.55, 0.1, 0.07), cmat('#7d838c', 0.5, 0.8), 0, 0, z);
  },
  banana(add) {
    const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.15, 0, -0.45), new THREE.Vector3(0.75, 0, -1.05), new THREE.Vector3(-0.1, 0, -1.65));
    add(new THREE.TubeGeometry(curve, 12, 0.22, 8), cmat('#ffd83a', 0.5));
    add(new THREE.CylinderGeometry(0.06, 0.09, 0.16, 6), cmat('#5a4020', 0.8), -0.15, 0, -0.38, Math.PI / 2);
    add(sph(0.08, 6, 5), cmat('#3a2a14', 0.8), -0.1, 0, -1.67);
  },
  ghost(add) {
    const white = cmat('#f2f4ff', 0.6, 0, 0.25);
    add(sph(0.5, 16, 10), white, 0, 0, -0.95);
    add(new THREE.CylinderGeometry(0.5, 0.56, 0.6, 16), white, 0, 0, -1.25, Math.PI / 2);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; add(new THREE.ConeGeometry(0.14, 0.25, 6), white, Math.cos(a) * 0.4, Math.sin(a) * 0.4, -1.62, -Math.PI / 2); }
    for (const y of [-0.17, 0.17]) add(sph(0.09, 8, 6), cmat('#111111', 0.3), 0.44, y, -0.92);
    add(sph(0.08, 8, 6).scale(1, 1, 1.4), cmat('#111111', 0.3), 0.47, 0, -1.15);
  },
  controller(add) {
    const body = cmat('#22252c', 0.45);
    add(new RoundedBoxGeometry(1.5, 0.32, 0.8, 2, 0.14), body, 0, 0, -1.0);
    for (const x of [-0.6, 0.6]) add(new THREE.CylinderGeometry(0.26, 0.26, 0.32, 12), body, x, 0, -1.28);
    add(new THREE.BoxGeometry(0.34, 0.1, 0.11), cmat('#d6d9de', 0.4), -0.42, 0.17, -0.98);
    add(new THREE.BoxGeometry(0.11, 0.1, 0.34), cmat('#d6d9de', 0.4), -0.42, 0.17, -0.98);
    for (const [c, dx, dz] of [['#3ad66a', 0, 0.12], ['#e5303a', 0.12, 0], ['#2a7aff', -0.12, 0], ['#ffd23a', 0, -0.12]]) add(sph(0.06, 8, 6), cmat(c, 0.3, 0, 0.4), 0.42 + dx, 0.17, -0.98 + dz);
  },
  tv(add) {
    add(new RoundedBoxGeometry(1.3, 0.8, 1.05, 2, 0.12), cmat('#3a3530', 0.6), 0, 0, -1.08);
    const screen = faceMat('static', (g, S) => {
      const d = g.createImageData(S, S);
      for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 255; }
      g.putImageData(d, 0, 0);
    }, 64);
    for (const s of [-1, 1]) {
      const f = new THREE.PlaneGeometry(1.02, 0.8).rotateX(Math.PI / 2);
      if (s < 0) f.rotateZ(Math.PI);
      add(f, screen, 0, s * 0.41, -1.08);
    }
    for (const x of [-0.25, 0.25]) add(new THREE.CylinderGeometry(0.025, 0.025, 0.6, 5), cmat('#9a9fa8', 0.3, 1), x, 0, -0.42, Math.PI / 2, x > 0 ? 0.5 : -0.5);
  },
  trophy(add) {
    const gold = cmat('#e8b021', 0.22, 1);
    add(new THREE.CylinderGeometry(0.5, 0.2, 0.7, 16), gold, 0, 0, -0.85, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.08, 0.08, 0.35, 8), gold, 0, 0, -1.35, Math.PI / 2);
    add(new RoundedBoxGeometry(0.62, 0.4, 0.2, 2, 0.05), cmat('#2a2016', 0.7), 0, 0, -1.6);
    for (const s of [-1, 1]) add(new THREE.TorusGeometry(0.17, 0.05, 6, 12, Math.PI), gold, s * 0.5, 0, -0.85, 0, 0, s > 0 ? -Math.PI / 2 : Math.PI / 2);
  },
};
export const CHARM_IDS = Object.keys(CHARM_BUILD);

// ---------------------------------------------------------------- workshop charms
// a design from the charm maker (checkCharm in cosmetics.js): { shape, c1, c2, text, glow, metal }. The shape in
// c1 with a c2 rim or spots; letters, when there are some, on both faces in c2.
const flatShape = {
  disc: () => { const s = new THREE.Shape(); s.absarc(0, 0, 0.7, 0, Math.PI * 2, false); return s; },
  hex: () => new THREE.Shape(Array.from({ length: 6 }, (_, i) => new THREE.Vector2(Math.cos((i / 6) * Math.PI * 2) * 0.75, Math.sin((i / 6) * Math.PI * 2) * 0.75))),
  diamond: () => new THREE.Shape([new THREE.Vector2(0, 0.85), new THREE.Vector2(0.6, 0), new THREE.Vector2(0, -0.85), new THREE.Vector2(-0.6, 0)]),
  star: () => new THREE.Shape(Array.from({ length: 10 }, (_, i) => { const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.36 : 0.85; return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r); })),
  heart: () => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.7);
    s.bezierCurveTo(-0.9, -0.1, -0.7, 0.55, 0, 0.25);
    s.bezierCurveTo(0.7, 0.55, 0.9, -0.1, 0, -0.7);
    return s;
  },
  shield: () => {
    const s = new THREE.Shape();
    s.moveTo(-0.6, 0.6); s.lineTo(0.6, 0.6); s.lineTo(0.6, 0.05);
    s.quadraticCurveTo(0.55, -0.55, 0, -0.85); s.quadraticCurveTo(-0.55, -0.55, -0.6, 0.05);
    return s;
  },
};
function letters(text, color) {
  return faceMat('txt|' + text + '|' + color, (g, S) => {
    g.fillStyle = color;
    g.font = `900 ${Math.round(S * (text.length > 3 ? 0.62 / Math.sqrt(text.length / 3) : 0.62))}px Verdana, Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = S * 0.04; g.strokeStyle = 'rgba(0,0,0,.55)';
    g.strokeText(text, S / 2, S * 0.53, S * 0.94);
    g.fillText(text, S / 2, S * 0.53, S * 0.94);
  }, 128);
}
function customCharm(d) {
  return (add) => {
    const main = cmat(d.c1, d.metal ? 0.25 : 0.45, d.metal ? 1 : 0, d.glow ? 0.6 : 0), trim = cmat(d.c2, 0.35, d.metal ? 1 : 0, d.glow ? 0.4 : 0);
    let face = 0.62; // how far out the letters go (the body's half thickness and a little)
    if (flatShape[d.shape]) {
      const g = new THREE.ExtrudeGeometry(flatShape[d.shape](), { depth: 0.2, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 2 }).translate(0, 0, -0.1).rotateX(Math.PI / 2);
      add(g, main, 0, 0, -1.0);
      // a rim in the second colour, just bigger, behind the body
      const rim = new THREE.ExtrudeGeometry(flatShape[d.shape](), { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.06).rotateX(Math.PI / 2);
      add(rim, trim, 0, 0, -1.0).scale.set(1.14, 1, 1.14);
      face = 0.19;
    } else if (d.shape === 'cube') {
      add(new RoundedBoxGeometry(1.05, 1.05, 1.05, 2, 0.18), main, 0, 0, -0.95);
      for (const s of [-1, 1]) add(new THREE.BoxGeometry(1.1, 0.02, 0.16), trim, 0, s * 0.535, -0.6);
      face = 0.54;
    } else if (d.shape === 'ball') {
      add(sph(0.62, 18, 12), main, 0, 0, -0.98);
      add(new THREE.TorusGeometry(0.62, 0.06, 6, 24).rotateY(Math.PI / 2), trim, 0, 0, -0.98);
      face = 0.64;
    } else { // tag
      add(new RoundedBoxGeometry(0.9, 0.1, 1.35, 2, 0.05), main, 0, 0, -1.05);
      add(new RoundedBoxGeometry(0.96, 0.06, 1.41, 2, 0.03), trim, 0, 0, -1.05);
      face = 0.06;
    }
    if (d.text) {
      const t = letters(d.text, d.c2);
      for (const s of [-1, 1]) {
        const p = new THREE.PlaneGeometry(1.1, 1.1).rotateX(Math.PI / 2);
        if (s < 0) p.rotateZ(Math.PI);
        add(p, t, 0, s * face, -1.0);
      }
    }
  };
}

// a charm on a gun: a little chain from a ring on the gun's left side (the side you see), swinging, hung where
// no hand goes: off the stock behind the grip on long guns, under the muzzle end on pistols. id: a charm's
// name, or a workshop design; size: the gun model's size; hold: how it's held (HOLDS). Returns the pivot it swings on.
export function addCharm(gun, id, size, hold) {
  const build = id && typeof id === 'object' ? customCharm(id) : CHARM_BUILD[id];
  if (!build || !size) return null;
  const pivot = new THREE.Group();
  const short = !hold || hold.short;
  const x = short ? size.x * 0.3 : ((hold.right?.[0] ?? -0.1) - 0.27) * size.x;
  pivot.position.set(x, size.y / 2 + 0.25, -size.z * (short ? 0.08 : 0.05));
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
