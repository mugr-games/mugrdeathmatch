// Headless smoke test for the workshop: publishing, checks, browsing, rating, playing a workshop level online
// and wearing a workshop charm. Usage: node tools/smoke_workshop.mjs <port>
// (makes two accounts with random names on that server: run it against a local server, not the live one)
import WebSocket from 'ws';
import crypto from 'node:crypto';
const port = process.argv[2] || 8099, base = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const tok = () => crypto.randomBytes(16).toString('hex');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

function client(name, token) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { ws, welcome: null, error: null, infos: [] };
  ws.on('message', (d) => {
    const m = JSON.parse(d);
    if (m.t === 'welcome') c.welcome = m;
    if (m.t === 'error') c.error = m.text;
    if (m.t === 'info') c.infos.push(m.p);
  });
  c.send = (o) => ws.send(JSON.stringify({ name, color: 1, token, ...o }));
  return new Promise((r) => ws.on('open', () => r(c)));
}

// two players with accounts, and a guest
const suffix = crypto.randomBytes(3).toString('hex');
const A = { token: tok() }, B = { token: tok() }, G = { token: tok() };
Object.assign(A, await post('/api/register', { name: 'wsA_' + suffix, password: 'secret123', token: A.token }));
Object.assign(B, await post('/api/register', { name: 'wsB_' + suffix, password: 'secret123', token: B.token }));
check(A.name && B.name, 'two accounts registered');

// a small arena: floor, four walls, a block in the middle
const box = (x0, y0, z0, x1, y1, z1, m = 'concrete') => [x0, y0, z0, x1, y1, z1, m];
const level = {
  name: 'Smoke Box', theme: 'docks', mood: 'night',
  boxes: [box(-800, -800, -32, 800, 800, 0, 'plate'), box(-832, -800, 0, -800, 800, 256), box(800, -800, 0, 832, 800, 256), box(-800, -832, 0, 800, -800, 256), box(-800, 800, 0, 800, 832, 256), box(-64, -64, 0, 64, 64, 96, 'hazard')],
  spawns: [], items: [['rpg', 0, 0, 96]], flags: null,
};

// checks
check((await post('/api/workshop/publish', { token: G.token, kind: 'level', data: level })).error, 'guests cannot publish');
check((await post('/api/workshop/publish', { token: A.token, kind: 'level', data: { ...level, boxes: Array.from({ length: 1300 }, (_, i) => box(i, 0, 0, i + 1, 1, 1)) } })).error, 'too many boxes refused');
check((await post('/api/workshop/publish', { token: A.token, kind: 'level', data: { ...level, boxes: [box(0, 0, 0, 10, 10, 10, 'lava')] } })).error, 'unknown material refused');
check((await post('/api/workshop/publish', { token: A.token, kind: 'level', data: { ...level, boxes: [box(0, 0, 0, 'x', 10, 10)] } })).error, 'non-number coordinate refused');
check((await post('/api/workshop/publish', { token: A.token, kind: 'level', data: { ...level, boxes: [box(0, 0, 0, 0, 10, 10)] } })).error, 'flat box refused');
check((await post('/api/workshop/publish', { token: A.token, kind: 'level', data: { ...level, boxes: [box(0, 0, 0, 10, 10, 10)], name: '<b>' } })).error, 'name of only markup refused');

// publish with markup in the name: the markup is stripped
const pub = await post('/api/workshop/publish', { token: A.token, kind: 'level', data: { ...level, name: 'Smoke <script>Box</script>' } });
check(pub.item && !/[<>]/.test(pub.item.name), `level published, name cleaned: ${pub.item?.name}`);
const id = pub.item?.id;
check((await post('/api/workshop/publish', { token: A.token, kind: 'level', data: level })).error, 'publishing again at once is slowed down');

// browse, open, rate
const list = await fetch(base + '/api/workshop?kind=level&sort=new').then((r) => r.json());
check(list.items?.some((e) => e.id === id), 'level is in the browse list');
const got = await post('/api/workshop/get', { token: B.token, id });
check(got.item?.data?.boxes?.length === level.boxes.length && got.item.dl === 1, 'level downloads whole, download counted');
check((await post('/api/workshop/rate', { token: A.token, id, stars: 5 })).error, 'cannot rate your own');
const rated = await post('/api/workshop/rate', { token: B.token, id, stars: 4 });
check(rated.item?.rating === 4 && rated.item.votes === 1, 'rated 4 stars');

// B plays it online, A joins by code and gets the level too
const cB = await client('Bravo', B.token);
cB.send({ t: 'create', settings: { name: 'Workshop test', mode: 'dm', map: 'ws_' + id, private: true, bots: 1 } });
await sleep(800);
check(cB.welcome?.map === 'ws_' + id && cB.welcome.level?.boxes?.length === level.boxes.length, `game created on the workshop level (${cB.error || cB.welcome?.mapName})`);
const cA = await client('Alpha', A.token);
cA.send({ t: 'join', room: cB.welcome?.room.code });
await sleep(500);
check(cA.welcome?.level?.name === pub.item?.name, 'a second player receives the level');
check(cB.welcome?.items?.length === 1, 'placed item used');

// test-play an unpublished level (always private)
const cT = await client('Tester', G.token);
cT.send({ t: 'create', settings: { name: 'Testing', mode: 'ctf', private: false, level: { ...level, name: 'Draft level' } } });
await sleep(800);
check(cT.welcome?.map?.startsWith('wt_') && cT.welcome.room.private && cT.welcome.flags, `unpublished level test-plays in a private game (${cT.error})`);
cT.send({ t: 'create', settings: { name: 'Testing', level: { ...level, boxes: [box(0, 0, 0, 10, 10, 10, 'lava')] } } });
await sleep(300);
check(!!cT.error, 'a broken test level is refused');

// charms: publish, equip, everyone sees it
const ch = await post('/api/workshop/publish', { token: A.token, kind: 'charm', name: 'Smoke charm', data: { shape: 'star', c1: '#ff0000', c2: '#00ffcc', text: 'GG<b>', glow: true } });
check(ch.error && /seconds/.test(ch.error), 'charm publish waits for the gap');
await sleep(15200);
const ch2 = await post('/api/workshop/publish', { token: A.token, kind: 'charm', name: 'Smoke charm', data: { shape: 'star', c1: '#ff0000', c2: '#00ffcc', text: 'GG<b>', glow: true } });
check(ch2.item?.c?.text === 'GGb', `charm published, text cleaned: ${ch2.item?.c?.text}`);
const eq = await post('/api/workshop/equip', { token: B.token, id: ch2.item?.id });
check(eq.eq?.charm === 'ws' && eq.wc?.shape === 'star', 'B wears the charm');
await sleep(300);
const seen = cA.infos.find((p) => p.name === B.name);
check(seen?.cos?.cc?.id === ch2.item?.id, 'the other player sees the charm');
const off = await post('/api/workshop/equip', { token: B.token, id: null });
check(!off.eq?.charm && !off.wc, 'charm taken off');

// clean up
check((await post('/api/workshop/delete', { token: B.token, id })).error, 'cannot delete someone else\'s');
check((await post('/api/workshop/delete', { token: A.token, id })).ok, 'author deletes the level');
await post('/api/workshop/delete', { token: A.token, id: ch2.item?.id });
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
