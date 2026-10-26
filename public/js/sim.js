// Gameplay rules shared by server and client prediction: weapon state machine, aiming, hit boxes, damage.
import { WEAPONS, WEAPON_INDEX, LOADOUTS, ZOMBIE } from './weapons.js';
import { BTN, eyeHeight } from './pmove.js';
import { rayAABB } from './collide.js';
import { packCar, unpackCar } from './vehicle.js';

export const MAX_HP = 100, MAX_ARMOR = 100;

export function initLoadout(ps, preset = 'default') {
  const L = LOADOUTS[preset] || LOADOUTS.default;
  ps.owned = 0;
  ps.clips = WEAPONS.map((w) => (w.clip > 0 ? w.clip : -1));
  ps.ammo = {};
  for (const w of WEAPONS) if (w.ammo) ps.ammo[w.ammo] = 0;
  for (const id of L.weapons) {
    const i = WEAPON_INDEX[id];
    giveWeapon(ps, i);
    if (L.full && WEAPONS[i].ammo) ps.ammo[WEAPONS[i].ammo] = WEAPONS[i].maxAmmo;
  }
  // start holding the SMG if we have one, otherwise the last weapon of the preset
  ps.cur = L.weapons.includes('smg1') ? WEAPON_INDEX.smg1 : WEAPON_INDEX[L.weapons[L.weapons.length - 1]];
  ps.nextAttack = 0;
  ps.reloadEnd = 0;
  ps.time = ps.time || 0;
  ps.attackHeld = false;
  ps.hp = MAX_HP;
  ps.armor = 0;
  ps.alive = true;
}

// Zombies (infection mode): claws only, more health, a bit faster.
export function zombieLoadout(ps, hp = ZOMBIE.hp) {
  ps.owned = 1 << WEAPON_INDEX.claws;
  ps.cur = WEAPON_INDEX.claws;
  ps.reloadEnd = 0;
  ps.hp = hp;
  ps.armor = 0;
  ps.speedMul = ZOMBIE.speed;
  ps.haste = ps.boots = ps.dmgBoost = 0;
}

export function giveWeapon(ps, idx) {
  const w = WEAPONS[idx];
  const had = (ps.owned >> idx) & 1;
  ps.owned |= 1 << idx;
  if (w.ammo) ps.ammo[w.ammo] = Math.min(w.maxAmmo, (ps.ammo[w.ammo] || 0) + (had ? w.clip : w.spawnAmmo));
  return !had;
}

// Source view angles: pitch positive looks down.
export function viewDir(yaw, pitch, out = [0, 0, 0]) {
  const y = (yaw * Math.PI) / 180, p = (pitch * Math.PI) / 180;
  out[0] = Math.cos(p) * Math.cos(y);
  out[1] = Math.cos(p) * Math.sin(y);
  out[2] = -Math.sin(p);
  return out;
}

export function eyePos(ps) {
  return [ps.origin[0], ps.origin[1], ps.origin[2] + eyeHeight(ps)];
}

// Small deterministic RNG so client and server agree on bullet spread for the same command.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export function spreadDirs(w, yaw, pitch, seed, zoomed = false) {
  const r = rng(seed * 2654435761);
  const f = viewDir(yaw, pitch);
  const y = (yaw * Math.PI) / 180, p = (pitch * Math.PI) / 180;
  const right = [Math.sin(y), -Math.cos(y), 0];
  const up = [Math.sin(p) * Math.cos(y), Math.sin(p) * Math.sin(y), Math.cos(p)];
  const out = [];
  for (let i = 0; i < (w.pellets || 1); i++) {
    // gaussian-ish cone like the engine's shotgun pattern
    const sp = zoomed && w.zoomSpread !== undefined ? w.zoomSpread : w.spread || 0;
    const a = (r() + r() - 1) * sp, b = (r() + r() - 1) * sp;
    const d = [f[0] + right[0] * a + up[0] * b, f[1] + right[1] * a + up[1] * b, f[2] + right[2] * a + up[2] * b];
    const l = Math.hypot(d[0], d[1], d[2]);
    out.push([d[0] / l, d[1] / l, d[2] / l]);
  }
  return out;
}

// Advances the weapon state for one command. fire(weaponIndex) and ev(name) are callbacks.
export function weaponThink(ps, cmd, dt, fire, ev) {
  ps.time += dt;
  if (!ps.alive) return;
  if (cmd.w !== undefined && cmd.w !== ps.cur && cmd.w >= 0 && (ps.owned >> cmd.w) & 1) {
    ps.cur = cmd.w;
    ps.reloadEnd = 0;
    ps.nextAttack = ps.time + 0.45;
    ev && ev('draw');
  }
  const W = WEAPONS[ps.cur];
  const c = ps.cur;
  const attack = !!(cmd.buttons & BTN.ATTACK);

  if (ps.reloadEnd && ps.time >= ps.reloadEnd) {
    if (W.shellReload) {
      if (ps.clips[c] < W.clip && ps.ammo[W.ammo] > 0) {
        ps.clips[c]++;
        ps.ammo[W.ammo]--;
      }
      if (ps.clips[c] < W.clip && ps.ammo[W.ammo] > 0 && !attack) {
        ps.reloadEnd = ps.time + W.reload * (ps.reloadMul || 1);
        ev && ev('reloadshell');
      } else {
        ps.reloadEnd = 0;
        ps.nextAttack = ps.time + 0.4;
        ev && ev('reloadfinish');
      }
    } else {
      const take = Math.min(W.clip - ps.clips[c], ps.ammo[W.ammo]);
      ps.clips[c] += take;
      ps.ammo[W.ammo] -= take;
      ps.reloadEnd = 0;
    }
  }

  // shotguns can interrupt a reload to fire
  if (attack && W.shellReload && ps.reloadEnd && ps.clips[c] > 0 && !ps.attackHeld) {
    ps.reloadEnd = 0;
    ps.nextAttack = Math.max(ps.nextAttack, ps.time);
  }

  const wantReload = cmd.buttons & BTN.RELOAD || (attack && ps.clips[c] === 0);
  if (W.ammo && wantReload && !ps.reloadEnd && ps.clips[c] < W.clip && ps.ammo[W.ammo] > 0 && ps.time >= ps.nextAttack) {
    ps.reloadEnd = ps.time + (W.shellReload ? 0.5 : W.reload) * (ps.reloadMul || 1);
    ev && ev(W.shellReload ? 'reloadstart' : 'reload');
  }

  if (attack && !ps.reloadEnd && ps.time >= ps.nextAttack && !(W.semi && ps.attackHeld)) {
    if (W.melee || ps.clips[c] > 0) {
      if (!W.melee) ps.clips[c]--;
      ps.nextAttack = ps.time + W.rate * (ps.rateMul || 1);
      fire(c);
    } else if (!ps.attackHeld) {
      ps.nextAttack = ps.time + 0.25;
      ev && ev('empty');
    }
  }
  // single-shot launchers load the next round on their own
  if (W.autoReload && ps.clips[c] === 0 && ps.ammo[W.ammo] > 0 && !ps.reloadEnd && ps.time >= ps.nextAttack) {
    ps.reloadEnd = ps.time + W.reload * (ps.reloadMul || 1);
    ev && ev('reload');
  }
  ps.attackHeld = attack;
}

// Hit volumes for a player at a (possibly rewound) position. Returns {frac, head} or null.
export function hitTest(start, end, origin, ducked) {
  const eye = ducked ? 28 : 64;
  const head = rayAABB(start, end, [origin[0] - 7, origin[1] - 7, origin[2] + eye - 6], [origin[0] + 7, origin[1] + 7, origin[2] + eye + 8]);
  const body = rayAABB(start, end, [origin[0] - 13, origin[1] - 13, origin[2]], [origin[0] + 13, origin[1] + 13, origin[2] + eye - 6]);
  if (head < 0 && body < 0) return null;
  if (head >= 0 && (body < 0 || head <= body)) return { frac: head, head: true };
  return { frac: body, head: false };
}

// HL2-style armour: absorbs 80% of damage, one armour point per point absorbed.
export function applyDamage(ps, dmg) {
  if (ps.armor > 0) {
    const absorbed = Math.min(dmg * 0.8, ps.armor);
    ps.armor -= Math.round(absorbed);
    dmg -= absorbed;
  }
  ps.hp -= Math.round(dmg);
  return ps.hp <= 0;
}

export function fallDamage(speed) {
  if (speed <= 526.5) return 0;
  return Math.round((speed - 526.5) * (100 / (922.5 - 526.5)));
}

// Compact state for the wire (own player only; others get less).
export function packOwn(ps) {
  return {
    o: ps.origin.map(r1), v: ps.velocity.map(r1), g: ps.onGround ? 1 : 0, d: ps.ducked ? 1 : 0, da: +ps.duckAmt.toFixed(3), jh: ps.jumpHeld ? 1 : 0,
    t: +ps.time.toFixed(4), cur: ps.cur, ow: ps.owned, cl: ps.clips, am: ps.ammo, na: +ps.nextAttack.toFixed(4), re: +ps.reloadEnd.toFixed(4), ah: ps.attackHeld ? 1 : 0,
    hp: ps.hp, ar: ps.armor, al: ps.alive ? 1 : 0,
    // powerup end times (player clock) and the zombie speed: prediction needs them
    pw: [+(ps.haste || 0).toFixed(3), +(ps.boots || 0).toFixed(3), +(ps.dmgBoost || 0).toFixed(3)], sm: ps.speedMul || 1,
    // zombies perks (fire rate, reload time) and being downed
    rm: ps.rateMul || 1, lm: ps.reloadMul || 1, dn: ps.downed ? 1 : 0,
    // free roam: the car you're driving, or the seat you ride in
    car: ps.car ? packCar(ps.car) : 0, st: ps.seat ? [ps.seat.v, ps.seat.s] : 0, ch: ps.chute ? 1 : 0,
  };
}

export function unpackOwn(m, ps) {
  ps.origin = m.o.slice(); ps.velocity = m.v.slice(); ps.onGround = !!m.g; ps.ducked = !!m.d; ps.duckAmt = m.da; ps.jumpHeld = !!m.jh;
  ps.time = m.t; ps.cur = m.cur; ps.owned = m.ow; ps.clips = m.cl.slice(); ps.ammo = { ...m.am }; ps.nextAttack = m.na; ps.reloadEnd = m.re; ps.attackHeld = !!m.ah;
  ps.hp = m.hp; ps.armor = m.ar; ps.alive = !!m.al;
  [ps.haste, ps.boots, ps.dmgBoost] = m.pw || [0, 0, 0];
  ps.speedMul = m.sm || 1;
  ps.rateMul = m.rm || 1;
  ps.reloadMul = m.lm || 1;
  ps.downed = !!m.dn;
  ps.car = m.car ? unpackCar(m.car) : null;
  ps.seat = m.st ? { v: m.st[0], s: m.st[1] } : null;
  ps.chute = !!m.ch;
  return ps;
}

function r1(v) {
  return Math.round(v * 100) / 100;
}
