// Headless test for bots and zombies. Usage: node tools/smoke_ai.mjs <port>   (about a minute: real timers)
// 1. a deathmatch with five bots: they should find and kill each other
// 2. zombies on the City, solo: walk to the 357 on the wall and buy it, then let the zombies come
import WebSocket from 'ws';
import { CODE_MAPS } from '../public/js/mapdefs.js';
import { buildNav, nearestNode, findPath } from '../public/js/nav.js';
import { BTN } from '../public/js/pmove.js';
import { WEAPON_INDEX } from '../public/js/weapons.js';

const port = process.argv[2] || 8099;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { ws, events: [], welcome: null, snap: null, me: null, seq: 0, scores: null };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'welcome') c.welcome = m;
    if (m.t === 'score') c.scores = m.s;
    if (m.t === 's') { c.snap = m; c.me = m.me; c.events.push(...m.ev); }
  });
  c.send = (o) => ws.send(JSON.stringify({ name, color: 1, ...o }));
  c.cmd = (o) => c.send({ t: 'c', c: [{ s: ++c.seq, f: 0, sd: 0, b: 0, y: 0, p: 0, ms: 16.67, rt: 0, ...o }] });
  return new Promise((r) => ws.on('open', () => r(c)));
}
const out = {};

const bots = (async () => {
  const A = await client('Watcher');
  A.send({ t: 'create', settings: { name: 'bots', mode: 'dm', map: 'warehouse', private: true, bots: 5, botSkill: 'hard', fraglimit: 0 } });
  await sleep(600);
  const names = A.welcome.players.filter((p) => p.bot).map((p) => p.name);
  // stay dead-still in a corner? no: just keep sending empty commands so we stay connected
  const t0 = Date.now();
  while (Date.now() - t0 < 35000) { A.cmd({}); await sleep(50); }
  const kills = A.events.filter((e) => e.e === 'kill');
  const shots = A.events.filter((e) => e.e === 'shot' || e.e === 'proj' || e.e === 'melee').length;
  A.ws.close();
  return { bots: names, shotsFired: shots, kills: kills.length, botKills: kills.filter((k) => k.k && k.k !== k.v).length, killedWatcher: kills.filter((k) => k.v === A.welcome.id).length };
})();

const zombies = (async () => {
  const A = await client('Survivor');
  A.send({ t: 'create', settings: { name: 'zm', mode: 'zombies', map: 'city', private: true } });
  await sleep(800);
  const w = A.welcome;
  const r = { mode: w.room.mode, buys: w.cz.buys.length, doors: w.cz.doors.length, startPoints: A.snap.zp[0] };
  // walk to the 357 using the map's walking graph, then press E
  const m = CODE_MAPS.city;
  const nav = buildNav(m.boxes, m.pads, m.bounds, m.doors);
  const target = w.cz.buys.find((b) => b[4] === '357');
  const path = findPath(nav, nearestNode(nav, A.me.o), nearestNode(nav, target[2]), (d) => false);
  r.pathLength = path ? path.length : null;
  let k = 0;
  const walkStart = Date.now();
  let firstZombie = null, closest = Infinity;
  const watch = () => {
    const zb = A.snap.zb || [];
    if (zb.length && !firstZombie) firstZombie = { round: A.snap.zr[0], count: zb.length, secs: Math.round((Date.now() - walkStart) / 1000), dist: Math.round(Math.min(...zb.map((z) => Math.hypot(z[1] - A.me.o[0], z[2] - A.me.o[1])))) };
    for (const z of zb) closest = Math.min(closest, Math.hypot(z[1] - A.me.o[0], z[2] - A.me.o[1]));
  };
  for (let i = 0; i < 1500 && path; i++) {
    watch();
    const o = A.me.o;
    while (k < path.length - 1 && Math.hypot(path[k].x - o[0], path[k].y - o[1]) < 24) k++;
    const wp = path[k];
    const yaw = (Math.atan2(wp.y - o[1], wp.x - o[0]) * 180) / Math.PI;
    const near = Math.hypot(target[2][0] - o[0], target[2][1] - o[1]) < 50;
    A.cmd({ f: near ? 0 : 1, y: yaw, b: near && i % 10 === 0 ? BTN.USE : 0 });
    await sleep(17);
    if (A.events.some((e) => e.e === 'buy')) break;
  }
  const buy = A.events.find((e) => e.e === 'buy');
  r.walk = { secs: Math.round((Date.now() - walkStart) / 1000), distLeft: Math.round(Math.hypot(target[2][0] - A.me.o[0], target[2][1] - A.me.o[1])), waypoint: k, alive: !!A.me.al };
  await sleep(200);
  r.bought = buy ? { weapon: buy.w === WEAPON_INDEX['357'], pointsLeft: A.snap.zp[0], owns357: !!((A.me.ow >> WEAPON_INDEX['357']) & 1) } : null;
  // now hold the spot and shoot the nearest zombie in reach with the revolver (then the pistol)
  const t0 = Date.now();
  const pointsBefore = A.snap.zp[0];
  let i = 0;
  while (Date.now() - t0 < 60000) {
    const zb = (A.snap.zb || []).map((z) => ({ z, d: Math.hypot(z[1] - A.me.o[0], z[2] - A.me.o[1]) })).sort((a, b) => a.d - b.d);
    const near = zb[0] && zb[0].d < 900 ? zb[0].z : null;
    const ammo357 = A.me.cl[WEAPON_INDEX['357']] + A.me.am['357'];
    const w = ammo357 > 0 ? WEAPON_INDEX['357'] : WEAPON_INDEX.pistol;
    if (near) {
      const e = [A.me.o[0], A.me.o[1], A.me.o[2] + 64], c = [near[1], near[2], near[3] + 60];
      const yaw = (Math.atan2(c[1] - e[1], c[0] - e[0]) * 180) / Math.PI, pitch = (-Math.atan2(c[2] - e[2], Math.hypot(c[0] - e[0], c[1] - e[1])) * 180) / Math.PI;
      A.cmd({ y: yaw, p: pitch, w, b: i++ % 2 ? BTN.ATTACK : 0 });
    } else A.cmd({ w });
    await sleep(17);
    watch();
    if (A.events.some((e) => e.e === 'intermission')) break;
  }
  const end = A.events.find((e) => e.e === 'intermission');
  r.round1 = A.events.some((e) => e.e === 'round' && e.n === 1);
  r.firstZombieSeen = firstZombie;
  r.closestZombie = Math.round(closest);
  r.attacks = A.events.filter((e) => e.e === 'zatk').length;
  r.hurtByZombies = A.events.filter((e) => e.e === 'hurt' && e.id === w.id).length;
  r.gameOver = end ? { win: end.win, round: end.round } : null;
  r.zombiesKilled = A.events.filter((e) => e.e === 'zdie').length;
  r.pointsEarned = Math.max(...A.events.filter(() => true).length ? [0] : [0]);
  r.kills = (A.scores || []).find((s) => s[0] === w.id)?.[1];
  r.points = (A.scores || []).find((s) => s[0] === w.id)?.[4];
  r.roundsSeen = A.events.filter((e) => e.e === 'round').map((e) => e.n);
  A.ws.close();
  return r;
})();

out.bots = await bots;
out.zombies = await zombies;
console.log(JSON.stringify(out, null, 1));
process.exit(0);
