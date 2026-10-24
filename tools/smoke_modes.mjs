// Headless test for props, capture the flag, death data and map voting. Usage: node tools/smoke_modes.mjs <port>
import WebSocket from 'ws';
const port = process.argv[2] || 8099;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { ws, events: [], msgs: [], welcome: null, me: null, seq: 0, snap: null };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    c.msgs.push(m);
    if (m.t === 'welcome') c.welcome = m;
    if (m.t === 's') { c.me = m.me; c.snap = m; c.events.push(...m.ev); }
  });
  c.send = (o) => ws.send(JSON.stringify({ name, color: 1, ...o }));
  c.cmd = (o) => c.send({ t: 'c', c: [{ s: ++c.seq, f: 0, sd: 0, b: 0, y: 0, p: 0, ms: 16.67, rt: 0, ...o }] });
  c.run = async (n, o) => { for (let i = 0; i < n; i++) { c.cmd(typeof o === 'function' ? o(i) : o); await sleep(17); } };
  return new Promise((r) => ws.on('open', () => r(c)));
}
const out = {};

// 1. props: shoot the nearest barrel with the pistol until it breaks
{
  const A = await client('Prop');
  A.send({ t: 'create', settings: { name: 'props', map: 'foundry', private: true } });
  await sleep(400);
  const barrels = A.welcome.props.filter((p) => p[1] === 'barrel');
  await A.run(20, { w: 1 });
  const eye = [A.me.o[0], A.me.o[1], A.me.o[2] + 64];
  const target = barrels.map((b) => b[2]).sort((a, b) => Math.hypot(a[0] - eye[0], a[1] - eye[1]) - Math.hypot(b[0] - eye[0], b[1] - eye[1]))[0];
  // walk toward it until close, then aim at its middle and fire
  for (let i = 0; i < 400; i++) {
    const d = [target[0] - A.me.o[0], target[1] - A.me.o[1]];
    if (Math.hypot(...d) < 260) break;
    A.cmd({ f: 1, y: Math.atan2(d[1], d[0]) * 180 / Math.PI, w: 1 });
    await sleep(17);
  }
  let broke = false;
  for (let i = 0; i < 300 && !broke; i++) {
    const e = [A.me.o[0], A.me.o[1], A.me.o[2] + 64];
    const d = [target[0] - e[0], target[1] - e[1], target[2] + 20 - e[2]];
    const yaw = Math.atan2(d[1], d[0]) * 180 / Math.PI, pitch = -Math.atan2(d[2], Math.hypot(d[0], d[1])) * 180 / Math.PI;
    A.cmd({ y: yaw, p: pitch, w: 1, b: i % 2 ? 8 : 0 });
    await sleep(17);
    broke = A.events.some((ev) => ev.e === 'prop' && ev.up === 0);
  }
  out.props = { total: A.welcome.props.length, barrels: barrels.length, barrelBroke: broke, barrelExploded: A.events.some((ev) => ev.e === 'boom' && ev.k === 'barrel'), hpAfter: A.me.hp };
  A.ws.close();
}

// 2. capture the flag: two players get opposite teams; snapshots carry flags and score
{
  const A = await client('Red?'), B = await client('Blue?');
  A.send({ t: 'create', settings: { name: 'ctf', mode: 'ctf', caplimit: 2, map: 'courtyard', private: true } });
  await sleep(400);
  B.send({ t: 'join', room: A.welcome.room.code });
  await sleep(600);
  const teams = B.welcome.players.map((p) => p.team);
  out.ctf = { mode: A.welcome.mode, teams, flagsInWelcome: !!A.welcome.flags, snapshotFlags: A.snap && A.snap.fl, score: A.snap && A.snap.ts };
  A.ws.close(); B.ws.close();
}

// 3. death data for ragdolls: run off a Skyline platform into the void
{
  const A = await client('Faller');
  A.send({ t: 'create', settings: { name: 'fall', map: 'skyline', private: true } });
  await sleep(400);
  await A.run(240, { f: 1, b: 4, y: 90 });
  const k = A.events.find((e) => e.e === 'kill');
  out.ragdollData = k ? { killed: true, deathVelocity: k.vv, weapon: k.w } : { killed: false, z: A.me.o[2] };
  A.ws.close();
}

// 4. map vote: a one-minute match, vote for Skyline, check the next map
{
  const A = await client('Voter');
  A.send({ t: 'create', settings: { name: 'vote', map: 'rotation', timelimit: 1, private: true } });
  await sleep(400);
  const firstMap = A.welcome.mapName;
  A.welcome = null;
  let inter = null;
  for (let i = 0; i < 70 && !inter; i++) { A.cmd({}); await sleep(1000); inter = A.events.find((e) => e.e === 'intermission'); }
  A.send({ t: 'vote', map: 'skyline' });
  await sleep(500);
  const counts = A.msgs.filter((m) => m.t === 'votes').pop();
  for (let i = 0; i < 20 && !A.welcome; i++) { A.cmd({}); await sleep(1000); }
  out.vote = { firstMap, options: inter && inter.vote && inter.vote.map((v) => v.name), counts: counts && counts.c, nextMap: A.welcome && A.welcome.mapName };
  A.ws.close();
}
console.log(JSON.stringify(out, null, 1));
process.exit(0);
