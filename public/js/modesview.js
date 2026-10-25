// The client side of soccer, mugrball and parkour: the ball (smoothed between snapshots, spinning as it rolls,
// or held by its carrier), goal and kick effects, who has the mugrball, and the parkour run timer, checkpoints
// and best-times board.
import * as THREE from 'three';
import { esc } from './hud.js';

const BALL_R = 14;

// a classic black-and-white ball: twelve black patches where an icosahedron's corners point
function ballTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#f4f4f0';
  g.fillRect(0, 0, 512, 256);
  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]];
  g.fillStyle = '#16161a';
  for (const [x, y, z] of verts) {
    const l = Math.hypot(x, y, z);
    const lat = Math.asin(y / l), lon = Math.atan2(z, x);
    const u = ((lon / (Math.PI * 2)) + 0.5) * 512, v = (0.5 - lat / Math.PI) * 256;
    const rx = 26 / Math.max(0.25, Math.cos(lat)), ry = 26;
    for (const du of [-512, 0, 512]) {
      g.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        g[i ? 'lineTo' : 'moveTo'](u + du + Math.cos(a) * rx, v + Math.sin(a) * ry);
      }
      g.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// the mugrball: orange with black seams, like a basketball
function seamTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#f08a3a'); grad.addColorStop(0.5, '#e0662a'); grad.addColorStop(1, '#c4521c');
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = '#1a0f08';
  g.lineWidth = 7;
  g.beginPath(); g.moveTo(0, 128); g.lineTo(512, 128); g.stroke();
  for (const x of [128, 384]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (const x of [0, 256, 512]) { g.beginPath(); g.ellipse(x, 128, 70, 128, 0, 0, Math.PI * 2); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const fmt = (t) => {
  if (t === null || t === undefined) return '–';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
};

export class ModesView {
  constructor(game) {
    this.g = game;
    this.ball = null;
    this.snaps = [];
    this.pkEl = null;
  }

  // a new match: set up for its mode (someone watching from the menu just sees the ball)
  setup(mode, watching) {
    this.clear();
    this.mode = mode;
    const g = this.g;
    if (watching) return;
    if (mode === 'soccer') {
      g.hud.message('SOCCER', 'Run into the ball to dribble · Click to kick · Right-click to chip · Q rocket jump');
      setTimeout(() => g.hud.message(''), 6000);
    }
    if (mode === 'mugrball') {
      g.hud.message('MUGRBALL', 'Run over the ball to grab it · Click throw · Right-click punt · Goal 1 point, hoop 3 · Crowbar the carrier to steal');
      setTimeout(() => g.hud.message(''), 7000);
      this.mbEl = document.createElement('div');
      this.mbEl.id = 'mb';
      g.hud.el.append(this.mbEl);
    }
    if (mode === 'parkour') {
      g.hud.message('PARKOUR', 'Reach the finish as fast as you can · R restart · E back to checkpoint · Q rocket jump');
      setTimeout(() => g.hud.message(''), 6000);
      this.pkEl = document.createElement('div');
      this.pkEl.id = 'pk';
      g.hud.el.append(this.pkEl);
    }
  }

  clear() {
    if (this.ball) { this.g.scene.remove(this.ball); this.ball.geometry.dispose(); this.ball.material.dispose(); this.ball.material.map?.dispose(); }
    this.ball = null;
    this.snaps = [];
    this.pkEl?.remove();
    this.pkEl = null;
    this.mbEl?.remove();
    this.mbEl = null;
    this.mbHtml = null;
    this.holder = 0;
    this.mode = null;
  }

  snapshot(m) {
    if (m.ball) {
      this.snaps.push({ t: m.st, s: m.ball });
      while (this.snaps.length > 20) this.snaps.shift();
      this.holder = m.ball[6] || 0;
    }
    if (m.pkb) this.board = m.pkb;
    if (m.pp !== undefined) this.mine = m.pp;
  }

  // am I carrying the mugrball? (then no guns)
  holding() {
    return this.mode === 'mugrball' && !!this.holder && this.holder === this.g.myId;
  }

  // game events this view handles (returns true when handled)
  event(ev) {
    const g = this.g, me = g.myId;
    if (ev.e === 'kick') {
      g.sound.thunk(ev.o, false);
      if (ev.id !== me && !ev.slap) g.players.get(ev.id)?.obj?.melee();
      return true;
    }
    if (ev.e === 'mb') {
      const who = g.info.get(ev.id)?.name || 'Someone';
      if (ev.k === 'pick' || ev.k === 'steal') {
        g.sound.pickup('battery');
        if (ev.id === me) {
          g.hud.message(ev.k === 'steal' ? 'STOLEN!' : 'YOU HAVE THE BALL', 'Click throw · Right-click punt');
          setTimeout(() => g.hud.message(''), 1800);
        } else if (ev.k === 'steal' && ev.from === me) {
          g.hud.message('BALL STOLEN', `${who} took it`);
          setTimeout(() => g.hud.message(''), 1500);
        }
      } else if (ev.k === 'throw' || ev.k === 'punt') {
        g.sound.swing(ev.o);
        if (ev.k === 'punt') g.sound.thunk(ev.o, false);
      } else if (ev.k === 'drop') g.sound.land(ev.o, 0.4);
      else if (ev.k === 'reset') g.sound.ui(600);
      return true;
    }
    if (ev.e === 'goal') {
      const who = g.info.get(ev.id)?.name;
      const team = ev.team === 'red' ? 'RED' : 'BLUE';
      const what = ev.how === 'hoop' ? `HOOP! ${team} +3` : ev.how === 'carry' ? `TOUCHDOWN! ${team} +1` : this.mode === 'mugrball' ? `GOAL! ${team} +1` : `GOAL! ${team} SCORES`;
      g.hud.message(what, who ? (ev.own ? `own goal by ${who}` : `scored by ${who}`) : '');
      setTimeout(() => g.hud.message(''), 3000);
      g.sound.roundStart();
      g.sound.explosion(this.ballPos || null);
      if (ev.score) g.teamScore = [ev.score.red, ev.score.blue];
      return true;
    }
    if (ev.e === 'pk') {
      if (ev.k === 'finish') {
        if (ev.id === me) {
          g.hud.message('FINISH!', `${fmt(ev.t)}${ev.pb ? ' · new best!' : ''}`);
          setTimeout(() => g.hud.message(''), 3500);
          g.sound.roundEnd();
        } else g.hud.say('', `${g.info.get(ev.id)?.name || 'Someone'} finished in ${fmt(ev.t)}`, true);
      } else if (ev.k === 'cp') {
        g.hud.message(`CHECKPOINT ${ev.n}/${ev.of}`, fmt(ev.t));
        setTimeout(() => g.hud.message(''), 1500);
        g.sound.pickup('battery');
      } else if (ev.k === 'fall') g.sound.land(null, 0.6);
      else if (ev.k === 'restart') g.sound.ui(700);
      return true;
    }
    return false;
  }

  update(dt) {
    if (this.mode === 'soccer' || this.mode === 'mugrball') this.updateBall(dt);
    if (this.mode === 'mugrball') this.updateCarrier();
    if (this.mode === 'parkour') this.updateHud();
  }

  updateBall(dt) {
    const s = this.snaps;
    if (!s.length) return;
    if (!this.ball) {
      const mb = this.mode === 'mugrball';
      this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 32, 20), new THREE.MeshStandardMaterial({ map: mb ? seamTexture() : ballTexture(), roughness: mb ? 0.7 : 0.45 }));
      this.ball.castShadow = true;
      this.ball.receiveShadow = true;
      this.g.scene.add(this.ball);
    }
    // smoothed like the players: a little behind the server, between two snapshots (or a short way past the last)
    const t = this.g.renderTime;
    let a = s[0], b = s[0];
    for (const x of s) { if (x.t <= t) a = x; b = x; if (x.t >= t) break; }
    let p;
    if (b.t > a.t) {
      const f = Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t)));
      p = [0, 1, 2].map((i) => a.s[i] + (b.s[i] - a.s[i]) * f);
    } else {
      const ahead = Math.min(0.1, Math.max(0, t - b.t));
      p = [b.s[0] + b.s[3] * ahead, b.s[1] + b.s[4] * ahead, b.s[2] + b.s[5] * ahead];
    }
    // carried: in front of the carrier's chest, or in front of your own camera
    const held = this.holder && (this.holder === this.g.myId ? 'me' : this.g.players.get(this.holder));
    if (held === 'me') {
      const cam = this.g.camera, f = new THREE.Vector3();
      cam.getWorldDirection(f);
      const right = new THREE.Vector3().crossVectors(f, new THREE.Vector3(0, 0, 1)).normalize();
      const at = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld).addScaledVector(f, 30).addScaledVector(right, 9);
      at.z -= 13;
      p = [at.x, at.y, at.z];
    } else if (held && held.pos) {
      const y = ((held.yaw || 0) * Math.PI) / 180;
      p = [held.pos[0] + Math.cos(y) * 20, held.pos[1] + Math.sin(y) * 20, held.pos[2] + 4];
    }
    const prev = this.ball.position.clone();
    this.ball.position.set(p[0], p[1], p[2]);
    this.ballPos = p;
    // roll: turn about the axis across the direction of travel
    const d = this.ball.position.clone().sub(prev);
    d.z = 0;
    const dist = d.length();
    if (dist > 0.01 && dist < 200) {
      const axis = new THREE.Vector3(-d.y, d.x, 0).normalize();
      this.ball.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, dist / BALL_R));
    }
  }

  // who has the ball, under the score
  updateCarrier() {
    if (!this.mbEl) return;
    const g = this.g, id = this.holder;
    let html;
    if (!id) html = 'Loose ball';
    else if (id === g.myId) html = '<span class="you">YOU HAVE THE BALL</span><small>click throw · right-click punt · you heal while carrying</small>';
    else {
      const info = g.info.get(id), team = info?.team === 'blue' ? 'blue' : 'red';
      html = `<span class="${team}">● ${esc(info?.name || '?')}</span> has the ball${info?.team === g.info.get(g.myId)?.team ? ' · cover them' : ' · crowbar them to steal it'}`;
    }
    if (html !== this.mbHtml) { this.mbHtml = html; this.mbEl.innerHTML = html; }
  }

  updateHud() {
    if (!this.pkEl) return;
    const g = this.g;
    const [cp, of, start, best] = this.mine || [0, 5, 0, null];
    const now = g.clock ?? 0;
    const ready = start > now;
    const run = ready ? 0 : now - start;
    const rows = (this.board || []).map(([id, t], i) => `<li${id === g.myId ? ' class="me"' : ''}><span>${i + 1}. ${esc(g.info.get(id)?.name || '?')}</span><b>${fmt(t)}</b></li>`).join('');
    const html = `<div class="t">${ready ? 'GET READY' : fmt(run)}</div><div class="cp">checkpoint ${cp}/${of}</div><div class="best">your best ${fmt(best)}</div>`
      + (rows ? `<ol>${rows}</ol>` : '') + '<div class="keys">R restart · E checkpoint · Q rocket jump</div>';
    if (html !== this.pkHtml) { this.pkHtml = html; this.pkEl.innerHTML = html; }
  }
}
