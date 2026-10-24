// Headless test for the main rooms, team deathmatch's team pick and a zombies round.
// Usage: node tools/smoke_teams.mjs <port>   (takes about 40 seconds: it waits out the real timers)
import WebSocket from 'ws';

const port = process.argv[2] || 8099;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { ws, events: [], infos: [], welcome: null, snap: null, me: null, seq: 0 };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'welcome') c.welcome = m;
    if (m.t === 'info') c.infos.push(m.p);
    if (m.t === 's') { c.snap = m; c.me = m.me; c.events.push(...m.ev); }
  });
  c.send = (o) => ws.send(JSON.stringify({ name, color: 1, ...o }));
  c.cmd = (o) => c.send({ t: 'c', c: [{ s: ++c.seq, f: 0, sd: 0, b: 0, y: 0, p: 0, ms: 16.67, rt: 0, ...o }] });
  return new Promise((r) => ws.on('open', () => r(c)));
}
const out = {};

// 1. server info and the always-on rooms
{
  const info = await fetch(`http://localhost:${port}/api/info`).then((r) => r.json());
  const rooms = await fetch(`http://localhost:${port}/api/rooms`).then((r) => r.json());
  out.info = { modes: Object.keys(info.modes), maps: info.maps.length, newMaps: info.maps.filter((m) => ['canyon', 'office', 'station'].includes(m.id)).map((m) => m.name) };
  out.mainRooms = rooms.map((r) => `${r.name} [${r.mode}]`);
}

// 2. team deathmatch: warm-up with a team pick, then the match goes live
const tdm = (async () => {
  const A = await client('Red?');
  A.send({ t: 'create', settings: { name: 'tdm', mode: 'tdm', map: 'office', private: true, fraglimit: 20 } });
  await sleep(500);
  const B = await client('Other');
  B.send({ t: 'join', room: A.welcome.room.code });
  await sleep(500);
  const before = { pickInWelcome: A.welcome.pick, pkInSnapshot: A.snap.pk, teams: [A.welcome.players[0].team, B.welcome.players.find((p) => p.name === 'Other').team] };
  // both ask for the side they are not on
  A.send({ t: 'team', team: before.teams[0] === 'red' ? 'blue' : 'red' });
  B.send({ t: 'team', team: before.teams[1] === 'red' ? 'blue' : 'red' });
  await sleep(400);
  const picked = A.infos.map((p) => `${p.name}:${p.team}`);
  // wait for the 20s warm-up to end
  for (let i = 0; i < 60 && !A.events.some((e) => e.e === 'live'); i++) await sleep(500);
  await sleep(300);
  const r = { before, afterPick: picked, live: A.events.some((e) => e.e === 'live'), pkAfter: A.snap.pk ?? null, timeLeft: A.snap.tl, teamScore: A.snap.ts };
  // switching after the pick is refused
  const n = A.infos.length;
  A.send({ t: 'team', team: 'red' });
  await sleep(300);
  r.lateSwitchIgnored = A.infos.length === n;
  A.ws.close(); B.ws.close();
  return r;
})();

// 3. zombies: two players, countdown, patient zero, the survivor falls to their death and the zombies win
const zombie = (async () => {
  const A = await client('Alpha');
  A.send({ t: 'create', settings: { name: 'zm', mode: 'zombie', map: 'skyline', private: true, timelimit: 3 } });
  await sleep(500);
  const waiting = A.snap.zm;
  const B = await client('Bravo');
  B.send({ t: 'join', room: A.welcome.room.code });
  await sleep(600);
  const countdown = A.snap.zm;
  for (let i = 0; i < 60 && !A.events.some((e) => e.e === 'infect'); i++) await sleep(500);
  const first = A.events.find((e) => e.e === 'infect');
  const zombieId = first && first.id;
  const survivor = zombieId === A.welcome.id ? B : A;
  const zc = zombieId === A.welcome.id ? A : B;
  await sleep(200);
  const zombieState = { hp: zc.me.hp, weapon: zc.me.cur, speedMul: zc.me.sm, zm: A.snap.zm, clock: A.snap.tl };
  // the survivor sprints off the platform into the void
  let ended = null;
  for (let i = 0; i < 900 && !ended; i++) {
    survivor.cmd({ f: 1, b: 4, y: ((i / 90) | 0) * 75 });
    await sleep(17);
    ended = A.events.find((e) => e.e === 'intermission');
  }
  const r = { waiting, countdown, patientZero: !!first && first.first === 1, zombieState, infected: A.events.filter((e) => e.e === 'infect').length, win: ended ? ended.win : null };
  A.ws.close(); B.ws.close();
  return r;
})();

out.tdm = await tdm;
out.zombie = await zombie;
console.log(JSON.stringify(out, null, 1));
process.exit(0);
