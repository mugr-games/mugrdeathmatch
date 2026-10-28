// Own loadouts and flashbangs, against a running server. Usage: node tools/sim_loadout.mjs <port>
// 1. A player saves a loadout (shotgun, knife) and spawns with exactly it in a custom-loadout room; a weapon
//    they don't own can't go in it.
// 2. A flashbang thrown at your own feet while you look at it blinds you; someone far off isn't.
import WebSocket from 'ws';
import { WEAPONS, WEAPON_INDEX } from '../public/js/weapons.js';
const port = process.argv[2] || 8099, base = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (route, body) => (await fetch(`${base}/api/${route}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
function client(name, token) {
  const ws = new WebSocket(`ws://localhost:${port}`);
  const c = { ws, welcome: null, me: null, events: [], seq: 0 };
  ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'welcome') c.welcome = m; if (m.t === 's') { if (m.me) c.me = m.me; c.events.push(...m.ev); } });
  c.send = (o) => ws.send(JSON.stringify({ name, color: 1, token, ...o }));
  c.cmd = (b, yaw, pitch, w) => c.send({ t: 'c', c: [{ s: ++c.seq, f: 0, sd: 0, b, y: yaw, p: pitch, w, ms: 16.67, rt: 0 }] });
  return new Promise((r) => ws.on('open', () => r(c)));
}
const owned = (me) => WEAPONS.filter((w, i) => (me.ow >> i) & 1).map((w) => w.id);
const out = {};
let ok = true;

// 1. the loadout
const token = 'cd'.repeat(16);
await api('profile', { token });
const saved = await api('loadout', { token, loadout: { primary: 'shotgun', secondary: 'pistol', melee: 'knife', utility: 'grenade' } });
const notOwned = await api('loadout', { token, loadout: { primary: 'railgun', secondary: 'deagle', melee: 'katana', utility: 'flashbang' } });
out.saved = saved.loadout;
out.unownedFallsBack = notOwned.loadout;
await api('loadout', { token, loadout: { primary: 'shotgun', secondary: 'pistol', melee: 'knife', utility: 'grenade' } });
const buy = await api('buy', { token, item: 'wpn_ak' });
out.buyWithoutCoins = buy.error || 'bought';
const A = await client('Loadout', token);
A.send({ t: 'create', settings: { name: 'Loadout test', map: 'foundry', loadout: 'custom', private: true, maxPlayers: 4 } });
await sleep(1200);
out.room = A.welcome?.room?.loadout;
out.spawnedWith = A.me && owned(A.me);
out.holding = A.me && WEAPONS[A.me.cur]?.id;
ok &&= JSON.stringify(out.spawnedWith?.sort()) === JSON.stringify(['grenade', 'knife', 'pistol', 'shotgun']) && out.holding === 'shotgun';
ok &&= out.unownedFallsBack?.primary === 'smg1' && out.unownedFallsBack?.melee === 'crowbar';

// 2. a flashbang: B lobs one at their own feet and watches it; C is somewhere else on the map
const B = await client('Thrower');
const C = await client('Elsewhere');
B.send({ t: 'create', settings: { name: 'Flash test', map: 'foundry', loadout: 'all', private: true, maxPlayers: 4 } });
await sleep(500);
C.send({ t: 'join', room: B.welcome.room.code });
await sleep(800);
const fb = WEAPON_INDEX.flashbang;
for (let i = 0; i < 40; i++) { B.cmd(0, 0, 70, fb); await sleep(17); }
for (let i = 0; i < 8; i++) { B.cmd(8, 0, 70, fb); await sleep(17); }
for (let i = 0; i < 150; i++) { B.cmd(0, 0, 70, fb); await sleep(17); }
const bo = B.me.o, co = C.me.o;
out.thrower = { holding: WEAPONS[B.me.cur]?.id, otherDist: Math.round(Math.hypot(co[0] - bo[0], co[1] - bo[1])) };
out.booms = B.events.filter((e) => e.e === 'boom').map((e) => e.k);
out.throwerFlash = B.events.filter((e) => e.e === 'flash').map((e) => e.s);
out.otherFlash = C.events.filter((e) => e.e === 'flash').map((e) => e.s);
console.log(JSON.stringify(out, null, 1));
ok &&= out.booms.includes('flash') && out.throwerFlash.length === 1 && out.throwerFlash[0] > 0.5 && (out.thrower.otherDist < 1100 || !out.otherFlash.length);
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
