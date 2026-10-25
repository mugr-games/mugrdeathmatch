// Two extra game modes, run by the server alongside the room's own tick (like cod.js for zombies).
//
// Soccer: red vs blue on the Pitch. One ball with gravity, bounces and rolling friction. Players dribble by
// running into it, kick it where they look (attack) or chip it (alt attack). Red scores in the goal at +X,
// blue in the one at -X. First to the goal limit wins, or the most goals when time runs out.
//
// Parkour: the Sky Course. Checkpoints in order, a timer per player, best times on a board; falling puts you
// back on your last checkpoint. Reload restarts the run, use goes back to the last checkpoint.
//
// Mugrball: red vs blue on the Ballcourt with guns, like PASS Time. Run over the ball to grab it; the carrier
// can't shoot but throws it (attack) or punts it (alt attack), and heals slowly. A crowbar hit on the carrier
// steals it, a crowbar swing at a loose ball slaps it like a puck, and bullets and blasts knock it about. Into
// the goal is 1 point (thrown, punted or carried in); through the hoop above the goal is 3.
import { BTN } from './public/js/pmove.js';
import { viewDir, eyePos } from './public/js/sim.js';
import { WEAPON_INDEX } from './public/js/weapons.js';

const BALL_R = 14;
const GRAVITY = 720;
const KICK_COOLDOWN = 0.35;

// api: { world(), pushEvent(ev, only), endMatch(team), award(p, coins, why), stat(p, change), players() }
export function createSoccer(R, def, api) {
  const S = def.soccer;
  const ball = { pos: S.center.slice(), vel: [0, 0, 0], last: null, frozenUntil: 0, resetAt: 0 };

  function reset() {
    ball.pos = S.center.slice();
    ball.vel = [0, 0, 0];
    ball.last = null;
    ball.resetAt = 0;
    ball.frozenUntil = (R.time || 0) + 1.5; // a moment to get ready for the kick-off
  }

  const move = (dt) => moveBall(ball, api.world(), dt);

  // players: running into the ball pushes it (that's dribbling)
  function touch(p) {
    const o = p.ps.origin, b = ball.pos;
    const cx = Math.max(o[0] - 16, Math.min(o[0] + 16, b[0])), cy = Math.max(o[1] - 16, Math.min(o[1] + 16, b[1])), cz = Math.max(o[2], Math.min(o[2] + (p.ps.ducked ? 36 : 72), b[2]));
    const d = [b[0] - cx, b[1] - cy, b[2] - cz];
    const dist = Math.hypot(d[0], d[1], d[2]);
    if (dist >= BALL_R || dist < 1e-4) return;
    const n = d.map((x) => x / dist);
    for (let i = 0; i < 3; i++) ball.pos[i] += n[i] * (BALL_R - dist + 0.5);
    const pv = p.ps.velocity;
    const rel = (ball.vel[0] - pv[0]) * n[0] + (ball.vel[1] - pv[1]) * n[1] + (ball.vel[2] - pv[2]) * n[2];
    if (rel < 0) for (let i = 0; i < 3; i++) ball.vel[i] -= 1.25 * rel * n[i];
    ball.last = p;
  }

  function scored(team) {
    R.teamScore[team]++;
    const by = ball.last, own = !!by && by.team !== team;
    api.pushEvent({ e: 'goal', team, id: by ? by.id : 0, own: own ? 1 : 0, score: R.teamScore });
    if (by && !own) { api.award(by, 20, 'goal'); api.stat(by, { goals: 1 }); }
    ball.resetAt = R.time + 3;
    if (R.settings.caplimit && R.teamScore[team] >= R.settings.caplimit) api.endMatch(team);
  }

  return {
    ball,
    reset,
    // a player's command: kick (attack) or chip (alt attack) when the ball is in front and close
    cmd(p, cmd, pressed) {
      if (!p.ps.alive || R.time < ball.frozenUntil || ball.resetAt) return;
      if (!(cmd.buttons & (BTN.ATTACK | BTN.ATTACK2))) return;
      if ((p.kickReady || 0) > R.time) return;
      const o = p.ps.origin, b = ball.pos;
      const to = [b[0] - o[0], b[1] - o[1], b[2] - (o[2] + 30)];
      const dist = Math.hypot(to[0], to[1], to[2]);
      if (dist > 78) return;
      const f = viewDir(cmd.yaw, 0);
      if ((to[0] * f[0] + to[1] * f[1]) / Math.max(1, Math.hypot(to[0], to[1])) < 0.2) return; // it has to be in front
      const chip = cmd.buttons & BTN.ATTACK2 && !(cmd.buttons & BTN.ATTACK);
      const d = viewDir(cmd.yaw, Math.max(-60, Math.min(25, cmd.pitch)));
      const power = chip ? 640 : 1000;
      ball.vel = [d[0] * power + p.ps.velocity[0] * 0.3, d[1] * power + p.ps.velocity[1] * 0.3, chip ? 560 : Math.max(90, d[2] * power + 110)];
      ball.last = p;
      p.kickReady = R.time + KICK_COOLDOWN;
      api.pushEvent({ e: 'kick', id: p.id, o: ball.pos.map(Math.round), chip: chip ? 1 : 0 });
    },
    think(dt) {
      if (R.ending) { move(dt); return; }
      if (ball.resetAt && R.time >= ball.resetAt) reset();
      if (R.time < ball.frozenUntil) return;
      for (const p of api.players()) if (p.ps.alive) touch(p);
      move(dt);
      const b = ball.pos;
      if (!Number.isFinite(b[0] + b[1] + b[2]) || b[2] < R.map.killZ) return reset();
      if (!ball.resetAt && Math.abs(b[1]) < S.goalW && b[2] < S.goalH && Math.abs(b[0]) > S.goalX + BALL_R) scored(b[0] > 0 ? 'red' : 'blue');
    },
    state: () => [...ball.pos, ...ball.vel].map((v) => Math.round(v * 10) / 10),
    // a simple bot: get behind the ball (on the far side from the goal it attacks), then run through it and shoot
    botCommand(p) {
      const o = p.ps.origin, b = ball.pos;
      const goal = [p.team === 'red' ? S.goalX + 60 : -S.goalX - 60, 0];
      const g = [goal[0] - b[0], goal[1] - b[1]], gl = Math.hypot(g[0], g[1]) || 1;
      g[0] /= gl; g[1] /= gl;
      const rel = [o[0] - b[0], o[1] - b[1]];
      const behind = rel[0] * g[0] + rel[1] * g[1] < -12;
      let target;
      if (behind) target = [b[0] + g[0] * 30, b[1] + g[1] * 30];
      else {
        // go round the ball to the side rather than through it
        const side = rel[0] * -g[1] + rel[1] * g[0] >= 0 ? 1 : -1;
        target = [b[0] - g[0] * 60 + -g[1] * side * 50, b[1] - g[1] * 60 + g[0] * side * 50];
      }
      const dx = target[0] - o[0], dy = target[1] - o[1];
      const yaw = (Math.atan2(behind ? g[1] * 300 + b[1] - o[1] : dy, behind ? g[0] * 300 + b[0] - o[0] : dx) * 180) / Math.PI;
      const moveYaw = Math.atan2(dy, dx) - (yaw * Math.PI) / 180;
      const close = Math.hypot(b[0] - o[0], b[1] - o[1]) < 70;
      return {
        fwd: Math.cos(moveYaw), side: -Math.sin(moveYaw), yaw, pitch: 0,
        buttons: BTN.SPRINT | (behind && close && Math.random() < 0.15 ? BTN.ATTACK : 0),
      };
    },
  };
}
const TICKDT = 1 / 60;
const EXTENT = [BALL_R, BALL_R, BALL_R], NEG = [-BALL_R, -BALL_R, -BALL_R];

// the ball against the world: move, bounce off what it hits, roll along the ground
function moveBall(ball, world, dt) {
  const v = ball.vel;
  v[2] -= GRAVITY * dt;
  for (let pass = 0; pass < 3 && dt > 0; pass++) {
    const next = [ball.pos[0] + v[0] * dt, ball.pos[1] + v[1] * dt, ball.pos[2] + v[2] * dt];
    const tr = world.trace(ball.pos, next, NEG, EXTENT);
    ball.pos = tr.endpos.slice();
    if (tr.fraction >= 1) break;
    const n = tr.normal, vn = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
    if (vn < 0) {
      const floor = n[2] > 0.7;
      const e = floor ? (Math.abs(vn) < 60 ? 0 : 0.5) : 0.65; // floors take more out of a bounce; tiny bounces stop
      for (let i = 0; i < 3; i++) v[i] -= (1 + e) * vn * n[i];
      if (!floor) { v[0] *= 0.92; v[1] *= 0.92; }
    }
    dt *= 1 - tr.fraction;
  }
  // rolling along the ground slows it; a little air drag too
  const below = world.trace(ball.pos, [ball.pos[0], ball.pos[1], ball.pos[2] - 1.5], NEG, EXTENT);
  const k = below.fraction < 1 ? Math.exp(-1.1 * TICKDT) : Math.exp(-0.12 * TICKDT);
  v[0] *= k; v[1] *= k;
  if (below.fraction < 1 && Math.hypot(v[0], v[1]) < 4) { v[0] = 0; v[1] = 0; }
}

// how far the ball's centre is from a player's box
function ballGap(p, b) {
  const o = p.ps.origin;
  const cx = Math.max(o[0] - 16, Math.min(o[0] + 16, b[0])), cy = Math.max(o[1] - 16, Math.min(o[1] + 16, b[1])), cz = Math.max(o[2], Math.min(o[2] + (p.ps.ducked ? 36 : 72), b[2]));
  return Math.hypot(b[0] - cx, b[1] - cy, b[2] - cz);
}

const MB = {
  throw: 950, throwLift: 170, punt: 1250, puntLift: 260, slap: 1400,
  pickupDelay: 0.6, // before the thrower can catch their own ball
  idleReset: 25, // a loose ball nobody touches goes back to the centre
  regen: 6, // the carrier heals this much a second
  goal: 1, hoop: 3,
};
const CROWBAR = WEAPON_INDEX.crowbar ?? 0;

// api as for soccer
export function createMugrball(R, def, api) {
  const S = def.soccer, hoops = def.hoops || [];
  const ball = { pos: S.center.slice(), vel: [0, 0, 0], holder: null, last: null, frozenUntil: 0, resetAt: 0, touched: 0 };

  function reset() {
    ball.pos = S.center.slice();
    ball.vel = [0, 0, 0];
    ball.holder = null;
    ball.last = null;
    ball.resetAt = 0;
    ball.touched = R.time || 0; // the room clock may not have started yet
    ball.frozenUntil = (R.time || 0) + 1.5;
  }

  // the carrier lets go: the ball starts a little in front of their eyes (or wherever a wall stops it)
  function release(p, vel, kind) {
    const eye = eyePos(p.ps), d = viewDir(p.yaw, 0);
    const want = [eye[0] + d[0] * 22, eye[1] + d[1] * 22, eye[2] - 8];
    const tr = api.world().trace([p.ps.origin[0], p.ps.origin[1], p.ps.origin[2] + 36], want, NEG, EXTENT);
    ball.pos = tr.endpos.slice();
    ball.vel = vel;
    ball.holder = null;
    ball.last = p;
    ball.touched = R.time;
    p.mbNoPick = R.time + MB.pickupDelay;
    api.pushEvent({ e: 'mb', k: kind, id: p.id, o: ball.pos.map(Math.round) });
  }

  function grab(p, kind = 'pick') {
    const from = ball.holder;
    ball.holder = p;
    ball.last = p;
    ball.vel = [0, 0, 0];
    ball.touched = R.time;
    p.mbRegen = 0;
    api.pushEvent({ e: 'mb', k: kind, id: p.id, team: p.team, from: from ? from.id : 0 });
  }

  // which team scores at this end: red attacks +X
  const sideTeam = (x) => (x > 0 ? 'red' : 'blue');
  const inGoal = (o) => Math.abs(o[1]) < S.goalW && o[2] < S.goalH && Math.abs(o[0]) > S.goalX + BALL_R;

  function scored(team, pts, how) {
    if (ball.resetAt) return;
    R.teamScore[team] += pts;
    const by = ball.holder || ball.last, own = !!by && by.team !== team;
    api.pushEvent({ e: 'goal', team, id: by ? by.id : 0, own: own ? 1 : 0, score: R.teamScore, pts, how });
    if (by && !own) { api.award(by, pts > 1 ? 30 : 20, how); api.stat(by, { goals: 1 }); }
    if (ball.holder) { ball.holder = null; ball.vel = [0, 0, 0]; }
    ball.resetAt = R.time + 3;
    if (R.settings.caplimit && R.teamScore[team] >= R.settings.caplimit) api.endMatch(team);
  }

  function drop(p) {
    if (ball.holder !== p) return;
    const v = p.ps.velocity;
    release(p, [v[0] * 0.6, v[1] * 0.6, 220], 'drop');
    p.mbNoPick = R.time + 1;
  }

  return {
    ball,
    reset,
    drop,
    holder: () => ball.holder,
    // the carrier throws or punts; anyone else's crowbar slaps a loose ball. True when it was the carrier's
    // command (they have no weapons).
    cmd(p, cmd, pressed) {
      if (ball.holder === p) {
        if (pressed & BTN.ATTACK) {
          const d = viewDir(cmd.yaw, Math.max(-70, Math.min(40, cmd.pitch)));
          const v = p.ps.velocity;
          release(p, [d[0] * MB.throw + v[0] * 0.4, d[1] * MB.throw + v[1] * 0.4, d[2] * MB.throw + MB.throwLift + v[2] * 0.3], 'throw');
        } else if (pressed & BTN.ATTACK2) {
          const d = viewDir(cmd.yaw, Math.max(-40, Math.min(15, cmd.pitch)));
          release(p, [d[0] * MB.punt, d[1] * MB.punt, d[2] * MB.punt + MB.puntLift], 'punt');
        }
        return true;
      }
      if (ball.holder || ball.resetAt || R.time < ball.frozenUntil) return false;
      if (pressed & BTN.ATTACK && p.ps.cur === CROWBAR) {
        const eye = eyePos(p.ps), b = ball.pos;
        const to = [b[0] - eye[0], b[1] - eye[1], b[2] - eye[2]];
        const dist = Math.hypot(to[0], to[1], to[2]);
        const f = viewDir(cmd.yaw, cmd.pitch);
        if (dist < 95 && (to[0] * f[0] + to[1] * f[1] + to[2] * f[2]) / dist > 0.55) {
          const d = viewDir(cmd.yaw, Math.max(-20, Math.min(12, cmd.pitch)));
          ball.vel = [d[0] * MB.slap, d[1] * MB.slap, d[2] * MB.slap + 70];
          ball.last = p;
          ball.touched = R.time;
          p.mbNoPick = R.time + 0.4;
          api.pushEvent({ e: 'kick', id: p.id, o: ball.pos.map(Math.round), slap: 1 });
        }
      }
      return false;
    },
    // a crowbar hit on the carrier takes the ball
    hit(victim, attacker, weapon) {
      if (ball.holder !== victim || !attacker || attacker === victim || attacker.team === victim.team || weapon !== 'crowbar' || !attacker.ps.alive) return;
      grab(attacker, 'steal');
    },
    // bullets nudge a loose ball, blasts throw it
    shot(start, d, maxDist, dmg) {
      if (ball.holder || ball.resetAt) return;
      const c = ball.pos, m = [start[0] - c[0], start[1] - c[1], start[2] - c[2]];
      const b = m[0] * d[0] + m[1] * d[1] + m[2] * d[2], cc = m[0] * m[0] + m[1] * m[1] + m[2] * m[2] - BALL_R * BALL_R;
      const disc = b * b - cc;
      if (disc < 0) return;
      const t = -b - Math.sqrt(disc);
      if (t < 0 || t > maxDist) return;
      const k = Math.min(300, dmg * 7);
      for (let i = 0; i < 3; i++) ball.vel[i] += d[i] * k;
      ball.vel[2] += k * 0.25;
      ball.touched = R.time;
    },
    blast(at, P) {
      if (ball.holder || ball.resetAt) return;
      const c = ball.pos, d = Math.hypot(c[0] - at[0], c[1] - at[1], c[2] - at[2]);
      if (d > P.radius) return;
      const k = (P.knock || 400) * 1.4 * (1 - d / P.radius);
      const n = d > 1 ? [(c[0] - at[0]) / d, (c[1] - at[1]) / d, (c[2] - at[2]) / d] : [0, 0, 1];
      ball.vel[0] += n[0] * k; ball.vel[1] += n[1] * k; ball.vel[2] += Math.max(n[2], 0.45) * k;
      ball.touched = R.time;
    },
    think(dt) {
      if (R.ending) { if (!ball.holder) moveBall(ball, api.world(), dt); return; }
      if (ball.resetAt && R.time >= ball.resetAt) reset();
      if (R.time < ball.frozenUntil) return;
      const h = ball.holder;
      if (h) {
        if (!h.ps.alive || !R.players.has(h.id)) { ball.holder = null; ball.vel = [0, 0, 200]; return; }
        const d = viewDir(h.yaw, 0), o = h.ps.origin;
        ball.pos = [o[0] + d[0] * 18, o[1] + d[1] * 18, o[2] + 40];
        ball.vel = h.ps.velocity.slice();
        // the carrier heals slowly
        h.mbRegen = (h.mbRegen || 0) + MB.regen * dt;
        if (h.mbRegen >= 1) { const n = Math.floor(h.mbRegen); h.mbRegen -= n; h.ps.hp = Math.min(100, h.ps.hp + n); }
        // carried into the other team's goal
        if (inGoal([o[0] + Math.sign(o[0]) * 20, o[1], o[2] + 10]) && sideTeam(o[0]) === h.team) scored(h.team, MB.goal, 'carry');
        return;
      }
      const prevZ = ball.pos[2];
      moveBall(ball, api.world(), dt);
      const b = ball.pos;
      if (!Number.isFinite(b[0] + b[1] + b[2]) || b[2] < R.map.killZ) return reset();
      if (ball.resetAt) return;
      // through a hoop, going down
      for (const hp of hoops) {
        if (prevZ >= hp.o[2] && b[2] < hp.o[2] && Math.hypot(b[0] - hp.o[0], b[1] - hp.o[1]) < hp.r - 4) return scored(sideTeam(hp.o[0]), MB.hoop, 'hoop');
      }
      if (inGoal(b)) return scored(sideTeam(b[0]), MB.goal, 'goal');
      // anyone alive who runs into it picks it up
      for (const p of api.players()) {
        if (!p.ps.alive || p.ps.downed || (p.mbNoPick || 0) > R.time) continue;
        if (ballGap(p, b) < BALL_R + 6) { grab(p); return; }
      }
      if (R.time - ball.touched > MB.idleReset && Math.hypot(ball.vel[0], ball.vel[1]) < 5) {
        api.pushEvent({ e: 'mb', k: 'reset', id: 0 });
        reset();
      }
    },
    state: () => [...ball.pos, ...ball.vel].map((v) => Math.round(v * 10) / 10).concat(ball.holder ? ball.holder.id : 0),
    // bots fight as usual, but the nearest on each team goes for a loose ball, and a carrier runs at the goal
    // and throws from range
    botCommand(p, base) {
      const o = p.ps.origin, b = ball.pos;
      const steer = (tx, ty, buttons) => ({ ...base, fwd: 1, side: 0, yaw: (Math.atan2(ty - o[1], tx - o[0]) * 180) / Math.PI, buttons });
      if (ball.holder === p) {
        const gx = p.team === 'red' ? S.goalX : -S.goalX;
        const dist = Math.hypot(gx - o[0], o[1]);
        // in range (or about to die): lob it at the goal, higher the further away
        if ((dist < 800 || p.ps.hp < 35) && (p.mbThrowAt || 0) < R.time && R.time - (p.mbHeldAt || 0) > 0.4) {
          p.mbThrowAt = R.time + 1;
          return { ...steer(gx + Math.sign(gx) * 30, 0, BTN.ATTACK), pitch: -6 - (dist / 800) * 14 };
        }
        return { ...steer(gx + Math.sign(gx) * 40, 0, BTN.SPRINT), pitch: 0 };
      }
      p.mbHeldAt = R.time;
      if (!ball.holder && !ball.resetAt && R.time >= ball.frozenUntil) {
        const mine = Math.hypot(b[0] - o[0], b[1] - o[1]);
        let nearest = true;
        for (const q of api.players()) if (q !== p && q.team === p.team && q.ps.alive && Math.hypot(b[0] - q.ps.origin[0], b[1] - q.ps.origin[1]) < mine) nearest = false;
        if (nearest || mine < 300) return { ...steer(b[0], b[1], (base.buttons & ~BTN.ATTACK) | BTN.SPRINT), pitch: 0 };
      }
      return base;
    },
  };
}

export function createParkour(R, def, api) {
  const cps = def.checkpoints;
  const board = new Map(); // player id -> best time this match
  const inside = (o, b) => o[0] >= b[0] && o[0] <= b[3] && o[1] >= b[1] && o[1] <= b[4] && o[2] >= b[2] && o[2] <= b[5];
  const place = (p, c) => {
    p.ps.origin = [c.o[0], c.o[1], c.o[2] + 1];
    p.ps.velocity = [0, 0, 0];
    p.yaw = c.yaw;
    api.pushEvent({ e: 'spawn', id: p.id, o: p.ps.origin.map(Math.round), y: c.yaw });
  };
  const start = (p) => { p.pk = { cp: 0, start: R.time, best: p.pk?.best ?? null, last: p.pk?.last ?? 0 }; };

  return {
    spawn(p) { start(p); },
    cmd(p, cmd, pressed) {
      if (!p.ps.alive || !p.pk) return;
      if (pressed & BTN.RELOAD) { start(p); place(p, cps[0]); api.pushEvent({ e: 'pk', id: p.id, k: 'restart' }, p.id); }
      else if (pressed & BTN.USE) { place(p, cps[p.pk.cp]); api.pushEvent({ e: 'pk', id: p.id, k: 'back' }, p.id); }
    },
    think() {
      for (const p of api.players()) {
        if (!p.ps.alive || !p.pk) continue;
        const o = p.ps.origin;
        // fell off: back to the last checkpoint (the clock keeps running)
        if (o[2] < R.map.killZ + 100) { place(p, cps[p.pk.cp]); api.pushEvent({ e: 'pk', id: p.id, k: 'fall' }, p.id); continue; }
        const next = cps[p.pk.cp + 1];
        if (!next || !inside(o, next.box)) continue;
        p.pk.cp++;
        const t = Math.round((R.time - p.pk.start) * 100) / 100;
        if (!next.finish) { api.pushEvent({ e: 'pk', id: p.id, k: 'cp', n: p.pk.cp, of: cps.length - 1, t }, p.id); continue; }
        // finished
        const pb = p.pk.best === null || t < p.pk.best;
        if (pb) p.pk.best = t;
        if (!board.has(p.id) || t < board.get(p.id)) board.set(p.id, t);
        p.frags++;
        api.pushEvent({ e: 'pk', id: p.id, k: 'finish', t, pb: pb ? 1 : 0 });
        // coins for finishing, at most once a minute
        if (R.time - (p.pk.last || -999) > 60) { api.award(p, 30, 'finish'); p.pk.last = R.time; }
        api.stat(p, { finishes: 1, pkbest: t });
        start(p);
        p.pk.start = R.time + 4; // a moment on the finish platform, then back to the start
        p.pk.restartAt = R.time + 4;
      }
      for (const p of api.players()) if (p.pk?.restartAt && R.time >= p.pk.restartAt) { p.pk.restartAt = 0; start(p); place(p, cps[0]); }
    },
    // for the snapshot: the room's best times, and each player's own run
    board: () => [...board.entries()].sort((a, b) => a[1] - b[1]).slice(0, 8),
    personal: (p) => (p.pk ? [p.pk.cp, cps.length - 1, Math.round(p.pk.start * 100) / 100, p.pk.best] : null),
    forget: (p) => board.delete(p.id),
  };
}
