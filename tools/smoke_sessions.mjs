// Headless test for sign-ins: an account's old save code no longer opens it, each sign-in is its own
// session, signing out (here or everywhere) ends them, and the owner's /signout ends someone's.
// Usage: node tools/smoke_sessions.mjs <port> [owner password] [sessions file]
// (makes an account with a random name: run it against a local server, not the live one)
import WebSocket from 'ws';
import crypto from 'node:crypto';
import fs from 'node:fs';
const [port = 8096, ownerPass, sessionsFile] = process.argv.slice(2);
const base = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// each call from its own made-up address, so the sign-in rate limit (8 a minute per address) doesn't trip
const post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.9.' + ((Math.random() * 250) | 0) + '.' + ((Math.random() * 250) | 0) }, body: JSON.stringify(body) }).then((r) => r.json());
const tok = () => crypto.randomBytes(16).toString('hex');
const fails = [];
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) fails.push(what); };
const opens = async (token) => !!(await post('/api/profile', { token })).name;

function client(token) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { ws, got: [], closed: null };
  ws.on('message', (d) => c.got.push(JSON.parse(d)));
  ws.on('close', (code) => { c.closed = code; });
  c.send = (o) => ws.send(JSON.stringify(o));
  return new Promise((r) => ws.on('open', () => { c.send({ t: 'hello', token }); setTimeout(() => r(c), 300); }));
}

const name = 'ss_' + crypto.randomBytes(3).toString('hex');
const guest = tok();
await post('/api/profile', { token: guest });
const reg = await post('/api/register', { name, password: 'secret123', token: guest });
check(reg.name === name && /^[a-f0-9]{64}$/.test(reg.token || ''), 'registering gives a 64-letter session key');
check(reg.token !== guest, 'the session key is not the old save code');
const old = await post('/api/profile', { token: guest });
check(!old.name && old.signedOut, 'the old save code no longer opens the account');
check(await opens(reg.token), 'the session key opens it');

const second = await post('/api/login', { name, password: 'secret123' });
check(/^[a-f0-9]{64}$/.test(second.token || '') && second.token !== reg.token, 'signing in again gives another session');
check((await opens(reg.token)) && (await opens(second.token)), 'both sign-ins work at once');
check(!(await post('/api/login', { name, password: 'wrong-one' })).token, 'a wrong password gets nothing');

// sign out everywhere, from the second browser: the first browser's open game is dropped
const other = await client(reg.token);
const all = await post('/api/logout-all', { token: second.token });
check(/^[a-f0-9]{64}$/.test(all.token || ''), 'sign out everywhere gives this browser a new session');
await sleep(400);
check(other.closed === 4001, `the other browser's connection was closed (code ${other.closed})`);
check(!(await opens(reg.token)) && (await post('/api/profile', { token: reg.token })).signedOut, 'the first sign-in has ended');
check(!(await opens(second.token)), 'the sign-in that asked has ended too');
check(await opens(all.token), 'the new session works');

// a new password: every other sign-in ends, this browser gets a new one
const third = (await post('/api/login', { name, password: 'secret123' })).token;
check(!!(await post('/api/password', { token: all.token, password: 'not-it', next: 'newpass456' })).error, 'changing the password needs the current one');
check(!!(await post('/api/password', { token: all.token, password: 'secret123', next: '123' })).error, 'a too-short new password is refused');
const pw = await post('/api/password', { token: all.token, password: 'secret123', next: 'newpass456' });
check(pw.ok && /^[a-f0-9]{64}$/.test(pw.token || '') && !pw.key, 'password changed, with a new session for this browser');
check(!(await opens(third)) && !(await opens(all.token)), 'the other sign-ins ended');
check(await opens(pw.token), 'the new session works');
check(!(await post('/api/login', { name, password: 'secret123' })).token, 'the old password no longer signs in');
const fresh = await post('/api/login', { name, password: 'newpass456' });
check(!!fresh.token, 'the new password signs in');

// plain sign out
check((await post('/api/logout', { token: pw.token })).ok, 'sign out answers ok');
check(!(await opens(pw.token)), 'after signing out, that session no longer works');
check((await post('/api/logout', { token: pw.token })).signedOut, 'signing out twice says already signed out');
check(await opens(fresh.token), 'signing out one browser leaves the others signed in');

// guests carry on as before
check((await post('/api/profile', { token: tok() })).coins === 0, 'a new guest save code still works');

// the owner's /signout
if (ownerPass) {
  const s = fresh.token;
  const own = await post('/api/login', { name: 'watermelon', password: ownerPass });
  check(!!own.token, 'the owner signs in');
  check(/OWNER_PASSWORD/.test((await post('/api/password', { token: own.token, password: ownerPass, next: 'whatever1' })).error || ''), 'the owner\'s password is changed on the server, not here');
  const o = await client(own.token);
  o.send({ t: 'create', name: 'owner', color: 0, model: 0, token: own.token, settings: { name: 'sessions test', mode: 'dm', private: true, bots: 0 } });
  await sleep(1500);
  o.send({ t: 'chat', text: '/signout ' + name });
  await sleep(600);
  const said = o.got.filter((m) => m.t === 'sys').map((m) => m.text).join(' | ');
  check(/signed out everywhere/.test(said), `the owner is told: ${said}`);
  check(!(await opens(s)), '/signout ended their sign-in');
  o.ws.close();
}

// the database keeps only hashes of session keys
if (sessionsFile) {
  await sleep(2600);
  const text = fs.readFileSync(sessionsFile, 'utf8');
  check(text.length > 2 && ![reg.token, second.token, all.token].some((t) => text.includes(t)), 'the sessions file holds no session keys, only their hashes');
}
other.ws.close();
console.log(fails.length ? `\n${fails.length} FAILED` : '\nall passed');
process.exit(fails.length ? 1 : 0);
