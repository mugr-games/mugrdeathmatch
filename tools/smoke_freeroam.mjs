// Headless check of free roam: join, see traffic and people, buy a car on the phone, walk to it, get in,
// drive, get out, buy a gun-free robbery attempt... Usage: node tools/smoke_freeroam.mjs <port>
import WebSocket from 'ws';
const port = process.argv[2] || 8027;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(`ws://localhost:${port}`);
const c = { welcome: null, snap: null, fv: [], fn: [], notes: [], events: {}, maxV: 0, maxP: 0, state: null };
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.t === 'welcome') c.welcome = m;
  if (m.t === 'fp') { if (m.k === 'note') c.notes.push(m.text); if (m.k === 'state') c.state = m; }
  if (m.t === 's') {
    c.snap = m;
    if (m.fv) { c.fv = m.fv; c.maxV = Math.max(c.maxV, m.fv.length); }
    if (m.fn) { c.fn = m.fn; c.maxP = Math.max(c.maxP, m.fn.length); }
    for (const e of m.ev) c.events[e.e] = (c.events[e.e] || 0) + 1;
  }
});
await new Promise((r) => ws.on('open', r));
const send = (o) => ws.send(JSON.stringify({ name: 'RoamTest', color: 2, ...o }));
send({ t: 'join', room: 'FREEROAM' });
let seq = 0;
const cmd = (f, sd, b, y) => send({ t: 'c', c: [{ s: ++seq, f, sd, b, y, p: 0, ms: 16.67, rt: 0 }] });
const run = async (secs, fn) => { const t0 = Date.now(); while (Date.now() - t0 < secs * 1000) { const [f, sd, b, y] = fn(); cmd(f, sd, b, y); await sleep(17); } };
await run(4, () => [0, 0, 0, 0]);
const me = () => c.snap.me;
const out = { map: c.welcome?.mapName, spawn: me().o, cash: c.snap.fp?.[0], trafficSeen: c.maxV, peopleSeen: c.maxP };
send({ t: 'fp', k: 'buy', id: 'pip', paint: 3 });
await run(1, () => [0, 0, 0, 0]);
const mineId = c.snap.fp[7];
out.bought = { mineId, cash: c.snap.fp[0], notes: c.notes.slice(-2) };
// walk to the car
let car = c.fv.find((r) => r[0] === mineId);
out.carAt = car && car.slice(2, 5);
let yaw = 0;
await run(25, () => {
  car = c.fv.find((r) => r[0] === mineId) || car;
  const o = me().o;
  const dx = car[2] - o[0], dy = car[3] - o[1];
  yaw = Math.atan2(dy, dx) * 180 / Math.PI;
  return [Math.hypot(dx, dy) > 90 ? 1 : 0, 0, 0, yaw];
});
out.walkedTo = me().o.map(Math.round);
out.promptNearCar = c.snap.fp[5];
await run(0.2, () => [0, 0, 64, yaw]);
await run(0.5, () => [0, 0, 0, yaw]);
out.inCar = c.snap.fp[3] === mineId && !!me().car;
// drive straight for 4 seconds
const start = me().car ? me().car.slice(2, 4) : null;
await run(4, () => [1, 0, 0, yaw]);
const cs = me().car;
out.drive = cs ? { moved: Math.round(Math.hypot(cs[2] - start[0], cs[3] - start[1])), speed: Math.round(Math.hypot(cs[5], cs[6])) } : null;
await run(1.5, () => [-1, 0, 1, yaw]);
await run(0.2, () => [0, 0, 64, yaw]);
await run(0.5, () => [0, 0, 0, yaw]);
out.outOfCar = !me().car && !me().st;
out.events = c.events;
out.peds = c.fn.slice(0, 2);
out.traffic = c.fv.slice(0, 2);
console.log(JSON.stringify(out, null, 1));
ws.close();
process.exit(0);
