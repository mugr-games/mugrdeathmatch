// All game sounds are synthesised with Web Audio (the only sound files are songs for emotes). The detailed ones (guns, explosions,
// footsteps, impacts, voices) are layered designs rendered once into buffers when audio starts, a few
// variations each, so playing them costs one buffer voice. Every 3D sound is panned, muffled with distance
// and sent to a room reverb, more so the farther away it is. Positions are in game units.
import { api } from './net.js';
import { EMOTE } from './cosmetics.js';

const GUNS = {
  // punch: start of the low thump (Hz), body: blast cutoff (Hz), crack: snap brightness, len: blast seconds,
  // tail: echo seconds, mech: action clack delay (s, 0 = none), drive: distortion, vol
  pistol: { punch: 150, body: 3200, crack: 1, len: 0.07, tail: 0.35, mech: 0.05, drive: 3, vol: 0.75 },
  '357': { punch: 95, body: 2200, crack: 1.2, len: 0.13, tail: 0.8, mech: 0, drive: 5, vol: 1 },
  smg1: { punch: 170, body: 3600, crack: 0.9, len: 0.05, tail: 0.25, mech: 0.035, drive: 2.5, vol: 0.6 },
  ar2: { punch: 120, body: 2600, crack: 1, len: 0.07, tail: 0.45, mech: 0.04, drive: 3.5, vol: 0.75, zap: true },
  shotgun: { punch: 80, body: 1600, crack: 1.3, len: 0.17, tail: 0.9, mech: 0, drive: 6, vol: 1 },
  sniper: { punch: 70, body: 2000, crack: 1.6, len: 0.15, tail: 1.4, mech: 0, drive: 6, vol: 1.1 },
  lmg: { punch: 115, body: 2800, crack: 1, len: 0.07, tail: 0.4, mech: 0.04, drive: 4, vol: 0.7 },
  autoshotgun: { punch: 85, body: 1800, crack: 1.2, len: 0.14, tail: 0.7, mech: 0.06, drive: 5, vol: 0.9 },
  railgun: { punch: 60, body: 1200, crack: 1.4, len: 0.2, tail: 1.2, mech: 0, drive: 3, vol: 1, rail: true },
};
const SURFACES = ['stone', 'grass', 'metal', 'wood'];
const VARIANTS = 3;

// ------------------------------------------------------------------ offline sound design helpers
// Each helper builds nodes on an OfflineAudioContext `c` and connects them to `out`.
function noiseBuf(c, sec = 2) {
  const n = Math.floor(c.sampleRate * sec), b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return b;
}
// gain envelope from [time, value] points (exponential where both ends are above zero)
function shape(param, t0, pts) {
  param.setValueAtTime(Math.max(pts[0][1], 0.0001), t0 + pts[0][0]);
  for (let i = 1; i < pts.length; i++) param.exponentialRampToValueAtTime(Math.max(pts[i][1], 0.0001), t0 + pts[i][0]);
}
function noise(c, out, t, dur) {
  const s = c.createBufferSource();
  s.buffer = c._noise || (c._noise = noiseBuf(c));
  s.start(t, Math.random() * 0.8, dur + 0.02);
  s.connect(out);
  return s;
}
function filt(c, type, f, q = 0.7) {
  const n = c.createBiquadFilter();
  n.type = type;
  n.frequency.value = f;
  n.Q.value = q;
  return n;
}
function gain(c, out) {
  const g = c.createGain();
  g.gain.value = 0;
  g.connect(out);
  return g;
}
function osc(c, out, type, t, dur, f0, f1, curve = 'exp') {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== undefined && f1 !== f0) {
    if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + dur);
    else o.frequency.linearRampToValueAtTime(f1, t + dur);
  }
  o.start(t);
  o.stop(t + dur + 0.02);
  o.connect(out);
  return o;
}
// soft clipping: adds grit and makes short blasts sound louder without peaking
function drive(c, out, amount) {
  const ws = c.createWaveShaper(), n = 1024, curve = new Float32Array(n);
  for (let i = 0; i < n; i++) { const x = (i / (n - 1)) * 2 - 1; curve[i] = Math.tanh(x * amount) / Math.tanh(amount); }
  ws.curve = curve;
  ws.oversample = '2x';
  ws.connect(out);
  return ws;
}
// a burst of filtered noise with a gain envelope; f may be [start, end] for a sweep
function hiss(c, out, t, type, f, q, pts) {
  const fl = filt(c, type, Array.isArray(f) ? f[0] : f, q), g = gain(c, out);
  const dur = pts[pts.length - 1][0];
  if (Array.isArray(f)) { fl.frequency.setValueAtTime(f[0], t); fl.frequency.exponentialRampToValueAtTime(f[1], t + dur); }
  noise(c, fl, t, dur);
  fl.connect(g);
  shape(g.gain, t, pts);
}
function tone(c, out, t, type, f0, f1, pts) {
  const g = gain(c, out);
  osc(c, g, type, t, pts[pts.length - 1][0], f0, f1);
  shape(g.gain, t, pts);
}
const rnd = (a, b) => a + Math.random() * (b - a);

// a mechanical click: a resonant tick with a short metallic ring
function clack(c, out, t, pitch = 1, v = 1) {
  hiss(c, out, t, 'bandpass', 3800 * pitch, 5, [[0, 0.001], [0.0008, v], [0.025, 0.001]]);
  tone(c, out, t, 'triangle', 2400 * pitch, 2000 * pitch, [[0, 0.001], [0.001, v * 0.25], [0.05, 0.001]]);
  hiss(c, out, t, 'lowpass', 900 * pitch, 1, [[0, 0.001], [0.001, v * 0.5], [0.02, 0.001]]);
}

const DESIGNS = {
  gun(c, out, P) {
    const t = 0.002, dr = drive(c, out, P.drive);
    // 1 the supersonic crack: a few milliseconds of bright noise
    hiss(c, out, t, 'highpass', 2500, 0.7, [[0, 0.001], [0.0005, 0.9 * P.crack], [0.012, 0.001]]);
    // 2 the blast: noise whose cutoff falls fast, driven for punch
    hiss(c, dr, t, 'lowpass', [P.body * rnd(1.6, 2), P.body * 0.18], 0.9, [[0, 0.001], [0.001, 1], [P.len * 0.4, 0.5], [P.len * 1.6, 0.001]]);
    // 3 the chest thump: a fast pitch drop
    tone(c, dr, t, 'sine', P.punch * 2.6, P.punch * 0.45, [[0, 0.001], [0.002, 1], [0.05 + P.len * 0.6, 0.3], [0.14 + P.len, 0.001]]);
    // 4 the tail rolling off the surroundings: dark noise with a long decay
    hiss(c, out, t + 0.01, 'lowpass', [1400, 220], 0.6, [[0, 0.001], [0.03, 0.22], [P.tail, 0.001]]);
    // 5 the action cycling
    if (P.mech) clack(c, out, t + P.mech * rnd(0.9, 1.1), rnd(0.9, 1.15), 0.35);
    if (P.zap) tone(c, out, t, 'sawtooth', 2600, 380, [[0, 0.001], [0.002, 0.12], [0.09, 0.001]]);
    if (P.rail) {
      tone(c, out, t, 'sawtooth', 220, 3200, [[0, 0.001], [0.01, 0.12], [0.35, 0.001]]);
      tone(c, out, t, 'sine', 1800, 120, [[0, 0.001], [0.003, 0.3], [0.6, 0.001]]);
    }
  },
  explosion(c, out) {
    const dr = drive(c, out, 4);
    hiss(c, out, 0, 'highpass', 1800, 0.6, [[0, 0.001], [0.001, 1], [0.04, 0.001]]);
    hiss(c, dr, 0, 'lowpass', [4000, 160], 0.8, [[0, 0.001], [0.004, 1], [0.25, 0.4], [1.3, 0.001]]);
    tone(c, dr, 0, 'sine', 95, 26, [[0, 0.001], [0.005, 1], [0.4, 0.5], [1.4, 0.001]]);
    hiss(c, out, 0.08, 'lowpass', [500, 120], 0.5, [[0, 0.001], [0.15, 0.5], [2.6, 0.001]]); // rumble
    // debris pattering down
    for (let i = 0; i < 26; i++) {
      const at = rnd(0.12, 1.6);
      hiss(c, out, at, 'bandpass', rnd(1500, 5000), 3, [[0, 0.001], [0.001, rnd(0.05, 0.2) * (1.7 - at)], [0.02, 0.001]]);
    }
  },
  // thunder: a crack, then a long low roll with a few rumbles in it
  thunder(c, out) {
    const dr = drive(c, out, 2);
    hiss(c, out, 0, 'highpass', 2500, 0.4, [[0, 0.001], [0.01, 0.5], [0.3, 0.001]]);
    hiss(c, dr, 0.05, 'lowpass', [900, 90], 0.7, [[0, 0.001], [0.08, 0.9], [1, 0.5], [3.5, 0.001]]);
    tone(c, dr, 0.05, 'sine', 70, 28, [[0, 0.001], [0.1, 0.7], [1.2, 0.4], [3.4, 0.001]]);
    for (let i = 0; i < 5; i++) {
      const at = rnd(0.3, 2.4);
      hiss(c, out, at, 'lowpass', [600, 150], 0.6, [[0, 0.001], [0.06, rnd(0.2, 0.45)], [0.8, 0.001]]);
    }
  },
  step(c, out, surface) {
    // heel then toe
    for (const [at, v] of [[0, 1], [rnd(0.025, 0.04), 0.6]]) {
      if (surface === 'grass') {
        hiss(c, out, at, 'highpass', rnd(2500, 3500), 0.5, [[0, 0.001], [0.01, 0.5 * v], [0.09, 0.001]]);
        hiss(c, out, at, 'lowpass', 400, 0.7, [[0, 0.001], [0.004, 0.5 * v], [0.06, 0.001]]);
      } else if (surface === 'metal') {
        hiss(c, out, at, 'bandpass', rnd(1800, 2600), 2, [[0, 0.001], [0.002, 0.7 * v], [0.04, 0.001]]);
        for (const f of [rnd(480, 560), rnd(1250, 1400), rnd(2900, 3200)]) tone(c, out, at, 'sine', f, f * 0.99, [[0, 0.001], [0.002, 0.07 * v], [0.25, 0.001]]);
      } else if (surface === 'wood') {
        hiss(c, out, at, 'bandpass', rnd(500, 700), 2.5, [[0, 0.001], [0.002, 0.9 * v], [0.06, 0.001]]);
        tone(c, out, at, 'sine', 210, 150, [[0, 0.001], [0.002, 0.4 * v], [0.07, 0.001]]);
      } else {
        hiss(c, out, at, 'bandpass', rnd(1100, 1600), 1.2, [[0, 0.001], [0.0015, 0.8 * v], [0.035, 0.001]]);
        hiss(c, out, at + 0.004, 'highpass', 4000, 0.7, [[0, 0.001], [0.002, 0.15 * v], [0.05, 0.001]]); // grit
      }
      tone(c, out, at, 'sine', 95, 55, [[0, 0.001], [0.003, 0.5 * v], [0.06, 0.001]]);
    }
  },
  land(c, out) {
    hiss(c, out, 0, 'lowpass', [900, 200], 0.8, [[0, 0.001], [0.003, 1], [0.18, 0.001]]);
    tone(c, out, 0, 'sine', 110, 40, [[0, 0.001], [0.003, 0.9], [0.18, 0.001]]);
    hiss(c, out, 0.02, 'bandpass', 2600, 2, [[0, 0.001], [0.002, 0.15], [0.05, 0.001]]); // gear rattle
  },
  impact(c, out) {
    hiss(c, out, 0, 'bandpass', rnd(2500, 4500), 1.5, [[0, 0.001], [0.0008, 1], [0.03, 0.001]]);
    hiss(c, out, 0, 'lowpass', 700, 1, [[0, 0.001], [0.001, 0.4], [0.05, 0.001]]);
    for (let i = 0; i < 5; i++) hiss(c, out, rnd(0.015, 0.12), 'bandpass', rnd(3000, 7000), 4, [[0, 0.001], [0.001, rnd(0.05, 0.15)], [0.012, 0.001]]);
  },
  ricochet(c, out) {
    const t = 0.01, f = rnd(3200, 4600);
    const g = gain(c, out), o = osc(c, g, 'sine', t, 0.45, f, f * 0.4);
    const lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = rnd(28, 40);
    lg.gain.value = 120;
    lfo.connect(lg).connect(o.frequency);
    lfo.start(t);
    lfo.stop(t + 0.5);
    shape(g.gain, t, [[0, 0.001], [0.01, 0.22], [0.45, 0.001]]);
    hiss(c, out, 0, 'highpass', 3000, 1, [[0, 0.001], [0.001, 0.6], [0.02, 0.001]]);
  },
  flesh(c, out) {
    hiss(c, out, 0, 'lowpass', [900, 250], 1.2, [[0, 0.001], [0.002, 1], [0.12, 0.001]]);
    hiss(c, out, 0.01, 'bandpass', [1400, 500], 3, [[0, 0.001], [0.01, 0.35], [0.1, 0.001]]); // wet
    tone(c, out, 0, 'sine', 150, 55, [[0, 0.001], [0.002, 0.7], [0.12, 0.001]]);
  },
  clang(c, out) {
    // a struck metal bar: inharmonic partials, the high ones dying first
    const base = rnd(380, 460);
    for (const [k, v, d] of [[1, 0.35, 0.9], [2.76, 0.25, 0.6], [5.4, 0.18, 0.35], [8.93, 0.1, 0.2], [13.3, 0.06, 0.12]]) tone(c, out, 0, 'sine', base * k, base * k * 0.995, [[0, 0.001], [0.001, v], [d, 0.001]]);
    hiss(c, out, 0, 'highpass', 2500, 0.8, [[0, 0.001], [0.0008, 0.8], [0.03, 0.001]]);
  },
  thunk(c, out) {
    hiss(c, out, 0, 'bandpass', 700, 2, [[0, 0.001], [0.002, 0.9], [0.09, 0.001]]);
    tone(c, out, 0, 'triangle', 180, 90, [[0, 0.001], [0.002, 0.4], [0.12, 0.001]]);
  },
  swing(c, out) {
    hiss(c, out, 0, 'bandpass', [350, 2400], 1.8, [[0, 0.001], [0.09, 0.7], [0.22, 0.001]]);
  },
  // a short voiced grunt: a buzzy source with breath through three vowel formants
  voice(c, out, kind) {
    const len = kind === 'death' ? 0.55 : 0.24, f0 = rnd(105, 150);
    const src = c.createGain();
    const g = gain(c, out);
    const o = osc(c, src, 'sawtooth', 0, len, f0 * (kind === 'death' ? 1.25 : 1.1), f0 * 0.62);
    const vib = c.createOscillator(), vg = c.createGain();
    vib.frequency.value = 7;
    vg.gain.value = f0 * 0.03;
    vib.connect(vg).connect(o.frequency);
    vib.start(0);
    vib.stop(len + 0.05);
    hiss(c, src, 0, 'bandpass', 1500, 0.6, [[0, 0.001], [0.02, 0.25], [len, 0.001]]); // breath
    const vowel = kind === 'death' ? [[700, 1100, 2500], [520, 900, 2400]] : [[650, 1080, 2650], [600, 1000, 2500]];
    vowel[0].forEach((f, i) => {
      const fl = filt(c, 'bandpass', f, [7, 9, 11][i]);
      fl.frequency.setValueAtTime(f, 0);
      fl.frequency.linearRampToValueAtTime(vowel[1][i], len);
      const fg = c.createGain();
      fg.gain.value = [1, 0.6, 0.25][i];
      src.connect(fl).connect(fg).connect(g);
    });
    shape(g.gain, 0, [[0, 0.001], [0.015, 1.6], [len * 0.6, 1], [len, 0.001]]);
  },
  groan(c, out) {
    const len = rnd(0.9, 1.4), f0 = rnd(70, 105);
    const src = c.createGain(), g = gain(c, out);
    osc(c, src, 'sawtooth', 0, len, f0, f0 * 0.75);
    hiss(c, src, 0, 'bandpass', 900, 1, [[0, 0.001], [0.1, 0.5], [len, 0.001]]);
    // rasp: tremble the level quickly
    const am = c.createOscillator(), ag = c.createGain();
    am.frequency.value = rnd(18, 30);
    ag.gain.value = 0.35;
    am.connect(ag).connect(g.gain);
    am.start(0);
    am.stop(len + 0.05);
    for (const [f0v, f1v, q] of [[400, 600, 6], [800, 950, 8]]) {
      const fl = filt(c, 'bandpass', f0v, q);
      fl.frequency.setValueAtTime(f0v, 0);
      fl.frequency.linearRampToValueAtTime(f1v, len);
      src.connect(fl).connect(g);
    }
    shape(g.gain, 0, [[0, 0.001], [0.2, 0.9], [len * 0.7, 0.6], [len, 0.001]]);
  },
  bolt(c, out) {
    tone(c, out, 0, 'triangle', 240, 150, [[0, 0.001], [0.002, 0.5], [0.3, 0.001]]); // string
    tone(c, out, 0, 'sine', 690, 430, [[0, 0.001], [0.002, 0.25], [0.2, 0.001]]);
    hiss(c, out, 0, 'bandpass', 2600, 3, [[0, 0.001], [0.001, 0.6], [0.05, 0.001]]);
    hiss(c, out, 0.02, 'bandpass', [3000, 1200], 2, [[0, 0.001], [0.02, 0.2], [0.18, 0.001]]); // whoosh
  },
  rocket(c, out) {
    const dr = drive(c, out, 3);
    hiss(c, dr, 0, 'lowpass', [2500, 500], 0.7, [[0, 0.001], [0.005, 1], [0.4, 0.001]]);
    tone(c, dr, 0, 'sine', 150, 45, [[0, 0.001], [0.004, 0.8], [0.3, 0.001]]);
    hiss(c, out, 0.03, 'bandpass', [500, 2600], 1.4, [[0, 0.001], [0.08, 0.5], [0.8, 0.001]]); // motor
  },
  bounce(c, out) {
    hiss(c, out, 0, 'bandpass', 1300, 3, [[0, 0.001], [0.001, 0.7], [0.04, 0.001]]);
    tone(c, out, 0, 'triangle', rnd(900, 1200), 700, [[0, 0.001], [0.001, 0.25], [0.1, 0.001]]);
  },
  // reload pieces
  magout(c, out) {
    hiss(c, out, 0, 'bandpass', [1600, 3200], 3, [[0, 0.001], [0.03, 0.3], [0.12, 0.001]]); // slide out
    clack(c, out, 0.01, 0.8, 0.6);
  },
  magin(c, out) {
    hiss(c, out, 0, 'bandpass', [3000, 1800], 3, [[0, 0.001], [0.02, 0.25], [0.08, 0.001]]);
    clack(c, out, 0.08, 0.7, 0.9);
    tone(c, out, 0.08, 'sine', 160, 90, [[0, 0.001], [0.002, 0.4], [0.06, 0.001]]);
  },
  rack(c, out) {
    clack(c, out, 0, 1, 0.8);
    hiss(c, out, 0.01, 'bandpass', [2200, 4200], 3, [[0, 0.001], [0.02, 0.2], [0.07, 0.001]]);
    clack(c, out, 0.09, 1.2, 1);
  },
  pump(c, out) {
    clack(c, out, 0, 0.55, 0.9);
    hiss(c, out, 0.01, 'bandpass', [900, 1800], 2, [[0, 0.001], [0.04, 0.3], [0.12, 0.001]]);
    clack(c, out, 0.16, 0.5, 1);
    hiss(c, out, 0.17, 'bandpass', [1800, 900], 2, [[0, 0.001], [0.04, 0.3], [0.12, 0.001]]);
    clack(c, out, 0.3, 0.45, 0.8);
  },
  click(c, out) {
    clack(c, out, 0, 1, 1);
  },
  dry(c, out) {
    clack(c, out, 0, 1.5, 0.7);
  },
};

// [name, seconds, design, argument, variations]
const BAKE = [
  ...Object.entries(GUNS).map(([id, P]) => ['gun:' + id, 0.25 + P.tail + P.len, 'gun', P, VARIANTS]),
  ['explosion', 3, 'explosion', null, 2], ['thunder', 4, 'thunder', null, 2],
  ...SURFACES.map((s) => ['step:' + s, 0.3, 'step', s, 4]),
  ['land', 0.3, 'land', null, 2], ['impact', 0.2, 'impact', null, 4], ['ricochet', 0.5, 'ricochet', null, 3],
  ['flesh', 0.2, 'flesh', null, 3], ['clang', 1, 'clang', null, 3], ['thunk', 0.2, 'thunk', null, 2], ['swing', 0.25, 'swing', null, 2],
  ['death', 0.6, 'voice', 'death', 3], ['groan', 1.5, 'groan', null, 4],
  ['bolt', 0.35, 'bolt', null, 1], ['rocket', 0.9, 'rocket', null, 2], ['bounce', 0.15, 'bounce', null, 2],
  ['magout', 0.15, 'magout', null, 2], ['magin', 0.2, 'magin', null, 2], ['rack', 0.15, 'rack', null, 2], ['pump', 0.45, 'pump', null, 2],
  ['click', 0.06, 'click', null, 2], ['dry', 0.06, 'dry', null, 1],
];

async function bakeAll(sampleRate) {
  const out = {};
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  for (const [name, sec, design, arg, n] of BAKE) {
    out[name] = [];
    for (let i = 0; i < n; i++) {
      const c = new OAC(1, Math.ceil(sec * sampleRate), sampleRate);
      DESIGNS[design](c, c.destination, arg);
      out[name].push(await c.startRendering());
    }
  }
  return out;
}

// ------------------------------------------------------------------ emote music
// Original loops, one for each dance, written here as notes and drum hits and rendered into a buffer the
// first time someone does that emote. Loops are rendered twice over and the second pass kept, so the tails
// of the last bar ring on into the first and the loop has no seam.
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
function kick(c, out, t, v = 1, low = 42) {
  tone(c, out, t, 'sine', 165, low, [[0, 0.001], [0.004, v], [0.12, v * 0.5], [0.38, 0.001]]);
  hiss(c, out, t, 'lowpass', 3500, 0.7, [[0, 0.001], [0.001, v * 0.3], [0.012, 0.001]]);
}
function clap(c, out, t, v = 1) {
  for (const d of [0, 0.011, 0.022]) hiss(c, out, t + d, 'bandpass', 1500, 1.3, [[0, 0.001], [0.002, v * 0.55], [0.08, 0.001]]);
  hiss(c, out, t + 0.03, 'bandpass', 1250, 0.9, [[0, 0.001], [0.004, v * 0.4], [0.25, 0.001]]);
}
function snare(c, out, t, v = 1) {
  tone(c, out, t, 'triangle', 220, 160, [[0, 0.001], [0.002, v * 0.5], [0.12, 0.001]]);
  hiss(c, out, t, 'highpass', 1800, 0.7, [[0, 0.001], [0.002, v * 0.6], [0.18, 0.001]]);
}
function hat(c, out, t, v = 0.25, open = false) {
  hiss(c, out, t, 'highpass', 7500, 0.8, [[0, 0.001], [0.001, v], [open ? 0.24 : 0.035, 0.001]]);
}
// an 808: a sine sub with grit, gliding to f1
function sub(c, out, t, f, dur, v = 1, f1 = f) {
  const g = gain(c, drive(c, out, 2.4));
  osc(c, g, 'sine', t, dur, f, f1);
  shape(g.gain, t, [[0, 0.001], [0.008, v], [dur * 0.7, v * 0.6], [dur, 0.001]]);
}
// the phonk cowbell: two detuned squares through a ringing band-pass
function cowbell(c, out, t, f, v = 1) {
  const bp = filt(c, 'bandpass', f * 1.25, 2.2), g = gain(c, out);
  bp.connect(g);
  osc(c, bp, 'square', t, 0.32, f);
  osc(c, bp, 'square', t, 0.32, f * 1.505);
  shape(g.gain, t, [[0, 0.001], [0.002, v], [0.06, v * 0.35], [0.32, 0.001]]);
}
// a plucked note: a bright attack that closes down
function pluck(c, out, t, f, dur, v = 1, type = 'triangle', bright = 3200) {
  const lp = filt(c, 'lowpass', bright, 1.2), g = gain(c, out);
  lp.connect(g);
  lp.frequency.setValueAtTime(bright, t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(200, bright * 0.2), t + dur);
  osc(c, lp, type, t, dur, f);
  shape(g.gain, t, [[0, 0.001], [0.005, v], [dur, 0.001]]);
}
// a chord stab of saws, a little detuned
function stab(c, out, t, notes, dur, v = 0.5, bright = 2600) {
  for (const n of notes) for (const det of [-6, 6]) pluck(c, out, t, midi(n) * Math.pow(2, det / 1200), dur, v / notes.length, 'sawtooth', bright);
}

// each one: tempo, length in beats, whether it loops, volume, and play(c, out, start, beat seconds)
const MUSIC = {
  // trap bounce in F minor, 140: rolling hats, a gliding 808 and a bell riff
  griddy: { bpm: 140, beats: 16, loop: true, vol: 0.9, play(c, out, t0, B) {
    const s = B / 4;
    const bassline = [[29, 41], [29, 41], [25, 37], [27, 39]]; // per bar: the 808 note and where it slides
    const riff = [[0, 77], [3, 80], [6, 84], [8, 82], [10, 80], [12, 77], [14, 75]];
    const riff2 = [[0, 77], [3, 80], [6, 84], [8, 87], [10, 85], [12, 84], [13, 82], [14, 80]];
    for (let bar = 0; bar < 4; bar++) {
      const tb = t0 + bar * 16 * s;
      for (const k of [0, 6, 10]) kick(c, out, tb + k * s, 0.95);
      if (bar % 2) kick(c, out, tb + 14 * s, 0.7);
      clap(c, out, tb + 8 * s, 0.8);
      for (let k = 0; k < 16; k += 2) hat(c, out, tb + k * s, k % 4 ? 0.14 : 0.2);
      if (bar % 2) for (let k = 0; k < 6; k++) hat(c, out, tb + 12 * s + k * ((s * 4) / 6), 0.12 + k * 0.02); // a roll into the next bar
      const [n, slide] = bassline[bar];
      sub(c, out, tb, midi(n), 6 * s, 0.9);
      sub(c, out, tb + 6 * s, midi(n), 4 * s, 0.85);
      sub(c, out, tb + 10 * s, midi(n), 6 * s, 0.85, midi(slide));
      for (const [k, m] of bar < 3 ? riff : riff2) pluck(c, out, tb + k * s, midi(m), 0.32, 0.22, 'triangle', 5200);
    }
  } },
  // a Brazilian-funk phonk groove in G minor, 130: a cowbell hook over a distorted 808 and a funk beat
  clark: { bpm: 103.4, beats: 16, loop: true, vol: 0.85, play(c, out, t0, B) {
    const s = B / 4;
    const hook = [[0, 79], [2, 79], [3, 82], [5, 81], [6, 79], [8, 86], [10, 84], [11, 82], [13, 81], [14, 77]];
    const hook2 = [[0, 79], [2, 79], [3, 82], [5, 81], [6, 79], [8, 74], [9, 77], [10, 79], [12, 82], [14, 81]];
    const bass = [31, 31, 27, 29];
    for (let bar = 0; bar < 4; bar++) {
      const tb = t0 + bar * 16 * s;
      for (const k of [0, 3, 7, 10, 12]) kick(c, out, tb + k * s, k ? 0.85 : 1, 38);
      for (const k of [4, 12]) clap(c, out, tb + k * s, 0.75);
      snare(c, out, tb + 14 * s, 0.3);
      for (let k = 2; k < 16; k += 4) hat(c, out, tb + k * s, 0.16, k === 14);
      sub(c, out, tb, midi(bass[bar]), 7 * s, 0.95);
      sub(c, out, tb + 7 * s, midi(bass[bar]), 9 * s, 0.9, midi(bass[bar] - (bar === 3 ? 5 : 0)));
      for (const [k, m] of bar % 2 ? hook2 : hook) cowbell(c, out, tb + k * s, midi(m - 12), 0.42);
    }
  } },
  // disco in A minor, 118: four on the floor, an octave bass, chord stabs and a string line
  verity: { bpm: 105.2, beats: 16, loop: true, vol: 0.8, play(c, out, t0, B) {
    const s = B / 4;
    const chords = [[57, 60, 64, 67], [57, 60, 64, 67], [50, 54, 57, 60, 64], [52, 56, 59, 62]]; // Am7 Am7 D9 E7
    const roots = [33, 33, 38, 40];
    const line = [[0, 76], [4, 79], [6, 81], [10, 79], [12, 76], [14, 74]];
    for (let bar = 0; bar < 4; bar++) {
      const tb = t0 + bar * 16 * s;
      for (let k = 0; k < 16; k += 4) kick(c, out, tb + k * s, 0.9, 50);
      for (const k of [4, 12]) clap(c, out, tb + k * s, 0.6);
      for (let k = 2; k < 16; k += 4) hat(c, out, tb + k * s, 0.2, true);
      for (let k = 1; k < 16; k += 2) hat(c, out, tb + k * s, 0.07);
      for (let k = 0; k < 16; k += 2) pluck(c, out, tb + k * s, midi(roots[bar] + (k % 4 ? 12 : 0)), 0.2, 0.5, 'sawtooth', 900);
      for (const k of [3, 6, 11, 14]) stab(c, out, tb + k * s, chords[bar], 0.22, 0.32, 3000);
      if (bar % 2 === 0) for (const [k, m] of line) pluck(c, out, tb + k * s, midi(m), 0.5, 0.12, 'sawtooth', 2400);
    }
  } },
  // a bright little hello: a marimba arpeggio up and a sparkle
  wave: { bpm: 120, beats: 5, loop: false, vol: 0.7, play(c, out, t0, B) {
    [72, 76, 79, 84, 88].forEach((m, i) => pluck(c, out, t0 + i * B * 0.25, midi(m), 0.45, 0.35, 'sine', 4000));
    for (let i = 0; i < 6; i++) pluck(c, out, t0 + 1.3 + i * 0.06, midi(96 + (i % 3) * 3), 0.25, 0.08, 'sine', 8000);
  } },
  // the drop: a snare build, then a big hit and a sub falling away
  dab: { bpm: 120, beats: 4.4, loop: false, vol: 0.85, play(c, out, t0) {
    for (let i = 0; i < 8; i++) snare(c, out, t0 + i * 0.05, 0.15 + i * 0.07);
    kick(c, out, t0 + 0.45, 1.2, 30);
    clap(c, out, t0 + 0.45, 0.8);
    sub(c, out, t0 + 0.45, midi(36), 1.5, 1, midi(24));
    stab(c, out, t0 + 0.45, [60, 63, 67, 70], 0.9, 0.5, 4000);
  } },
};

async function bakeMusic(id, sampleRate) {
  const M = MUSIC[id];
  const B = 60 / M.bpm, len = M.beats * B;
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const c = new OAC(1, Math.ceil((M.loop ? len * 2 : len + 0.5) * sampleRate), sampleRate);
  const bus = c.createGain();
  bus.gain.value = 0.55;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.15;
  bus.connect(comp).connect(c.destination);
  M.play(c, bus, 0, B);
  if (M.loop) M.play(c, bus, len, B);
  const full = await c.startRendering();
  // a loop keeps the second pass: exactly one loop, with the first pass's tails in it
  const n = M.loop ? Math.round(len * sampleRate) : full.length;
  const d = full.getChannelData(0).slice(full.length - n);
  const out = new AudioBuffer({ length: n, numberOfChannels: 1, sampleRate });
  out.copyToChannel(d, 0);
  return level(out);
}

// an emote's song from its file, decoded and levelled like the rest
async function loadSong(c, file) {
  const r = await fetch(api('/sounds/emotes/' + file));
  if (!r.ok) throw new Error('no song ' + file);
  return level(await c.decodeAudioData(await r.arrayBuffer()));
}

// level every piece of emote music alike: about the same loudness, never clipping
function level(buf) {
  let peak = 0, sq = 0, n = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) { peak = Math.max(peak, Math.abs(d[i])); sq += d[i] * d[i]; }
    n += d.length;
  }
  const k = Math.min(0.9 / Math.max(peak, 1e-4), 0.17 / Math.max(Math.sqrt(sq / n), 1e-4));
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
  return buf;
}

// room reverb: a few early reflections, then a diffuse tail that darkens as it decays
function reverbIR(c, sec = 1.8) {
  const len = Math.floor(c.sampleRate * sec), ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const k = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.9 - 0.75 * k); // one-pole lowpass closing over time
      d[i] = lp * Math.pow(1 - k, 2.4) * (i < c.sampleRate * 0.012 ? i / (c.sampleRate * 0.012) : 1);
    }
    for (let r = 0; r < 7; r++) {
      const at = Math.floor(c.sampleRate * (0.011 + r * 0.013 + Math.random() * 0.01));
      d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.7 - r * 0.08);
    }
  }
  return ir;
}

export class Synth {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.scene = 1; // quieter while the menu watches a game in the background
    this.buf = null;
    this.ear = [0, 0, 0];
  }

  start() {
    if (!this.ctx) {
      const c = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
      this.master = c.createGain();
      this.master.gain.value = this.volume * this.scene;
      // glue compressor, then a brick-wall limiter so stacked gunfire never clips
      const glue = c.createDynamicsCompressor();
      glue.threshold.value = -18; glue.knee.value = 12; glue.ratio.value = 3; glue.attack.value = 0.005; glue.release.value = 0.2;
      const lim = c.createDynamicsCompressor();
      lim.threshold.value = -3; lim.knee.value = 0; lim.ratio.value = 20; lim.attack.value = 0.001; lim.release.value = 0.08;
      this.master.connect(glue).connect(lim).connect(c.destination);
      this.verb = c.createConvolver();
      this.verb.buffer = reverbIR(c);
      const wet = c.createGain();
      wet.gain.value = 0.5;
      this.verb.connect(wet).connect(this.master);
      // generic noise for the simple realtime sounds
      this.noise = noiseBuf(c);
      bakeAll(c.sampleRate).then((b) => { this.buf = b; }).catch((e) => console.warn('sound baking failed', e));
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v * this.scene;
  }

  setScene(k) {
    if (k === this.scene) return;
    this.scene = k;
    if (this.master) this.master.gain.value = this.volume * k;
  }

  // the output chain for one sound: distance muffling, 3D panning and a reverb send
  out(pos, vol, verb = 0.12) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = vol;
    if (pos) {
      const d = Math.hypot(pos[0] - this.ear[0], pos[1] - this.ear[1], pos[2] - this.ear[2]);
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = Math.max(900, 20000 * Math.exp(-d / 1800));
      const p = c.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 160;
      p.rolloffFactor = 1.1;
      p.maxDistance = 10000;
      if (p.positionX) { p.positionX.value = pos[0]; p.positionY.value = pos[1]; p.positionZ.value = pos[2]; }
      else p.setPosition(...pos);
      g.connect(lp).connect(p).connect(this.master);
      const send = c.createGain();
      // far away, most of what you hear is the echo
      send.gain.value = verb + Math.min(0.6, d / 3500);
      lp.connect(send).connect(this.verb);
    } else {
      g.connect(this.master);
      const send = c.createGain();
      send.gain.value = verb;
      g.connect(send).connect(this.verb);
    }
    return g;
  }

  // play a baked sound; false when it isn't ready yet
  play(name, pos, vol = 1, rate = 0.06, verb) {
    const list = this.buf?.[name];
    if (!list) return false;
    const s = this.ctx.createBufferSource();
    s.buffer = list[(Math.random() * list.length) | 0];
    s.playbackRate.value = 1 + (Math.random() * 2 - 1) * rate;
    s.connect(this.out(pos, vol, verb));
    s.start();
    return true;
  }

  later(sec, fn) {
    setTimeout(fn, sec * 1000);
  }

  // ------------------------------------------------------------------ simple realtime sounds (UI, music cues)
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone(dest, t, type, f0, f1, dur, vol, attack = 0.004) {
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    this.env(g, t, attack, vol, dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  // a soft bell-like note: sine plus a quiet octave, for pickups and menus
  note(dest, t, f, dur, vol) {
    this.tone(dest, t, 'sine', f, f, dur, vol);
    this.tone(dest, t, 'triangle', f * 2, f * 2, dur * 0.5, vol * 0.25);
  }

  // ------------------------------------------------------------------ game sounds
  gun(id, pos, own) {
    if (!this.ctx) return;
    const P = GUNS[id];
    if (!P) return;
    this.play('gun:' + id, pos, P.vol * (own ? 0.85 : 1.1), 0.05, own ? 0.18 : 0.12);
  }

  // projectile weapons: crossbow twang, rocket launch, grenade throw
  launch(kind, pos) {
    if (!this.ctx) return;
    if (kind === 'bolt') this.play('bolt', pos, 0.9);
    else if (kind === 'rocket') this.play('rocket', pos, 1);
    else {
      this.swing(pos);
      this.click(pos, 1.3, 0.4); // pin
    }
  }

  bounce(pos) {
    if (this.ctx) this.play('bounce', pos, 0.6, 0.15);
  }

  thunk(pos, flesh) {
    if (!this.ctx) return;
    if (flesh) return this.clang(pos, true);
    this.play('thunk', pos, 0.7);
  }

  explosion(pos) {
    if (this.ctx) this.play('explosion', pos, 1.5, 0.08, 0.3);
  }

  thunder() {
    if (this.ctx) this.play('thunder', null, 1.1, 0.15, 0.4);
  }

  // a steady hiss of rain while a stormy map is up (quieter below decks)
  rain(on, muffled = false) {
    if (!this.ctx) return;
    if (on && !this.rainSrc) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noise;
      s.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 2200; f.Q.value = 0.5;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0.06;
      s.connect(f).connect(this.rainGain).connect(this.master);
      s.start();
      this.rainSrc = s;
    } else if (!on && this.rainSrc) {
      this.rainSrc.stop();
      this.rainSrc = null;
    }
    if (this.rainGain) this.rainGain.gain.value = muffled ? 0.02 : 0.06;
  }

  // a dancer's music (an emote id), from where they are (null: your own, not placed in the world). Returns
  // { move(pos), stop() }; the music starts as soon as it's rendered (the first time takes a moment).
  emote(id, pos) {
    if (!this.ctx || !MUSIC[id]) return null;
    const c = this.ctx, M = MUSIC[id];
    this.music ||= {};
    const song = EMOTE[id]?.song;
    const ready = (this.music[id] ||= (song ? loadSong(c, song).catch((e) => { console.warn('emote song failed, using the synth loop', e); return bakeMusic(id, c.sampleRate); }) : bakeMusic(id, c.sampleRate))
      .catch((e) => { console.warn('emote music failed', e); return null; }));
    const g = c.createGain();
    g.gain.value = M.vol * (pos ? 1 : 0.6);
    let lp = null, pan = null;
    if (pos) {
      lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      pan = c.createPanner();
      pan.panningModel = 'HRTF';
      pan.distanceModel = 'inverse';
      pan.refDistance = 140;
      pan.rolloffFactor = 1.2;
      pan.maxDistance = 6000;
      g.connect(lp).connect(pan).connect(this.master);
      const send = c.createGain();
      send.gain.value = 0.15;
      lp.connect(send).connect(this.verb);
    } else g.connect(this.master);
    const h = {
      src: null, done: false,
      move: (p) => {
        if (!pan || !p) return;
        if (pan.positionX) { pan.positionX.value = p[0]; pan.positionY.value = p[1]; pan.positionZ.value = p[2]; }
        else pan.setPosition(...p);
        const d = Math.hypot(p[0] - this.ear[0], p[1] - this.ear[1], p[2] - this.ear[2]);
        lp.frequency.value = Math.max(700, 20000 * Math.exp(-d / 1500));
      },
      stop: () => {
        if (h.done) return;
        h.done = true;
        const t = c.currentTime;
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.linearRampToValueAtTime(0, t + 0.25);
        if (h.src) h.src.stop(t + 0.3);
        setTimeout(() => g.disconnect(), 400);
      },
    };
    h.move(pos);
    ready.then((buf) => {
      if (!buf || h.done) return;
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = M.loop;
      src.connect(g);
      src.start();
      h.src = src;
    });
    return h;
  }

  // the scrape of a slide along the ground
  slide(pos) {
    if (!this.ctx) return;
    const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(380, t + 0.7); f.Q.value = 0.8;
    const g = this.out(pos, 0.5, 0.1);
    const e = c.createGain();
    e.gain.setValueAtTime(0.0001, t); e.gain.exponentialRampToValueAtTime(0.9, t + 0.03); e.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    s.connect(f).connect(e).connect(g);
    s.start(t, Math.random(), 0.8);
  }

  swing(pos) {
    if (this.ctx) this.play('swing', pos, 0.6, 0.12);
  }

  clang(pos, flesh) {
    if (this.ctx) this.play(flesh ? 'flesh' : 'clang', pos, flesh ? 1 : 0.7);
  }

  click(pos, pitch = 1, vol = 0.4) {
    if (!this.ctx) return;
    const s = this.buf?.click;
    if (!s) return;
    const src = this.ctx.createBufferSource();
    src.buffer = s[(Math.random() * s.length) | 0];
    src.playbackRate.value = pitch * (0.95 + Math.random() * 0.1);
    src.connect(this.out(pos, vol * 1.6));
    src.start();
  }

  reload(id, pos, dur = 1.4) {
    if (!this.ctx) return;
    if (id === 'shotgun' || id === 'autoshotgun') { [0.2, 0.5].forEach((k) => this.later(k * dur, () => this.play('magin', pos, 0.6, 0.2))); this.later(0.8 * dur, () => this.pump(pos)); return; }
    // mag out, mag in, then rack the slide or bolt
    this.later(0.12 * dur, () => this.play('magout', pos, 0.7));
    this.later(0.55 * dur, () => this.play('magin', pos, 0.8));
    this.later(0.82 * dur, () => this.play('rack', pos, 0.8));
  }

  pump(pos) {
    if (this.ctx) this.play('pump', pos, 0.9, 0.03);
  }

  empty(pos) {
    if (this.ctx) this.play('dry', pos, 0.6, 0.03);
  }

  step(pos, vol = 0.35, surface = 'stone') {
    if (!this.ctx) return;
    this.play('step:' + (SURFACES.includes(surface) ? surface : 'stone'), pos, vol * 1.5, 0.1, 0.06);
  }

  land(pos, vol = 0.5) {
    if (this.ctx) this.play('land', pos, vol * 1.4, 0.1);
  }

  // getting hit: a body thud, no voice
  hurt(pos, own) {
    if (!this.ctx) return;
    this.play('flesh', pos, own ? 0.6 : 0.45);
  }

  death(pos) {
    if (!this.ctx) return;
    this.play('death', pos, 0.8, 0.06);
    this.later(0.45, () => this.land(pos, 0.7));
  }

  // the "you hit someone" tick: two bright partials, short and clean
  hitTick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.out(null, 0.22, 0);
    this.tone(o, t, 'sine', 2100, 2000, 0.05, 0.6, 0.001);
    this.tone(o, t, 'sine', 3300, 3200, 0.03, 0.25, 0.001);
  }

  impact(pos) {
    if (!this.ctx || Math.random() < 0.3) return;
    this.play('impact', pos, 0.55, 0.15);
    if (Math.random() < 0.18) this.play('ricochet', pos, 0.5, 0.1);
  }

  // a zombie's groan
  groan(pos) {
    if (this.ctx) this.play('groan', pos, 0.9, 0.12);
  }

  // round start: a low struck bell; round end: a short rising arpeggio
  roundStart() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.out(null, 0.5, 0.4);
    for (const [k, v] of [[1, 0.3], [2.4, 0.12], [3, 0.1], [4.2, 0.05]]) this.tone(o, t, 'sine', 110 * k, 110 * k * 0.995, 2.4 / Math.sqrt(k), v, 0.002);
  }

  roundEnd() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.out(null, 0.4, 0.3);
    [330, 440, 554, 659].forEach((f, i) => this.note(o, t + i * 0.11, f, 0.35, 0.22));
  }

  pickup(kind) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.out(null, 0.4, 0.15);
    const notes = kind === 'battery' ? [523, 784, 1047] : kind === 'ammo' ? [392, 523] : kind === 'weapon' ? [330, 494, 659] : [440, 554, 659];
    notes.forEach((f, i) => this.note(o, t + i * 0.055, f, 0.16, 0.28));
    if (kind === 'ammo' || kind === 'weapon') this.click(null, 0.8, 0.35);
  }

  ui(f = 900) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.out(null, 0.2, 0.05);
    this.tone(o, t, 'sine', f, f * 1.04, 0.06, 0.45, 0.002);
  }

  chat() {
    this.ui(1200);
    this.later(0.07, () => this.ui(1500));
  }

  listener(pos, fwd, up) {
    if (!this.ctx) return;
    this.ear = pos;
    const l = this.ctx.listener, t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos[0], t); l.positionY.setValueAtTime(pos[1], t); l.positionZ.setValueAtTime(pos[2], t);
      l.forwardX.setValueAtTime(fwd[0], t); l.forwardY.setValueAtTime(fwd[1], t); l.forwardZ.setValueAtTime(fwd[2], t);
      l.upX.setValueAtTime(up[0], t); l.upY.setValueAtTime(up[1], t); l.upZ.setValueAtTime(up[2], t);
    } else {
      l.setPosition(...pos);
      l.setOrientation(...fwd, ...up);
    }
  }
}
