// Bank heist (co-op, 2 to 4 robbers), in the spirit of the GTA Online bank jobs. A planning phase (roles,
// approach, difficulty, ready up), then the job: get a keycard, through the staff door, crack the vault, bag
// the cash, get it to the van. Quietly (masks off until you need them, guards and cameras that notice you)
// or loud (the alarm goes, then the police come in waves).
//
// The AI: guards patrol and look around; they see with a cone and a detection meter (faster when you're
// close, masked, moving fast, standing; slower at the edge of their vision), hear gunshots and running, find
// bodies, and investigate what they half-saw or heard. A guard who's sure goes for the alarm panel or radios
// it in, and can be stopped. Cameras feed the guard in the security office. Staff panic and run for a phone
// unless you make them get down and tie them up. Once it's loud, guards and police fight as a team: they
// share what they've seen over the radio, pick cover that hides them from you but lets them peek, take turns
// popping out to shoot, flank from other angles, back off to cover when hurt, push when they outnumber you,
// lead moving targets, and keep their heads down when you suppress them. Police come in squads.
import { MASK_SHOT } from './public/js/collide.js';
import { pmove, newPlayerState, BTN } from './public/js/pmove.js';
import { WEAPONS, WEAPON_INDEX } from './public/js/weapons.js';
import { giveWeapon, hitTest } from './public/js/sim.js';
import { nearestNode, findPath } from './public/js/nav.js';

const D = 180 / Math.PI;
const angDiff = (a, b) => ((b - a) % 360 + 540) % 360 - 180;
const dist2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const rnd = (a, b) => a + Math.random() * (b - a);
const r1 = (v) => Math.round(v * 10) / 10;

export const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const ROLES = {
  hacker: { name: 'Hacker', about: 'Hacks the vault and the cameras much faster.' },
  enforcer: { name: 'Enforcer', about: 'Shotgun and rifle, full armour, extra ammo; bags don\'t slow you down.' },
  infiltrator: { name: 'Infiltrator', about: 'Harder to spot, quiet footsteps, a silenced pistol, faster ties and takedowns.' },
  lookout: { name: 'Lookout', about: 'Sees guards and cameras through walls, carries a sniper rifle.' },
};
const BAG_CASH = 30000, BOX_CASH = 3000, CIV_PENALTY = 5000;
// what things are called (a map's heist data can rename them: paintings instead of cash, a boat instead of the van)
export const LABELS = {
  keycard: 'Take the keycard', cardWhere: 'manager\'s office, or the guard captain', staff: 'Open the staff door', back: 'Open the back door', nocard: 'Needs a keycard',
  cams: 'Loop the cameras', camsWhere: 'security office', wires: 'Cut the alarm wiring', vault: 'the vault', hack: 'Hack the vault', drill: 'Set up the drill', fix: 'Fix the drill',
  cart: 'Bag the cash', carts: 'the cash', box: 'Drill a deposit box', boxes: 'deposit boxes', escape: 'Get in the van and go', ride: 'the van', bagFull: 'Get it to the van (G throws it)', opened: 'THE VAULT IS OPEN',
};

// per difficulty: [easy, normal, hard]
const DIFF = {
  detect: [0.45, 0.8, 1.25], // how fast meters fill
  react: [1.1, 0.7, 0.4], // seconds from spotting to first shot
  spread: [13, 10, 8], // aim error, degrees
  dmg: [0.45, 0.7, 1.0],
  radioTime: [4.5, 3, 1.8], // seconds to radio the alarm in
  police: [55, 40, 28], // seconds from the alarm to the first assault
  hack: [16, 20, 26], drill: [40, 52, 65],
  bleed: [45, 30, 20], custody: [15, 35, Infinity],
  maxPolice: [4, 6, 8], perPlayer: [1.5, 2, 2.5],
  hide: [1.7, 1.25, 0.85], peek: [1.1, 1.6, 2.2], // seconds behind cover / out shooting
  guardHp: [55, 70, 90], policeHp: [45, 65, 95], swatHp: [0, 0, 150],
  payout: [1, 1.6, 2.5],
};
// what the AI carries: weapon index for effects; damage per bullet; seconds between shots; clip; reload; burst
const GUNS = {
  guard: { wi: WEAPON_INDEX.pistol, dmg: 9, rate: 0.42, clip: 12, reload: 1.8, burst: [1, 3], pause: [0.3, 0.7] },
  police: { wi: WEAPON_INDEX.smg1, dmg: 6, rate: 0.1, clip: 30, reload: 2.2, burst: [3, 7], pause: [0.35, 0.9] },
  swat: { wi: WEAPON_INDEX.ar2, dmg: 9, rate: 0.11, clip: 30, reload: 2.4, burst: [3, 6], pause: [0.3, 0.7] },
};
// how far shots carry (an unsuppressed gunshot brings every guard in range)
const NOISE = { crowbar: 0, pistol: 650, '357': 1000, smg1: 750, ar2: 1000, shotgun: 1150, autoshotgun: 1150, sniper: 1500, lmg: 1100, rpg: 1600, grenade: 1600, crossbow: 250, railgun: 900 };

// cover spots on the nav graph: floor nodes with something solid at chest height close by. Cached per nav.
const coverCache = new WeakMap();
function coverNodes(nav, world) {
  if (coverCache.has(nav)) return coverCache.get(nav);
  const out = [];
  for (const n of nav.nodes) {
    let walls = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const tr = world.trace([n.x, n.y, n.z + 36], [n.x + Math.cos(a) * 44, n.y + Math.sin(a) * 44, n.z + 36], [0, 0, 0], [0, 0, 0], MASK_SHOT);
      if (tr.fraction < 1) walls++;
    }
    if (walls >= 1 && walls <= 5) out.push(n);
  }
  coverCache.set(nav, out);
  return out;
}

// api: { pushEvent(ev, only), award(p, coins, why), stat(p, change), damage(p, dmg, dir, kind, head), kill(p, why),
//        respawn(p), plan(msg) (to everyone in the room), players() }
export function createHeist(R, def, nav, doorBoxes, api) {
  const HD = def.heist;
  const L = { ...LABELS, ...(HD.labels || {}) };
  const bagCash = HD.bagCash || BAG_CASH, boxCash = HD.boxCash || BOX_CASH;
  const world = () => R.map.world;
  const H = {
    phase: 'planning', difficulty: 'normal', approach: 'stealth', host: 0,
    npcs: new Map(), nextNpc: 1, bodies: [], intel: new Map(), cams: [], camsLooped: false, wiresCut: false,
    alarm: false, alarmAt: 0, alarmWhy: '', policeAt: Infinity, assault: null, nextSquad: 0,
    doors: def.doors.map((d, i) => ({ i, name: d.name, box: doorBoxes[i], mins: d.mins, maxs: d.maxs, open: false, tmpUntil: 0 })),
    keycards: [], vault: { open: false, prog: 0, drill: false, jam: false, jamAt: 0 }, carts: [], boxes: [], bags: [], nextBag: 1,
    secured: 0, cash: 0, kills: 0, civKills: 0, startAt: 0, result: null, overAt: 0, escapeProg: 0, loudAt: 0,
  };
  const di = () => DIFFICULTIES.indexOf(H.difficulty);
  const crew = () => [...api.players()].filter((p) => !p.bot);
  const standing = () => crew().filter((p) => p.ps.alive && !p.ps.downed);
  const inBox = (o, b) => o[0] >= b[0][0] && o[0] <= b[1][0] && o[1] >= b[0][1] && o[1] <= b[1][1] && o[2] >= b[0][2] - 4 && o[2] <= b[1][2];
  const restricted = (o) => inBox(o, HD.restricted);
  const doorByName = (n) => H.doors.find((d) => d.name === n);
  const ev = (e, only) => api.pushEvent(e, only);

  // ---------------------------------------------------------------- planning
  H.join = (p) => {
    p.team = 'crew';
    p.hk = { role: pickRole(p), ready: false, masked: H.phase === 'heist' && H.approach === 'loud', bag: false, keycard: false, act: null, regenAt: 0 };
    if (!H.host || !R.players.has(H.host)) H.host = p.id;
    H.sendPlan();
  };
  function pickRole(p) {
    const taken = new Set(crew().filter((o) => o !== p && o.hk).map((o) => o.hk.role));
    return Object.keys(ROLES).find((r) => !taken.has(r)) || 'enforcer';
  }
  H.leave = (p) => {
    if (p.hk?.bag) dropBag(p, false);
    if (p.hk?.keycard) dropCard(p);
    if (H.host === p.id) H.host = crew().find((o) => o !== p)?.id || 0;
    setTimeout(() => H.sendPlan(), 0);
  };
  H.planState = () => ({
    t: 'heist', k: 'plan', phase: H.phase, host: H.host, difficulty: H.difficulty, approach: H.approach, code: R.code, private: R.settings.private, map: R.map.id, title: HD.title || 'The Bank Job',
    crew: crew().map((p) => ({ id: p.id, name: p.name, role: p.hk?.role, ready: !!p.hk?.ready })), result: H.result,
  });
  H.sendPlan = () => api.plan(H.planState());
  // planning messages from a crew member
  H.message = (p, m) => {
    if (!p.hk) return;
    if (m.k === 'role' && ROLES[m.role] && H.phase === 'planning') {
      // one of each role while there are roles to go round
      if (crew().some((o) => o !== p && o.hk?.role === m.role)) return;
      p.hk.role = m.role;
      p.hk.ready = false;
    } else if (m.k === 'ready' && H.phase === 'planning') p.hk.ready = !!m.ready;
    else if (m.k === 'set' && p.id === H.host && H.phase === 'planning') {
      if (DIFFICULTIES.includes(m.difficulty)) H.difficulty = m.difficulty;
      if (m.approach === 'stealth' || m.approach === 'loud') H.approach = m.approach;
      for (const o of crew()) if (o.hk) o.hk.ready = false;
    } else if (m.k === 'start' && p.id === H.host && H.phase === 'planning') {
      const c = crew();
      if (c.length < 2) return ev({ e: 'hk', k: 'msg', text: 'You need at least 2 robbers. Invite friends with the code, or wait for the crew search.' }, p.id);
      if (c.some((o) => !o.hk.ready && o !== p)) return ev({ e: 'hk', k: 'msg', text: 'Everyone has to be ready first.' }, p.id);
      start();
    }
    H.sendPlan();
  };

  // ---------------------------------------------------------------- the job
  function resetWorld() {
    for (const d of H.doors) { d.open = false; d.tmpUntil = 0; world().setEnabled(d.box, true); }
    H.npcs.clear();
    H.bodies = [];
    H.intel.clear();
    H.alarm = false; H.alarmWhy = ''; H.policeAt = Infinity; H.assault = null; H.nextSquad = 0;
    H.camsLooped = false; H.wiresCut = false;
    H.vault = { open: false, prog: 0, drill: false, jam: false, jamAt: 0 };
    H.keycards = [{ id: 1, o: HD.keycard.slice(), holder: 0, up: true }];
    H.carts = HD.carts.map((o, i) => ({ i, o, taken: false }));
    H.boxes = HD.boxes.map((o, i) => ({ i, o, taken: false }));
    H.bags = [];
    H.secured = 0; H.cash = 0; H.kills = 0; H.civKills = 0; H.escapeProg = 0;
  }

  function start() {
    resetWorld();
    const d = di();
    H.phase = 'heist';
    H.startAt = R.time;
    H.result = null;
    H.cams = HD.cameras.filter((c) => (c.min || 0) <= d).map((c, i) => ({ i, o: c.o, base: c.yaw, sweep: c.sweep, yaw: c.yaw, det: new Map(), seen: null }));
    HD.guards.filter((g) => (g.min || 0) <= d).forEach((g) => spawnGuard(g));
    HD.staff.filter((s) => (s.min || 0) <= d).forEach((s) => spawnCiv(s));
    for (const p of crew()) {
      p.hk.masked = H.approach === 'loud';
      p.hk.bag = false; p.hk.keycard = false; p.hk.act = null; p.hk.ready = false;
      p.frags = 0; p.deaths = 0;
      api.respawn(p);
    }
    ev({ e: 'hk', k: 'start', approach: H.approach, difficulty: H.difficulty });
    // going in loud: the alarm goes off a moment after you walk in
    H.loudAt = H.approach === 'loud' ? R.time + 25 : 0;
    H.sendPlan();
  }

  function finish(success, why) {
    if (H.phase !== 'heist') return;
    H.phase = 'over';
    H.overAt = R.time + 14;
    const d = di();
    const stealth = !H.alarm;
    let total = success ? H.secured * bagCash + H.cash - H.civKills * CIV_PENALTY : 0;
    total = Math.max(0, Math.round(total * DIFF.payout[d] * (stealth ? 1.5 : 1)));
    const each = crew().length ? Math.round(total / crew().length) : 0;
    const coins = Math.round(each / 1000);
    // the real pay: free roam cash for everyone in the crew (the job decides how much)
    const reward = success ? Math.round((HD.reward || 20000) * (stealth ? 1.25 : 1)) : 0;
    for (const p of crew()) {
      if (coins > 0) api.award(p, coins, 'heist');
      if (reward) api.cash?.(p, reward);
      api.stat(p, { heists: success ? 1 : 0, matches: 1, wins: success ? 1 : 0 });
    }
    H.result = { success, why, total, each, coins, reward, stealth: stealth && success, bags: H.secured, boxes: H.boxes.filter((b) => b.taken).length, kills: H.kills, civs: H.civKills, time: Math.round(R.time - H.startAt), difficulty: H.difficulty };
    ev({ e: 'hk', k: 'over', ...H.result });
    H.sendPlan();
  }

  function backToPlanning() {
    resetWorld();
    H.phase = 'planning';
    H.cams = [];
    for (const p of crew()) { p.hk.masked = false; p.hk.ready = false; p.hk.bag = false; p.hk.keycard = false; api.respawn(p); }
    H.sendPlan();
  }

  // ---------------------------------------------------------------- the alarm and the police
  function raiseAlarm(why) {
    if (H.alarm || H.phase !== 'heist') return;
    H.alarm = true;
    H.alarmAt = R.time;
    H.alarmWhy = why;
    H.policeAt = R.time + DIFF.police[di()] + (H.wiresCut ? 30 : 0);
    // a hack in progress turns into the drill
    if (!H.vault.open && H.vault.prog > 0) H.vault.prog *= 0.5;
    for (const n of H.npcs.values()) {
      if (n.kind === 'civ') { if (n.state !== 'tied' && n.state !== 'dead') setCiv(n, 'cower'); }
      else if (n.state !== 'dead') { n.state = 'combat'; n.react = R.time + 0.3; }
    }
    // what any guard knew, everyone knows now
    for (const n of H.npcs.values()) if (n.kind === 'guard') for (const [pid, lvl] of n.det) if (lvl > 0.3) { const p = R.players.get(pid); if (p) know(p, p.ps.origin); }
    ev({ e: 'hk', k: 'alarm', why });
  }

  function know(p, pos) {
    H.intel.set(p.id, { pos: pos.slice(), at: R.time });
  }

  function policeThink() {
    const t = R.time, d = di();
    if (!H.alarm || t < H.policeAt) return;
    if (!H.assault) { H.assault = { phase: 'assault', until: t + [80, 100, 120][d], wave: 1 }; ev({ e: 'hk', k: 'assault', wave: 1 }); }
    const A = H.assault;
    if (t >= A.until) {
      if (A.phase === 'assault') { A.phase = 'break'; A.until = t + [40, 30, 22][d]; ev({ e: 'hk', k: 'break' }); }
      else { A.phase = 'assault'; A.wave++; A.until = t + [80, 100, 120][d]; ev({ e: 'hk', k: 'assault', wave: A.wave }); }
    }
    if (A.phase !== 'assault' || t < H.nextSquad) return;
    const n = crew().length;
    const cap = Math.round(DIFF.maxPolice[d] + DIFF.perPlayer[d] * n + (A.wave - 1));
    const alive = [...H.npcs.values()].filter((x) => x.kind === 'police' || x.kind === 'swat').length;
    if (alive >= cap) return;
    H.nextSquad = t + rnd(4, 8) / (1 + 0.2 * (A.wave - 1));
    spawnSquad(Math.min(cap - alive, 3 + (d === 2 && Math.random() < 0.4 ? 1 : 0)));
    // the police always roughly know where you are
    for (const p of standing()) if (!H.intel.has(p.id) || t - H.intel.get(p.id).at > 8) know(p, [p.ps.origin[0] + rnd(-250, 250), p.ps.origin[1] + rnd(-250, 250), p.ps.origin[2]]);
  }

  function spawnSquad(count) {
    const eyes = standing().map((p) => [p.ps.origin[0], p.ps.origin[1], p.ps.origin[2] + 64]);
    const spots = HD.police.map((o) => ({ o, near: Math.min(...eyes.map((e) => dist2(e, o)), 1e9), seen: eyes.some((e) => world().trace(e, [o[0], o[1], o[2] + 40], [0, 0, 0], [0, 0, 0], MASK_SHOT).fraction === 1) }));
    const ok = spots.filter((s) => !s.seen && s.near > 700);
    const pick = (ok.length ? ok : spots)[(Math.random() * (ok.length || spots.length)) | 0];
    const squad = { id: H.nextNpc, leader: 0 };
    for (let i = 0; i < count; i++) {
      const swat = di() === 2 && Math.random() < 0.35;
      const o = [pick.o[0] + (i % 2) * 40 - 20, pick.o[1] + (i >> 1) * 40 - 20, pick.o[2]];
      const n = makeNpc(swat ? 'swat' : 'police', o, Math.atan2(-o[1], -o[0]) * D);
      n.squad = squad;
      n.role = i === 1 ? 'flank' : i === 3 ? 'flank' : 'assault';
      n.state = 'combat';
      n.react = R.time + 0.5;
      if (!squad.leader) squad.leader = n.id;
    }
  }

  // ---------------------------------------------------------------- NPCs
  function makeNpc(kind, o, yaw) {
    const ps = newPlayerState([o[0], o[1], (o[2] || 0) + 1]);
    ps.alive = true;
    ps.time = 0;
    const d = di();
    const hp = kind === 'guard' ? DIFF.guardHp[d] : kind === 'police' ? DIFF.policeHp[d] : kind === 'swat' ? DIFF.swatHp[d] : 35;
    const n = {
      id: -(H.nextNpc++), isNpc: true, kind, ps, hp, maxHp: hp, yaw, pitch: 0, state: 'idle', det: new Map(),
      gun: GUNS[kind] || null, clip: GUNS[kind]?.clip || 0, reloadUntil: 0, nextShot: 0, burstLeft: 0, react: 0,
      path: null, pathAt: -9, pathGoal: null, goal: null, walk: true, duck: false, aimYaw: yaw, aimPitch: 0,
      target: 0, lkp: null, lkpAt: -99, cover: null, coverAt: -99, coverPhase: 'hide', coverUntil: 0, retreatAt: -99,
      suppress: 0, searchPts: null, stuckPos: null, stuckAt: 0, stuckN: 0, jump: false, alertUntil: 0, radioAt: 0, radioPos: null,
      routeI: 0, waitUntil: 0, lookUntil: 0, lookYaw: yaw, susp: 0, suspPos: null, thinkAt: Math.random() * 0.1, seen: [],
    };
    H.npcs.set(n.id, n);
    return n;
  }
  function spawnGuard(g) {
    const o = g.o ? [g.o[0], g.o[1], 0] : [g.route[0][0], g.route[0][1], 0];
    const n = makeNpc('guard', o, g.yaw ?? 0);
    n.home = g;
    n.state = g.post ? 'post' : 'patrol';
    n.cams = !!g.cams;
    if (g.captain) { n.keycard = true; }
    return n;
  }
  function spawnCiv(s) {
    const n = makeNpc('civ', [s.o[0], s.o[1], 0], s.yaw ?? Math.random() * 360);
    n.home = s;
    n.civKind = s.kind;
    n.state = s.route ? 'wander' : 'idle';
    return n;
  }
  function setCiv(n, state, until = 0) {
    n.state = state;
    n.stateUntil = until;
    n.path = null;
  }

  H.alive = () => [...H.npcs.values()].filter((n) => n.state !== 'dead');

  // shot, hit with a crowbar or caught in a blast
  H.hurt = (n, attacker, dmg, weapon, head, dir) => {
    if (n.state === 'dead') return;
    const W = WEAPONS[WEAPON_INDEX[weapon]];
    // a crowbar from behind on someone who hasn't noticed you: a silent takedown
    if (W?.melee && attacker && n.kind !== 'civ') {
      const behind = Math.abs(angDiff(n.yaw, Math.atan2(attacker.ps.origin[1] - n.ps.origin[1], attacker.ps.origin[0] - n.ps.origin[0]) * D)) > 100;
      const unaware = n.state !== 'combat' && n.state !== 'alerted';
      if (unaware && (behind || attacker.hk?.role === 'infiltrator')) dmg = n.hp;
    }
    if (n.kind === 'swat' && !head) dmg *= 0.7; // body armour
    n.hp -= dmg;
    if (dir) { n.ps.velocity[0] += dir[0] * Math.min(150, dmg * 3); n.ps.velocity[1] += dir[1] * Math.min(150, dmg * 3); }
    if (n.hp <= 0) return die(n, attacker, head, dir);
    ev({ e: 'hhurt', id: n.id });
    n.suppress = Math.min(3, n.suppress + 0.8);
    // anyone hurt knows exactly where it came from
    if (attacker) { know(attacker, attacker.ps.origin); n.lkp = attacker.ps.origin.slice(); n.lkpAt = R.time; n.target = attacker.id; }
    if (n.kind === 'civ') { if (n.state !== 'tied') setCiv(n, 'panic'); return; }
    if (!H.alarm) {
      // shot but standing: no doubt left
      n.state = 'alerted';
      n.alertWhy = 'shot';
      n.radioAt = 0;
    }
    if (n.cover) n.coverUntil = Math.min(n.coverUntil, R.time + 0.2), n.coverPhase = 'hide';
  };

  function die(n, attacker, head, dir) {
    n.state = 'dead';
    n.hp = 0;
    H.npcs.delete(n.id);
    H.bodies.push({ o: n.ps.origin.slice(), kind: n.kind, at: R.time, found: H.alarm });
    if (attacker && attacker.hk) {
      if (n.kind === 'civ') { H.civKills++; ev({ e: 'hk', k: 'msg', text: `A civilian died: -$${CIV_PENALTY.toLocaleString()}` }); } else { H.kills++; attacker.frags++; }
    }
    if (n.keycard) H.keycards.push({ id: H.keycards.length + 1, o: [n.ps.origin[0], n.ps.origin[1], n.ps.origin[2] + 4], holder: 0, up: true });
    ev({ e: 'hdie', id: n.id, o: n.ps.origin.map(Math.round), y: Math.round(n.yaw), vv: [...(dir || [0, 0, 0]).map((v) => Math.round(v * 200)), 60], hs: head ? 1 : 0, k: n.kind });
    // a loud death (gunfire) is handled by the noise; a scream from a civilian alerts guards nearby
    if (n.kind === 'civ' && !H.alarm) noise(n.ps.origin, 500, 'scream');
  }

  // a sound the guards may hear: they come to look, or (close and loud) know something's wrong
  function noise(o, radius, kind) {
    if (H.alarm || radius <= 0) return;
    for (const n of H.npcs.values()) {
      if (n.state === 'dead' || n.kind === 'police' || n.kind === 'swat') continue;
      let d = dist3(n.ps.origin, o);
      // through walls sounds carry less far
      if (world().trace([n.ps.origin[0], n.ps.origin[1], n.ps.origin[2] + 60], [o[0], o[1], o[2] + 40], [0, 0, 0], [0, 0, 0], MASK_SHOT).fraction < 1) d *= 1.7;
      if (d > radius) continue;
      if (n.kind === 'civ') { if (n.state !== 'tied' && n.state !== 'down' && n.state !== 'dead' && kind !== 'step') setCiv(n, 'panic'); continue; }
      if (kind === 'gunshot' && d < radius * 0.45) { n.state = 'alerted'; n.alertWhy = 'gunshots'; n.radioAt = 0; n.lkp = o.slice(); n.lkpAt = R.time; continue; }
      if (n.state === 'alerted') continue;
      n.state = 'investigate';
      n.suspPos = o.slice();
      n.goal = o.slice();
      n.path = null;
      n.investigateUntil = R.time + 14;
      n.susp = Math.max(n.susp, 0.5);
      n.lookYaw = Math.atan2(o[1] - n.ps.origin[1], o[0] - n.ps.origin[0]) * D;
    }
  }

  // a player fired: noise for the guards
  H.shot = (p, wi, start) => {
    const W = WEAPONS[wi];
    if (!W) return;
    let r = NOISE[W.id] ?? 800;
    if (W.id === 'pistol' && p.hk?.role === 'infiltrator') r = 160; // silenced
    if (H.phase === 'heist') noise(start, r, 'gunshot');
  };
  // a bullet's path: anyone it passed close to keeps their head down
  H.whiz = (start, end) => {
    for (const n of H.npcs.values()) {
      if (n.kind === 'civ') continue;
      const c = [n.ps.origin[0], n.ps.origin[1], n.ps.origin[2] + 40];
      const ab = [end[0] - start[0], end[1] - start[1], end[2] - start[2]], ac = [c[0] - start[0], c[1] - start[1], c[2] - start[2]];
      const L = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2] || 1;
      const t = Math.max(0, Math.min(1, (ac[0] * ab[0] + ac[1] * ab[1] + ac[2] * ab[2]) / L));
      const q = [start[0] + ab[0] * t - c[0], start[1] + ab[1] * t - c[1], start[2] + ab[2] * t - c[2]];
      if (Math.hypot(...q) < 110) n.suppress = Math.min(3, n.suppress + 0.35);
    }
  };
  H.blast = (o) => noise(o, 1800, 'gunshot');

  // ---------------------------------------------------------------- senses
  const eyeOf = (n) => [n.ps.origin[0], n.ps.origin[1], n.ps.origin[2] + (n.ps.ducked ? 28 : 64)];
  function canSee(from, p) {
    const o = p.ps.origin;
    const tops = [o[2] + (p.ps.ducked ? 30 : 60), o[2] + (p.ps.ducked ? 16 : 36)];
    for (const z of tops) if (world().trace(from, [o[0], o[1], z], [0, 0, 0], [0, 0, 0], MASK_SHOT).fraction === 1) return true;
    return false;
  }

  // one look around for an NPC: who's visible, and (quietly) how sure it is about each
  function perceive(n, dt) {
    const e = eyeOf(n), d = di();
    n.seen = [];
    const combat = n.state === 'combat' || n.kind === 'police' || n.kind === 'swat';
    for (const p of crew()) {
      if (!p.ps.alive) { n.det.delete(p.id); continue; }
      const o = p.ps.origin;
      const dist = dist3(e, [o[0], o[1], o[2] + 40]);
      const range = combat ? 3000 : n.kind === 'civ' ? 1100 : 1500;
      const ang = Math.abs(angDiff(n.yaw, Math.atan2(o[1] - e[1], o[0] - e[0]) * D));
      const fov = combat ? 140 : n.kind === 'civ' ? 80 : 62;
      let vis = dist < range && (ang < fov || dist < 90) && canSee(e, p);
      if (p.ps.downed && combat) vis = false; // nobody bothers with the downed
      if (vis) n.seen.push({ p, dist, ang });
      if (combat || H.alarm) continue;
      // the detection meter
      let lvl = n.det.get(p.id) || 0;
      if (vis) {
        const masked = p.hk?.masked;
        const trespass = restricted(o) && n.kind !== 'civ';
        const bad = masked || trespass || (p.hk?.bag) || (!masked && n.kind === 'civ' && false);
        if (bad) {
          let rate = (masked ? 1.35 : 0.55) * Math.pow(Math.max(0, 1 - dist / range), 0.6) * 2.4;
          if (ang > 40) rate *= 0.45; // edge of vision
          if (p.ps.ducked) rate *= 0.6;
          const sp = Math.hypot(p.ps.velocity[0], p.ps.velocity[1]);
          if (sp > 250) rate *= 1.35; else if (sp < 20) rate *= 0.85;
          if (p.hk?.role === 'infiltrator') rate *= 0.65;
          if (n.kind === 'civ') rate *= masked ? 1.4 : 0;
          if (dist < 160) rate *= 2.5;
          lvl = Math.min(1, lvl + rate * DIFF.detect[d] * dt);
        } else lvl = Math.max(0, lvl - 0.35 * dt);
      } else lvl = Math.max(0, lvl - 0.2 * dt);
      if (lvl > 0) n.det.set(p.id, lvl); else n.det.delete(p.id);
      if (lvl > 0.12) { n.suspPos = o.slice(); n.suspAt = R.time; }
      if (lvl >= 1) spotted(n, p);
    }
    // bodies and tied-up staff: proof enough
    if (!H.alarm && n.kind === 'guard' && n.state !== 'alerted') {
      for (const b of H.bodies) {
        if (b.found || dist3(e, b.o) > 1000) continue;
        const ang = Math.abs(angDiff(n.yaw, Math.atan2(b.o[1] - e[1], b.o[0] - e[0]) * D));
        if (ang < 70 && world().trace(e, [b.o[0], b.o[1], b.o[2] + 10], [0, 0, 0], [0, 0, 0], MASK_SHOT).fraction === 1) { b.found = true; n.state = 'alerted'; n.alertWhy = 'a body'; n.radioAt = 0; n.lkp = b.o.slice(); break; }
      }
      for (const c of H.npcs.values()) {
        if (c.kind !== 'civ' || (c.state !== 'tied' && c.state !== 'down') || c.spottedBy) continue;
        if (dist3(e, c.ps.origin) > 900) continue;
        const ang = Math.abs(angDiff(n.yaw, Math.atan2(c.ps.origin[1] - e[1], c.ps.origin[0] - e[0]) * D));
        if (ang < 60 && world().trace(e, [c.ps.origin[0], c.ps.origin[1], c.ps.origin[2] + 20], [0, 0, 0], [0, 0, 0], MASK_SHOT).fraction === 1) { c.spottedBy = n.id; n.state = 'alerted'; n.alertWhy = 'hostages'; n.radioAt = 0; n.lkp = c.ps.origin.slice(); }
      }
    }
  }

  function spotted(n, p) {
    if (n.kind === 'civ') {
      if (n.state === 'idle' || n.state === 'wander' || n.state === 'suspicious') { setCiv(n, 'panic'); ev({ e: 'hk', k: 'civ', id: n.id, s: 'panic' }); }
      return;
    }
    // unmasked and somewhere you shouldn't be: a warning first
    if (!p.hk.masked && !p.hk.bag && !(p.hk.warned > R.time - 20)) {
      p.hk.warned = R.time;
      n.det.set(p.id, 0.45);
      ev({ e: 'hk', k: 'warn', id: n.id, pid: p.id }, p.id);
      return;
    }
    n.state = 'alerted';
    n.alertWhy = p.hk.masked ? 'a masked robber' : 'a trespasser';
    n.radioAt = 0;
    n.target = p.id;
    n.lkp = p.ps.origin.slice();
    n.lkpAt = R.time;
  }

  // cameras: a sweeping cone; what they see goes to the guard watching the monitors
  function camerasThink(dt) {
    if (H.alarm || H.camsLooped) { for (const c of H.cams) c.det.clear(); return; }
    const watcher = [...H.npcs.values()].find((n) => n.cams && n.state !== 'dead');
    for (const c of H.cams) {
      c.yaw = c.base + Math.sin((R.time / 7 + c.i) * Math.PI) * c.sweep;
      if (!watcher) { c.det.clear(); continue; }
      for (const p of crew()) {
        let lvl = c.det.get(p.id) || 0;
        const o = p.ps.origin;
        const dist = dist3(c.o, o);
        const ang = Math.abs(angDiff(c.yaw, Math.atan2(o[1] - c.o[1], o[0] - c.o[0]) * D));
        const bad = p.ps.alive && (p.hk?.masked || p.hk?.bag || restricted(o));
        if (bad && dist < 1100 && ang < 28 && canSee(c.o, p)) {
          lvl = Math.min(1, lvl + (p.hk.masked ? 1 : 0.45) * (1 - dist / 1300) * 1.8 * DIFF.detect[di()] * (p.hk.role === 'infiltrator' ? 0.7 : 1) * dt);
        } else lvl = Math.max(0, lvl - 0.25 * dt);
        if (lvl > 0) c.det.set(p.id, lvl); else c.det.delete(p.id);
        if (lvl >= 1 && watcher.state !== 'alerted') {
          watcher.state = 'alerted';
          watcher.alertWhy = 'the cameras';
          watcher.radioAt = 0;
          watcher.lkp = o.slice();
          ev({ e: 'hk', k: 'cam', i: c.i });
        }
      }
    }
  }

  // ---------------------------------------------------------------- moving an NPC
  // open(d): can this NPC pass door d? Guards and police have keys to the staff and back doors.
  function npcOpen(n) {
    return (i) => H.doors[i].open || (n.kind !== 'civ' && H.doors[i].name !== 'vault');
  }
  function steer(n, goal, dt, { run = false, face = null, duck = false } = {}) {
    const ps = n.ps, t = R.time;
    let moveDir = null;
    if (goal) {
      const far = dist2(ps.origin, goal);
      if (far > 24) {
        // plan again when the goal moves, now and then anyway, but not over and over for somewhere we can't get to
        const moved = !n.pathGoal || dist2(n.pathGoal, goal) > 40;
        if ((moved || !n.path || t - n.pathAt > 1.6) && t >= (n.noPathUntil || 0) && t - n.pathAt > (moved ? 0.25 : 0)) {
          n.pathAt = t;
          n.pathGoal = goal.slice();
          n.path = findPath(nav, nearestNode(nav, ps.origin, true), nearestNode(nav, goal, true), npcOpen(n), 6000);
          if (!n.path) n.noPathUntil = t + 2 + Math.random();
        }
        while (n.path && n.path.length > 1 && Math.hypot(n.path[0].x - ps.origin[0], n.path[0].y - ps.origin[1]) < 26) n.path.shift();
        const wp = n.path && n.path[Math.min(1, n.path.length - 1)];
        const to = wp ? [wp.x, wp.y] : goal;
        moveDir = Math.atan2(to[1] - ps.origin[1], to[0] - ps.origin[0]);
        if (wp && wp.z - ps.origin[2] > 18 && ps.onGround) n.jump = true;
      }
    }
    // doors in the way: guards and police use their cards
    for (const d of H.doors) {
      if (d.open || d.name === 'vault' || n.kind === 'civ') continue;
      const c = [(d.mins[0] + d.maxs[0]) / 2, (d.mins[1] + d.maxs[1]) / 2];
      if (Math.hypot(c[0] - ps.origin[0], c[1] - ps.origin[1]) < 70) openDoor(d, true);
    }
    const wantYaw = face !== null ? face : moveDir !== null ? moveDir * D : n.lookYaw ?? n.yaw;
    const turn = (n.state === 'combat' ? 540 : 220) * dt;
    n.yaw += Math.max(-turn, Math.min(turn, angDiff(n.yaw, wantYaw)));
    n.yaw = ((n.yaw % 360) + 360) % 360;
    const cmd = { fwd: 0, side: 0, buttons: 0, yaw: n.yaw, pitch: n.pitch };
    if (moveDir !== null) {
      const rel = moveDir - n.yaw / D;
      cmd.fwd = Math.cos(rel);
      cmd.side = -Math.sin(rel);
      cmd.buttons |= run ? (n.kind === 'civ' || dist2(ps.origin, goal) > 500 ? BTN.SPRINT : 0) : BTN.WALK;
      // stuck: jump, then find another way
      if (!n.stuckPos || t - n.stuckAt > 0.8) {
        if (n.stuckPos && dist2(ps.origin, n.stuckPos) < 10) { n.jump = true; if (++n.stuckN > 3) { n.path = null; n.stuckN = 0; } } else n.stuckN = 0;
        n.stuckPos = ps.origin.slice();
        n.stuckAt = t;
      }
    }
    if (duck) cmd.buttons |= BTN.DUCK;
    if (n.jump && ps.onGround && !ps.jumpHeld) { cmd.buttons |= BTN.JUMP; n.jump = false; }
    // a little personal space
    for (const o of H.npcs.values()) {
      if (o === n) continue;
      const dx = ps.origin[0] - o.ps.origin[0], dy = ps.origin[1] - o.ps.origin[1], dd = Math.hypot(dx, dy);
      if (dd > 0.1 && dd < 30) { const rel = Math.atan2(dy, dx) - n.yaw / D; cmd.fwd += Math.cos(rel) * 0.4; cmd.side -= Math.sin(rel) * 0.4; }
    }
    pmove(world(), ps, cmd, dt, R.rules);
    ps.time += dt;
    return moveDir === null; // arrived
  }

  function openDoor(d, temporary) {
    if (d.open && !temporary) return;
    if (!d.open || d.tmpUntil) {
      if (!temporary) { d.open = true; d.tmpUntil = 0; } else if (!d.open) { d.open = true; d.tmpUntil = R.time + 2.2; } else d.tmpUntil = Math.max(d.tmpUntil, R.time + 2.2);
      world().setEnabled(d.box, false);
      ev({ e: 'hk', k: 'door', i: d.i, open: 1 });
    }
  }
  function doorsThink() {
    for (const d of H.doors) {
      if (!d.tmpUntil || R.time < d.tmpUntil) continue;
      // don't shut it on anyone standing in the doorway
      const busy = [...crew().map((p) => p.ps), ...[...H.npcs.values()].map((n) => n.ps)].some((ps) => ps.origin[0] + 16 > d.mins[0] - 4 && ps.origin[0] - 16 < d.maxs[0] + 4 && ps.origin[1] + 16 > d.mins[1] - 4 && ps.origin[1] - 16 < d.maxs[1] + 4);
      if (busy) { d.tmpUntil = R.time + 0.5; continue; }
      d.open = false;
      d.tmpUntil = 0;
      world().setEnabled(d.box, true);
      ev({ e: 'hk', k: 'door', i: d.i, open: 0 });
    }
  }

  // ---------------------------------------------------------------- guards before the alarm
  function guardCalm(n, dt) {
    const t = R.time, g = n.home;
    // suspicion: stop and stare at whatever's filling the meter
    let top = 0, who = null;
    for (const [pid, lvl] of n.det) if (lvl > top) { top = lvl; who = pid; }
    if (top > 0.15 && n.suspPos) {
      if (top > 0.55 && n.state !== 'investigate') { n.state = 'investigate'; n.goal = n.suspPos.slice(); n.investigateUntil = t + 12; n.path = null; }
      if (n.state !== 'investigate') {
        steer(n, null, dt, { face: Math.atan2(n.suspPos[1] - n.ps.origin[1], n.suspPos[0] - n.ps.origin[0]) * D });
        n.susp = top;
        return;
      }
    }
    if (n.state === 'investigate') {
      // walk over to have a look; then search around for a bit
      if (n.suspPos && n.suspAt > t - 1) n.goal = n.suspPos.slice();
      const there = steer(n, n.goal, dt, { run: top > 0.6 });
      if (there) {
        if (!n.searchPts) {
          const near = nav.nodes.filter((m) => Math.hypot(m.x - n.goal[0], m.y - n.goal[1]) < 260 && Math.abs(m.z - n.goal[2]) < 60);
          n.searchPts = [0, 1, 2].map(() => near[(Math.random() * near.length) | 0]).filter(Boolean).map((m) => [m.x, m.y, m.z]);
          n.lookUntil = t + 1.5;
        } else if (t > n.lookUntil && n.searchPts.length) { n.goal = n.searchPts.shift(); n.lookUntil = t + 2.5; }
        else n.lookYaw = n.yaw + Math.sin(t * 2) * 60;
      }
      if (t > n.investigateUntil || (!n.searchPts?.length && t > n.lookUntil + 2)) { n.state = n.home?.post ? 'post' : 'patrol'; n.searchPts = null; n.susp = 0; n.path = null; }
      return;
    }
    if (n.state === 'post') {
      const o = n.home.o;
      if (dist2(n.ps.origin, o) > 30) { steer(n, [o[0], o[1], 0], dt); return; }
      // looking around from the post
      if (t > n.lookUntil) { n.lookUntil = t + rnd(2.5, 6); const [a, b] = g.look || [g.yaw - 40, g.yaw + 40]; n.lookYaw = rnd(a, b); }
      steer(n, null, dt);
      return;
    }
    // patrol: walk the route, pausing and glancing around at each corner
    const r = g.route;
    const wp = r[n.routeI % r.length];
    if (t < n.waitUntil) { if (t > n.lookUntil) { n.lookUntil = t + rnd(1, 2.2); n.lookYaw = n.yaw + rnd(-80, 80); } steer(n, null, dt); return; }
    if (steer(n, [wp[0], wp[1], 0], dt)) { n.routeI++; n.waitUntil = t + rnd(1, 3.5); }
  }

  // alerted, alarm not raised yet: get to an alarm panel, or call it in on the radio. Killing them in time stops it.
  function guardAlerted(n, dt) {
    const t = R.time;
    if (n.alertedAt === undefined || n.alertedAt < (n.calmAt || -1)) {
      // just became sure: run for the nearest alarm panel, or get on the radio (once, not every tick)
      n.alertedAt = t;
      const panel = !H.wiresCut && HD.alarms.map((a) => ({ a, d: dist2(a, n.ps.origin) })).sort((x, y) => x.d - y.d)[0];
      n.radioPos = panel && panel.d < 700 ? panel.a : null;
      n.radioAt = t + (n.radioPos ? 9 : DIFF.radioTime[di()]);
      ev({ e: 'hk', k: 'alert', id: n.id, why: n.alertWhy || 'something', panel: n.radioPos ? 1 : 0 });
    }
    if (n.radioPos) {
      if (steer(n, n.radioPos, dt, { run: true })) raiseAlarm(`A guard hit the alarm (${n.alertWhy})`);
      if (t > n.radioAt) raiseAlarm(`A guard raised the alarm (${n.alertWhy})`);
    } else {
      // on the radio: standing still, facing the trouble
      const face = n.lkp ? Math.atan2(n.lkp[1] - n.ps.origin[1], n.lkp[0] - n.ps.origin[0]) * D : null;
      steer(n, null, dt, { face });
      if (t > n.radioAt) raiseAlarm(`A guard radioed it in (${n.alertWhy})`);
    }
  }

  // ---------------------------------------------------------------- staff
  function civThink(n, dt) {
    const t = R.time;
    if (n.state === 'tied' || n.state === 'cower') { steer(n, null, dt, { duck: true }); return; }
    if (n.state === 'down') { steer(n, null, dt, { duck: true }); if (t > n.stateUntil) setCiv(n, H.alarm ? 'cower' : 'panic'); return; }
    // a masked robber pointing a gun at you: get down
    for (const p of standing()) {
      if (!p.hk?.masked) continue;
      const W = WEAPONS[p.ps.cur];
      if (W?.melee) continue;
      const to = [n.ps.origin[0] - p.ps.origin[0], n.ps.origin[1] - p.ps.origin[1], n.ps.origin[2] + 40 - (p.ps.origin[2] + 64)];
      const d = Math.hypot(...to);
      if (d > 750) continue;
      const aim = Math.abs(angDiff(p.yaw, Math.atan2(to[1], to[0]) * D));
      if (aim < Math.max(6, Math.atan2(30, d) * D) && canSee([p.ps.origin[0], p.ps.origin[1], p.ps.origin[2] + 64], { ps: n.ps })) {
        if (n.state !== 'down') ev({ e: 'hk', k: 'civ', id: n.id, s: 'down' });
        setCiv(n, 'down', t + 22);
        return;
      }
    }
    if (n.state === 'panic' || n.state === 'calling') {
      if (H.alarm) { setCiv(n, 'cower'); return; }
      // run to the nearest phone and call the police
      if (!n.phoneAt) n.phone = HD.phones.slice().sort((a, b) => dist2(a, n.ps.origin) - dist2(b, n.ps.origin))[0];
      if (n.state === 'panic' && steer(n, n.phone, dt, { run: true })) { n.state = 'calling'; n.callUntil = t + 5; ev({ e: 'hk', k: 'civ', id: n.id, s: 'calling' }); }
      if (n.state === 'calling') { steer(n, null, dt); if (t > n.callUntil) raiseAlarm('Someone called the police'); }
      return;
    }
    if (n.state === 'wander') {
      const r = n.home.route, wp = r[n.routeI % r.length];
      if (t < n.waitUntil) { steer(n, null, dt); return; }
      if (steer(n, [wp[0], wp[1], 0], dt)) { n.routeI++; n.waitUntil = t + rnd(3, 9); n.lookYaw = rnd(0, 360); }
      return;
    }
    steer(n, null, dt);
  }

  // ---------------------------------------------------------------- the fight
  function pickTarget(n) {
    const cur = n.seen.find((s) => s.p.id === n.target);
    let best = cur, bs = cur ? cur.dist * 0.7 : Infinity;
    for (const s of n.seen) {
      // closer, hurt, or looking at me: more of a threat
      const aimingAtMe = Math.abs(angDiff(s.p.yaw, Math.atan2(n.ps.origin[1] - s.p.ps.origin[1], n.ps.origin[0] - s.p.ps.origin[0]) * D)) < 12;
      const score = s.dist * (aimingAtMe ? 0.7 : 1) * (s.p.ps.hp < 40 ? 0.85 : 1) * (s.p.hk?.bag ? 0.8 : 1);
      if (score < bs) { bs = score; best = s; }
    }
    if (best && best.p.id !== n.target) { n.target = best.p.id; n.react = Math.max(n.react, R.time + DIFF.react[di()] * rnd(0.8, 1.3)); }
    return best ? best.p : null;
  }

  // the best nearby cover against a target: hidden from them crouched, with a spot next to it to peek from
  function findCover(n, tp, retreat) {
    const me = n.ps.origin, te = [tp.ps.origin[0], tp.ps.origin[1], tp.ps.origin[2] + 60];
    const radius = retreat ? 700 : 480;
    const claimed = new Set([...H.npcs.values()].filter((o) => o !== n && o.cover).map((o) => o.cover.node.i));
    // directions the others are already shooting from (flankers want a different one)
    const others = [...H.npcs.values()].filter((o) => o !== n && o.state === 'combat' && o.kind !== 'civ').map((o) => Math.atan2(o.ps.origin[1] - tp.ps.origin[1], o.ps.origin[0] - tp.ps.origin[0]));
    const cands = coverNodes(nav, world()).filter((c) => Math.abs(c.x - me[0]) < radius && Math.abs(c.y - me[1]) < radius && Math.abs(c.z - me[2]) < 120 && !claimed.has(c.i));
    cands.sort((a, b) => Math.hypot(a.x - me[0], a.y - me[1]) - Math.hypot(b.x - me[0], b.y - me[1]));
    let best = null, bs = -Infinity;
    for (const c of cands.slice(0, 48)) {
      const hidden = world().trace(te, [c.x, c.y, c.z + 26], [0, 0, 0], [0, 0, 0], MASK_SHOT).fraction < 1;
      if (!hidden) continue;
      const dT = Math.hypot(c.x - te[0], c.y - te[1]);
      if (!retreat && dT < 180) continue;
      // a neighbour (or its neighbour) to step out to, from where the target can be seen
      let peek = null;
      for (const j of c.n) {
        const a = nav.nodes[j];
        if (world().trace([a.x, a.y, a.z + 62], te, [0, 0, 0], [0, 0, 0], MASK_SHOT).fraction === 1) { peek = a; break; }
        for (const k of a.n) {
          const b = nav.nodes[k];
          if (Math.hypot(b.x - c.x, b.y - c.y) > 70) continue;
          if (world().trace([b.x, b.y, b.z + 62], te, [0, 0, 0], [0, 0, 0], MASK_SHOT).fraction === 1) { peek = b; break; }
        }
        if (peek) break;
      }
      if (!peek && !retreat) continue;
      let s = 0;
      s -= Math.hypot(c.x - me[0], c.y - me[1]) * 0.9; // how far to run
      s -= Math.abs(dT - (n.kind === 'guard' ? 420 : 520)) * 0.5; // a good range
      if (retreat) s += Math.min(dT, 900) * 0.9;
      if (peek) s += 150;
      if (n.role === 'flank' && others.length) {
        const ang = Math.atan2(c.y - te[1], c.x - te[0]);
        const spread = Math.min(...others.map((a) => Math.abs(angDiff(a * D, ang * D))));
        s += spread * 3;
      }
      if (s > bs) { bs = s; best = { node: c, peek, o: [c.x, c.y, c.z] }; }
    }
    return best;
  }

  function combatThink(n, dt) {
    const t = R.time, d = di();
    n.suppress = Math.max(0, n.suppress - dt * 0.6);
    const tp = pickTarget(n);
    if (tp) { n.lkp = tp.ps.origin.slice(); n.lkpAt = t; know(tp, tp.ps.origin); }
    // no one in sight: what the radio says
    if (!tp) {
      let best = null;
      for (const [pid, it] of H.intel) {
        const p = R.players.get(pid);
        if (!p || !p.ps.alive || p.ps.downed || t - it.at > 30) continue;
        if (!best || dist2(it.pos, n.ps.origin) < dist2(best.pos, n.ps.origin)) best = it;
      }
      if (best && (!n.lkp || best.at > n.lkpAt)) { n.lkp = best.pos.slice(); n.lkpAt = best.at; }
    }
    const hpFrac = n.hp / n.maxHp;
    const W = n.gun;
    // reload in cover when empty
    if (n.clip <= 0 && !n.reloadUntil) { n.reloadUntil = t + W.reload; ev({ e: 'hk', k: 'reload', id: n.id }); }
    if (n.reloadUntil && t >= n.reloadUntil) { n.reloadUntil = 0; n.clip = W.clip; }

    if (tp) {
      // hurt: fall back to cover further away; otherwise rethink cover every few seconds or when it stops hiding us
      const retreat = hpFrac < 0.35 && t - n.retreatAt > 8;
      const stale = !n.cover || t - n.coverAt > (n.kind === 'guard' ? 6 : 4.5)
        || world().trace([tp.ps.origin[0], tp.ps.origin[1], tp.ps.origin[2] + 60], [n.cover.o[0], n.cover.o[1], n.cover.o[2] + 26], [0, 0, 0], [0, 0, 0], MASK_SHOT).fraction === 1;
      if (retreat || (stale && t - n.coverAt > 1)) {
        n.cover = findCover(n, tp, retreat);
        n.coverAt = t;
        n.coverPhase = 'go';
        if (retreat) n.retreatAt = t;
      }
      const aimYaw = Math.atan2(tp.ps.origin[1] - n.ps.origin[1], tp.ps.origin[0] - n.ps.origin[0]) * D;
      // outnumbering them and they're hurt or far: push
      const allies = [...H.npcs.values()].filter((o) => o.state === 'combat' && o.kind !== 'civ').length;
      const push = n.kind !== 'guard' && allies >= standing().length * 3 && n.suppress < 0.5 && hpFrac > 0.6 && Math.random() < 0.002;
      if (push) { n.cover = null; n.pushUntil = t + rnd(3, 6); }
      if (n.pushUntil > t || !n.cover) {
        // in the open: keep at a fighting distance and strafe while shooting
        const dist = dist2(n.ps.origin, tp.ps.origin);
        const want = n.pushUntil > t ? 150 : 450;
        const side = Math.sin(t * 1.3 + n.id) > 0 ? 1 : -1;
        const g = dist > want + 100 ? tp.ps.origin : [n.ps.origin[0] + Math.cos((aimYaw + 90 * side) / D) * 80, n.ps.origin[1] + Math.sin((aimYaw + 90 * side) / D) * 80, n.ps.origin[2]];
        steer(n, g, dt, { run: dist > want + 300, face: aimYaw });
        shoot(n, tp, dt);
        return;
      }
      // cover: run there, then take turns hiding and peeking out to shoot
      const c = n.cover;
      if (n.coverPhase === 'go') {
        if (steer(n, c.o, dt, { run: true, face: dist2(n.ps.origin, c.o) < 200 ? aimYaw : null })) { n.coverPhase = 'hide'; n.coverUntil = t + DIFF.hide[d] * rnd(0.6, 1.2); }
        if (n.seen.length) shoot(n, tp, dt); // shoot on the move when they're right there
        return;
      }
      if (n.coverPhase === 'hide') {
        steer(n, c.o, dt, { duck: true, face: aimYaw });
        if (t > n.coverUntil + n.suppress * 0.8 && !n.reloadUntil && c.peek) { n.coverPhase = 'peek'; n.coverUntil = t + DIFF.peek[d] * rnd(0.7, 1.3); }
        return;
      }
      // peeking
      steer(n, [c.peek.x, c.peek.y, c.peek.z], dt, { face: aimYaw });
      shoot(n, tp, dt);
      if (t > n.coverUntil || n.reloadUntil || n.suppress > 1.6) { n.coverPhase = 'hide'; n.coverUntil = t + DIFF.hide[d] * rnd(0.7, 1.3); }
      return;
    }

    // ---- nobody in sight
    n.cover = null;
    if (n.lkp && t - n.lkpAt < 25) {
      // go where they were last seen; flankers come round another way
      let goal = n.lkp;
      if (n.role === 'flank') {
        const a = Math.atan2(n.ps.origin[1] - n.lkp[1], n.ps.origin[0] - n.lkp[0]) + (n.id % 2 ? 1.4 : -1.4);
        const m = nearestNode(nav, [n.lkp[0] + Math.cos(a) * 260, n.lkp[1] + Math.sin(a) * 260, n.lkp[2]], true);
        if (m && dist2([m.x, m.y], n.ps.origin) > 120) goal = [m.x, m.y, m.z];
      }
      const there = steer(n, goal, dt, { run: dist2(n.ps.origin, goal) > 350, face: dist2(n.ps.origin, goal) < 350 ? Math.atan2(n.lkp[1] - n.ps.origin[1], n.lkp[0] - n.ps.origin[0]) * D : null });
      if (there) n.lkpAt -= dt * 3; // nothing here: lose interest faster
      return;
    }
    // no idea where anyone is: guards hold the back of the bank, police head for the vault and the van
    const fallback = n.kind === 'guard' ? (n.home?.o ? [n.home.o[0], n.home.o[1], 0] : [n.home?.route?.[0][0] || 0, n.home?.route?.[0][1] || 0, 0]) : (Math.floor(t / 20 + n.id) % 2 ? HD.panel : HD.van.o);
    steer(n, fallback, dt, { run: n.kind !== 'guard' });
  }

  // aim at the target (leading them a little) and fire bursts; aim error grows with range, their speed and suppression
  function shoot(n, tp, dt) {
    const t = R.time, d = di(), W = n.gun;
    if (!W || n.reloadUntil || t < n.react || t < n.nextShot || n.clip <= 0) return;
    const e = eyeOf(n);
    const dist = dist3(e, tp.ps.origin);
    const aimAt = [tp.ps.origin[0] + tp.ps.velocity[0] * Math.min(0.25, dist / 4000), tp.ps.origin[1] + tp.ps.velocity[1] * Math.min(0.25, dist / 4000), tp.ps.origin[2] + (tp.ps.ducked ? 22 : 42)];
    const want = Math.atan2(aimAt[1] - e[1], aimAt[0] - e[0]) * D;
    if (Math.abs(angDiff(n.yaw, want)) > 25) return; // still turning
    if (!canSee(e, tp)) return;
    const speed = Math.hypot(tp.ps.velocity[0], tp.ps.velocity[1]);
    const err = DIFF.spread[d] * (1 + speed / 380) * (1 + n.suppress * 0.6) * (1 + dist / 2200) * (n.burstLeft ? 1 : 1.25);
    const yaw = (want + gauss() * err) / D;
    const pitch = Math.atan2(aimAt[2] - e[2], Math.hypot(aimAt[0] - e[0], aimAt[1] - e[1])) + (gauss() * err * 0.6) / D;
    const dir = [Math.cos(pitch) * Math.cos(yaw), Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch)];
    const end = [e[0] + dir[0] * 4000, e[1] + dir[1] * 4000, e[2] + dir[2] * 4000];
    const tr = world().trace(e, end, [0, 0, 0], [0, 0, 0], MASK_SHOT);
    let hit = null;
    for (const p of crew()) {
      if (!p.ps.alive) continue;
      const r = hitTest(e, end, p.ps.origin, p.ps.ducked);
      if (r && r.frac < tr.fraction && (!hit || r.frac < hit.r.frac)) hit = { p, r };
    }
    const frac = hit ? hit.r.frac : tr.fraction;
    const hp = [e[0] + (end[0] - e[0]) * frac, e[1] + (end[1] - e[1]) * frac, e[2] + (end[2] - e[2]) * frac];
    ev({ e: 'shot', id: n.id, w: W.wi, s: e.map(Math.round), h: [[...hp.map(Math.round), hit ? hit.p.id : 0, hit ? 0 : tr.fraction < 1 ? 1 : 0, tr.normal.map((v) => +v.toFixed(2))]] });
    if (hit) api.damage(hit.p, W.dmg * DIFF.dmg[d] * (hit.r.head ? 1.6 : 1), dir, n.kind, hit.r.head);
    n.clip--;
    if (n.burstLeft > 0) n.burstLeft--;
    if (n.burstLeft <= 0) { n.burstLeft = Math.round(rnd(W.burst[0], W.burst[1])); n.nextShot = t + rnd(W.pause[0], W.pause[1]); } else n.nextShot = t + W.rate;
  }
  function gauss() {
    return (Math.random() + Math.random() + Math.random() - 1.5) / 0.75;
  }

  // ---------------------------------------------------------------- the robbers
  // E near something: what you'd do, and how long you hold E for it
  function action(p) {
    const o = p.ps.origin, hk = p.hk, role = hk.role;
    const near = (a, r = 70) => Math.hypot(a[0] - o[0], a[1] - o[1]) < r && Math.abs((a[2] || 0) - o[2]) < 90;
    // a downed teammate first
    for (const q of crew()) if (q !== p && q.ps.alive && q.ps.downed && near(q.ps.origin, 72)) return { key: 'revive:' + q.id, label: `Revive ${q.name}`, need: 3, q };
    // the van: leave once there's something to show for it
    if (near(HD.van.o, HD.van.r) && (H.secured > 0 || H.cash > 0)) return { key: 'escape', label: L.escape, need: 2 };
    if (!hk.masked) return null;
    for (const c of H.npcs.values()) {
      if (c.kind === 'civ' && c.state === 'down' && near(c.ps.origin, 80)) return { key: 'tie:' + c.id, label: 'Tie up', need: role === 'infiltrator' ? 0.8 : 1.6, c };
    }
    for (const k of H.keycards) if (k.up && near(k.o, 80)) return { key: 'card:' + k.id, label: L.keycard, need: 0.3, k };
    for (const b of H.bags) if (!hk.bag && near(b.o, 70)) return { key: 'bag:' + b.id, label: 'Pick up the bag', need: 0.3, b };
    const staff = doorByName('staff');
    if (!staff.open && HD.doorUse.staff.some((s) => near(s, 70))) return hk.keycard ? { key: 'staff', label: L.staff, need: 1 } : { key: 'nocard', label: L.nocard, need: Infinity };
    const back = doorByName('back');
    if (!back.open && HD.doorUse.back.some((s) => near(s, 70))) return { key: 'back', label: L.back, need: HD.backNeed || 0.5 };
    if (!H.camsLooped && !H.alarm && near(HD.terminal, 75)) return { key: 'cams', label: L.cams, need: role === 'hacker' ? 3 : 7 };
    if (!H.wiresCut && near(HD.wiring, 75)) return { key: 'wires', label: L.wires, need: 4 };
    if (!H.vault.open && near(HD.panel, 80)) {
      if (H.alarm) {
        if (!H.vault.drill) return { key: 'drill', label: L.drill, need: 2 };
        if (H.vault.jam) return { key: 'fix', label: L.fix, need: role === 'hacker' ? 1 : 2.5 };
        return null;
      }
      return { key: 'hack', label: L.hack, need: DIFF.hack[di()] * (role === 'hacker' ? 0.55 : 1), keep: true };
    }
    if (H.vault.open) {
      for (const c of H.carts) if (!c.taken && !hk.bag && near(c.o, 70)) return { key: 'cart:' + c.i, label: L.cart, need: 2.5, c };
      for (const b of H.boxes) if (!b.taken && near(b.o, 55)) return { key: 'box:' + b.i, label: L.box, need: 1.5, b };
    }
    return null;
  }

  function complete(p, a) {
    const hk = p.hk;
    const k = a.key.split(':')[0];
    if (k === 'revive') { a.q.ps.downed = false; a.q.ps.hp = 40; ev({ e: 'revive', id: a.q.id, by: p.id }); return; }
    if (k === 'escape') {
      const away = standing().filter((q) => dist2(q.ps.origin, HD.van.o) > HD.van.r + 40);
      if (away.length) { ev({ e: 'hk', k: 'msg', text: `Wait for ${away.map((q) => q.name).join(', ')} at the van` }, p.id); return; }
      finish(true, 'Got away');
      return;
    }
    if (k === 'tie') { setCiv(a.c, 'tied'); ev({ e: 'hk', k: 'civ', id: a.c.id, s: 'tied' }); return; }
    if (k === 'card') { a.k.up = false; a.k.holder = p.id; hk.keycard = true; ev({ e: 'hk', k: 'card', id: p.id, card: a.k.id }); return; }
    if (k === 'bag') { H.bags.splice(H.bags.indexOf(a.b), 1); hk.bag = true; ev({ e: 'hk', k: 'bagup', id: p.id, bag: a.b.id }); return; }
    if (k === 'staff') { openDoor(doorByName('staff'), false); ev({ e: 'hk', k: 'obj', what: 'staff', id: p.id }); return; }
    if (k === 'back') { openDoor(doorByName('back'), false); return; }
    if (k === 'cams') { H.camsLooped = true; ev({ e: 'hk', k: 'obj', what: 'cams', id: p.id }); return; }
    if (k === 'wires') { H.wiresCut = true; if (H.alarm) H.policeAt += 20; ev({ e: 'hk', k: 'obj', what: 'wires', id: p.id }); return; }
    if (k === 'hack') { openVault(p); return; }
    if (k === 'drill') { H.vault.drill = true; H.vault.jamAt = R.time + rnd(12, 22); ev({ e: 'hk', k: 'obj', what: 'drill', id: p.id }); noise(HD.panel, 2000, 'gunshot'); return; }
    if (k === 'fix') { H.vault.jam = false; H.vault.jamAt = R.time + rnd(12, 24); ev({ e: 'hk', k: 'obj', what: 'fix', id: p.id }); return; }
    if (k === 'cart') { a.c.taken = true; hk.bag = true; ev({ e: 'hk', k: 'cart', i: a.c.i, id: p.id }); return; }
    if (k === 'box') { a.b.taken = true; H.cash += boxCash; ev({ e: 'hk', k: 'box', i: a.b.i, id: p.id }); return; }
  }

  function openVault(p) {
    H.vault.open = true;
    openDoor(doorByName('vault'), false);
    ev({ e: 'hk', k: 'obj', what: 'vault', id: p ? p.id : 0 });
  }

  function dropBag(p, toss) {
    if (!p.hk.bag) return;
    p.hk.bag = false;
    const e = [p.ps.origin[0], p.ps.origin[1], p.ps.origin[2] + 50];
    const f = [Math.cos(p.yaw / D), Math.sin(p.yaw / D)];
    const far = toss ? 170 : 20;
    const tr = world().trace(e, [e[0] + f[0] * far, e[1] + f[1] * far, e[2]], [-8, -8, -8], [8, 8, 8], MASK_SHOT);
    const down = world().trace(tr.endpos, [tr.endpos[0], tr.endpos[1], tr.endpos[2] - 400], [-8, -8, -8], [8, 8, 8], MASK_SHOT);
    const b = { id: H.nextBag++, o: [down.endpos[0], down.endpos[1], down.endpos[2] - 8] };
    H.bags.push(b);
    ev({ e: 'hk', k: 'bagdown', id: p.id, bag: b.id, o: b.o.map(Math.round) });
  }
  function dropCard(p) {
    p.hk.keycard = false;
    H.keycards.push({ id: H.keycards.length + 1, o: [p.ps.origin[0], p.ps.origin[1], p.ps.origin[2] + 4], holder: 0, up: true });
  }

  // every command a robber sends; true: no weapons for this command (masks off)
  H.cmd = (p, cmd, pressed) => {
    if (!p.hk || H.phase !== 'heist') return H.phase !== 'heist';
    const hk = p.hk;
    if (pressed & BTN.MASK) {
      if (!hk.masked) { hk.masked = true; ev({ e: 'hk', k: 'mask', id: p.id }); } else if (hk.bag) dropBag(p, true);
    }
    // bags are heavy (not for the enforcer)
    p.ps.speedMul = hk.bag && hk.role !== 'enforcer' ? 0.72 : 1;
    if (hk.bag && cmd.buttons & BTN.SPRINT && hk.role !== 'enforcer') cmd.buttons &= ~BTN.SPRINT;
    // running near guards makes noise (not for the infiltrator)
    if (cmd.buttons & BTN.SPRINT && hk.role !== 'infiltrator' && Math.hypot(p.ps.velocity[0], p.ps.velocity[1]) > 300 && Math.random() < 0.05) noise(p.ps.origin, 260, 'step');
    return !hk.masked;
  };

  // downed instead of dead while a teammate can still help
  H.down = (p) => {
    if (H.phase !== 'heist') return false;
    if (!standing().some((o) => o !== p)) return false;
    p.ps.downed = true;
    p.ps.hp = 100;
    p.bleedAt = R.time + DIFF.bleed[di()];
    if (p.hk.bag) dropBag(p, false);
    ev({ e: 'down', id: p.id });
    return true;
  };
  H.died = (p) => {
    if (p.hk?.bag) dropBag(p, false);
    if (p.hk?.keycard) dropCard(p);
    if (p.ps) p.ps.downed = false;
  };
  H.respawnDelay = () => (H.phase === 'heist' ? DIFF.custody[di()] : 2);
  // after a respawn: the role's kit
  H.loadout = (p) => {
    if (!p.hk) return;
    const ps = p.ps, role = p.hk.role;
    const give = (id) => { const i = WEAPON_INDEX[id], W = WEAPONS[i]; giveWeapon(ps, i); if (W.ammo) ps.ammo[W.ammo] = Math.round(W.maxAmmo * (role === 'enforcer' ? 1 : 0.7)); ps.clips[i] = W.clip; };
    if (role === 'enforcer') { give('shotgun'); give('ar2'); ps.armor = 100; }
    if (role === 'lookout') give('sniper');
    if (role === 'hacker' || role === 'infiltrator') give('smg1');
    ps.downed = false;
    ps.speedMul = 1;
    p.hk.bag = false;
  };

  // ---------------------------------------------------------------- every tick
  H.think = (dt) => {
    const t = R.time;
    if (H.phase === 'planning') return;
    if (H.phase === 'over') { if (t >= H.overAt) backToPlanning(); return; }
    if (!crew().length) { backToPlanning(); return; }
    if (H.loudAt && t >= H.loudAt) { H.loudAt = 0; raiseAlarm('You went in loud'); }
    // lost: nobody standing
    if (!standing().length) { finish(false, 'The whole crew went down'); return; }

    doorsThink();
    camerasThink(dt);
    policeThink();
    // the senses run ten times a second (spread over the ticks), the bodies every tick
    for (const n of [...H.npcs.values()]) {
      if (n.state === 'dead') continue;
      n.thinkAt -= dt;
      if (n.thinkAt <= 0) { n.thinkAt += 0.1; perceive(n, 0.1); }
      if (n.kind === 'civ') civThink(n, dt);
      else if (n.state === 'combat') combatThink(n, dt);
      else if (H.alarm) { n.state = 'combat'; combatThink(n, dt); }
      else if (n.state === 'alerted') guardAlerted(n, dt);
      else guardCalm(n, dt);
      if (n.ps.origin[2] < R.map.killZ) H.npcs.delete(n.id);
    }

    // the drill
    if (H.vault.drill && !H.vault.open && !H.vault.jam) {
      H.vault.prog += dt / DIFF.drill[di()];
      if (t > H.vault.jamAt) { H.vault.jam = true; ev({ e: 'hk', k: 'jam' }); }
      if (H.vault.prog >= 1) openVault(null);
    }

    // the robbers: holding E, bags into the van, bleeding out
    for (const p of crew()) {
      const hk = p.hk;
      if (!hk) continue;
      if (!p.ps.alive) { hk.act = null; continue; }
      if (p.ps.downed) {
        hk.act = null;
        if (t >= p.bleedAt) { p.ps.downed = false; api.kill(p, 'bleedout'); }
        continue;
      }
      const a = action(p);
      if (a && p.buttons & BTN.USE && a.need < Infinity) {
        if (!hk.act || hk.act.key !== a.key) hk.act = { key: a.key, label: a.label, prog: a.key === 'hack' ? H.vault.prog : 0, need: a.need };
        hk.act.prog += dt / a.need;
        if (a.key === 'hack') H.vault.prog = hk.act.prog;
        if (hk.act.prog >= 1) { complete(p, a); hk.act = null; }
      } else hk.act = a ? { key: a.key, label: a.label, prog: a.key === 'hack' ? H.vault.prog : 0, need: a.need, idle: true } : null;
      // a bag carried into the van is safe
      if (hk.bag && dist2(p.ps.origin, HD.van.o) < HD.van.r) { hk.bag = false; H.secured++; ev({ e: 'hk', k: 'secured', id: p.id, n: H.secured }); }
      // health comes back slowly out of the fight (armour doesn't)
      if (t - (p.lastHurt || 0) > 6 && p.ps.hp < 60) p.ps.hp = Math.min(60, p.ps.hp + 6 * dt);
    }
    // bags thrown into the van zone count too
    for (const b of [...H.bags]) if (dist2(b.o, HD.van.o) < HD.van.r) { H.bags.splice(H.bags.indexOf(b), 1); H.secured++; ev({ e: 'hk', k: 'secured', bag: b.id, n: H.secured }); }
  };

  // ---------------------------------------------------------------- what clients see
  // per NPC: id, x, y, z, yaw, flags, vx, vy, alert (0..100; >100 means alerted/fighting), pitch
  const KIND = { guard: 0, police: 1, swat: 2, civ: 3 };
  H.rows = () => [...H.npcs.values()].map((n) => {
    let a = 0;
    for (const v of n.det.values()) a = Math.max(a, v);
    if (n.state === 'alerted' || n.state === 'combat' || n.state === 'calling' || n.state === 'panic') a = 1.01;
    const flags = KIND[n.kind] | (n.ps.ducked ? 4 : 0) | (n.state === 'tied' ? 8 : 0) | (n.state === 'down' || n.state === 'cower' ? 16 : 0) | (n.reloadUntil ? 32 : 0) | (n.keycard ? 64 : 0) | (n.state === 'investigate' ? 128 : 0);
    return [n.id, r1(n.ps.origin[0]), r1(n.ps.origin[1]), r1(n.ps.origin[2]), Math.round(n.yaw), flags, Math.round(n.ps.velocity[0]), Math.round(n.ps.velocity[1]), Math.round(a * 100)];
  });
  H.state = () => {
    const t = R.time;
    return {
      ph: H.phase === 'planning' ? 0 : H.phase === 'heist' ? 1 : 2,
      al: H.alarm ? 1 : 0, pol: H.alarm && t < H.policeAt ? Math.ceil(H.policeAt - t) : 0,
      as: H.assault ? (H.assault.phase === 'assault' ? 1 : 2) : 0, wave: H.assault?.wave || 0, asT: H.assault ? Math.max(0, Math.ceil(H.assault.until - t)) : 0,
      cams: H.camsLooped ? 0 : 1, wires: H.wiresCut ? 1 : 0, doors: H.doors.map((d) => (d.open ? 1 : 0)),
      vault: [H.vault.open ? 1 : 0, Math.round(H.vault.prog * 100), H.vault.drill ? 1 : 0, H.vault.jam ? 1 : 0],
      cards: H.keycards.filter((k) => k.up).map((k) => [k.id, ...k.o.map(Math.round)]),
      carts: H.carts.map((c) => (c.taken ? 1 : 0)), boxes: H.boxes.map((b) => (b.taken ? 1 : 0)),
      bags: H.bags.map((b) => [b.id, ...b.o.map(Math.round)]), sec: H.secured, cash: H.cash, civ: H.civKills,
      camYaw: H.cams.map((c) => Math.round(c.yaw)), time: H.phase === 'heist' ? Math.round(t - H.startAt) : 0,
      crew: crew().map((p) => [p.id, p.hk?.bag ? 1 : 0, p.hk?.masked ? 1 : 0, p.hk?.keycard ? 1 : 0]),
    };
  };
  // just for you: masked, carrying, holding a card, what E does here and how far along, how close anyone is to
  // spotting you (and from where), downed and bleeding
  H.personal = (p) => {
    const hk = p.hk;
    if (!hk) return null;
    let top = 0, from = null;
    const look = (lvl, o) => { if (lvl > top) { top = lvl; from = o; } };
    for (const n of H.npcs.values()) look(n.det.get(p.id) || 0, n.ps.origin);
    for (const c of H.cams) look(c.det.get(p.id) || 0, c.o);
    const dir = from ? Math.round(Math.atan2(from[1] - p.ps.origin[1], from[0] - p.ps.origin[0]) * D) : 0;
    const act = hk.act ? [hk.act.label, Math.round(Math.min(1, hk.act.prog) * 100), hk.act.idle ? 0 : 1, hk.act.need === Infinity ? 1 : 0] : null;
    return [hk.masked ? 1 : 0, hk.bag ? 1 : 0, hk.keycard ? 1 : 0, Math.round(top * 100), dir, p.ps.downed ? Math.max(0, Math.ceil(p.bleedAt - R.time)) : 0, act, hk.role, p.ps.alive ? 0 : p.respawnAt === Infinity ? -1 : Math.max(0, Math.ceil(p.respawnAt - R.time))];
  };
  // the parts of the map the client draws
  H.welcome = () => ({
    doors: H.doors.map((d) => [d.i, d.name, d.mins, d.maxs]),
    cams: HD.cameras.map((c, i) => [i, c.o, c.min || 0]), van: HD.van, carts: HD.carts, boxes: HD.boxes, panel: HD.panel, terminal: HD.terminal, wiring: HD.wiring, alarms: HD.alarms,
    plan: H.planState(), roles: ROLES,
    labels: L, loot: HD.loot || 'cash', boxLoot: HD.boxLoot || 'deposit', escape: HD.escape || 'van', cartDraw: HD.cartDraw || [0, 0], parked: HD.parked || [], bagCash, boxCash, title: HD.title || 'The Bank Job',
  });
  H.reset = () => { resetWorld(); H.phase = 'planning'; };
  resetWorld();
  return H;
}
