// Costume suit skins: whole outfits that replace the character's body while worn (the four characters you pick
// are left as they are). Each is built on the same skeleton as the characters, in avatar.js's parts and units
// (Z up, facing +X): hips, torso, head, sh/up/fore 0 and 1, thigh/shin/foot 0 and 1. Everything here is
// smooth: surfaces turned on a lathe, tubes swept along curves, bevelled cut-outs and bent brims, so a costume
// reads as clothes rather than blocks. A costume keeps the game's visor across the eyes.
import * as THREE from 'three';

export const COSTUME_IDS = ['clark', 'verity'];

// each costume's materials: name -> [colour, roughness, metalness, woven-fabric scale (cloth only)]. 'hand' is
// used for the bare hands or gloves of your own arms in first person.
export const COSTUME_LOOKS = {
  clark: {
    suit: ['#8dbcaa', 0.85, 0, 2.6], // the teal shirt
    pad: ['#7aa898', 0.88, 0, 1.8],
    vest: ['#d9c56f', 0.8, 0, 2.2], // the waistcoat and coat
    sash: ['#7c7686', 0.9, 0, 2.2],
    pants: ['#4c4136', 0.9, 0, 2.2],
    boot: ['#17130f', 0.45, 0.1],
    gold: ['#d6a83c', 0.3, 0.9],
    hand: ['#6a3f26', 0.6],
    face: ['#6a3f26', 0.6],
    beard: ['#17110d', 0.95],
    mouth: ['#1d0805', 0.7],
    hat: ['#4b3624', 0.75],
    trim: ['#7a7330', 0.55, 0.3],
    feather: ['#ece6d6', 0.9],
    blood: ['#5e180e', 0.35],
  },
  verity: {
    suit: ['#eceae4', 0.72, 0, 2.4], // the white tailcoat and sleeves
    pad: ['#dcd9cf', 0.78, 0, 1.8],
    vest: ['#e9b52a', 0.7, 0, 2.2], // waistcoat and tie
    pants: ['#e4e2dc', 0.78, 0, 2.2],
    stripe: ['#e9b52a', 0.6],
    hand: ['#f0c020', 0.5], // yellow gloves
    face: ['#e6bb2a', 0.5], // his head is yellow
    grin: ['#fbfaf2', 0.3],
    mouth: ['#2a0d0a', 0.8],
    hat: ['#f1f0ea', 0.6],
    band: ['#e9b52a', 0.6],
    shoe: ['#f4f3ee', 0.35],
    sole: ['#3a3a40', 0.6],
  },
};

// ------------------------------------------------------------------ smooth shapes (all along +Z)
const RX = new THREE.Matrix4().makeRotationX(Math.PI / 2);
// a flat cut-out drawn in (y, z) and given thickness along X (faces forward)
const FLAT = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1);

function at(g, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  return g.applyMatrix4(m);
}
// turned round Z from [radius, z] points listed bottom to top; depth/width squash it front-to-back and side to
// side; gap leaves an opening of that many radians facing forward (an open coat)
function lathe(pts, { depth = 1, width = 1, seg = 32, gap = 0 } = {}) {
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg, Math.PI / 2 + gap / 2, Math.PI * 2 - gap);
  return g.applyMatrix4(RX).scale(depth, width, 1);
}
const ell = (r, sx = 1, sy = 1, sz = 1, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => at(new THREE.SphereGeometry(r, 22, 16), x, y, z, rx, ry, rz, sx, sy, sz);
const capsule = (r, len, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => at(new THREE.CapsuleGeometry(r, len, 4, 12).applyMatrix4(RX), x, y, z, rx, ry, rz);
const tube = (pts, r, seg = 24) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))), seg, r, 10, false);
const ring = (R, r, sx = 1, sy = 1, sz = 1, z = 0) => at(new THREE.TorusGeometry(R, r, 10, 40), 0, 0, z, 0, 0, 0, sx, sy, sz);
function flat(shape, depth = 0.4, bevel = 0.25) {
  return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 10 })
    .translate(0, 0, -depth / 2).applyMatrix4(FLAT);
}
function poly(pts, holes = []) {
  const s = new THREE.Shape(pts.map(([u, v]) => new THREE.Vector2(u, v)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
  return s;
}
// bend a brim into a tricorn: the sides between the three corners (one at the front) turn up and pull in
function tricorn(g, inner, outer, lift) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), r = Math.hypot(x, y);
    const t = Math.min(1, Math.max(0, (r - inner) / (outer - inner))), u = (1 - Math.cos(3 * Math.atan2(y, x))) / 2;
    const k = 1 - 0.3 * u * t;
    p.setXYZ(i, x * k, y * k, p.getZ(i) + u * t ** 1.4 * lift);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ shared pieces
// how far forward a turned body's front is at height z: P = [[z, radius], ...] (bottom to top), depth its squash
function frontOf(P, depth) {
  return (z) => {
    let i = 0;
    while (i < P.length - 2 && P[i + 1][0] < z) i++;
    const [z0, r0] = P[i], [z1, r1] = P[i + 1];
    return (r0 + (r1 - r0) * Math.min(1, Math.max(0, (z - z0) / (z1 - z0)))) * depth;
  };
}

// sleeves from shoulder to wrist, a cuff, and a hand: palm, curled fingers, thumb (index 0 is the right side)
function arms(add, { sleeve, cuff, hand, puff = false }) {
  for (const i of [0, 1]) {
    const s = i ? 1 : -1;
    add('sh' + i, sleeve, ell(3.9, 1, 1, 1.05, 0, 0, -0.4));
    add('up' + i, sleeve, lathe([[2.95, -12.4], [3.15, -8], [3.4, -3], [3.6, 0]], { seg: 24 }));
    add('fore' + i, sleeve, new THREE.SphereGeometry(3.05, 18, 12)); // the elbow
    add('fore' + i, sleeve, lathe([[2.55, -9], [2.7, -5], [3, 0]], { seg: 24 }));
    add('fore' + i, cuff, puff ? lathe([[2.6, -10.2], [3.6, -9.6], [3.8, -8.6], [3.1, -7.6]], { seg: 24 }) : lathe([[2.75, -10], [2.95, -8.8]], { seg: 24 }));
    // the hand, round the grip: a rounded palm, four curled fingers and a thumb
    add('fore' + i, hand, ell(2.3, 1.05, 0.82, 1.15, 0.4, 0, -12));
    for (let f = 0; f < 4; f++) add('fore' + i, hand, capsule(0.62, 2.2, 2.3, (f - 1.5) * 0.95, -13.2, 0, 0.9));
    add('fore' + i, hand, capsule(0.68, 2, 1.6, -s * 1.9, -11.3, s * 0.35, -0.6));
  }
}

// trousers from hip to ankle with a knee between, and whatever goes on the feet
function legs(add, { pants, foot }) {
  for (const i of [0, 1]) {
    add('thigh' + i, pants, lathe([[3.5, -17.5], [3.9, -12], [4.4, -4], [4.6, 0.5]], { seg: 26 }));
    add('shin' + i, pants, new THREE.SphereGeometry(3.6, 18, 12)); // the knee
    add('shin' + i, pants, lathe([[3, -14.6], [3.25, -8], [3.55, 0]], { seg: 26 }));
    foot(i);
  }
}

// ------------------------------------------------------------------ the costumes
// h: from avatar.js: CHEST (the characters' chest profile) and visor(x, z)
export const COSTUME_BUILD = {
  // Captain Clark: a pirate in a tricorn hat, a gold-trimmed yellow waistcoat and coat over a teal shirt, a grey
  // sash under a big buckled belt, brown breeches and black boots, a black beard and a startled open mouth
  clark(add, h) {
    // the coat's skirts, open at the front, the sash, the belt and its buckle
    add('hips', 'vest', lathe([[11.2, -15], [10.4, -9], [9.6, -3], [9.3, 2]], { depth: 0.8, width: 1.05, gap: 1.05 }));
    add('hips', 'vest', lathe([[6.6, -4], [8.4, 0], [8.6, 2.5]], { depth: 0.75, width: 1.02 })); // the seat
    add('hips', 'sash', ring(8, 1.7, 0.8, 1.08, 1.1, 2.6));
    add('hips', 'sash', ell(1.9, 0.7, 1, 1.1, 7.7, -3.6, 1.6)); // the knot
    add('hips', 'sash', tube([[7.7, -3.6, 1], [8, -3.9, -3], [7.6, -3.4, -7], [7.9, -3.9, -10.5]], 1.05));
    add('hips', 'boot', lathe([[10, 1.8], [10, 4.2]], { depth: 0.8, width: 1.06, seg: 40 }));
    add('hips', 'gold', at(flat(poly([[-2.4, -1.9], [2.4, -1.9], [2.4, 1.9], [-2.4, 1.9]], [[[-1.3, -0.9], [1.3, -0.9], [1.3, 0.9], [-1.3, 0.9]]]), 0.35, 0.22), 8.15, 0, 3));
    add('hips', 'gold', capsule(0.25, 2.2, 8.3, -0.2, 3, Math.PI / 2 + 0.2)); // the prong
    // the shirt, the waistcoat over it, its gold trim and buttons, a stain down the front
    const vest = [[-1, 6.9], [2, 7.6], [8, 9], [14, 9.9], [17.5, 9.6], [19.5, 7.4]];
    const front = frontOf(vest, 0.72);
    add('torso', 'suit', at(lathe(h.CHEST, { depth: 0.7 }), 0, 0, -1));
    add('torso', 'vest', lathe(vest.map(([z, r]) => [r, z]).concat([[0, 19.5]]), { depth: 0.72, width: 1.04 }));
    for (const y of [-1.1, 1.1]) add('torso', 'gold', tube([0, 4, 8, 12, 16, 18.5].map((z) => [front(z) + 0.1, y, z]), 0.32));
    for (const z of [5, 8.5, 12, 15.5]) add('torso', 'gold', ell(0.6, 0.6, 1, 1, front(z) + 0.35, 0, z));
    add('torso', 'blood', ell(1, 0.16, 0.7, 5.4, front(12) + 0.08, -2.1, 12, 0, 0.1));
    for (const s of [-1, 1]) add('torso', 'suit', ell(3.2, 0.3, 1, 0.75, 4.4, s * 4.4, 20.4, s * 0.55, -0.5)); // collar
    // the face and neck, the visor across the eyes, the beard and moustache, a startled open mouth, ears
    add('head', 'face', lathe([[2.8, -1], [3.1, 2], [3.3, 4]], { seg: 20 }));
    add('head', 'face', ell(7, 1, 0.98, 1.04, 0, 0, 7.2));
    h.visor(5.2, 7.7);
    add('head', 'beard', ell(6.2, 0.95, 1, 0.88, 2.3, 0, 3.6));
    for (const s of [-1, 1]) {
      add('head', 'beard', ell(2.4, 0.8, 0.6, 1.4, 1.6, s * 5.6, 5.8)); // sideburns
      add('head', 'beard', capsule(0.75, 2.6, 6.6, s * 1.7, 5.2, -s * (Math.PI / 2 + 0.35))); // moustache, drooping
      add('head', 'face', ell(1.7, 0.6, 0.4, 1, 0, s * 6.8, 7.4)); // ears
    }
    add('head', 'mouth', ell(1.3, 0.5, 1, 1.25, 7.4, 0, 3.8));
    // the tricorn: a rounded crown, the brim bent up between its three corners, one corner at the front
    const top = 11.8;
    add('head', 'hat', at(lathe([[6.4, 0], [6.5, 2.6], [5.8, 5], [3.8, 6.4], [0, 6.9]]), -0.6, 0, top));
    add('head', 'hat', at(tricorn(lathe([[6.2, -0.35], [13.2, -0.35], [13.6, 0], [13.2, 0.35], [6.2, 0.35]], { seg: 72 }), 6.2, 13.2, 7.4), -0.6, 0, top));
    add('head', 'trim', at(tricorn(new THREE.TorusGeometry(13.5, 0.4, 6, 120), 6.2, 13.2, 7.4), -0.6, 0, top));
    add('head', 'feather', tube([[-8, -6.2, top + 2], [-10, -7.2, top + 5], [-13, -6.8, top + 6.6], [-15.5, -5.6, top + 6.4]], 0.85, 20));
    arms(add, { sleeve: 'suit', cuff: 'pad', hand: 'hand', puff: true });
    for (const i of [0, 1]) add('fore' + i, 'gold', at(new THREE.TorusGeometry(0.75, 0.3, 8, 16), 2.4, 0.5, -13.6, 0, Math.PI / 2 - 0.9)); // a ring
    legs(add, {
      pants: 'pants',
      foot: (i) => {
        add('shin' + i, 'boot', lathe([[3.45, -15.5], [3.6, -11], [4.1, -6.6], [4.35, -5.6]], { seg: 26 }));
        add('foot' + i, 'boot', ell(5.4, 1, 0.58, 0.46, 2.6, 0, -1.4));
        add('foot' + i, 'boot', ell(5.7, 1, 0.62, 0.14, 2.7, 0, -3.5));
      },
    });
  },

  // Lord Verity: a white tailcoat with long tails over a yellow waistcoat and tie, three yellow stripes round
  // each sleeve, yellow gloves, a wide white hat with a yellow band tipped low over the eyes, and a huge grin
  verity(add, h) {
    // the coat's long tails, open at the front, and the seat of the trousers under them
    add('hips', 'suit', lathe([[12.6, -31], [11.2, -20], [9.8, -8], [9.3, 0], [9.2, 3]], { depth: 0.82, width: 1.03, gap: 1.5, seg: 40 }));
    add('hips', 'pants', lathe([[6.4, -4], [8.3, 0], [8.4, 3]], { depth: 0.75, width: 1.02 }));
    // the waistcoat, the coat open over it with its lapels rolled back, the tie, the shirt collar
    const coat = [[-1, 7.3], [2, 8], [8, 9.3], [14, 10.1], [17.5, 9.8], [20, 7.6], [21.6, 4.6]];
    const front = frontOf([[-1, 6.6], [2, 7.3], [8, 8.6], [14, 9.4], [17.5, 9.2], [20, 7]], 0.72);
    add('torso', 'vest', at(lathe(h.CHEST, { depth: 0.7 }), 0, 0, -1));
    const gap = 1.15;
    add('torso', 'suit', lathe(coat.map(([z, r]) => [r, z]), { depth: 0.76, width: 1.06, gap, seg: 40 }));
    for (const s of [-1, 1]) {
      const a = Math.PI / 2 + (s * gap) / 2; // the lapel rolled back along each edge of the opening
      add('torso', 'suit', tube(coat.slice(1).map(([z, r]) => [Math.sin(a) * r * 0.79, -Math.cos(a) * r * 1.09, z]), 0.75));
    }
    for (const z of [4, 7.5]) add('torso', 'band', ell(0.55, 0.6, 1, 1, front(z) + 0.6, 0, z));
    add('torso', 'vest', at(flat(poly([[-0.7, 7.2], [0.7, 7.2], [0.45, 5.6], [1.35, -5.4], [0, -7.2], [-1.35, -5.4], [-0.45, 5.6]]), 0.3, 0.2), front(13) + 0.55, 0, 12.6, 0, 0.1)); // the tie
    add('torso', 'vest', ell(1, 0.7, 1, 0.9, front(19) + 0.5, 0, 19.6)); // its knot
    for (const s of [-1, 1]) add('torso', 'grin', ell(2.8, 0.3, 1, 0.7, 4.3, s * 3, 20.6, s * 0.5, -0.4)); // shirt collar
    // the face and neck, the visor, and the grin: a crescent-shaped open mouth, a row of teeth along the top
    // and a shorter one along the bottom, lips round it, the corners pulled up into the cheeks
    add('head', 'face', lathe([[2.8, -1], [3.1, 2], [3.3, 4]], { seg: 20 }));
    add('head', 'face', ell(7, 1, 0.96, 1.06, 0, 0, 7.2));
    h.visor(5.2, 7.9);
    const faceX = (y, z) => 7 * Math.sqrt(Math.max(0, 1 - (y / 6.72) ** 2 - ((z - 7.2) / 7.42) ** 2)); // the face's front
    const onFace = (g, out) => { // lay a flat cut-out onto the curve of the face
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, p.getX(i) + faceX(p.getY(i), p.getZ(i)) + out);
      g.computeVertexNormals();
      return g;
    };
    const W = 4.5, upper = (y) => 3.95 + 0.085 * y * y, lower = (y) => 2.05 + 0.18 * y * y; // the mouth's edges
    const span = (n, w) => Array.from({ length: n + 1 }, (_, i) => -w + (2 * w * i) / n);
    add('head', 'mouth', onFace(flat(poly([...span(24, W).map((y) => [y, upper(y)]), ...span(24, W).reverse().map((y) => [y, lower(y)])]), 0.2, 0.12), -0.15));
    const tooth = (y, z0, z1, w) => onFace(flat(poly([[y - w / 2, z0], [y + w / 2, z0], [y + w / 2 - 0.1, z1], [y - w / 2 + 0.1, z1]]), 0.2, 0.14), 0.05);
    const open = (y) => upper(y) - lower(y);
    for (const y of span(8, 3.6)) add('head', 'grin', tooth(y, upper(y) - 0.12, upper(y) - 0.12 - open(y) * 0.52, 0.72)); // top teeth
    for (const y of span(6, 2.7)) add('head', 'grin', tooth(y, lower(y) + 0.1, lower(y) + 0.1 + open(y) * 0.3, 0.66)); // bottom teeth
    for (const edge of [upper, lower]) add('head', 'face', tube(span(16, W + 0.1).map((y) => [faceX(y, edge(y)) + 0.2, y, edge(y) + (edge === upper ? 0.15 : -0.15)]), 0.32, 32)); // lips
    for (const s of [-1, 1]) {
      add('head', 'face', ell(1.8, 0.7, 1, 0.8, 5.1, s * 4.6, 6)); // cheeks
      add('head', 'mouth', ell(0.35, 0.5, 1, 1, faceX(s * W, upper(W)) + 0.1, s * (W + 0.15), upper(W) - 0.1)); // the corners
    }
    // the hat: a tall crown with a yellow band, a wide brim curving down at the edge, tipped forward
    const hat = (g) => at(g, 0.6, 0, 11.2, 0, 0.13);
    add('head', 'hat', hat(lathe([[6.7, 0], [6.8, 4.8], [6.5, 6.4], [5.6, 7.2], [0, 7.4]], { seg: 40 })));
    add('head', 'hat', hat(lathe([[6.6, -0.2], [11, -0.3], [14.4, -0.9], [15.3, -1.5], [15.5, -1.1], [14.6, -0.4], [11, 0.25], [6.6, 0.4]], { seg: 56 })));
    add('head', 'band', hat(lathe([[6.95, 0.35], [6.95, 2.3]], { seg: 40 })));
    arms(add, { sleeve: 'suit', cuff: 'pad', hand: 'hand' });
    for (const i of [0, 1]) for (const z of [-3.2, -4.8, -6.4]) add('up' + i, 'stripe', ring(3.45 + (z + 3) * 0.05, 0.42, 1, 1, 0.75, z));
    legs(add, {
      pants: 'pants',
      foot: (i) => {
        add('shin' + i, 'pants', lathe([[3.4, -15.5], [3.2, -13]], { seg: 26 })); // the hem
        add('foot' + i, 'shoe', ell(5.8, 1.08, 0.5, 0.36, 3.2, 0, -1.5)); // long pointed shoes
        add('foot' + i, 'sole', ell(6.1, 1.06, 0.52, 0.1, 3.2, 0, -3.3));
      },
    });
  },
};
