// Projectile flight shared by the server (authoritative hits) and clients (drawing between server events).
import { MV } from './pmove.js';

const PMIN = [-2, -2, -2], PMAX = [2, 2, 2];

// Starting position and velocity for a projectile fired from eye along dir.
export function launch(world, W, eye, dir) {
  const P = W.proj;
  const vel = [dir[0] * P.speed, dir[1] * P.speed, dir[2] * P.speed + (P.up || 0)];
  // start a little in front of the face, but never inside a wall we're hugging
  const want = [eye[0] + dir[0] * 18, eye[1] + dir[1] * 18, eye[2] + dir[2] * 18 - 4];
  const tr = world.trace(eye, want, PMIN, PMAX);
  return { pos: tr.endpos.slice(), vel, t: 0 };
}

// Advance one step. Returns null while flying, { hit: true, normal } on impact (non-bouncing),
// { bounce: true } after a bounce. Resting grenades just stop.
export function stepProj(world, pr, P, dt) {
  pr.t += dt;
  if (pr.rest) return null;
  pr.vel[2] -= MV.gravity * (P.gravity || 0) * dt;
  const end = [pr.pos[0] + pr.vel[0] * dt, pr.pos[1] + pr.vel[1] * dt, pr.pos[2] + pr.vel[2] * dt];
  const tr = world.trace(pr.pos, end, PMIN, PMAX);
  if (tr.fraction >= 1) {
    pr.pos = end;
    return null;
  }
  const n = tr.normal;
  pr.pos = [tr.endpos[0] + n[0] * 0.5, tr.endpos[1] + n[1] * 0.5, tr.endpos[2] + n[2] * 0.5];
  if (!P.bounce) return { hit: true, normal: n.slice(), box: tr.box };
  const vn = pr.vel[0] * n[0] + pr.vel[1] * n[1] + pr.vel[2] * n[2];
  for (let k = 0; k < 3; k++) pr.vel[k] = (pr.vel[k] - 2 * vn * n[k]) * P.bounce;
  if (n[2] > 0.7 && Math.hypot(...pr.vel) < 40) {
    pr.vel = [0, 0, 0];
    pr.rest = true;
  }
  return { bounce: true, speed: Math.abs(vn) };
}
