// Headless check of the zombies maps: join each, stand in the start area, and see zombies spawn and reach you,
// and that the shops and barricades came through. Usage: node tools/smoke_zmaps.mjs <port>
import WebSocket from 'ws';
const port = process.argv[2] || 8027;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
for (const map of ['asylum', 'harvest', 'titanic']) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { welcome: null, snap: null, hurt: 0, maxZ: 0 };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'welcome') c.welcome = m;
    if (m.t === 's') { c.snap = m; c.maxZ = Math.max(c.maxZ, (m.zb || []).length); for (const e of m.ev) if (e.e === 'hurt' && e.id === c.welcome?.id) c.hurt++; }
  });
  await new Promise((r) => ws.on('open', r));
  const send = (o) => ws.send(JSON.stringify({ name: 'ZTest', color: 1, ...o }));
  send({ t: 'create', settings: { name: 'z-' + map, mode: 'zombies', map, private: true } });
  let seq = 0;
  const t0 = Date.now();
  while (Date.now() - t0 < 40000) { send({ t: 'c', c: [{ s: ++seq, f: 0, sd: 0, b: 0, y: 0, p: 0, ms: 16.67, rt: 0 }] }); await sleep(50); }
  out[map] = { mapName: c.welcome?.mapName, buys: c.welcome?.cz?.buys.length, doors: c.welcome?.cz?.doors.length, round: c.snap?.zr?.[0], maxZombies: c.maxZ, hurtTimes: c.hurt, start: c.snap?.me?.o };
  ws.close();
  await sleep(300);
}
console.log(JSON.stringify(out, null, 1));
process.exit(0);
