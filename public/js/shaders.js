// Procedural surface shaders. Each surface type is a MeshStandardMaterial with a pattern generated in world
// space on the GPU (no texture files): albedo, roughness and a bump-mapped normal, plus a shared weathering
// layer (grime, streaks, puddles) so large walls don't look tiled. Units: 40 = one block.
import * as THREE from 'three';

const TYPES = { stone: 0, brick: 1, clay: 2, wood: 3, metal: 4, plate: 5, panel: 6, hazard: 7, concrete: 8, grass: 9, dirt: 10, grassside: 11, crate: 12, barrel: 13 };

// Potato mode: cheap Lambert lighting, fewer noise octaves, no bump mapping. Set before any map loads.
let POTATO = false;
export function setPotato(on) {
  POTATO = !!on;
}
export const isPotato = () => POTATO;
// noise detail for the surface shaders (octaves): fewer is faster. Set from the graphics quality.
let OCTAVES = 5;
export function setDetail(octaves) {
  OCTAVES = octaves;
}

const NOISE = /* glsl */ `
#ifndef FBM_OCT
#define FBM_OCT 5
#endif
float h31(vec3 p) { p = fract(p * vec3(.1031, .1030, .0973)); p += dot(p, p.yxz + 33.33); return fract((p.x + p.y) * p.z); }
float h21(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec2 h22(vec2 p) { vec3 q = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.xx + q.yz) * q.zy); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y);
}
// gradient noise: smoother and less blocky than value noise, range about 0..1
float gnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * f * (f * (f * 6. - 15.) + 10.);
  #define G(o) dot(h22(i + o) * 2. - 1., f - o)
  float n = mix(mix(G(vec2(0, 0)), G(vec2(1, 0)), u.x), mix(G(vec2(0, 1)), G(vec2(1, 1)), u.x), u.y);
  #undef G
  return n * .7 + .5;
}
float fbm(vec2 p) { float a = .5, s = 0.; for (int i = 0; i < FBM_OCT; i++) { s += a * gnoise(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p; a *= .5; } return s / (1. - pow(.5, float(FBM_OCT))); }
// cellular noise: x = distance to the nearest point, y = distance to the edge between the two nearest cells
vec2 voro(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float d1 = 8., d2 = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(x, y), r = o + h22(i + o) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d1), sqrt(d2) - sqrt(d1));
}
`;

// Returns albedo in .rgb (linear, multiplied with the material colour) and height in .a.
// uv: planar coordinates on the dominant axis; up: the face points up; side: a wall.
const PATTERN = /* glsl */ `
uniform float uType; uniform vec3 uTintA; uniform vec3 uTintB;
float gridSeam(vec2 uv, vec2 size, float w) { vec2 f = fract(uv / size); return 1. - smoothstep(0., w, min(min(f.x, 1. - f.x), min(f.y, 1. - f.y))); }
// thin branching cracks, masked so only some areas have them
float cracks(vec2 uv, float scale, float amount) {
  vec2 v = voro(uv * scale + fbm(uv * scale * .7) * .8);
  float line = 1. - smoothstep(0., .035, v.y);
  return line * smoothstep(1. - amount, 1., gnoise(uv * scale * .25 + 7.));
}
vec4 surfacePattern(vec3 P, vec3 N, out float rough, out float wet) {
  vec3 an = abs(N);
  vec2 uv; bool up = false; bool side = false;
  if (an.z >= an.x && an.z >= an.y) { uv = P.xy; up = N.z > 0.; }
  else if (an.x >= an.y) { uv = P.yz; side = true; }
  else { uv = P.xz; side = true; }
  vec3 col = uTintA; float h = .5; rough = .8; wet = 0.;
  int t = int(uType + .5);
  vec2 cell = floor(uv / 40.); vec2 f = fract(uv / 40.);
  float edge = min(min(f.x, 1. - f.x), min(f.y, 1. - f.y));
  float weather = 1.; // how much grime and streaking this surface takes
  if (t == 0) { // stone blocks: speckled, chipped edges, the odd crack and moss on top faces
    float n = fbm(uv * .09) * .6 + gnoise(uv * .7) * .25 + h21(floor(uv * 1.5)) * .15;
    float chip = smoothstep(0., .06 + .04 * gnoise(uv * .4), edge);
    col = mix(uTintA, uTintB, smoothstep(.3, .8, n)) * (.88 + .24 * h21(cell));
    float cr = cracks(uv, .05, .45);
    col *= 1. - cr * .45;
    if (up) { float moss = smoothstep(.62, .78, fbm(uv * .02 + 11.)) * (1. - chip * .5); col = mix(col, vec3(.16, .24, .09), moss * .7); }
    h = n * .55 + chip * .35 - cr * .25; rough = .88;
  } else if (t == 1) { // running-bond bricks, 20 x 10, each brick its own shade with worn corners
    vec2 b = uv / vec2(20., 10.); b.x += step(1., mod(floor(b.y), 2.)) * .5;
    vec2 bi = floor(b), bf = fract(b);
    float m = min(min(bf.x, 1. - bf.x) * 2., min(bf.y, 1. - bf.y));
    float mortar = 1. - smoothstep(.05 + .05 * gnoise(uv * .9), .12, m);
    float shade = h21(bi), burnt = step(.88, h21(bi + 9.));
    vec3 brick = uTintA * (.78 + .4 * shade) * (.9 + .2 * gnoise(uv * .7));
    brick = mix(brick, brick * vec3(.45, .4, .38), burnt);
    brick *= 1. - .25 * smoothstep(.55, .9, fbm(uv * .04 + 3.)); // soot
    col = mix(brick, uTintB * (.85 + .2 * gnoise(uv * 2.)), mortar);
    h = (1. - mortar) * (.75 + .25 * gnoise(uv * 1.1)) + mortar * .1 * gnoise(uv * 3.); rough = mix(.72, .95, mortar);
  } else if (t == 2) { // clay / terracotta plaster with hairline cracks
    float n = fbm(uv * .05);
    float cr = cracks(uv, .04, .5);
    col = uTintA * (.9 + .18 * n) * (.95 + .1 * h21(cell)) * (1. - cr * .35);
    h = .5 + .3 * n - (1. - smoothstep(0., .03, edge)) * .3 - cr * .2; rough = .9;
  } else if (t == 3 || t == 12) { // planks with grain and knots (12: crate with a frame)
    vec2 q = side ? uv : uv.yx;
    float plank = floor(q.y / 10.);
    vec2 kp = vec2(q.x * .05, q.y * .1);
    vec2 kv = voro(kp + plank * 3.1);
    float knot = (1. - smoothstep(.0, .18, kv.x)) * step(.75, h21(floor(kp + plank * 3.1)));
    float warp = fbm(vec2(q.x * .04, plank * 3.)) * 30. + knot * 6. / (kv.x + .2);
    float grain = sin((q.x + warp) * .35 + plank * 4.) * .5 + .5;
    float fine = gnoise(vec2(q.x * .08, q.y * 2.5));
    col = mix(uTintA, uTintB, grain * .55 + fine * .2) * (.82 + .32 * h21(vec2(plank, cell.x)));
    col = mix(col, uTintB * .55, knot * .8);
    float gap = 1. - smoothstep(.0, .06, min(fract(q.y / 10.), 1. - fract(q.y / 10.)));
    h = .7 - gap * .5 + grain * .06 + fine * .04 - knot * .1; rough = .68 + fine * .1;
    if (t == 12) { float fr = 1. - smoothstep(.07, .1, edge); col = mix(col, uTintB * .7, fr); h += fr * .3; }
  } else if (t == 13) { // barrel: staves with iron bands
    float band = step(.15, abs(fract(P.z / 40. + .5) - .5));
    float stave = fract(atan(P.y, P.x) * 6.);
    float rust = smoothstep(.5, .75, fbm(vec2(P.z * .05, stave * 3.)));
    vec3 iron = mix(uTintB, vec3(.32, .14, .06), rust);
    col = mix(iron, uTintA * (.8 + .4 * gnoise(vec2(P.z * .3, stave * 7.))), band);
    h = band * .6 + .2 + (1. - smoothstep(0., .06, min(stave, 1. - stave))) * -.2; rough = mix(.4 + rust * .4, .75, band);
  } else if (t == 4) { // brushed metal: seams, rivets, scratches and rust creeping from the seams
    float br = gnoise(vec2(uv.x * .05, uv.y * 3.)) * .5 + gnoise(uv * vec2(.2, 9.)) * .5;
    float seam = gridSeam(uv, vec2(64.), .015);
    float rv = 1. - smoothstep(1., 1.6, length(mod(uv, 32.) - 4.));
    vec2 sr = mat2(.94, .34, -.34, .94) * uv;
    float scratch = smoothstep(.93, 1., gnoise(vec2(sr.x * .03, sr.y * 1.4))) * gnoise(uv * .08);
    float rust = smoothstep(.55, .85, fbm(uv * .03 + 5.) + seam * .35);
    col = uTintA * (.78 + .32 * br) * (1. - seam * .6) + rv * .08 + scratch * .25;
    col = mix(col, vec3(.3, .13, .05) * (.7 + .5 * gnoise(uv * .5)), rust);
    h = .5 - seam * .4 + rv * .3 - scratch * .06 + rust * .08 * gnoise(uv * 1.3); rough = mix(.3 + .25 * br - scratch * .1, .85, rust);
  } else if (t == 5) { // diamond tread plate, worn shiny on the raised diamonds, dirt in the gaps
    vec2 r = mat2(.7071, -.7071, .7071, .7071) * uv;
    vec2 g = fract(r / 6.) - .5; vec2 g2 = fract((r + 3.) / 6.) - .5;
    float bump = max(1. - smoothstep(.1, .2, abs(g.x) + abs(g.y * 3.)), 1. - smoothstep(.1, .2, abs(g2.y) + abs(g2.x * 3.)));
    float seam = gridSeam(uv, vec2(128.), .01);
    float dirt = smoothstep(.4, .8, fbm(uv * .02)) * (1. - bump);
    col = uTintA * (.82 + .22 * gnoise(uv * .1)) * (1. - seam * .5) * (1. + bump * .25) * (1. - dirt * .5);
    h = .4 + bump * .4 - seam * .3; rough = .45 - bump * .2 + dirt * .4;
  } else if (t == 6) { // wall panels with screws and a scuffed kick band along the bottom
    vec2 ps = vec2(96., 128.);
    float seam = gridSeam(uv, ps, .012);
    vec2 pf = fract(uv / ps) * ps;
    vec2 sc = min(pf, ps - pf);
    float screw = 1. - smoothstep(1.1, 1.6, length(sc - 6.));
    float stain = fbm(uv * .01 + 3.);
    float scuff = side ? smoothstep(.55, .8, gnoise(vec2(uv.x * .2, uv.y * .6))) * (1. - smoothstep(0., 18., mod(P.z, 128.))) : 0.;
    col = mix(uTintA, uTintB, stain * .5) * (1. - seam * .5) * (1. - scuff * .25) + screw * .06;
    h = .6 - seam * .5 + screw * .25; rough = .55 + scuff * .2 - screw * .2;
  } else if (t == 7) { // hazard stripes, chipped down to bare metal in places
    float s = step(.5, fract((uv.x + uv.y) / 24.));
    float chip = smoothstep(.68, .72, gnoise(uv * .25) * .6 + gnoise(uv * 1.2) * .4);
    col = mix(vec3(.02), uTintA, s) * (.85 + .3 * gnoise(uv * .5));
    col = mix(col, vec3(.35, .34, .33), chip);
    h = .5 - chip * .15; rough = mix(.5, .4, chip); weather = 1.3;
  } else if (t == 8) { // concrete: formwork seams, tie holes, aggregate, pores and cracks
    float n = fbm(uv * .025);
    float seam = gridSeam(uv, vec2(128., 64.), .01);
    float pore = smoothstep(.82, .9, gnoise(uv * 1.9)) * gnoise(uv * .3);
    float agg = step(.8, h21(floor(uv * 2.))) * .08;
    float tie = side ? 1. - smoothstep(1.2, 1.8, length(mod(uv - vec2(32., 16.), vec2(64., 32.)) - vec2(32., 16.))) : 0.;
    float cr = cracks(uv, .025, .4);
    col = uTintA * (.84 + .26 * n + agg) * (1. - seam * .3 - pore * .35 - tie * .5 - cr * .4);
    h = .5 + .2 * n - seam * .3 - pore * .25 - tie * .4 - cr * .3; rough = .9;
  } else if (t == 9 || t == 10 || t == 11) { // grass top, dirt with pebbles, grass-block side
    float n = gnoise(uv * .9) * .5 + fbm(uv * .06) * .5;
    float blades = gnoise(uv * vec2(3.1, 2.7)) * .5 + gnoise(uv * vec2(5.3, 6.1)) * .5;
    vec3 grass = uTintA * (.72 + .45 * n) * (.85 + .3 * blades);
    grass = mix(grass, grass * vec3(1.25, 1.1, .55), smoothstep(.6, .8, fbm(uv * .015 + 2.)) * .6); // dry patches
    vec2 pv = voro(uv * .35);
    float pebble = (1. - smoothstep(.15, .32, pv.x)) * step(.6, h21(floor(uv * .35)));
    vec3 dirt = uTintB * (.75 + .4 * gnoise(uv * 1.1)) * (1. + pebble * .35);
    float top = 0.;
    if (t == 11) top = step(.8 - gnoise(vec2(uv.x * .6, 0.)) * .1, fract(P.z / 40.));
    float bare = t == 9 ? smoothstep(.7, .82, fbm(uv * .01 + 8.)) : 0.;
    col = t == 9 ? mix(grass, dirt, bare) : t == 10 ? dirt : mix(dirt, grass, top);
    h = t == 10 ? n * .5 + pebble * .5 : n * .6 + blades * .4; rough = .95; weather = .3;
  }
  // weathering shared by every surface: big blotchy grime, rain streaks down walls, puddles on hard floors
  float macro = fbm(P.xy * .0016 + P.z * .001);
  col *= mix(1., .86 + .28 * macro, weather);
  if (side) {
    float streak = gnoise(vec2(uv.x * .12, P.z * .006)) * gnoise(vec2(uv.x * .03, P.z * .002) + 4.);
    col *= 1. - smoothstep(.35, .7, streak) * .22 * weather;
  }
  if (up && (t == 0 || t == 5 || t == 8)) {
    wet = smoothstep(.62, .7, fbm(uv * .006 + 17.));
    col *= 1. - wet * .35;
    h = mix(h, .5, wet);
    rough = mix(rough, .06, wet);
  }
  return vec4(col, h);
}
`;

const PERTURB = /* glsl */ `
vec3 bumpNormal(vec3 surf_pos, vec3 surf_norm, float hgt, float strength, float faceDirection) {
  vec3 vSigmaX = dFdx(surf_pos), vSigmaY = dFdy(surf_pos);
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN), R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec2 dH = vec2(dFdx(hgt), dFdy(hgt)) * strength;
  vec3 vGrad = sign(fDet) * (dH.x * R1 + dH.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

const cache = new Map();

// opts: { color, color2, emissive, bump }
export function surfaceMaterial(type, opts = {}) {
  const key = type + JSON.stringify(opts);
  if (cache.has(key)) return cache.get(key);
  const emissive = opts.emissive ? new THREE.Color(opts.emissive) : new THREE.Color(0);
  const mat = POTATO
    ? new THREE.MeshLambertMaterial({ color: 0xffffff, emissive, emissiveIntensity: opts.emissive ? 3 : 0 })
    : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: type === 'metal' || type === 'plate' ? 0.6 : 0, emissive, emissiveIntensity: opts.emissive ? 3 : 0 });
  const uniforms = {
    uType: { value: TYPES[type] ?? 0 },
    uTintA: { value: new THREE.Color(opts.color || '#8a8a8a') },
    uTintB: { value: new THREE.Color(opts.color2 || opts.color || '#5a5a5a') },
    uBump: { value: opts.bump ?? 1.5 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 wp4 = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp4 = instanceMatrix * wp4;
        #endif
        vWPos = (modelMatrix * wp4).xyz;
        vWNrm = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n#define FBM_OCT ${POTATO ? 3 : OCTAVES}\nvarying vec3 vWPos; varying vec3 vWNrm; uniform float uBump;\n${NOISE}\n${PATTERN}\n${PERTURB}`)
      .replace('#include <map_fragment>', `
        float sRough, sWet;
        vec4 sPat = surfacePattern(vWPos, normalize(vWNrm), sRough, sWet);
        diffuseColor.rgb *= sPat.rgb;`);
    if (!POTATO) {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * sRough;')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          // fade fine bumps with distance so far walls don't shimmer
          float sFade = 1. / (1. + length(fwidth(vWPos)) * .35);
          normal = bumpNormal(-vViewPosition, normal, sPat.a, uBump * sFade * (1. - sWet * .8), faceDirection);`);
    }
  };
  mat.customProgramCacheKey = () => (POTATO ? 'surface-potato' : 'surface' + OCTAVES);
  mat.userData.uniforms = uniforms;
  cache.set(key, mat);
  return mat;
}

// Glowing strip material (bloom picks it up).
export function neonMaterial(color = '#4fd6ff') {
  return new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(color), emissiveIntensity: 6, roughness: 0.4 });
}

// Sky dome: gradient, sun disc and drifting clouds. Also used to build the reflection environment.
export function makeSky(sunDir) {
  const uniforms = {
    uSun: { value: new THREE.Vector3(...sunDir).normalize() },
    uTime: { value: 0 },
    uTop: { value: new THREE.Color('#2a64c8') },
    uHorizon: { value: new THREE.Color('#c9d9ee') },
    uGround: { value: new THREE.Color('#4a4a4f') },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `varying vec3 vDir; void main() { vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSun; uniform float uTime; uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround;
      varying vec3 vDir;
      ${NOISE}
      void main() {
        vec3 d = normalize(vDir);
        float h = d.z;
        vec3 c = h > 0. ? mix(uHorizon, uTop, pow(h, .45)) : mix(uHorizon, uGround, pow(-h, .35));
        float s = max(dot(d, uSun), 0.);
        c += vec3(1., .85, .6) * (pow(s, 900.) * 40. + pow(s, 12.) * .35);
        if (h > 0.) {
          vec2 cp = d.xy / (h + .12) * 3. + vec2(uTime * .01, 0.);
          float cl = smoothstep(.45, .8, fbm(cp) * .7 + fbm(cp * 2.7) * .3);
          c = mix(c, vec3(1.) * (.85 + .3 * s), cl * smoothstep(0., .25, h) * .85);
        }
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  mesh.scale.setScalar(40000);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.userData.uniforms = uniforms;
  return mesh;
}

// Pickup halo: soft additive ring with a fresnel rim, animated.
export function haloMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
      void main() {
        float r = length(vUv - .5) * 2.;
        float ring = smoothstep(.6, .85, r) * (1. - smoothstep(.85, 1., r));
        float glow = (1. - r) * .25;
        float pulse = .75 + .25 * sin(uTime * 3.);
        gl_FragColor = vec4(uColor * (ring + glow) * pulse * 2., 1.);
      }`,
  });
}

export const SURFACES = TYPES;
