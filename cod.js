// Zombies (rounds, co-op), in the style of Call of Duty zombies: endless rounds of AI zombies that get tougher,
// points for every hit and kill, spent on wall weapons, the mystery box, perk machines and barricaded doors.
// Downed players can be revived; the game is over when nobody is left standing.
import { MASK_SHOT } from './public/js/collide.js';
import { pmove, newPlayerState, BTN } from './public/js/pmove.js';
import { WEAPONS, WEAPON_INDEX, PERKS, WALL_COST, BOX_COST, BOX_POOL } from './public/js/weapons.js';
import { giveWeapon } from './public/js/sim.js';
import { nearestNode, flowField } from './public/js/nav.js';

const D = 180 / Math.PI;
const START_POINTS = 500;
const DROP_KINDS = ['maxammo', 'instakill', 'double', 'nuke'];
const PERK_ORDER = ['quick', 'jugg', 'speed', 'double', 'stamina'];
const WALL_ORDER = ['357', 'smg1', 'shotgun', 'ar2', 'crossbow', 'grenade', 'autoshotgun', 'sniper', 'lmg'];

// zombies per round for n players, their health and how many may be up at once
const roundTotal = (r, n) => Math.round((r <= 5 ? [6, 8, 13, 18, 24][r - 1] : 24 + (r - 5) * 5) * (1 + 0.5 * (n - 1)));
const roundHp = (r) => (r <= 9 ? 100 + 50 * (r - 1) : Math.round(500 * 1.1 ** (r - 9)));
const maxAlive = (n) => Math.min(24, 10 + 6 * n);
function rollSpeed(r) {
  const x = Math.random();
  if (r <= 2) return 0.55;
  if (r <= 5) return x < 0.6 ? 0.55 : 1;
  if (r <= 9) return x < 0.3 ? 0.6 : 1.05;
  return x < 0.5 ? 1.05 : 1.4;
}

// def: the map ({ items, spawns, doors?, buys?, zstart? }); nav: navigation with the doors tagged
// api: { pushEvent, info(p), respawn(p), kill(p, weapon), damage(p, dmg, dir), endMatch(win, extra) }
export function createZombies(R, def, nav, doorBoxes, api) {
  const cz = {
    phase: 'waiting', round: 0, nextAt: 0, toSpawn: 0, spawnAt: 0, zombies: new Map(), nextId: 1,
    insta: 0, double: 0, drops: [], dropId: 1, dropsThisRound: 0, flow: null, flowAt: -1, startSpawns: null,
    doors: (def.doors || []).map((d, i) => ({ i, box: doorBoxes[i], mins: d.mins, maxs: d.maxs, cost: d.cost, name: d.name || 'Debris', open: false })),
    buys: [],
  };
  const doorOpen = (d) => cz.doors[d].open;
  const humans = () => [...R.players.values()].filter((p) => !p.bot);
  const standing = () => humans().filter((p) => p.ps.alive && !p.ps.downed);

  // ---- what's for sale: the map's own list, or made from its item spots (box, perks, then wall weapons)
  if (def.buys) cz.buys = def.buys.map((b, i) => ({ i, ...b, cost: b.kind === 'box' ? BOX_COST : b.kind === 'perk' ? PERKS[b.what].cost : WALL_COST[b.what] }));
  else {
    def.items.forEach((it, i) => {
      const o = it.o.slice();
      if (i === 0) cz.buys.push({ i, kind: 'box', o, cost: BOX_COST });
      else if (i <= PERK_ORDER.length) cz.buys.push({ i, kind: 'perk', what: PERK_ORDER[i - 1], o, cost: PERKS[PERK_ORDER[i - 1]].cost });
      else if (i <= PERK_ORDER.length + WALL_ORDER.length) { const w = WALL_ORDER[i - 1 - PERK_ORDER.length]; cz.buys.push({ i, kind: 'wall', what: w, o, cost: WALL_COST[w] }); }
    });
  }

  // ---- players start in the starting area (what's reachable from it with every door shut)
  {
    const from = def.zstart ? nearestNode(nav, def.zstart, true) : null;
    if (from) {
      const f = flowField(nav, [from], () => false);
      const inside = def.spawns.filter((s) => { const n = nearestNode(nav, s.origin, true); return n && Number.isFinite(f[n.i]); });
      // a few more open spots in there so a full game doesn't start on top of each other
      const open = nav.nodes.filter((n) => Number.isFinite(f[n.i]) && n.n.length === 8 && n.z < 40);
      for (let k = 0; k < 400 && inside.length < 12 && open.length; k++) {
        const n = open[(k * 7919) % open.length];
        if (inside.every((s) => Math.hypot(s.origin[0] - n.x, s.origin[1] - n.y) > 160)) inside.push({ origin: [n.x, n.y, n.z], yaw: Math.round((Math.atan2(def.zstart[1] - n.y, def.zstart[0] - n.x) * 180) / Math.PI) });
      }
      if (inside.length) cz.startSpawns = inside;
    }
  }

  cz.alive = () => cz.zombies.values();

  cz.welcome = () => ({
    buys: cz.buys.map((b) => [b.i, b.kind, b.o.map(Math.round), b.cost, b.what || null]),
    doors: cz.doors.map((d) => [d.i, d.mins, d.maxs, d.cost, d.open ? 1 : 0, d.name]),
    drops: cz.drops.map((d) => [d.id, d.k, d.o.map(Math.round)]),
  });

  cz.join = (p) => { p.points = START_POINTS; p.perks = 0; };

  // after any respawn: starting weapons, no perks
  cz.loadout = (p) => {
    const ps = p.ps;
    ps.maxHp = 100;
    ps.speedMul = ps.rateMul = ps.reloadMul = 1;
    ps.downed = false;
    p.perks = 0;
    p.reviveProg = 0;
  };

  // ---- shooting zombies
  cz.hurt = (z, attacker, dmg, weapon, head, dir) => {
    if (z.hp <= 0) return;
    const t = R.time;
    if (t < cz.insta) dmg = z.hp;
    z.hp -= dmg;
    const mul = t < cz.double ? 2 : 1;
    if (attacker && !attacker.bot) attacker.points += 10 * mul;
    if (dir) { z.ps.velocity[0] += dir[0] * Math.min(120, dmg * 2); z.ps.velocity[1] += dir[1] * Math.min(120, dmg * 2); }
    if (z.hp > 0) return;
    const melee = WEAPONS[WEAPON_INDEX[weapon]]?.melee;
    if (attacker && !attacker.bot) { attacker.points += (melee ? 120 : head ? 90 : 50) * mul; attacker.frags++; }
    die(z, head, attacker);
  };

  function die(z, head) {
    cz.zombies.delete(z.id);
    api.pushEvent({ e: 'zdie', id: z.id, o: z.ps.origin.map(Math.round), y: Math.round(z.yaw), vv: z.ps.velocity.map(Math.round), hs: head ? 1 : 0 });
    // a power-up now and then (a few per round at most)
    if (cz.dropsThisRound < 4 && Math.random() < 0.03) {
      cz.dropsThisRound++;
      const d = { id: cz.dropId++, k: DROP_KINDS[(Math.random() * DROP_KINDS.length) | 0], o: [z.ps.origin[0], z.ps.origin[1], z.ps.origin[2]], until: R.time + 25 };
      cz.drops.push(d);
      api.pushEvent({ e: 'drop', id: d.id, k: d.k, o: d.o.map(Math.round) });
    }
  }

  // ---- getting downed instead of dying; returns false when the player should just die
  cz.down = (p) => {
    const ps = p.ps;
    const others = standing().filter((o) => o !== p);
    const quick = p.perks & PERKS.quick.bit;
    if (!others.length && !quick) return false;
    ps.downed = true;
    ps.hp = 100;
    p.bleedAt = R.time + 30;
    p.reviveProg = 0;
    p.selfRevive = !others.length ? R.time + 5 : 0; // solo with Quick Revive gets up on their own (once: perks are lost)
    // downed players lose their perks and fight on with a pistol
    cz.loadout(p);
    ps.downed = true;
    if (!((ps.owned >> WEAPON_INDEX.pistol) & 1)) giveWeapon(ps, WEAPON_INDEX.pistol);
    ps.cur = WEAPON_INDEX.pistol;
    ps.reloadEnd = 0;
    api.pushEvent({ e: 'down', id: p.id });
    return true;
  };

  function revive(p, by) {
    p.ps.downed = false;
    p.ps.hp = 100;
    p.reviveProg = 0;
    p.selfRevive = 0;
    api.pushEvent({ e: 'revive', id: p.id, by: by ? by.id : 0 });
  }

  // ---- buying: E near a wall weapon, the box, a perk machine or a barricade
  cz.use = (p) => {
    const ps = p.ps;
    if (!ps.alive || ps.downed) return;
    let pick = null, bd = Infinity;
    for (const b of cz.buys) {
      const d = Math.hypot(b.o[0] - ps.origin[0], b.o[1] - ps.origin[1]);
      if (d < 72 && Math.abs(b.o[2] - ps.origin[2]) < 90 && d < bd) { bd = d; pick = b; }
    }
    for (const d of cz.doors) {
      if (d.open) continue;
      const dx = Math.max(d.mins[0] - ps.origin[0], 0, ps.origin[0] - d.maxs[0]), dy = Math.max(d.mins[1] - ps.origin[1], 0, ps.origin[1] - d.maxs[1]);
      const dist = Math.hypot(dx, dy);
      if (dist < 80 && ps.origin[2] < d.maxs[2] && ps.origin[2] + 72 > d.mins[2] && dist < bd) { bd = dist; pick = { door: d }; }
    }
    if (!pick) return;
    const pay = (cost) => {
      if (p.points < cost) { api.pushEvent({ e: 'nobuy', cost }, p.id); return false; }
      p.points -= cost;
      return true;
    };
    if (pick.door) {
      const d = pick.door;
      if (!pay(d.cost)) return;
      d.open = true;
      R.map.world.setEnabled(d.box, false);
      cz.flowAt = -1; // zombies can come through now
      api.pushEvent({ e: 'door', i: d.i, id: p.id });
      return;
    }
    if (pick.kind === 'wall') {
      const wi = WEAPON_INDEX[pick.what], W = WEAPONS[wi];
      const owned = (ps.owned >> wi) & 1;
      if (owned) {
        // ammo for half price when there's room for more
        if (ps.ammo[W.ammo] >= W.maxAmmo && ps.clips[wi] >= W.clip) return;
        if (!pay(Math.round(pick.cost / 2))) return;
      } else if (!pay(pick.cost)) return;
      if (!owned) giveWeapon(ps, wi);
      ps.ammo[W.ammo] = W.maxAmmo;
      ps.clips[wi] = W.clip;
      api.pushEvent({ e: 'buy', id: p.id, w: wi, k: 'wall' });
    } else if (pick.kind === 'box') {
      if (!pay(pick.cost)) return;
      const pool = BOX_POOL.filter((id) => !((ps.owned >> WEAPON_INDEX[id]) & 1));
      const id = (pool.length ? pool : BOX_POOL)[(Math.random() * (pool.length || BOX_POOL.length)) | 0];
      const wi = WEAPON_INDEX[id], W = WEAPONS[wi];
      giveWeapon(ps, wi);
      ps.ammo[W.ammo] = W.maxAmmo;
      ps.clips[wi] = W.clip;
      api.pushEvent({ e: 'buy', id: p.id, w: wi, k: 'box' });
    } else if (pick.kind === 'perk') {
      const P = PERKS[pick.what];
      if (p.perks & P.bit) return;
      if (!pay(pick.cost)) return;
      p.perks |= P.bit;
      applyPerk(ps, pick.what);
      api.pushEvent({ e: 'buy', id: p.id, perk: pick.what, k: 'perk' });
    }
  };

  function applyPerk(ps, what) {
    if (what === 'jugg') { ps.maxHp = 250; ps.hp = 250; }
    if (what === 'speed') ps.reloadMul = 0.5;
    if (what === 'double') ps.rateMul = 0.7;
    if (what === 'stamina') ps.speedMul = 1.15;
  }

  // ---- power-ups
  function power(k, by) {
    const t = R.time;
    if (k === 'instakill') cz.insta = t + 30;
    if (k === 'double') cz.double = t + 30;
    if (k === 'maxammo') for (const p of humans()) for (const W of WEAPONS) if (W.ammo && (p.ps.owned >> WEAPON_INDEX[W.id]) & 1) p.ps.ammo[W.ammo] = W.maxAmmo;
    if (k === 'nuke') {
      for (const z of [...cz.zombies.values()]) die(z, false);
      for (const p of humans()) p.points += 400;
    }
    api.pushEvent({ e: 'power', k, id: by.id });
  }

  // ---- a zombie appears somewhere the players can't see, not too far away, that can reach them
  function spawnZombie() {
    const f = cz.flow;
    if (!f) return false;
    const eyes = standing().map((p) => [p.ps.origin[0], p.ps.origin[1], p.ps.origin[2] + 64]);
    const ok = (n, lo, hi, hidden) => {
      const d = f[n.i];
      if (!Number.isFinite(d) || d < lo || d > hi) return false;
      if (!hidden) return true;
      const c = [n.x, n.y, n.z + 40];
      return eyes.every((e) => R.map.world.trace(e, c, [0, 0, 0], [0, 0, 0], MASK_SHOT).fraction < 1);
    };
    let node = null;
    for (let k = 0; k < 60 && !node; k++) { const n = nav.nodes[(Math.random() * nav.nodes.length) | 0]; if (ok(n, 22, 80, true)) node = n; }
    for (let k = 0; k < 120 && !node; k++) { const n = nav.nodes[(Math.random() * nav.nodes.length) | 0]; if (ok(n, 10, 140, false)) node = n; }
    if (!node) return false;
    const ps = newPlayerState([node.x, node.y, node.z + 1]);
    ps.time = 0;
    ps.alive = true;
    const speed = rollSpeed(cz.round);
    ps.speedMul = speed;
    const hp = roundHp(cz.round);
    const z = { id: -(cz.nextId++), isZombie: true, ps, hp, speed, yaw: Math.random() * 360, atkAt: 0, cool: 0, node, nodeAt: 0, stuckPos: ps.origin.slice(), stuckAt: R.time, stuckN: 0, jump: false, seeAt: 0, sees: false };
    cz.zombies.set(z.id, z);
    return true;
  }

  // ---- every tick
  cz.think = (dt) => {
    const t = R.time;
    const all = humans();
    if (!all.length) {
      // nobody here: reset to waiting so whoever comes next starts at round one
      if (cz.phase !== 'waiting') { cz.zombies.clear(); cz.phase = 'waiting'; cz.round = 0; for (const d of cz.drops) api.pushEvent({ e: 'dropgone', id: d.id }); cz.drops = []; }
      return;
    }
    if (cz.phase === 'over') return;
    const up = standing();
    if (cz.phase === 'waiting') { cz.phase = 'break'; cz.nextAt = t + 8; }
    // game over: everyone down or dead
    if (cz.round > 0 && !up.length) {
      cz.phase = 'over';
      api.endMatch('gameover', { round: cz.round });
      return;
    }
    if (cz.phase === 'break' && t >= cz.nextAt) {
      cz.round++;
      cz.phase = 'round';
      cz.toSpawn = roundTotal(cz.round, all.length);
      cz.spawnAt = t + 2;
      cz.dropsThisRound = 0;
      for (const p of all) if (!p.ps.alive) api.respawn(p);
      api.pushEvent({ e: 'round', n: cz.round });
    }
    if (cz.phase === 'round' && !cz.toSpawn && !cz.zombies.size) {
      cz.phase = 'break';
      cz.nextAt = t + 10;
      api.pushEvent({ e: 'roundend', n: cz.round });
    }

    // where the players are, as seen from every floor spot (shut doors in the way)
    if (t - cz.flowAt > 0.35) {
      cz.flowAt = t;
      const src = up.map((p) => nearestNode(nav, p.ps.origin)).filter(Boolean);
      cz.flow = src.length ? flowField(nav, src, doorOpen) : null;
    }
    if (cz.phase === 'round' && cz.toSpawn > 0 && cz.zombies.size < maxAlive(all.length) && t >= cz.spawnAt) {
      if (spawnZombie()) cz.toSpawn--;
      cz.spawnAt = t + Math.max(0.35, 2.2 - 0.15 * cz.round);
    }

    for (const z of [...cz.zombies.values()]) zombieThink(z, up, dt);

    // power-ups on the ground: walk over to take, they fade after a while
    for (const d of [...cz.drops]) {
      const by = up.find((p) => Math.hypot(p.ps.origin[0] - d.o[0], p.ps.origin[1] - d.o[1]) < 50 && Math.abs(p.ps.origin[2] - d.o[2]) < 80);
      if (!by && t < d.until) continue;
      cz.drops.splice(cz.drops.indexOf(d), 1);
      api.pushEvent({ e: 'dropgone', id: d.id });
      if (by) power(d.k, by);
    }

    // health comes back after a few seconds without getting hit
    for (const p of up) if (t - (p.lastHurt || 0) > 3 && p.ps.hp < (p.ps.maxHp || 100)) p.ps.hp = Math.min(p.ps.maxHp || 100, p.ps.hp + 60 * dt);

    // downed players: revived by a teammate holding E next to them, or bleed out
    for (const p of all) {
      if (!p.ps.alive || !p.ps.downed) continue;
      if (p.selfRevive && t >= p.selfRevive) { revive(p, null); continue; }
      const helper = up.find((o) => o !== p && o.buttons & BTN.USE && Math.hypot(o.ps.origin[0] - p.ps.origin[0], o.ps.origin[1] - p.ps.origin[1]) < 72);
      if (helper) {
        p.reviveProg += dt / (helper.perks & PERKS.quick.bit ? 1.5 : 3);
        p.reviver = helper.id;
        if (p.reviveProg >= 1) { helper.points += 100; revive(p, helper); }
      } else { p.reviveProg = 0; p.reviver = 0; }
      if (p.ps.downed && t >= p.bleedAt) { p.ps.downed = false; api.kill(p, 'bleedout'); }
    }
  };

  function zombieThink(z, up, dt) {
    const t = R.time, ps = z.ps;
    if (t - z.nodeAt > 0.2) { z.node = nearestNode(nav, ps.origin) || z.node; z.nodeAt = t; }
    // nearest standing player
    let tp = null, td = Infinity;
    for (const p of up) {
      const d = Math.hypot(p.ps.origin[0] - ps.origin[0], p.ps.origin[1] - ps.origin[1]);
      if (d < td) { td = d; tp = p; }
    }
    // close and in sight: straight at them; otherwise follow the flow toward the players
    if (tp && td < 300 && t - z.seeAt > 0.25) {
      z.seeAt = t;
      z.sees = Math.abs(tp.ps.origin[2] - ps.origin[2]) < 90 && R.map.world.trace([ps.origin[0], ps.origin[1], ps.origin[2] + 40], [tp.ps.origin[0], tp.ps.origin[1], tp.ps.origin[2] + 40], [-12, -12, -12], [12, 12, 12]).fraction === 1;
    }
    let dir = null;
    if (tp && td < 300 && z.sees) dir = Math.atan2(tp.ps.origin[1] - ps.origin[1], tp.ps.origin[0] - ps.origin[0]);
    else if (z.node && cz.flow) {
      const f = cz.flow, ed = nav.edgeDoor[z.node.i];
      let best = null, bd = f[z.node.i];
      z.node.n.forEach((j, k) => { if (ed[k] >= 0 && !doorOpen(ed[k])) return; if (f[j] < bd) { bd = f[j]; best = nav.nodes[j]; } });
      if (best) dir = Math.atan2(best.y - ps.origin[1], best.x - ps.origin[0]);
      else if (tp && Number.isFinite(bd)) dir = Math.atan2(tp.ps.origin[1] - ps.origin[1], tp.ps.origin[0] - ps.origin[0]);
    }
    // keep a little apart from each other
    let sx = 0, sy = 0;
    for (const o of cz.zombies.values()) {
      if (o === z) continue;
      const dx = ps.origin[0] - o.ps.origin[0], dy = ps.origin[1] - o.ps.origin[1], d = Math.hypot(dx, dy);
      if (d > 0.1 && d < 34 && Math.abs(ps.origin[2] - o.ps.origin[2]) < 60) { sx += dx / d; sy += dy / d; }
    }
    const cmd = { fwd: 0, side: 0, buttons: 0, yaw: z.yaw, pitch: 0 };
    if (dir !== null) {
      z.yaw = dir * D;
      const mx = Math.cos(dir) + sx * 0.7, my = Math.sin(dir) + sy * 0.7;
      const rel = Math.atan2(my, mx) - dir;
      const slow = z.atkAt ? 0.35 : 1;
      cmd.yaw = z.yaw;
      cmd.fwd = Math.cos(rel) * slow;
      cmd.side = -Math.sin(rel) * slow;
      // stuck: jump, and after a while give up and come back elsewhere
      if (t - z.stuckAt > 0.75) {
        if (Math.hypot(ps.origin[0] - z.stuckPos[0], ps.origin[1] - z.stuckPos[1]) < 12) { z.jump = true; z.stuckN++; } else z.stuckN = 0;
        z.stuckPos = ps.origin.slice();
        z.stuckAt = t;
      }
      if (z.jump && ps.onGround && !ps.jumpHeld) { cmd.buttons |= BTN.JUMP; z.jump = false; }
    }
    pmove(R.map.world, ps, cmd, dt, R.rules);
    ps.time += dt;
    if (ps.origin[2] < R.map.killZ || z.stuckN > 8 || (!dir && t - z.stuckAt > 6)) {
      cz.zombies.delete(z.id);
      api.pushEvent({ e: 'zgone', id: z.id });
      cz.toSpawn++;
      return;
    }
    // swipe at a standing player within reach: a short wind-up, then the hit lands if they're still close
    if (tp && td < 52 && Math.abs(tp.ps.origin[2] - ps.origin[2]) < 64 && !z.atkAt && t >= z.cool) {
      z.atkAt = t + 0.45;
      api.pushEvent({ e: 'zatk', id: z.id });
    }
    if (z.atkAt && t >= z.atkAt) {
      z.atkAt = 0;
      z.cool = t + 0.6;
      if (tp && td < 76 && Math.abs(tp.ps.origin[2] - ps.origin[2]) < 70) {
        const d = Math.max(1, td);
        api.damage(tp, 50, [(tp.ps.origin[0] - ps.origin[0]) / d, (tp.ps.origin[1] - ps.origin[1]) / d, 0]);
      }
    }
  }

  // ---- what clients see
  cz.rows = () => [...cz.zombies.values()].map((z) => [z.id, r1(z.ps.origin[0]), r1(z.ps.origin[1]), r1(z.ps.origin[2]), Math.round(z.yaw), (z.atkAt ? 1 : 0) | (z.speed > 0.9 ? 2 : 0), Math.round(z.ps.velocity[0]), Math.round(z.ps.velocity[1])]);
  cz.state = () => {
    const t = R.time;
    const phase = { waiting: 0, break: 1, round: 2, over: 3 }[cz.phase];
    return [cz.round, cz.toSpawn + cz.zombies.size, Math.max(0, Math.ceil(cz.insta - t)), Math.max(0, Math.ceil(cz.double - t)), phase, cz.phase === 'break' ? Math.max(0, Math.ceil(cz.nextAt - t)) : 0];
  };
  cz.personal = (p) => [p.points | 0, p.perks | 0, p.ps.downed ? 1 : 0, p.ps.downed ? Math.max(0, Math.ceil(p.bleedAt - R.time)) : 0, Math.round((p.reviveProg || 0) * 100)];
  return cz;
}

function r1(v) {
  return Math.round(v * 10) / 10;
}
