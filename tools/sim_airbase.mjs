// Free roam: walk into Fort Talon, steal a fighter, take off and fly away while the missile sites fire.
// Reports the wanted level, soldiers, missiles and whether the jet survived. Usage: node tools/sim_airbase.mjs [flares]
import { createFreeplay } from '../freeplay.js';
import { BoxWorld } from '../public/js/collide.js';
import { newPlayerState, BTN } from '../public/js/pmove.js';
import { AIRFIELDS } from '../public/js/citygen.js';
import { VEHICLES } from '../public/js/vehicle.js';
const useFlares = process.argv[2] === 'flares';
const R = { map: { world: new BoxWorld([], [], 512) }, players: new Map(), time: 0, rules: { gravity: 1, speed: 1, jump: 1 }, tick: 0 };
const ev = {}, notes = [];
let dmg = 0;
const api = { pushEvent: (e) => { ev[e.e] = (ev[e.e] || 0) + 1; }, send: (p, m) => m.k === 'note' && notes.push(m.text), save: () => {}, damage: (p, a, d) => { dmg += d; }, blast: () => {}, players: () => R.players.values() };
const F = createFreeplay(R, api);
const base = AIRFIELDS.find((a) => a.military);
const p = { id: 1, name: 'sim', color: 0, model: 0, ps: newPlayerState([base.center[0], base.min[1] - 3000, 1]), yaw: 0, pitch: 0 };
p.ps.alive = true; p.ps.time = 0;
R.players.set(1, p);
F.join(p);
const tick = (n, cmd = { fwd: 0, side: 0, buttons: 0, yaw: 0, pitch: 0 }, pressed = 0) => { for (let k = 0; k < n; k++) { R.time += 1 / 60; R.tick++; if (p.ps.car || p.ps.seat) F.cmd(p, typeof cmd === 'function' ? cmd(k) : cmd, 1 / 60, k === 0 ? pressed : 0); F.think(1 / 60); } };
tick(120);
const jets = [...F.vehicles.values()].filter((v) => VEHICLES[v.k].id === 'talon');
const jet = jets[0];
p.ps.origin = [jet.s.o[0], jet.s.o[1] + 80, 1];
tick(30);
const soldiersBefore = [...F.peds.values()].filter((n) => n.soldier).length;
F.cmd(p, { fwd: 0, side: 0, buttons: BTN.USE, yaw: 0, pitch: 0 }, 1 / 60, BTN.USE);
console.log({ jetsParked: jets.length, inJet: !!p.ps.car, wanted: p.fp.wanted, soldiers: soldiersBefore });
// taxi out and take off south (yaw 270 along the apron, then turn to the runway heading east)
// taxi south off the apron onto the runway, turn east, full power, pull up past lift-off speed
const runwayY = base.runwayJ * 2048 + 1000;
const ang = (a, b) => ((b - a) % 360 + 540) % 360 - 180;
tick(60 * 30, () => {
  const s = jet.s, sp = Math.hypot(...s.v);
  const want = s.o[1] > runwayY + 60 ? 270 : 0;
  const d = ang(s.yaw, want);
  return { fwd: Math.abs(d) > 30 ? (sp > 150 ? -1 : 0.2) : 1, side: Math.abs(d) > 3 ? -Math.sign(d) : 0, buttons: 0, yaw: want, pitch: sp > VEHICLES[jet.k].vr ? (s.o[2] > 2500 ? 0 : -15) : 0 };
});
console.log('after takeoff', { g: jet.s.g, o: jet.s.o.map(Math.round), speed: Math.round(Math.hypot(...jet.s.v)), hp: jet.hp });
let flareN = 0;
for (let s = 0; s < 40 && p.ps.car; s++) {
  tick(60, (k) => ({ fwd: 1, side: 0, buttons: 0, yaw: 0, pitch: jet.s.o[2] > 3000 ? 0 : -8 }), useFlares && F.missiles.size && s % 3 === 0 ? (flareN++, BTN.ROCKETJUMP) : 0);
}
const v = F.vehicles.get(jet.id);
console.log({ stillFlying: !!p.ps.car, jetHp: v ? Math.round(v.hp) : 'gone', o: v?.s.o.map(Math.round), wanted: p.fp.wanted, distFromBase: v ? Math.round(Math.hypot(v.s.o[0] - base.center[0], v.s.o[1] - base.center[1])) : null, missilesLaunched: ev.lock || 0, booms: ev.boom || 0, flares: ev.flare || 0, playerDamage: dmg, notes: notes.slice(-3) });
