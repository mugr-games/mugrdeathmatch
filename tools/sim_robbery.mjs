// Free roam: rob a gas station (stand at the counter aiming at the cashier), then stand still and let the
// police come. Reports the take, the wanted level, police cars and officers, and the shots that hit you.
// Usage: node tools/sim_robbery.mjs
import { createFreeplay } from '../freeplay.js';
import { BoxWorld } from '../public/js/collide.js';
import { newPlayerState, pmove } from '../public/js/pmove.js';
import { PLACES } from '../public/js/citygen.js';
const R = { map: { world: new BoxWorld([], [], 512) }, players: new Map(), time: 0, rules: { gravity: 1, speed: 1, jump: 1 }, tick: 0 };
const log = { notes: [], hits: 0, dmg: 0, events: {} };
const api = {
  pushEvent: (e) => { log.events[e.e] = (log.events[e.e] || 0) + 1; }, send: (p, m) => m.k === 'note' && log.notes.push(+R.time.toFixed(1) + ' ' + m.text), save: () => {},
  damage: (p, a, d) => { log.hits++; log.dmg += d; }, blast: () => {}, players: () => R.players.values(),
};
const F = createFreeplay(R, api);
const gas = PLACES.find((s) => s.type === 'gas' && s.where === 'Port Halcyon');
const p = { id: 1, name: 'sim', color: 0, model: 0, ps: newPlayerState(gas.front.slice()), yaw: 0, pitch: 0 };
p.ps.alive = true; p.ps.time = 0;
R.players.set(1, p);
F.join(p);
F.loadout(p);
p.ps.origin = [gas.front[0], gas.front[1], gas.front[2] + 1];
const cash0 = p.fp.data.cash;
const aim = () => {
  const c = [...F.peds.values()].find((n) => n.kind === 'clerk');
  if (!c) return;
  const e = [p.ps.origin[0], p.ps.origin[1], p.ps.origin[2] + 64], t = [c.ps.origin[0], c.ps.origin[1], c.ps.origin[2] + 50];
  p.yaw = Math.atan2(t[1] - e[1], t[0] - e[0]) * 180 / Math.PI;
  p.pitch = -Math.atan2(t[2] - e[2], Math.hypot(t[0] - e[0], t[1] - e[1])) * 180 / Math.PI;
};
let robbedAt = null, maxW = 0, maxCops = 0, maxCars = 0;
for (let k = 0; k < 60 * 70; k++) {
  R.time += 1 / 60; R.tick++;
  if (!robbedAt) aim(); else p.yaw += 0.3; // look around once it's done
  F.think(1 / 60);
  pmove(R.map.world, p.ps, { fwd: 0, side: 0, buttons: 0, yaw: p.yaw, pitch: p.pitch }, 1 / 60, R.rules);
  if (!robbedAt && log.events.robbed) robbedAt = R.time;
  // pick up the cash on the counter
  if (robbedAt && R.time - robbedAt < 3) for (const c of F.cash.values()) p.ps.origin = [c.o[0], c.o[1], p.ps.origin[2]];
  maxW = Math.max(maxW, p.fp.wanted);
  if (process.env.TRACE && k % 300 === 0) {
    const d = (o) => Math.round(Math.hypot(o[0] - p.ps.origin[0], o[1] - p.ps.origin[1]));
    console.log('t', k / 60, 'w', p.fp.wanted, 'cops', [...F.peds.values()].filter((n) => n.kind === 'cop').map((n) => `${n.state}@${d(n.ps.origin)}${n.los ? ' LOS' : ''}${n.inDoor ? ' door' : ''}`).join(', '),
      '| cars', [...F.vehicles.values()].filter((v) => v.kind === 'police').map((v) => `${v.ai?.mode}@${d(v.s.o)} hp${Math.round(v.hp)} sp${Math.round(Math.hypot(v.s.v[0], v.s.v[1]))}`).join(', '));
  }
  maxCops = Math.max(maxCops, [...F.peds.values()].filter((n) => n.kind === 'cop' && n.state === 'hunt').length);
  maxCars = Math.max(maxCars, [...F.vehicles.values()].filter((v) => v.kind === 'police').length);
}
console.log({ station: gas.id, robbedAt: robbedAt && +robbedAt.toFixed(1), took: p.fp.data.cash - cash0, maxWanted: maxW, wantedNow: p.fp.wanted, policeCars: maxCars, copsHunting: maxCops, shotsThatHit: log.hits, damage: log.dmg, events: log.events, notes: log.notes.slice(0, 6) });
