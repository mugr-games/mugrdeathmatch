// The client side of the bank heist: guards, police and staff (smoothed like players, with ? and ! over their
// heads), the bank's doors, cameras, cash carts, bags, keycards and the van; the heist HUD (objectives, the
// alarm and police waves, the detection arc that points at whoever's noticing you, "hold E" prompts, downed
// and custody screens, the results) and the planning screen's state. The planning screen itself is drawn by
// main.js from what this keeps.
import * as THREE from 'three';
import { WEAPON_SLOT } from './assets.js';
import { esc } from './hud.js';

const DEG = Math.PI / 180;
const angDiff = (a, b) => ((b - a) % 360 + 540) % 360 - 180;
const $ = (id) => document.getElementById(id);
// suit colour and character model for each kind of NPC
const LOOK = [
  { color: 7, model: 1, slot: WEAPON_SLOT.pistol }, // guard: graphite, trooper
  { color: 1, model: 1, slot: WEAPON_SLOT.smg1 }, // police: blue
  { color: 7, model: 2, slot: WEAPON_SLOT.ar2 }, // SWAT: juggernaut
  { color: -1, model: 3, slot: null }, // staff and customers
];
const money = (n) => '$' + Math.round(n).toLocaleString();

function iconSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  s.scale.set(16, 16, 1);
  s.userData.canvas = c;
  s.renderOrder = 9;
  return s;
}
// the ? fills up yellow as they get suspicious; ! in red when they know
function drawIcon(s, level, through) {
  const key = level > 100 ? 'alert' : Math.round(level / 10);
  if (s.userData.key === key && s.userData.through === through) return;
  s.userData.key = key;
  s.userData.through = through;
  const g = s.userData.canvas.getContext('2d');
  g.clearRect(0, 0, 64, 64);
  g.font = '900 52px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = 7;
  g.strokeStyle = 'rgba(0,0,0,.85)';
  if (key === 'alert') {
    g.strokeText('!', 32, 34);
    g.fillStyle = '#ff3b30';
    g.fillText('!', 32, 34);
  } else if (level > 0) {
    g.strokeText('?', 32, 34);
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.fillText('?', 32, 34);
    // the filled part, from the bottom up
    g.save();
    g.beginPath();
    g.rect(0, 64 - 64 * Math.min(1, level / 100), 64, 64);
    g.clip();
    g.fillStyle = '#ffd23a';
    g.fillText('?', 32, 34);
    g.restore();
  } else if (through) {
    // the lookout's marker: a small diamond
    g.fillStyle = 'rgba(255,90,70,.9)';
    g.beginPath(); g.moveTo(32, 18); g.lineTo(44, 32); g.lineTo(32, 46); g.lineTo(20, 32); g.closePath(); g.fill();
  }
  s.material.map.needsUpdate = true;
  s.material.depthTest = !through;
}

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.2, ...o });
const boxMesh = (sx, sy, sz, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; return b; };

export class HeistView {
  constructor(game) {
    this.g = game;
    this.npcs = new Map();
    this.objs = null;
    this.state = null;
    this.me = null;
    this.plan = null;
    this.onPlan = null; // main.js: the planning screen
  }

  get active() {
    return !!this.objs;
  }

  // ---------------------------------------------------------------- setup per match
  setup(hw) {
    this.clear();
    if (!hw) return;
    const g = this.g;
    const root = new THREE.Group();
    const o = { root, doors: [], cams: [], carts: [], boxes: [], cards: new Map(), bags: new Map(), drill: null };
    // doors: the staff door, the vault door (round and thick), the back door
    for (const [i, name, mins, maxs] of hw.doors) {
      const sx = maxs[0] - mins[0], sy = maxs[1] - mins[1], sz = maxs[2] - mins[2];
      const grp = new THREE.Group();
      grp.position.set((mins[0] + maxs[0]) / 2, (mins[1] + maxs[1]) / 2, mins[2]);
      if (name === 'vault') {
        const steel = mat(0x8d949c, { metalness: 0.9, roughness: 0.3 });
        const disc = new THREE.Mesh(new THREE.CylinderGeometry(sz * 0.5, sz * 0.5, sy + 8, 40), steel);
        disc.position.z = sz / 2;
        disc.castShadow = true;
        grp.add(disc);
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(22, 3, 8, 24), mat(0xc9ccd0, { metalness: 1, roughness: 0.2 }));
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(0, -sy / 2 - 8, sz / 2);
        grp.add(wheel);
        for (let k = 0; k < 3; k++) { const spoke = boxMesh(44, 3, 3, wheel.material, 0, -sy / 2 - 8, sz / 2); spoke.rotation.y = (k * Math.PI) / 3; grp.add(spoke); }
      } else {
        const door = boxMesh(sx, sy, sz, mat(name === 'staff' ? 0x5d6872 : 0x6a5a4a, { metalness: 0.5 }), 0, 0, sz / 2);
        grp.add(door);
        // a card reader with a red light
        const reader = boxMesh(6, sy + 6, 10, mat(0x1a1a1a), sx / 2 + 10, 0, 70);
        const led = boxMesh(2, sy + 8, 2, new THREE.MeshBasicMaterial({ color: 0xff2a2a }), sx / 2 + 10, 0, 76);
        if (name === 'staff') grp.add(reader, led);
        grp.userData.led = led;
      }
      root.add(grp);
      o.doors[i] = { name, grp, h: sz, open: false };
    }
    // cameras: a box with a lens and a red light, turning
    for (const [i, co] of hw.cams) {
      const pivot = new THREE.Group();
      pivot.position.set(co[0], co[1], co[2]);
      const body = boxMesh(22, 10, 10, mat(0xe8e6e0), 11, 0, 0);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 4, 12), mat(0x111111));
      lens.rotation.z = Math.PI / 2;
      lens.position.set(23, 0, 0);
      const led = boxMesh(2, 2, 2, new THREE.MeshBasicMaterial({ color: 0xff2020 }), 18, 0, 6);
      const mount = boxMesh(4, 4, 14, mat(0x777777), 0, 0, 6);
      pivot.add(body, lens, led, mount);
      pivot.userData.led = led;
      pivot.visible = false; // until the job starts (they're there for each difficulty)
      root.add(pivot);
      o.cams[i] = pivot;
    }
    // the van: a white box van, and a green ring where bags count as safe
    {
      const van = new THREE.Group();
      const white = mat(0xe9ecef, { roughness: 0.4 });
      van.add(boxMesh(220, 100, 90, white, -1050, -800, 67));
      van.add(boxMesh(60, 96, 50, white, -930, -800, 45));
      van.add(boxMesh(4, 70, 30, mat(0x223344, { metalness: 0.8, roughness: 0.1 }), -899, -800, 56));
      for (const [x, y] of [[-1120, -850], [-980, -850], [-1120, -750], [-980, -750]]) {
        const w = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 10, 16), mat(0x111111));
        w.position.set(x, y, 15);
        van.add(w);
      }
      root.add(van);
      const ring = new THREE.Mesh(new THREE.RingGeometry(hw.van.r - 8, hw.van.r, 48), new THREE.MeshBasicMaterial({ color: 0x3ddc6a, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
      ring.position.set(hw.van.o[0], hw.van.o[1], 2);
      root.add(ring);
      o.ring = ring;
    }
    // cash carts: stacks of notes on a trolley
    for (const c of hw.carts) {
      const grp = new THREE.Group();
      const cash = new THREE.Group();
      for (let k = 0; k < 6; k++) cash.add(boxMesh(18, 12, 7, mat(0x4f8a3a, { roughness: 0.9 }), -14 + (k % 3) * 14, k < 3 ? -6 : 6, 39 + ((k * 7) % 3) * 6));
      grp.add(cash);
      grp.position.set(c[0], c[1] + 52, 0);
      grp.userData.cash = cash;
      root.add(grp);
      o.carts.push(grp);
    }
    for (const b of hw.boxes) {
      const handle = boxMesh(4, 10, 3, mat(0xd8c070, { metalness: 1, roughness: 0.3 }), b[0] < 300 ? b[0] - 18 : b[0] + 18, b[1], 70);
      root.add(handle);
      o.boxes.push(handle);
    }
    // the alarm panels, the monitors, the hack panel
    for (const a of hw.alarms) root.add(boxMesh(10, 18, 24, new THREE.MeshStandardMaterial({ color: 0xaa1111, emissive: 0x660000 }), a[0] < 0 && Math.abs(a[0]) > 570 ? a[0] - 32 : a[0], a[1] > 400 ? a[1] + 34 : a[1], 100));
    root.add(boxMesh(6, 80, 40, new THREE.MeshStandardMaterial({ color: 0x0a1a2a, emissive: 0x2a6aa8, emissiveIntensity: 1.2 }), -536, 360, 64));
    g.scene.add(root);
    this.objs = o;
    this.hw = hw;
    this.plan = hw.plan;
    this.onPlan?.(this.plan);
    $('heist-hud').hidden = false;
  }

  clear() {
    const g = this.g;
    if (this.objs) { g.scene.remove(this.objs.root); this.objs.root.traverse((x) => { x.geometry?.dispose(); }); }
    for (const n of this.npcs.values()) this.removeNpc(n.id);
    this.npcs.clear();
    this.objs = null;
    this.state = null;
    this.me = null;
    this.siren(false);
    const hud = $('heist-hud');
    if (hud) hud.hidden = true;
  }

  // the planning screen is up: before the job, and after it with the results
  planning() {
    return !!this.plan && this.plan.phase === 'planning';
  }

  // am I unarmed (mask off)?
  unarmed() {
    return !!this.me && !this.me[0] && this.state?.ph === 1;
  }

  // ---------------------------------------------------------------- network
  message(m) {
    if (m.k === 'plan') { const was = this.plan?.phase; this.plan = m; this.onPlan?.(m, was); }
  }

  snapshot(m) {
    if (!m.hs) return;
    this.state = m.hs;
    this.me = m.hkp || null;
    const seen = new Set();
    for (const [id, x, y, z, yaw, flags, vx, vy, alert] of m.hz || []) {
      seen.add(id);
      let n = this.npcs.get(id);
      if (!n) {
        const look = LOOK[flags & 3];
        n = { id, kind: flags & 3, snaps: [], obj: null, pos: [x, y, z + 36], icon: iconSprite() };
        this.g.scene.add(n.icon);
        this.npcs.set(id, n);
        const color = look.color < 0 ? (Math.abs(id) * 3) % 7 : look.color;
        n.color = color;
        this.g.makeCharacter(color, look.slot, look.model).then((c) => {
          if (!this.npcs.has(id)) { c.dispose(); return; }
          n.obj = c;
          this.g.scene.add(c.root);
        });
      }
      n.flags = flags;
      n.alert = alert;
      n.snaps.push({ t: m.st, o: [x, y, z], yaw, v: [vx, vy] });
      while (n.snaps.length > 20) n.snaps.shift();
    }
    for (const id of [...this.npcs.keys()]) if (!seen.has(id)) this.removeNpc(id);
  }

  removeNpc(id) {
    const n = this.npcs.get(id);
    if (!n) return;
    if (n.obj) { this.g.scene.remove(n.obj.root); n.obj.dispose(); }
    this.g.scene.remove(n.icon);
    n.icon.material.map.dispose();
    n.icon.material.dispose();
    this.npcs.delete(id);
  }

  // game events this view handles (returns true to stop the game's own handling)
  event(ev) {
    const g = this.g, me = g.myId;
    if (ev.e === 'shot' && ev.id < 0) { this.npcs.get(ev.id)?.obj?.fire(); return false; } // the game draws the tracer
    if (ev.e === 'hdie') {
      const n = this.npcs.get(ev.id);
      g.spawnRagdoll(ev.id, ev.o, ev.y, ev.vv || [0, 0, 0], false, n ? n.color : 7);
      g.sound.death(n ? n.pos : ev.o);
      this.removeNpc(ev.id);
      return true;
    }
    if (ev.e === 'hhurt') { const n = this.npcs.get(ev.id); n?.obj?.flinch(); if (n) g.sound.hurt(n.pos, false); return true; }
    if (ev.e !== 'hk') return false;
    const say = (title, sub, secs = 2.5) => { g.hud.message(title, sub || ''); clearTimeout(this.msgT); this.msgT = setTimeout(() => g.hud.message(''), secs * 1000); };
    const who = (id) => g.info.get(id)?.name || 'Someone';
    switch (ev.k) {
      case 'start': say(ev.approach === 'loud' ? 'GOING IN LOUD' : 'THE BANK JOB', ev.approach === 'loud' ? 'The alarm goes in 25 seconds · press G to mask up' : 'Walk in unmasked · press G to mask up when you\'re ready', 6); g.sound.roundStart(); break;
      case 'alarm': say('ALARM!', ev.why, 4); this.siren(true); break;
      case 'alert': if (!this.state?.al) g.sound.ui(320); break;
      case 'warn': say('"You can\'t be back here!"', 'Leave the staff area, or mask up', 3); break;
      case 'mask': if (ev.id === me) { g.sound.reload('pistol', null, 0.6); say('MASKED UP', 'Weapons out · guards and cameras will spot you fast', 2.5); } break;
      case 'assault': say(`POLICE ASSAULT · WAVE ${ev.wave}`, 'Hold out', 3); g.sound.roundStart(); break;
      case 'break': say('POLICE ARE REGROUPING', 'Move now', 3); break;
      case 'card': if (ev.id === me) say('GOT THE KEYCARD', 'Open the staff door'); g.sound.pickup('battery'); break;
      case 'obj':
        g.sound.pickup('battery');
        if (ev.what === 'vault') say('THE VAULT IS OPEN', 'Bag the cash and get it to the van', 4);
        else if (ev.what === 'cams') say('CAMERAS LOOPED', 'They see nothing now');
        else if (ev.what === 'wires') say('ALARM WIRING CUT', 'No alarm panels · police take longer');
        else if (ev.what === 'staff') say('STAFF DOOR OPEN', `${who(ev.id)} used the card`);
        else if (ev.what === 'drill') say('DRILL RUNNING', 'Keep it going · it jams', 3);
        break;
      case 'jam': say('THE DRILL JAMMED', 'Fix it at the vault', 3); g.sound.ui(240); break;
      case 'cart': if (ev.id === me) say('BAG FULL', 'Get it to the van (G throws it)'); g.sound.pickup('ammo'); break;
      case 'box': g.sound.pickup('ammo'); break;
      case 'secured': say('BAG SECURED', `${ev.n} in the van`); g.sound.pickup('megahealth'); break;
      case 'civ': if (ev.s === 'calling') say('SOMEONE\'S CALLING THE POLICE', 'Stop them!', 3); break;
      case 'msg': say('', ev.text, 3); break;
      case 'over':
        this.siren(false);
        say(ev.success ? 'HEIST COMPLETE' : 'HEIST FAILED', ev.success ? `${money(ev.total)} · ${ev.coins} coins each${ev.stealth ? ' · stealth bonus' : ''}` : ev.why, 10);
        if (ev.success) g.sound.roundEnd();
        break;
      case 'door': g.sound.ui(ev.open ? 520 : 380); break;
    }
    return true;
  }

  // ---------------------------------------------------------------- per frame
  update(dt, t) {
    const g = this.g, s = this.state;
    if (!this.objs) return;
    const rt = g.renderTime;
    const lookout = this.me?.[7] === 'lookout';
    for (const n of this.npcs.values()) {
      const sn = n.snaps;
      if (!sn.length) continue;
      let a = sn[0], b = sn[0];
      for (let i = 0; i < sn.length; i++) { if (sn[i].t <= rt) a = sn[i]; b = sn[i]; if (sn[i].t >= rt) break; }
      const f = b.t > a.t ? Math.max(0, Math.min(1, (rt - a.t) / (b.t - a.t))) : 1;
      const o = [0, 1, 2].map((k) => a.o[k] + (b.o[k] - a.o[k]) * f);
      const yaw = a.yaw + angDiff(a.yaw, b.yaw) * f;
      n.pos = [o[0], o[1], o[2] + 36];
      // the ? / ! (and, for the lookout, a marker on every guard through walls)
      const through = lookout && n.kind !== 3;
      drawIcon(n.icon, n.alert, through && n.alert <= 0);
      n.icon.visible = n.alert > 0 || through;
      n.icon.position.set(o[0], o[1], o[2] + ((n.flags & 4) ? 62 : 92));
      if (!n.obj) continue;
      const v = b.v, speed = Math.hypot(v[0], v[1]), yr = yaw * DEG;
      const down = !!(n.flags & 24);
      n.obj.animate(dt, { speed, fwdSpeed: v[0] * Math.cos(yr) + v[1] * Math.sin(yr), sideSpeed: v[0] * Math.sin(yr) - v[1] * Math.cos(yr), ground: true, ducked: !!(n.flags & 4) || down, pitch: 0, alive: true });
      n.obj.root.matrix.makeRotationZ(yr).setPosition(o[0], o[1], o[2]);
      n.obj.root.matrixWorldNeedsUpdate = true;
      n.obj.root.updateMatrixWorld(true);
    }
    if (!s) return;
    this.siren(s.ph === 1 && !!s.al);
    const O = this.objs;
    // doors slide up out of the way
    s.doors.forEach((open, i) => {
      const d = O.doors[i];
      if (!d) return;
      const target = open ? (d.name === 'vault' ? 0 : d.h - 6) : 0;
      if (d.name === 'vault') {
        // the vault door swings open about its edge
        d.grp.rotation.z += ((open ? -1.5 : 0) - d.grp.rotation.z) * Math.min(1, dt * 1.2);
      } else d.grp.position.z += (target - d.grp.position.z) * Math.min(1, dt * 8);
      if (d.grp.userData.led) d.grp.userData.led.material.color.set(open ? 0x22ff55 : 0xff2a2a);
    });
    // cameras: shown during the job, turning; the red light goes out when they're looped
    O.cams.forEach((c, i) => {
      if (!c) return;
      const k = s.camYaw.length && s.ph === 1 ? Math.min(i, s.camYaw.length - 1) : -1;
      c.visible = s.ph === 1 && i < s.camYaw.length;
      if (k >= 0 && c.visible) c.rotation.z = s.camYaw[i] * DEG;
      c.userData.led.visible = !!s.cams && Math.sin(t * 6) > 0;
    });
    O.carts.forEach((c, i) => { c.userData.cash.visible = !s.carts[i]; });
    O.boxes.forEach((b, i) => { b.visible = !s.boxes[i]; });
    O.ring.material.opacity = 0.35 + Math.sin(t * 3) * 0.2;
    this.syncList(O.cards, s.cards, () => { const card = boxMesh(10, 6, 1, new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x3aa0ff, emissiveIntensity: 1.5 })); return card; }, (m, x, y, z) => { m.position.set(x, y, z + 2 + Math.sin(t * 3) * 2); m.rotation.z = t; });
    this.syncList(O.bags, s.bags, () => { const bag = new THREE.Group(); bag.add(boxMesh(34, 18, 18, mat(0x1d1f22, { roughness: 0.95 }), 0, 0, 9)); bag.add(boxMesh(26, 2, 10, mat(0x4f8a3a), 0, 0, 19)); return bag; }, (m, x, y, z) => m.position.set(x, y, z));
    // the drill at the vault
    const drilling = s.vault[2] && !s.vault[0];
    if (drilling && !O.drill) {
      O.drill = new THREE.Group();
      O.drill.add(boxMesh(30, 40, 30, mat(0xd8a020, { metalness: 0.4 }), 0, 0, 0));
      O.drill.add(boxMesh(6, 30, 6, mat(0x888888, { metalness: 1 }), 0, 30, 0));
      O.drill.position.set(this.hw.panel[0] + 90, this.hw.panel[1] + 6, 80);
      O.root.add(O.drill);
    }
    if (O.drill) {
      O.drill.visible = drilling;
      if (drilling && !s.vault[3]) { O.drill.rotation.y = Math.sin(t * 60) * 0.02; if (t - (this.whirAt || 0) > 0.5) { this.whirAt = t; g.sound.ui(140 + (s.vault[1] % 10) * 4); } }
    }
    // bags on the backs of whoever carries one
    for (const [id, bag] of s.crew) {
      const pl = id === g.myId ? null : g.players.get(id);
      if (!pl?.obj) continue;
      if (bag && !pl.bagObj) { pl.bagObj = boxMesh(30, 16, 16, mat(0x1d1f22)); g.scene.add(pl.bagObj); }
      if (pl.bagObj) {
        pl.bagObj.visible = !!bag;
        const y = (pl.yaw || 0) * DEG;
        pl.bagObj.position.set(pl.pos[0] - Math.cos(y) * 14, pl.pos[1] - Math.sin(y) * 14, pl.pos[2] + 6);
        pl.bagObj.rotation.z = y;
      }
    }
    this.hud(t);
  }

  syncList(map, list, make, place) {
    const seen = new Set();
    for (const [id, x, y, z] of list) {
      seen.add(id);
      let m = map.get(id);
      if (!m) { m = make(); this.objs.root.add(m); map.set(id, m); }
      place(m, x, y, z);
    }
    for (const [id, m] of map) if (!seen.has(id)) { this.objs.root.remove(m); map.delete(id); }
  }

  // ---------------------------------------------------------------- the HUD
  hud(t) {
    const s = this.state, me = this.me, g = this.g;
    if (!s || !me) return;
    const [masked, bag, card, det, detDir, bleed, act, role, custody] = me;
    const done = (ok) => (ok ? '<i class="ok">✔</i>' : '<i>○</i>');
    const anyCard = s.crew.some((c) => c[3]) || s.doors[0];
    const rows = [];
    if (s.ph === 1) {
      if (!masked && !s.al) rows.push(`<li>${done(false)} Look around unmasked · <b>G</b> to mask up</li>`);
      rows.push(`<li>${done(anyCard)} Get a keycard <small>(manager's office, or the guard captain)</small></li>`);
      rows.push(`<li>${done(s.doors[0])} Open the staff door</li>`);
      if (!s.al) rows.push(`<li class="opt">${done(!s.cams)} Loop the cameras <small>(security office, optional)</small></li>`);
      rows.push(`<li class="opt">${done(s.wires)} Cut the alarm wiring <small>(optional)</small></li>`);
      rows.push(`<li>${done(s.vault[0])} ${s.al ? 'Drill' : 'Hack'} the vault${s.vault[0] ? '' : ` <b>${s.vault[1]}%</b>${s.vault[3] ? ' <b class="bad">JAMMED</b>' : ''}`}</li>`);
      const bagged = s.carts.filter(Boolean).length;
      rows.push(`<li>${done(bagged === s.carts.length)} Bag the cash <b>${bagged}/${s.carts.length}</b> · deposit boxes <b>${s.boxes.filter(Boolean).length}/${s.boxes.length}</b></li>`);
      rows.push(`<li>${done(s.sec > 0)} Get bags to the van <b>${s.sec}</b> secured</li>`);
      rows.push(`<li>${done(false)} Everyone to the van · hold <b>E</b> to go</li>`);
    }
    let status;
    if (s.ph !== 1) status = '';
    else if (!s.al) status = '<div class="st calm">UNDETECTED</div>';
    else if (s.pol) status = `<div class="st alarm">ALARM · police in ${s.pol}s</div>`;
    else if (s.as === 1) status = `<div class="st alarm">POLICE ASSAULT · wave ${s.wave} · ${s.asT}s</div>`;
    else status = `<div class="st break">POLICE REGROUPING · ${s.asT}s</div>`;
    const take = s.sec * 30000 + s.cash - s.civ * 5000;
    const html = `${status}<ul>${rows.join('')}</ul><div class="take">${money(Math.max(0, take))}${s.ph === 1 ? ` · ${Math.floor(s.time / 60)}:${String(s.time % 60).padStart(2, '0')}` : ''}</div>`;
    if (html !== this.hudHtml) { this.hudHtml = html; $('hz-obj').innerHTML = html; }
    // the prompt: what E does here
    let prompt = '';
    if (act) prompt = act[3] ? `<span class="no">${esc(act[0])}</span>` : `<b>E</b> ${act[2] ? '' : 'Hold to '}${esc(act[0])}${act[1] || act[2] ? `<span class="bar"><span style="width:${act[1]}%"></span></span>` : ''}`;
    else if (s.ph === 1 && !masked) prompt = '<b>G</b> Put on your mask <small>(no weapons or objectives until you do)</small>';
    else if (bag) prompt = 'Carrying a bag · <b>G</b> throw it';
    if (bleed) prompt = `<span class="no">DOWNED · ${bleed}s · a teammate can hold E to revive you</span>`;
    if (custody) prompt = custody < 0 ? '<span class="no">IN CUSTODY until the job ends</span>' : `<span class="no">IN CUSTODY · back at the van in ${custody}s</span>`;
    if (prompt !== this.promptHtml) { this.promptHtml = prompt; $('hz-prompt').innerHTML = prompt; $('hz-prompt').hidden = !prompt; }
    // the detection arc: which way the trouble is, and how close they are to spotting you
    const arc = $('hz-detect');
    if (det > 2 && s.ph === 1 && !s.al) {
      arc.hidden = false;
      const rel = -angDiff(g.yaw, detDir);
      arc.style.transform = `translate(-50%, -50%) rotate(${rel}deg)`;
      arc.style.setProperty('--fill', `${Math.min(100, det)}%`);
      arc.classList.toggle('hot', det > 70);
    } else arc.hidden = true;
  }

  // the bank alarm: a two-tone siren while it's loud
  siren(on) {
    const S = this.g.sound;
    if (!on) { if (this.sirenNodes) { for (const n of this.sirenNodes) try { n.stop(); } catch { /* stopped */ } this.sirenNodes = null; } return; }
    if (this.sirenNodes || !S.ctx) return;
    const c = S.ctx;
    const osc = c.createOscillator(), lfo = c.createOscillator(), depth = c.createGain(), gain = c.createGain();
    osc.type = 'square';
    osc.frequency.value = 760;
    lfo.type = 'square';
    lfo.frequency.value = 1.6;
    depth.gain.value = 140;
    gain.gain.value = 0.025;
    lfo.connect(depth).connect(osc.frequency);
    osc.connect(gain).connect(S.master);
    osc.start(); lfo.start();
    this.sirenNodes = [osc, lfo];
  }
}
