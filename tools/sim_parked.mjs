// Free roam: buy a car, leave it parked on the road and watch what traffic does to it. Usage: node tools/sim_parked.mjs [seconds]
import { createFreeplay } from '../freeplay.js';
import { BoxWorld } from '../public/js/collide.js';
import { newPlayerState } from '../public/js/pmove.js';
const secs = +(process.argv[2] || 60);
const R = { map: { world: new BoxWorld([], [], 512) }, players: new Map(), time: 0, rules: { gravity: 1, speed: 1, jump: 1 }, tick: 0 };
const notes = [];
const api = { pushEvent: (e) => { if (e.e === 'vhit') notes.push(['vhit', +R.time.toFixed(1), e.o, e.k]); }, send: (p, m) => m.k === 'note' && notes.push(m.text), save: () => {}, damage: (p, a, d, k) => notes.push(['damage', d, k, +R.time.toFixed(1)]), blast: () => {}, players: () => R.players.values() };
const F = createFreeplay(R, api);
const p = { id: 1, name: 'sim', color: 0, model: 0, ps: newPlayerState([0, 0, 0]), yaw: 0, pitch: 0 };
p.ps.alive = true;
R.players.set(1, p);
F.join(p);
p.ps.origin = F.spawnPoint(p).origin.slice();
F.message(p, { k: 'buy', id: 'pip', paint: 3 });
const v = F.vehicles.get(p.fp.mine);
const start = v.s.o.slice();
let last = start.slice();
for (let k = 0; k < secs * 60; k++) {
  R.time += 1 / 60; R.tick++;
  F.think(1 / 60);
  if (k % 60 === 0) {
    const moved = Math.hypot(v.s.o[0] - last[0], v.s.o[1] - last[1]);
    if (moved > 5) console.log('t', k / 60, 'car moved', Math.round(moved), 'to', v.s.o.map(Math.round), 'v', v.s.v.map(Math.round), 'hp', Math.round(v.hp));
    last = v.s.o.slice();
  }
}
console.log({ start: start.map(Math.round), end: v.s.o.map(Math.round), hp: Math.round(v.hp), player: p.ps.origin.map(Math.round), notes: notes.slice(0, 20) });
