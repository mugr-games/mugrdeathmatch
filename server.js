// MUGR DEATHMATCH server: serves the web client and runs any number of rooms, each an authoritative simulation.
// Public rooms show in the lobby list; private rooms are joined with a short code. "Main" always exists.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { BoxWorld, MASK_SHOT } from './public/js/collide.js';
import { CODE_MAPS } from './public/js/mapdefs.js';
import { pmove, newPlayerState, BTN } from './public/js/pmove.js';
import { WEAPONS, WEAPON_INDEX, ITEMS, LOADOUTS, ITEM_ROTATION, ZOMBIE } from './public/js/weapons.js';
import { initLoadout, zombieLoadout, giveWeapon, weaponThink, spreadDirs, eyePos, viewDir, hitTest, applyDamage, fallDamage, packOwn, MAX_HP, MAX_ARMOR } from './public/js/sim.js';
import { launch, stepProj } from './public/js/projectiles.js';
import { buildNav, boxBounds } from './public/js/nav.js';
import { SKILLS, newBrain, botName, botCommand } from './bots.js';
import { createZombies } from './cod.js';
import { createProfiles } from './profiles.js';
import { COIN_KILL, COIN_TEAM_WIN } from './public/js/cosmetics.js';

// Packed build (the standalone .exe, see tools/build_exe.mjs): game files are assets inside the executable,
// keyed by their path from the project root ("public/index.html"). Models still load from a "models" folder beside it.
const PACKED = (() => {
  try {
    const sea = require('node:sea'); // only defined in the packed (CommonJS) build
    return sea.isSea() ? sea : null;
  } catch { return null; }
})();
const ROOT = PACKED ? path.dirname(process.execPath) : path.dirname(fileURLToPath(import.meta.url));
const MODELS_DIR = PACKED ? path.join(ROOT, 'models') : path.join(ROOT, 'public/models');

// a game file by its path from the project root
function readGameFile(rel) {
  return PACKED ? Buffer.from(PACKED.getAsset(rel)) : fs.readFileSync(path.join(ROOT, rel));
}
// coins and cosmetics, saved beside the server (the .exe, or this folder when run from source)
const profiles = createProfiles(process.env.PROFILES || path.join(ROOT, 'data', 'profiles.json'));
const PORT = +(process.env.PORT || 8027);
const TICK = 1 / 60;
const SNAP_EVERY = 2; // 30 snapshots/s
const MAX_ROOMS = 30;
const NUM_COLORS = 8; // suit colours; the client owns the palette
const NUM_MODELS = 4; // player characters, also drawn by the client
const MAP_IDS = ['csdm', 'foundry', 'courtyard', 'skyline', 'warehouse', 'rooftops', 'bunker', 'ziggurat', 'docks', 'canyon', 'office', 'station', 'city'];
const MODES = { dm: 'Deathmatch', tdm: 'Team deathmatch', ctf: 'Capture the flag', zombies: 'Zombies (rounds, co-op)', infection: 'Infection' };
const MAX_BOTS = 15;
const ZOMBIE_COUNTDOWN = 15; // seconds after the second player arrives before someone turns
const TEAM_PICK = 20; // team deathmatch opens with this long to choose a side (warm-up: nothing counts)
const TEAMS = ['red', 'blue'];
const PROP = { crate: { hp: 60, half: [20, 20], h: 40 }, barrel: { hp: 35, half: [14, 14], h: 40, blast: { radius: 210, splash: 110, knock: 650 } } };

// ------------------------------------------------------------------ maps (definitions loaded once; each match builds its own world)
const mapCache = new Map();
function mapDef(id) {
  if (!mapCache.has(id)) {
    let def;
    const m = CODE_MAPS[id];
    if (m) {
      def = {
        name: m.name, boxes: m.boxes, pads: m.pads || [], killZ: m.killZ, bounds: m.bounds, doors: m.doors || [], buys: m.buys, zstart: m.zstart,
        get spawns() { return m.spawns; }, get items() { return m.items; }, get props() { return m.props || []; }, get flags() { return m.flags; },
      };
    }
    else {
      const j = JSON.parse(readGameFile(`public/maps/${id}/map.json`).toString('utf8'));
      def = { name: j.name, boxes: j.boxes.map((b) => ({ mins: b.slice(0, 3), maxs: b.slice(3, 6) })), spawns: j.spawns, items: j.items, props: j.props || [], pads: [], flags: j.flags, killZ: j.killZ, doors: [] };
    }
    mapCache.set(id, def);
  }
  return mapCache.get(id);
}
const mapName = (id) => (CODE_MAPS[id] ? CODE_MAPS[id].name : mapDef(id).name);

// where bots and zombies can walk (built once per map, doors tagged so zombies wait for them to open)
const navCache = new Map();
function navFor(id) {
  if (!navCache.has(id)) {
    const def = mapDef(id);
    navCache.set(id, buildNav(def.boxes, def.pads, def.bounds || boxBounds(def.boxes), def.doors));
  }
  return navCache.get(id);
}

const humanCount = (R) => { let n = 0; for (const p of R.players.values()) if (!p.bot) n++; return n; };

// ------------------------------------------------------------------ room settings
export const DEFAULT_SETTINGS = { name: 'Main', mode: 'dm', caplimit: 3, map: 'rotation', maxPlayers: 16, fraglimit: 30, timelimit: 15, loadout: 'default', gravity: 1, speed: 1, jump: 1, items: true, private: false, password: '', bots: 0, botSkill: 'normal' };

function num(v, lo, hi, def) {
  v = +v;
  return Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : def;
}

function sanitize(s = {}) {
  const mode = s.mode === 'zombie' ? 'infection' : MODES[s.mode] ? s.mode : 'dm';
  return {
    name: clean(s.name).slice(0, 32) || 'Untitled game',
    mode,
    caplimit: Math.round(num(s.caplimit, 1, 20, 3)),
    map: s.map === 'rotation' || MAP_IDS.includes(s.map) ? s.map : 'rotation',
    maxPlayers: Math.round(num(s.maxPlayers, 2, 16, 12)),
    fraglimit: Math.round(num(s.fraglimit, 0, 200, 30)),
    // infection always has a round timer (the survivors win when it runs out); zombies goes on until everyone's down
    timelimit: mode === 'infection' ? Math.round(num(s.timelimit, 2, 30, 5)) || 5 : mode === 'zombies' ? 0 : Math.round(num(s.timelimit, 0, 120, 15)),
    loadout: LOADOUTS[s.loadout] && !LOADOUTS[s.loadout].hidden ? s.loadout : 'default',
    // computer players (not in zombies, where everyone is on the same side)
    bots: mode === 'zombies' ? 0 : Math.round(num(s.bots, 0, MAX_BOTS, 0)),
    botSkill: SKILLS[s.botSkill] ? s.botSkill : 'normal',
    gravity: num(s.gravity, 0.25, 2, 1),
    speed: num(s.speed, 0.5, 2, 1),
    jump: num(s.jump, 0.5, 2.5, 1),
    items: s.items !== false,
    private: !!s.private,
    password: String(s.password || '').slice(0, 24),
  };
}

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  for (;;) {
    // first character is always a letter so a code is never mistaken for a room number
    let c = CODE_CHARS[(Math.random() * 24) | 0];
    for (let i = 1; i < 4; i++) c += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0];
    if (![...rooms.values()].some((r) => r.code === c)) return c;
  }
}

// ------------------------------------------------------------------ rooms
const rooms = new Map();
let nextRoomId = 1;

function createRoom(settings, permanent = false) {
  const s = sanitize(settings);
  const R = {
    id: nextRoomId++, code: newCode(), settings: s, permanent, players: new Map(), watchers: new Set(), emptySince: Date.now(),
    rules: { gravity: s.gravity, speed: s.speed, jump: s.jump },
  };
  rooms.set(R.id, R);
  startMatch(R, s.map === 'rotation' ? MAP_IDS[0] : s.map);
  for (let i = 0; i < s.bots; i++) addBot(R);
  console.log(`[room] #${R.id} "${s.name}" ${s.private ? 'private ' + R.code : 'public'}`);
  return R;
}

function startMatch(R, mapId) {
  const def = mapDef(mapId);
  const cod = R.settings.mode === 'zombies';
  let kinds = ITEM_ROTATION;
  if (LOADOUTS[R.settings.loadout].noPickups) kinds = kinds.filter((k) => ITEMS[k]);
  // zombies has no pickups or props: weapons and perks are bought, and its item spots become the shops
  const items = R.settings.items && !cod ? def.items.map((it, i) => ({ i, kind: kinds[i % kinds.length], o: it.o.slice(), up: true, at: 0 })) : [];
  const world = new BoxWorld(def.boxes, def.pads);
  // barricades only stand in zombies (other modes play the map wide open)
  const doorBoxes = cod ? def.doors.map((d) => world.addBox({ mins: d.mins, maxs: d.maxs, mat: 'door' })) : [];
  const propByBox = new Map();
  const props = (cod ? [] : def.props).map((pd, i) => {
    const P = PROP[pd.kind] || PROP.crate;
    const box = world.addBox({ mins: [pd.o[0] - P.half[0], pd.o[1] - P.half[1], pd.o[2]], maxs: [pd.o[0] + P.half[0], pd.o[1] + P.half[1], pd.o[2] + P.h], mat: 'prop' });
    const prop = { i, kind: pd.kind, o: pd.o.slice(), hp: P.hp, up: true, at: 0, box };
    propByBox.set(box, prop);
    return prop;
  });
  R.map = { id: mapId, name: def.name, world, spawns: def.spawns, killZ: def.killZ, items, props, propByBox, pads: def.pads, flagHomes: def.flags, nav: navFor(mapId) };
  R.teamScore = { red: 0, blue: 0 };
  R.zm = R.settings.mode === 'infection' ? { started: false, startAt: ZOMBIE_COUNTDOWN, from: 0 } : null;
  R.cz = cod ? createZombies(R, def, R.map.nav, doorBoxes, zombieApi(R)) : null;
  R.pick = R.settings.mode === 'tdm' ? { until: TEAM_PICK } : null;
  R.clockFrom = 0;
  R.flags = R.settings.mode === 'ctf' ? Object.fromEntries(TEAMS.map((t) => [t, { home: def.flags[t].slice(), pos: def.flags[t].slice(), carrier: 0, dropped: false, dropAt: 0 }])) : null;
  R.vote = null;
  R.tick = 0;
  R.time = 0;
  R.ending = 0;
  R.history = [];
  R.events = [];
  R.projectiles = [];
  for (const p of R.players.values()) {
    p.frags = 0;
    p.deaths = 0;
    p.caps = 0;
    if (R.zm || R.cz) p.team = 'human';
    else if (teamMode(R) && !p.team) p.team = pickTeam(R);
    if (R.cz) R.cz.join(p);
    respawn(R, p);
    send(p, welcome(R, p));
  }
  for (const ws of R.watchers || []) wsSend(ws, watchWelcome(R));
}

function nextMap(R) {
  if (R.settings.map !== 'rotation') return R.settings.map;
  // the vote decides when anyone voted; ties go to a random leader, no votes means plain rotation
  if (R.vote && R.vote.votes.size) {
    const count = {};
    for (const m of R.vote.votes.values()) count[m] = (count[m] || 0) + 1;
    const top = Math.max(...Object.values(count));
    const leaders = Object.keys(count).filter((m) => count[m] === top);
    return leaders[(Math.random() * leaders.length) | 0];
  }
  return MAP_IDS[(MAP_IDS.indexOf(R.map.id) + 1) % MAP_IDS.length];
}

// red/blue team games (zombies has its own two sides)
function teamMode(R) {
  return R.settings.mode === 'tdm' || R.settings.mode === 'ctf';
}

function pickTeam(R) {
  const n = { red: 0, blue: 0 };
  for (const p of R.players.values()) if (p.team) n[p.team]++;
  return n.red === n.blue ? TEAMS[(Math.random() * 2) | 0] : n.red < n.blue ? 'red' : 'blue';
}

function roomInfo(R) {
  const s = R.settings;
  return {
    id: R.id, name: s.name, map: R.map.name, rotation: s.map === 'rotation', players: humanCount(R), bots: R.players.size - humanCount(R), botSkill: s.bots ? SKILLS[s.botSkill].name : null, max: s.maxPlayers,
    mode: s.mode, caplimit: s.caplimit, fraglimit: s.fraglimit, timelimit: s.timelimit, loadout: LOADOUTS[s.loadout].name, locked: !!s.password,
    gravity: s.gravity, speed: s.speed, jump: s.jump, items: s.items,
  };
}

function welcome(R, p) {
  return {
    t: 'welcome', id: p.id, map: R.map.id, mapName: R.map.name,
    room: { ...roomInfo(R), code: R.code, private: R.settings.private, mine: R.owner === p.id },
    rules: R.rules, timeLeft: timeLeft(R), fraglimit: R.settings.fraglimit,
    items: R.map.items.map((it) => [it.i, it.kind, it.o.map(Math.round), it.up ? 1 : 0]),
    props: R.map.props.map((pr) => [pr.i, pr.kind, pr.o.map(Math.round), pr.up ? 1 : 0]),
    pads: R.map.pads,
    mode: R.settings.mode, caplimit: R.settings.caplimit, teamScore: R.teamScore, pick: R.pick ? Math.ceil(R.pick.until - R.time) : 0,
    flags: R.flags ? Object.fromEntries(TEAMS.map((t) => [t, { home: R.flags[t].home, pos: R.flags[t].pos, carrier: R.flags[t].carrier, dropped: R.flags[t].dropped }])) : null,
    players: [...R.players.values()].map(info),
    cz: R.cz ? R.cz.welcome() : null,
  };
}

// main-menu spectators: a socket watching a public game in the background, not a player in it
function watchWelcome(R) {
  return { ...welcome(R, { id: -1 }), watch: 1 }; // -1: no id an event can name (0 means "the world")
}

// the public game with the most going on (people first, then bots); null when every public game is empty
function pickWatchRoom() {
  let best = null, score = 0;
  for (const R of rooms.values()) {
    if (R.settings.private || R.ending) continue;
    const n = humanCount(R) * 100 + R.players.size;
    if (n > score) { best = R; score = n; }
  }
  return best;
}

function unwatch(ws) {
  for (const R of rooms.values()) R.watchers.delete(ws);
}

function info(p) {
  return { id: p.id, name: p.name, color: p.color, model: p.model | 0, cos: p.profile ? p.profile.eq : {}, team: p.team || null, frags: p.frags, deaths: p.deaths, caps: p.caps || 0, ping: p.ping, bot: p.bot ? 1 : 0, points: p.points | 0 };
}

// ------------------------------------------------------------------ players
let nextId = 1;

const validModel = (m) => (Number.isInteger(m) && m >= 0 && m < NUM_MODELS ? m : 0);

function newPlayer(ws, name, color, model) {
  const p = {
    id: nextId++, ws, name: clean(name) || 'Player', color: Number.isInteger(color) && color >= 0 && color < NUM_COLORS ? color : nextId % NUM_COLORS,
    model: validModel(model),
    ps: newPlayerState(), yaw: 0, pitch: 0, frags: 0, deaths: 0, ack: 0, ping: 0, respawnAt: 0,
    budget: 0, lastCmdWall: Date.now(), viewTime: 0, room: null,
  };
  p.ps.time = 0;
  return p;
}

function clean(s) {
  return String(s || '').replace(/[^\p{L}\p{N} _\-.!?'()[\]·]/gu, '').trim().slice(0, 32);
}

function respawn(R, p) {
  let { spawns } = R.map;
  if (R.cz && R.cz.startSpawns) spawns = R.cz.startSpawns;
  // capture the flag: spawn on your own half (closer to your flag than the enemy's)
  if (R.flags && p.team) {
    const mine = R.map.flagHomes[p.team], theirs = R.map.flagHomes[p.team === 'red' ? 'blue' : 'red'];
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    const own = spawns.filter((s) => d2(s.origin, mine) < d2(s.origin, theirs));
    if (own.length) spawns = own;
  }
  // in team games only enemies count when looking for a quiet spot
  const others = [...R.players.values()].filter((o) => o !== p && o.ps.alive && (!p.team || o.team !== p.team));
  // try a few random spawns and keep the one furthest from everybody
  let best = spawns[0], bd = -1;
  for (let i = 0; i < Math.min(8, spawns.length); i++) {
    const s = spawns[(Math.random() * spawns.length) | 0];
    let d = 1e12;
    for (const o of others) d = Math.min(d, (o.ps.origin[0] - s.origin[0]) ** 2 + (o.ps.origin[1] - s.origin[1]) ** 2);
    const blocked = others.some((o) => Math.abs(o.ps.origin[0] - s.origin[0]) < 40 && Math.abs(o.ps.origin[1] - s.origin[1]) < 40 && Math.abs(o.ps.origin[2] - s.origin[2]) < 80);
    if (!blocked && d > bd) { bd = d; best = s; }
  }
  const t = p.ps.time || 0;
  p.ps = newPlayerState([best.origin[0], best.origin[1], best.origin[2] + 1]);
  p.ps.time = t;
  initLoadout(p.ps, R.cz ? 'zombies' : R.settings.loadout);
  if (p.team === 'zombie') zombieLoadout(p.ps);
  if (R.cz) R.cz.loadout(p);
  p.yaw = best.yaw;
  p.pitch = 0;
  p.respawnAt = 0;
  pushEvent(R, { e: 'spawn', id: p.id, o: p.ps.origin.map(Math.round), y: Math.round(best.yaw) });
}

function pushEvent(R, ev, only) {
  R.events.push(only ? { ...ev, only } : ev);
}

function joinRoom(R, p) {
  if (p.room) leaveRoom(p);
  p.room = R;
  p.frags = 0;
  p.deaths = 0;
  p.caps = 0;
  p.ack = 0;
  // late arrivals in an infection round that already started join the horde
  p.team = R.cz ? 'human' : R.zm ? (R.zm.started ? 'zombie' : 'human') : teamMode(R) ? pickTeam(R) : null;
  if (R.cz) R.cz.join(p);
  // a person arriving in a full game with bots takes a bot's place
  if (!p.bot && R.players.size >= 16) { const b = [...R.players.values()].find((o) => o.bot); if (b) leaveRoom(b); }
  R.players.set(p.id, p);
  respawn(R, p);
  send(p, welcome(R, p));
  broadcast(R, { t: 'join', p: info(p) });
  console.log(`[join] ${p.name} -> room #${R.id}`);
}

function addBot(R) {
  const taken = new Set([...R.players.values()].map((o) => o.name));
  const p = newPlayer(null, botName(taken), (Math.random() * NUM_COLORS) | 0, (Math.random() * NUM_MODELS) | 0);
  p.bot = newBrain(R.settings.botSkill);
  p.seq = 0;
  joinRoom(R, p);
}

// each bot decides on a command every tick and it runs like a player's
function botThink(R) {
  const others = [...R.players.values()].map((o) => ({ id: o.id, team: o.team, alive: o.ps.alive && !o.ps.downed, origin: o.ps.origin, ducked: o.ps.ducked }));
  for (const p of R.players.values()) {
    if (!p.bot) continue;
    const cmd = botCommand(p, p.bot, { world: R.map.world, nav: R.map.nav, time: R.time, dt: TICK, others: others.filter((o) => o.id !== p.id), items: R.map.items });
    p.yaw = cmd.yaw;
    p.pitch = cmd.pitch;
    p.viewTime = R.time;
    runCmd(R, p, cmd, TICK, ++p.seq);
  }
}

function leaveRoom(p) {
  const R = p.room;
  if (!R) return;
  dropFlag(R, p);
  if (R.vote) R.vote.votes.delete(p.id);
  R.players.delete(p.id);
  p.room = null;
  p.team = null;
  broadcast(R, { t: 'leave', id: p.id });
  if (!humanCount(R)) R.emptySince = Date.now();
}

// ------------------------------------------------------------------ commands
function onCmds(p, cmds) {
  const R = p.room;
  const now = Date.now();
  // 1s of slack: enough that network bunching never trims a real command (which would make the
  // client's prediction disagree and the camera jitter), small enough to stop speed cheats
  p.budget = Math.min(1, p.budget + (now - p.lastCmdWall) / 1000);
  p.lastCmdWall = now;
  for (const c of cmds) {
    if (typeof c.s !== 'number' || c.s <= p.ack) continue;
    let dt = Math.min(0.05, Math.max(0, (c.ms || 0) / 1000));
    if (dt > p.budget) dt = p.budget;
    p.budget -= dt;
    p.ack = c.s;
    p.yaw = +c.y || 0;
    p.pitch = Math.max(-89, Math.min(89, +c.p || 0));
    p.viewTime = +c.rt || 0;
    const cmd = { fwd: clamp1(c.f), side: clamp1(c.sd), buttons: c.b | 0, yaw: p.yaw, pitch: p.pitch, w: Number.isInteger(c.w) ? c.w : undefined };
    runCmd(R, p, cmd, dt, c.s);
  }
}

function clamp1(v) {
  v = +v || 0;
  return v > 1 ? 1 : v < -1 ? -1 : v;
}

function runCmd(R, p, cmd, dt, seq) {
  const ps = p.ps;
  const use = cmd.buttons & BTN.USE;
  if (use && !(p.buttons & BTN.USE) && R.cz) R.cz.use(p);
  const pressed = cmd.buttons & ~(p.buttons | 0);
  p.buttons = cmd.buttons;
  if (!ps.alive) {
    ps.time += dt;
    if (R.time >= p.respawnAt && cmd.buttons & (BTN.ATTACK | BTN.JUMP)) respawn(R, p);
    return;
  }
  if (dt <= 0) return;
  if (pressed & BTN.ROCKETJUMP) rocketJump(R, p, cmd);
  pmove(R.map.world, ps, cmd, dt, R.rules);
  if (ps.landSpeed) {
    // landing from your own rocket jump doesn't hurt
    const dmg = p.rjSoftLanding ? 0 : fallDamage(ps.landSpeed);
    p.rjSoftLanding = false;
    if (dmg) damage(R, p, null, dmg, 'fall', false, null);
  }
  if (!ps.alive) return;
  weaponThink(ps, cmd, dt, (wi) => fire(R, p, wi, cmd, seq), (name) => {
    if (name === 'reload' || name === 'reloadstart' || name === 'reloadshell') pushEvent(R, { e: 'snd', id: p.id, w: ps.cur, k: 'reload' });
  });
}

// Rocket jump (Q): a small blast at your own feet throws you up and the way you're moving (or facing), and
// knocks back anyone standing next to you. Costs a little health (no fall damage when you land); any weapon,
// every few seconds.
const ROCKET_JUMP = { cooldown: 2.5, shove: 320, blast: { radius: 150, splash: 24, knock: 700 } };
function rocketJump(R, p, cmd) {
  const ps = p.ps;
  if (p.team === 'zombie' || ps.time < (p.rjReady || 0)) return;
  p.rjReady = ps.time + ROCKET_JUMP.cooldown;
  p.rjSoftLanding = true;
  const y = (cmd.yaw * Math.PI) / 180;
  let dx = cmd.fwd * Math.cos(y) + cmd.side * Math.sin(y), dy = cmd.fwd * Math.sin(y) - cmd.side * Math.cos(y);
  const len = Math.hypot(dx, dy);
  if (len < 0.1) { dx = Math.cos(y); dy = Math.sin(y); } else { dx /= len; dy /= len; }
  ps.velocity[0] += dx * ROCKET_JUMP.shove;
  ps.velocity[1] += dy * ROCKET_JUMP.shove;
  if (ps.velocity[2] < 0) ps.velocity[2] = 0; // a falling player still gets the full lift
  const at = [ps.origin[0], ps.origin[1], ps.origin[2] + 4]; // just above the feet: inside the floor the wall check would block it
  pushEvent(R, { e: 'boom', id: 0, o: at.map((v) => +v.toFixed(1)), k: 'rj' });
  blast(R, at, ROCKET_JUMP.blast, p, 'rpg');
}

// ------------------------------------------------------------------ combat
function rewind(R, time) {
  // stored tick closest to what the shooter was looking at (capped at 500ms back)
  const h = R.history;
  if (!h.length) return null;
  const t = Math.min(R.time, Math.max(time, R.time - 0.5));
  let best = h[h.length - 1];
  for (const e of h) if (Math.abs(e.t - t) < Math.abs(best.t - t)) best = e;
  return best;
}

let nextProj = 1;

function fire(R, p, wi, cmd, seq) {
  const W = WEAPONS[wi];
  const ps = p.ps;
  const start = eyePos(ps);
  const world = R.map.world;
  const zoomed = !!(cmd.buttons & BTN.ATTACK2) && !!W.zoom;

  if (W.proj) {
    const dir = spreadDirs(W, cmd.yaw, cmd.pitch, seq, zoomed)[0];
    const pr = { id: nextProj++, w: wi, owner: p.id, ...launch(world, W, start, dir) };
    // grenades carry some of the thrower's momentum
    if (W.proj.kind === 'grenade') for (let k = 0; k < 3; k++) pr.vel[k] += ps.velocity[k] * 0.5;
    R.projectiles.push(pr);
    pushEvent(R, { e: 'proj', id: pr.id, w: wi, owner: p.id, o: pr.pos.map((v) => +v.toFixed(1)), v: pr.vel.map((v) => +v.toFixed(1)) });
    return;
  }

  const past = rewind(R, p.viewTime || R.time);
  const targets = [...R.players.values()].filter((o) => o !== p && o.ps.alive).map((o) => {
    const h = past && past.pos.get(o.id);
    return { o, origin: h ? [h[0], h[1], h[2]] : o.ps.origin, ducked: h ? h[3] : o.ps.ducked };
  });
  if (R.cz) for (const z of R.cz.alive()) targets.push({ o: z, origin: z.ps.origin, ducked: false });

  if (W.melee) {
    const f = viewDir(cmd.yaw, cmd.pitch);
    const end = [start[0] + f[0] * W.range, start[1] + f[1] * W.range, start[2] + f[2] * W.range];
    const tr = world.trace(start, end, [-4, -4, -4], [4, 4, 4], MASK_SHOT);
    let hit = null;
    for (const t of targets) {
      const r = hitTest(start, end, t.origin, t.ducked) || hitTest(start, end, t.origin.map((v, i) => v + f[i] * 10), t.ducked);
      if (r && r.frac <= tr.fraction + 0.05 && (!hit || r.frac < hit.frac)) hit = { ...r, t };
    }
    pushEvent(R, { e: 'melee', id: p.id, hit: hit ? 2 : tr.fraction < 1 ? 1 : 0 });
    if (hit) hurtAny(R, hit.t.o, p, W.damage, W.id, false, f);
    else if (tr.fraction < 1 && R.map.propByBox.has(tr.box)) propDamage(R, R.map.propByBox.get(tr.box), W.damage * 2, p);
    return;
  }

  const dirs = spreadDirs(W, cmd.yaw, cmd.pitch, seq, zoomed);
  const shots = [];
  const dmgTo = new Map();
  const propHits = new Map();
  for (const d of dirs) {
    const end = [start[0] + d[0] * 8192, start[1] + d[1] * 8192, start[2] + d[2] * 8192];
    const tr = world.trace(start, end, [0, 0, 0], [0, 0, 0], MASK_SHOT);
    let frac = tr.fraction, hit = null;
    for (const t of targets) {
      const r = hitTest(start, end, t.origin, t.ducked);
      if (!r || r.frac >= tr.fraction) continue;
      // piercing shots hurt everyone in the line and stop at the wall
      if (W.pierce) {
        const prev = dmgTo.get(t.o) || { dmg: 0, head: false };
        prev.dmg += W.damage * (r.head ? 2 : 1);
        prev.head = prev.head || r.head;
        dmgTo.set(t.o, prev);
      } else if (r.frac < frac) { frac = r.frac; hit = { ...r, t }; }
    }
    const e = [start[0] + d[0] * 8192 * frac, start[1] + d[1] * 8192 * frac, start[2] + d[2] * 8192 * frac];
    shots.push([...e.map(Math.round), hit ? hit.t.o.id : 0, hit ? 0 : tr.fraction < 1 ? 1 : 0, tr.normal.map((v) => +v.toFixed(2))]);
    if (!hit && tr.fraction < 1 && R.map.propByBox.has(tr.box)) {
      const prop = R.map.propByBox.get(tr.box);
      propHits.set(prop, (propHits.get(prop) || 0) + W.damage);
    }
    if (hit) {
      const prev = dmgTo.get(hit.t.o) || { dmg: 0, head: false };
      prev.dmg += W.damage * (hit.head ? 2 : 1);
      prev.head = prev.head || hit.head;
      dmgTo.set(hit.t.o, prev);
    }
  }
  pushEvent(R, { e: 'shot', id: p.id, w: wi, s: start.map(Math.round), h: shots });
  const f = viewDir(cmd.yaw, cmd.pitch);
  for (const [o, d] of dmgTo) hurtAny(R, o, p, d.dmg, W.id, d.head, f);
  for (const [prop, dmg] of propHits) propDamage(R, prop, dmg, p);
}

function stepProjectiles(R, dt) {
  const world = R.map.world;
  for (let i = R.projectiles.length - 1; i >= 0; i--) {
    const pr = R.projectiles[i];
    const W = WEAPONS[pr.w], P = W.proj;
    const prev = pr.pos.slice();
    const res = stepProj(world, pr, P, dt);
    // direct hits on players along this step (the shooter is safe for the first moment)
    let victim = null, best = Infinity;
    if (!pr.rest) {
      for (const o of hittable(R)) {
        if (!o.ps.alive || (o.id === pr.owner && pr.t < 0.25)) continue;
        const h = hitTest(prev, pr.pos, o.ps.origin, o.ps.ducked);
        if (h && h.frac < best) { best = h.frac; victim = { o, head: h.head }; }
      }
    }
    const owner = R.players.get(pr.owner) || null;
    let done = false;
    if (victim && P.kind !== 'grenade') {
      const at = prev.map((v, k) => v + (pr.pos[k] - v) * best);
      if (P.direct) hurtAny(R, victim.o, owner, P.direct * (victim.head && P.kind === 'bolt' ? 2 : 1), W.id, victim.head, norm(pr.vel));
      if (P.radius) explode(R, pr, at, owner);
      else pushEvent(R, { e: 'pend', id: pr.id, o: at.map((v) => +v.toFixed(1)), hit: victim.o.id });
      done = true;
    } else if (res && res.hit) {
      if (!P.radius && R.map.propByBox.has(res.box)) propDamage(R, R.map.propByBox.get(res.box), P.direct, owner);
      if (P.radius) explode(R, pr, pr.pos, owner);
      else pushEvent(R, { e: 'pend', id: pr.id, o: pr.pos.map((v) => +v.toFixed(1)), n: res.normal });
      done = true;
    } else if (P.fuse && pr.t >= P.fuse) {
      explode(R, pr, pr.pos, owner);
      done = true;
    } else if (res && res.bounce && res.speed > 60) pushEvent(R, { e: 'bounce', id: pr.id, o: pr.pos.map((v) => +v.toFixed(1)), v: pr.vel.map((v) => +v.toFixed(1)) });
    if (done || pr.t > 8 || pr.pos[2] < R.map.killZ) R.projectiles.splice(i, 1);
  }
}

function explode(R, pr, at, owner) {
  const W = WEAPONS[pr.w], P = W.proj;
  pushEvent(R, { e: 'boom', id: pr.id, o: at.map((v) => +v.toFixed(1)), k: P.kind });
  blast(R, at, P, owner, W.id);
}

// Radius damage and knockback from a point. P: { radius, splash, knock }.
function blast(R, at, P, owner, weapon, skipProp) {
  for (const o of hittable(R)) {
    if (!o.ps.alive) continue;
    const c = [o.ps.origin[0], o.ps.origin[1], o.ps.origin[2] + 36];
    const d = Math.hypot(c[0] - at[0], c[1] - at[1], c[2] - at[2]);
    if (d > P.radius) continue;
    // walls block the blast
    const tr = R.map.world.trace(at, c, [0, 0, 0], [0, 0, 0], MASK_SHOT);
    if (tr.fraction < 0.97 && !R.map.propByBox.has(tr.box)) continue;
    const k = 1 - d / P.radius;
    const dir = d > 1 ? [(c[0] - at[0]) / d, (c[1] - at[1]) / d, (c[2] - at[2]) / d] : [0, 0, 1];
    // knockback first so a self-hit lifts you (rocket jumps)
    const push = (P.knock || 0) * k;
    o.ps.velocity[0] += dir[0] * push;
    o.ps.velocity[1] += dir[1] * push;
    o.ps.velocity[2] += Math.max(dir[2], 0.4) * push;
    o.ps.onGround = false;
    const dmg = P.splash * k * (o === owner ? 0.5 : 1);
    if (dmg >= 1) hurtAny(R, o, owner, dmg, weapon, false, o.isZombie ? dir : null);
  }
  for (const prop of R.map.props) {
    if (!prop.up || prop === skipProp) continue;
    const c = [prop.o[0], prop.o[1], prop.o[2] + 20];
    const d = Math.hypot(c[0] - at[0], c[1] - at[1], c[2] - at[2]);
    if (d < P.radius) propDamage(R, prop, P.splash * (1 - d / P.radius) * 1.5, owner);
  }
}

// ------------------------------------------------------------------ destructible props
function propDamage(R, prop, dmg, attacker) {
  if (!prop.up) return;
  prop.hp -= dmg;
  if (prop.hp > 0) return;
  prop.up = false;
  prop.at = R.time + 30;
  R.map.world.setEnabled(prop.box, false);
  pushEvent(R, { e: 'prop', i: prop.i, up: 0 });
  // barrels go off and can chain into each other
  const B = PROP[prop.kind].blast;
  if (B) {
    const at = [prop.o[0], prop.o[1], prop.o[2] + 20];
    pushEvent(R, { e: 'boom', id: 0, o: at, k: 'barrel' });
    blast(R, at, B, attacker, 'barrel', prop);
  }
}

function propThink(R) {
  for (const prop of R.map.props) {
    if (prop.up || R.time < prop.at) continue;
    // wait until nobody is standing where it comes back
    const P = PROP[prop.kind];
    const blocked = [...R.players.values()].some((p) => p.ps.alive && Math.abs(p.ps.origin[0] - prop.o[0]) < P.half[0] + 16 && Math.abs(p.ps.origin[1] - prop.o[1]) < P.half[1] + 16 && Math.abs(p.ps.origin[2] - prop.o[2]) < P.h + 72);
    if (blocked) continue;
    prop.up = true;
    prop.hp = P.hp;
    R.map.world.setEnabled(prop.box, true);
    pushEvent(R, { e: 'prop', i: prop.i, up: 1 });
  }
}

// ------------------------------------------------------------------ capture the flag
function dropFlag(R, p) {
  if (!R.flags) return;
  for (const t of TEAMS) {
    const f = R.flags[t];
    if (f.carrier !== p.id) continue;
    f.carrier = 0;
    f.dropped = true;
    f.pos = p.ps.origin.slice();
    f.dropAt = R.time + 20;
    pushEvent(R, { e: 'flag', t, act: 'drop', id: p.id, o: f.pos.map(Math.round) });
  }
}

function returnFlag(R, t, by) {
  const f = R.flags[t];
  f.carrier = 0;
  f.dropped = false;
  f.pos = f.home.slice();
  pushEvent(R, { e: 'flag', t, act: 'return', id: by ? by.id : 0 });
}

function flagThink(R) {
  if (!R.flags) return;
  const near = (p, pos) => Math.hypot(p.ps.origin[0] - pos[0], p.ps.origin[1] - pos[1]) < 48 && Math.abs(p.ps.origin[2] - pos[2]) < 80;
  for (const t of TEAMS) {
    const f = R.flags[t];
    if (f.dropped && R.time >= f.dropAt) returnFlag(R, t, null);
    if (f.carrier) {
      const c = R.players.get(f.carrier);
      if (c) f.pos = c.ps.origin.slice();
    }
  }
  if (R.ending) return;
  for (const p of R.players.values()) {
    if (!p.ps.alive || !p.team) continue;
    const enemy = p.team === 'red' ? 'blue' : 'red';
    const ef = R.flags[enemy], mf = R.flags[p.team];
    if (!ef.carrier && near(p, ef.pos)) {
      ef.carrier = p.id;
      ef.dropped = false;
      pushEvent(R, { e: 'flag', t: enemy, act: 'take', id: p.id });
    }
    if (mf.dropped && near(p, mf.pos)) returnFlag(R, p.team, p);
    // capture: bring their flag to yours while yours is safe at home
    if (ef.carrier === p.id && !mf.carrier && !mf.dropped && near(p, mf.home)) {
      R.teamScore[p.team]++;
      p.caps = (p.caps || 0) + 1;
      p.frags += 5;
      returnFlag(R, enemy, null);
      pushEvent(R, { e: 'flag', t: enemy, act: 'cap', id: p.id, score: R.teamScore });
      if (R.teamScore[p.team] >= R.settings.caplimit) endMatch(R, p.team);
    }
  }
}

// players and zombies alike
function hittable(R) {
  return R.cz ? [...R.players.values(), ...R.cz.alive()] : R.players.values();
}

function hurtAny(R, o, attacker, dmg, weapon, head, dir) {
  if (o.isZombie) R.cz.hurt(o, attacker, attacker && attacker.ps.dmgBoost > attacker.ps.time ? dmg * 2 : dmg, weapon, head, dir);
  else damage(R, o, attacker, dmg, weapon, head, dir);
}

// what the zombies game needs from the server
function zombieApi(R) {
  return {
    pushEvent: (ev, only) => pushEvent(R, ev, only),
    respawn: (p) => respawn(R, p),
    kill: (p, weapon) => kill(R, p, null, weapon, false),
    damage: (p, dmg, dir) => damage(R, p, null, dmg, 'zombie', false, dir),
    endMatch: (win, extra) => endMatch(R, win, extra),
  };
}

function norm(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function damage(R, victim, attacker, dmg, weapon, head, dir) {
  const ps = victim.ps;
  if (!ps.alive) return;
  if (R.cz) {
    if (ps.downed) return; // zombies leave downed players alone
    victim.lastHurt = R.time;
  }
  // no friendly fire in team games (hurting yourself still counts)
  if (attacker && attacker !== victim && attacker.team && attacker.team === victim.team) return;
  if (attacker && attacker !== victim && attacker.ps.dmgBoost > attacker.ps.time) dmg *= 2;
  const dead = applyDamage(ps, dmg);
  if (dir) {
    // a little knockback
    const k = Math.min(300, dmg * 4);
    ps.velocity[0] += dir[0] * k; ps.velocity[1] += dir[1] * k; ps.velocity[2] += Math.max(0, dir[2]) * k * 0.5;
  }
  pushEvent(R, { e: 'hurt', id: victim.id, a: attacker ? attacker.id : 0, d: Math.round(dmg), hp: Math.max(0, ps.hp), hs: head ? 1 : 0, dir: dir ? dir.map((v) => +v.toFixed(2)) : null });
  if (dead && R.cz && R.cz.down(victim)) return;
  if (dead) kill(R, victim, attacker, weapon, head);
}

function kill(R, victim, attacker, weapon, head) {
  victim.ps.alive = false;
  victim.ps.hp = 0;
  victim.deaths++;
  // zombies: back next round
  victim.respawnAt = R.cz ? Infinity : R.time + 2;
  if (attacker && attacker !== victim) { attacker.frags++; award(attacker, COIN_KILL, 'kill'); }
  else if (!R.cz) victim.frags--;
  if (R.settings.mode === 'tdm' && attacker && attacker !== victim && attacker.team) R.teamScore[attacker.team]++;
  dropFlag(R, victim);
  // velocity at death (after the hit's knockback) lets clients throw the ragdoll the right way
  pushEvent(R, { e: 'kill', k: attacker ? attacker.id : 0, v: victim.id, w: weapon, hs: head ? 1 : 0, o: victim.ps.origin.map(Math.round), y: Math.round(victim.yaw), vv: victim.ps.velocity.map(Math.round), dk: victim.ps.ducked ? 1 : 0 });
  // a survivor who dies after the outbreak comes back as a zombie
  if (R.zm && R.zm.started && victim.team === 'human') infect(R, victim, attacker, false);
  // the frag limit ends deathmatch, and team deathmatch on team frags; flags and zombies end otherwise
  const lim = R.pick ? 0 : R.settings.fraglimit;
  if (R.settings.mode === 'dm' && attacker && lim && attacker.frags >= lim) endMatch(R);
  if (R.settings.mode === 'tdm' && attacker && attacker.team && lim && R.teamScore[attacker.team] >= lim) endMatch(R, attacker.team);
}

// ------------------------------------------------------------------ team deathmatch: the team pick
function setTeam(R, p, team) {
  if (team === 'auto') {
    const n = { red: 0, blue: 0 };
    for (const o of R.players.values()) if (o !== p && o.team) n[o.team]++;
    team = n.red === n.blue ? p.team || 'red' : n.red < n.blue ? 'red' : 'blue';
  }
  if (!TEAMS.includes(team) || team === p.team) return;
  p.team = team;
  broadcast(R, { t: 'info', p: info(p) });
  respawn(R, p);
}

// when the pick ends the match goes live: scores start from zero and everyone spawns on their side
function pickThink(R) {
  // an empty team game waits in the pick, so whoever arrives first still gets to choose a side
  if (R.settings.mode === 'tdm' && !humanCount(R) && !R.ending) {
    R.pick = { until: R.time + TEAM_PICK };
    return;
  }
  if (!R.pick || R.time < R.pick.until) return;
  R.pick = null;
  R.clockFrom = R.time;
  R.teamScore = { red: 0, blue: 0 };
  // bots switch sides until the teams are even (people keep the side they picked)
  for (;;) {
    const n = { red: 0, blue: 0 };
    for (const o of R.players.values()) if (o.team) n[o.team]++;
    const big = n.red - n.blue > 1 ? 'red' : n.blue - n.red > 1 ? 'blue' : null;
    const b = big && [...R.players.values()].find((o) => o.bot && o.team === big);
    if (!b) break;
    b.team = big === 'red' ? 'blue' : 'red';
    broadcast(R, { t: 'info', p: info(b) });
  }
  R.projectiles = [];
  for (const p of R.players.values()) {
    p.frags = 0;
    p.deaths = 0;
    respawn(R, p);
  }
  pushEvent(R, { e: 'live' });
}

// ------------------------------------------------------------------ zombies (infection)
function infect(R, p, by, first) {
  p.team = 'zombie';
  pushEvent(R, { e: 'infect', id: p.id, by: by && by !== p ? by.id : 0, first: first ? 1 : 0 });
  broadcast(R, { t: 'info', p: info(p) });
  // patient zero turns on the spot; everyone else turns when they respawn
  if (first && p.ps.alive) {
    zombieLoadout(p.ps, ZOMBIE.firstHp);
    dropFlag(R, p);
  }
}

function zombieThink(R) {
  const Z = R.zm;
  if (!Z || R.ending) return;
  const list = [...R.players.values()];
  if (!Z.started) {
    // the countdown only runs while there are at least two people to play with
    if (list.length < 2) { Z.startAt = R.time + ZOMBIE_COUNTDOWN; return; }
    if (R.time < Z.startAt) return;
    const alive = list.filter((p) => p.ps.alive);
    const pick = (alive.length ? alive : list)[(Math.random() * (alive.length || list.length)) | 0];
    Z.started = true;
    Z.from = R.time;
    infect(R, pick, null, true);
    return;
  }
  const humans = list.filter((p) => p.team === 'human').length;
  const zombies = list.length - humans;
  if (!humans && list.length) endMatch(R, 'zombie');
  // the last zombie left: someone else turns so the round can go on
  else if (!zombies && humans >= 2) {
    const alive = list.filter((p) => p.ps.alive);
    if (alive.length) infect(R, alive[(Math.random() * alive.length) | 0], null, true);
  }
}

function endMatch(R, winnerTeam, extra = {}) {
  if (R.ending) return;
  if ((R.settings.mode === 'tdm' || R.settings.mode === 'ctf') && TEAMS.includes(winnerTeam)) {
    for (const p of R.players.values()) if (p.team === winnerTeam) award(p, COIN_TEAM_WIN, 'win');
  }
  if (R.settings.map === 'rotation') {
    // everyone gets 15 seconds to vote on the next map
    // five choices: the current map plus four others at random
    const others = MAP_IDS.filter((id) => id !== R.map.id).sort(() => Math.random() - 0.5).slice(0, 4);
    const options = [R.map.id, ...others];
    R.vote = { options, votes: new Map() };
    R.ending = R.time + 15;
    pushEvent(R, { e: 'intermission', win: winnerTeam || null, score: R.teamScore, vote: options.map((id) => ({ id, name: mapName(id) })), secs: 15, ...extra });
  } else {
    R.ending = R.time + 8;
    pushEvent(R, { e: 'intermission', win: winnerTeam || null, score: R.teamScore, next: mapName(R.settings.map), secs: 8, ...extra });
  }
}

function voteCounts(R) {
  const c = {};
  for (const m of R.vote.votes.values()) c[m] = (c[m] || 0) + 1;
  return c;
}

// ------------------------------------------------------------------ items
function itemThink(R) {
  for (const it of R.map.items) {
    if (!it.up) {
      if (R.time >= it.at) {
        it.up = true;
        pushEvent(R, { e: 'item', i: it.i, up: 1 });
      }
      continue;
    }
    for (const p of R.players.values()) {
      const ps = p.ps;
      if (!ps.alive) continue;
      const dx = ps.origin[0] - it.o[0], dy = ps.origin[1] - it.o[1], dz = ps.origin[2] + 36 - (it.o[2] + 8);
      if (dx * dx + dy * dy > 40 * 40 || Math.abs(dz) > 56) continue;
      if (!pickup(p, it.kind)) continue;
      it.up = false;
      it.at = R.time + (ITEMS[it.kind] || { respawn: 30 }).respawn;
      pushEvent(R, { e: 'item', i: it.i, up: 0, id: p.id, k: it.kind });
      break;
    }
  }
}

function pickup(p, kind) {
  const ps = p.ps;
  if (p.team === 'zombie') return false;
  const def = ITEMS[kind];
  if (def) {
    if (def.power) {
      ps[def.power] = Math.max(ps[def.power] || 0, ps.time) + def.secs;
      return true;
    }
    if (def.heal) {
      const cap = def.overheal || MAX_HP;
      if (ps.hp >= cap) return false;
      ps.hp = Math.min(cap, ps.hp + def.heal);
      return true;
    }
    if (def.armor) {
      if (ps.armor >= MAX_ARMOR) return false;
      ps.armor = Math.min(MAX_ARMOR, ps.armor + def.armor);
      return true;
    }
    if (def.ammo) {
      let took = false;
      for (const w of WEAPONS) {
        if (!w.ammo || !((ps.owned >> WEAPON_INDEX[w.id]) & 1)) continue;
        if (ps.ammo[w.ammo] < w.maxAmmo) {
          ps.ammo[w.ammo] = Math.min(w.maxAmmo, ps.ammo[w.ammo] + Math.max(1, w.clip));
          took = true;
        }
      }
      return took;
    }
  }
  const wi = WEAPON_INDEX[kind];
  if (wi === undefined) return false;
  const W = WEAPONS[wi];
  if ((ps.owned >> wi) & 1 && ps.ammo[W.ammo] >= W.maxAmmo) return false;
  giveWeapon(ps, wi);
  return true;
}

// ------------------------------------------------------------------ loop
function tick(R) {
  R.tick++;
  R.time += TICK;
  // after the 8 second scoreboard the next map starts; until then everyone can keep running around
  if (R.ending && R.time >= R.ending) {
    startMatch(R, nextMap(R));
    return;
  }
  if (!R.ending && timeLeft(R) === 0) {
    const s = R.teamScore;
    endMatch(R, R.zm ? (R.zm.started ? 'human' : null) : teamMode(R) ? (s.red > s.blue ? 'red' : s.blue > s.red ? 'blue' : 'draw') : null);
  }

  for (const p of R.players.values()) {
    if (!p.ps.alive && p.respawnAt && R.time > p.respawnAt + 4) respawn(R, p);
    if (p.ps.alive && p.ps.origin[2] < R.map.killZ) damage(R, p, null, 1000, 'fall', false, null);
  }
  botThink(R);
  itemThink(R);
  propThink(R);
  flagThink(R);
  zombieThink(R);
  if (R.cz && !R.ending) R.cz.think(TICK);
  pickThink(R);
  stepProjectiles(R, TICK);

  // lag-compensation history (1s)
  const pos = new Map();
  for (const p of R.players.values()) pos.set(p.id, [p.ps.origin[0], p.ps.origin[1], p.ps.origin[2], p.ps.ducked]);
  R.history.push({ t: R.time, pos });
  while (R.history.length > 70) R.history.shift();

  if (R.tick % SNAP_EVERY === 0) snapshot(R);
}

// whole seconds left on the clock, -1 for no limit (zombie rounds start counting at the outbreak)
function timeLeft(R) {
  if (!R.settings.timelimit) return -1;
  // the clock waits for the team pick and for the zombie outbreak
  const from = R.pick ? null : R.zm ? (R.zm.started ? R.zm.from : null) : R.clockFrom;
  if (from === null) return R.settings.timelimit * 60;
  return Math.max(0, Math.ceil(from + R.settings.timelimit * 60 - R.time));
}

function snapshot(R) {
  const list = [];
  for (const p of R.players.values()) {
    const s = p.ps;
    list.push([
      p.id, r1(s.origin[0]), r1(s.origin[1]), r1(s.origin[2]), r1(p.yaw), r1(p.pitch),
      (s.ducked ? 1 : 0) | (s.onGround ? 2 : 0) | (s.alive ? 4 : 0) | (s.reloadEnd ? 8 : 0) | (s.dmgBoost > s.time ? 16 : 0) | (s.haste > s.time ? 32 : 0) | (s.downed ? 64 : 0),
      s.cur, r1(s.velocity[0]), r1(s.velocity[1]), r1(s.velocity[2]),
    ]);
  }
  const events = R.events;
  R.events = [];
  const tl = timeLeft(R);
  // capture the flag: where both flags are and the score, every snapshot (tiny)
  const flagState = R.flags ? { fl: TEAMS.map((t) => [R.flags[t].pos.map(Math.round), R.flags[t].carrier, R.flags[t].dropped ? 1 : 0]) } : {};
  if (teamMode(R)) flagState.ts = [R.teamScore.red, R.teamScore.blue];
  if (R.pick) flagState.pk = Math.max(0, Math.ceil(R.pick.until - R.time));
  // zombies: [survivors, zombies, outbreak started, seconds until it does]
  if (R.zm) {
    let h = 0;
    for (const p of R.players.values()) if (p.team === 'human') h++;
    flagState.zm = [h, R.players.size - h, R.zm.started ? 1 : 0, R.players.size < 2 ? -1 : Math.max(0, Math.ceil(R.zm.startAt - R.time))];
  }
  // zombies: every zombie, the round state, and each player's own points and perks
  if (R.cz) { flagState.zb = R.cz.rows(); flagState.zr = R.cz.state(); }
  for (const p of R.players.values()) {
    if (p.bot) continue;
    const ev = events.filter((e) => !e.only || e.only === p.id);
    send(p, { t: 's', st: +R.time.toFixed(3), ack: p.ack, me: packOwn(p.ps), pl: list, ev, tl, ...flagState, ...(R.cz ? { zp: R.cz.personal(p) } : {}) });
  }
  if (R.watchers.size) {
    const msg = JSON.stringify({ t: 's', st: +R.time.toFixed(3), ack: 0, me: null, pl: list, ev: events.filter((e) => !e.only), tl, ...flagState });
    for (const ws of R.watchers) if (ws.readyState === 1) ws.send(msg);
  }
}

function r1(v) {
  return Math.round(v * 10) / 10;
}

function send(p, msg) {
  if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(msg));
}

function wsSend(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function broadcast(R, msg) {
  for (const p of R.players.values()) send(p, msg);
  for (const ws of R.watchers) wsSend(ws, msg);
}

// coins for a player with a profile (bots have none)
function award(p, n, why) {
  if (!p.profile) return;
  profiles.award(p.profile, n);
  send(p, { t: 'coins', coins: p.profile.coins, add: n, why });
}

// shop and wardrobe: POST { token, ... } -> the profile, or { error }
function profileApi(req, res, route) {
  let body = '';
  req.on('data', (d) => { body += d; if (body.length > 4096) req.destroy(); });
  req.on('end', async () => {
    let m;
    try { m = JSON.parse(body || '{}'); } catch { return json(res, { error: 'Bad request.' }); }
    const pr = await profiles.load(m.token);
    if (!pr) return json(res, { error: 'Your save code is not valid.' });
    let error = null;
    if (route === 'buy') error = profiles.buy(pr, String(m.item || ''));
    else if (route === 'equip') error = profiles.equip(pr, String(m.slot || ''), m.item === null ? null : String(m.item || ''));
    // show the change on anyone playing with this profile right now
    if (!error && route !== 'profile') {
      for (const R of rooms.values()) for (const p of R.players.values()) if (p.profile === pr) broadcast(R, { t: 'info', p: info(p) });
    }
    json(res, error ? { error, ...profiles.view(pr) } : profiles.view(pr));
  });
}

// ------------------------------------------------------------------ http
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream', '.fbx': 'application/octet-stream', '.ktx2': 'image/ktx2', '.tga': 'image/x-tga',
};

// Which model files exist for each slot: models/<slot>.glb | .gltf | .fbx, or a folder models/<slot>/ holding one.
function listModels() {
  const dir = MODELS_DIR;
  const out = {};
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isFile()) {
      const m = /^(.+)\.(glb|gltf|fbx)$/i.exec(name);
      if (m && !out[m[1].toLowerCase()]) out[m[1].toLowerCase()] = 'models/' + name;
    } else if (st.isDirectory()) {
      const found = findModelFile(full, 3);
      if (found) out[name.toLowerCase()] = 'models/' + path.relative(dir, found).split(path.sep).join('/');
    }
  }
  return out;
}

function findModelFile(dir, depth) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ext of ['.glb', '.gltf', '.fbx']) {
    const f = entries.find((e) => e.isFile() && e.name.toLowerCase().endsWith(ext));
    if (f) return path.join(dir, f.name);
  }
  if (depth > 0) for (const e of entries) if (e.isDirectory()) { const r = findModelFile(path.join(dir, e.name), depth - 1); if (r) return r; }
  return null;
}

// the game page may be hosted elsewhere (GitHub Pages), so the API answers any origin; it holds nothing secret
// beyond each player's own save code, which only that player's page sends
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'content-type' };

function json(res, body) {
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...CORS });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  if (p === '/vendor/three.module.js') return serveFile(res, path.join(ROOT, 'node_modules/three/build/three.module.js'), req);
  if (p.startsWith('/vendor/addons/')) {
    const base = path.join(ROOT, 'node_modules/three/examples/jsm');
    const file = path.join(base, p.slice(15)); // join normalises "..", the check below rejects escapes
    if (!file.startsWith(base)) { res.writeHead(403); return res.end(); }
    return serveFile(res, file, req);
  }
  if (p === '/api/info') {
    const main = [...rooms.values()].find((r) => r.permanent);
    return json(res, {
      map: main.map.id, mapName: main.map.name, players: [...rooms.values()].reduce((n, r) => n + humanCount(r), 0), models: listModels(),
      maps: MAP_IDS.map((id) => ({ id, name: mapName(id) })), loadouts: Object.fromEntries(Object.entries(LOADOUTS).filter(([, v]) => !v.hidden).map(([k, v]) => [k, v.name])),
      modes: MODES, skills: Object.fromEntries(Object.entries(SKILLS).map(([k, v]) => [k, v.name])), maxBots: MAX_BOTS, defaults: DEFAULT_SETTINGS,
    });
  }
  if (req.method === 'OPTIONS' && p.startsWith('/api/')) { res.writeHead(204, CORS); return res.end(); }
  if (req.method === 'POST' && /^\/api\/(profile|buy|equip)$/.test(p)) return profileApi(req, res, p.slice(5));
  if (p === '/api/rooms') return json(res, [...rooms.values()].filter((r) => !r.settings.private).map(roomInfo));
  if (p === '/') p = '/index.html';
  if (PACKED && p.startsWith('/models/')) {
    const file = path.join(MODELS_DIR, p.slice(8));
    if (!file.startsWith(MODELS_DIR)) { res.writeHead(403); return res.end(); }
    return serveFile(res, file, req, true);
  }
  const file = path.join(ROOT, 'public', p);
  if (!file.startsWith(path.join(ROOT, 'public'))) { res.writeHead(403); return res.end(); }
  serveFile(res, file, req);
});

function serveFile(res, file, req, fromDisk = false) {
  const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
  if (PACKED && !fromDisk) {
    let body;
    try { body = readGameFile(path.relative(ROOT, file).split(path.sep).join('/')); } catch { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': type, 'content-length': body.length, 'cache-control': 'no-cache' });
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'content-length': st.size, 'cache-control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

// ------------------------------------------------------------------ websocket
const wss = new WebSocketServer({ server, perMessageDeflate: false, maxPayload: 64 * 1024 });
wss.on('error', () => {}); // listen errors are handled on the http server below
wss.on('connection', (ws) => {
  let p = null;
  const fail = (text) => ws.send(JSON.stringify({ t: 'error', text }));
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data); } catch { return; }
    if (m.t === 'watch') {
      if (p && p.room) return;
      unwatch(ws);
      const R = pickWatchRoom();
      if (!R) return wsSend(ws, { t: 'watch-none' });
      R.watchers.add(ws);
      return wsSend(ws, watchWelcome(R));
    }
    if (m.t === 'unwatch') return unwatch(ws);
    if (m.t === 'join' || m.t === 'create') {
      unwatch(ws);
      let R;
      if (m.t === 'create') {
        if (rooms.size >= MAX_ROOMS) return fail('The server has too many games running. Join one from the list instead.');
        R = createRoom({ ...m.settings });
      } else {
        const key = String(m.room || '').trim().toUpperCase();
        R = /^\d+$/.test(key) ? rooms.get(+key) : [...rooms.values()].find((r) => r.code === key);
        if (!R) return fail(/^\d+$/.test(key) ? 'That game has ended.' : `No game with the code ${key}.`);
        if (R.settings.private && !/^[A-Z0-9]{4}$/.test(key)) return fail('That game is private. Ask for its code.');
        if (R.settings.password && m.password !== R.settings.password) return fail('Wrong password.');
      }
      if (humanCount(R) >= R.settings.maxPlayers) return fail('That game is full.');
      if (!p) p = newPlayer(ws, m.name, m.color, m.model);
      else { p.name = clean(m.name) || p.name; if (Number.isInteger(m.color)) p.color = m.color % NUM_COLORS; p.model = validModel(m.model); }
      if (m.t === 'create') R.owner = p.id;
      joinRoom(R, p);
      // coins and cosmetics arrive a moment later (they may come from an online database)
      const me = p;
      profiles.load(m.token).then((pr) => {
        me.profile = pr;
        if (!pr) return;
        send(me, { t: 'coins', coins: pr.coins });
        if (me.room && Object.keys(pr.eq).length) broadcast(me.room, { t: 'info', p: info(me) });
      });
      return;
    }
    if (!p || !p.room) return;
    const R = p.room;
    if (m.t === 'c' && Array.isArray(m.c)) onCmds(p, m.c.slice(0, 32));
    else if (m.t === 'leave') { leaveRoom(p); ws.send(JSON.stringify({ t: 'left' })); }
    else if (m.t === 'chat') {
      const text = String(m.text || '').slice(0, 160).trim();
      if (text) broadcast(R, { t: 'chat', id: p.id, text });
    } else if (m.t === 'ping') send(p, { t: 'pong', c: m.c });
    else if (m.t === 'rtt') p.ping = Math.max(0, Math.min(999, m.v | 0));
    else if (m.t === 'color' && Number.isInteger(m.color) && m.color >= 0 && m.color < NUM_COLORS) {
      p.color = m.color;
      if (m.model !== undefined) p.model = validModel(m.model);
      broadcast(R, { t: 'info', p: info(p) });
    }
    else if (m.t === 'team' && R.pick && typeof m.team === 'string') setTeam(R, p, m.team);
    else if (m.t === 'vote' && R.vote && R.vote.options.includes(m.map)) { R.vote.votes.set(p.id, m.map); broadcast(R, { t: 'votes', c: voteCounts(R) }); }
  });
  ws.on('close', () => {
    unwatch(ws);
    if (p) { console.log(`[leave] ${p.name}`); leaveRoom(p); }
  });
});

setInterval(() => {
  for (const R of rooms.values()) broadcast(R, { t: 'score', s: [...R.players.values()].map((p) => [p.id, p.frags, p.deaths, p.ping, p.points | 0]) });
  // close created rooms 30s after the last person leaves (bots don't keep a game open)
  for (const R of [...rooms.values()]) {
    if (!R.permanent && !humanCount(R) && Date.now() - R.emptySince > 30000) {
      rooms.delete(R.id);
      for (const ws of R.watchers) wsSend(ws, { t: 'watch-none' });
      console.log(`[room] #${R.id} closed`);
    }
  }
}, 1000);

// ------------------------------------------------------------------ boot
// one always-on public game for each mode
for (const m of [
  { name: 'Main · Deathmatch', mode: 'dm', fraglimit: 30, timelimit: 15 },
  { name: 'Main · Team Deathmatch', mode: 'tdm', fraglimit: 50, timelimit: 15 },
  { name: 'Main · Capture the Flag', mode: 'ctf', caplimit: 3, timelimit: 20 },
  { name: 'Main · Zombies', mode: 'zombies', map: 'city' },
]) createRoom({ ...DEFAULT_SETTINGS, ...m }, true);
let acc = 0, last = performance.now();
setInterval(() => {
  const now = performance.now();
  acc += (now - last) / 1000;
  last = now;
  let n = 0;
  while (acc >= TICK && n++ < 10) {
    for (const R of rooms.values()) tick(R);
    acc -= TICK;
  }
}, 5);
// Resolves with the port once listening. The packed .exe tries the next few ports when PORT is busy.
export const ready = new Promise((resolve) => {
  let port = PORT;
  server.on('listening', () => {
    console.log(`MUGR DEATHMATCH server on http://localhost:${port}`);
    resolve(port);
  });
  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && PACKED && port < PORT + 10) { server.listen(++port); return; }
    console.error(e.code === 'EADDRINUSE' ? `Port ${port} is already in use. Is another game server running?` : `Server error: ${e.message}`);
    // keep the .exe's window open so the message can be read; from a terminal just stop
    if (PACKED) console.error('You can close this window.');
    else process.exit(1);
  });
  server.listen(port);
});
