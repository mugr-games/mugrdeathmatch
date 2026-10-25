// Headless test for mugrball: a player grabs the ball, throws it, the bots play a match (picks, throws, steals,
// goals and hoops), and rocket jumps still recharge in the gun-free modes. Usage: node tools/smoke_mugrball.mjs <port>
import WebSocket from 'ws';
const port = process.argv[2] || 8099;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function client(name) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { ws, events: [], welcome: null, me: null, seq: 0, snap: null };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'welcome') c.welcome = m;
    if (m.t === 's') { c.me = m.me; c.snap = m; c.events.push(...m.ev); }
  });
  c.send = (o) => ws.send(JSON.stringify({ name, color: 1, ...o }));
  c.cmd = (o) => c.send({ t: 'c', c: [{ s: ++c.seq, f: 0, sd: 0, b: 0, y: 0, p: 0, ms: 16.67, rt: 0, ...o }] });
  return new Promise((r) => ws.on('open', () => r(c)));
}
const out = {};
const ATTACK = 8, ROCKETJUMP = 256;

// 1. one player: walk to the ball, pick it up, throw it
{
  const A = await client('Carrier');
  A.send({ t: 'create', settings: { name: 'mb', mode: 'mugrball', private: true } });
  await sleep(2200); // kick-off freeze
  let picked = false;
  for (let i = 0; i < 600 && !picked; i++) {
    const b = A.snap.ball, o = A.me.o;
    A.cmd({ f: 1, y: Math.atan2(b[1] - o[1], b[0] - o[0]) * 180 / Math.PI });
    await sleep(17);
    picked = A.snap.ball[6] === A.welcome.id;
  }
  const weaponBefore = A.events.filter((e) => e.e === 'shot').length;
  A.cmd({ b: ATTACK, y: 0, p: -30 });
  await sleep(50);
  A.cmd({ b: 0, y: 0, p: -30 });
  await sleep(400);
  out.single = {
    map: A.welcome.map?.name || A.welcome.map, picked, thrown: A.events.some((e) => e.e === 'mb' && e.k === 'throw'),
    noShotWhileCarrying: A.events.filter((e) => e.e === 'shot').length === weaponBefore, ballAfter: A.snap.ball,
  };
  A.ws.close();
}

// 2. bots: a 4 v 4 for a while
{
  const W = await client('Watcher');
  W.send({ t: 'create', settings: { name: 'mbbots', mode: 'mugrball', private: true, bots: 8, caplimit: 30, timelimit: 0 } });
  await sleep(500);
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) { W.cmd({}); await sleep(50); }
  const ev = W.events, k = (kind) => ev.filter((e) => e.e === 'mb' && e.k === kind).length;
  out.bots = { picks: k('pick'), throws: k('throw'), punts: k('punt'), steals: k('steal'), drops: k('drop'), resets: k('reset'),
    kills: ev.filter((e) => e.e === 'kill').length, goals: ev.filter((e) => e.e === 'goal').map((e) => `${e.team}:${e.how}`), score: W.snap.ts };
  W.ws.close();
}

// 3. soccer: rocket jump works twice in a row (the player clock runs without weapons)
{
  const A = await client('Jumper');
  A.send({ t: 'create', settings: { name: 'rj', mode: 'soccer', private: true } });
  await sleep(600);
  const jumps = () => A.events.filter((e) => e.e === 'boom' && e.k === 'rj').length;
  A.cmd({ b: ROCKETJUMP }); await sleep(40);
  for (let i = 0; i < 190; i++) { A.cmd({}); await sleep(17); } // 3 s of moves: the cooldown runs on the player clock
  A.cmd({ b: ROCKETJUMP }); await sleep(40); A.cmd({}); await sleep(300);
  out.soccerRocketJumps = jumps();
  A.ws.close();
}
console.log(JSON.stringify(out, null, 1));
process.exit(0);
