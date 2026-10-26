// Source-style player movement. Deterministic for a given (state, cmd), so the client can predict
// exactly what the server will do and replay unacknowledged commands after each snapshot.
import { CONTENTS } from './collide.js';
import { POWERS } from './weapons.js';

export const BTN = { JUMP: 1, DUCK: 2, SPRINT: 4, ATTACK: 8, ATTACK2: 16, RELOAD: 32, USE: 64, WALK: 128, ROCKETJUMP: 256, MASK: 512, HORN: 1024 };

// Tuned to Garry's Mod sandbox defaults: walk 200, sprint 400, slow-walk 100, crouch 0.3x, jump power 200,
// friction 8, stop speed 10, ground/air acceleration 10 (air-strafing works, jumps need a re-press).
export const MV = {
  gravity: 600,
  friction: 8,
  stopspeed: 10,
  accelerate: 10,
  airaccelerate: 10,
  aircap: 30,
  run: 200,
  sprint: 400,
  walk: 100,
  crouchMul: 0.3,
  duckTime: 0.3,
  jump: 200,
  step: 21, // block maps use half-block (20 unit) steps
  standMaxs: [16, 16, 72],
  duckMaxs: [16, 16, 36],
  mins: [-16, -16, 0],
  standEye: 64,
  duckEye: 28,
  maxVel: 3500,
  slideTime: 0.85, // a slide: how long it lasts (s), the fastest it pushes you, and the wait before another
  slideMax: 540,
  slideWait: 0.6,
  slideMin: 250, // you have to be going at least this fast (sprinting) to slide
};

export function newPlayerState(origin = [0, 0, 0]) {
  return { origin: origin.slice(), velocity: [0, 0, 0], onGround: false, ducked: false, duckAmt: 0, jumpHeld: false, waterLevel: 0, landSpeed: 0 };
}

export function copyState(s) {
  return { ...s, origin: s.origin.slice(), velocity: s.velocity.slice() };
}

export function hullMaxs(ps) {
  return ps.ducked ? MV.duckMaxs : MV.standMaxs;
}

export function eyeHeight(ps) {
  return MV.standEye + (MV.duckEye - MV.standEye) * ps.duckAmt;
}

// cmd: { fwd, side, up (-1..1), buttons, yaw, pitch (degrees) }, dt seconds
// Room rules scale the defaults: { gravity, speed, jump } (1 = Garry's Mod defaults).
export const DEFAULT_RULES = { gravity: 1, speed: 1, jump: 1 };

export function pmove(world, ps, cmd, dt, rules = DEFAULT_RULES) {
  ps.landSpeed = 0;
  const yaw = (cmd.yaw * Math.PI) / 180, pitch = (cmd.pitch * Math.PI) / 180;
  const fx = Math.cos(yaw), fy = Math.sin(yaw);
  const rx = Math.sin(yaw), ry = -Math.cos(yaw);

  if (ps.downed) cmd = { ...cmd, buttons: (cmd.buttons | BTN.DUCK) & ~(BTN.JUMP | BTN.SPRINT) };
  duck(world, ps, cmd, dt);
  slide(ps, cmd, dt);
  waterCheck(world, ps);

  let maxspeed = cmd.buttons & BTN.SPRINT ? MV.sprint : cmd.buttons & BTN.WALK ? MV.walk : MV.run;
  // per-player boosts ride along in the state so prediction matches: haste powerup, zombie speed
  maxspeed *= rules.speed * (ps.haste > ps.time ? POWERS.haste.mul : 1) * (ps.speedMul || 1);
  if (ps.ducked) maxspeed *= MV.crouchMul;

  const fmove = cmd.fwd * maxspeed, smove = cmd.side * maxspeed;

  if (ps.waterLevel >= 2) {
    waterMove(world, ps, cmd, dt, fmove, smove, maxspeed, pitch, fx, fy, rx, ry);
    categorize(world, ps);
    return ps;
  }

  categorize(world, ps);

  if (cmd.buttons & BTN.JUMP) {
    if (ps.onGround && !ps.jumpHeld) {
      ps.velocity[2] = MV.jump * rules.jump * (ps.boots > ps.time ? POWERS.boots.mul : 1);
      ps.onGround = false;
      ps.jumped = true;
    }
    ps.jumpHeld = true;
  } else ps.jumpHeld = false;

  if (ps.onGround) friction(ps, ps.slide > 0 ? dt * 0.08 : dt); // sliding: hardly any friction

  let wx = fx * fmove + rx * smove, wy = fy * fmove + ry * smove;
  let wishspeed = Math.hypot(wx, wy);
  if (wishspeed > 0) { wx /= wishspeed; wy /= wishspeed; }
  if (wishspeed > maxspeed) wishspeed = maxspeed;

  if (ps.onGround) {
    ps.velocity[2] = 0;
    accelerate(ps, wx, wy, 0, wishspeed, MV.accelerate, dt);
    walkMove(world, ps, dt);
  } else {
    ps.velocity[2] -= MV.gravity * rules.gravity * dt * 0.5;
    airAccelerate(ps, wx, wy, wishspeed, dt);
    slideMove(world, ps, dt);
    ps.velocity[2] -= MV.gravity * rules.gravity * dt * 0.5;
  }
  // a parachute (jumping out of a plane): fall slowly, and it's packed away once you land
  if (ps.chute) { if (ps.onGround) ps.chute = false; else if (ps.velocity[2] < -260) ps.velocity[2] = -260; }
  clampVel(ps);
  jumpPads(world, ps);
  const wasAir = !ps.onGround;
  const fallVel = -ps.velocity[2];
  categorize(world, ps);
  if (wasAir && ps.onGround) ps.landSpeed = fallVel;
  return ps;
}

// Standing on (or falling onto) a pad launches you with its velocity. Part of pmove, so prediction agrees.
function jumpPads(world, ps) {
  if (!world.pads || !world.pads.length) return;
  const o = ps.origin;
  for (const p of world.pads) {
    if (o[0] < p.mins[0] || o[0] > p.maxs[0] || o[1] < p.mins[1] || o[1] > p.maxs[1]) continue;
    if (o[2] < p.mins[2] - 2 || o[2] > p.maxs[2] + 6) continue;
    if (ps.velocity[2] > p.vel[2] * 0.5) continue; // already launched
    ps.velocity[0] = p.vel[0];
    ps.velocity[1] = p.vel[1];
    ps.velocity[2] = p.vel[2];
    ps.onGround = false;
    ps.padded = true;
  }
}

function clampVel(ps) {
  for (let i = 0; i < 3; i++) ps.velocity[i] = Math.max(-MV.maxVel, Math.min(MV.maxVel, ps.velocity[i]));
}

function duck(world, ps, cmd, dt) {
  const want = !!(cmd.buttons & BTN.DUCK);
  if (want && !ps.ducked) {
    if (!ps.onGround) ps.origin[2] += MV.standMaxs[2] - MV.duckMaxs[2]; // tuck legs in the air
    ps.ducked = true;
  } else if (!want && ps.ducked) {
    const o = ps.origin.slice();
    if (!ps.onGround) o[2] -= MV.standMaxs[2] - MV.duckMaxs[2];
    const tr = world.trace(o, o, MV.mins, MV.standMaxs);
    if (!tr.startsolid) {
      ps.origin = o;
      ps.ducked = false;
    }
  }
  const target = ps.ducked ? 1 : 0;
  ps.duckAmt += Math.sign(target - ps.duckAmt) * Math.min(Math.abs(target - ps.duckAmt), dt / MV.duckTime);
}

// Sliding: crouch while sprinting on the ground and you shoot forward low and fast, then slow to a crouch.
// Let go of crouch (or slow right down) to stop; jumping out of a slide keeps its speed.
function slide(ps, cmd, dt) {
  const want = !!(cmd.buttons & BTN.DUCK);
  const pressed = want && !ps.duckHeld;
  ps.duckHeld = want;
  if (ps.slideCd > 0) ps.slideCd = Math.max(0, ps.slideCd - dt);
  const speed = Math.hypot(ps.velocity[0], ps.velocity[1]);
  if (pressed && ps.onGround && ps.ducked && speed > MV.slideMin && !(ps.slide > 0) && !(ps.slideCd > 0) && !ps.downed) {
    const k = Math.max(speed, Math.min(MV.slideMax, speed * 1.3)) / speed;
    ps.velocity[0] *= k;
    ps.velocity[1] *= k;
    ps.slide = MV.slideTime;
    ps.slideCd = MV.slideTime + MV.slideWait;
  } else if (ps.slide > 0) {
    ps.slide = Math.max(0, ps.slide - dt);
    if (!want || !ps.ducked || speed < 110) ps.slide = 0;
  }
}

function waterCheck(world, ps) {
  const p = [ps.origin[0], ps.origin[1], ps.origin[2] + 1];
  ps.waterLevel = 0;
  const wet = CONTENTS.WATER | CONTENTS.SLIME;
  if (world.pointContents(p) & wet) {
    ps.waterLevel = 1;
    p[2] = ps.origin[2] + hullMaxs(ps)[2] * 0.5;
    if (world.pointContents(p) & wet) {
      ps.waterLevel = 2;
      p[2] = ps.origin[2] + eyeHeight(ps);
      if (world.pointContents(p) & wet) ps.waterLevel = 3;
    }
  }
}

function categorize(world, ps) {
  if (ps.velocity[2] > 140) {
    ps.onGround = false;
    return;
  }
  const end = [ps.origin[0], ps.origin[1], ps.origin[2] - 2];
  const tr = world.trace(ps.origin, end, MV.mins, hullMaxs(ps));
  if (tr.fraction < 1 && tr.normal[2] >= 0.7) {
    ps.onGround = true;
    if (!tr.startsolid) ps.origin[2] = tr.endpos[2];
  } else ps.onGround = false;
}

function friction(ps, dt) {
  const v = ps.velocity;
  const speed = Math.hypot(v[0], v[1], v[2]);
  if (speed < 0.1) {
    v[0] = v[1] = 0;
    return;
  }
  const control = speed < MV.stopspeed ? MV.stopspeed : speed;
  const ns = Math.max(0, speed - control * MV.friction * dt) / speed;
  v[0] *= ns; v[1] *= ns; v[2] *= ns;
}

function accelerate(ps, wx, wy, wz, wishspeed, accel, dt) {
  const v = ps.velocity;
  const cur = v[0] * wx + v[1] * wy + v[2] * wz;
  const add = wishspeed - cur;
  if (add <= 0) return;
  const a = Math.min(accel * dt * wishspeed, add);
  v[0] += a * wx; v[1] += a * wy; v[2] += a * wz;
}

function airAccelerate(ps, wx, wy, wishspeed, dt) {
  const v = ps.velocity;
  const wishspd = Math.min(wishspeed, MV.aircap);
  const cur = v[0] * wx + v[1] * wy;
  const add = wishspd - cur;
  if (add <= 0) return;
  const a = Math.min(MV.airaccelerate * wishspeed * dt, add);
  v[0] += a * wx; v[1] += a * wy;
}

function waterMove(world, ps, cmd, dt, fmove, smove, maxspeed, pitch, fx, fy, rx, ry) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  let wx = fx * cp * fmove + rx * smove, wy = fy * cp * fmove + ry * smove, wz = -sp * fmove;
  if (cmd.buttons & BTN.JUMP) wz += maxspeed;
  else if (!fmove && !smove) wz -= 60;
  let ws = Math.hypot(wx, wy, wz);
  if (ws > 0) { wx /= ws; wy /= ws; wz /= ws; }
  ws = Math.min(ws, maxspeed) * 0.8;
  const v = ps.velocity;
  const speed = Math.hypot(v[0], v[1], v[2]);
  if (speed > 0) {
    const ns = Math.max(0, speed - dt * speed * MV.friction) / speed;
    v[0] *= ns; v[1] *= ns; v[2] *= ns;
  }
  accelerate(ps, wx, wy, wz, ws, MV.accelerate, dt);
  slideMove(world, ps, dt);
}

const _planes = [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]];

function clip(v, n, overbounce) {
  const back = (v[0] * n[0] + v[1] * n[1] + v[2] * n[2]) * overbounce;
  for (let i = 0; i < 3; i++) v[i] -= n[i] * back;
  const adjust = v[0] * n[0] + v[1] * n[1] + v[2] * n[2];
  if (adjust < 0) for (let i = 0; i < 3; i++) v[i] -= n[i] * adjust;
}

export function slideMove(world, ps, dt) {
  const maxs = hullMaxs(ps);
  const v = ps.velocity;
  const primal = v.slice();
  let time = dt, np = 0;
  for (let bump = 0; bump < 4; bump++) {
    if (!v[0] && !v[1] && !v[2]) break;
    const end = [ps.origin[0] + v[0] * time, ps.origin[1] + v[1] * time, ps.origin[2] + v[2] * time];
    const tr = world.trace(ps.origin, end, MV.mins, maxs);
    if (tr.allsolid) {
      v[0] = v[1] = v[2] = 0;
      return;
    }
    if (tr.fraction > 0) {
      ps.origin[0] = tr.endpos[0]; ps.origin[1] = tr.endpos[1]; ps.origin[2] = tr.endpos[2];
      np = 0;
    }
    if (tr.fraction === 1) break;
    time -= time * tr.fraction;
    if (np >= 5) {
      v[0] = v[1] = v[2] = 0;
      break;
    }
    _planes[np][0] = tr.normal[0]; _planes[np][1] = tr.normal[1]; _planes[np][2] = tr.normal[2];
    np++;
    let i;
    for (i = 0; i < np; i++) {
      clip(v, _planes[i], ps.onGround || _planes[i][2] < 0.7 ? 1 : 1);
      let j;
      for (j = 0; j < np; j++) {
        if (j !== i && v[0] * _planes[j][0] + v[1] * _planes[j][1] + v[2] * _planes[j][2] < 0) break;
      }
      if (j === np) break;
    }
    if (i === np) {
      if (np !== 2) {
        v[0] = v[1] = v[2] = 0;
        break;
      }
      const a = _planes[0], b = _planes[1];
      const dir = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const d = dir[0] * v[0] + dir[1] * v[1] + dir[2] * v[2];
      v[0] = dir[0] * d; v[1] = dir[1] * d; v[2] = dir[2] * d;
    }
    if (v[0] * primal[0] + v[1] * primal[1] + v[2] * primal[2] <= 0) {
      v[0] = v[1] = v[2] = 0;
      break;
    }
  }
}

function walkMove(world, ps, dt) {
  const maxs = hullMaxs(ps);
  const v = ps.velocity;
  if (!v[0] && !v[1]) return;
  const dest = [ps.origin[0] + v[0] * dt, ps.origin[1] + v[1] * dt, ps.origin[2]];
  let tr = world.trace(ps.origin, dest, MV.mins, maxs);
  if (tr.fraction === 1) {
    ps.origin = tr.endpos.slice();
    stayOnGround(world, ps);
    return;
  }
  // try the plain slide and the stepped-up slide, keep whichever went further
  const start = ps.origin.slice(), startV = v.slice();
  slideMove(world, ps, dt);
  const downPos = ps.origin.slice(), downVel = ps.velocity.slice();

  ps.origin = start.slice();
  ps.velocity = startV.slice();
  tr = world.trace(start, [start[0], start[1], start[2] + MV.step], MV.mins, maxs);
  if (!tr.startsolid && !tr.allsolid) ps.origin = tr.endpos.slice();
  slideMove(world, ps, dt);
  tr = world.trace(ps.origin, [ps.origin[0], ps.origin[1], ps.origin[2] - MV.step], MV.mins, maxs);
  if (!tr.startsolid && !tr.allsolid) ps.origin = tr.endpos.slice();
  const upOk = tr.fraction < 1 && tr.normal[2] >= 0.7;
  const dDown = (downPos[0] - start[0]) ** 2 + (downPos[1] - start[1]) ** 2;
  const dUp = (ps.origin[0] - start[0]) ** 2 + (ps.origin[1] - start[1]) ** 2;
  if (!upOk || dDown > dUp) {
    ps.origin = downPos;
    ps.velocity = downVel;
  } else {
    ps.velocity[2] = downVel[2];
  }
  stayOnGround(world, ps);
}

function stayOnGround(world, ps) {
  const maxs = hullMaxs(ps);
  const up = [ps.origin[0], ps.origin[1], ps.origin[2] + 2];
  let tr = world.trace(ps.origin, up, MV.mins, maxs);
  const start = tr.endpos.slice();
  tr = world.trace(start, [start[0], start[1], start[2] - MV.step - 2], MV.mins, maxs);
  if (tr.fraction > 0 && tr.fraction < 1 && !tr.startsolid && tr.normal[2] >= 0.7) {
    if (Math.abs(ps.origin[2] - tr.endpos[2]) > 0.5) ps.origin = tr.endpos.slice();
  }
}
