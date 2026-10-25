// Client side of zombies (rounds, co-op): draws the zombies, the shops (wall weapons, perk machines, the
// mystery box), barricades and power-up drops, works out the "press E" prompt and feeds the round HUD.
import * as THREE from 'three';
import { WEAPONS, WEAPON_INDEX, PERKS, DROP_NAMES } from './weapons.js';
import { loadSlot, instance, WEAPON_SLOT } from './assets.js';
import { haloMaterial } from './shaders.js';
import { ZOMBIE_SKIN } from './avatar.js';

const DEG = Math.PI / 180;
const angDiff = (a, b) => ((b - a) % 360 + 540) % 360 - 180;

// a text label that always faces the camera
function label(text, color = '#ffffff', width = 256) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = 64;
  const g = c.getContext('2d');
  g.font = '700 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 6;
  g.strokeStyle = 'rgba(0,0,0,.85)';
  g.strokeText(text, width / 2, 32);
  g.fillStyle = color;
  g.fillText(text, width / 2, 32);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(width / 4, 16, 1);
  return s;
}

function perkMachine(P) {
  const g = new THREE.Group();
  const col = new THREE.Color(P.color);
  const body = new THREE.Mesh(new THREE.BoxGeometry(30, 26, 76), new THREE.MeshStandardMaterial({ color: col, roughness: 0.4, metalness: 0.3 }));
  body.position.z = 38;
  const panel = new THREE.Mesh(new THREE.BoxGeometry(1, 20, 30), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: col, emissiveIntensity: 2.2 }));
  panel.position.set(15.5, 0, 48);
  const top = new THREE.Mesh(new THREE.BoxGeometry(32, 28, 6), new THREE.MeshStandardMaterial({ color: 0x2a2b2e, metalness: 0.7, roughness: 0.3 }));
  top.position.z = 79;
  for (const m of [body, top]) m.castShadow = true;
  g.add(body, panel, top);
  return g;
}

function mysteryBox() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a4524, roughness: 0.8 });
  const chest = new THREE.Mesh(new THREE.BoxGeometry(56, 28, 26), wood);
  chest.position.z = 13;
  chest.castShadow = true;
  const lid = new THREE.Mesh(new THREE.BoxGeometry(58, 30, 6), new THREE.MeshStandardMaterial({ color: 0x4a2f18, roughness: 0.8 }));
  lid.position.z = 29;
  const mark = label('?', '#7fd7ff', 64);
  mark.position.z = 48;
  mark.scale.set(20, 20, 1);
  // a beam of light going up, like the box is calling you
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(10, 16, 900, 16, 1, true).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 1.4, 2.4), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  beam.position.z = 480;
  g.add(chest, lid, mark, beam);
  return g;
}

function debris(d) {
  const g = new THREE.Group();
  const [x0, y0, z0] = d.mins, [x1, y1, z1] = d.maxs;
  const along = x1 - x0 > y1 - y0 ? 'x' : 'y';
  const len = along === 'x' ? x1 - x0 : y1 - y0;
  const wood = new THREE.MeshStandardMaterial({ color: 0x7a5530, roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 0.9 });
  // planks nailed across, a few broken crates and a car tyre's worth of junk
  for (let i = 0; i < 7; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(along === 'x' ? len * 1.04 : 6, along === 'x' ? 6 : len * 1.04, 14), i % 2 ? wood : dark);
    plank.position.set((x0 + x1) / 2, (y0 + y1) / 2, z0 + 14 + i * 26);
    plank.rotation[along === 'x' ? 'y' : 'x'] = (Math.random() - 0.5) * 0.25;
    plank.castShadow = true;
    g.add(plank);
  }
  for (let i = 0; i < 5; i++) {
    const s = 26 + Math.random() * 24;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), i % 2 ? wood : dark);
    const t = (i + 0.5) / 5;
    crate.position.set(along === 'x' ? x0 + len * t : (x0 + x1) / 2 + (Math.random() - 0.5) * 20, along === 'x' ? (y0 + y1) / 2 + (Math.random() - 0.5) * 20 : y0 + len * t, z0 + s / 2);
    crate.rotation.z = Math.random();
    crate.castShadow = true;
    g.add(crate);
  }
  const l = label(`${d.name} · ${d.cost}`, '#ffd24d', 320);
  l.position.set((x0 + x1) / 2, (y0 + y1) / 2, z1 + 30);
  g.add(l);
  return g;
}

const DROP_ICON = { maxammo: 'AMMO', instakill: '☠', double: 'x2', nuke: '☢' };

export class ZombiesView {
  constructor(game) {
    this.g = game;
    this.npcs = new Map();
    this.buys = [];
    this.doors = [];
    this.drops = new Map();
    this.state = null; // [round, left, insta, double, phase, phaseSecs]
    this.me = null; // [points, perks, downed, bleedSecs, reviveProgress]
    this.groanAt = 0;
  }

  get active() {
    return !!this.buys.length || !!this.doors.length || !!this.state;
  }

  // ---------------------------------------------------------------- setup per match
  setup(cz) {
    this.clear();
    if (!cz) return;
    const g = this.g;
    for (const [i, kind, o, cost, what] of cz.buys) {
      const root = new THREE.Group();
      root.position.set(o[0], o[1], o[2]);
      let name;
      if (kind === 'perk') { name = PERKS[what].name; root.add(perkMachine(PERKS[what])); }
      else if (kind === 'box') { name = 'Mystery Box'; root.add(mysteryBox()); }
      else {
        name = WEAPONS[WEAPON_INDEX[what]].name;
        // the weapon floating over a chalk circle
        const halo = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), haloMaterial('#f0f0e0'));
        halo.position.z = 1;
        root.add(halo);
        loadSlot(WEAPON_SLOT[what]).then((proto) => { const m = instance(proto); m.position.z = 34; root.add(m); root.userData.gun = m; });
      }
      const l = label(`${name} · ${cost}`, kind === 'perk' ? PERKS[what].color : kind === 'box' ? '#7fd7ff' : '#ffffff', 320);
      l.position.z = kind === 'perk' ? 104 : 70;
      root.add(l);
      g.scene.add(root);
      this.buys.push({ i, kind, o, cost, what, name, root });
    }
    for (const [i, mins, maxs, cost, open, name] of cz.doors) {
      const d = { i, mins, maxs, cost, open: !!open, name: name || 'Debris' };
      if (!d.open) {
        d.box = g.world.addBox({ mins, maxs, mat: 'door' }); // the client predicts movement against it too
        d.obj = debris(d);
        g.scene.add(d.obj);
      }
      this.doors.push(d);
    }
    for (const [id, k, o] of cz.drops) this.addDrop(id, k, o);
  }

  clear() {
    const g = this.g;
    for (const z of this.npcs.values()) if (z.obj) { g.scene.remove(z.obj.root); z.obj.dispose(); }
    this.npcs.clear();
    for (const b of this.buys) g.scene.remove(b.root);
    this.buys = [];
    for (const d of this.doors) if (d.obj) g.scene.remove(d.obj);
    this.doors = [];
    for (const d of this.drops.values()) g.scene.remove(d.obj);
    this.drops.clear();
    this.state = null;
    this.me = null;
    g.hud.zombies(null);
  }

  // ---------------------------------------------------------------- network
  snapshot(m) {
    if (!m.zr) return;
    this.state = m.zr;
    this.me = m.zp || null;
    const seen = new Set();
    for (const [id, x, y, z, yaw, flags, vx, vy] of m.zb || []) {
      seen.add(id);
      let n = this.npcs.get(id);
      if (!n) {
        n = { id, snaps: [], obj: null, pos: [x, y, z + 36] };
        this.npcs.set(id, n);
        this.g.makeCharacter(ZOMBIE_SKIN, null).then((c) => {
          if (!this.npcs.has(id)) { c.dispose(); return; }
          // a horde of shadow casters is expensive: zombies don't cast shadows
          c.root.traverse((o) => { o.castShadow = false; });
          n.obj = c;
          this.g.scene.add(c.root);
        });
      }
      n.snaps.push({ t: m.st, o: [x, y, z], yaw, flags, v: [vx, vy] });
      while (n.snaps.length > 20) n.snaps.shift();
    }
    for (const id of [...this.npcs.keys()]) if (!seen.has(id)) this.remove(id);
  }

  remove(id) {
    const n = this.npcs.get(id);
    if (!n) return;
    if (n.obj) { this.g.scene.remove(n.obj.root); n.obj.dispose(); }
    this.npcs.delete(id);
  }

  event(ev) {
    const g = this.g, me = g.myId;
    switch (ev.e) {
      case 'zdie': {
        const n = this.npcs.get(ev.id);
        g.spawnRagdoll(ev.id, ev.o, ev.y, ev.vv || [0, 0, 0], false, ZOMBIE_SKIN);
        g.sound.death(n ? n.pos : ev.o);
        this.remove(ev.id);
        return true;
      }
      case 'zgone': this.remove(ev.id); return true;
      case 'zatk': { const n = this.npcs.get(ev.id); g.sound.swing(n ? n.pos : null); n?.obj?.melee(); return true; }
      case 'drop': this.addDrop(ev.id, ev.k, ev.o); g.sound.ui(1300); return true;
      case 'dropgone': { const d = this.drops.get(ev.id); if (d) { g.scene.remove(d.obj); this.drops.delete(ev.id); } return true; }
      case 'power':
        g.hud.message(DROP_NAMES[ev.k], ev.k === 'nuke' ? '+400 points' : ev.k === 'maxammo' ? 'Everyone has full ammo' : '30 seconds');
        setTimeout(() => g.hud.message(''), 2200);
        g.sound.pickup('battery');
        setTimeout(() => g.sound.pickup('weapon'), 150);
        if (ev.k === 'nuke') { g.shake = 6; g.explosion([g.ps.origin[0], g.ps.origin[1], g.ps.origin[2] + 300]); }
        return true;
      case 'buy':
        if (ev.id === me) {
          if (ev.w !== undefined) g.pick(ev.w);
          if (ev.k === 'box') { g.hud.message('Mystery Box', WEAPONS[ev.w].name); setTimeout(() => g.hud.message(''), 1800); }
          if (ev.k === 'perk') { g.hud.message(PERKS[ev.perk].name, PERKS[ev.perk].what); setTimeout(() => g.hud.message(''), 1800); }
          g.sound.pickup(ev.k === 'perk' ? 'battery' : 'weapon');
        }
        return true;
      case 'nobuy': g.hud.flashPoints(); g.sound.ui(220); return true;
      case 'door': {
        const d = this.doors.find((x) => x.i === ev.i);
        if (d && !d.open) {
          d.open = true;
          if (d.box !== undefined) g.world.setEnabled(d.box, false);
          if (d.obj) g.scene.remove(d.obj);
          g.sound.thunk([(d.mins[0] + d.maxs[0]) / 2, (d.mins[1] + d.maxs[1]) / 2, 40], false);
          g.hud.say('', `${g.info.get(ev.id)?.name || 'Someone'} cleared the debris`, true);
        }
        return true;
      }
      case 'down': {
        const who = g.info.get(ev.id)?.name || 'Someone';
        if (ev.id === me) g.pick(WEAPON_INDEX.pistol);
        else g.hud.say('', `${who} is down! Hold E next to them to revive`, true);
        g.sound.hurt(null, ev.id === me);
        return true;
      }
      case 'revive':
        g.hud.say('', ev.id === me ? 'You were revived' : `${g.info.get(ev.id)?.name || 'Someone'} was revived`, true);
        g.sound.pickup('battery');
        return true;
      case 'round':
        g.hud.message(`ROUND ${ev.n}`, ev.n === 1 ? 'Here they come. Press E at shops to spend points' : '');
        setTimeout(() => g.hud.message(''), 3000);
        g.sound.roundStart();
        return true;
      case 'roundend':
        g.hud.message(`Round ${ev.n} survived`, 'Next round in 10 seconds');
        setTimeout(() => g.hud.message(''), 2500);
        g.sound.roundEnd();
        return true;
    }
    return false;
  }

  addDrop(id, k, o) {
    const obj = new THREE.Group();
    obj.position.set(o[0], o[1], o[2]);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(70, 70), haloMaterial('#ffd24d'));
    halo.position.z = 1;
    const icon = label(DROP_ICON[k], '#ffe680', 128);
    icon.scale.set(36, 18, 1);
    icon.position.z = 36;
    obj.add(halo, icon);
    obj.userData.icon = icon;
    this.g.scene.add(obj);
    this.drops.set(id, { id, k, o, obj });
  }

  // current positions to test shots against (feet positions)
  targets() {
    return [...this.npcs.values()].map((n) => ({ id: n.id, o: [n.pos[0], n.pos[1], n.pos[2] - 36] }));
  }

  // ---------------------------------------------------------------- per frame
  update(dt, t) {
    const g = this.g;
    const rt = g.renderTime;
    const now = performance.now() / 1000;
    for (const n of this.npcs.values()) {
      const s = n.snaps;
      if (!s.length) continue;
      let a = s[0], b = s[0];
      for (let i = 0; i < s.length; i++) { if (s[i].t <= rt) a = s[i]; b = s[i]; if (s[i].t >= rt) break; }
      const f = b.t > a.t ? Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))) : 1;
      const o = [0, 1, 2].map((k) => a.o[k] + (b.o[k] - a.o[k]) * f);
      const yaw = a.yaw + angDiff(a.yaw, b.yaw) * f;
      n.pos = [o[0], o[1], o[2] + 36];
      if (!n.obj) continue;
      const v = b.v, speed = Math.hypot(v[0], v[1]), yr = yaw * DEG;
      n.obj.animate(dt, { speed, fwdSpeed: v[0] * Math.cos(yr) + v[1] * Math.sin(yr), sideSpeed: v[0] * Math.sin(yr) - v[1] * Math.cos(yr), ground: true, ducked: false, pitch: 10, alive: true });
      n.obj.root.matrix.copy(new THREE.Matrix4().makeRotationZ(yr).setPosition(o[0], o[1], o[2]));
      n.obj.root.matrixWorldNeedsUpdate = true;
    }
    // now and then one of them groans
    if (this.npcs.size && now > this.groanAt) {
      this.groanAt = now + 0.6 + Math.random() * 1.8;
      const list = [...this.npcs.values()];
      g.sound.groan(list[(Math.random() * list.length) | 0].pos);
    }
    for (const b of this.buys) if (b.root.userData.gun) b.root.userData.gun.rotation.z = t * 0.8 + b.i;
    for (const d of this.drops.values()) { d.obj.userData.icon.position.z = 34 + Math.sin(t * 3 + d.id) * 5; d.obj.children[0].material.uniforms.uTime.value = t; }
    this.hud();
  }

  // the "press E" line for whatever is in reach, the same rules the server uses
  prompt() {
    const g = this.g, ps = g.ps, o = ps.origin;
    if (!ps.alive || ps.downed || !this.me) return null;
    const points = this.me[0], perks = this.me[1];
    // a downed teammate nearby comes first
    for (const pl of g.players.values()) {
      const s = pl.snaps[pl.snaps.length - 1];
      if (s && s.flags & 64 && s.flags & 4 && Math.hypot(pl.pos[0] - o[0], pl.pos[1] - o[1]) < 72) return { text: `Hold E to revive ${g.info.get(pl.id)?.name || ''}`, ok: true };
    }
    let best = null, bd = Infinity;
    for (const b of this.buys) {
      const d = Math.hypot(b.o[0] - o[0], b.o[1] - o[1]);
      if (d < 72 && Math.abs(b.o[2] - o[2]) < 90 && d < bd) { bd = d; best = b; }
    }
    for (const d of this.doors) {
      if (d.open) continue;
      const dx = Math.max(d.mins[0] - o[0], 0, o[0] - d.maxs[0]), dy = Math.max(d.mins[1] - o[1], 0, o[1] - d.maxs[1]);
      const dist = Math.hypot(dx, dy);
      if (dist < 80 && dist < bd) { bd = dist; best = { door: d }; }
    }
    if (!best) return null;
    if (best.door) return { text: `Press E to clear the debris [${best.door.cost}]`, ok: points >= best.door.cost };
    if (best.kind === 'box') return { text: `Press E for a random weapon [${best.cost}]`, ok: points >= best.cost };
    if (best.kind === 'perk') {
      const P = PERKS[best.what];
      if (perks & P.bit) return { text: `${P.name}: you have it`, ok: true };
      return { text: `Press E for ${P.name}: ${P.what} [${best.cost}]`, ok: points >= best.cost };
    }
    const wi = WEAPON_INDEX[best.what];
    if ((ps.owned >> wi) & 1) { const c = Math.round(best.cost / 2); return { text: `Press E for ${WEAPONS[wi].name} ammo [${c}]`, ok: points >= c }; }
    return { text: `Press E to buy ${WEAPONS[wi].name} [${best.cost}]`, ok: points >= best.cost };
  }

  hud() {
    const g = this.g;
    if (!this.state || !g.connected) { g.hud.zombies(null); return; }
    const [round, left, insta, double, phase, phaseSecs] = this.state;
    const [points, perks, downed, bleed, revive] = this.me || [0, 0, 0, 0, 0];
    g.hud.zombies({ round, left, insta, double, phase, phaseSecs, points, perks, downed, bleed, revive, prompt: this.prompt() });
  }
}
