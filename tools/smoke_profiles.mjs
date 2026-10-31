// Headless smoke test for profile cards: bios, blocking, friending from a card and reports.
// Usage: node tools/smoke_profiles.mjs <port>
// (makes two accounts with random names on that server: run it against a local server, not the live one)
import WebSocket from 'ws';
import crypto from 'node:crypto';
const port = process.argv[2] || 8099, base = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
const tok = () => crypto.randomBytes(16).toString('hex');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };

// a socket that says hello, and waits for the next message of a type
function client(token) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { ws, got: [] };
  ws.on('message', (d) => c.got.push(JSON.parse(d)));
  c.send = (o) => ws.send(JSON.stringify(o));
  c.next = async (t, ms = 3000) => {
    const start = c.got.length, end = Date.now() + ms;
    while (Date.now() < end) {
      const m = c.got.slice(start).find((x) => x.t === t);
      if (m) return m;
      await sleep(30);
    }
    return null;
  };
  c.ask = async (o, t) => { const p = c.next(t); c.send(o); return p; };
  return new Promise((r) => ws.on('open', () => { c.send({ t: 'hello', token }); setTimeout(() => r(c), 300); }));
}

const suffix = crypto.randomBytes(3).toString('hex');
const A = { token: tok() }, B = { token: tok() };
Object.assign(A, await post('/api/register', { name: 'pfA_' + suffix, password: 'secret123', token: A.token }));
Object.assign(B, await post('/api/register', { name: 'pfB_' + suffix, password: 'secret123', token: B.token }));
check(A.name && B.name, 'two accounts registered');
const a = await client(A.token), b = await client(B.token), g = await client(tok());

// bios
let card = await a.ask({ t: 'bio', text: '  Hello   there, I like rockets.  ' }, 'profile');
check(card?.me && card.bio === 'Hello there, I like rockets.', `own bio saved and tidied: "${card?.bio}"`);
check((await a.ask({ t: 'bio', text: 'again' }, 'profile-error'))?.text, 'changing it again at once is slowed down');
card = await b.ask({ t: 'profile', name: A.name }, 'profile');
check(card?.bio === 'Hello there, I like rockets.' && card.account && !card.me && card.stats, 'others see the bio and stats');
check((await g.ask({ t: 'bio', text: 'guest bio' }, 'profile-error'))?.text, 'guests cannot write a bio');
check((await g.ask({ t: 'profile', name: 'nobody_' + suffix }, 'profile'))?.error, 'an unknown name gives an error');
await sleep(3100);
card = await a.ask({ t: 'bio', text: 'x'.repeat(400) }, 'profile');
check(card?.bio.length === 160, 'bios are cut to 160 letters');

// friending from the card shows on the next card
b.send({ t: 'friend', action: 'add', name: A.name });
await sleep(300);
check((await a.ask({ t: 'profile', name: B.name }, 'profile'))?.friend === 'incoming', 'A sees B asked to be friends');
check((await b.ask({ t: 'profile', name: A.name }, 'profile'))?.friend === 'outgoing', 'B sees the request sent');

// blocking ends the request, refuses new ones, and is listed
const bl = a.next('blocked');
card = await a.ask({ t: 'block', name: B.name, on: true }, 'profile');
check(card?.blocked && !card.friend, 'blocked: shown on the card, the request is gone');
check((await bl)?.list?.includes(B.name.toLowerCase()), 'the block list is sent');
check((await b.ask({ t: 'friend', action: 'add', name: A.name }, 'friend-error'))?.text?.includes('isn\'t taking'), 'a blocked player cannot ask again');
check((await a.ask({ t: 'friend', action: 'add', name: B.name }, 'friend-error'))?.text?.includes('Unblock'), 'you must unblock before adding');
card = await a.ask({ t: 'block', name: B.name, on: false }, 'profile');
check(card && !card.blocked, 'unblocked');
check((await g.ask({ t: 'block', name: B.name, on: true }, 'profile-error'))?.text, 'guests block in their browser, not on the server');

// a fresh socket gets its block list on hello
await a.ask({ t: 'block', name: B.name, on: true }, 'profile');
const a2 = await client(A.token);
await sleep(300);
check(a2.got.some((m) => m.t === 'blocked' && m.list.includes(B.name.toLowerCase())), 'signing in again brings the block list');

// reports: anyone can send a few; staff commands are staff only
check((await b.ask({ t: 'report', name: A.name, what: 'bio', note: 'mean bio' }, 'report-sent'))?.text, 'report sent');
check(!(await b.ask({ t: 'report', name: B.name, what: 'name' }, 'report-sent', 800)), 'cannot report yourself');
for (let i = 0; i < 6; i++) await g.ask({ t: 'report', name: A.name, what: 'skin' }, 'report-sent'); // six in ten minutes is the most
check((await g.ask({ t: 'report', name: A.name, what: 'name' }, 'profile-error'))?.text, 'too many reports are slowed down');
const sys = b.next('sys');
b.send({ t: 'report-act', id: 'x', action: 'dismiss' });
check((await sys)?.text?.includes('staff'), 'players cannot handle reports');

for (const c of [a, a2, b, g]) c.ws.close();
console.log(fails.length ? `FAILED: ${fails.length}` : 'PASS');
process.exit(fails.length ? 1 : 0);
