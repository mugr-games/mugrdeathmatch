// Runs free roam on its own (no network) with one still player and reports cars that stopped moving, with what
// their AI was doing. For tuning traffic. Usage: node tools/sim_freeroam.mjs [seconds]
import { createFreeplay } from '../freeplay.js';
import { BoxWorld } from '../public/js/collide.js';
import { newPlayerState } from '../public/js/pmove.js';
import { VEHICLES } from '../public/js/vehicle.js';
import { signal } from '../public/js/citygen.js';
const secs = +(process.argv[2] || 120);
const R = { map: { world: new BoxWorld([], [], 512) }, players: new Map(), time: 0, rules: { gravity: 1, speed: 1, jump: 1 }, tick: 0 };
const events = {};
const api = { pushEvent: (e) => { events[e.e] = (events[e.e] || 0) + 1; }, send: () => {}, save: () => {}, damage: () => {}, blast: () => {}, players: () => R.players.values() };
const F = createFreeplay(R, api);
const p = { id: 1, name: 'sim', color: 0, model: 0, ps: newPlayerState([0, 0, 0]), yaw: 0, pitch: 0 };
p.ps.alive = true;
R.players.set(1, p);
F.join(p);
const s = F.spawnPoint(p);
p.ps.origin = s.origin.slice();
const still = new Map();
const TICK = 1 / 60;
const t0 = performance.now();
let reported = 0;
for (let k = 0; k < secs * 60; k++) {
  R.time += TICK; R.tick++;
  F.think(TICK);
  if (k % 30) continue;
  for (const v of F.vehicles.values()) {
    if (!v.ai) continue;
    const sp = Math.hypot(v.s.v[0], v.s.v[1]);
    if (sp > 25) { still.delete(v.id); continue; }
    if (!still.has(v.id)) still.set(v.id, R.time);
    if (R.time - still.get(v.id) > 20 && reported < 8 && !v.reported) {
      v.reported = true; reported++;
      const ai = v.ai, q = ai.pts[0];
      const near = [...F.vehicles.values()].filter((o) => o !== v && Math.hypot(o.s.o[0] - v.s.o[0], o.s.o[1] - v.s.o[1]) < 500).map((o) => ({ id: o.id, d: Math.round(Math.hypot(o.s.o[0] - v.s.o[0], o.s.o[1] - v.s.o[1])), yaw: Math.round(o.s.yaw), ai: !!o.ai }));
      const peds = [...F.peds.values()].filter((n) => Math.hypot(n.ps.origin[0] - v.s.o[0], n.ps.origin[1] - v.s.o[1]) < 400).map((n) => ({ st: n.state, d: Math.round(Math.hypot(n.ps.origin[0] - v.s.o[0], n.ps.origin[1] - v.s.o[1])) }));
      console.log(JSON.stringify({ id: v.id, kind: VEHICLES[v.k].id, o: v.s.o.map(Math.round), yaw: Math.round(v.s.yaw), g: v.s.g, mode: ai.mode, next: ai.next, pt0: q && { x: Math.round(q.x), y: Math.round(q.y), stop: q.stop, sig: q.stop && signal(q.stop[0], q.stop[1], q.stop[2], R.time), turn: q.turn }, why: ai.why, chain: (() => { const out = []; let c = v; for (let k = 0; k < 5 && c && c.ai; k++) { const m = /ahead (\d+)/.exec(c.ai.why || ''); out.push(c.id + ':' + (c.ai.why || '-') + '@' + Math.round(c.s.yaw)); c = m ? F.vehicles.get(+m[1]) : null; } return out.join(' > '); })(), npts: ai.pts.length, stuckN: ai.stuckN, revT: ai.revT, near, peds,
        holders: q && q.jn ? [...(F._debug().junctions.get(q.jn.key) || new Map())].map(([id, r]) => { const o = F.vehicles.get(id); return { id, d: r.d, e: r.e, age: +(R.time - r.t).toFixed(1), o: o && o.s.o.map(Math.round), sp: o && Math.round(Math.hypot(o.s.v[0], o.s.v[1])), yaw: o && Math.round(o.s.yaw), pt: o && o.ai && o.ai.pts[0] && [Math.round(o.ai.pts[0].x), Math.round(o.ai.pts[0].y)], rev: o?.ai?.revT, stuckN: o?.ai?.stuckN }; }) : null }));
    }
  }
}
console.log({ simSecs: secs, ms: Math.round(performance.now() - t0), msPerTick: ((performance.now() - t0) / (secs * 60)).toFixed(3), vehicles: F.vehicles.size, peds: F.peds.size, boxes: R.map.world.boxes.length, events });
