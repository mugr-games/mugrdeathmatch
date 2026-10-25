// Shop and wardrobe: one dialog with a turning preview of your character. Coins and owned items live on the
// server under this browser's secret save code; the dialog only asks the server to buy or equip.
import * as THREE from 'three';
import { Avatar, MODELS, SUIT_COLORS } from './avatar.js';
import { COSMETICS, COSMETIC, COS_SLOTS } from './cosmetics.js';
import { esc } from './hud.js';
import { api } from './net.js';

const $ = (id) => document.getElementById(id);

// this browser's save code (keep it secret: it is what owns the coins)
export function saveToken() {
  let t = null;
  try { t = localStorage.getItem('arena.token'); } catch {}
  if (!/^[a-f0-9]{32}$/.test(t || '')) {
    t = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
    try { localStorage.setItem('arena.token', t); } catch {}
  }
  return t;
}

// a small renderer of its own, only running while the dialog is open
class Preview {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene = new THREE.Scene();
    const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
    key.position.set(60, -40, 90);
    const rim = new THREE.DirectionalLight(0x9fc4ff, 1.6);
    rim.position.set(-80, 50, 60);
    this.scene.add(key, rim, new THREE.HemisphereLight(0xbfd6ff, 0x3a3430, 0.9));
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 1000);
    this.camera.up.set(0, 0, 1);
    this.camera.position.set(185, -50, 70);
    this.camera.lookAt(0, 0, 45);
    this.turn = new THREE.Group();
    this.scene.add(this.turn);
    this.avatar = null;
    this.running = false;
  }

  show(color, model, cos) {
    if (this.avatar) { this.turn.remove(this.avatar.root); this.avatar.root.traverse((o) => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); }); this.avatar.dispose(); }
    this.avatar = new Avatar(color, model, cos);
    this.avatar.root.matrixAutoUpdate = true;
    this.turn.add(this.avatar.root);
  }

  start() {
    if (this.running) return;
    this.running = true;
    let last = performance.now();
    const frame = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
      if (w && (this.canvas.width !== w * devicePixelRatio || this.canvas.height !== h * devicePixelRatio)) {
        this.renderer.setPixelRatio(devicePixelRatio);
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
      }
      this.turn.rotation.z += dt * 0.6;
      this.avatar?.animate(dt, { speed: 0, fwdSpeed: 0, sideSpeed: 0, ground: true, ducked: false, pitch: 0, alive: true });
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
  }
}

// switch this browser to another save code (after logging in or registering)
export function setSaveToken(t) {
  try { localStorage.setItem('arena.token', t); } catch {}
}

// opts: { settings, save(), onLook(color, model), sound }
export class Locker {
  constructor(opts) {
    this.opts = opts;
    this.token = saveToken();
    this.profile = { coins: 0, owned: [], eq: {} };
    this.tab = 'shop';
    this.slot = 'hat';
    this.preview = null;
    this.listeners = [];
    $('lk-close').onclick = () => this.close();
    for (const b of document.querySelectorAll('#dlg-locker .lk-tab')) b.onclick = () => { this.tab = b.dataset.tab; this.render(); };
    $('lk-model').onchange = $('lk-color').onchange = () => {
      const s = this.opts.settings;
      s.model = +$('lk-model').value;
      s.color = +$('lk-color').value;
      this.opts.save();
      this.opts.onLook(s.color, s.model);
      this.refreshPreview();
    };
    this.load();
  }

  // call fn(profile) whenever the coins or items change
  onChange(fn) {
    this.listeners.push(fn);
    fn(this.profile);
  }

  set(profile) {
    if (!profile || profile.coins === undefined) return;
    this.profile = profile;
    for (const fn of this.listeners) fn(profile);
    if (!$('dlg-locker').hidden) this.render();
  }

  // the server says the balance changed (a kill or a win)
  coins(n) {
    this.profile.coins = n;
    for (const fn of this.listeners) fn(this.profile);
  }

  async api(route, body = {}) {
    try {
      const r = await fetch(api('/api/' + route), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: this.token, ...body }) });
      const p = await r.json();
      this.set(p);
      return p;
    } catch {
      return { error: 'Can\'t reach the server.' };
    }
  }

  load() {
    return this.api('profile');
  }

  open(tab = 'shop') {
    this.tab = tab;
    $('dlg-locker').hidden = false;
    if (!this.preview) this.preview = new Preview($('lk-preview'));
    const s = this.opts.settings;
    $('lk-model').innerHTML = MODELS.map((m, i) => `<option value="${i}">${esc(m.name)}</option>`).join('');
    $('lk-model').value = String(s.model | 0);
    $('lk-color').innerHTML = SUIT_COLORS.map((c, i) => `<option value="${i}">${esc(c.name)}</option>`).join('');
    $('lk-color').value = String(s.color | 0);
    this.refreshPreview();
    this.preview.start();
    this.load();
    this.render();
  }

  close() {
    $('dlg-locker').hidden = true;
    this.preview?.stop();
  }

  // what the preview wears: equipped items, or the one being looked at in the shop
  refreshPreview(trying) {
    if (!this.preview) return;
    const cos = { ...this.profile.eq };
    if (trying) cos[COSMETIC[trying].slot] = trying;
    this.preview.show(this.opts.settings.color | 0, this.opts.settings.model | 0, cos);
  }

  render() {
    const P = this.profile;
    for (const b of document.querySelectorAll('#dlg-locker .lk-tab')) b.classList.toggle('on', b.dataset.tab === this.tab);
    $('lk-coins').textContent = P.coins.toLocaleString();
    $('lk-look').hidden = this.tab !== 'wardrobe';
    $('lk-slots').innerHTML = Object.entries(COS_SLOTS).map(([k, v]) => `<button type="button" class="lk-slot${k === this.slot ? ' on' : ''}" data-slot="${k}">${v}</button>`).join('');
    for (const b of $('lk-slots').children) b.onclick = () => { this.slot = b.dataset.slot; this.render(); };
    // hidden items (the Owner cape) aren't for sale: they only show up for whoever has them
    const items = COSMETICS.filter((c) => c.slot === this.slot && (c.hidden ? P.owned.includes(c.id) : this.tab === 'shop' || P.owned.includes(c.id)));
    const cards = items.map((c) => {
      const owned = P.owned.includes(c.id), worn = P.eq[c.slot] === c.id;
      const swatch = c.color ? `<i class="lk-sw" style="background:${c.color === 'rainbow' ? 'linear-gradient(90deg,#f33,#fd3,#3f6,#3cf,#a3f)' : c.color}"></i>` : '';
      let action;
      if (this.tab === 'shop') action = owned ? '<span class="lk-own">Owned</span>' : `<button type="button" class="btn${P.coins >= c.price ? ' primary' : ''}" data-buy="${c.id}">${c.price ? `Buy · ${c.price}` : 'Get · Free'}</button>`;
      else action = worn ? `<button type="button" class="btn" data-off="${c.slot}">Take off</button>` : `<button type="button" class="btn primary" data-wear="${c.id}">Wear</button>`;
      return `<div class="lk-card${worn ? ' worn' : ''}" data-id="${c.id}">${swatch}<b>${esc(c.name)}</b><span class="lk-price">${this.tab === 'shop' && !owned ? (c.price ? `${c.price} coins` : 'Free') : worn ? 'Wearing' : ''}</span>${action}</div>`;
    });
    $('lk-items').innerHTML = cards.join('') || `<p class="lk-empty">${this.tab === 'wardrobe' ? 'Nothing here yet. Buy something in the shop.' : ''}</p>`;
    $('lk-msg').textContent = '';
    for (const card of $('lk-items').querySelectorAll('.lk-card')) {
      card.onmouseenter = () => this.refreshPreview(card.dataset.id);
      card.onmouseleave = () => this.refreshPreview();
    }
    for (const b of $('lk-items').querySelectorAll('[data-buy]')) b.onclick = async () => {
      const r = await this.api('buy', { item: b.dataset.buy });
      if (r.error) $('lk-msg').textContent = r.error;
      else { this.opts.sound?.pickup('battery'); $('lk-msg').textContent = `Bought ${COSMETIC[b.dataset.buy].name}. You're wearing it now.`; this.refreshPreview(); }
    };
    for (const b of $('lk-items').querySelectorAll('[data-wear]')) b.onclick = async () => { await this.api('equip', { slot: this.slot, item: b.dataset.wear }); this.opts.sound?.ui(1000); this.refreshPreview(); };
    for (const b of $('lk-items').querySelectorAll('[data-off]')) b.onclick = async () => { await this.api('equip', { slot: b.dataset.off, item: null }); this.opts.sound?.ui(700); this.refreshPreview(); };
  }
}
