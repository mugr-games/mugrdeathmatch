// Server-side bots: each tick a bot looks at the world like a player would and produces the same kind of
// command a client sends (move, aim, buttons, weapon), so it plays by exactly the same rules.
import { MASK_SHOT } from './public/js/collide.js';
import { BTN } from './public/js/pmove.js';
import { WEAPONS, WEAPON_INDEX } from './public/js/weapons.js';
import { nearestNode, findPath } from './public/js/nav.js';

// reaction: seconds before shooting at someone newly seen; turn: degrees per second; wobble: aim error (deg)
export const SKILLS = {
  easy: { name: 'Easy', reaction: 0.75, turn: 200, wobble: 6, fireCone: 4 },
  normal: { name: 'Normal', reaction: 0.4, turn: 420, wobble: 3, fireCone: 2.5 },
  hard: { name: 'Hard', reaction: 0.2, turn: 900, wobble: 1.2, fireCone: 1.6 },
};

const NAMES = ['Rusty', 'Viper', 'Moth', 'Bishop', 'Kestrel', 'Domino', 'Rook', 'Static', 'Juniper', 'Grizzly', 'Pixel', 'Nomad', 'Tango', 'Wren', 'Brick', 'Echo', 'Sable', 'Comet', 'Flint', 'Gecko'];
export function botName(taken) {
  const free = NAMES.filter((n) => !taken.has(`BOT ${n}`));
  return `BOT ${free.length ? free[(Math.random() * free.length) | 0] : 'Unit ' + ((Math.random() * 900) | 0)}`;
}

const D = 180 / Math.PI;
const angDiff = (a, b) => ((b - a) % 360 + 540) % 360 - 180;
const eye = (ps) => [ps.origin[0], ps.origin[1], ps.origin[2] + (ps.ducked ? 28 : 64)];

export function newBrain(skill) {
  return { skill: SKILLS[skill] || SKILLS.normal, yaw: 0, pitch: 0, target: null, seenAt: 0, lastLook: 0, path: null, pathAt: -9, goal: null,
    strafe: 1, strafeUntil: 0, stuckPos: null, stuckAt: 0, stuckCount: 0, jump: false, attack: false, w: undefined, weaponAt: 0, respawnAt: 0, err: [0, 0], errAt: 0 };
}

// ctx: { world, nav, time, others: [{ id, team, alive, origin, ducked }], items: [{ kind, o, up }], killZ }
export function botCommand(p, B, ctx) {
  const ps = p.ps, t = ctx.time;
  const cmd = { fwd: 0, side: 0, buttons: 0, yaw: B.yaw, pitch: B.pitch, w: B.w };
  if (!ps.alive) {
    // press fire to respawn after a short pause
    if (!B.respawnAt) B.respawnAt = t + 1 + Math.random() * 1.5;
    if (t > B.respawnAt) { cmd.buttons = BTN.ATTACK; B.respawnAt = 0; B.path = null; B.target = null; }
    return cmd;
  }
  const S = B.skill;
  const me = eye(ps);
  const enemies = ctx.others.filter((o) => o.alive && (!p.team || o.team !== p.team));

  // ---- who to shoot: the nearest enemy in plain sight, re-checked five times a second
  if (t - B.lastLook > 0.2) {
    B.lastLook = t;
    let best = null, bd = Infinity;
    for (const o of enemies) {
      const c = [o.origin[0], o.origin[1], o.origin[2] + (o.ducked ? 20 : 44)];
      const d = Math.hypot(c[0] - me[0], c[1] - me[1], c[2] - me[2]);
      if (d > 3500 || d >= bd) continue;
      if (ctx.world.trace(me, c, [0, 0, 0], [0, 0, 0], MASK_SHOT).fraction < 0.98) continue;
      best = o; bd = d;
    }
    if (best && (!B.target || B.target.id !== best.id)) B.seenAt = t; // a new face: react first
    B.target = best;
  }
  const tgt = B.target && enemies.find((o) => o.id === B.target.id);
  if (!tgt) B.target = null;

  // ---- weapon for the range, once a second
  const dist = tgt ? Math.hypot(tgt.origin[0] - ps.origin[0], tgt.origin[1] - ps.origin[1]) : 800;
  if (t > B.weaponAt) {
    B.weaponAt = t + 1;
    B.w = pickWeapon(ps, dist);
    cmd.w = B.w;
  }

  // ---- where to go: health when hurt, a weapon when poorly armed, otherwise toward the nearest enemy
  let goal = null;
  if (!tgt || dist > 900) {
    const health = ps.hp < 55 && nearestItem(ps, ctx.items, (k) => k === 'health' || k === 'vial' || k === 'megahealth', 1800);
    const armed = WEAPONS.filter((w, i) => (ps.owned >> i) & 1 && w.ammo && ps.ammo[w.ammo] > 0).length;
    const gun = !health && armed < 3 && nearestItem(ps, ctx.items, (k) => WEAPON_INDEX[k] !== undefined, 1400);
    if (health || gun) goal = (health || gun).o;
    else if (tgt) goal = tgt.origin;
    else {
      let bd = Infinity;
      for (const o of enemies) { const d = (o.origin[0] - ps.origin[0]) ** 2 + (o.origin[1] - ps.origin[1]) ** 2; if (d < bd) { bd = d; goal = o.origin; } }
      // nobody to chase: wander between random spots
      if (!goal) { if (!B.goal || t - B.pathAt > 8) B.goal = ctx.nav.nodes[(Math.random() * ctx.nav.nodes.length) | 0]; goal = [B.goal.x, B.goal.y, B.goal.z]; }
    }
  }
  let moveDir = null; // world angle (deg) to move toward
  if (goal) {
    if (!B.path || t - B.pathAt > 1.2) {
      B.pathAt = t;
      B.path = findPath(ctx.nav, nearestNode(ctx.nav, ps.origin), nearestNode(ctx.nav, goal), undefined, 20000);
    }
    // drop waypoints already reached, then head for the next one
    while (B.path && B.path.length > 1 && Math.hypot(B.path[0].x - ps.origin[0], B.path[0].y - ps.origin[1]) < 28) B.path.shift();
    const wp = B.path && B.path[Math.min(1, B.path.length - 1)];
    if (wp) {
      moveDir = Math.atan2(wp.y - ps.origin[1], wp.x - ps.origin[0]) * D;
      if (wp.z - ps.origin[2] > 18 && ps.onGround) B.jump = !B.jump;
    } else moveDir = Math.atan2(goal[1] - ps.origin[1], goal[0] - ps.origin[0]) * D;
  }

  // ---- aim: turn toward the target at the bot's speed, with an error that wanders and settles
  let wantYaw = moveDir ?? B.yaw, wantPitch = 0;
  if (tgt) {
    const W = WEAPONS[ps.cur];
    const head = S === SKILLS.hard && Math.random() < 0.02;
    const aimZ = W.proj && W.proj.radius ? 6 : tgt.ducked ? 20 : head ? 62 : 42; // rockets at the feet
    const c = [tgt.origin[0], tgt.origin[1], tgt.origin[2] + aimZ];
    if (t > B.errAt) { B.errAt = t + 0.35; B.err = [(Math.random() - 0.5) * 2 * S.wobble, (Math.random() - 0.5) * S.wobble]; }
    wantYaw = Math.atan2(c[1] - me[1], c[0] - me[0]) * D + B.err[0];
    wantPitch = -Math.atan2(c[2] - me[2], Math.hypot(c[0] - me[0], c[1] - me[1])) * D + B.err[1];
  }
  const maxTurn = S.turn * ctx.dt;
  const dy = angDiff(B.yaw, wantYaw);
  B.yaw += Math.max(-maxTurn, Math.min(maxTurn, dy));
  B.pitch += Math.max(-maxTurn, Math.min(maxTurn, wantPitch - B.pitch));
  B.yaw = ((B.yaw % 360) + 360) % 360;
  cmd.yaw = +B.yaw.toFixed(2);
  cmd.pitch = +Math.max(-89, Math.min(89, B.pitch)).toFixed(2);

  // ---- move: toward the goal; in a fight, also strafe side to side
  let mx = 0, my = 0;
  if (moveDir !== null) { mx = Math.cos(moveDir / D); my = Math.sin(moveDir / D); }
  if (tgt) {
    if (t > B.strafeUntil) { B.strafeUntil = t + 0.4 + Math.random() * 0.9; B.strafe = Math.random() < 0.5 ? -1 : 1; }
    const W = WEAPONS[ps.cur];
    const toT = Math.atan2(tgt.origin[1] - ps.origin[1], tgt.origin[0] - ps.origin[0]);
    const close = W.melee ? 0 : dist < 300 ? -0.6 : dist > 1100 ? 0.6 : 0; // back off when too close, push in when far
    const sx = -Math.sin(toT) * B.strafe, sy = Math.cos(toT) * B.strafe;
    if (W.melee || moveDir === null) { mx = Math.cos(toT) * (W.melee ? 1 : close) + sx * 0.8; my = Math.sin(toT) * (W.melee ? 1 : close) + sy * 0.8; }
    else { mx = mx * 0.5 + sx * 0.8; my = my * 0.5 + sy * 0.8; }
  }
  const len = Math.hypot(mx, my);
  if (len > 0.01) {
    const rel = Math.atan2(my, mx) - B.yaw / D;
    cmd.fwd = +(Math.cos(rel)).toFixed(2);
    cmd.side = +(-Math.sin(rel)).toFixed(2);
  }
  if (!tgt && B.path && B.path.length > 6) cmd.buttons |= BTN.SPRINT;

  // ---- stuck: no progress for a second means jump; three times in a row means find a new way
  if (len > 0.01) {
    if (!B.stuckPos || t - B.stuckAt > 1) {
      if (B.stuckPos && Math.hypot(ps.origin[0] - B.stuckPos[0], ps.origin[1] - B.stuckPos[1]) < 24) {
        B.jump = true;
        if (++B.stuckCount >= 3) { B.path = null; B.goal = null; B.stuckCount = 0; B.strafe = -B.strafe; }
      } else B.stuckCount = 0;
      B.stuckPos = ps.origin.slice();
      B.stuckAt = t;
    }
  }
  if (B.jump && ps.onGround && !ps.jumpHeld) { cmd.buttons |= BTN.JUMP; B.jump = false; }

  // ---- shoot once reacted and lined up (semi-automatics need the trigger released between shots)
  if (tgt && t - B.seenAt > S.reaction) {
    const W = WEAPONS[ps.cur];
    const err = Math.abs(angDiff(B.yaw, Math.atan2(tgt.origin[1] - me[1], tgt.origin[0] - me[0]) * D));
    const cone = Math.max(S.fireCone, Math.atan2(16, dist) * D);
    const inRange = W.melee ? dist < W.range + 20 : !(W.proj && W.proj.radius && dist < 260);
    if (err < cone && inRange) {
      B.attack = W.semi || W.proj ? !B.attack : true;
      if (B.attack) cmd.buttons |= BTN.ATTACK;
    } else B.attack = false;
  } else B.attack = false;
  return cmd;
}

function nearestItem(ps, items, want, max) {
  let best = null, bd = max * max;
  for (const it of items) {
    if (!it.up || !want(it.kind)) continue;
    const d = (it.o[0] - ps.origin[0]) ** 2 + (it.o[1] - ps.origin[1]) ** 2;
    if (d < bd) { bd = d; best = it; }
  }
  return best;
}

// best owned weapon with ammo for a distance
function pickWeapon(ps, dist) {
  const has = (id) => { const i = WEAPON_INDEX[id]; const W = WEAPONS[i]; return i !== undefined && (ps.owned >> i) & 1 && (!W.ammo || ps.clips[i] > 0 || ps.ammo[W.ammo] > 0); };
  const prefs = dist < 250 ? ['autoshotgun', 'shotgun', 'lmg', 'smg1', 'ar2', '357', 'pistol']
    : dist < 1200 ? ['lmg', 'ar2', 'rpg', 'smg1', 'railgun', 'autoshotgun', '357', 'shotgun', 'crossbow', 'pistol', 'grenade']
    : ['railgun', 'sniper', 'crossbow', 'ar2', 'lmg', '357', 'smg1', 'rpg', 'pistol'];
  for (const id of [...prefs, 'claws', 'crowbar']) if (has(id)) return WEAPON_INDEX[id];
  return ps.cur;
}
