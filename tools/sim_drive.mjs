// Free roam: buy a car, get in and drive it around for a while, reporting memory and where things grow.
// Usage: node tools/sim_drive.mjs [seconds]
import { createFreeplay } from '../freeplay.js';
import { BoxWorld } from '../public/js/collide.js';
import { newPlayerState, BTN } from '../public/js/pmove.js';
const secs = +(process.argv[2] || 60);
const R = { map: { world: new BoxWorld([], [], 512) }, players: new Map(), time: 0, rules: { gravity: 1, speed: 1, jump: 1 }, tick: 0 };
let events = 0;
const api = { pushEvent: () => { events++; }, send: () => {}, save: () => {}, damage: () => {}, blast: () => {}, players: () => R.players.values() };
const F = createFreeplay(R, api);
const p = { id: 1, name: 'sim', color: 0, model: 0, ps: newPlayerState([0, 0, 0]), yaw: 0, pitch: 0 };
p.ps.alive = true;
R.players.set(1, p);
F.join(p);
p.ps.origin = F.spawnPoint(p).origin.slice();
F.message(p, { k: 'buy', id: 'pip', paint: 3 });
const v = F.vehicles.get(p.fp.mine);
p.ps.origin = [v.s.o[0], v.s.o[1] + 60, v.s.o[2]];
F.cmd(p, { fwd: 0, side: 0, buttons: BTN.USE }, 1 / 60, BTN.USE);
console.log('in car', !!p.ps.car);
for (let k = 0; k < secs * 60; k++) {
  R.time += 1 / 60; R.tick++;
  const steer = Math.sin(k / 200) > 0.6 ? 1 : 0;
  F.cmd(p, { fwd: 1, side: steer, buttons: 0 }, 1 / 60, 0);
  F.think(1 / 60);
  if (k % 600 === 0) {
    const m = process.memoryUsage().heapUsed / 1e6;
    console.log('t', k / 60, 'heap MB', m.toFixed(0), 'car', v.s.o.map(Math.round), 'speed', Math.round(Math.hypot(v.s.v[0], v.s.v[1])), 'boxes', R.map.world.boxes.length, 'dyn', R.map.world.dyn.length, 'veh', F.vehicles.size, 'peds', F.peds.size, 'events', events);
    F.view(p, true);
  }
}
