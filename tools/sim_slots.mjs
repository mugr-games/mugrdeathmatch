// Slot machine loadouts and flashbangs, against a running server. Usage: node tools/sim_loadout.mjs <port>
// 1. Spawning in a slot machine room rolls one weapon per number key from the right pools; you hold exactly
//    those, starting with the key 3 gun.
// 2. A flashbang thrown at your own feet while you look at it blinds you; someone far off isn't.
import WebSocket from 'ws';
import { WEAPONS, WEAPON_INDEX, LOADOUT_PARTS, ROLL_POOLS, rollLoadout } from '../public/js/weapons.js';
const port = process.argv[2] || 8099, base = `http://localhost:${port}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
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

// 1. the slot machine: spawning in a slot machine room rolls a loadout, sent only to that player
const A = await client('Roller');
A.send({ t: 'create', settings: { name: 'Slot test', map: 'foundry', loadout: 'custom', private: true, maxPlayers: 4 } });
await sleep(1200);
const roll = A.events.find((e) => e.e === 'roll')?.w;
out.room = A.welcome?.room?.loadout;
out.rolled = roll;
out.spawnedWith = A.me && owned(A.me);
out.holding = A.me && WEAPONS[A.me.cur]?.id;
const parts = Object.keys(LOADOUT_PARTS);
ok &&= !!roll && roll.length === 5 && roll.every((id, i) => ROLL_POOLS[parts[i]].includes(id));
ok &&= JSON.stringify([...out.spawnedWith].sort()) === JSON.stringify([...new Set(roll)].sort()) && out.holding === roll[2];
// rolls differ (40 rolls of the pools can't all be the same)
out.distinctRolls = new Set(Array.from({ length: 40 }, () => rollLoadout().join())).size;
ok &&= out.distinctRolls > 10;

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
