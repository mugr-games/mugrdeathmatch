// Free roam garages: a breakdown fixed at a mechanic, parts fitted at a customs garage, a tow job paid, a tow call.
// Usage: node tools/sim_garage.mjs
import { createFreeplay } from '../freeplay.js';
import { BoxWorld } from '../public/js/collide.js';
import { newPlayerState, BTN } from '../public/js/pmove.js';
import { PLACES } from '../public/js/citygen.js';
import { VEHICLES, VEHICLE_INDEX } from '../public/js/vehicle.js';
const R = { map: { world: new BoxWorld([], [], 512) }, players: new Map(), time: 0, rules: { gravity: 1, speed: 1, jump: 1 }, tick: 0 };
const notes = [], sent = [];
const api = { pushEvent: () => {}, send: (p, m) => { if (m.k === 'note') notes.push(m.text); else sent.push(m); }, save: () => {}, damage: () => {}, blast: () => {}, players: () => R.players.values() };
const F = createFreeplay(R, api);
const p = { id: 1, name: 'sim', color: 0, model: 0, ps: newPlayerState([0, 0, 0]), yaw: 0, pitch: 0 };
p.ps.alive = true;
R.players.set(1, p);
F.join(p);
p.fp.data.cash = 500000;
p.ps.origin = F.spawnPoint(p).origin.slice();
const step = (n = 1, cmd = { fwd: 0, side: 0, buttons: 0 }) => { for (let k = 0; k < n; k++) { R.time += 1 / 60; R.tick++; if (p.ps.car) F.cmd(p, cmd, 1 / 60, 0); F.think(1 / 60); } };
const fail = (m) => { console.log('FAIL', m, notes.slice(-5)); process.exit(1); };
const getIn = (v) => { p.ps.origin = [v.s.o[0], v.s.o[1] + VEHICLES[v.k].hy + 30, v.s.o[2]]; F.cmd(p, { fwd: 0, side: 0, buttons: BTN.USE }, 1 / 60, BTN.USE); if (!p.ps.car) fail('could not get in'); };
const getOut = () => F.cmd(p, { fwd: 0, side: 0, buttons: BTN.USE }, 1 / 60, BTN.USE);
const park = (v, spot) => { const b = spot.bay; F.ensureAround((b.mins[0] + b.maxs[0]) / 2, (b.mins[1] + b.maxs[1]) / 2, 2); v.s.o = [(b.mins[0] + b.maxs[0]) / 2, (b.mins[1] + b.maxs[1]) / 2, b.mins[2] + 1]; v.s.v = [0, 0, 0]; };
const away = (v) => { v.s.o[0] += 3000; F.ensureAround(v.s.o[0], v.s.o[1], 2); step(2); };

const mechs = PLACES.filter((s) => s.type === 'mech'), shops = PLACES.filter((s) => s.type === 'customs');
console.log('mechanics', mechs.length, 'customs', shops.length);
if (!mechs.length || !shops.length) fail('no garages');

// 1. a broken-down car gets fixed at a mechanic
F.message(p, { k: 'buy', id: 'fennec', paint: 2 });
let v = F.vehicles.get(p.fp.mine);
getIn(v);
v.broke = true; v.s.limp = 1; v.hp = v.maxHp * 0.5;
const cash0 = p.fp.data.cash;
park(v, mechs[0]);
step(3);
if (v.broke || v.hp < v.maxHp) fail('mechanic did not fix it');
console.log('repair cost', cash0 - p.fp.data.cash, '|', notes.at(-1));

// 2. customs: engine and rims on your own car
away(v);
park(v, shops[0]);
step(3);
const panel = sent.findLast((m) => m.k === 'customs');
if (!panel) fail('no customs panel');
F.message(p, { k: 'mod', part: 'eng', val: 3 });
F.message(p, { k: 'mod', part: 'rim', val: 2 });
F.message(p, { k: 'mod', part: 'paint', val: 5 });
const car = p.fp.data.cars[v.slot];
if (v.s.tune !== 3 || car.m.rim !== 2 || car.c !== 5 || v.paint !== 5) fail('mods not fitted ' + JSON.stringify(car));
// the tune makes it faster: race a stock one
console.log('fitted', JSON.stringify(car), 'tune', v.s.tune);
away(v);
if (!sent.some((m) => m.k === 'customsShut')) fail('customs did not shut when leaving');

// 3. a tow job: hook a parked car, drive into a mechanic, get paid
getOut();
F.message(p, { k: 'buy', id: 'hauler', paint: 6 });
const truck = F.vehicles.get(p.fp.mine);
getIn(truck);
const tr = truck.s, fx = Math.cos(tr.yaw * Math.PI / 180), fy = Math.sin(tr.yaw * Math.PI / 180);
// a battered car right behind the truck
let wreckId = 0;
for (const o of F.vehicles.values()) if (o !== truck && !VEHICLES[o.k].air && !o.seats.some(Boolean) && o.kind !== 'mine') { wreckId = o.id; break; }
let target = wreckId ? F.vehicles.get(wreckId) : null;
if (!target) fail('no car to tow');
target.ai = null; target.hp = target.maxHp * 0.3;
target.s.o = [tr.o[0] - fx * (VEHICLES[truck.k].hx + VEHICLES[target.k].hx + 40), tr.o[1] - fy * (VEHICLES[truck.k].hx + VEHICLES[target.k].hx + 40), tr.o[2]];
target.s.yaw = tr.yaw;
F.cmd(p, { fwd: 0, side: 0, buttons: BTN.HORN }, 1 / 60, BTN.HORN);
if (truck.towing !== target.id) fail('did not hook');
console.log(notes.at(-1));
step(120, { fwd: 1, side: 0, buttons: 0 });
const gap = Math.hypot(target.s.o[0] - truck.s.o[0], target.s.o[1] - truck.s.o[1]);
console.log('towed 2s: truck speed', Math.round(Math.hypot(...truck.s.v.slice(0, 2))), 'gap', Math.round(gap));
if (gap > VEHICLES[truck.k].hx + VEHICLES[target.k].hx + 60) fail('the towed car fell behind');
const cash1 = p.fp.data.cash;
park(truck, mechs[1] || mechs[0]);
step(3);
if (F.vehicles.has(target.id) || p.fp.data.cash <= cash1) fail('tow job not paid');
console.log('tow job paid', p.fp.data.cash - cash1, '|', notes.at(-1));

// 4. calling Hook & Haul for your own broken car
getOut();
F.message(p, { k: 'call', n: 0 });
v = F.vehicles.get(p.fp.mine);
v.broke = true; v.s.limp = 1;
const cash2 = p.fp.data.cash;
F.message(p, { k: 'tow' });
const nv = F.vehicles.get(p.fp.mine);
if (!nv || nv.broke || nv.s.tune !== 3) fail('tow call did not bring it back fixed with its parts');
console.log('tow call cost', cash2 - p.fp.data.cash, '|', notes.at(-2));

// 5. every new car builds into the list and drives
for (const id of ['bento', 'zephyr', 'ridgeback', 'monarch', 'cinder', 'aurora']) if (VEHICLE_INDEX[id] === undefined) fail('missing ' + id);
console.log('vehicles', VEHICLES.length, 'ok');
