// Paid emotes: a player who hasn't bought one can't do it (nobody else is told); Wave is free for everyone.
// Usage: node tools/sim_emotes.mjs <port> (a server must be running there)
import WebSocket from 'ws';
const port = process.argv[2] || 8099;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { ws, emotes: [], welcome: null };
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'welcome') c.welcome = m; if (m.t === 'emote') c.emotes.push(m.e); });
  c.send = (o) => ws.send(JSON.stringify({ name, color: 1, ...o }));
  return new Promise((r) => ws.on('open', () => r(c)));
}
const A = await client('Dancer');
A.send({ t: 'create', settings: { name: 'Emote test', map: 'foundry', private: true, maxPlayers: 4 } });
await sleep(400);
const B = await client('Watcher');
B.send({ t: 'join', room: A.welcome.room.code });
await sleep(400);
A.send({ t: 'emote', e: 'griddy', yaw: 0 });
await sleep(200);
A.send({ t: 'emote', e: 'wave', yaw: 0 });
await sleep(300);
console.log({ watcherSaw: B.emotes });
const ok = !B.emotes.includes('griddy') && B.emotes.includes('wave');
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
