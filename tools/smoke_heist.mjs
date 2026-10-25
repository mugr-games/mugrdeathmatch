// Headless test of the heist rules and AI on the real bank map, without the network: robbers are moved by
// hand; guards, cameras, staff and police run as on the server. Usage: node tools/smoke_heist.mjs
import { CODE_MAPS } from '../public/js/mapdefs.js';
import { BoxWorld } from '../public/js/collide.js';
import { newPlayerState, BTN } from '../public/js/pmove.js';
import { buildNav } from '../public/js/nav.js';
import { initLoadout } from '../public/js/sim.js';
import { createHeist } from '../heist.js';

const def = CODE_MAPS.bank;
const nav = buildNav(def.boxes, def.pads, def.bounds, def.doors);
const TICK = 1 / 60;

function setup(difficulty = 'normal', approach = 'stealth') {
  const world = new BoxWorld(def.boxes, def.pads);
  const doorBoxes = def.doors.map((d) => world.addBox({ mins: d.mins, maxs: d.maxs, mat: 'door' }));
  const events = [];
  const R = { time: 0, code: 'TEST', settings: { private: false }, players: new Map(), map: { world, killZ: def.killZ, nav }, rules: { gravity: 1, speed: 1, jump: 1 } };
  const place = (p, o) => { p.ps = newPlayerState(o); p.ps.alive = true; p.ps.hp = 100; p.ps.armor = 0; p.ps.time = 0; initLoadout(p.ps, 'default'); };
  const api = {
    pushEvent: (ev) => events.push(ev),
    award: (p, n) => { p.coins = (p.coins || 0) + n; },
    stat: () => {},
    damage: (p, dmg) => { p.ps.hp -= dmg; p.hurt = (p.hurt || 0) + dmg; if (p.ps.hp <= 0 && !H.down(p)) { p.ps.alive = false; H.died(p); p.respawnAt = R.time + H.respawnDelay(); } },
    kill: (p) => { p.ps.alive = false; },
    respawn: (p) => { place(p, [-1100 + p.id * 60, -680, 1]); H.loadout(p); },
    plan: () => {},
    players: () => R.players.values(),
  };
  const H = createHeist(R, { ...def, heist: def.heist }, nav, doorBoxes, api);
  const crew = [1, 2].map((id) => { const p = { id, name: 'Robber' + id, yaw: 0, buttons: 0 }; place(p, [-1100 + id * 60, -680, 1]); R.players.set(id, p); H.join(p); return p; });
  H.message(crew[0], { k: 'set', difficulty, approach });
  H.message(crew[1], { k: 'ready', ready: true });
  H.message(crew[0], { k: 'start' });
  const run = (sec, each) => { for (let i = 0; i < sec * 60; i++) { R.time += TICK; each?.(); H.think(TICK); } };
  const press = (p, btn) => { H.cmd(p, { buttons: btn }, btn); };
  const hold = (p, btn) => { p.buttons = btn; };
  return { R, H, crew, events, run, press, hold, place };
}
const out = {};
const kinds = (H) => { const c = {}; for (const n of H.npcs.values()) c[n.kind] = (c[n.kind] || 0) + 1; return c; };

// 1. start: who's in the bank
{
  const { H, crew } = setup('normal');
  out.start = { phase: H.phase, npcs: kinds(H), masked: crew.map((p) => p.hk.masked) };
}

// 2. unmasked in the lobby: nobody minds. Masked in front of the door guard: spotted, and the alarm goes
{
  const { H, crew, events, run, press, place } = setup('normal');
  const [a, b] = crew;
  place(a, [-110, -250, 1]); a.yaw = -90; // in front of the door guard, who looks north into the lobby
  place(b, [-1000, -680, 1]);
  run(3);
  const calm = { alarm: H.alarm, det: Math.round(Math.max(0, ...[...H.npcs.values()].map((n) => n.det.get(a.id) || 0)) * 100) };
  press(a, BTN.MASK);
  let spottedAt = null;
  run(12, () => { if (!spottedAt && [...H.npcs.values()].some((n) => n.state === 'alerted')) spottedAt = H.R?.time ?? 1; });
  out.stealth = { calmUnmasked: calm, spotted: [...events].some((e) => e.k === 'alert'), alarm: H.alarm, why: H.alarmWhy };
}

// 3. kill the guard who spotted you before he can raise the alarm
{
  const { H, crew, events, run, press, place } = setup('normal');
  const [a] = crew;
  place(a, [-110, -250, 1]); a.yaw = -90;
  press(a, BTN.MASK);
  let alerted = null;
  run(6, () => { if (!alerted) alerted = [...H.npcs.values()].find((n) => n.state === 'alerted') || null; if (alerted && H.npcs.has(alerted.id)) H.hurt(alerted, a, 999, 'pistol', true, null); });
  run(10);
  out.silence = { alertedOne: !!alerted, alarm: H.alarm, why: H.alarmWhy, alerts: events.filter((e) => e.k === 'alert' || e.k === 'civ').map((e) => `${e.k}:${e.id}:${e.why || e.s}`) };
}

// 4. loud: the alarm, then police squads that use cover and shoot
{
  const { H, crew, events, run, place, R } = setup('hard', 'loud');
  const [a, b] = crew;
  place(a, [0, -300, 1]); place(b, [200, -350, 1]);
  let maxPolice = 0, coverUsed = 0, peeks = 0, flankers = 0;
  const t0 = Date.now();
  run(90, () => {
    const pol = [...H.npcs.values()].filter((n) => n.kind === 'police' || n.kind === 'swat');
    maxPolice = Math.max(maxPolice, pol.length);
    for (const n of H.npcs.values()) { if (n.cover) coverUsed++; if (n.coverPhase === 'peek' && n.cover) peeks++; if (n.role === 'flank') flankers++; }
    // the robbers don't die in this test, so the police keep coming
    for (const p of crew) { p.ps.hp = Math.max(p.ps.hp, 1); p.ps.alive = true; p.ps.downed = false; }
  });
  const shots = events.filter((e) => e.e === 'shot').length;
  out.loud = { alarm: H.alarm, why: H.alarmWhy, maxPolice, shots, hurt: crew.map((p) => Math.round(p.hurt || 0)), coverTicks: coverUsed, peekTicks: peeks, flankerTicks: flankers > 0, assault: H.assault, msPerTick: +((Date.now() - t0) / (90 * 60)).toFixed(2) };
}

// 5. the whole job, quietly: keycard, staff door, cameras, vault hack, bags, van, away
{
  const { H, crew, events, run, press, hold, place } = setup('easy');
  const [a, b] = crew;
  // kill everyone first so the test is about the objectives
  for (const n of [...H.npcs.values()]) n.state = 'tied', n.kind === 'civ' || H.npcs.delete(n.id);
  for (const p of crew) press(p, BTN.MASK);
  const doHold = (p, at, sec) => { place(p, at); hold(p, BTN.USE); run(sec); hold(p, 0); };
  doHold(a, [-80, 395, 1], 0.6); // the keycard on the manager's desk... from the corridor side? (teleported in)
  const card = a.hk.keycard;
  doHold(a, [0, -18, 1], 1.5);
  const staff = H.doors[0].open;
  doHold(b, [-520, 360, 1], 8);
  const cams = H.camsLooped;
  doHold(a, [270, 262, 1], 22);
  const vault = H.vault.open;
  doHold(a, [170, 378, 1], 3);
  doHold(b, [270, 418, 1], 3);
  const bags = [a.hk.bag, b.hk.bag];
  doHold(a, [140, 330, 1], 2);
  place(a, [-1050, -690, 1]); place(b, [-1060, -700, 1]);
  run(0.5);
  const secured = H.secured;
  doHold(a, [-1050, -690, 1], 2.5);
  out.job = { card, staff, cams, vault, bags, secured, cash: H.cash, phase: H.phase, result: H.result };
}
console.log(JSON.stringify(out, null, 1));
