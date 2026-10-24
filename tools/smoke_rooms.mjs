// Headless smoke test for rooms, codes and projectiles. Usage: node tools/smoke_rooms.mjs <port>
import WebSocket from 'ws';
const port = process.argv[2] || 8099, base = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { ws, msgs: [], events: [], welcome: null, error: null, me: null, seq: 0 };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    c.msgs.push(m.t);
    if (m.t === 'welcome') c.welcome = m;
    if (m.t === 'error') c.error = m.text;
    if (m.t === 's') { c.me = m.me; c.events.push(...m.ev); }
  });
  c.send = (o) => ws.send(JSON.stringify({ name, color: 1, ...o }));
  c.cmd = (b, pitch = 0, w) => c.send({ t: 'c', c: [{ s: ++c.seq, f: 0, sd: 0, b, y: 0, p: pitch, w, ms: 16.67, rt: 0 }] });
  return new Promise((r) => ws.on('open', () => r(c)));
}
const out = {};
out.listBefore = (await (await fetch(base + '/api/rooms')).json()).map((r) => `${r.name}(${r.players}/${r.max})`);
const A = await client('Alpha');
A.send({ t: 'create', settings: { name: 'Rocket test', map: 'foundry', loadout: 'explosives', gravity: 0.5, private: true, maxPlayers: 4 } });
await sleep(400);
out.created = A.welcome && { code: A.welcome.room.code, private: A.welcome.room.private, rules: A.welcome.rules, map: A.welcome.mapName };
const code = A.welcome.room.code;
const B = await client('Bravo');
B.send({ t: 'join', room: 'ZZZZ' }); await sleep(200); out.wrongCode = B.error; B.error = null;
B.send({ t: 'join', room: String(A.welcome.room.id) }); await sleep(200); out.privateById = B.error; B.error = null;
B.send({ t: 'join', room: code.toLowerCase() }); await sleep(400); out.joinedByCode = !!B.welcome && B.welcome.room.code === code;
out.listAfter = (await (await fetch(base + '/api/rooms')).json()).map((r) => r.name);
// Alpha: let the spawn settle, switch to rockets (index 8), wait out the draw, fire straight down
for (let i = 0; i < 40; i++) { A.cmd(0, 89, 8); await sleep(17); }
const hpBefore = A.me.hp, zBefore = A.me.o[2];
A.cmd(8, 89, 8); // ATTACK
let maxVz = -1e9, maxZ = zBefore;
for (let i = 0; i < 60; i++) { A.cmd(0, 89, 8); await sleep(17); maxVz = Math.max(maxVz, A.me.v[2]); maxZ = Math.max(maxZ, A.me.o[2]); }
const ev = A.events.map((e) => e.e);
out.rocket = { events: [...new Set(ev)].join(','), hpBefore, hpAfter: A.me.hp, liftedBy: Math.round(maxZ - zBefore), peakUpSpeed: Math.round(maxVz) };
// grenade (index 9): throw forward, expect a boom ~2.5s later
A.events = [];
for (let i = 0; i < 40; i++) { A.cmd(0, 0, 9); await sleep(17); }
A.cmd(8, -10, 9);
for (let i = 0; i < 200; i++) { A.cmd(0, 0, 9); await sleep(17); if (A.events.some((e) => e.e === 'boom')) break; }
const g = A.events.filter((e) => ['proj', 'bounce', 'boom'].includes(e.e)).map((e) => e.e);
out.grenade = g.join(',');
console.log(JSON.stringify(out, null, 1));
process.exit(0);
