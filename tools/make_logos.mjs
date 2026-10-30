// Draws the game's logos as SVG files in public/: the badge (the player character on a hexagon), the wordmark
// (badge + MUGR.LOL), a stacked version and the favicon. The letters are solid block shapes drawn
// here on a 10-unit grid (one stem width, 45° cut corners), so the logos look the same everywhere and need
// no font.
//   node tools/make_logos.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const AMBER = '#ffb000';
const DARK = '#14161b';
const f = (n) => +n.toFixed(2);

// ------------------------------------------------------------------ letters: 10 tall, stems 2.4
// Each letter is [width, outline, ...holes]; holes are cut out with the even-odd rule.
const GLYPHS = {
  M: [9, [[0, 10], [0, 0], [2.6, 0], [4.5, 3.2], [6.4, 0], [9, 0], [9, 10], [6.6, 10], [6.6, 4.8], [4.5, 8.2], [2.4, 4.8], [2.4, 10]]],
  U: [8, [[0, 0], [2.4, 0], [2.4, 7.6], [5.6, 7.6], [5.6, 0], [8, 0], [8, 8.4], [6.4, 10], [1.6, 10], [0, 8.4]]],
  G: [8, [[1.6, 0], [8, 0], [8, 2.4], [2.4, 2.4], [2.4, 7.6], [5.6, 7.6], [5.6, 6.2], [4, 6.2], [4, 4], [8, 4], [8, 8.4], [6.4, 10], [1.6, 10], [0, 8.4], [0, 1.6]]],
  R: [8, [[0, 0], [6.4, 0], [8, 1.6], [8, 4.8], [6.6, 6.1], [8, 10], [5.5, 10], [4.3, 6.4], [2.4, 6.4], [2.4, 10], [0, 10]],
    [[2.4, 2.4], [5.6, 2.4], [5.6, 4], [2.4, 4]]],
  D: [8, [[0, 0], [6, 0], [8, 2], [8, 8], [6, 10], [0, 10]], [[2.4, 2.4], [5, 2.4], [5.6, 3], [5.6, 7], [5, 7.6], [2.4, 7.6]]],
  E: [7, [[0, 0], [7, 0], [7, 2.4], [2.4, 2.4], [2.4, 3.8], [6, 3.8], [6, 6.2], [2.4, 6.2], [2.4, 7.6], [7, 7.6], [7, 10], [0, 10]]],
  A: [8, [[0, 10], [0, 1.6], [1.6, 0], [6.4, 0], [8, 1.6], [8, 10], [5.6, 10], [5.6, 6.6], [2.4, 6.6], [2.4, 10]], [[2.4, 2.4], [5.6, 2.4], [5.6, 4.2], [2.4, 4.2]]],
  T: [8, [[0, 0], [8, 0], [8, 2.4], [5.2, 2.4], [5.2, 10], [2.8, 10], [2.8, 2.4], [0, 2.4]]],
  H: [8, [[0, 0], [2.4, 0], [2.4, 3.8], [5.6, 3.8], [5.6, 0], [8, 0], [8, 10], [5.6, 10], [5.6, 6.2], [2.4, 6.2], [2.4, 10], [0, 10]]],
  C: [8, [[1.6, 0], [8, 0], [8, 2.4], [2.4, 2.4], [2.4, 7.6], [8, 7.6], [8, 10], [1.6, 10], [0, 8.4], [0, 1.6]]],
  L: [7, [[0, 0], [2.4, 0], [2.4, 7.6], [7, 7.6], [7, 10], [0, 10]]],
  O: [8, [[1.6, 0], [6.4, 0], [8, 1.6], [8, 8.4], [6.4, 10], [1.6, 10], [0, 8.4], [0, 1.6]], [[2.4, 2.4], [5.6, 2.4], [5.6, 7.6], [2.4, 7.6]]],
  '.': [2.6, [[0, 7.4], [2.6, 7.4], [2.6, 10], [0, 10]]],
};
const NAME = 'Mugr.lol';
const wordWidth = (text, gap) => [...text].reduce((w, ch) => w + GLYPHS[ch][0], 0) + gap * (text.length - 1);

// a word as one path, `scale` pixels per unit, top-left at (x, y)
function wordPath(text, x, y, scale, gap) {
  let cx = 0, d = '';
  for (const ch of text) {
    const [w, ...rings] = GLYPHS[ch];
    for (const ring of rings) d += 'M' + ring.map(([px, py]) => `${f(x + (cx + px) * scale)} ${f(y + py * scale)}`).join('L') + 'Z';
    cx += w + gap;
  }
  return d;
}

// solid letters with a short dark extrusion down and to the right, and a light top edge
function word(text, { x, y, scale, gap, fill, side }) {
  const d = wordPath(text, x, y, scale, gap);
  const depth = Math.max(2, scale * 0.42);
  let out = '';
  for (let i = depth; i > 0; i -= 0.75) out += `<path d="${d}" transform="translate(${f(i * 0.55)} ${f(i)})" fill="${side}" fill-rule="evenodd"/>`;
  return out + `<path d="${d}" fill="${fill}" fill-rule="evenodd"/>`;
}

// MUGR.LOL on one line, leaning forward: MUGR and the dot in amber, LOL in white
function title(id, x, y, big) {
  const gap = 1.1, base = y + big * 10;
  const defs = `<linearGradient id="${id}a" x1="0" y1="${y}" x2="0" y2="${base}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffd24a"/><stop offset=".55" stop-color="${AMBER}"/><stop offset="1" stop-color="#f08a00"/></linearGradient>`
    + `<linearGradient id="${id}w" x1="0" y1="${y}" x2="0" y2="${base}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#cfd5de"/></linearGradient>`;
  const xLol = x + (wordWidth('MUGR.', gap) + gap) * big;
  const body = `<g transform="translate(0 ${f(base)}) skewX(-11) translate(0 ${f(-base)})">`
    + word('MUGR.', { x, y, scale: big, gap, fill: `url(#${id}a)`, side: '#7a3a00' })
    + word('LOL', { x: xLol, y, scale: big, gap, fill: `url(#${id}w)`, side: '#2a2e36' })
    + '</g>';
  const w = wordWidth('MUGR.LOL', gap) * big;
  const lean = Math.tan((11 * Math.PI) / 180) * (base - y); // how far the top of the letters moves right
  return { defs, body, width: w + big * 0.6 + lean, height: base - y + big * 0.5, lean, w };
}

// ------------------------------------------------------------------ the badge: 64 x 64
// The Courier, the default character, seen from the front: orange suit, padded hood, the long glowing visor,
// ear pieces, chin guard and shoulder pads (sizes from avatar.js, in game units, Z up).
const hex = (cx, cy, r) => Array.from({ length: 6 }, (_, i) => {
  const a = (Math.PI / 3) * i - Math.PI / 2;
  return `${f(cx + Math.cos(a) * r)} ${f(cy + Math.sin(a) * r)}`;
}).join(' ');

const SUIT = '#e8732a', PAD = '#8c3c15', PAD_LIGHT = '#b8571f', INK = '#0c0c0e', GLOW = '#59ccff';
function badge(id, { detail = true } = {}) {
  const k = 1.62; // pixels per game unit
  const X = (y) => f(32 + y * k); // across
  const Y = (z) => f(23 - (z - 29.2) * k); // up, measured on the torso; the head's centre is at 29.2
  const W = (n) => f(n * k);
  const line = detail ? ` stroke="${INK}" stroke-width=".9" stroke-linejoin="round"` : '';
  const rect = (y0, z1, w, h, r, fill, extra = '') => `<rect x="${X(y0)}" y="${Y(z1)}" width="${W(w)}" height="${W(h)}" rx="${W(r)}" fill="${fill}"${extra}/>`;
  // the chest, from the lathe profile [radius, height]
  const chest = [[3.5, 22], [7, 20.5], [9.2, 17.5], [9.4, 14], [8.4, 8], [8.4, -6]];
  const chestD = 'M' + chest.map(([r, z]) => `${X(-r)} ${Y(z)}`).join('L') + 'L' + chest.slice().reverse().map(([r, z]) => `${X(r)} ${Y(z)}`).join('L') + 'Z';
  const defs = `<defs>
<radialGradient id="${id}h" cx=".5" cy=".38" r=".7"><stop offset="0" stop-color="#2e333d"/><stop offset="1" stop-color="${DARK}"/></radialGradient>
<radialGradient id="${id}p" cx=".36" cy=".28" r=".85"><stop offset="0" stop-color="${PAD_LIGHT}"/><stop offset="1" stop-color="${PAD}"/></radialGradient>
<linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c25c1e"/><stop offset=".4" stop-color="${SUIT}"/><stop offset="1" stop-color="#b9561b"/></linearGradient>
<filter id="${id}g" x="-50%" y="-150%" width="200%" height="400%"><feGaussianBlur stdDeviation="2"/></filter>
<clipPath id="${id}c"><polygon points="${hex(32, 32, 28.4)}"/></clipPath>
</defs>`;
  const body = [
    // arms and shoulder pads behind the chest
    ...[-1, 1].map((s) => rect(s * 11 - 2.6, 18, 5.2, 30, 1.2, `url(#${id}s)`, line)),
    `<path d="${chestD}" fill="url(#${id}s)"${line}/>`,
    ...[-1, 1].map((s) => `<circle cx="${X(s * 10.6)}" cy="${Y(19.5)}" r="${W(5.2)}" fill="url(#${id}p)"${line}/>`),
    rect(-6.5, 18, 13, 9, 1.5, PAD, line), // chest plate
    ...(detail ? [-1, 1].map((s) => rect(s * 6 - 1.1, 22.6, 2.2, 1.6, 0.4, INK)) : []), // pack straps
    // neck, hood, ears, chin guard
    rect(-3, 24, 6, 4, 1, PAD, line),
    `<circle cx="32" cy="${Y(29.2)}" r="${W(7)}" fill="url(#${id}p)"${line}/>`,
    ...[-1, 1].map((s) => rect(s > 0 ? 6 : -7.8, 31.8, 1.8, 4.8, 0.6, INK)),
    rect(-3, 26.9, 6, 2.6, 1.1, INK),
    // the visor: one long glowing bar
    rect(-6.3, 31.9, 12.6, 5.2, 1, GLOW, ` filter="url(#${id}g)" opacity=".95"`),
    rect(-5.5, 31.5, 11, 4, 0.4, '#e9f8ff'),
    ...(detail ? [rect(-5, 31.1, 10, 0.9, 0.4, '#ffffff', ' opacity=".9"')] : []),
  ].join('');
  return defs
    + `<polygon points="${hex(32, 32, 30)}" fill="url(#${id}h)"/>`
    + `<g clip-path="url(#${id}c)">${body}</g>`
    + `<polygon points="${hex(32, 32, 30)}" fill="none" stroke="${AMBER}" stroke-width="3.4" stroke-linejoin="round"/>`
    + (detail ? `<polygon points="${hex(32, 32, 27.6)}" fill="none" stroke="#000" stroke-opacity=".45" stroke-width="1" stroke-linejoin="round"/>` : '');
}

const svg = (w, h, body, label) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${label}"><title>${label}</title>${body}</svg>\n`;

// the wordmark: badge on the left, the title beside it
const wt = title('w', 148, 40, 6.4);
const wordmark = svg(Math.ceil(148 + wt.width + 4), 144,
  `<defs>${wt.defs}</defs><g transform="translate(4 8) scale(2)">${badge('w')}</g>${wt.body}`, NAME);

// stacked: badge on top, the title centred under it (for square spaces)
const SW = 340, big = 4.6;
const st0 = title('s', 0, 178, big);
const st = title('s', (SW - st0.w - st0.lean / 2) / 2, 178, big); // centred on the middle of the lean
const stacked = svg(SW, Math.ceil(178 + st.height + 6),
  `<defs>${st.defs}</defs><g transform="translate(${SW / 2 - 80} 4) scale(2.5)">${badge('s')}</g>${st.body}`, NAME);

const files = {
  'logo.svg': wordmark,
  'logo-stacked.svg': stacked,
  'badge.svg': svg(64, 64, badge('b'), NAME),
  // tiny sizes: no small details
  'favicon.svg': svg(64, 64, badge('f', { detail: false }), NAME),
};
for (const [name, text] of Object.entries(files)) {
  fs.writeFileSync(path.join(OUT, name), text);
  console.log(name, text.length, 'bytes');
}
