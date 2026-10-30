// The Workshop screen: browse, rate and play levels from the level editor, and make, share and wear gun charms.
// Publishing and rating need an account; browsing, playing and wearing don't. The server checks everything
// (workshop.js); names and text shown here always go through esc().
import { esc } from './hud.js';
import { api } from './net.js';
import { CHARM_SHAPES, CHARM_TEXT, checkCharm } from './cosmetics.js';

const $ = (id) => document.getElementById(id);
const LIB = 'mugr.wslib'; // workshop levels added to this browser: [{ id, name, by }]
const lib = () => { try { return JSON.parse(localStorage.getItem(LIB) || '[]'); } catch { return []; } };

const CSS = `
#dlg-workshop { width: min(820px, calc(100vw - 32px)); }
#dlg-workshop .ws-bar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
#dlg-workshop .ws-bar .grow { flex: 1; }
#dlg-workshop .ws-bar input[type=text] { width: 180px; }
#dlg-workshop .ws-bar select { width: auto; }
#dlg-workshop .ws-list { max-height: 52vh; overflow: auto; border: 1px solid rgba(255,255,255,.08); border-radius: 4px; }
#dlg-workshop .ws-item { display: grid; grid-template-columns: 56px 1fr auto; gap: 10px; align-items: center; padding: 8px 10px; border-top: 1px solid rgba(255,255,255,.06); }
#dlg-workshop .ws-item:first-child { border-top: 0; }
#dlg-workshop .ws-item canvas, #dlg-workshop .ws-thumb { width: 56px; height: 56px; border-radius: 4px; background: var(--panel-dark); display: grid; place-items: center; color: var(--text-dim); font: bold 10px var(--ui); }
#dlg-workshop .ws-item b { color: #fff; display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#dlg-workshop .ws-item small { color: var(--text-dim); display: block; }
#dlg-workshop .ws-go { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
#dlg-workshop .ws-go .btn { padding: 5px 10px; }
#dlg-workshop .ws-stars { display: inline-flex; gap: 1px; }
#dlg-workshop .ws-stars button { background: none; border: 0; padding: 0 1px; cursor: pointer; color: rgba(255,255,255,.3); font-size: 15px; line-height: 1; }
#dlg-workshop .ws-stars button.on { color: var(--accent); }
#dlg-workshop .ws-stars button:disabled { cursor: default; }
#dlg-workshop .ws-empty { color: var(--text-dim); text-align: center; padding: 24px; }
#dlg-workshop .ws-maker { display: grid; grid-template-columns: 160px 1fr; gap: 16px; margin-bottom: 12px; padding: 12px; background: rgba(0,0,0,.18); border-radius: 4px; }
#dlg-workshop .ws-maker canvas { width: 160px; height: 160px; border-radius: 6px; background: radial-gradient(circle at 50% 40%, #4a4c45, #24251f); }
#dlg-workshop .ws-maker .row { grid-template-columns: 90px 1fr; margin-bottom: 6px; }
#dlg-workshop .ws-maker input[type=color] { width: 48px; height: 26px; padding: 0; border: 1px solid rgba(255,255,255,.2); background: none; }
#dlg-workshop .ws-wearing { color: var(--accent); font-size: 11px; }
@media (max-width: 640px) { #dlg-workshop .ws-item { grid-template-columns: 44px 1fr; } #dlg-workshop .ws-go { grid-column: 1 / -1; justify-content: flex-start; } #dlg-workshop .ws-maker { grid-template-columns: 1fr; } }
`;

// a charm drawn flat (the list and the maker's preview)
export function drawCharm(cv, d) {
  const g = cv.getContext('2d'), S = cv.width;
  g.clearRect(0, 0, S, S);
  g.save();
  g.translate(S / 2, S * 0.55);
  const r = S * 0.34;
  // the ring and chain it hangs from
  g.strokeStyle = '#b9bec6'; g.lineWidth = S * 0.025;
  g.beginPath(); g.arc(0, -r - S * 0.12, S * 0.04, 0, Math.PI * 2); g.moveTo(0, -r - S * 0.08); g.lineTo(0, -r * 0.92); g.stroke();
  const path = new Path2D();
  const poly = (pts) => { pts.forEach(([x, y], i) => (i ? path.lineTo(x * r, y * r) : path.moveTo(x * r, y * r))); path.closePath(); };
  switch (d.shape) {
    case 'disc': case 'ball': path.arc(0, 0, r, 0, Math.PI * 2); break;
    case 'hex': poly(Array.from({ length: 6 }, (_, i) => [Math.cos((i / 6) * Math.PI * 2 + Math.PI / 6), Math.sin((i / 6) * Math.PI * 2 + Math.PI / 6)])); break;
    case 'diamond': poly([[0, -1.15], [0.8, 0], [0, 1.15], [-0.8, 0]]); break;
    case 'star': poly(Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, k = i % 2 ? 0.45 : 1.1; return [Math.cos(a) * k, Math.sin(a) * k]; })); break;
    case 'heart': path.moveTo(0, r); path.bezierCurveTo(-1.3 * r, 0.15 * r, -r, -0.8 * r, 0, -0.35 * r); path.bezierCurveTo(r, -0.8 * r, 1.3 * r, 0.15 * r, 0, r); break;
    case 'shield': path.moveTo(-0.8 * r, -0.85 * r); path.lineTo(0.8 * r, -0.85 * r); path.lineTo(0.8 * r, 0); path.quadraticCurveTo(0.75 * r, 0.75 * r, 0, 1.15 * r); path.quadraticCurveTo(-0.75 * r, 0.75 * r, -0.8 * r, 0); path.closePath(); break;
    case 'cube': path.roundRect(-0.85 * r, -0.85 * r, 1.7 * r, 1.7 * r, 0.25 * r); break;
    default: path.roundRect(-0.65 * r, -r, 1.3 * r, 2 * r, 0.2 * r); // tag
  }
  if (d.glow) { g.shadowColor = d.c1; g.shadowBlur = S * 0.12; }
  const grad = g.createLinearGradient(-r, -r, r, r);
  grad.addColorStop(0, d.metal ? '#ffffff' : d.c1); grad.addColorStop(d.metal ? 0.35 : 0.6, d.c1); grad.addColorStop(1, '#000000');
  g.fillStyle = d.c1; g.fill(path);
  g.globalAlpha = 0.35; g.fillStyle = grad; g.fill(path); g.globalAlpha = 1;
  g.shadowBlur = 0;
  g.strokeStyle = d.c2; g.lineWidth = S * 0.035; g.stroke(path);
  if (d.text) {
    g.fillStyle = d.c2; g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = S * 0.02;
    g.font = `900 ${Math.round(S * (d.text.length > 3 ? 0.26 / Math.sqrt(d.text.length / 3) : 0.26))}px Verdana, Arial, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.strokeText(d.text, 0, S * 0.01, r * 1.8); g.fillText(d.text, 0, S * 0.01, r * 1.8);
  }
  g.restore();
}

export class WorkshopView {
  // opts: { token(), account(), profile(), signIn(), equip(id) -> profile, host(id, name), editor(), status(text) }
  constructor(opts) {
    this.opts = opts;
    this.kind = 'level';
    this.sort = 'top';
    this.maker = { shape: 'star', c1: '#ff8c14', c2: '#ffffff', text: '', glow: false, metal: false, name: '' };
    const st = document.createElement('style');
    st.id = 'workshop-style';
    st.textContent = CSS;
    document.head.appendChild(st);
    const el = document.createElement('div');
    el.className = 'dialog wide';
    el.id = 'dlg-workshop';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-labelledby', 'dlg-workshop-title');
    el.innerHTML = `
      <h2 id="dlg-workshop-title">Workshop</h2>
      <div class="tabs" role="tablist"><button class="tab ws-tab" data-kind="level" role="tab">Levels</button><button class="tab ws-tab" data-kind="charm" role="tab">Gun charms</button></div>
      <div id="ws-maker-box"></div>
      <div class="ws-bar">
        <input type="text" id="ws-q" maxlength="40" placeholder="Search names and makers" aria-label="Search">
        <select id="ws-sort" aria-label="Sort"><option value="top">Top rated</option><option value="new">Newest</option><option value="plays">Most played</option></select>
        <label class="check"><input type="checkbox" id="ws-mine"> Mine</label>
        <span class="grow"></span>
        <button type="button" class="btn" id="ws-make"></button>
      </div>
      <div class="ws-list" id="ws-list"></div>
      <div class="err" id="ws-err" role="alert"></div>
      <div class="actions"><button type="button" class="btn primary" id="ws-close">Close</button></div>`;
    document.body.appendChild(el);
    for (const b of el.querySelectorAll('.ws-tab')) b.onclick = () => { this.kind = b.dataset.kind; this.makerOpen = false; this.render(); };
    $('ws-sort').onchange = () => { this.sort = $('ws-sort').value; this.refresh(); };
    $('ws-mine').onchange = () => this.refresh();
    let t = 0;
    $('ws-q').oninput = () => { clearTimeout(t); t = setTimeout(() => this.refresh(), 300); };
    $('ws-make').onclick = () => {
      if (this.kind === 'level') { this.close(); this.opts.editor(); return; }
      this.makerOpen = !this.makerOpen;
      this.renderMaker();
    };
    $('ws-close').onclick = () => this.close();
  }

  open(kind) {
    if (kind) this.kind = kind;
    $('dlg-workshop').hidden = false;
    this.render();
  }
  close() { $('dlg-workshop').hidden = true; }
  get isOpen() { return !$('dlg-workshop').hidden; }

  // levels added to this browser (for Create game's map list and the editor's copies)
  library() { return lib(); }
  remember(e) {
    const list = lib().filter((x) => x.id !== e.id);
    list.unshift({ id: e.id, name: e.name, by: e.by });
    try { localStorage.setItem(LIB, JSON.stringify(list.slice(0, 50))); } catch {}
  }
  forget(id) {
    try { localStorage.setItem(LIB, JSON.stringify(lib().filter((x) => x.id !== id))); } catch {}
  }

  async post(route, body) {
    try {
      const r = await fetch(api('/api/workshop/' + route), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: this.opts.token(), ...body }) });
      return await r.json();
    } catch { return { error: 'Can\'t reach the server.' }; }
  }

  // a published level's data (to play or edit a copy)
  async level(id) {
    const r = await this.post('get', { id });
    return r.item?.kind === 'level' ? r.item.data : null;
  }

  async publish(kind, data, name) {
    if (!this.opts.account()) return { error: 'Sign in (Account, top of the menu) to publish to the workshop.' };
    return this.post('publish', { kind, data, name });
  }

  render() {
    for (const b of document.querySelectorAll('#dlg-workshop .ws-tab')) b.classList.toggle('on', b.dataset.kind === this.kind);
    $('ws-make').textContent = this.kind === 'level' ? 'Open level editor' : this.makerOpen ? 'Hide charm maker' : 'Make a charm';
    $('ws-err').textContent = '';
    this.renderMaker();
    this.refresh();
  }

  async refresh() {
    const kind = this.kind;
    const q = new URLSearchParams({ kind, sort: this.sort, q: $('ws-q').value.trim() });
    if ($('ws-mine').checked) { q.set('mine', '1'); q.set('token', this.opts.token()); }
    $('ws-list').innerHTML = '<div class="ws-empty">Loading…</div>';
    const r = await fetch(api('/api/workshop?' + q)).then((x) => x.json()).catch(() => ({ error: 'Can\'t reach the server.' }));
    if (kind !== this.kind) return;
    if (r.error) { $('ws-list').innerHTML = `<div class="ws-empty">${esc(r.error)}</div>`; return; }
    this.items = r.items;
    this.renderList();
  }

  stars(e) {
    const me = this.opts.account();
    const mine = me && e.by.toLowerCase() === me.toLowerCase();
    const n = Math.round(e.myStars || e.rating || 0);
    const title = mine ? 'Your own' : me ? 'Rate it' : 'Sign in to rate';
    return `<span class="ws-stars" title="${title}">${[1, 2, 3, 4, 5].map((s) => `<button type="button" data-rate="${s}" data-id="${e.id}" class="${s <= n ? 'on' : ''}"${mine ? ' disabled' : ''} aria-label="${s} star${s > 1 ? 's' : ''}">★</button>`).join('')}</span>`;
  }

  renderList() {
    const me = (this.opts.account() || '').toLowerCase(), staff = !!this.opts.profile()?.role || me === 'watermelon';
    const wearing = this.opts.profile()?.eq?.charm === 'ws' ? this.opts.profile()?.wc?.id : null;
    const have = new Set(lib().map((x) => x.id));
    const rows = (this.items || []).map((e) => {
      const info = `${e.rating ? `${e.rating.toFixed(1)}★ (${e.votes})` : 'No ratings yet'} · ${e.dl} ${this.kind === 'level' ? 'played' : 'got'}${e.n ? ` · ${e.n} boxes` : ''}`;
      const del = e.by.toLowerCase() === me || staff ? `<button type="button" class="btn" data-del="${e.id}">Delete</button>` : '';
      const go = this.kind === 'level'
        ? `<button type="button" class="btn primary" data-host="${e.id}">Play</button><button type="button" class="btn" data-lib="${e.id}">${have.has(e.id) ? 'Saved ✓' : 'Save'}</button>`
        : wearing === e.id ? '<button type="button" class="btn" data-wear="">Take off</button>' : `<button type="button" class="btn primary" data-wear="${e.id}">Wear</button>`;
      const thumb = this.kind === 'charm' ? `<canvas width="112" height="112" data-charm="${e.id}"></canvas>` : '<div class="ws-thumb">LEVEL</div>';
      return `<div class="ws-item">${thumb}<div><b>${esc(e.name)}</b><small>by ${esc(e.by)} · ${info}</small>${this.stars(e)}${wearing === e.id ? ' <span class="ws-wearing">Wearing</span>' : ''}</div><div class="ws-go">${go}${del}</div></div>`;
    });
    $('ws-list').innerHTML = rows.join('') || `<div class="ws-empty">${$('ws-q').value || $('ws-mine').checked ? 'Nothing found.' : this.kind === 'level' ? 'No levels yet. Build one in the level editor and publish it!' : 'No charms yet. Make one!'}</div>`;
    const byId = Object.fromEntries((this.items || []).map((e) => [e.id, e]));
    for (const cv of $('ws-list').querySelectorAll('canvas[data-charm]')) drawCharm(cv, byId[cv.dataset.charm].c);
    for (const b of $('ws-list').querySelectorAll('[data-rate]')) b.onclick = () => this.rate(b.dataset.id, +b.dataset.rate);
    for (const b of $('ws-list').querySelectorAll('[data-del]')) b.onclick = () => this.remove(byId[b.dataset.del]);
    for (const b of $('ws-list').querySelectorAll('[data-lib]')) b.onclick = () => { const e = byId[b.dataset.lib]; if (have.has(e.id)) this.forget(e.id); else this.remember(e); this.renderList(); };
    for (const b of $('ws-list').querySelectorAll('[data-host]')) b.onclick = () => {
      const e = byId[b.dataset.host];
      this.remember(e);
      this.close();
      this.opts.host(e.id, e.name);
    };
    for (const b of $('ws-list').querySelectorAll('[data-wear]')) b.onclick = () => this.wear(b.dataset.wear || null);
  }

  async rate(id, stars) {
    if (!this.opts.account()) { $('ws-err').textContent = 'Sign in to rate things.'; return; }
    const r = await this.post('rate', { id, stars });
    if (r.error) { $('ws-err').textContent = r.error; return; }
    const e = this.items.find((x) => x.id === id);
    Object.assign(e, r.item, { myStars: r.myStars });
    this.renderList();
  }

  async remove(e) {
    if (!confirm(`Delete "${e.name}" from the workshop? This can't be undone.`)) return;
    const r = await this.post('delete', { id: e.id });
    if (r.error) { $('ws-err').textContent = r.error; return; }
    this.forget(e.id);
    this.refresh();
  }

  async wear(id) {
    const r = await this.opts.equip(id);
    if (r?.error) { $('ws-err').textContent = r.error; return; }
    this.opts.status(id ? 'Charm on: it hangs off every gun you hold.' : 'Charm taken off.');
    this.renderList();
  }

  // ---------------------------------------------------------------- the charm maker
  renderMaker() {
    const box = $('ws-maker-box');
    if (this.kind !== 'charm' || !this.makerOpen) { box.innerHTML = ''; return; }
    const M = this.maker;
    box.innerHTML = `<div class="ws-maker"><canvas id="ws-cprev" width="320" height="320" aria-label="Charm preview"></canvas><div>
      <div class="row"><label for="ws-cname">Name</label><input type="text" id="ws-cname" maxlength="32" placeholder="Charm name"></div>
      <div class="row"><label for="ws-cshape">Shape</label><select id="ws-cshape">${Object.entries(CHARM_SHAPES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}</select></div>
      <div class="row"><label>Colours</label><div><input type="color" id="ws-c1" aria-label="Main colour"> <input type="color" id="ws-c2" aria-label="Edge and letters colour"></div></div>
      <div class="row"><label for="ws-ctext">Letters</label><input type="text" id="ws-ctext" maxlength="${CHARM_TEXT}" placeholder="Up to ${CHARM_TEXT} (optional)"></div>
      <div class="row"><label>Finish</label><div><label class="check" style="display:inline-flex"><input type="checkbox" id="ws-cglow"> Glow</label> <label class="check" style="display:inline-flex"><input type="checkbox" id="ws-cmetal"> Metal</label></div></div>
      <div class="actions" style="margin-top:6px"><button type="button" class="btn primary" id="ws-cpub">Publish charm</button></div>
    </div></div>`;
    $('ws-cname').value = M.name; $('ws-cshape').value = M.shape; $('ws-c1').value = M.c1; $('ws-c2').value = M.c2;
    $('ws-ctext').value = M.text; $('ws-cglow').checked = M.glow; $('ws-cmetal').checked = M.metal;
    const upd = () => {
      Object.assign(M, { name: $('ws-cname').value, shape: $('ws-cshape').value, c1: $('ws-c1').value, c2: $('ws-c2').value, text: $('ws-ctext').value, glow: $('ws-cglow').checked, metal: $('ws-cmetal').checked });
      drawCharm($('ws-cprev'), checkCharm(M).charm);
    };
    for (const id of ['ws-cname', 'ws-cshape', 'ws-c1', 'ws-c2', 'ws-ctext', 'ws-cglow', 'ws-cmetal']) $(id).oninput = $(id).onchange = upd;
    upd();
    $('ws-cpub').onclick = async () => {
      upd();
      const r = await this.publish('charm', checkCharm(M).charm, M.name);
      if (r.error) { $('ws-err').textContent = r.error; return; }
      this.makerOpen = false;
      this.sort = 'new';
      $('ws-sort').value = 'new';
      this.render();
      this.opts.status(`Published "${r.item.name}". Press Wear to put it on.`);
    };
  }
}
