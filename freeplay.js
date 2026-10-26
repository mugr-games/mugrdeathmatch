// Free roam in Mugr County, the server side. The world streams in around players; traffic and people live near
// them and vanish far away. Cars (bought on the phone, stolen from traffic, police cruisers), people who walk the
// pavements and run from gunfire, gas station tills to rob, gun shops, the wanted level and the police who come
// for you, and the money and things you own (kept on your profile).
import { genCell, G, N, RW, LANE, KERB, district, isUrban, roadFrom, roadH, roadV, exits, hasSignal, signal, DIRS, RIGHT, SPEED, PLACES, HOSPITALS, CITIES, nearestLane, cellOf, AIRFIELDS, inAirfield } from './public/js/citygen.js';
import { VEHICLES, VEHICLE_INDEX, PAINTS, newCar, vmove, amove, seatPos, carBoxes, touches } from './public/js/vehicle.js';
import { newPlayerState, pmove, BTN, MV } from './public/js/pmove.js';
import { WEAPONS, WEAPON_INDEX, GUN_SHOP, ARMOR_PRICE } from './public/js/weapons.js';
import { giveWeapon, initLoadout, hitTest } from './public/js/sim.js';
import { BoxWorld } from './public/js/collide.js';

const DEG = Math.PI / 180, D = 180 / Math.PI;
// FREEROAM_TEST=1 (testing only): start rich, at the airport
const TEST = process.env.FREEROAM_TEST === '1';
const START_CASH = TEST ? 1000000 : 10000;
const TRAFFIC = { urban: 14, rural: 5 }, PEOPLE = { urban: 18, rural: 2 };
const SPAWN_MIN = 3200, SPAWN_MAX = 7600, DESPAWN = 10500;
const PED_MIN = 1600, PED_MAX = 4600, PED_DESPAWN = 6800;
const SEE_V = 8000, SEE_P = 4600; // how far away cars and people are sent (the browser draws people out to 4500)
const DIR_YAW = [0, 90, 180, 270];
const COP_LOOK = 1 * 4 + 1; // trooper in blue
const SOLDIER_LOOK = 2 + 7 * 4; // juggernaut in graphite
const GARAGE = 20; // vehicles you can keep
const JAMAL = 1000; // what Jamal charges to make the police forget you
// airbase missiles: faster than any plane but they turn wider than a fighter, so hard turns and flares save you
const SAM = { speed: 6500, turn: 50, life: 12, range: 40000, every: 2.2, damage: 650 };
const AIRPORT = AIRFIELDS.find((a) => !a.military), AIRBASE = AIRFIELDS.find((a) => a.military);
const TRAFFIC_POOL = {
  urban: [['pip', 4], ['meridian', 5], ['cab', 2.5], ['courier', 1.5], ['bastion', 2], ['haybale', 1], ['thunderhoof', 0.5], ['vela', 0.35], ['nyx', 0.08], ['zip', 0.8], ['kestrel', 0.3], ['sprocket', 0.3]],
  rural: [['haybale', 4], ['meridian', 2], ['bastion', 2.5], ['courier', 1.5], ['pip', 1.5], ['thunderhoof', 0.8], ['mudlark', 0.6], ['kestrel', 0.4], ['vela', 0.3]],
};
const r1 = (v) => Math.round(v);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
const pick = (list) => { let t = 0; for (const [, w] of list) t += w; let r = Math.random() * t; for (const [k, w] of list) { if ((r -= w) <= 0) return k; } return list[0][0]; };
const randLook = () => ((Math.random() * 4) | 0) + ((Math.random() * 8) | 0) * 4;
const angDiff = (a, b) => ((b - a) % 360 + 540) % 360 - 180;

// the loop of pavement people walk around a town block, or null
function walkRect(i, j) {
  if (!isUrban(district(i, j))) return null;
  if (!roadV(i, j) || !roadV(i + 1, j) || !roadH(i, j) || !roadH(i, j + 1)) return null;
  return [i * G + RW + 60, j * G + RW + 60, (i + 1) * G - RW - 60, (j + 1) * G - RW - 60];
}
const corner = (w, k) => [k === 0 || k === 3 ? w[0] : w[2], k < 2 ? w[1] : w[3]];
// the junction next to each corner of a block: corner 0 is the block's bottom-left (node i, j)
const CORNER_NODE = [[0, 0], [1, 0], [1, 1], [0, 1]];
// crossing from corner k: [cell offset, corner you arrive at, the road crossed runs north-south?]
const CROSS = [[[-1, 0, 1, true], [0, -1, 3, false]], [[1, 0, 0, true], [0, -1, 2, false]], [[1, 0, 3, true], [0, 1, 1, false]], [[-1, 0, 2, true], [0, 1, 0, false]]];

// where a lane stops before a junction, and where it starts after one
const stopPt = (i, j, d) => [i * G - DIRS[d][0] * (RW + 95) + RIGHT[d][0] * LANE, j * G - DIRS[d][1] * (RW + 95) + RIGHT[d][1] * LANE];
const startPt = (i, j, e) => [i * G + DIRS[e][0] * (RW + 95) + RIGHT[e][0] * LANE, j * G + DIRS[e][1] * (RW + 95) + RIGHT[e][1] * LANE];
function turnPts(i, j, d, e) {
  const P = stopPt(i, j, d), Q = startPt(i, j, e);
  if (e === d) return [Q];
  if (e === (d + 2) % 4) {
    // turning round at a dead end
    const n = [i * G, j * G];
    return [[n[0] + RIGHT[d][0] * LANE * 1.6 + DIRS[d][0] * 40, n[1] + RIGHT[d][1] * LANE * 1.6 + DIRS[d][1] * 40], [n[0] - RIGHT[d][0] * LANE + DIRS[d][0] * 60, n[1] - RIGHT[d][1] * LANE + DIRS[d][1] * 60], Q];
  }
  const C = d % 2 === 0 ? [Q[0], P[1]] : [P[0], Q[1]];
  const out = [];
  for (const t of [0.25, 0.5, 0.75, 1]) {
    const a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
    out.push([a * P[0] + b * C[0] + c * Q[0], a * P[1] + b * C[1] + c * Q[1]]);
  }
  return out;
}

export function createFreeplay(R, api) {
  const F = { vehicles: new Map(), peds: new Map(), cash: new Map(), stores: new Map(), cells: new Set(), nextV: 1, nextP: 1, nextC: 1, popAt: 0, streamAt: 0 };
  const world = () => R.map.world;
  const now = () => R.time;
  const players = () => [...api.players()];
  const ev = (e, only) => api.pushEvent(e, only);
  const note = (p, text) => api.send(p, { t: 'fp', k: 'note', text });

  // ---------------------------------------------------------------- the world streams in around people
  function ensureCell(i, j) {
    if (i < -N || j < -N || i >= N || j >= N) return;
    const k = i + ',' + j;
    if (F.cells.has(k)) return;
    F.cells.add(k);
    const w = world();
    for (const b of genCell(i, j, false).boxes) w.addBox(b);
  }
  function ensureAround(x, y, r) {
    const ci = cellOf(x), cj = cellOf(y);
    for (let i = ci - r; i <= ci + r; i++) for (let j = cj - r; j <= cj + r; j++) ensureCell(i, j);
  }
  // long sessions: start the world again with just the parts near anyone
  function compact(people) {
    if (world().boxes.length < 90000) return;
    R.map.world = new BoxWorld([], [], 512);
    F.cells.clear();
    for (const p of people) ensureAround(p.ps.origin[0], p.ps.origin[1], 3);
    for (const v of F.vehicles.values()) ensureAround(v.s.o[0], v.s.o[1], 1);
    for (const n of F.peds.values()) ensureAround(n.ps.origin[0], n.ps.origin[1], 0);
  }
  F.ensureAround = ensureAround;
  F._debug = () => ({ junctions });

  // ---------------------------------------------------------------- money and things you own
  function load(p) {
    const pr = p.profile;
    const data = pr ? (pr.city ||= { cash: START_CASH, cars: [], guns: 0 }) : (p.cityTemp ||= { cash: START_CASH, cars: [], guns: 0 });
    data.cars = (data.cars || []).filter((c) => VEHICLES[c.k] && VEHICLES[c.k].shop);
    p.fp = { data, wanted: 0, seenAt: -99, dispatchAt: 0, mine: 0, insured: 0, diedAt: null, prompt: '', robProg: 0, lastHurt: -99, first: true, dirty: false };
  }
  function save(p) { if (p.profile) p.fp.dirty = true; }
  function pay(p, n) { const d = p.fp.data; if (d.cash < n) return false; d.cash -= n; save(p); return true; }
  function earn(p, n) { p.fp.data.cash += n; save(p); }
  function state(p) {
    api.send(p, { t: 'fp', k: 'state', cash: p.fp.data.cash, cars: p.fp.data.cars, guns: p.fp.data.guns });
  }

  F.join = (p) => { load(p); state(p); };
  // the owner's gift (or fine)
  F.giveCash = (p, n) => {
    if (!p.fp) return;
    p.fp.data.cash = Math.max(0, p.fp.data.cash + n);
    save(p);
    state(p);
    note(p, n >= 0 ? `The owner gave you $${n.toLocaleString()}!` : `The owner took $${(-n).toLocaleString()}.`);
  };
  // the profile arrives a moment after joining: switch to its money and garage, and hand over its guns
  F.profile = (p) => {
    if (!p.fp || !p.profile) return;
    const keep = p.fp;
    load(p);
    Object.assign(p.fp, { wanted: keep.wanted, seenAt: keep.seenAt, mine: keep.mine, first: keep.first, diedAt: keep.diedAt });
    const guns = p.fp.data.guns | 0;
    if (p.ps.alive) WEAPONS.forEach((w, i) => { if ((guns >> i) & 1 && !((p.ps.owned >> i) & 1)) giveWeapon(p.ps, i); });
    state(p);
  };
  F.leave = (p) => {
    leaveSeat(p, true);
    const v = F.vehicles.get(p.fp?.mine);
    if (v && !v.seats.some((o) => o && o !== p)) removeVehicle(v);
    if (p.fp?.dirty) api.save(p);
  };
  // freshly (re)spawned: crowbar, pistol and every gun you've bought
  F.loadout = (p) => {
    const ps = p.ps;
    initLoadout(ps, 'zombies');
    const guns = p.fp.data.guns | 0;
    WEAPONS.forEach((w, i) => { if ((guns >> i) & 1) giveWeapon(ps, i); });
    ps.cur = WEAPON_INDEX.pistol;
    ps.car = null;
    ps.seat = null;
  };
  F.spawnPoint = (p) => {
    let h = null;
    const at = p.fp?.diedAt;
    if (at) { let bd = Infinity; for (const x of HOSPITALS) { const d = dist2(x.door, at); if (d < bd) { bd = d; h = x; } } }
    else if (TEST) { const s = AIRPORT.stands[1]; ensureAround(s[0], s[1], 2); return { origin: [s[0] + 300, s[1] + 300, 2], yaw: 270 }; }
    else h = HOSPITALS.find((x) => x.where === CITIES[0].name) || HOSPITALS[0];
    const s = h.spawns[(Math.random() * h.spawns.length) | 0];
    ensureAround(s.origin[0], s.origin[1], 2);
    return { origin: s.origin.slice(), yaw: s.yaw };
  };
  F.died = (p) => {
    const fp = p.fp;
    if (!fp) return;
    leaveSeat(p, true);
    fp.diedAt = p.ps.origin.slice();
    if (fp.wanted) fp.wanted = 0;
    const bill = Math.min(fp.data.cash, 100);
    if (bill) { fp.data.cash -= bill; save(p); note(p, `Hospital bill: $${bill}`); }
  };

  // ---------------------------------------------------------------- vehicles
  function addVehicle(k, o, yaw, kind, paint) {
    const id = F.nextV++;
    const V = VEHICLES[k];
    const v = {
      id, k, kind, s: newCar(k, id, [o[0], o[1], (o[2] || 0) + 1], yaw), paint: paint ?? ((Math.random() * PAINTS.length) | 0),
      hp: V.hp, maxHp: V.hp, seats: new Array(V.seats).fill(null), npc: new Array(V.seats).fill(-1), ai: null, owner: 0,
      horn: 0, siren: false, brake: false, burn: false, wreck: 0, lastBy: null, born: now(), seenAt: now(),
    };
    F.vehicles.set(id, v);
    return v;
  }
  function removeVehicle(v) {
    for (const p of v.seats) if (p) leaveSeat(p, true);
    F.vehicles.delete(v.id);
    for (const p of players()) if (p.fp?.mine === v.id) p.fp.mine = 0;
  }
  const driverOf = (v) => v.seats[0] || null;
  const vehicleOf = (p) => (p.ps.car ? F.vehicles.get(p.ps.car.id) : p.ps.seat ? F.vehicles.get(p.ps.seat.v) : null);
  const speedOf = (v) => Math.hypot(v.s.v[0], v.s.v[1]);
  const lookOf = (p) => ((p.model | 0) % 4) + ((p.color | 0) % 8) * 4;

  function seatPlayer(p, v, s) {
    const V = VEHICLES[v.k];
    seatPos(v.s, V.seat[s], p.ps.origin);
    p.ps.velocity[0] = v.s.v[0]; p.ps.velocity[1] = v.s.v[1]; p.ps.velocity[2] = v.s.v[2];
    p.ps.onGround = true;
  }

  function enter(p, v) {
    if (v.wreck) return false;
    const V = VEHICLES[v.k];
    let s = -1;
    if (!v.seats[0]) s = 0;
    else for (let k = 1; k < V.seats; k++) if (!v.seats[k] && v.npc[k] < 0) { s = k; break; }
    if (s < 0) return false;
    if (s === 0 && v.npc.some((l) => l >= 0)) carjack(p, v);
    v.seats[s] = p;
    v.lastBy = p;
    const ps = p.ps;
    ps.ducked = true; ps.duckAmt = 1;
    if (s === 0) {
      ps.car = v.s; ps.seat = null;
      if (v.kind === 'traffic' || v.kind === 'police') v.kind = v.kind === 'police' ? 'police' : 'stolen';
      v.ai = null;
    } else { ps.seat = { v: v.id, s }; ps.car = null; }
    seatPlayer(p, v, s);
    ev({ e: 'venter', id: p.id, v: v.id, s });
    return true;
  }
  // the driver (and anyone else inside) is pulled out and runs
  function carjack(p, v) {
    const V = VEHICLES[v.k];
    v.npc.forEach((look, s) => {
      if (look < 0) return;
      v.npc[s] = -1;
      const side = V.seat[s][1] >= 0 ? 1 : -1;
      const o = seatPos(v.s, [V.seat[s][0], side * (V.hy + 34), 2]);
      ensureAround(o[0], o[1], 0);
      const cop = v.kind === 'police';
      const n = makePed(cop ? 'cop' : 'civ', [o[0], o[1], v.s.o[2]], v.s.yaw + side * 90, cop ? COP_LOOK : look);
      if (cop) { n.state = 'hunt'; n.target = p.id; } else flee(n, p.ps.origin, 10);
    });
    if (v.kind === 'police') crime(p, 'copcar');
    else if (copSees(p)) crime(p, 'carjack');
    v.ai = null;
  }
  function leaveSeat(p, quiet) {
    const v = vehicleOf(p);
    const ps = p.ps;
    if (!v) { ps.car = null; ps.seat = null; return; }
    const s = v.seats.indexOf(p);
    if (s >= 0) v.seats[s] = null;
    ps.car = null; ps.seat = null;
    if (quiet) return;
    const V = VEHICLES[v.k];
    const side = s >= 0 && V.seat[s][1] < 0 ? -1 : 1;
    const seat = V.seat[Math.max(0, s)];
    const tries = [[seat[0], side * (V.hy + 30), 2], [seat[0], -side * (V.hy + 30), 2], [-(V.hx + 34), 0, 2], [V.hx + 34, 0, 2], [0, 0, V.h + 6]];
    const w = world();
    let spot = null;
    for (const t of tries) {
      const o = seatPos(v.s, t);
      const tr = w.trace(o, o, MV.mins, MV.standMaxs);
      if (!tr.startsolid) { spot = o; break; }
    }
    ps.origin = spot || [v.s.o[0], v.s.o[1], v.s.o[2] + V.h + 8];
    ps.velocity = [v.s.v[0] * 0.5, v.s.v[1] * 0.5, 40];
    if (V.air && !v.s.g) {
      // jumping out of a plane: a parachute opens; the plane flies on and comes down
      ps.chute = true;
      ps.origin = [v.s.o[0], v.s.o[1], v.s.o[2] - 60];
      ps.velocity = [v.s.v[0] * 0.25, v.s.v[1] * 0.25, -100];
      v.s.dead = true;
      ev({ e: 'vexit', id: p.id, v: v.id, chute: 1 });
      return;
    }
    ps.ducked = false; ps.duckAmt = 0; ps.onGround = false;
    ev({ e: 'vexit', id: p.id, v: v.id });
    const sp = speedOf(v);
    if (sp > 650) api.damage(p, null, Math.round(8 + (sp - 650) * 0.03), 'fall', null);
  }

  function damageVehicle(v, dmg, by) {
    if (v.wreck || dmg <= 0) return;
    v.hp -= dmg;
    if (by) v.lastBy = by;
    if (v.hp < v.maxHp * 0.18) v.burn = true;
    if (v.hp <= 0) explode(v);
  }
  F.vehicleHit = (id, dmg, by) => { const v = F.vehicles.get(id); if (v) { damageVehicle(v, dmg, by); if (by && v.kind === 'police' && !v.wreck) crime(by, 'hurtcop'); } };
  function explode(v) {
    if (v.wreck) return;
    v.wreck = now();
    v.s.dead = true;
    v.burn = false;
    v.hp = 0;
    const at = [v.s.o[0], v.s.o[1], v.s.o[2] + 30];
    ev({ e: 'vboom', v: v.id, o: at.map(r1) });
    const by = v.lastBy && v.lastBy.ps ? v.lastBy : null;
    for (const p of v.seats) if (p) { leaveSeat(p, true); api.damage(p, by && by !== p ? by : null, 999, 'car', null); }
    v.npc.fill(-1);
    if (v.kind === 'police' && by) crime(by, 'copcar');
    v.s.v[2] = 380; v.s.g = false;
    api.blast(at, { radius: 430, splash: 150, knock: 850 }, by, 'car');
    for (const p of players()) if (p.fp?.mine === v.id) { p.fp.mine = 0; p.fp.insured = now() + 20; note(p, 'Your vehicle was destroyed. You can call it again from the phone in 20 seconds.'); }
  }
  F.blast = (at, P, owner) => {
    for (const v of F.vehicles.values()) {
      const d = Math.hypot(v.s.o[0] - at[0], v.s.o[1] - at[1], v.s.o[2] + 30 - at[2]);
      if (d > P.radius) continue;
      const k = 1 - d / P.radius;
      damageVehicle(v, P.splash * 4 * k, owner);
      const push = (P.knock || 0) * k * 0.6 / VEHICLES[v.k].mass;
      if (d > 1) { v.s.v[0] += ((v.s.o[0] - at[0]) / d) * push; v.s.v[1] += ((v.s.o[1] - at[1]) / d) * push; }
      v.s.v[2] += push * 0.4; v.s.g = false;
    }
    // explosions send everyone running
    for (const n of F.peds.values()) if (dist2(n.ps.origin, at) < 1800 * 1800) scare(n, at);
  };

  // crashes: damage both, shove the other car, throw riders off bikes
  function impact(v, r, dt) {
    if (!r || r.hit < 300) return;
    const V = VEHICLES[v.k];
    damageVehicle(v, (r.hit - 300) * 0.55, v.lastBy);
    if (r.hit > 500) ev({ e: 'vhit', o: v.s.o.map(r1), k: Math.min(9, Math.round(r.hit / 200)) });
    if (r.dyn) {
      const o = F.vehicles.get(r.dyn.id);
      if (o) {
        const k = clamp(V.mass / VEHICLES[o.k].mass, 0.2, 3) * 0.7;
        o.s.v[0] -= r.n[0] * r.hit * k; o.s.v[1] -= r.n[1] * r.hit * k;
        damageVehicle(o, (r.hit - 300) * 0.5, driverOf(v) || v.lastBy);
        if (o.ai) o.ai.bumpT = now();
        if (o.kind === 'police' && driverOf(v)) crime(driverOf(v), 'hurtcop');
      }
    }
    if (V.bike && r.hit > 750) for (const p of [...v.seats]) if (p) { leaveSeat(p, false); p.ps.velocity = [v.s.v[0] * 0.6 + r.n[0] * 200, v.s.v[1] * 0.6 + r.n[1] * 200, 260]; api.damage(p, null, Math.round((r.hit - 600) * 0.06), 'fall', null); }
  }

  // ---------------------------------------------------------------- driving
  F.cmd = (p, cmd, dt, pressed) => {
    const ps = p.ps;
    if (pressed & BTN.USE) use(p);
    const v = vehicleOf(p);
    if (!v) { ps.car = null; ps.seat = null; return 0; }
    if (ps.car) {
      const V = VEHICLES[v.k];
      if (pressed & BTN.HORN && v.kind === 'police') v.siren = !v.siren;
      if (cmd.buttons & BTN.HORN && v.kind !== 'police') v.horn = now() + 0.15;
      const w = world();
      w.skip = v.id;
      const r = V.air ? amove(w, v.s, cmd, dt) : vmove(w, v.s, cmd, dt);
      w.skip = 0;
      if (V.air) {
        v.seenAt = now();
        seatPlayer(p, v, 0);
        if (r.crash) { damageVehicle(v, v.maxHp * 3, v.lastBy || p); return 1; }
        if (V.guns && !v.s.g) jetWeapons(p, v, cmd, pressed);
        if (pressed & BTN.ROCKETJUMP && !v.s.g) flares(v);
        return 1;
      }
      const f = Math.cos(v.s.yaw * DEG) * v.s.v[0] + Math.sin(v.s.yaw * DEG) * v.s.v[1];
      v.brake = (cmd.fwd < -0.1 && f > 40) || !!(cmd.buttons & BTN.JUMP);
      v.seenAt = now();
      seatPlayer(p, v, 0);
      impact(v, r, dt);
      return 1;
    }
    seatPlayer(p, v, ps.seat.s);
    return 2;
  };

  // E: get out, use a shop counter, or get in the car you're next to
  function use(p) {
    if (vehicleOf(p)) { leaveSeat(p, false); return; }
    const o = p.ps.origin;
    for (const s of PLACES) {
      if (s.type !== 'gun' || dist2(s.front, o) > 150 * 150 || Math.abs(s.front[2] - o[2]) > 60) continue;
      api.send(p, { t: 'fp', k: 'shop', items: GUN_SHOP.map(([w, price, ammo]) => [w, price, ammo]), armor: ARMOR_PRICE });
      return;
    }
    let best = null, bd = Infinity;
    for (const v of F.vehicles.values()) {
      if (v.wreck || !touches(v.s, o, 60)) continue;
      const d = dist2(v.s.o, o);
      if (d < bd) { bd = d; best = v; }
    }
    if (best) enter(p, best);
  }

  // ---------------------------------------------------------------- traffic
  function newAi(lane, mode = 'cruise') {
    const cls = roadFrom(lane.i, lane.j, (lane.dir + 2) % 4) || 1;
    return { mode, pts: [], next: { i: lane.i, j: lane.j, d: lane.dir }, mul: 0.85 + Math.random() * 0.3, cls, stuckT: 0, revT: 0, stuckN: 0, target: 0, losAt: 0, los: false, slowT: 0 };
  }
  function extend(v) {
    const ai = v.ai;
    const { i, j, d } = ai.next;
    const cls = roadFrom(i, j, (d + 2) % 4) || 1;
    const S = stopPt(i, j, d);
    const stop = { x: S[0], y: S[1], stop: hasSignal(i, j) ? [i, j, d % 2 ? 'ns' : 'ew'] : null, jn: null, cls };
    ai.pts.push(stop);
    let opts = exits(i, j).filter((e) => e !== (d + 2) % 4);
    if (!opts.length) opts = [(d + 2) % 4];
    let e;
    if (ai.mode === 'respond' && ai.target) {
      const t = R.players.get(ai.target)?.ps.origin;
      e = opts[0];
      let bd = Infinity;
      for (const o of opts) { const dd = ((i + DIRS[o][0]) * G - (t ? t[0] : 0)) ** 2 + ((j + DIRS[o][1]) * G - (t ? t[1] : 0)) ** 2; if (dd < bd) { bd = dd; e = o; } }
    } else {
      // mostly straight on
      const w = opts.map((o) => (o === d ? 2.2 : 1));
      let r = Math.random() * w.reduce((a, b) => a + b, 0);
      e = opts[opts.length - 1];
      for (let k = 0; k < opts.length; k++) if ((r -= w[k]) <= 0) { e = opts[k]; break; }
    }
    stop.jn = { key: i + ',' + j, i, j, d, e };
    for (const q of turnPts(i, j, d, e)) ai.pts.push({ x: q[0], y: q[1], turn: e !== d, cls: roadFrom(i, j, e) || cls });
    ai.next = { i: i + DIRS[e][0], j: j + DIRS[e][1], d: e };
  }
  // junctions: a car crossing one holds it, and cars whose paths would cross it wait at the line
  const junctions = new Map(); // "i,j" -> Map(vehicle id -> { d, e, t })
  function reserve(v, jn) {
    let m = junctions.get(jn.key);
    if (!m) junctions.set(jn.key, (m = new Map()));
    m.set(v.id, { d: jn.d, e: jn.e, t: now(), i: jn.i, j: jn.j });
  }
  function conflicts(a, b) {
    if (a.d === b.d) return false; // same way in: just following
    const sa = a.d === a.e, sb = b.d === b.e, ra = a.e === (a.d + 3) % 4, rb = b.e === (b.d + 3) % 4;
    if (a.d === (b.d + 2) % 4 && ((sa && sb) || (sa && rb) || (ra && sb) || (ra && rb))) return false; // past each other
    return true;
  }
  function blockedAt(v, jn) {
    const m = junctions.get(jn.key);
    if (!m) return false;
    for (const [id, r] of m) if (id !== v.id && conflicts(r, jn)) return true;
    return false;
  }
  function releaseJunctions() {
    const t = now();
    for (const [key, m] of junctions) {
      for (const [id, r] of m) {
        const v = F.vehicles.get(id);
        const away = !v || (t - r.t > 0.6 && (Math.abs(v.s.o[0] - r.i * G) > RW + 140 || Math.abs(v.s.o[1] - r.j * G) > RW + 140));
        if (away || t - r.t > 9) m.delete(id);
      }
      if (!m.size) junctions.delete(key);
    }
  }
  function replan(v) {
    const lane = nearestLane(v.s.o[0], v.s.o[1], v.s.yaw);
    if (!lane) { v.ai.pts = []; return false; }
    const keep = v.ai;
    v.ai = { ...newAi(lane, keep.mode), target: keep.target, stuckN: keep.stuckN };
    v.ai.pts.push({ x: lane.x + DIRS[lane.dir][0] * 200, y: lane.y + DIRS[lane.dir][1] * 200, cls: v.ai.cls });
    return true;
  }
  function spawnTraffic(p, urban) {
    const o = p.ps.origin;
    const a = Math.random() * Math.PI * 2, r = SPAWN_MIN + Math.random() * (SPAWN_MAX - SPAWN_MIN);
    const lane = nearestLane(o[0] + Math.cos(a) * r, o[1] + Math.sin(a) * r);
    if (!lane) return;
    const at = [lane.x, lane.y];
    for (const q of players()) if (dist2(q.ps.origin, at) < (SPAWN_MIN * 0.75) ** 2) return;
    for (const v of F.vehicles.values()) if (dist2(v.s.o, at) < 700 * 700) return;
    ensureAround(at[0], at[1], 1);
    const k = VEHICLE_INDEX[pick(urban ? TRAFFIC_POOL.urban : TRAFFIC_POOL.rural)];
    const v = addVehicle(k, [at[0], at[1], 0], DIR_YAW[lane.dir], 'traffic', k === VEHICLE_INDEX.cab ? 6 : undefined);
    v.npc[0] = randLook();
    if (v.npc.length > 1 && Math.random() < 0.25) v.npc[1] = randLook();
    v.ai = newAi(lane);
    v.ai.pts.push({ x: at[0] + DIRS[lane.dir][0] * 150, y: at[1] + DIRS[lane.dir][1] * 150, cls: v.ai.cls });
    v.s.v[0] = DIRS[lane.dir][0] * 300; v.s.v[1] = DIRS[lane.dir][1] * 300;
  }

  // things a car should not drive into, refreshed every tick
  let obstacles = [];
  function collectObstacles() {
    obstacles = [];
    for (const v of F.vehicles.values()) obstacles.push({ id: v.id, o: v.s.o, yaw: v.s.yaw, hx: VEHICLES[v.k].hx, hy: VEHICLES[v.k].hy, ai: !!v.ai, player: !!driverOf(v), v });
    for (const p of players()) if (p.ps.alive && !p.ps.car && !p.ps.seat) obstacles.push({ id: 'p' + p.id, o: p.ps.origin, yaw: 0, hx: 16, hy: 16, person: true, player: true });
    for (const n of F.peds.values()) obstacles.push({ id: n.id, o: n.ps.origin, yaw: 0, hx: 16, hy: 16, person: true });
  }
  // the speed to keep to so we don't hit anything in front
  function clearAhead(v, vf, fx, fy) {
    const V = VEHICLES[v.k];
    let vt = Infinity, honk = false, by = null;
    const look = 260 + Math.abs(vf) * 0.9;
    for (const ob of obstacles) {
      if (ob.id === v.id) continue;
      const dx = ob.o[0] - v.s.o[0], dy = ob.o[1] - v.s.o[1];
      if (dx * dx + dy * dy > (look + 250) ** 2 || Math.abs(ob.o[2] - v.s.o[2]) > 120) continue;
      const lx = dx * fx + dy * fy, ly = -dx * fy + dy * fx;
      if (lx <= 0) continue;
      const rel = (ob.yaw - v.s.yaw) * DEG, c = Math.abs(Math.cos(rel)), s = Math.abs(Math.sin(rel));
      const along = c * ob.hx + s * ob.hy, across = s * ob.hx + c * ob.hy;
      if (Math.abs(ly) > V.hy + across + 22) continue;
      const gap = lx - V.hx - along;
      if (gap > look) continue;
      // two AI cars waiting on each other: the newer one goes first
      if (ob.ai && ob.v.id > v.id) {
        const bx = -dx, by = -dy, ofx = Math.cos(ob.yaw * DEG), ofy = Math.sin(ob.yaw * DEG);
        if (bx * ofx + by * ofy > 0 && Math.abs(-bx * ofy + by * ofx) < VEHICLES[ob.v.k].hy + V.hx + 22) continue;
      }
      const lim = Math.sqrt(2 * 950 * Math.max(0, gap - 55));
      if (lim < vt) { vt = lim; by = ob.id; }
      if (ob.player && gap < 220) honk = true;
    }
    return { vt, honk, by };
  }
  // pure pursuit to a point at a speed, getting unstuck by backing up
  function steerDrive(v, tx, ty, vt, dt, buttons = 0) {
    const s = v.s, V = VEHICLES[v.k], ai = v.ai;
    const fx = Math.cos(s.yaw * DEG), fy = Math.sin(s.yaw * DEG);
    const vf = s.v[0] * fx + s.v[1] * fy;
    const dx = tx - s.o[0], dy = ty - s.o[1];
    const lx = dx * fx + dy * fy, ly = -dx * fy + dy * fx;
    const L2 = Math.max(1, lx * lx + ly * ly);
    let side;
    if (lx < 20) side = ly > 0 ? -1 : 1;
    else {
      const ang = Math.atan((2 * ly / L2) * V.wb);
      side = clamp(-ang / (V.steerMax * (1 - 0.55 * Math.min(1, Math.abs(vf) / V.top))), -1, 1);
    }
    let thr = clamp((vt - vf) / 140, -1, 1), hb = 0;
    if (vt < 8 && Math.abs(vf) < 70) { thr = 0; hb = 1; }
    if (vt > 150 && Math.abs(vf) < 25 && !(ai.revT > 0)) {
      ai.stuckT += dt;
      if (ai.stuckT > 2.2) { ai.revT = 1.4; ai.stuckT = 0; ai.stuckN++; ai.revSide = side > 0 ? -1 : 1; }
    } else if (Math.abs(vf) > 80) { ai.stuckT = 0; if (ai.stuckN && Math.abs(vf) > 300) ai.stuckN = Math.max(0, ai.stuckN - dt * 0.2); }
    if (ai.revT > 0) { ai.revT -= dt; thr = -0.8; side = ai.revSide; hb = 0; }
    const w = world();
    w.skip = v.id;
    const r = vmove(w, s, { fwd: thr, side, buttons: (hb ? BTN.JUMP : 0) | buttons }, dt);
    w.skip = 0;
    v.brake = thr < -0.05 || !!hb;
    impact(v, r, dt);
    return vf;
  }
  // follow the route: lanes, turns, red lights and whatever's in front
  function cruise(v, dt) {
    if (!v.ai.pts.length && !replan(v)) return;
    const ai = v.ai, s = v.s; // (replan makes a new route object)
    for (let k = 0; ai.pts.length < 7 && k < 8; k++) extend(v);
    const fx = Math.cos(s.yaw * DEG), fy = Math.sin(s.yaw * DEG);
    const vf = s.v[0] * fx + s.v[1] * fy;
    const police = ai.mode === 'respond';
    const red = (q) => { if (!q.stop || police) return false; const st = signal(q.stop[0], q.stop[1], q.stop[2], now()); return st === 2 || st === 1; };
    while (ai.pts.length > 1) {
      const q = ai.pts[0], dx = q.x - s.o[0], dy = q.y - s.o[1];
      const ahead = dx * fx + dy * fy, d2 = dx * dx + dy * dy;
      // passed it, or it's beside us inside the turning circle (we'd only drive round it)
      if (q.jn ? ahead < 10 && d2 < 400 * 400 : d2 < 110 * 110 || (ahead < 50 && d2 < 500 * 500)) {
        if (q.jn) reserve(v, q.jn);
        ai.pts.shift();
      } else break;
    }
    const q0 = ai.pts[0];
    if (dist2([q0.x, q0.y], s.o) > 1100 * 1100) { if (!replan(v)) return; return; }
    const turning = ai.pts.slice(0, 3).some((q) => q.turn);
    const L = clamp((turning ? 110 : 150) + Math.abs(vf) * 0.3, turning ? 110 : 150, 620);
    let tx = q0.x, ty = q0.y;
    for (const q of ai.pts) { tx = q.x; ty = q.y; if (dist2([q.x, q.y], s.o) >= L * L) break; }
    let vt = SPEED[ai.pts[0].cls || ai.cls] * ai.mul * (police ? 1.4 : 1);
    ai.why = '';
    let acc = 0, px = s.o[0], py = s.o[1];
    for (const q of ai.pts) {
      acc += Math.hypot(q.x - px, q.y - py); px = q.x; py = q.y;
      if (acc > 1800) break;
      if (q.turn && acc < 450) vt = Math.min(vt, police ? 650 : 440);
      if (q.jn && !police) {
        const st = q.stop ? signal(q.stop[0], q.stop[1], q.stop[2], now()) : 0;
        if (st === 2 || (st === 1 && acc > 280) || blockedAt(v, q.jn)) { vt = Math.min(vt, Math.sqrt(2 * 850 * Math.max(0, acc - 30))); ai.why = st ? 'light' : 'junction'; break; }
        if (!q.stop && acc < 700) vt = Math.min(vt, 620); // country crossroads: slow down
        break;
      }
    }
    const ca = clearAhead(v, vf, fx, fy);
    if (ca.vt < vt) ai.why = 'ahead ' + ca.by;
    vt = Math.min(vt, ca.vt);
    if (ca.honk && Math.abs(vf) < 80) { ai.honkT = (ai.honkT || 0) + dt; if (ai.honkT > 1.5 && ai.honkT < 2.4) v.horn = now() + 0.1; if (ai.honkT > 6) ai.honkT = 0.5; } else ai.honkT = 0;
    steerDrive(v, tx, ty, vt, dt);
  }

  // ---------------------------------------------------------------- the police
  function spawnPolice(p) {
    const o = p.ps.origin;
    for (let k = 0; k < 6; k++) {
      const a = Math.random() * Math.PI * 2, r = 2600 + Math.random() * 1800;
      const lane = nearestLane(o[0] + Math.cos(a) * r, o[1] + Math.sin(a) * r);
      if (!lane) continue;
      if ([...F.vehicles.values()].some((v) => dist2(v.s.o, [lane.x, lane.y]) < 500 * 500)) continue;
      ensureAround(lane.x, lane.y, 1);
      const v = addVehicle(VEHICLE_INDEX.cruiser, [lane.x, lane.y, 0], DIR_YAW[lane.dir], 'police', 2);
      v.npc[0] = COP_LOOK; v.npc[1] = COP_LOOK;
      v.ai = newAi(lane, 'respond');
      v.ai.target = p.id;
      v.siren = true;
      return v;
    }
    return null;
  }
  function deploy(v, tgt) {
    const V = VEHICLES[v.k];
    let cops = 0;
    for (const n of F.peds.values()) if (n.kind === 'cop') cops++;
    v.npc.forEach((look, s) => {
      if (look < 0 || cops >= 14) return;
      v.npc[s] = -1;
      const side = V.seat[s][1] >= 0 ? 1 : -1;
      const o = seatPos(v.s, [V.seat[s][0], side * (V.hy + 34), 2]);
      const n = makePed('cop', [o[0], o[1], v.s.o[2]], v.s.yaw + side * 90, COP_LOOK);
      n.state = 'hunt'; n.target = tgt.id; n.car = v.id;
      cops++;
    });
    v.ai.mode = 'deployed';
  }
  function policeDrive(v, dt) {
    const ai = v.ai;
    const tgt = R.players.get(ai.target);
    if (!tgt || !tgt.ps.alive || !(tgt.fp?.wanted > 0)) {
      // called off: back to driving around, sirens off
      ai.target = 0; ai.mode = 'cruise'; v.siren = false;
      if (!ai.pts.length) replan(v);
      return cruise(v, dt);
    }
    const s = v.s, tp = tgt.ps.origin;
    const d = Math.sqrt(dist2(s.o, tp));
    if (now() >= ai.losAt) { ai.losAt = now() + 0.3; ai.los = canSee([s.o[0], s.o[1], s.o[2] + 50], [tp[0], tp[1], tp[2] + 40], v.id); if (ai.los && d < 3500) seen(tgt); }
    if (ai.mode === 'deployed') {
      // crew's out: sit with the lights on (or chase again if they drive off and somebody's still inside)
      steerDrive(v, s.o[0] + Math.cos(s.yaw * DEG) * 100, s.o[1] + Math.sin(s.yaw * DEG) * 100, 0, dt);
      return;
    }
    if (d > 1500 && !(ai.los && d < 2300)) {
      if (ai.mode !== 'respond') { ai.mode = 'respond'; replan(v); }
      return cruise(v, dt);
    }
    ai.mode = 'chase';
    const tv = tgt.ps.velocity;
    const onFoot = !tgt.ps.car && !tgt.ps.seat;
    const tx = tp[0] + tv[0] * 0.45, ty = tp[1] + tv[1] * 0.45;
    let vt = VEHICLES[v.k].top * 0.92;
    if (onFoot) vt = Math.min(vt, Math.sqrt(2 * 1300 * Math.max(0, d - 300)));
    const vf = steerDrive(v, tx, ty, vt, dt);
    const tsp = Math.hypot(tv[0], tv[1]);
    if (d < 650 && (onFoot || tsp < 120)) { ai.slowT += dt; if (ai.slowT > (onFoot ? 0.4 : 1.5) && Math.abs(vf) < 140) deploy(v, tgt); } else ai.slowT = 0;
  }

  function vehicleThink(v, dt) {
    if (driverOf(v)) return; // a player drives it (their commands move it)
    if (VEHICLES[v.k].air) {
      // nobody flying it: parked planes sit; one that's been left in the air comes down
      if (v.s.g && Math.abs(v.s.v[0]) + Math.abs(v.s.v[1]) < 2) return;
      const w = world();
      w.skip = v.id;
      const r = amove(w, v.s, { fwd: -1, side: 0, yaw: v.s.yaw, pitch: 30, buttons: 0 }, dt);
      w.skip = 0;
      if (r.crash) damageVehicle(v, v.maxHp * 3, v.lastBy);
      return;
    }
    if (v.wreck) { coast(v, dt); return; }
    if (v.burn) { damageVehicle(v, 28 * dt, v.lastBy); if (v.wreck) return; }
    if (v.npc[0] >= 0 && v.ai) {
      if (v.kind === 'police' && v.ai.target) policeDrive(v, dt);
      else cruise(v, dt);
    } else coast(v, dt);
  }
  function coast(v, dt) {
    const s = v.s;
    if (s.g && Math.abs(s.v[0]) + Math.abs(s.v[1]) < 2) { s.v[0] = s.v[1] = 0; return; }
    const w = world();
    w.skip = v.id;
    const r = vmove(w, s, { fwd: 0, side: 0, buttons: BTN.JUMP }, dt);
    w.skip = 0;
    impact(v, r, dt);
  }

  // cars hitting people
  const struck = new Map();
  function runOver() {
    const t = now();
    for (const v of F.vehicles.values()) {
      const sp = speedOf(v);
      if (sp < 220) continue;
      const V = VEHICLES[v.k];
      const by = driverOf(v);
      const hit = (target, o, apply) => {
        const key = v.id + ':' + target;
        if ((struck.get(key) || 0) > t) return;
        if (!touches(v.s, o, 10, 60)) return;
        struck.set(key, t + 0.7);
        apply(Math.round((sp - 160) * 0.075 * Math.max(0.5, V.mass)));
        v.s.v[0] *= 0.93; v.s.v[1] *= 0.93;
      };
      const push = (ps) => { ps.velocity[0] = v.s.v[0] * 0.85; ps.velocity[1] = v.s.v[1] * 0.85; ps.velocity[2] = 220 + sp * 0.12; ps.onGround = false; };
      for (const p of players()) {
        if (!p.ps.alive || p.ps.car || p.ps.seat || p === by) continue;
        hit('p' + p.id, p.ps.origin, (dmg) => { push(p.ps); api.damage(p, by, dmg, 'car', null); });
      }
      // traffic only knocks people over; players driving can kill
      for (const n of [...F.peds.values()]) hit(n.id, n.ps.origin, (dmg) => { push(n.ps); F.hurt(n, by, by ? dmg : Math.min(dmg, 12), 'car', false, null); });
    }
    if (struck.size > 500) for (const [k, until] of struck) if (until < t) struck.delete(k);
  }

  // ---------------------------------------------------------------- people
  function makePed(kind, o, yaw, look) {
    const ps = newPlayerState([o[0], o[1], (o[2] || 0) + 1]);
    ps.alive = true; ps.time = 0;
    ps.speedMul = kind === 'cop' ? 0.78 : 0.7;
    const hp = kind === 'cop' ? 80 : 40;
    const n = {
      id: -(F.nextP++), isNpc: true, isPed: true, kind, ps, hp, yaw: yaw || 0, pitch: 0, look: look ?? randLook(), state: kind === 'clerk' || kind === 'gunclerk' ? 'idle' : 'walk',
      walk: null, target: 0, until: 0, nextShot: 0, losAt: 0, los: false, lkp: null, waitT: 0, stuckT: 0, last: ps.origin.slice(), born: now(), store: null,
    };
    F.peds.set(n.id, n);
    return n;
  }
  function removePed(n) { F.peds.delete(n.id); }
  F.alive = () => [...F.peds.values()];

  function spawnPed(p) {
    const o = p.ps.origin;
    const a = Math.random() * Math.PI * 2, r = PED_MIN + Math.random() * (PED_MAX - PED_MIN);
    const x = o[0] + Math.cos(a) * r, y = o[1] + Math.sin(a) * r;
    const i = cellOf(x), j = cellOf(y);
    const w = walkRect(i, j);
    if (!w) return;
    const k = (Math.random() * 4) | 0, f = Math.random();
    const A = corner(w, k), B = corner(w, (k + 1) % 4);
    const at = [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, KERB];
    for (const q of players()) if (dist2(q.ps.origin, at) < (PED_MIN * 0.7) ** 2) return;
    ensureAround(at[0], at[1], 0);
    const cop = Math.random() < 0.07;
    const n = makePed(cop ? 'cop' : 'civ', at, 0, cop ? COP_LOOK : undefined);
    const dir = Math.random() < 0.5 ? 1 : -1;
    n.walk = { i, j, w, k: dir > 0 ? (k + 1) % 4 : k, dir };
  }
  function flee(n, from, secs = 9) {
    if (n.kind === 'clerk' || n.kind === 'gunclerk') { n.state = 'cower'; n.until = now() + 8; return; }
    n.state = 'flee';
    n.from = from.slice();
    n.until = now() + secs + Math.random() * 4;
  }
  function scare(n, at, by) {
    if (n.kind === 'cop') { if (by && by.fp && n.state !== 'hunt') { n.state = 'hunt'; n.target = by.id; } return; }
    if (n.state !== 'flee') flee(n, at);
  }
  // gunfire: people near the shooter run; police who see it come for you
  F.shot = (p, wi, start) => {
    if (WEAPONS[wi].melee) return;
    for (const n of F.peds.values()) if (dist2(n.ps.origin, start) < 1600 * 1600) scare(n, start, p);
    if (copSees(p, 2400)) crime(p, 'shoot');
  };
  F.hurt = (n, attacker, dmg, weapon, head, dir) => {
    if (n.kind === 'gunclerk' || !n.ps.alive) return;
    n.hp -= dmg;
    if (dir) { const k = Math.min(260, dmg * 5); n.ps.velocity[0] += dir[0] * k; n.ps.velocity[1] += dir[1] * k; }
    const by = attacker && attacker.fp ? attacker : null;
    if (by && n.kind === 'cop') crime(by, 'hurtcop');
    if (by && n.kind !== 'cop') { scare(n, by.ps.origin, by); for (const m of F.peds.values()) if (m.kind === 'cop' && dist2(m.ps.origin, n.ps.origin) < 2500 * 2500) scare(m, by.ps.origin, by); }
    if (n.hp <= 0) pedDie(n, by, weapon);
  };
  function pedDie(n, by, weapon) {
    n.ps.alive = false;
    ev({ e: 'pdie', id: n.id, o: n.ps.origin.map(r1), y: Math.round(n.yaw), vv: n.ps.velocity.map(r1), look: n.look, k: by ? by.id : 0, w: weapon });
    removePed(n);
    if (n.store) { const st = F.stores.get(n.store); if (st) { st.clerk = 0; st.back = now() + 240; st.prog = 0; if (st.robber) { drop([st.spot.till[0], st.spot.till[1], st.spot.till[2]], 80 + ((Math.random() * 120) | 0)); st.robber = 0; } } }
    if (Math.random() < 0.6 && n.kind === 'civ') drop(n.ps.origin, 5 + ((Math.random() * 35) | 0));
    if (n.kind === 'cop') drop(n.ps.origin, 20 + ((Math.random() * 40) | 0));
    if (by) crime(by, n.kind === 'cop' ? 'killcop' : 'kill');
  }

  function canSee(a, b, skip = 0) {
    const w = world();
    w.skip = skip;
    const tr = w.trace(a, b, [0, 0, 0], [0, 0, 0]);
    w.skip = 0;
    return tr.fraction >= 0.98;
  }
  function copSees(p, range = 3500) {
    const e = [p.ps.origin[0], p.ps.origin[1], p.ps.origin[2] + 50];
    for (const n of F.peds.values()) {
      if (n.kind !== 'cop' || dist2(n.ps.origin, e) > range * range) continue;
      if (canSee([n.ps.origin[0], n.ps.origin[1], n.ps.origin[2] + 60], e)) return true;
    }
    for (const v of F.vehicles.values()) {
      if (v.kind !== 'police' || v.npc[0] < 0 || dist2(v.s.o, e) > range * range) continue;
      if (canSee([v.s.o[0], v.s.o[1], v.s.o[2] + 50], e, v.id)) return true;
    }
    return false;
  }
  function seen(p) { if (p.fp) p.fp.seenAt = now(); }
  // the wanted level: what each thing you do is worth
  function crime(p, kind) {
    const fp = p.fp;
    if (!fp || !p.ps.alive) return;
    const w0 = fp.wanted;
    let w = w0;
    if (kind === 'shoot' || kind === 'carjack') w = Math.max(w, 1);
    else if (kind === 'kill') w = Math.max(w, 1) + (copSees(p) && w >= 1 ? 1 : 0);
    else if (kind === 'hurtcop') w = Math.max(w, 2);
    else if (kind === 'killcop') w = Math.max(w + 1, 2);
    else if (kind === 'copcar') w = Math.max(w + 1, 2);
    else if (kind === 'rob') w = Math.max(w, 2);
    else if (kind === 'alarm') w = Math.max(w, 1);
    else if (kind === 'trespass') w = Math.max(w, 4);
    else if (kind === 'jet') w = Math.max(w, 5);
    w = Math.min(5, w);
    fp.wanted = w;
    seen(p);
    if (w > w0) ev({ e: 'wanted', id: p.id, w }, p.id);
  }

  function pedThink(n, dt) {
    const ps = n.ps, t = now();
    if (!ps.alive) return;
    let cmd = { fwd: 0, side: 0, buttons: BTN.WALK, yaw: n.yaw, pitch: 0 };
    const goTo = (x, y, fast) => {
      const yaw = Math.atan2(y - ps.origin[1], x - ps.origin[0]) * D;
      n.yaw = n.yaw + angDiff(n.yaw, yaw) * Math.min(1, dt * 8);
      cmd = { fwd: 1, side: 0, buttons: fast === 2 ? BTN.SPRINT : fast ? 0 : BTN.WALK, yaw: n.yaw, pitch: 0 };
    };
    if (n.state === 'walk' && n.walk) {
      const W = n.walk;
      const c = corner(W.w, W.k);
      if (dist2(ps.origin, c) < 30 * 30) {
        // at a corner: cross the street now and then (on the green), or carry on round the block
        const opts = CROSS[W.k].filter(([di, dj, , ]) => walkRect(W.i + di, W.j + dj));
        if (!n.crossing && opts.length && Math.random() < 0.3) n.crossing = opts[(Math.random() * opts.length) | 0];
        if (n.crossing) {
          const [di, dj, to, ns] = n.crossing;
          const [ci, cj] = CORNER_NODE[W.k];
          const ni = W.i + ci, nj = W.j + cj;
          const safe = hasSignal(ni, nj) ? signal(ni, nj, ns ? 'ns' : 'ew', t) === 2 : !obstacles.some((o) => o.v && !o.person && dist2(o.o, [ni * G, nj * G]) < 1000 * 1000);
          n.waitT += dt;
          if (safe || n.waitT > 14) {
            const w2 = walkRect(W.i + di, W.j + dj);
            n.walk = { i: W.i + di, j: W.j + dj, w: w2, k: to, dir: W.dir, cross: true };
            n.crossing = null; n.waitT = 0;
          }
        } else n.walk = { ...W, k: (W.k + W.dir + 4) % 4, cross: false };
      } else goTo(c[0], c[1], W.cross);
    } else if (n.state === 'walk') {
      // lost (after running away): find the nearest block to walk round
      const i = cellOf(ps.origin[0]), j = cellOf(ps.origin[1]), w = walkRect(i, j);
      if (w) { let bk = 0, bd = Infinity; for (let k = 0; k < 4; k++) { const d = dist2(ps.origin, corner(w, k)); if (d < bd) { bd = d; bk = k; } } n.walk = { i, j, w, k: bk, dir: Math.random() < 0.5 ? 1 : -1 }; }
      else n.state = 'idle';
    } else if (n.state === 'flee') {
      if (t > n.until) { n.state = 'walk'; n.walk = null; }
      else {
        const away = Math.atan2(ps.origin[1] - n.from[1], ps.origin[0] - n.from[0]) * D + Math.sin(t * 0.7 + n.id) * 25;
        n.yaw = n.yaw + angDiff(n.yaw, away) * Math.min(1, dt * 5);
        cmd = { fwd: 1, side: 0, buttons: BTN.SPRINT, yaw: n.yaw, pitch: 0 };
      }
    } else if (n.state === 'hunt') huntThink(n, dt, (c) => { cmd = c; });
    else if (n.state === 'handsup' || n.state === 'cower' || n.state === 'idle') {
      if (n.state === 'cower' && t > n.until) n.state = 'idle';
      if (n.home) { n.yaw = n.home.yaw; if (dist2(ps.origin, n.home.o) > 40 * 40) goTo(n.home.o[0], n.home.o[1], false); }
    }
    cmd.buttons |= n.state === 'cower' ? BTN.DUCK : 0;
    // stuck against something: turn and try another way
    if (cmd.fwd && t - (n.stuckAt || 0) > 1.2) {
      n.stuckAt = t;
      if (dist2(ps.origin, n.last) < 20 * 20 && n.state !== 'hunt') { n.yaw += 90 + Math.random() * 180; if (n.walk && n.state === 'walk') n.walk = null; }
      n.last = ps.origin.slice();
    }
    pmove(world(), ps, cmd, dt, R.rules);
    if (ps.origin[2] < -100) removePed(n);
  }

  // a police officer on foot: close in, keep some distance, shoot when they can see you
  function huntThink(n, dt, set) {
    const t = now(), ps = n.ps;
    const tgt = R.players.get(n.target);
    if (!tgt || !tgt.ps.alive || !(tgt.fp?.wanted > 0)) { n.state = 'walk'; n.walk = null; n.target = 0; return; }
    const tp = tgt.ps.origin;
    const eye = [ps.origin[0], ps.origin[1], ps.origin[2] + 60];
    const tc = [tp[0], tp[1], tp[2] + (tgt.ps.ducked ? 22 : 40)];
    const d = Math.sqrt(dist2(ps.origin, tp));
    if (t >= n.losAt) { n.losAt = t + 0.25; n.los = d < 4000 && canSee(eye, tc); if (n.los) { n.lkp = tp.slice(); seen(tgt); } }
    const face = Math.atan2(tp[1] - ps.origin[1], tp[0] - ps.origin[0]) * D;
    n.yaw = n.yaw + angDiff(n.yaw, face) * Math.min(1, dt * 10);
    let fwd = 0, side = 0, buttons = 0;
    if (!n.los) {
      let g = n.lkp || tp;
      // you're inside a shop: come in through its door
      const place = PLACES.find((s) => s.door && dist2(s.door, tp) < 900 * 900);
      if (place && dist2(ps.origin, tp) > 260 * 260) {
        const atDoor = dist2(ps.origin, place.door) < 90 * 90;
        if (!atDoor && !n.inDoor) g = place.door; else n.inDoor = true;
      } else n.inDoor = false;
      const gy = Math.atan2(g[1] - ps.origin[1], g[0] - ps.origin[0]) * D;
      n.yaw = gy; fwd = 1; buttons = BTN.SPRINT;
    } else {
      if (d > 700) { fwd = 1; buttons = d > 1100 ? BTN.SPRINT : 0; } else if (d < 280) fwd = -1;
      side = Math.sin(t * 0.9 + n.id) > 0 ? 0.6 : -0.6;
      if (d < 2400 && t >= n.nextShot) shoot(n, tgt, eye, tc, d);
    }
    n.pitch = -Math.atan2(tc[2] - eye[2], Math.max(1, d)) * D;
    set({ fwd, side, buttons, yaw: n.yaw, pitch: n.pitch });
  }
  function shoot(n, tgt, eye, tc, d) {
    const t = now();
    n.burst = (n.burst || 0) + 1;
    n.nextShot = t + (n.burst % 4 === 0 ? 1.2 + Math.random() : 0.32 + Math.random() * 0.2);
    const moving = Math.hypot(tgt.ps.velocity[0], tgt.ps.velocity[1]) > 250;
    const spread = 0.045 + (moving ? 0.03 : 0) - (tgt.fp.wanted - 1) * 0.004 + d / 60000;
    let dx = tc[0] - eye[0], dy = tc[1] - eye[1], dz = tc[2] - eye[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    dx = dx / l + (Math.random() - 0.5) * 2 * spread; dy = dy / l + (Math.random() - 0.5) * 2 * spread; dz = dz / l + (Math.random() - 0.5) * 2 * spread;
    const l2 = Math.hypot(dx, dy, dz);
    const dir = [dx / l2, dy / l2, dz / l2];
    const end = [eye[0] + dir[0] * 6000, eye[1] + dir[1] * 6000, eye[2] + dir[2] * 6000];
    const tr = world().trace(eye, end, [0, 0, 0], [0, 0, 0]);
    let frac = tr.fraction, hitP = null, head = false;
    for (const p of players()) {
      if (!p.ps.alive) continue;
      const h = hitTest(eye, end, p.ps.origin, p.ps.ducked);
      if (h && h.frac < frac) { frac = h.frac; hitP = p; head = h.head; }
    }
    const e = [eye[0] + dir[0] * 6000 * frac, eye[1] + dir[1] * 6000 * frac, eye[2] + dir[2] * 6000 * frac];
    ev({ e: 'shot', id: n.id, w: WEAPON_INDEX.pistol, s: eye.map(r1), h: [[...e.map(r1), hitP ? hitP.id : 0, hitP ? 0 : tr.fraction < 1 ? 1 : 0, tr.normal.map((v) => +v.toFixed(2))]] });
    if (hitP) api.damage(hitP, null, head ? 14 : 7, 'police', dir);
    else if (tr.dyn) { const v = F.vehicles.get(tr.dyn.id); if (v && v.kind !== 'police') damageVehicle(v, 9, null); }
  }

  // ---------------------------------------------------------------- shops and robbery
  function storesThink(people, dt) {
    const t = now();
    for (const spot of PLACES) {
      if (spot.type !== 'gas' && spot.type !== 'gun') continue;
      const near = people.some((p) => dist2(p.ps.origin, spot.clerk) < 3200 * 3200);
      let st = F.stores.get(spot.id);
      if (!near) { if (st?.clerk) { const n = F.peds.get(st.clerk); if (n) removePed(n); st.clerk = 0; } continue; }
      if (!st) F.stores.set(spot.id, (st = { spot, clerk: 0, back: 0, prog: 0, robber: 0, lastAim: 0, cool: 0 }));
      if (!st.clerk && t >= st.back) {
        ensureAround(spot.clerk[0], spot.clerk[1], 0);
        const n = makePed(spot.type === 'gas' ? 'clerk' : 'gunclerk', spot.clerk, spot.yaw, spot.type === 'gun' ? 2 * 4 + 7 : undefined);
        n.home = { o: spot.clerk, yaw: spot.yaw };
        n.store = spot.id;
        st.clerk = n.id;
      }
      if (spot.type !== 'gas') continue;
      const clerk = F.peds.get(st.clerk);
      if (!clerk) continue;
      // someone pointing a gun at the cashier?
      let robber = null;
      for (const p of people) {
        if (!p.ps.alive || p.ps.car || p.ps.seat) continue;
        const o = p.ps.origin, I = spot.inside;
        if (o[0] < I.mins[0] - 200 || o[0] > I.maxs[0] + 200 || o[1] < I.mins[1] - 200 || o[1] > I.maxs[1] + 200) continue;
        const W = WEAPONS[p.ps.cur];
        if (!W || W.melee) continue;
        const e = [o[0], o[1], o[2] + 64], c = [clerk.ps.origin[0], clerk.ps.origin[1], clerk.ps.origin[2] + 50];
        const dx = c[0] - e[0], dy = c[1] - e[1], dz = c[2] - e[2], l = Math.hypot(dx, dy, dz);
        if (l > 900) continue;
        const y = p.yaw * DEG, pi = p.pitch * DEG;
        const f = [Math.cos(pi) * Math.cos(y), Math.cos(pi) * Math.sin(y), -Math.sin(pi)];
        if ((f[0] * dx + f[1] * dy + f[2] * dz) / l > 0.975) { robber = p; break; }
      }
      if (t < st.cool) { if (robber && !st.saidEmpty) { note(robber, 'The till is empty. Come back later.'); st.saidEmpty = true; } continue; }
      st.saidEmpty = false;
      if (robber) {
        if (!st.robber) note(robber, 'Keep the gun on the cashier while they empty the till.');
        st.robber = robber.id; st.lastAim = t; st.prog += dt / 7;
        clerk.state = 'handsup';
        robber.fp.robProg = st.prog;
        if (st.prog >= 1) {
          const n = 900 + ((Math.random() * 1300) | 0);
          drop(spot.till, Math.round(n * 0.6)); drop([spot.till[0] + 20, spot.till[1], spot.till[2]], Math.round(n * 0.4));
          crime(robber, 'rob');
          ev({ e: 'robbed', id: robber.id, n });
          st.prog = 0; st.robber = 0; st.cool = t + 300;
          clerk.state = 'cower'; clerk.until = t + 20;
          robber.fp.robProg = 0;
        }
      } else if (st.robber && t - st.lastAim > 3) {
        // you looked away: the cashier hits the alarm
        const p = R.players.get(st.robber);
        if (p) { crime(p, 'alarm'); note(p, 'The cashier hit the alarm!'); p.fp.robProg = 0; }
        st.robber = 0; st.prog = 0; st.cool = t + 60;
        clerk.state = 'cower'; clerk.until = t + 15;
      } else if (!st.robber && clerk.state === 'handsup') clerk.state = 'idle';
    }
  }

  // ---------------------------------------------------------------- money on the ground
  function drop(o, n) {
    const id = F.nextC++;
    F.cash.set(id, { id, o: [o[0] + (Math.random() - 0.5) * 20, o[1] + (Math.random() - 0.5) * 20, o[2]], n, until: now() + 60 });
  }
  function pickups(people) {
    const t = now();
    for (const c of F.cash.values()) {
      if (t > c.until) { F.cash.delete(c.id); continue; }
      for (const p of people) {
        if (!p.ps.alive || p.ps.car) continue;
        const o = p.ps.origin;
        if (dist2(o, c.o) > 46 * 46 || Math.abs(o[2] + 30 - c.o[2]) > 70) continue;
        earn(p, c.n);
        ev({ e: 'cash', id: p.id, n: c.n }, p.id);
        F.cash.delete(c.id);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- phone: buy and call vehicles; the gun shop
  function deliver(p, idx) {
    const car = p.fp.data.cars[idx];
    if (!car) return;
    if (now() < p.fp.insured) return note(p, `Your vehicle can be called again in ${Math.ceil(p.fp.insured - now())} seconds.`);
    const old = F.vehicles.get(p.fp.mine);
    if (old) {
      if (old.seats.some((o) => o && o !== p)) return note(p, 'Somebody else is in your vehicle.');
      if (old.seats.includes(p)) return note(p, 'You\'re already in it.');
      removeVehicle(old);
    }
    if (VEHICLES[car.k].air) {
      // planes are only ever brought to the airport
      const stand = AIRPORT.stands.find((s) => ![...F.vehicles.values()].some((v) => dist2(v.s.o, s) < 500 * 500));
      if (!stand) return note(p, 'Every stand at the airport is taken. Try again soon.');
      ensureAround(stand[0], stand[1], 1);
      const v = addVehicle(car.k, stand, stand[3], 'mine', car.c);
      v.owner = p.id;
      p.fp.mine = v.id;
      return note(p, `Your ${VEHICLES[car.k].name} is waiting on the apron at ${AIRPORT.name} (the airport).`);
    }
    const o = p.ps.origin;
    let lane = null;
    for (const r of [0, 400, 900, 1600]) {
      for (let k = 0; k < 8 && !lane; k++) {
        const a = (k / 8) * Math.PI * 2;
        const l = nearestLane(o[0] + Math.cos(a) * r, o[1] + Math.sin(a) * r);
        if (l && dist2([l.x, l.y], o) > 120 * 120 && ![...F.vehicles.values()].some((v) => dist2(v.s.o, [l.x, l.y]) < 280 * 280)) lane = l;
      }
      if (lane) break;
    }
    if (!lane) return note(p, 'There\'s no road nearby to bring it to.');
    ensureAround(lane.x, lane.y, 1);
    const v = addVehicle(car.k, [lane.x, lane.y, 0], DIR_YAW[lane.dir], 'mine', car.c);
    v.owner = p.id;
    p.fp.mine = v.id;
    note(p, `Your ${VEHICLES[car.k].name} is parked on the road nearby (the car on your radar).`);
  }
  F.message = (p, m) => {
    if (!p.fp) return;
    const d = p.fp.data;
    if (m.k === 'buy') {
      const k = VEHICLE_INDEX[m.id];
      const V = VEHICLES[k];
      if (!V || !V.shop) return;
      if (d.cars.length >= GARAGE) return note(p, `Your garage is full (${GARAGE} vehicles).`);
      if (!pay(p, V.price)) return note(p, `You need $${(V.price - d.cash).toLocaleString()} more for the ${V.name}.`);
      d.cars.push({ k, c: Number.isInteger(m.paint) && m.paint >= 0 && m.paint < PAINTS.length ? m.paint : 0 });
      state(p);
      note(p, `Bought: ${V.name}. It's on its way.`);
      deliver(p, d.cars.length - 1);
    } else if (m.k === 'call') deliver(p, m.n | 0);
    else if (m.k === 'save') {
      // keep the vehicle you're driving: it goes in your garage and the phone can bring it back any time
      const v = p.ps.car ? F.vehicles.get(p.ps.car.id) : null;
      if (!v) return note(p, 'Get in the driver\'s seat of the vehicle you want to keep.');
      if (v.owner === p.id) return note(p, 'It\'s already yours.');
      if (p.fp.wanted) return note(p, 'Lose the police first.');
      if (v.wreck) return;
      if (d.cars.length >= GARAGE) return note(p, `Your garage is full (${GARAGE} vehicles).`);
      d.cars.push({ k: v.k, c: v.paint });
      const old = F.vehicles.get(p.fp.mine);
      if (old && old !== v) { old.owner = 0; old.kind = 'parked'; }
      v.kind = 'mine'; v.owner = p.id; v.siren = false;
      p.fp.mine = v.id;
      save(p);
      state(p);
      note(p, `Saved: the ${VEHICLES[v.k].name} is in your garage now. Call it from the phone whenever you like.`);
    } else if (m.k === 'jamal') {
      // a phone call to Jamal: the police forget all about you, for a price
      if (!p.fp.wanted) return note(p, 'Jamal: "You\'re clean, my friend. Call me when you\'re in trouble."');
      if (!pay(p, JAMAL)) return note(p, `Jamal: "That's $${JAMAL.toLocaleString()}. Come back when you've got it."`);
      p.fp.wanted = 0;
      ev({ e: 'wanted', id: p.id, w: 0, jamal: 1 }, p.id);
      for (const n of F.peds.values()) if (n.kind === 'cop' && n.target === p.id) { n.state = 'walk'; n.walk = null; n.target = 0; }
      for (const v of F.vehicles.values()) if (v.ai && v.ai.target === p.id) v.ai.target = 0;
      state(p);
      note(p, 'Jamal: "Done. Your file just went missing. Keep your head down."');
    }
    else if (m.k === 'gun' || m.k === 'ammo' || m.k === 'armor') {
      const shop = PLACES.find((s) => s.type === 'gun' && dist2(s.front, p.ps.origin) < 260 * 260);
      if (!shop || !p.ps.alive) return note(p, 'You have to be at the gun shop counter.');
      if (m.k === 'armor') {
        if (p.ps.armor >= 100) return note(p, 'Your armour is full.');
        if (!pay(p, ARMOR_PRICE)) return note(p, 'Not enough cash.');
        p.ps.armor = 100;
      } else {
        const row = GUN_SHOP.find((r) => r[0] === m.w);
        if (!row) return;
        const wi = WEAPON_INDEX[row[0]], W = WEAPONS[wi];
        if (m.k === 'gun') {
          if ((d.guns >> wi) & 1) return note(p, `You already own the ${W.name.toLowerCase()}.`);
          if (!pay(p, row[1])) return note(p, `You need $${(row[1] - d.cash).toLocaleString()} more.`);
          d.guns |= 1 << wi;
          giveWeapon(p.ps, wi);
          if (W.ammo) p.ps.ammo[W.ammo] = W.maxAmmo;
        } else {
          if (!((p.ps.owned >> wi) & 1) || !W.ammo) return;
          if (p.ps.ammo[W.ammo] >= W.maxAmmo) return note(p, 'Ammo is full.');
          if (!pay(p, row[2])) return note(p, 'Not enough cash.');
          p.ps.ammo[W.ammo] = W.maxAmmo;
        }
      }
      ev({ e: 'bought', id: p.id }, p.id);
      state(p);
    }
  };

  // ---------------------------------------------------------------- every tick
  function populate(people) {
    const t = now();
    const near = (o, r) => people.some((p) => dist2(p.ps.origin, o) < r * r);
    for (const v of [...F.vehicles.values()]) {
      if (v.seats.some(Boolean)) continue;
      if (v.kind === 'mine' && R.players.has(v.owner)) continue;
      if (v.wreck && t - v.wreck > 45) { removeVehicle(v); continue; }
      if (!near(v.s.o, DESPAWN) || (v.ai && v.ai.stuckN > 6 && !near(v.s.o, 2500)) || v.s.o[2] < -150) removeVehicle(v);
    }
    for (const n of [...F.peds.values()]) {
      const r = n.kind === 'cop' && n.state === 'hunt' ? PED_DESPAWN * 1.3 : PED_DESPAWN;
      if (!near(n.ps.origin, r) || (n.state === 'idle' && !n.home && !near(n.ps.origin, 2000))) removePed(n);
    }
    for (const p of people) {
      const o = p.ps.origin;
      const urban = isUrban(district(cellOf(o[0]), cellOf(o[1])));
      let cars = 0, peds = 0;
      for (const v of F.vehicles.values()) if (v.kind === 'traffic' && dist2(v.s.o, o) < 8500 * 8500) cars++;
      for (const n of F.peds.values()) if (n.kind === 'civ' && dist2(n.ps.origin, o) < 5000 * 5000) peds++;
      if (cars < (urban ? TRAFFIC.urban : TRAFFIC.rural) && F.vehicles.size < 70) for (let k = 0; k < 2; k++) spawnTraffic(p, urban);
      if (peds < (urban ? PEOPLE.urban : PEOPLE.rural) && F.peds.size < 80) for (let k = 0; k < 3; k++) spawnPed(p);
      // the police: more cars the more stars
      const w = p.fp?.wanted || 0;
      if (w) {
        let units = 0;
        for (const v of F.vehicles.values()) if (v.kind === 'police' && v.ai?.target === p.id && !v.wreck && v.npc[0] >= 0) units++;
        if (units < Math.min(5, w) && t >= p.fp.dispatchAt) { spawnPolice(p); p.fp.dispatchAt = t + (w >= 3 ? 4 : 8); }
        for (const n of F.peds.values()) if (n.kind === 'cop' && n.state !== 'hunt' && dist2(n.ps.origin, o) < 2500 * 2500) { n.state = 'hunt'; n.target = p.id; }
      }
    }
  }
  // ---------------------------------------------------------------- airfields
  F.missiles = new Map();
  let nextMissile = 1, samAt = 0;
  function airfieldsThink(people, dt) {
    const t = now();
    for (const a of AIRFIELDS) {
      const near = people.some((p) => dist2(p.ps.origin, a.center) < 12000 * 12000);
      if (!near) continue;
      // planes waiting on the apron (fighters at the base): filled again when nobody's looking
      a.parked ||= new Map();
      a.stands.forEach((s, k) => {
        if (k % 2) return; // every other stand stays free (deliveries at the airport)
        const id = a.parked.get(k);
        const v = id && F.vehicles.get(id);
        if (v && !v.wreck && dist2(v.s.o, s) < 400 * 400) return;
        if (v && (v.owner || v.seats.some(Boolean))) a.parked.delete(k);
        if (people.some((p) => dist2(p.ps.origin, s) < 2500 * 2500)) return;
        if ([...F.vehicles.values()].some((o) => dist2(o.s.o, s) < 500 * 500)) return;
        ensureAround(s[0], s[1], 1);
        const kind = a.military ? 'talon' : ['skylark', 'skylark', 'duster', 'comet', 'kite'][(Math.random() * 5) | 0];
        const nv = addVehicle(VEHICLE_INDEX[kind], s, s[3], a.military ? 'military' : 'parked', a.military ? 9 : undefined);
        a.parked.set(k, nv.id);
      });
    }
    // Fort Talon: off limits. Inside the fence the guards come for you; take a jet and the missiles do.
    for (const p of people) {
      if (!p.ps.alive) continue;
      const o = p.ps.origin, v = vehicleOf(p);
      const flying = v && VEHICLES[v.k].air && !v.s.g;
      if (inAirfield(AIRBASE, o[0], o[1]) && !flying && o[2] < 400) {
        if (p.fp.wanted < 4) { if (!p.fp.warned) { note(p, 'Restricted area! Fort Talon is a military base.'); p.fp.warned = true; } crime(p, 'trespass'); }
        let soldiers = 0;
        for (const n of F.peds.values()) if (n.soldier) soldiers++;
        if (soldiers < 8 && t >= (F.soldierAt || 0)) {
          F.soldierAt = t + 1.5;
          const a = Math.random() * Math.PI * 2, r = 900 + Math.random() * 900;
          const sx = o[0] + Math.cos(a) * r, sy = o[1] + Math.sin(a) * r;
          if (inAirfield(AIRBASE, sx, sy)) {
            ensureAround(sx, sy, 0);
            const n = makePed('cop', [sx, sy, 0], Math.atan2(o[1] - sy, o[0] - sx) * D, SOLDIER_LOOK);
            n.soldier = true; n.hp = 150; n.state = 'hunt'; n.target = p.id;
          }
        }
      }
      if (v && v.k === VEHICLE_INDEX.talon && p.ps.car && v.owner !== p.id && !v.flagged) { v.flagged = true; crime(p, 'jet'); }
    }
    // missile sites shoot at stolen jets and wanted pilots over the base
    if (t >= samAt) {
      samAt = t + SAM.every;
      for (const v of F.vehicles.values()) {
        const p = driverOf(v);
        if (!p || !VEHICLES[v.k].air || v.s.g || v.wreck) continue;
        if (dist2(v.s.o, AIRBASE.center) > SAM.range * SAM.range) continue;
        if (!(p.fp.wanted >= 3 || (v.k === VEHICLE_INDEX.talon && v.owner !== p.id))) continue;
        let inFlight = 0;
        for (const m of F.missiles.values()) if (m.target === v.id) inFlight++;
        if (inFlight >= 2) continue;
        const site = AIRBASE.sams[(Math.random() * AIRBASE.sams.length) | 0];
        launch([site[0], site[1], 160], [0, 0, 1], v.id, null);
        ev({ e: 'lock', id: p.id }, p.id);
      }
    }
    // missiles: home in, burn out, blow up
    for (const m of [...F.missiles.values()]) {
      m.t += dt;
      const tv = m.target && F.vehicles.get(m.target);
      if (tv && !tv.wreck && t >= m.lostAt) {
        const lead = 0.25;
        const want = [tv.s.o[0] + tv.s.v[0] * lead - m.o[0], tv.s.o[1] + tv.s.v[1] * lead - m.o[1], tv.s.o[2] + 40 + tv.s.v[2] * lead - m.o[2]];
        const l = Math.hypot(...want) || 1;
        const sp = Math.hypot(...m.v) || 1;
        const k = Math.min(1, (SAM.turn * DEG * dt) * 1.4);
        for (let i = 0; i < 3; i++) m.v[i] = m.v[i] / sp * (1 - k) + (want[i] / l) * k;
        const n = Math.hypot(...m.v) || 1;
        for (let i = 0; i < 3; i++) m.v[i] = (m.v[i] / n) * SAM.speed;
        if (Math.hypot(tv.s.o[0] - m.o[0], tv.s.o[1] - m.o[1], tv.s.o[2] + 40 - m.o[2]) < 280) { boom(m, tv); continue; }
      }
      const end = [m.o[0] + m.v[0] * dt, m.o[1] + m.v[1] * dt, m.o[2] + m.v[2] * dt];
      const tr = world().trace(m.o, end, [0, 0, 0], [0, 0, 0]);
      m.o = tr.endpos.slice();
      if (tr.fraction < 1) { boom(m, tr.dyn ? F.vehicles.get(tr.dyn.id) : null); continue; }
      if (m.t > SAM.life) F.missiles.delete(m.id);
    }
  }
  function launch(o, dir, target, owner) {
    const id = nextMissile++;
    F.missiles.set(id, { id, o: o.slice(), v: dir.map((x) => x * SAM.speed), target, owner, t: 0, lostAt: 0 });
  }
  function boom(m, hit) {
    F.missiles.delete(m.id);
    const at = m.o.map(r1);
    ev({ e: 'boom', id: 0, o: at, k: 'rocket' });
    if (hit) damageVehicle(hit, SAM.damage, m.owner);
    api.blast(at, { radius: 360, splash: 120, knock: 600 }, m.owner, 'rpg');
  }
  // flares: missiles chasing you lose you, mostly
  function flares(v) {
    const t = now();
    if (t < (v.flareAt || 0)) return;
    v.flareAt = t + 5;
    ev({ e: 'flare', v: v.id, o: v.s.o.map(r1) });
    for (const m of F.missiles.values()) if (m.target === v.id && Math.random() < 0.75) { m.target = 0; m.lostAt = Infinity; }
  }
  // the fighter: a cannon (left mouse) and missiles that lock on to what's in front (right mouse)
  function jetWeapons(p, v, cmd, pressed) {
    const t = now(), s = v.s, V = VEHICLES[v.k];
    const cp = Math.cos(s.pitch * DEG);
    const f = [cp * Math.cos(s.yaw * DEG), cp * Math.sin(s.yaw * DEG), Math.sin(s.pitch * DEG)];
    const nose = [s.o[0] + f[0] * (V.hx + 30), s.o[1] + f[1] * (V.hx + 30), s.o[2] + 40 + f[2] * (V.hx + 30)];
    if (cmd.buttons & BTN.ATTACK && t >= (v.gunAt || 0)) {
      v.gunAt = t + 0.07;
      const end = [nose[0] + f[0] * 9000, nose[1] + f[1] * 9000, nose[2] + f[2] * 9000];
      const w = world();
      w.skip = v.id;
      const tr = w.trace(nose, end, [0, 0, 0], [0, 0, 0]);
      w.skip = 0;
      let frac = tr.fraction, hitP = null, hitN = null;
      for (const q of players()) { if (q === p || !q.ps.alive) continue; const h = hitTest(nose, end, q.ps.origin, q.ps.ducked); if (h && h.frac < frac) { frac = h.frac; hitP = q; } }
      for (const n of F.peds.values()) { const h = hitTest(nose, end, n.ps.origin, n.ps.ducked); if (h && h.frac < frac) { frac = h.frac; hitN = n; hitP = null; } }
      const e = [nose[0] + f[0] * 9000 * frac, nose[1] + f[1] * 9000 * frac, nose[2] + f[2] * 9000 * frac];
      ev({ e: 'shot', id: p.id, w: WEAPON_INDEX.lmg, s: nose.map(r1), h: [[...e.map(r1), hitP ? hitP.id : hitN ? hitN.id : 0, hitP || hitN ? 0 : tr.fraction < 1 ? 1 : 0, tr.normal.map((x) => +x.toFixed(2))]], jet: 1 });
      if (hitP) api.damage(hitP, p, 34, 'jet', f);
      else if (hitN) F.hurt(hitN, p, 60, 'jet', false, f);
      else if (tr.dyn) { const o = F.vehicles.get(tr.dyn.id); if (o) damageVehicle(o, 45, p); }
    }
    if (pressed & BTN.ATTACK2 && t >= (v.misAt || 0)) {
      v.misAt = t + 1.6;
      let best = null, bd = 0.94;
      for (const o of F.vehicles.values()) {
        if (o === v || o.wreck) continue;
        const d = [o.s.o[0] - s.o[0], o.s.o[1] - s.o[1], o.s.o[2] - s.o[2]], l = Math.hypot(...d);
        if (l > 14000 || l < 300) continue;
        const c = (d[0] * f[0] + d[1] * f[1] + d[2] * f[2]) / l;
        if (c > bd) { bd = c; best = o; }
      }
      launch(nose, f, best ? best.id : 0, p);
      const tp = best && driverOf(best);
      if (tp) ev({ e: 'lock', id: tp.id }, tp.id);
    }
  }

  function playerThink(p, dt) {
    const fp = p.fp;
    if (!fp) return;
    const t = now();
    // police close by still know roughly where you are
    if (fp.wanted && t - (fp.nearAt || 0) > 0.5) {
      fp.nearAt = t;
      for (const n of F.peds.values()) if (n.kind === 'cop' && n.state === 'hunt' && n.target === p.id && dist2(n.ps.origin, p.ps.origin) < 1200 * 1200) { fp.seenAt = Math.max(fp.seenAt, t - 2); break; }
    }
    if (fp.wanted && t - fp.seenAt > 8 + fp.wanted * 3) { fp.wanted = 0; ev({ e: 'wanted', id: p.id, w: 0 }, p.id); }
    // health comes back slowly when nobody's hurting you
    if (p.ps.alive && t - (p.lastHurt || 0) > 8 && p.ps.hp < 100) p.ps.hp = Math.min(100, p.ps.hp + 4 * dt);
    if (fp.robProg && !F.stores.size) fp.robProg = 0;
    if (fp.dirty && t >= (fp.saveAt || 0)) { fp.dirty = false; fp.saveAt = t + 5; api.save(p); }
    if (fp.first && p.ps.alive) { fp.first = false; note(p, 'Welcome to Mugr County. P opens your phone: buy cars and bikes. E gets in a car. Gun shops and gas stations are on the radar.'); }
  }

  F.think = (dt) => {
    const t = now();
    const people = players().filter((p) => p.fp);
    if (t >= F.streamAt) {
      F.streamAt = t + 0.2;
      for (const p of people) ensureAround(p.ps.origin[0], p.ps.origin[1], 3);
      for (const v of F.vehicles.values()) ensureAround(v.s.o[0], v.s.o[1], 1);
      compact(people);
    }
    const dyn = [];
    for (const v of F.vehicles.values()) for (const b of carBoxes(v.s, v.id)) dyn.push(b);
    world().dyn = dyn;
    collectObstacles();
    releaseJunctions();
    if (t >= F.popAt) { F.popAt = t + 0.5; populate(people); }
    for (const v of [...F.vehicles.values()]) vehicleThink(v, dt);
    // passengers ride along
    for (const v of F.vehicles.values()) v.seats.forEach((p, s) => { if (p && s > 0) seatPlayer(p, v, s); });
    runOver();
    for (const n of [...F.peds.values()]) pedThink(n, dt);
    storesThink(people, dt);
    airfieldsThink(people, dt);
    pickups(people);
    for (const p of people) playerThink(p, dt);
  };

  // ---------------------------------------------------------------- what each player sees
  function personal(p) {
    const fp = p.fp, o = p.ps.origin;
    const v = vehicleOf(p);
    let prompt = '';
    if (!v && p.ps.alive) {
      for (const s of PLACES) if (s.type === 'gun' && dist2(s.front, o) < 150 * 150 && Math.abs(s.front[2] - o[2]) < 60) prompt = 'E|Buy weapons';
      if (!prompt) {
        let best = null, bd = Infinity;
        for (const c of F.vehicles.values()) { if (c.wreck || !touches(c.s, o, 60)) continue; const d = dist2(c.s.o, o); if (d < bd) { bd = d; best = c; } }
        if (best) {
          const V = VEHICLES[best.k];
          const free = !best.seats[0] ? 0 : V.seat.findIndex((_, s) => s > 0 && !best.seats[s] && best.npc[s] < 0);
          if (free === 0) prompt = `E|${best.npc[0] >= 0 || best.kind === 'military' ? 'Steal the' : best.kind === 'mine' && best.owner === p.id ? (V.air ? 'Fly your' : 'Get in your') : V.air ? 'Fly the' : 'Get in the'} ${V.name}`;
          else if (free > 0) prompt = `E|Ride along in the ${V.name}`;
        }
      }
      if (!prompt) for (const s of PLACES) {
        if (s.type !== 'gas') continue;
        const I = s.inside;
        if (o[0] > I.mins[0] && o[0] < I.maxs[0] && o[1] > I.mins[1] && o[1] < I.maxs[1] && Math.abs(o[2] - I.mins[2]) < 40) { prompt = fp.robProg > 0 ? '' : '|Point a gun at the cashier to rob the till'; break; }
      }
    }
    const seat = p.ps.seat ? p.ps.seat.s : p.ps.car ? 0 : -1;
    let lock = 0;
    if (v) for (const m of F.missiles.values()) if (m.target === v.id) lock = 1;
    return [fp.data.cash, fp.wanted, fp.wanted && now() - fp.seenAt > 2.5 ? 1 : 0, v ? v.id : 0, seat, prompt, Math.round((fp.robProg || 0) * 100), fp.mine, lock];
  }
  function vrow(v, p) {
    const s = v.s;
    let occ = 0;
    for (let k = 0; k < 4; k++) {
      const q = v.seats[k];
      const look = q ? lookOf(q) : v.npc[k] ?? -1;
      occ |= (look >= 0 ? look & 31 : 63) << (k * 6);
    }
    const flags = (v.siren ? 1 : 0) | (v.brake ? 2 : 0) | (v.horn > now() ? 4 : 0) | (v.burn ? 8 : 0) | (v.wreck ? 16 : 0) | (v.hp < v.maxHp * 0.45 ? 32 : 0) | (v.owner === p.id ? 64 : 0) | (v.kind === 'police' ? 128 : 0);
    return [v.id, v.k, r1(s.o[0]), r1(s.o[1]), r1(s.o[2]), Math.round(s.yaw * 10) / 10, r1(s.v[0]), r1(s.v[1]), Math.round(s.steer * 100), flags, v.paint, occ, Math.round((s.pitch || 0) * 10), Math.round((s.roll || 0) * 10), r1(s.v[2]), Math.round((s.thr || 0) * 100)];
  }
  function prow(n) {
    const kind = n.kind === 'cop' ? 1 : n.kind === 'clerk' ? 2 : n.kind === 'gunclerk' ? 3 : 0;
    const flags = kind | (n.state === 'handsup' ? 4 : 0) | (n.state === 'cower' || n.state === 'flee' ? 8 : 0) | (n.kind === 'cop' && n.state === 'hunt' ? 16 : 0) | (n.ps.ducked ? 32 : 0);
    return [n.id, r1(n.ps.origin[0]), r1(n.ps.origin[1]), r1(n.ps.origin[2]), Math.round(n.yaw), flags, r1(n.ps.velocity[0]), r1(n.ps.velocity[1]), n.look];
  }
  F.view = (p, full) => {
    const o = p.ps.origin;
    const out = { fp: personal(p) };
    if (!full) return out;
    const near = (list, pos, r, cap) => list.map((x) => [x, dist2(pos(x), o)]).filter((e) => e[1] < r * r).sort((a, b) => a[1] - b[1]).slice(0, cap).map((e) => e[0]);
    // aircraft show from much further away
    out.fv = [...F.vehicles.values()].map((v) => [v, dist2(v.s.o, o) / (VEHICLES[v.k].air ? 9 : 1)]).filter((e) => e[1] < SEE_V * SEE_V).sort((a, b) => a[1] - b[1]).slice(0, 48).map((e) => vrow(e[0], p));
    out.fx = [...F.missiles.values()].filter((m) => dist2(m.o, o) < 30000 * 30000).map((m) => [m.id, r1(m.o[0]), r1(m.o[1]), r1(m.o[2]), r1(m.v[0]), r1(m.v[1]), r1(m.v[2])]);
    // your own car always comes through
    const mine = F.vehicles.get(p.fp?.mine);
    if (mine && !out.fv.some((r) => r[0] === mine.id)) out.fmv = [mine.id, r1(mine.s.o[0]), r1(mine.s.o[1])];
    out.fn = near([...F.peds.values()], (n) => n.ps.origin, SEE_P, 44).map(prow);
    out.fm = near([...F.cash.values()], (c) => c.o, 4000, 30).map((c) => [c.id, r1(c.o[0]), r1(c.o[1]), r1(c.o[2])]);
    return out;
  };
  F.welcome = (p) => ({ cash: p.fp?.data.cash || 0, cars: p.fp?.data.cars || [], guns: p.fp?.data.guns || 0 });
  F.wantedOf = (p) => p.fp?.wanted || 0;
  return F;
}
