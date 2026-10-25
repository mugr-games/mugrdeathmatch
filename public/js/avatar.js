// Original player characters built from shaped primitives and animated procedurally (walk/run cycle,
// crouch, jump tuck, aim pitch). Every character shares one skeleton; the parts on it differ. Each body
// part's pieces are merged into one mesh per material, and the merged shapes are shared by every player
// wearing that character. Units are Source units, Z up, facing +X.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { isPotato } from './shaders.js';
import { COSMETIC } from './cosmetics.js';

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
// add(part, material, geometry). Parts: hips, torso, head, sh0/1 (shoulder), up0/1, fore0/1, thigh0/1, shin0/1.
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
    add('shin' + i, 'dark', at(rbox(10, 6, 4.6, 1.8), 2.6, 0, -16.6)); // boot
    add('shin' + i, 'armor', at(rbox(10.6, 6.5, 1.5, 0.6), 2.7, 0, -18.9)); // sole
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
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        float wv = sin((vObj.x + vObj.y) * ${scale.toFixed(2)}) * sin((vObj.z - vObj.y * .5) * ${scale.toFixed(2)});
        diffuseColor.rgb *= .97 + .03 * wv;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        vec3 wsx = dFdx(-vViewPosition), wsy = dFdy(-vViewPosition);
        vec3 wr1 = cross(wsy, normal), wr2 = cross(normal, wsx);
        float wdet = dot(wsx, wr1) * faceDirection;
        vec2 wdh = vec2(dFdx(wv), dFdy(wv)) * .06;
        normal = normalize(abs(wdet) * normal - sign(wdet) * (wdh.x * wr1 + wdh.y * wr2));`);
  };
  mat.customProgramCacheKey = () => 'fabric' + scale;
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
function buildBack(id, bx, g) {
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
      this.legs.push({ hip, knee, s });
    }
    this.phase = 0;
    this.hipHeight = 38;
    this.breath = Math.random() * 6;
    this.zombie = colorIndex === ZOMBIE_SKIN;
    if (this.zombie) buildZombie(this);
    else this.wear(cos);
  }

  // put on cosmetics: { hat, back, glow } of catalogue ids
  wear(cos = {}) {
    this.cos = {};
    const ok = (slot) => (COSMETIC[cos?.[slot]]?.slot === slot ? cos[slot] : null);
    if (ok('hat')) Object.assign(this.cos, buildHat(cos.hat, HEAD_TOP[this.model] ?? 14, this.head, this.matSet));
    if (ok('back')) Object.assign(this.cos, buildBack(cos.back, BACK_X[this.model] ?? -12, this.torso));
    const glow = ok('glow') && COSMETIC[cos.glow].color;
    if (glow === 'rainbow') this.cos.rainbow = true;
    else if (glow) this.matSet.visor.emissive.set(glow);
  }

  // state: { speed, fwdSpeed, sideSpeed, ground, ducked, pitch (deg, + = down), alive }
  animate(dt, st) {
    const run = Math.min(1, st.speed / 280);
    const moving = st.ground && st.speed > 10;
    if (moving) this.phase += dt * (st.speed / (st.ducked ? 18 : 26));
    this.breath += dt * 1.6;
    const swing = moving ? (0.35 + 0.35 * run) * (st.ducked ? 0.6 : 1) : 0;
    const back = st.fwdSpeed < -10 ? -1 : 1;
    const targetHip = st.ducked ? 22 : 38;
    this.hipHeight += (targetHip - this.hipHeight) * Math.min(1, dt * 12);
    const bounce = moving ? Math.abs(Math.sin(this.phase)) * (1 + run * 2) : Math.sin(this.breath) * 0.25;
    this.hips.position.z = this.hipHeight + bounce;

    for (const L of this.legs) {
      const p = this.phase + (L.s > 0 ? Math.PI : 0);
      let thigh = Math.sin(p) * swing * back;
      let knee = moving ? Math.max(0, -Math.cos(p)) * (0.5 + run * 0.6) : 0.05;
      if (st.ducked) { thigh -= 1.0; knee += 1.6; }
      if (!st.ground) { thigh = -0.7 + L.s * 0.15; knee = 1.1; }
      // rotation about Y in this Z-up, X-forward frame: negative swings the foot forward
      L.hip.rotation.y = thigh;
      L.knee.rotation.y = knee;
      // sidestep: splay legs a little
      L.hip.rotation.x = moving ? Math.sin(p) * Math.max(-0.25, Math.min(0.25, st.sideSpeed / 600)) : L.s * 0.04;
    }

    const aim = Math.max(-1.2, Math.min(1.2, (st.pitch * Math.PI) / 180));
    this.torso.rotation.y = aim * 0.55 + (moving ? 0.08 * run : Math.sin(this.breath) * 0.01) + (st.ducked ? 0.25 : 0);
    this.head.rotation.y = aim * 0.45;
    // the upper body counter-twists against the stride
    this.torso.rotation.z = moving ? Math.sin(this.phase) * (0.05 + 0.04 * run) : 0;
    this.head.rotation.z = -this.torso.rotation.z * 0.7;
    for (const A of this.arms) {
      // both arms hold the weapon forward at chest height
      A.upper.rotation.y = -1.25;
      A.upper.rotation.x = A.s > 0 ? -0.35 : 0.5;
      A.fore.rotation.y = -0.55;
    }

    if (this.zombie) this.shamble(dt, st, moving, run);

    const C = this.cos || {};
    if (C.cape) C.cape.rotation.y = 0.12 + run * 0.75 + (moving ? Math.sin(this.phase * 2) * 0.05 : Math.sin(this.breath) * 0.02) + (st.ground ? 0 : 0.5);
    if (C.flag) C.flag.rotation.z = Math.sin(this.breath * 2.2) * 0.15 + run * 0.3;
    if (C.flame) { C.flame.visible = !st.ground; C.flame.scale.z = 0.8 + Math.random() * 0.4; }
    if (C.halo) { C.halo.position.z = HEAD_TOP[this.model] + 5 + Math.sin(this.breath * 1.5) * 0.6; C.halo.rotation.z += dt; }
    if (C.wings) for (const { w, s } of C.wings) w.rotation.x = s * (st.ground ? Math.sin(this.breath) * 0.04 : Math.sin(this.breath * 6) * 0.3);
    if (C.rainbow) this.matSet.visor.emissive.setHSL((this.breath * 0.08) % 1, 1, 0.55);
  }

  // zombies: hunched over, head lolling, arms reaching out (swiping when attacking), dragging one leg
  shamble(dt, st, moving, run) {
    const t = this.breath;
    const attacking = st.pitch < -20;
    this.torso.rotation.y += 0.42;
    this.torso.rotation.x = Math.sin(t * 0.9) * 0.08 + (moving ? Math.sin(this.phase) * 0.12 : 0);
    this.head.rotation.y = -0.35 + Math.sin(t * 0.7) * 0.12;
    this.head.rotation.x = 0.28 + Math.sin(t * 0.55) * 0.18;
    for (const A of this.arms) {
      const sway = Math.sin(t * 1.7 + A.s) * 0.1;
      if (attacking) {
        const k = Math.sin(t * 9 + A.s * 1.5);
        A.upper.rotation.y = -1.9 + k * 0.6;
        A.upper.rotation.x = A.s * (0.2 + k * 0.25);
        A.fore.rotation.y = -0.6;
      } else {
        A.upper.rotation.y = -1.45 + sway;
        A.upper.rotation.x = A.s * -0.12;
        A.fore.rotation.y = -0.12 + sway * 0.5;
      }
    }
    // the right leg drags: shorter swing, toes scraping
    const R = this.legs[0];
    R.hip.rotation.y *= 0.45;
    R.knee.rotation.y = R.knee.rotation.y * 0.4 + 0.12;
    if (moving) this.hips.position.z -= Math.max(0, Math.sin(this.phase)) * 1.5 * (0.5 + run);
  }

  dispose() {
    this.mats.forEach((m) => m.dispose());
  }
}
