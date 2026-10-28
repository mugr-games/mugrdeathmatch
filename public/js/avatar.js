// Original player characters built from shaped primitives and animated procedurally (walk/run cycle,
// crouch, jump tuck, aim pitch). Every character shares one skeleton; the parts on it differ. Each body
// part's pieces are merged into one mesh per material, and the merged shapes are shared by every player
// wearing that character. Units are Source units, Z up, facing +X.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isPotato } from './shaders.js';
import { COSMETIC } from './cosmetics.js';
import { api } from './net.js';
import { emotePose, clearPose } from './emotes.js';
import { finishMaterial } from './skins.js';

// the picture on an image cape or flag: the approved upload, a local preview (a data URL), or a sign while it
// waits for a moderator
const IMAGE_MATS = new Map();
function imageMat(img, w, h) {
  if (!img || img === 'p' || img === 'x') return textMat(img === 'x' ? 'NO PICTURE' : 'IN REVIEW', '#1b1b1f', '#ffd23a', w, h, 0.4);
  if (!IMAGE_MATS.has(img)) {
    const t = new THREE.TextureLoader().load(img.startsWith('data:') ? img : api('/img/' + img));
    t.colorSpace = THREE.SRGBColorSpace;
    IMAGE_MATS.set(img, new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: THREE.DoubleSide }));
  }
  return IMAGE_MATS.get(img);
}

export const SUIT_COLORS = [
  { name: 'Signal orange', rgb: [0.93, 0.45, 0.12] },
  { name: 'Lab blue', rgb: [0.2, 0.45, 0.85] },
  { name: 'Moss green', rgb: [0.35, 0.6, 0.25] },
  { name: 'Brick red', rgb: [0.72, 0.18, 0.16] },
  { name: 'Bone white', rgb: [0.86, 0.84, 0.78] },
  { name: 'Ultraviolet', rgb: [0.5, 0.3, 0.8] },
  { name: 'Hazard yellow', rgb: [0.92, 0.78, 0.15] },
  { name: 'Graphite', rgb: [0.3, 0.31, 0.33] },
];

// the server only checks the index is below this many
export const MODELS = [
  { name: 'Courier', blurb: 'Padded suit, visor band and a lamp pack' },
  { name: 'Trooper', blurb: 'Plate vest, pouches, goggles and a mask' },
  { name: 'Juggernaut', blurb: 'Heavy armour plates and pauldrons' },
  { name: 'Scout', blurb: 'Hooded jacket, scarf and night goggles' },
];

// colour index for zombies (infection mode): sickly green suit, red eyes. Not offered in the colour picker.
export const ZOMBIE_SKIN = 100;
export const ZOMBIE_RGB = [0.36, 0.5, 0.26];
export function suitRGB(colorIndex) {
  return colorIndex === ZOMBIE_SKIN ? ZOMBIE_RGB : SUIT_COLORS[colorIndex % SUIT_COLORS.length].rgb;
}

// ------------------------------------------------------------------ shapes (all built along +Z)
const RX = new THREE.Matrix4().makeRotationX(Math.PI / 2);
const cyl = (rTop, rBot, len, seg = 14) => new THREE.CylinderGeometry(rTop, rBot, len, seg).applyMatrix4(RX);
const sph = (r, w = 18, h = 12) => new THREE.SphereGeometry(r, w, h);
const rbox = (w, d, h, r = 1) => new RoundedBoxGeometry(w, d, h, 2, Math.min(r, w / 2 - 0.01, d / 2 - 0.01, h / 2 - 0.01));
// a body of revolution from [radius, z] points, squashed front-to-back by depth
const lathe = (pts, depth = 0.7, width = 1, seg = 20) =>
  new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg).applyMatrix4(RX).scale(depth, width, 1);

// place a shape: position, rotation (radians, XYZ) and scale
function at(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return g.applyMatrix4(m);
}

// ------------------------------------------------------------------ the characters
// add(part, material, geometry). Parts: hips, torso, head, sh0/1 (shoulder), up0/1, fore0/1, thigh0/1, shin0/1,
// foot0/1 (from the ankle).
// Index 0 is the right side (-Y), 1 the left (+Y). Materials: suit, pad, armor, dark, metal, visor, lamp.
const CHEST = [[0, 0], [6.3, 0], [7, 3], [8.4, 9], [9.4, 15], [9.2, 18.5], [7, 21.5], [3.5, 23], [0, 23]];

// the visor: the original character's glowing box across the eyes
function visor(add, x, z) {
  add('head', 'visor', at(new THREE.BoxGeometry(4, 11, 4), x, 0, z));
}

function limbs(add, o = {}) {
  for (const i of [0, 1]) {
    const s = i ? 1 : -1;
    if (!o.noShoulder) add('sh' + i, 'pad', sph(4.3, 14, 10));
    add('up' + i, 'suit', at(cyl(3.1, 2.6, 11), 0, 0, -6));
    add('fore' + i, 'suit', at(cyl(2.7, 2.3, 9), 0, 0, -5));
    add('fore' + i, 'pad', at(cyl(3, 3, 1.8), 0, 0, -9.4)); // cuff
    add('fore' + i, 'dark', at(rbox(4.6, 3.6, 4.6, 1.3), 0.3, 0, -12)); // glove
    add('fore' + i, 'dark', at(rbox(1.6, 1.6, 3.4, 0.7), 1.6, -s * 1.6, -11.2, 0, -0.5)); // thumb
    add('thigh' + i, 'suit', at(cyl(4.2, 3.3, 16), 0, 0, -9));
    add('shin' + i, 'pad', sph(3.5, 12, 8));
    add('shin' + i, 'suit', at(cyl(3.3, 2.7, 12), 0, 0, -7.5));
    add('shin' + i, 'dark', at(cyl(3.4, 3.5, 5), 0.3, 0, -13.8)); // boot cuff
    add('foot' + i, 'dark', at(rbox(10, 6, 4.6, 1.8), 2.6, 0, -1.1)); // boot, from the ankle (15.5 below the knee)
    add('foot' + i, 'armor', at(rbox(10.6, 6.5, 1.5, 0.6), 2.7, 0, -3.4)); // sole
  }
}

const BUILD = [
  // Courier: padded suit, visor helmet, lamp pack
  (add) => {
    add('hips', 'pad', rbox(10, 17, 8, 2.5));
    add('hips', 'dark', at(rbox(11, 18, 2.4, 1), 0, 0, 3));
    add('torso', 'suit', at(lathe(CHEST), 0, 0, -1));
    add('torso', 'pad', at(rbox(3.4, 13, 9, 1.5), 5.6, 0, 13.5)); // chest plate
    for (const s of [-1, 1]) add('torso', 'dark', at(rbox(10, 2.2, 1.4, 0.6), 0, s * 6, 21.5)); // pack straps
    add('torso', 'dark', at(rbox(8, 14, 15, 2.5), -9.5, 0, 12)); // pack
    add('torso', 'lamp', at(new THREE.CylinderGeometry(2, 2, 14, 12), -10, 0, 20.5)); // lamp bar
    add('torso', 'visor', at(rbox(0.6, 10, 1.2, 0.3), -13.6, 0, 9)); // pack light strip
    add('head', 'pad', at(cyl(2.7, 3.2, 5), 0, 0, 1));
    add('head', 'pad', at(sph(7), 0, 0, 7.2)); // padded hood
    visor(add, 5.2, 7.7);
    for (const s of [-1, 1]) add('head', 'dark', at(new THREE.CylinderGeometry(2.4, 2.4, 1.8, 14), 0, s * 6.9, 7.4)); // ear pieces
    add('head', 'dark', at(rbox(3, 6, 2.6, 1), 5, 0, 3.6)); // chin guard
    limbs(add);
  },
  // Trooper: plate vest with pouches, combat helmet, goggles and a face mask
  (add) => {
    add('hips', 'suit', rbox(10, 17, 8, 2.5));
    add('hips', 'dark', at(rbox(11, 18, 2.4, 1), 0, 0, 3));
    for (const y of [-6, 6]) add('hips', 'armor', at(rbox(4, 3.5, 4.5, 1), 4.5, y, 1)); // belt pouches
    add('torso', 'suit', at(lathe(CHEST), 0, 0, -1));
    add('torso', 'armor', at(rbox(13.5, 18, 13, 3.5), 0.3, 0, 13)); // vest
    for (const y of [-4.4, 0, 4.4]) add('torso', 'dark', at(rbox(2.6, 3.8, 4.6, 0.8), 7.4, y, 9.5)); // mag pouches
    add('torso', 'dark', at(rbox(3.4, 4.6, 7, 1), -7.4, 4, 15)); // radio
    add('torso', 'dark', at(cyl(0.35, 0.45, 9, 5), -7.8, 5.4, 22));
    add('head', 'suit', at(cyl(2.8, 3.3, 5), 0, 0, 1));
    add('head', 'suit', at(sph(7), 0.3, 0, 7.2)); // balaclava
    visor(add, 5.5, 7.7);
    add('head', 'dark', at(rbox(2.8, 6.4, 3.4, 1.2), 5.9, 0, 3.4)); // mask
    limbs(add);
    for (const i of [0, 1]) {
      add('shin' + i, 'armor', at(rbox(3, 5, 5, 1.2), 3, 0, -0.5)); // knee pads
      add('up' + i, 'armor', at(rbox(5, 6, 4, 1.4), 0, (i ? 1 : -1) * 0.8, -2)); // shoulder plates
    }
  },
  // Juggernaut: heavy plates, pauldrons and a boxy helmet with a slit visor
  (add) => {
    add('hips', 'armor', rbox(12, 19, 9, 2.5));
    add('hips', 'dark', at(rbox(13, 20, 2.6, 1), 0, 0, 3.4));
    add('hips', 'armor', at(rbox(3, 9, 7, 1), 6.2, 0, -3)); // codpiece plate
    add('torso', 'suit', at(lathe(CHEST, 0.8, 1.1), 0, 0, -1));
    add('torso', 'armor', at(rbox(15, 22, 15, 4), 0.4, 0, 12.5)); // chest plate
    add('torso', 'pad', at(rbox(2, 16, 2, 0.8), 7.8, 0, 11)); // plate ridge
    add('torso', 'armor', at(rbox(10, 15, 4, 1.6), -0.5, 0, 21)); // collar
    add('torso', 'dark', at(rbox(6, 14, 12, 2), -10, 0, 12)); // power pack
    for (const y of [-4, 4]) add('torso', 'visor', at(cyl(1.2, 1.2, 8, 8), -13.2, y, 12)); // vents
    add('head', 'dark', at(cyl(3.4, 3.8, 4), 0, 0, 1));
    add('head', 'armor', at(sph(7.2), 0, 0, 7.2, 0, 0, 0, 1, 1.05, 1)); // armoured cowl
    visor(add, 5.2, 7.7);
    for (const z of [3.4, 5]) add('head', 'dark', at(rbox(1, 6.4, 0.8, 0.3), 6.4, 0, z)); // jaw grill
    limbs(add, { noShoulder: true });
    for (const i of [0, 1]) {
      const s = i ? 1 : -1;
      add('sh' + i, 'armor', at(sph(6.6, 16, 10), 0, s * 1.4, 1.2, 0, 0, 0, 1.1, 1, 0.8)); // pauldron
      add('sh' + i, 'pad', at(new THREE.TorusGeometry(6, 0.8, 6, 20), 0, s * 1.4, -1.6, 0, 0, 0, 1.1, 1, 1));
      add('thigh' + i, 'armor', at(rbox(3, 6.6, 10, 1.2), 3.8, 0, -8));
      add('shin' + i, 'armor', at(rbox(3, 6, 10, 1.2), 3.3, 0, -7.5));
      add('fore' + i, 'armor', at(rbox(5.6, 5.6, 6, 1.6), 0, 0, -5));
    }
  },
  // Scout: hooded jacket, scarf, sling and twin night goggles
  (add) => {
    add('hips', 'suit', rbox(10, 16, 8, 2.5));
    add('hips', 'dark', at(rbox(11, 17, 2, 0.8), 0, 0, 3));
    add('hips', 'pad', at(rbox(5, 5, 6, 1.5), -1, -8, 0)); // hip bag
    add('torso', 'pad', at(lathe(CHEST, 0.7, 0.95), 0, 0, -1)); // jacket
    add('torso', 'suit', at(rbox(1.4, 7, 18, 0.6), 6.4, 0, 10)); // open front
    add('torso', 'dark', at(rbox(1.3, 1.7, 30, 0.5), 6.5, 0, 12, 0.62)); // sling across the chest
    add('torso', 'suit', at(new THREE.TorusGeometry(4.4, 2.2, 8, 18), 0.5, 0, 21.4, 0, 0, 0, 1, 1, 0.8)); // scarf
    add('torso', 'pad', at(sph(6.5, 14, 10), -6, 0, 20, 0, 0, 0, 0.7, 1.1, 0.6)); // hood down the back
    add('head', 'suit', at(cyl(2.6, 3.2, 5), 0, 0, 1));
    add('head', 'pad', at(sph(7.8), -1, 0, 6.6, 0, 0, 0, 1.05, 1, 1.08)); // hood
    add('head', 'dark', at(sph(6.1), 2.4, 0, 5.8)); // face in shadow
    add('head', 'suit', at(rbox(3, 8, 4, 1.4), 6.2, 0, 2.6)); // scarf over the mouth
    visor(add, 6.8, 7.2);
    limbs(add);
    for (const i of [0, 1]) add('thigh' + i, 'dark', at(rbox(3, 4.5, 5, 1), 0.5, (i ? 1 : -1) * 4, -9)); // leg pockets
  },
];

// merged shapes per character: { part: [[material, geometry], ...] }
const templates = new Map();
function template(model) {
  if (!templates.has(model)) {
    const parts = {};
    (BUILD[model] || BUILD[0])((part, mat, geo) => {
      const p = (parts[part] ||= {});
      // shapes differ in which attributes they carry; keep only what merging and lighting need
      const g = geo.index ? geo.toNonIndexed() : geo;
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      (p[mat] ||= []).push(g);
    });
    const out = {};
    for (const [part, mats] of Object.entries(parts)) {
      out[part] = Object.entries(mats).map(([mat, geos]) => {
        const g = mergeGeometries(geos);
        g.userData.keep = true; // shared: never dispose
        return [mat, g];
      });
    }
    templates.set(model, out);
  }
  return templates.get(model);
}

// a woven-fabric look for suits: fine cross-hatch bumps and a little tone variation, in object space
function fabric(mat, scale) {
  if (isPotato()) return mat;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObj;
        float fh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float fn(vec3 p) {
          vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
          return mix(mix(mix(fh(i), fh(i + vec3(1, 0, 0)), f.x), mix(fh(i + vec3(0, 1, 0)), fh(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(fh(i + vec3(0, 0, 1)), fh(i + vec3(1, 0, 1)), f.x), mix(fh(i + vec3(0, 1, 1)), fh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        // twill weave, a ripstop grid of heavier threads, grime and wear
        vec3 fp = vObj * ${scale.toFixed(2)};
        float twill = sin((fp.x + fp.y + fp.z * .6) * 3.1) * .5 + .5;
        float warp = sin((fp.z - fp.y * .4) * 2.3) * .5 + .5;
        float wv = twill * .6 + warp * .4;
        vec3 rg = abs(fract(vObj * .42) - .5);
        float rip = 1. - smoothstep(.0, .035, min(rg.x, min(rg.y, rg.z)));
        float grime = fn(vObj * .18) * .6 + fn(vObj * .7) * .4;
        float wear = smoothstep(.62, .82, fn(vObj * .5 + 7.));
        diffuseColor.rgb *= (.9 + .12 * wv) * (1. - rip * .12) * (1. - smoothstep(.45, .85, grime) * .22);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.18 + .02, wear * .5);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor *= .88 + .16 * wv - wear * .1;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 wsx = dFdx(-vViewPosition), wsy = dFdy(-vViewPosition);
        vec3 wr1 = cross(wsy, normal), wr2 = cross(normal, wsx);
        float wdet = dot(wsx, wr1) * faceDirection;
        float wh = wv * .7 - rip * .5;
        float wfade = 1. / (1. + length(fwidth(vObj)) * 6.);
        vec2 wdh = vec2(dFdx(wh), dFdy(wh)) * .09 * wfade;
        normal = normalize(abs(wdet) * normal - sign(wdet) * (wdh.x * wr1 + wdh.y * wr2));`);
  };
  mat.customProgramCacheKey = () => 'fabric2' + scale;
  return mat;
}

// rot for zombies: decay blotches, dried blood patches and drips running down, wetter where it's fresh
function rot(mat, scale) {
  if (isPotato()) return mat;
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vObj;
        float zh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
        float zn(vec3 p) {
          vec3 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
          return mix(mix(mix(zh(i), zh(i + vec3(1, 0, 0)), f.x), mix(zh(i + vec3(0, 1, 0)), zh(i + vec3(1, 1, 0)), f.x), f.y),
                     mix(mix(zh(i + vec3(0, 0, 1)), zh(i + vec3(1, 0, 1)), f.x), mix(zh(i + vec3(0, 1, 1)), zh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
        }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 zp = vObj * ${scale.toFixed(2)};
        float zrot = smoothstep(.45, .75, zn(zp * .35) * .65 + zn(zp * 1.3) * .35);
        float zblood = smoothstep(.71, .77, zn(zp * .28 + 7.));
        float zdrip = smoothstep(.8, .86, zn(vec3(zp.x * 1.6, zp.y * 1.6, zp.z * .12) + 3.)) * step(.45, zn(zp * .2 + 1.));
        float zwet = max(zblood, zdrip);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(.42, .38, .3), zrot);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.13, .012, .008), zwet * .85);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, .28, zwet);`);
  };
  mat.customProgramCacheKey = () => 'rot' + scale;
  return mat;
}

// the materials a character in this colour wears
export function avatarMaterials(colorIndex) {
  const c = suitRGB(colorIndex);
  const zombie = colorIndex === ZOMBIE_SKIN;
  const col = (rgb) => new THREE.Color().setRGB(...rgb, THREE.SRGBColorSpace);
  const potato = isPotato();
  const mk = (rgb, rough = 0.7, metal = 0.05) => (potato
    ? new THREE.MeshLambertMaterial({ color: col(rgb) })
    : new THREE.MeshStandardMaterial({ color: col(rgb), roughness: rough, metalness: metal }));
  const glow = zombie ? new THREE.Color(1, 0.12, 0.05) : new THREE.Color(0.35, 0.8, 1.0);
  const emit = (color, i) => (potato
    ? new THREE.MeshLambertMaterial({ color: 0x0a1418, emissive: color, emissiveIntensity: i })
    : new THREE.MeshStandardMaterial({ color: 0x0a1418, emissive: color, emissiveIntensity: i, roughness: 0.2, metalness: 0.3 }));
  if (zombie) {
    // a dead soldier: a filthy, torn grey-green suit, a dark cracked visor and bare bone and flesh
    return {
      suit: rot(mk([0.33, 0.37, 0.28], 0.9), 1),
      pad: rot(mk([0.2, 0.22, 0.17], 0.92), 1.2),
      armor: rot(mk([0.16, 0.16, 0.14], 0.6, 0.2), 0.8),
      dark: mk([0.06, 0.06, 0.05], 0.7, 0.1),
      metal: mk([0.35, 0.33, 0.3], 0.6, 0.6),
      visor: emit(new THREE.Color(0.35, 0.03, 0.02), 0.2),
      lamp: emit(new THREE.Color(0.3, 0.25, 0.1), 0.2),
      bone: mk([0.78, 0.72, 0.58], 0.55),
      flesh: mk([0.32, 0.04, 0.04], 0.35),
      eye: emit(new THREE.Color(1, 0.1, 0.03), 5),
    };
  }
  return {
    suit: fabric(mk(c, 0.82), 2.6),
    pad: fabric(mk(c.map((v) => v * 0.55), 0.88), 1.8),
    armor: mk(c.map((v) => 0.13 + v * 0.18), 0.38, 0.25),
    dark: mk([0.08, 0.08, 0.09], 0.6, 0.2),
    metal: mk([0.55, 0.56, 0.58], 0.3, 0.9),
    visor: emit(glow, 2.5),
    lamp: emit(new THREE.Color(1, 0.92, 0.75), 1.2),
  };
}

// the head of a character as its own group (for ragdolls); origin at the neck, facing +X
// How each weapon is held, as fractions of the model's length (x, along the barrel) and height (z), with y in
// game units (left is +): where the right hand grips, where the left hand supports it (null: one hand), and
// where the magazine comes out for a reload. Weapon models are centred, barrel along +x, grip down.
export const HOLDS = {
  crowbar: { right: [-0.3, 0, 0], left: null, melee: true, spin: Math.PI }, // spin: turned about its length (claw forward)
  knife: { right: [-0.3, 0, 0], left: null, melee: true },
  bat: { right: [-0.36, 0, 0], left: null, melee: true },
  katana: { right: [-0.36, 0, 0], left: null, melee: true },
  axe: { right: [-0.3, 0, 0], left: null, melee: true },
  sledge: { right: [-0.3, 0, 0], left: null, melee: true },
  machete: { right: [-0.32, 0, 0], left: null, melee: true },
  pan: { right: [-0.3, 0, 0], left: null, melee: true },
  golf: { right: [-0.38, 0, 0], left: null, melee: true },
  wrench: { right: [-0.3, 0, 0], left: null, melee: true },
  shovel: { right: [-0.34, 0, 0], left: null, melee: true },
  pistol: { right: [-0.18, 0, -0.42], left: [-0.2, 1.8, -0.48], mag: [-0.2, 0, -0.9], short: true },
  revolver: { right: [-0.22, 0, -0.4], left: [-0.24, 1.8, -0.46], mag: [0.05, 2, 0], short: true, reload: 'cyl' },
  smg: { right: [-0.1, 0, -0.42], left: [0.22, 0, -0.32], mag: [0.02, 0, -0.85] },
  rifle: { right: [-0.08, 0, -0.42], left: [0.2, 0, -0.28], mag: [0.04, 0, -0.85] },
  shotgun: { right: [-0.24, 0, -0.38], left: [0.16, 0, -0.32], mag: [0.05, 0, -0.5], pump: true, reload: 'shell' },
  autoshotgun: { right: [-0.18, 0, -0.4], left: [0.16, 0, -0.3], mag: [0.02, 0, -0.85] },
  sniper: { right: [-0.16, 0, -0.42], left: [0.16, 0, -0.3], mag: [-0.02, 0, -0.8], bolt: true, reload: 'bolt' },
  crossbow: { right: [-0.16, 0, -0.4], left: [0.16, 0, -0.3], mag: [0.3, 0, 0.3], reload: 'xbow' },
  lmg: { right: [-0.14, 0, -0.42], left: [0.12, 0, -0.32], mag: [0.04, 3, -0.6], reload: 'belt' },
  rocket: { right: [-0.02, 0, -0.5], left: [0.2, 0, -0.5], mag: [-0.4, 0, 0], reload: 'tube' },
  railgun: { right: [-0.12, 0, -0.42], left: [0.18, 0, -0.3], mag: [0, 0, -0.8] },
  grenade: { right: [0, 0, 0], left: null },
  flashbang: { right: [0, 0, 0], left: null },
  deagle: { right: [-0.24, 0, -0.42], left: [-0.26, 1.8, -0.5], mag: [-0.3, 0, -0.9], short: true },
  uzi: { right: [-0.06, 0, -0.45], left: [0.12, 1.6, -0.5], mag: [-0.06, 0, -0.95], short: true },
  ak: { right: [-0.12, 0, -0.36], left: [0.24, 0, -0.06], mag: [0.06, 0, -0.75] },
  dmr: { right: [-0.1, 0, -0.38], left: [0.26, 0, -0.04], mag: [0.04, 0, -0.6] },
  double: { right: [-0.18, 0, -0.3], left: [0.1, 0, -0.06], mag: [0.02, 0, 0.3], reload: 'break' },
};
// where a named point of a gun model (gripR, gripL, magHold...) sits in the model's own space, or null
export function markerAt(model, name) {
  const o = model?.getObjectByName(name);
  if (!o) return null;
  const v = o.position.clone();
  for (let p = o.parent; p && p !== model; p = p.parent) { p.updateMatrix(); v.applyMatrix4(p.matrix); }
  return v;
}
// a hold's grip points in the weapon's own space, for a model of this size. A model that names its own hand
// points (gripR, gripL and where the support hand goes to reload) uses those: hands sit right on the grip.
export function holdPoints(slot, size, model) {
  const H = HOLDS[slot] || HOLDS.rifle;
  const pt = (p) => (p ? [p[0] * size.x, p[1], p[2] * size.z] : null);
  const out = { ...H, right: pt(H.right), left: pt(H.left), mag: pt(H.mag || [0, 0, -0.8]) };
  if (model && !H.melee) {
    const r = markerAt(model, 'gripR'), l = markerAt(model, 'gripL');
    const m = ['magHold', 'port', 'cylHold', 'breech', 'rocketHold', 'rack'].map((n) => markerAt(model, n)).find(Boolean);
    if (r) out.right = r.toArray();
    if (l) out.left = l.toArray();
    if (m) out.mag = m.toArray();
  }
  return out;
}

// two-bone arm IK: point the upper arm and forearm (both 12 long, hanging along -z) so the hand reaches `target`
// (in the shoulder's parent space). The elbow bends toward `pole` (down, out and back).
const DOWN = new THREE.Vector3(0, 0, -1);
const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _n = new THREE.Vector3(), _e = new THREE.Vector3(), _q = new THREE.Quaternion();
export function reachArm(upper, fore, shoulder, target, side, L1 = 12, L2 = 12) {
  _v.copy(target).sub(shoulder);
  const D = Math.max(3, Math.min(L1 + L2 - 0.3, _v.length()));
  _t.copy(_v).normalize();
  _n.set(-0.35, side * 0.55, -1).normalize(); // the pole
  _n.crossVectors(_t, _n);
  if (_n.lengthSq() < 1e-6) _n.set(0, side, 0);
  _n.normalize();
  const a = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + D * D - L2 * L2) / (2 * L1 * D))));
  _e.copy(_t).applyAxisAngle(_n, a); // the upper arm's direction
  upper.quaternion.setFromUnitVectors(DOWN, _e);
  // the forearm, from the elbow to the hand, in the upper arm's own space
  _t.copy(_v).normalize().multiplyScalar(D).sub(_e.multiplyScalar(L1)).normalize();
  _q.copy(upper.quaternion).invert();
  fore.quaternion.setFromUnitVectors(DOWN, _t.applyQuaternion(_q));
}

export function headGroup(model, mats) {
  const g = new THREE.Group();
  for (const [mat, geo] of template(model).head) {
    const m = new THREE.Mesh(geo, mats[mat]);
    m.castShadow = true;
    g.add(m);
  }
  return g;
}

// ------------------------------------------------------------------ cosmetics
// where hats sit (top of each character's head) and back items hang (behind each character's back)
const HEAD_TOP = [14.2, 14.2, 14.4, 15.2];
const BACK_X = [-13.8, -9.2, -13.4, -9.8];
const cosMats = new Map();
function cmat(color, rough = 0.6, metal = 0, glow = 0) {
  const key = [color, rough, metal, glow, isPotato()].join();
  if (!cosMats.has(key)) {
    const c = new THREE.Color(color);
    cosMats.set(key, isPotato()
      ? new THREE.MeshLambertMaterial({ color: c, emissive: glow ? c : 0x000000, emissiveIntensity: glow })
      : new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal, emissive: glow ? c : 0x000000, emissiveIntensity: glow }));
  }
  return cosMats.get(key);
}
const halfSphere = (r) => new THREE.SphereGeometry(r, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2).applyMatrix4(RX); // dome up +Z

// writing on a cosmetic (the admin hat, the mod visor, the GOATED cape)
const TEXT_MATS = new Map();
function textMat(text, bg, fg, w = 512, h = 128, glow = 0) {
  const key = text + bg + fg + w;
  if (TEXT_MATS.has(key)) return TEXT_MATS.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  let size = h * 0.7;
  do { x.font = `900 ${size}px Inter, system-ui, sans-serif`; size -= 2; } while (x.measureText(text).width > w * 0.94 && size > 8);
  x.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, emissive: glow ? 0xffffff : 0, emissiveMap: glow ? t : null, emissiveIntensity: glow });
  TEXT_MATS.set(key, m);
  return m;
}

// a hat on the head group (origin at the neck, head centre about 7 up, ht = top of the head; mats: the
// wearer's suit materials, so helmets match the suit); returns the pieces that animate
function buildHat(id, ht, g, mats) {
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m; };
  const anim = {};
  if (id === 'helmet_visor') {
    add(at(halfSphere(8), 0, 0, 10.1, 0, 0, 0, 1.04, 1, 0.8), mats.suit);
    add(at(new THREE.TorusGeometry(7.9, 1, 8, 24), 0, 0, 10.2, 0, 0, 0, 1.04, 1, 1), mats.pad);
    add(at(cyl(0.5, 0.6, 7, 6), -2, 5.4, 16), mats.dark); // antenna
  } else if (id === 'helmet_combat') {
    add(at(halfSphere(8.2), 0, 0, 10.2, 0, 0, 0, 1.06, 1, 0.72), mats.armor);
    add(at(new THREE.TorusGeometry(8.1, 0.9, 6, 24), 0, 0, 10.3, 0, 0, 0, 1.06, 1, 1), mats.armor);
    add(at(rbox(1.2, 3, 4, 0.5), 7.9, 0, 12.6), mats.dark); // night-vision mount
  } else if (id === 'helmet_heavy') {
    add(at(rbox(8, 15.8, 12, 3.5), -3.2, 0, 9), mats.armor); // back and sides
    add(at(rbox(13.5, 15.6, 3.6, 1.6), 0.4, 0, 14.6), mats.armor); // brow plate
    for (const s of [-1, 1]) add(at(rbox(6, 1.8, 4.6, 0.8), 2.2, s * 7.2, 3.6), mats.armor); // cheek guards, under the visor
    add(at(rbox(11, 2.4, 2.4, 1), -0.8, 0, 16.8), mats.pad); // crest
  } else if (id === 'cap') {
    add(at(halfSphere(7.7), 0, 0, ht - 5.2, 0, 0, 0, 1, 1, 0.75), cmat('#c8302a', 0.8));
    add(at(rbox(6.5, 9.5, 0.8, 0.35), 8, 0, ht - 5.1, 0, -0.12), cmat('#c8302a', 0.8));
    add(at(sph(0.9, 8, 6), 0, 0, ht + 0.6), cmat('#c8302a', 0.8));
  } else if (id === 'beanie') {
    add(at(halfSphere(7.9), 0, 0, ht - 4.6, 0, 0, 0, 1, 1, 0.9), cmat('#2f6f9a', 0.95));
    add(at(new THREE.TorusGeometry(7.6, 1.3, 8, 24), 0, 0, ht - 4.4), cmat('#e8e2d0', 0.95));
    add(at(sph(2.2, 10, 8), 0, 0, ht + 2.8), cmat('#e8e2d0', 0.95));
  } else if (id === 'headphones') {
    const band = new THREE.TorusGeometry(8.3, 0.8, 8, 24, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
    add(at(band, 0, 0, ht - 6.5), cmat('#1b1b1f', 0.4, 0.3));
    for (const s of [-1, 1]) {
      add(at(new THREE.CylinderGeometry(3.3, 3.3, 2.6, 16), 0, s * 8.2, ht - 7), cmat('#1b1b1f', 0.4, 0.3));
      add(at(new THREE.CylinderGeometry(2.2, 2.2, 2.7, 16), 0, s * 8.25, ht - 7), cmat('#3cf0ff', 0.3, 0, 1.5));
    }
  } else if (id === 'party') {
    add(at(cyl(0.2, 5, 12, 16), 0, 0, ht + 4.5, 0, -0.15), cmat('#ff4fa8', 0.6));
    add(at(new THREE.TorusGeometry(3.4, 0.5, 6, 18), -0.4, 0, ht + 1.6, 0, -0.15), cmat('#ffd23a', 0.6));
    add(at(sph(1.7, 10, 8), 1.6, 0, ht + 10.4), cmat('#ffd23a', 0.6));
  } else if (id === 'cone') {
    add(at(rbox(13, 13, 1.5, 0.5), 0, 0, ht - 0.6), cmat('#ff6a10', 0.7));
    add(at(cyl(1, 5.6, 14, 18), 0, 0, ht + 6.5), cmat('#ff6a10', 0.7));
    add(at(cyl(3.2, 4.1, 2.6, 18), 0, 0, ht + 6.4, 0, 0, 0, 1.03, 1.03, 1), cmat('#f4f4f4', 0.5));
  } else if (id === 'horns') {
    for (const s of [-1, 1]) {
      add(at(cyl(0, 1.9, 9, 10), 0.5, s * 5.6, ht + 0.8, -0.65 * s, -0.2), cmat('#efe4c8', 0.5));
      add(at(cyl(1.9, 2.2, 1.6, 10), -0.2, s * 4.3, ht - 2.6, -0.65 * s, -0.2), cmat('#5a3a22', 0.8));
    }
  } else if (id === 'tophat') {
    add(at(cyl(9, 9, 0.8, 24), 0, 0, ht - 0.8), cmat('#121214', 0.5));
    add(at(cyl(5.6, 5.4, 11, 24), 0, 0, ht + 4.8), cmat('#121214', 0.5));
    add(at(cyl(5.55, 5.55, 1.8, 24), 0, 0, ht + 0.6, 0, 0, 0, 1.01, 1.01, 1), cmat('#a8201a', 0.6));
  } else if (id === 'halo') {
    anim.halo = add(at(new THREE.TorusGeometry(6, 0.75, 8, 32), 0, 0, 0), cmat('#ffd86a', 0.3, 0.5, 2.2));
    anim.halo.position.z = ht + 5;
  } else if (id === 'admin_hat') {
    // a red officer's cap with a gold band and an ADMIN badge on the front
    add(at(cyl(7.2, 7.8, 4.2, 24), 0, 0, ht + 1), cmat('#b3161c', 0.5));
    add(at(cyl(8, 8, 1.2, 24), 0, 0, ht - 0.8), cmat('#e8b021', 0.3, 1));
    add(at(rbox(5, 9, 0.8, 0.3), 5.2, 0, ht - 1.2, 0, 0.25, 0), cmat('#151515', 0.4)); // the peak
    add(at(new THREE.PlaneGeometry(8, 2.2).rotateY(Math.PI / 2).rotateX(Math.PI / 2), 7.85, 0, ht + 1.2), textMat('ADMIN', '#b3161c', '#ffd23a', 256, 64, 0.6));
  } else if (id === 'mod_visor') {
    // a band round the head with the message scrolling all the way round
    const band = new THREE.CylinderGeometry(8.4, 8.4, 3.4, 40, 1, true).rotateX(Math.PI / 2);
    add(at(band, 0, 0, 8), textMat('(You could NEVER guess it, MOD.)  ★  ', '#101820', '#5ff2ff', 1024, 64, 1.2)).material.side = THREE.DoubleSide;
  } else if (id === 'maska') {
    // a heavy steel dome with a flat armoured face plate across the front, an eye slit cut through it (the
    // visor's glow shows through), pivot bolts at the sides
    const steel = cmat('#4a4f4b', 0.55, 0.55), dark = cmat('#232624', 0.6, 0.4);
    add(at(halfSphere(8.9), 0, 0, 8.4, 0, 0, 0, 1.06, 1.02, 1.08), steel); // the dome
    add(at(new THREE.TorusGeometry(8.9, 0.6, 8, 28), 0, 0, 8.6, 0, 0, 0, 1.06, 1.02, 1), steel); // the rim
    add(at(cyl(8.6, 8.9, 5.2, 24), 0, 0, 6, 0, 0, 0, 1.06, 1.02, 1), steel); // down over the ears and the back
    const plate = (h, z) => new THREE.CylinderGeometry(9.8, 9.8, h, 20, 1, true, Math.PI / 2 - 1.05, 2.1).rotateX(Math.PI / 2).translate(0, 0, z);
    add(plate(5.4, 11.3), steel).material.side = THREE.DoubleSide; // the plate above the slit
    add(plate(6.4, 4.1), steel); // and below it
    for (const s of [-1, 1]) {
      add(at(cyl(1.1, 1.1, 0.8, 12), 0.5, s * 9.6, 9, Math.PI / 2), dark); // pivot bolts
      add(at(rbox(1.2, 0.8, 9, 0.3), 4.6, s * 8.6, 7.6, 0, 0, s * 0.5), steel); // the plate's side arms
    }
    for (const y of [-2.2, 2.2]) add(at(sph(0.32, 8, 6), 9.85, y, 12.8), dark); // rivets
  } else if (id === 'crown') {
    const gold = cmat('#e8b021', 0.25, 1);
    add(at(cyl(6.3, 6.3, 3.6, 24), 0, 0, ht + 0.4), gold);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      add(at(cyl(0, 1.5, 4, 8), Math.cos(a) * 5.6, Math.sin(a) * 5.6, ht + 4), gold);
      add(at(sph(0.9, 8, 6), Math.cos(a + 0.52) * 6.3, Math.sin(a + 0.52) * 6.3, ht + 0.4), cmat(i % 2 ? '#2a6aff' : '#ff2a4a', 0.2, 0, 1.2));
    }
  }
  return anim;
}

// a back item on the torso group (origin at the waist, bx = just behind the back)
function buildBack(id, bx, g, img) {
  const add = (geo, mat, parent = g) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; parent.add(m); return m; };
  const group = (x, y, z) => { const p = new THREE.Group(); p.position.set(x, y, z); g.add(p); return p; };
  const anim = {};
  if (id === 'cape') {
    const pivot = group(bx + 1, 0, 21);
    add(at(rbox(0.8, 19, 34, 0.35), -0.5, 0, -16), cmat('#8a1420', 0.9), pivot);
    add(at(rbox(1, 20, 2, 0.4), -0.5, 0, -0.5), cmat('#d8b030', 0.4, 0.8), pivot);
    anim.cape = pivot;
  } else if (id === 'owner_cape') {
    const pivot = group(bx + 1, 0, 21);
    add(at(rbox(0.9, 21, 38, 0.4), -0.5, 0, -18), cmat('#3a0f6a', 0.55, 0.1), pivot);
    add(at(rbox(1.1, 22, 2.4, 0.5), -0.5, 0, -0.6), cmat('#ffcc33', 0.25, 1, 0.6), pivot); // gold collar
    add(at(rbox(1.1, 22, 1.4, 0.4), -0.5, 0, -36.6), cmat('#ffcc33', 0.25, 1, 0.9), pivot); // glowing hem
    for (const s of [-1, 1]) add(at(rbox(1.05, 1.2, 36, 0.4), -0.5, s * 10.4, -18), cmat('#ffcc33', 0.25, 1, 0.9), pivot); // edges
    add(at(rbox(1.2, 6, 6, 0.5), -1, 0, -12, Math.PI / 4), cmat('#ffcc33', 0.2, 1, 1.4), pivot); // crest
    add(at(sph(1.4, 10, 8), -1.6, 0, -12), cmat('#ff3060', 0.2, 0, 2), pivot); // jewel
    anim.cape = pivot;
  } else if (id === 'goated_cape') {
    // the co-owner's cape: black and gold with GOATED across it
    const pivot = group(bx + 1, 0, 21);
    add(at(rbox(0.9, 21, 38, 0.4), -0.5, 0, -18), cmat('#111111', 0.5, 0.2), pivot);
    add(at(rbox(1.1, 22, 2.4, 0.5), -0.5, 0, -0.6), cmat('#ffcc33', 0.25, 1, 0.6), pivot);
    add(at(rbox(1.1, 22, 1.4, 0.4), -0.5, 0, -36.6), cmat('#ffcc33', 0.25, 1, 0.9), pivot);
    add(at(new THREE.PlaneGeometry(19, 6).rotateY(-Math.PI / 2).rotateX(-Math.PI / 2).rotateX(Math.PI / 2), -1.05, 0, -14), textMat('GOATED', '#111111', '#ffcc33', 512, 160, 0.8), pivot);
    anim.cape = pivot;
  } else if (id === 'image_cape') {
    // a dark cape with the picture on its back
    const pivot = group(bx + 1, 0, 21);
    add(at(rbox(0.8, 20, 35, 0.35), -0.5, 0, -16.5), cmat('#1b1b1f', 0.85), pivot);
    add(at(rbox(1, 21, 2, 0.4), -0.5, 0, -0.5), cmat('#c8ccd2', 0.35, 0.8), pivot);
    add(at(new THREE.PlaneGeometry(18, 30).rotateX(Math.PI / 2).rotateZ(-Math.PI / 2), -1.05, 0, -17), imageMat(img, 256, 420), pivot);
    anim.cape = pivot;
  } else if (id === 'image_flag') {
    // a pole on the back flying the picture
    add(at(cyl(0.5, 0.5, 46, 8), bx - 1, 3, 28), cmat('#2b2b2e', 0.4, 0.6));
    add(at(sph(1, 8, 6), bx - 1, 3, 51.5), cmat('#d8b030', 0.3, 1));
    const flag = group(bx - 1, 3, 50);
    add(at(new THREE.PlaneGeometry(20, 13).rotateX(Math.PI / 2).rotateZ(-Math.PI / 2), 0, 10.5, -7), imageMat(img, 300, 196), flag);
    anim.flag = flag;
  } else if (id === 'banner') {
    add(at(cyl(0.5, 0.5, 42, 8), bx - 1, 3, 26), cmat('#2b2b2e', 0.4, 0.6));
    const flag = group(bx - 1, 3, 44);
    add(at(rbox(0.5, 13, 9, 0.2), 0, 6.8, -4.5), cmat('#ffd23a', 0.8), flag);
    add(at(rbox(0.6, 5, 3, 0.2), 0, 6.8, -4.5), cmat('#1b1b1f', 0.8), flag);
    anim.flag = flag;
  } else if (id === 'jetpack') {
    const metal = cmat('#9aa0a8', 0.3, 0.9);
    add(at(rbox(3, 6, 10, 1), bx + 0.5, 0, 13), cmat('#2b2b2e', 0.5, 0.4));
    const flame = group(0, 0, 0);
    for (const s of [-1, 1]) {
      add(at(cyl(3, 3, 14, 16), bx - 2.5, s * 4, 13), metal);
      add(at(sph(3, 14, 8), bx - 2.5, s * 4, 20), metal);
      add(at(cyl(2.2, 3, 3, 14), bx - 2.5, s * 4, 4.5), cmat('#2b2b2e', 0.5, 0.4));
      add(at(cyl(2.4, 0.1, 9, 12), bx - 2.5, s * 4, -1.5), cmat('#ff8a20', 0.5, 0, 3), flame);
    }
    anim.flame = flame;
  } else if (id === 'wings') {
    anim.wings = [];
    for (const s of [-1, 1]) {
      const w = group(bx - 0.5, s * 3, 19);
      for (let i = 0; i < 5; i++) {
        const L = 20 - i * 2.6;
        add(at(at(rbox(0.8, 3.6, L, 0.4), 0, 0, L / 2), 0, 0, 0, -s * (0.45 + i * 0.32)), cmat('#f6f2ea', 0.7, 0, 0.15), w);
      }
      anim.wings.push({ w, s });
    }
  }
  return anim;
}

// what makes a zombie look dead: glowing eyes behind a broken visor, a torn-open jaw, ribs through a hole in
// the chest, a bone through one forearm and rags hanging off the waist (model 0's shape, which zombies use)
function buildZombie(av) {
  const M = av.matSet;
  const add = (group, geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; group.add(m); return m; };
  for (const s of [-1, 1]) add(av.head, at(sph(1.15, 10, 8), 7.6, s * 2.6, 7.9), M.eye);
  add(av.head, at(rbox(3.6, 6, 2.2, 0.6), 6, 0, 3.2, 0, 0.25), M.flesh); // open, bloody jaw
  for (let i = 0; i < 4; i++) add(av.head, at(rbox(0.8, 0.9, 1.2, 0.2), 7.6, -1.6 + i * 1.05, 4.1), M.bone); // teeth
  add(av.torso, at(rbox(1.6, 7.5, 10, 0.6), 6.2, 3.6, 12.5), M.flesh); // hole in the chest
  for (let i = 0; i < 4; i++) add(av.torso, at(rbox(1, 7.8, 0.9, 0.35), 6.9, 3.6, 8.8 + i * 2.4, 0.08 * (i - 1.5)), M.bone); // ribs
  const fore = av.arms[1].fore;
  add(fore, at(cyl(0.8, 0.7, 7, 8), 2.2, 0, -6, 0, 0.35), M.bone); // bone through the forearm
  add(fore, at(cyl(2.9, 2.9, 1.6, 10), 0.6, 0, -4.6), M.flesh);
  for (const [y, len, tilt] of [[-5, 10, 0.15], [-1, 7, -0.1], [4, 12, 0.1], [7, 8, -0.2]]) {
    add(av.hips, at(rbox(0.6, 2.6, len, 0.25), 5.4, y, -2 - len / 2, tilt, 0.1), M.pad); // rags at the front
    add(av.hips, at(rbox(0.6, 2.4, len * 0.8, 0.25), -5.4, -y, -2 - len * 0.4, -tilt, -0.1), M.pad); // and the back
  }
  for (const s of [-1, 1]) add(av.legs[s > 0 ? 1 : 0].knee, at(rbox(4.2, 5.5, 3, 0.8), 0.8, 0, -4, 0.2 * s), M.flesh); // torn knees
}

export class Avatar {
  constructor(colorIndex, model = 0, cos = {}) {
    this.model = model;
    const mats = (this.matSet = avatarMaterials(colorIndex));
    // a suit skin from the shop: the suit, padding and armour in its finish (the rest stays as it is)
    const skin = colorIndex !== ZOMBIE_SKIN && COSMETIC[cos?.skin]?.slot === 'skin' && COSMETIC[cos.skin].finish;
    if (skin) {
      for (const [part, dim] of [['suit', 1], ['pad', 0.62], ['armor', 0.45]]) {
        mats[part].dispose();
        mats[part] = finishMaterial(skin, 0.45, dim);
      }
    }
    this.mats = [mats.suit, ...Object.values(mats).filter((m) => m !== mats.suit)]; // [0] is the suit (powerup glow)
    const T = template(model);
    const fill = (group, part) => {
      for (const [mat, geo] of T[part] || []) {
        const m = new THREE.Mesh(geo, mats[mat]);
        m.castShadow = true;
        group.add(m);
      }
      return group;
    };
    const G = (part, x = 0, y = 0, z = 0) => { const g = fill(new THREE.Group(), part); g.position.set(x, y, z); return g; };

    this.root = new THREE.Group();
    this.root.matrixAutoUpdate = false;
    this.hips = G('hips');
    this.root.add(this.hips);
    // torso pivots at the waist so it can lean with aim pitch
    this.torso = G('torso', 0, 0, 4);
    this.hips.add(this.torso);
    this.head = G('head', 0, 0, 22);
    this.torso.add(this.head);

    // arms reach forward to hold the weapon
    this.arms = [];
    for (const i of [0, 1]) {
      const s = i ? 1 : -1;
      const sh = G('sh' + i, 0, s * 11, 19);
      this.torso.add(sh);
      const upper = G('up' + i);
      sh.add(upper);
      const fore = G('fore' + i, 0, 0, -12);
      upper.add(fore);
      this.arms.push({ sh, upper, fore, s });
    }
    this.hand = new THREE.Group(); // weapon mount, follows the torso
    this.hand.position.set(15, -5, 14);
    this.torso.add(this.hand);

    this.legs = [];
    for (const i of [0, 1]) {
      const s = i ? 1 : -1;
      const hip = G('thigh' + i, 0, s * 5, -3);
      this.hips.add(hip);
      const knee = G('shin' + i, 0, 0, -18);
      hip.add(knee);
      const foot = G('foot' + i, 0, 0, -15.5);
      knee.add(foot);
      this.legs.push({ hip, knee, foot, s });
    }
    this.phase = 0;
    this.hipHeight = 38;
    this.breath = Math.random() * 6;
    // one-off motions, each a timer counting down: recoil, reload, flinch, landing, zombie punch
    this.kick = 0;
    this.reloadT = 0;
    this.reloadDur = 1;
    this.flinchT = 0;
    this.landT = 0;
    this.punchT = 0;
    this.punchArm = 1;
    this.wasGround = true;
    this.twitchAt = 2 + Math.random() * 3;
    this.twitch = 0;
    this.zombie = colorIndex === ZOMBIE_SKIN;
    if (this.zombie) buildZombie(this);
    else this.wear(cos);
  }

  // put on cosmetics: { hat, back, glow } of catalogue ids
  wear(cos = {}) {
    this.cos = {};
    const ok = (slot) => (COSMETIC[cos?.[slot]]?.slot === slot ? cos[slot] : null);
    if (ok('hat')) Object.assign(this.cos, buildHat(cos.hat, HEAD_TOP[this.model] ?? 14, this.head, this.matSet));
    if (ok('back')) Object.assign(this.cos, buildBack(cos.back, BACK_X[this.model] ?? -12, this.torso, cos.img));
    if (ok('body') && cos.body === 'big_butt') {
      // two big round cheeks on the back of the hips, in the suit's own material, that jiggle as you move
      const g = new THREE.Group();
      g.position.set(-5.2, 0, -1.5);
      for (const s of [-1, 1]) {
        const m = new THREE.Mesh(at(sph(6.2, 20, 14), -1.2, s * 4.3, 0, 0, 0, 0, 1, 0.92, 1.08), this.matSet.suit);
        m.castShadow = true;
        g.add(m);
      }
      this.hips.add(g);
      this.cos.butt = g;
    }
    const glow = ok('glow') && COSMETIC[cos.glow].color;
    if (glow === 'rainbow') this.cos.rainbow = true;
    else if (glow) this.matSet.visor.emissive.set(glow);
  }

  // what's in the hand: a hold from HOLDS (null: nothing). offset: where the model sits in the hand mount;
  // model: the gun, for its own hand points
  setHold(slot, size, offset = 4, model = null) {
    if (!slot || !size) { this.grips = null; return; }
    const H = holdPoints(slot, size, model);
    const off = (p) => (p ? new THREE.Vector3(p[0] + offset, p[1], p[2]) : null);
    this.grips = { ...H, right: off(H.right), left: off(H.left), mag: off(H.mag) };
    this.weaponLen = size.x;
  }

  // ---------------------------------------------------------------- one-off motions (from game events)
  fire() { this.kick = 1; this.pumpT = this.grips?.pump || this.grips?.bolt ? 0.5 : 0; }
  reload(dur = 1.4) { this.reloadT = this.reloadDur = Math.max(0.4, dur); }
  flinch() { this.flinchT = 0.28; }
  // zombies (and fists): a punch with the other arm each time
  punch() { this.punchT = 0.45; this.punchArm = -this.punchArm; }

  // an emote (an id from EMOTES, or null to stop): the dance takes over the whole body and the gun is put away
  setEmote(id) {
    id = id || null;
    if (id === this.emote) return;
    if (this.emote) clearPose(this);
    this.emote = id;
    this.emoteT = 0;
    this.hand.visible = !id;
  }

  // sitting in a vehicle. st.sit: { wheel (hands on the wheel or bars), steer (-1..1), bike, look (head turn) }
  sitPose(dt, S) {
    this.breath += dt * 1.6;
    this.hips.position.set(0, 0, 5 + Math.sin(this.breath) * 0.15);
    this.hips.rotation.set(0, 0, 0);
    for (const L of this.legs) {
      L.hip.rotation.y = S.bike ? -1.25 : -1.5;
      L.hip.rotation.x = L.s * (S.bike ? 0.28 : 0.1);
      L.knee.rotation.y = S.bike ? 1.7 : 1.45;
      L.foot.rotation.y = S.bike ? -0.45 : 0.05;
      L.foot.rotation.x = 0;
    }
    this.torso.rotation.set(0, S.bike ? 0.35 : -0.12, -S.steer * 0.08);
    this.head.rotation.set(0, S.bike ? -0.25 : 0.08 + Math.sin(this.breath) * 0.01, (S.look || 0) - S.steer * 0.15);
    for (const A of this.arms) {
      if (S.wheel) {
        // both hands on the wheel, turning with it
        A.upper.rotation.y = S.bike ? -1.25 : -1.0;
        A.upper.rotation.x = A.s * -0.22 + S.steer * 0.35 * (S.bike ? 0.5 : 1);
        A.fore.rotation.y = S.bike ? -0.35 : -0.75;
      } else {
        // a passenger: hands in the lap
        A.upper.rotation.y = -0.45;
        A.upper.rotation.x = A.s * -0.1;
        A.fore.rotation.y = -1.25;
      }
    }
  }

  // state: { speed, fwdSpeed, sideSpeed, ground, ducked, pitch (deg, + = down), alive, vz }
  animate(dt, st) {
    if (st.sit) return this.sitPose(dt, st.sit);
    // a slide: crouched and going fast on the ground
    this.slideK = (this.slideK || 0) + ((st.ducked && st.ground && st.speed > 180 ? 1 : 0) - (this.slideK || 0)) * Math.min(1, dt * 12);
    if (this.emote) {
      this.emoteT += dt;
      this.breath += dt * 1.6;
      if (emotePose(this, this.emote, this.emoteT)) return this.animCos(dt, st, 0, false);
      this.setEmote(null); // a one-off has finished
    }
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const run = Math.min(1, st.speed / 280);
    const moving = st.ground && st.speed > 10;
    // which way we're going relative to facing: forward/back and right/left, each -1..1
    const dirF = moving ? clamp(st.fwdSpeed / Math.max(1, st.speed), -1, 1) : 0;
    const dirS = moving ? clamp(st.sideSpeed / Math.max(1, st.speed), -1, 1) : 0;
    if (moving) this.phase += dt * (st.speed / (st.ducked ? 17 : 24));
    this.breath += dt * 1.6;
    for (const k of ['reloadT', 'flinchT', 'landT', 'punchT']) this[k] = Math.max(0, this[k] - dt);
    this.kick *= Math.exp(-dt * 14);
    if (st.ground && !this.wasGround) this.landT = 0.25; // just landed: a squash
    this.wasGround = st.ground;

    // ---- hips: height, the double dip of each step, side to side weight shift, a twist with the stride
    const targetHip = st.ducked ? 22 : 38;
    this.hipHeight += (targetHip - this.hipHeight) * Math.min(1, dt * 12);
    const step = Math.sin(this.phase);
    const dip = moving ? (1 - Math.abs(Math.cos(this.phase))) * (0.8 + run * 2.6) : 0;
    const squash = Math.sin((this.landT / 0.25) * Math.PI) * 5;
    this.hips.position.z = this.hipHeight + dip - squash + (moving ? 0 : Math.sin(this.breath) * 0.2);
    this.hips.position.y = moving ? step * (1.2 - run * 0.6) * Math.abs(dirF) : Math.sin(this.breath * 0.31) * 0.7; // weight shift
    this.hips.rotation.x = moving ? step * 0.06 : Math.sin(this.breath * 0.31) * 0.03;
    this.hips.rotation.z = moving ? step * (0.1 + run * 0.08) * dirF : 0;

    // ---- legs: swing the way we're moving (forward, back or sideways), knees lift on the way through,
    // feet stay flat on the ground and roll off the toes
    const swing = moving ? (0.32 + 0.38 * run) * (st.ducked ? 0.65 : 1) : 0;
    for (const L of this.legs) {
      const p = this.phase + (L.s > 0 ? Math.PI : 0);
      const sp = Math.sin(p);
      let thighY = -sp * swing * dirF;
      let thighX = -sp * swing * dirS * 0.75 + (moving ? 0 : L.s * 0.05);
      let knee = moving ? 0.1 + Math.max(0, -Math.cos(p)) * (0.55 + run * 0.9) : 0.06 + (L.s > 0 ? Math.max(0, Math.sin(this.breath * 0.31)) * 0.12 : 0);
      if (st.ducked) { thighY -= 1.05; knee += 1.65; }
      if (!st.ground) {
        // rising: legs tucked; falling: reaching down for the landing
        const falling = (st.vz ?? 0) < -100;
        thighY = falling ? -0.35 + L.s * 0.1 : -0.85 + L.s * 0.2;
        knee = falling ? 0.45 : 1.25;
        thighX = L.s * 0.06;
      }
      knee += squash * 0.12;
      thighY -= squash * 0.06;
      L.hip.rotation.y = thighY;
      L.hip.rotation.x = thighX;
      L.knee.rotation.y = knee;
      const toeOff = moving ? Math.max(0, sp * Math.sign(dirF || 1)) * 0.35 * (0.4 + run) : 0;
      L.foot.rotation.y = -(thighY + knee) + (st.ground ? -toeOff : 0.35);
      L.foot.rotation.x = -thighX;
    }

    // ---- upper body: lean into the run, counter-twist against the hips, aim up and down
    const aim = clamp((st.pitch * Math.PI) / 180, -1.2, 1.2);
    const r = this.reloadT > 0 ? Math.sin((1 - this.reloadT / this.reloadDur) * Math.PI) : 0;
    const fl = Math.sin((this.flinchT / 0.28) * Math.PI);
    this.torso.rotation.y = aim * 0.55 + run * dirF * 0.22 + (st.ducked ? 0.25 : 0) + Math.sin(this.breath) * 0.015 - this.kick * 0.06 + r * 0.12 - fl * 0.25;
    this.torso.rotation.x = -dirS * run * 0.14 + (moving ? -step * 0.03 : 0);
    // a real sprint: lean well into it, head up to see where you're going
    const sprint = moving && st.ground ? Math.max(0, Math.min(1, (st.speed - 300) / 90)) * Math.max(0, dirF) : 0;
    this.torso.rotation.y += sprint * 0.22;
    this.head.rotation.y -= sprint * 0.18;
    this.torso.rotation.z = -this.hips.rotation.z * 2.1;
    this.head.rotation.y = aim * 0.45 - this.torso.rotation.y * 0.25 + fl * 0.3;
    this.head.rotation.z = -this.torso.rotation.z * 0.4;
    this.head.rotation.x = -this.torso.rotation.x * 0.5;

    // ---- arms: both hands on the weapon (IK), or the old fixed pose for anything without a hold
    this.pumpT = Math.max(0, (this.pumpT || 0) - dt);
    if (this.grips && !this.unarmed && !this.zombie) this.holdWeapon(st, moving, run, r);
    else for (const A of this.arms) {
      const lead = A.s > 0; // the left hand supports the barrel and does the reloading
      A.upper.rotation.y = -1.25 + this.kick * 0.35 + (moving ? Math.sin(this.phase * 2) * 0.05 * run : 0) + (lead ? r * 0.95 : r * 0.15);
      A.upper.rotation.x = (lead ? -0.35 : 0.5) + (lead ? r * 0.3 : 0);
      A.fore.rotation.y = -0.55 - this.kick * 0.15 - (lead ? r * 0.7 : 0);
      if (!st.ground && !this.zombie) A.upper.rotation.y -= 0.12; // arms come up a little in the air
    }
    // fists (no weapon): a guard, and punches
    if (this.unarmed && !this.zombie) this.fists(st, moving, run);

    if (this.zombie) this.shamble(dt, st, moving, run, dirF);
    if (this.slideK > 0.01) this.slidePose(this.slideK);
    this.animCos(dt, st, run, moving);
  }

  // cosmetics that move: capes and flags in the wind, jetpack flames, the halo, wings, the rainbow visor
  animCos(dt, st, run, moving) {
    const C = this.cos || {};
    if (C.cape) C.cape.rotation.y = 0.12 + run * 0.75 + (moving ? Math.sin(this.phase * 2) * 0.05 : Math.sin(this.breath) * 0.02) + (st.ground ? 0 : 0.5);
    if (C.flag) C.flag.rotation.z = Math.sin(this.breath * 2.2) * 0.15 + run * 0.3;
    if (C.flame) { C.flame.visible = !st.ground; C.flame.scale.z = 0.8 + Math.random() * 0.4; }
    if (C.halo) { C.halo.position.z = HEAD_TOP[this.model] + 5 + Math.sin(this.breath * 1.5) * 0.6; C.halo.rotation.z += dt; }
    if (C.wings) for (const { w, s } of C.wings) w.rotation.x = s * (st.ground ? Math.sin(this.breath) * 0.04 : Math.sin(this.breath * 6) * 0.3);
    if (C.rainbow) this.matSet.visor.emissive.setHSL((this.breath * 0.08) % 1, 1, 0.55);
    if (C.butt) {
      const j = Math.sin(this.phase * 2 + 0.6) * (moving ? 0.07 * (0.5 + run) : 0) + Math.sin(this.breath * 3) * 0.01;
      C.butt.scale.set(1 - j * 0.5, 1 + j * 0.3, 1 + j);
    }
  }

  // sliding (blended in by k): hips down near the ground, leaning back, the front leg out straight and the
  // back one folded under
  slidePose(k) {
    this.hips.position.z += (14 - this.hips.position.z) * k;
    this.hips.rotation.y += (-0.35 - this.hips.rotation.y) * k;
    this.hips.rotation.z *= 1 - k;
    this.torso.rotation.y += (-0.1 - this.torso.rotation.y) * k * 0.6;
    const [R, L] = this.legs;
    const mixTo = (o, x, y, z) => { o.rotation.x += (x - o.rotation.x) * k; o.rotation.y += (y - o.rotation.y) * k; o.rotation.z += (z - o.rotation.z) * k; };
    mixTo(L.hip, 0.08, -1.2, 0); mixTo(L.knee, 0, 0.15, 0); mixTo(L.foot, 0, 1.0, 0);
    mixTo(R.hip, -0.25, -0.15, 0); mixTo(R.knee, 0, 2.1, 0); mixTo(R.foot, 0, -1.6, 0);
  }

  // the weapon in the hands: where it sits (aimed by the torso, kicked by recoil, lowered when sprinting, tipped
  // for a reload; a crowbar upright, chopping when it swings) and both arms reaching for it
  holdWeapon(st, moving, run, r) {
    const G = this.grips, hand = this.hand;
    const bob = moving ? Math.sin(this.phase * 2) * 0.5 * (0.4 + run) : Math.sin(this.breath) * 0.15;
    let px = 15 - this.kick * 2.4, py = -4, pz = 14 + bob - r * 2.5, ry = -this.kick * 0.22 + r * 0.3, rx = -r * 0.45, rz = 0;
    if (G.short) { px = 18 - this.kick * 2; py = -1.5; pz = 16 + bob; } // pistols out in front, both hands
    if (G.melee) {
      // the crowbar upright in the right hand; a swing is a chop from over the shoulder
      const k = this.punchT > 0 ? 1 - this.punchT / 0.45 : 1;
      const up = k < 0.25 ? k / 0.25 : 1, chop = k < 0.25 ? 0 : Math.sin(Math.min(1, (k - 0.25) / 0.45) * Math.PI);
      px = 13 + chop * 6 - up * 4 * (1 - chop);
      py = -10 + chop * 5;
      pz = 7 + (k < 1 ? up * 9 * (1 - chop) : 0) + bob;
      ry = -1.2 - (k < 1 ? (1 - chop) * up * 0.6 : 0) + chop * 1.7;
      rx = chop * 0.4;
    } else if (run > 0.85 && moving && st.ground) { ry += 0.55; pz -= 2; px -= 2; rz = 0.35; } // sprinting: muzzle down and across
    hand.position.set(px, py, pz);
    hand.rotation.set(rx, ry, rz);
    hand.updateMatrix();
    for (const A of this.arms) {
      const right = A.s < 0;
      let g = right ? G.right : G.left;
      if (!g) {
        // a free left hand: hanging by the side, swinging with the stride
        A.upper.rotation.set(A.s * 0.1, 0.05 + (moving ? -Math.sin(this.phase) * 0.45 * (0.3 + run) : Math.sin(this.breath) * 0.02), 0);
        A.fore.rotation.set(0, -0.25 - (moving ? 0.3 * run : 0), 0);
        continue;
      }
      _v.copy(g);
      // reload: the support hand goes to the magazine, down to the belt, and back
      if (!right && r > 0) _v.lerp(G.mag, Math.min(1, r * 1.6)).add(_n.set(0, 0, -r * 6));
      // pump or bolt after a shot: the support hand slides back
      if (!right && this.pumpT > 0) _v.x -= Math.sin((this.pumpT / 0.5) * Math.PI) * (this.weaponLen || 20) * 0.12;
      _v.applyMatrix4(hand.matrix);
      reachArm(A.upper, A.fore, A.sh.position, _v, A.s);
    }
  }

  // a punch for one arm: wind back, snap out straight, recover. k is 0..1 through the punch.
  punchPose(A, k) {
    const wind = Math.min(1, k / 0.3), strike = k < 0.3 ? 0 : Math.sin(Math.min(1, (k - 0.3) / 0.35) * Math.PI * 0.5) * (k < 0.75 ? 1 : 1 - (k - 0.75) / 0.25);
    A.upper.rotation.y = -0.95 - strike * 0.75 + wind * 0.1;
    A.upper.rotation.x = A.s * (0.25 - strike * 0.3);
    A.fore.rotation.y = -1.7 * (1 - strike) + wind * 0.1;
    return strike;
  }

  // bare fists: a raised guard, alternating punches (melee with no weapon)
  fists(st, moving, run) {
    for (const A of this.arms) {
      A.upper.rotation.y = -0.95 + (moving ? Math.sin(this.phase * 2 + A.s) * 0.06 * run : 0);
      A.upper.rotation.x = A.s * 0.25;
      A.fore.rotation.y = -1.7;
    }
    if (this.punchT > 0) {
      const A = this.arms[this.punchArm > 0 ? 1 : 0];
      const strike = this.punchPose(A, 1 - this.punchT / 0.45);
      this.torso.rotation.z += this.punchArm * strike * 0.3;
    }
  }

  // zombies: hunched, head lolling and twitching, a lurching limp dragging the right leg. Walkers reach out
  // with both arms; runners pump them. They attack with punches.
  shamble(dt, st, moving, run, dirF) {
    const t = this.breath;
    // a sudden twitch of the head every few seconds
    this.twitchAt -= dt;
    if (this.twitchAt <= 0) { this.twitch = 1; this.twitchAt = 2 + Math.random() * 4; }
    this.twitch *= Math.exp(-dt * 9);
    const lurch = moving ? Math.max(0, Math.sin(this.phase)) : 0;
    this.torso.rotation.y += 0.4 + run * 0.3;
    this.torso.rotation.x = Math.sin(t * 0.9) * 0.07 + (moving ? Math.sin(this.phase) * (0.14 - run * 0.06) : 0);
    this.head.rotation.y = -0.3 + Math.sin(t * 0.7) * 0.12 - run * 0.2;
    this.head.rotation.x = 0.3 + Math.sin(t * 0.55) * 0.18 + this.twitch * 0.5;
    this.head.rotation.z = Math.sin(t * 0.4) * 0.15 - this.twitch * 0.3;
    this.hips.position.z -= lurch * 1.6 * (0.6 + run);
    // the right leg drags: a short swing, the toes scraping
    const R = this.legs[0];
    R.hip.rotation.y *= 0.45;
    R.knee.rotation.y = R.knee.rotation.y * 0.4 + 0.12;
    R.foot.rotation.y += 0.35;
    for (const A of this.arms) {
      const sway = Math.sin(t * 1.7 + A.s) * 0.1;
      if (run > 0.6 && moving) {
        // running: arms pumping, out of step with the legs
        const pump = Math.sin(this.phase + (A.s > 0 ? 0 : Math.PI));
        A.upper.rotation.y = -0.9 + pump * 0.75;
        A.upper.rotation.x = A.s * 0.2;
        A.fore.rotation.y = -1.1 - Math.max(0, pump) * 0.4;
      } else {
        A.upper.rotation.y = -1.45 + sway - lurch * 0.08;
        A.upper.rotation.x = A.s * -0.12 + sway * 0.4;
        A.fore.rotation.y = -0.12 + sway * 0.5;
      }
    }
    if (this.punchT > 0) {
      const A = this.arms[this.punchArm > 0 ? 1 : 0];
      const strike = this.punchPose(A, 1 - this.punchT / 0.45);
      this.torso.rotation.z += this.punchArm * strike * 0.4;
      this.torso.rotation.y += strike * 0.15;
    }
  }

  dispose() {
    this.mats.forEach((m) => m.dispose());
  }
}
