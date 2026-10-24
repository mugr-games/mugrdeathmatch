// Headless test: break a barrel you can see, and die by falling (checks the ragdoll data in the kill event).
// Usage: node tools/smoke_props.mjs <port>
import WebSocket from 'ws';
import { BoxWorld } from '../public/js/collide.js';
import { CODE_MAPS } from '../public/js/mapdefs.js';

const port = process.argv[2] || 8099;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { ws, events: [], welcome: null, me: null, seq: 0 };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'welcome') c.welcome = m;
    if (m.t === 's') { c.me = m.me; c.events.push(...m.ev); }
  });
  c.send = (o) => ws.send(JSON.stringify({ name, color: 1, ...o }));
  c.cmd = (o) => c.send({ t: 'c', c: [{ s: ++c.seq, f: 0, sd: 0, b: 0, y: 0, p: 0, ms: 16.67, rt: 0, ...o }] });
  return new Promise((r) => ws.on('open', () => r(c)));
}
const aim = (from, to) => {
  const d = [to[0] - from[0], to[1] - from[1], to[2] - from[2]];
  return { y: (Math.atan2(d[1], d[0]) * 180) / Math.PI, p: (-Math.atan2(d[2], Math.hypot(d[0], d[1])) * 180) / Math.PI };
};
const out = {};

// 1. props: rejoin until a barrel is in plain sight from the spawn, then shoot it with the pistol
{
  const map = CODE_MAPS.courtyard;
  const world = new BoxWorld(map.boxes, map.pads);
  let A, target = null;
  for (let tries = 0; tries < 12 && !target; tries++) {
    A = await client('Shooter');
    A.send({ t: 'create', settings: { name: 'props', map: 'courtyard', private: true } });
    await sleep(500);
    for (let i = 0; i < 10; i++) { A.cmd({ w: 1 }); await sleep(17); }
    const eye = [A.me.o[0], A.me.o[1], A.me.o[2] + 64];
    for (const [, kind, o, up] of A.welcome.props) {
      if (kind !== 'barrel' || !up) continue;
      const mid = [o[0], o[1], o[2] + 20];
      if (Math.hypot(mid[0] - eye[0], mid[1] - eye[1]) > 2000) continue;
      // visible if a trace to just in front of it is clear of the map
      const near = mid.map((v, k) => v + (eye[k] - v) * (18 / Math.hypot(mid[0] - eye[0], mid[1] - eye[1], mid[2] - eye[2])));
      if (world.trace(eye, near, [0, 0, 0], [0, 0, 0]).fraction === 1) { target = mid; break; }
    }
    if (!target) A.ws.close();
  }
  let broke = false;
  for (let i = 0; i < 400 && target && !broke; i++) {
    A.cmd({ ...aim([A.me.o[0], A.me.o[1], A.me.o[2] + 64], target), w: 1, b: i % 2 ? 8 : 0 });
    await sleep(17);
    broke = A.events.some((e) => e.e === 'prop' && e.up === 0);
  }
  await sleep(300);
  out.props = { foundVisibleBarrel: !!target, broke, exploded: A.events.some((e) => e.e === 'boom' && e.k === 'barrel'), shooterHp: A.me.hp };
  A.ws.close();
}

// 2. ragdoll data: sprint off a Skyline platform into the void
{
  const A = await client('Faller');
  A.send({ t: 'create', settings: { name: 'fall', map: 'skyline', private: true } });
  await sleep(500);
  let k = null;
  for (let i = 0; i < 600 && !k; i++) { A.cmd({ f: 1, b: 4, y: 90 }); await sleep(17); k = A.events.find((e) => e.e === 'kill'); }
  out.ragdollData = k ? { killed: true, weapon: k.w, deathVelocity: k.vv, ducked: k.dk } : { killed: false, z: A.me.o[2] };
  A.ws.close();
}

console.log(JSON.stringify(out, null, 1));
process.exit(0);
