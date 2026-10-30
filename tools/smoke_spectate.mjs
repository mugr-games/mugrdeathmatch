// Spectating: watch a game by its code or number without being in it, get its snapshots, and get turned away
// from games that don't exist, need a password, or can't be watched. Usage: node tools/smoke_spectate.mjs <port>
import WebSocket from 'ws';
const port = process.argv[2] || 8099;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client() {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { ws, welcome: null, error: null, snaps: 0, none: 0 };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'welcome') c.welcome = m;
    if (m.t === 'error') c.error = m.text;
    if (m.t === 's') c.snaps++;
    if (m.t === 'watch-none') c.none++;
  });
  c.send = (o) => ws.send(JSON.stringify(o));
  return new Promise((r) => ws.on('open', () => r(c)));
}
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };

// a player makes a private game with bots on the backrooms, and one with a password
const host = await client();
host.send({ t: 'create', name: 'Host', color: 1, settings: { name: 'Spec test', mode: 'dm', map: 'backrooms', bots: 3, private: true, maxPlayers: 8 } });
await sleep(1500);
check(host.welcome?.map === 'backrooms', 'host is on the backrooms: ' + host.welcome?.map);
const code = host.welcome?.room?.code, id = host.welcome?.room?.id;
const locked = await client();
locked.send({ t: 'create', name: 'Lock', color: 2, settings: { name: 'Locked', mode: 'dm', map: 'bunker', bots: 0, password: 'pw1', maxPlayers: 8 } });
await sleep(1000);

// by code: a spectator's welcome, snapshots arrive, and the spectator isn't a player in the room
const w = await client();
w.send({ t: 'watch', room: code });
await sleep(1500);
check(w.welcome?.watch === 1 && w.welcome?.spec === 1, 'spectator welcome');
check(w.snaps > 10, 'snapshots while spectating: ' + w.snaps);
const info = await (await fetch(`http://localhost:${port}/api/rooms`)).json();
check(!info.some((r) => r.id === id), 'private game stays off the list');
check(!w.welcome.players?.some?.((p) => p.name === 'Spectator'), 'not listed as a player');

// a private game by number is refused, so is a made-up code, the wrong password, and the right one works
for (const [room, want, extra] of [[String(id), /private/i], ['ZZZZ', /No game/], [locked.welcome?.room?.code, /password/i, { password: 'nope' }]]) {
  const c = await client();
  c.send({ t: 'watch', room, ...extra });
  await sleep(500);
  check(want.test(c.error || ''), `watch ${room} refused (${c.error})`);
  c.ws.close();
}
const ok = await client();
ok.send({ t: 'watch', room: locked.welcome?.room?.code, password: 'pw1' });
await sleep(800);
check(ok.welcome?.spec === 1, 'right password lets you watch');

// stop watching: no more snapshots
w.send({ t: 'unwatch' });
await sleep(300);
const before = w.snaps;
await sleep(800);
check(w.snaps === before, 'unwatch stops the snapshots');

for (const c of [host, locked, w, ok]) c.ws.close();
console.log(fail.length ? 'FAIL\n  ' + fail.join('\n  ') : 'PASS');
process.exit(fail.length ? 1 : 0);
