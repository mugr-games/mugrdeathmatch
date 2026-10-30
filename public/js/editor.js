// The level editor: build a map out of boxes, place spawns, items and flags (or leave them to the automatic
// layout), fly around it, test-play it in a private game and publish it to the workshop.
// Levels are saved in this browser in the workshop format (checkLevel in mapdefs.js), the same one the server
// plays. It draws with the game's own renderer while it's open (main.js stops drawing the game meanwhile).
import * as THREE from 'three';
import { checkLevel, levelMap, LEVEL_MATS, LEVEL_THEMES, LEVEL_MOODS, LEVEL_ITEMS, LEVEL_LIMITS } from './mapdefs.js';
import { levelMaterial } from './maps.js';
import { esc } from './hud.js';
import { WEAPONS } from './weapons.js';

const $ = (id) => document.getElementById(id);
const STORE = 'mugr.levels'; // { [local id]: level } in localStorage
const CURRENT = 'mugr.level.cur';
const GRIDS = [8, 16, 32, 64, 128];
const TOOLS = [['select', 'Select', 'Click a box or marker to select it. Drag a selected box to slide it.'], ['box', 'Box', 'Click a surface to put a box there (the brush size below).'], ['spawn', 'Spawn', 'Click a floor to add a spawn point. Q and E turn it.'], ['item', 'Item', 'Click a floor to put the chosen item there.'], ['flag', 'Flags', 'Click a floor for the red flag, then the blue one.']];
const ITEM_COLOR = (k) => (/health|vial/.test(k) ? 0x4cff7a : /battery|armor/.test(k) ? 0x4fb4ff : /ammo/.test(k) ? 0xffd84a : /damage|haste|boots|mega/.test(k) ? 0xd86bff : 0xff8c3a);
const MAT_SWATCH = { concrete: '#9a958c', plate: '#7d8188', metal: '#6f757d', panel: '#8a8478', hazard: '#e8b400', neon: '#56d8ff', stone: '#c8c2b8', marble: '#ece8e0', brick: '#9b5640', wood: '#8a6438', tile: '#d8d4cc', cobble: '#8a8478', grass: '#4e7a36', sand: '#d8c290', asphalt: '#3a3b3e', glass: '#9fc4d8', water: '#24404e', ice: '#dfeef8', gold: '#e8b830', carpet: '#7a1a1e', wallpaper: '#cdb860', clip: 'repeating-linear-gradient(45deg,#7fd4ff55 0 4px,transparent 4px 8px)' };
const weaponName = (k) => { const n = WEAPONS.find((w) => w.id === k)?.name; return n && n[0] + n.slice(1).toLowerCase(); };
const ITEM_NAME = (k) => weaponName(k) || { health: 'Health kit', vial: 'Health vial', battery: 'Armour battery', heavyarmor: 'Heavy armour', ammo: 'Ammo', damage: 'Damage boost', haste: 'Haste', boots: 'Jump boots', megahealth: 'Mega health' }[k] || k;

const starter = () => ({ name: 'My level', theme: 'foundry', mood: 'day', boxes: [[-1024, -1024, -32, 1024, 1024, 0, 'plate']], spawns: [], items: [], flags: null });
const load = () => { try { return JSON.parse(localStorage.getItem(STORE) || '{}'); } catch { return {}; } };
const store = (all) => { try { localStorage.setItem(STORE, JSON.stringify(all)); return true; } catch { return false; } };

const CSS = `
#editor { position: fixed; inset: 0; z-index: 25; pointer-events: none; font: 12px/1.4 var(--ui); color: var(--text); }
#editor > * { pointer-events: auto; }
#editor .ed-view { position: absolute; inset: 0; cursor: crosshair; touch-action: none; }
#editor .ed-panel { position: absolute; background: var(--panel); border: 1px solid var(--panel-edge); border-radius: 6px; box-shadow: 0 10px 30px rgba(0,0,0,.5); padding: 10px 12px; max-height: calc(100vh - 80px); overflow: auto; }
#editor .ed-left { left: 12px; top: 60px; width: 230px; }
#editor .ed-right { right: 12px; top: 60px; width: 230px; }
#editor .ed-top { left: 12px; right: 12px; top: 10px; display: flex; gap: 6px; align-items: center; flex-wrap: wrap; padding: 6px 10px; max-height: none; overflow: visible; }
#editor .ed-top b { color: #fff; font-size: 13px; margin-right: 6px; }
#editor .ed-top .grow { flex: 1; }
#editor h3 { margin: 10px 0 6px; font: bold 11px var(--ui); letter-spacing: .08em; text-transform: uppercase; color: var(--text-dim); }
#editor h3:first-child { margin-top: 0; }
#editor .ed-tools { display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; }
#editor .ed-tools button { padding: 6px 0; font-size: 11px; }
#editor .btn.on { border-color: var(--accent); box-shadow: inset 0 0 0 1px var(--accent); }
#editor .btn { padding: 5px 10px; }
#editor .ed-mats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; }
#editor .ed-mats button { height: 26px; border: 1px solid rgba(255,255,255,.15); border-radius: 3px; cursor: pointer; padding: 0; }
#editor .ed-mats button.on { outline: 2px solid var(--accent); outline-offset: 1px; }
#editor .ed-xyz { display: grid; grid-template-columns: 34px repeat(3, 1fr); gap: 3px; align-items: center; margin-bottom: 4px; }
#editor input[type=number], #editor input[type=text], #editor select { width: 100%; min-width: 0; background: var(--panel-dark); border: 1px solid rgba(255,255,255,.12); border-radius: 3px; padding: 4px 5px; color: var(--text); outline: none; }
#editor input:focus, #editor select:focus { border-color: var(--accent); }
#editor .ed-top input[type=text] { width: 180px; }
#editor .ed-top select { width: auto; }
#editor .ed-row { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 6px; }
#editor .ed-hint { color: var(--text-dim); font-size: 11px; margin: 6px 0 0; }
#editor .ed-status { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); background: rgba(0,0,0,.6); padding: 6px 12px; border-radius: 4px; max-width: 70vw; text-align: center; pointer-events: none; }
#editor .ed-status:empty { display: none; }
#editor .ed-count { color: var(--text-dim); }
#editor .ed-move { position: absolute; left: 50%; bottom: 52px; transform: translateX(-50%); display: none; gap: 6px; }
body.touch #editor .ed-move { display: flex; }
#editor .ed-move button { width: 46px; height: 46px; font-size: 16px; }
#editor .ed-open { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(420px, calc(100vw - 32px)); }
#editor .ed-open ul { list-style: none; margin: 0; padding: 0; }
#editor .ed-open li { display: flex; gap: 6px; align-items: center; padding: 5px 0; border-top: 1px solid rgba(255,255,255,.06); }
#editor .ed-open li span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 900px) { #editor .ed-left, #editor .ed-right { width: 190px; } }
@media (max-width: 640px) { #editor .ed-right { top: auto; bottom: 110px; max-height: 40vh; } #editor .ed-left { max-height: calc(100vh - 200px); } }
`;

export class LevelEditor {
  // opts: { game: () => the Game, test(level, mode, bots), publish(level) -> Promise<{ error } | { item }>, close() }
  constructor(opts) {
    this.opts = opts;
    this.active = false;
    this.tool = 'select';
    this.mat = 'concrete';
    this.brush = [128, 128, 128];
    this.grid = 16;
    this.itemKind = 'health';
    this.sel = null; // { kind: box | spawn | item | flag, i }
    this.undoStack = [];
    this.redoStack = [];
    this.keys = new Set();
    this.cam = { pos: new THREE.Vector3(-900, -900, 700), yaw: 45, pitch: -30 };
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(CURRENT) || 'null'); } catch {}
    this.localId = saved?.id || null;
    this.level = (this.localId && load()[this.localId]) || starter();
    this.build();
  }

  // ---------------------------------------------------------------- page
  build() {
    const st = document.createElement('style');
    st.id = 'editor-style';
    st.textContent = CSS;
    document.head.appendChild(st);
    const el = (this.el = document.createElement('div'));
    el.id = 'editor';
    el.hidden = true;
    const opt = (o, cur) => Object.entries(o).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(v)}</option>`).join('');
    const xyz = (label, id) => `<div class="ed-xyz"><span>${label}</span>${['x', 'y', 'z'].map((a) => `<input type="number" id="${id}-${a}" step="8" aria-label="${label} ${a}">`).join('')}</div>`;
    el.innerHTML = `
      <div class="ed-view" id="ed-view"></div>
      <div class="ed-panel ed-top">
        <b>Level editor</b>
        <input type="text" id="ed-name" maxlength="${LEVEL_LIMITS.name}" aria-label="Level name" placeholder="Level name">
        <select id="ed-theme" aria-label="Colours" title="Colours (from a map)">${opt(LEVEL_THEMES)}</select>
        <select id="ed-mood" aria-label="Lighting" title="Lighting">${opt(LEVEL_MOODS)}</select>
        <span class="ed-count" id="ed-count"></span>
        <span class="grow"></span>
        <button type="button" class="btn" id="ed-new">New</button>
        <button type="button" class="btn" id="ed-openbtn">Open</button>
        <button type="button" class="btn" id="ed-save">Save</button>
        <select id="ed-testmode" aria-label="Test mode" title="Mode to test in"><option value="dm">Deathmatch</option><option value="tdm">Team DM</option><option value="ctf">Capture the flag</option><option value="infection">Infection</option></select>
        <button type="button" class="btn" id="ed-test">Test play</button>
        <button type="button" class="btn primary" id="ed-publish">Publish</button>
        <button type="button" class="btn" id="ed-exit">Exit</button>
      </div>
      <div class="ed-panel ed-left">
        <h3>Tool</h3>
        <div class="ed-tools" id="ed-tools">${TOOLS.map(([k, n], i) => `<button type="button" class="btn" data-tool="${k}" title="${esc(n)} (${i + 1})">${esc(n)}</button>`).join('')}</div>
        <p class="ed-hint" id="ed-toolhint"></p>
        <h3>Material</h3>
        <div class="ed-mats" id="ed-mats">${LEVEL_MATS.map((m) => `<button type="button" data-mat="${m}" title="${m === 'clip' ? 'invisible wall' : m}" style="background:${MAT_SWATCH[m]}"></button>`).join('')}</div>
        <p class="ed-hint" id="ed-matname"></p>
        <h3>New box size</h3>
        <div class="ed-xyz"><span>Size</span>${[0, 1, 2].map((i) => `<input type="number" id="ed-brush-${i}" min="1" step="8" value="${this.brush[i]}" aria-label="Brush size ${'xyz'[i]}">`).join('')}</div>
        <h3>Grid</h3>
        <select id="ed-grid">${GRIDS.map((g) => `<option value="${g}"${g === this.grid ? ' selected' : ''}>${g} units</option>`).join('')}</select>
        <h3>Item</h3>
        <select id="ed-item">${LEVEL_ITEMS.map((k) => `<option value="${k}">${esc(ITEM_NAME(k))}</option>`).join('')}</select>
        <h3>Spawns, items, flags</h3>
        <p class="ed-hint" id="ed-layout"></p>
        <div class="ed-row"><button type="button" class="btn" id="ed-auto">Show automatic</button><button type="button" class="btn" id="ed-clearpts">Clear placed</button></div>
        <p class="ed-hint">Fly: right-drag (or drag empty space) to look, WASD to move, Space / C up and down, Shift faster, mouse wheel to zoom. Players are 72 tall, climb steps up to 18 and jump about 40.</p>
      </div>
      <div class="ed-panel ed-right" id="ed-sel"></div>
      <div class="ed-move"><button type="button" class="btn" data-mv="KeyW">▲</button><button type="button" class="btn" data-mv="KeyS">▼</button><button type="button" class="btn" data-mv="Space">⤒</button><button type="button" class="btn" data-mv="KeyC">⤓</button></div>
      <div class="ed-status" id="ed-status" role="status"></div>
      <div class="ed-panel ed-open" id="ed-open" hidden></div>`;
    document.body.appendChild(el);
    this.selPanel = $('ed-sel');
    this.xyzHtml = xyz;

    $('ed-name').oninput = () => { this.level.name = $('ed-name').value; this.dirty = true; };
    $('ed-theme').onchange = () => { this.change(() => { this.level.theme = $('ed-theme').value; }); this.rebuild(); };
    $('ed-mood').onchange = () => { this.change(() => { this.level.mood = $('ed-mood').value; }); this.lighting(); };
    for (const b of $('ed-tools').children) b.onclick = () => this.setTool(b.dataset.tool);
    for (const b of $('ed-mats').children) b.onclick = () => this.setMat(b.dataset.mat);
    for (let i = 0; i < 3; i++) $('ed-brush-' + i).onchange = () => { this.brush[i] = Math.max(1, Math.min(4096, Math.round(+$('ed-brush-' + i).value) || 16)); $('ed-brush-' + i).value = this.brush[i]; };
    $('ed-grid').onchange = () => { this.grid = +$('ed-grid').value; };
    $('ed-item').onchange = () => { this.itemKind = $('ed-item').value; if (this.sel?.kind === 'item') this.change(() => { this.level.items[this.sel.i][0] = this.itemKind; }); };
    $('ed-auto').onclick = () => this.showAuto();
    $('ed-clearpts').onclick = () => { this.change(() => { this.level.spawns = []; this.level.items = []; this.level.flags = null; }); this.sel = null; this.rebuild(); this.say('Spawns, items and flags will be placed automatically.'); };
    $('ed-new').onclick = () => { if (!confirm('Start a new level? Save this one first if you want to keep it.')) return; this.localId = null; this.level = starter(); this.undoStack = []; this.redoStack = []; this.sel = null; this.fill(); this.rebuild(); };
    $('ed-openbtn').onclick = () => this.openList();
    $('ed-save').onclick = () => this.save(true);
    $('ed-test').onclick = () => this.test();
    $('ed-publish').onclick = () => this.publish();
    $('ed-exit').onclick = () => this.close();
    for (const b of el.querySelectorAll('[data-mv]')) {
      b.onpointerdown = () => this.keys.add(b.dataset.mv);
      b.onpointerup = b.onpointerleave = b.onpointercancel = () => this.keys.delete(b.dataset.mv);
    }
    this.input();
    this.fill();
  }

  // the level's settings into the inputs
  fill() {
    $('ed-name').value = this.level.name;
    $('ed-theme').value = this.level.theme;
    $('ed-mood').value = this.level.mood;
    this.setTool(this.tool);
    this.setMat(this.mat);
  }

  say(text) {
    $('ed-status').textContent = text;
    clearTimeout(this.sayTimer);
    if (text) this.sayTimer = setTimeout(() => ($('ed-status').textContent = ''), 4500);
  }

  setTool(t) {
    this.tool = t;
    for (const b of $('ed-tools').children) b.classList.toggle('on', b.dataset.tool === t);
    $('ed-toolhint').textContent = TOOLS.find((x) => x[0] === t)[2];
    if (this.ghost) this.ghost.visible = false;
  }

  setMat(m) {
    this.mat = m;
    for (const b of $('ed-mats').children) b.classList.toggle('on', b.dataset.mat === m);
    $('ed-matname').textContent = m === 'clip' ? 'clip: an invisible wall' : m;
    // with the Select tool it paints the selected box (with the Box tool it's only for the next one)
    if (this.tool === 'select' && this.sel?.kind === 'box' && this.level.boxes[this.sel.i][6] !== m) { this.change(() => { this.level.boxes[this.sel.i][6] = m; }); this.syncBox(this.sel.i); }
  }

  // ---------------------------------------------------------------- open / close
  open() {
    const game = this.opts.game();
    this.active = true;
    this.el.hidden = false;
    if (!this.scene) this.setupScene();
    this.lighting();
    this.rebuild();
    this.last = performance.now();
    game.hud?.show(false);
  }

  close() {
    this.save(false);
    this.active = false;
    this.el.hidden = true;
    this.keys.clear();
    this.opts.close?.();
  }

  // ---------------------------------------------------------------- scene
  setupScene() {
    const s = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 4, 40000);
    this.camera.up.set(0, 0, 1);
    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x5a4a3a, 1.2);
    this.hemi.up = new THREE.Vector3(0, 0, 1);
    this.hemi.position.set(0, 0, 1);
    s.add(this.hemi);
    this.sunLight = new THREE.DirectionalLight(0xfff1dc, 2.4);
    this.sunLight.position.set(0.35, -0.45, 0.82);
    s.add(this.sunLight);
    const grid = new THREE.GridHelper(12000, 12000 / 128, 0x4a5058, 0x30343a);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = 0.5;
    grid.material.transparent = true;
    grid.material.opacity = 0.5;
    s.add(grid);
    // the ground the grid is on, for clicking where there's no box (not drawn)
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(24000, 24000), new THREE.MeshBasicMaterial({ visible: false }));
    s.add(this.ground);
    this.root = new THREE.Group();
    s.add(this.root);
    this.marks = new THREE.Group();
    s.add(this.marks);
    this.autoMarks = new THREE.Group();
    s.add(this.autoMarks);
    this.selLines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffb000, depthTest: false, transparent: true }));
    this.selLines.renderOrder = 10;
    s.add(this.selLines);
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffb000, transparent: true, opacity: 0.28, depthWrite: false }));
    this.ghost.visible = false;
    s.add(this.ghost);
    this.ray = new THREE.Raycaster();
  }

  lighting() {
    const night = this.level.mood === 'night' || this.level.mood === 'storm';
    this.scene.background = new THREE.Color({ day: 0x7fa6d8, fall: 0xd8b48a, night: 0x0c1220, storm: 0x0a0e16, backrooms: 0xcbb978 }[this.level.mood] || 0x7fa6d8);
    this.hemi.intensity = night ? 0.6 : 1.2;
    this.sunLight.intensity = night ? 0.7 : 2.4;
  }

  boxMesh(b) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]), levelMaterial(b[6], this.level.theme));
    m.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    return m;
  }

  // everything drawn again from the level
  rebuild() {
    if (!this.scene) return;
    for (const m of this.root.children) m.geometry.dispose();
    this.root.clear();
    this.level.boxes.forEach((b, i) => { const m = this.boxMesh(b); m.userData = { kind: 'box', i }; this.root.add(m); });
    this.drawMarks();
    this.autoMarks.clear();
    this.showSel();
    this.counts();
  }

  syncBox(i) {
    const old = this.root.children[i];
    if (!old) return this.rebuild();
    old.geometry.dispose();
    const m = this.boxMesh(this.level.boxes[i]);
    m.userData = { kind: 'box', i };
    this.root.children[i] = m; // in the same place, so indices stay the box numbers
    m.parent = this.root;
    old.parent = null;
    this.showSel();
  }

  marker(kind, p, color, yaw) {
    const g = new THREE.Group();
    if (kind === 'spawn') {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(16, 16, 72, 12).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 }));
      body.position.z = 36;
      const nose = new THREE.Mesh(new THREE.ConeGeometry(10, 26, 8).rotateZ(-Math.PI / 2), new THREE.MeshBasicMaterial({ color }));
      nose.position.set(26, 0, 56);
      g.add(body, nose);
      g.rotation.z = ((yaw || 0) * Math.PI) / 180;
    } else if (kind === 'item') {
      const m = new THREE.Mesh(new THREE.BoxGeometry(22, 22, 22), new THREE.MeshBasicMaterial({ color }));
      m.position.z = 14;
      m.rotation.z = Math.PI / 4;
      g.add(m);
    } else {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 110, 6).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xdddddd }));
      pole.position.z = 55;
      const cloth = new THREE.Mesh(new THREE.BoxGeometry(40, 2, 26), new THREE.MeshBasicMaterial({ color }));
      cloth.position.set(20, 0, 94);
      g.add(pole, cloth);
    }
    g.position.set(p[0], p[1], p[2]);
    return g;
  }

  drawMarks() {
    this.marks.traverse((o) => o.geometry?.dispose());
    this.marks.clear();
    const L = this.level;
    const tag = (g, kind, i) => { g.traverse((o) => (o.userData = { kind, i })); this.marks.add(g); };
    L.spawns.forEach((s, i) => tag(this.marker('spawn', s, 0x4cff7a, s[3]), 'spawn', i));
    L.items.forEach((it, i) => tag(this.marker('item', it.slice(1), ITEM_COLOR(it[0])), 'item', i));
    if (L.flags) L.flags.forEach((f, i) => tag(this.marker('flag', f, i ? 0x3a7aff : 0xff3a3a), 'flag', i));
    else if (this.flagHalf) this.marks.add(this.marker('flag', this.flagHalf, 0xff3a3a)); // waiting for the blue one (not selectable)
  }

  // where the automatic layout would put what isn't placed (grey)
  showAuto() {
    const r = checkLevel(this.level);
    if (r.error) return this.say(r.error);
    let m;
    try { m = levelMap(r.level); } catch { return this.say('No automatic layout for this level yet.'); }
    this.autoMarks.traverse((o) => o.geometry?.dispose());
    this.autoMarks.clear();
    const grey = 0x9a9a9a;
    if (!this.level.spawns.length) for (const s of m.spawns) this.autoMarks.add(this.marker('spawn', [s.origin[0], s.origin[1], s.origin[2] - 1], grey, s.yaw));
    if (!this.level.items.length) for (const it of m.items) this.autoMarks.add(this.marker('item', it.o, grey));
    if (!this.level.flags) for (const f of [m.flags.red, m.flags.blue]) this.autoMarks.add(this.marker('flag', f, grey));
    this.say(this.autoMarks.children.length ? 'Grey: where the game will put what you haven\'t placed.' : 'You placed everything yourself.');
  }

  counts() {
    const L = this.level, lim = LEVEL_LIMITS;
    $('ed-count').textContent = `${L.boxes.length}/${lim.boxes} boxes`;
    const part = (n, what, max) => (n ? `${n}/${max} ${what}` : `${what}: automatic`);
    $('ed-layout').textContent = [part(L.spawns.length, 'spawns', lim.spawns), part(L.items.length, 'items', lim.items), L.flags ? 'flags placed' : 'flags: automatic'].join(' · ');
  }

  // ---------------------------------------------------------------- selection panel
  showSel() {
    const S = this.sel, L = this.level, P = this.selPanel;
    const lines = this.selLines;
    lines.geometry.dispose();
    lines.geometry = new THREE.BufferGeometry();
    if (!S) {
      P.innerHTML = `<h3>Selection</h3><p class="ed-hint">Nothing selected. Pick the Select tool (1) and click a box or marker.</p><h3>Keys</h3><p class="ed-hint">Arrows and Page Up / Down move the selection (by the grid). Shift + arrows resize a box. Delete removes it, Ctrl+D copies it, Ctrl+Z undoes, Ctrl+S saves.</p>`;
      return;
    }
    if (S.kind === 'box') {
      const b = L.boxes[S.i];
      lines.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(b[3] - b[0] + 2, b[4] - b[1] + 2, b[5] - b[2] + 2));
      lines.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
      P.innerHTML = `<h3>Box ${S.i + 1}</h3>${this.xyzHtml('From', 'ed-bmin')}${this.xyzHtml('Size', 'ed-bsize')}<p class="ed-hint">Material: ${esc(b[6])} (with the Select tool, click a material to change it)</p>
        <div class="ed-row"><button type="button" class="btn" id="ed-dup">Copy</button><button type="button" class="btn" id="ed-del">Delete</button></div>`;
      ['x', 'y', 'z'].forEach((a, k) => {
        $(`ed-bmin-${a}`).value = b[k];
        $(`ed-bsize-${a}`).value = b[k + 3] - b[k];
        $(`ed-bmin-${a}`).onchange = () => this.change(() => { const v = Math.round(+$(`ed-bmin-${a}`).value) || 0, size = b[k + 3] - b[k]; b[k] = v; b[k + 3] = v + size; }, () => this.syncBox(S.i));
        $(`ed-bsize-${a}`).onchange = () => this.change(() => { b[k + 3] = b[k] + Math.max(1, Math.round(+$(`ed-bsize-${a}`).value) || 1); }, () => this.syncBox(S.i));
      });
      $('ed-dup').onclick = () => this.duplicate();
    } else {
      const p = S.kind === 'spawn' ? L.spawns[S.i] : S.kind === 'item' ? L.items[S.i].slice(1) : L.flags[S.i];
      lines.geometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(48, 48, S.kind === 'item' ? 32 : 110));
      lines.position.set(p[0], p[1], p[2] + (S.kind === 'item' ? 14 : 55));
      const title = S.kind === 'spawn' ? `Spawn ${S.i + 1}` : S.kind === 'item' ? ITEM_NAME(L.items[S.i][0]) : S.i ? 'Blue flag' : 'Red flag';
      P.innerHTML = `<h3>${esc(title)}</h3>${this.xyzHtml('At', 'ed-pt')}${S.kind === 'spawn' ? `<div class="ed-xyz"><span>Facing</span><input type="number" id="ed-yaw" step="15" min="-180" max="180"></div>` : ''}
        <p class="ed-hint">${S.kind === 'flag' ? 'Flags can only be removed together.' : ''}</p><div class="ed-row"><button type="button" class="btn" id="ed-del">Delete</button></div>`;
      ['x', 'y', 'z'].forEach((a, k) => {
        $(`ed-pt-${a}`).value = p[k];
        $(`ed-pt-${a}`).onchange = () => this.change(() => { p[k] = Math.round(+$(`ed-pt-${a}`).value) || 0; }, () => this.rebuild());
      });
      if (S.kind === 'spawn') {
        $('ed-yaw').value = p[3];
        $('ed-yaw').onchange = () => this.change(() => { p[3] = ((Math.round(+$('ed-yaw').value) + 540) % 360) - 180; }, () => this.rebuild());
      }
    }
    $('ed-del').onclick = () => this.remove();
  }

  // ---------------------------------------------------------------- editing
  // every change goes through here so it can be undone; after: what to redraw
  change(fn, after) {
    this.mark();
    fn();
    this.redoStack = [];
    after?.();
    this.counts();
  }
  // remember the level as it is now, for undo
  mark() {
    this.undoStack.push(JSON.stringify(this.level));
    if (this.undoStack.length > 80) this.undoStack.shift();
    this.dirty = true;
  }
  undo(redo = false) {
    const from = redo ? this.redoStack : this.undoStack, to = redo ? this.undoStack : this.redoStack;
    if (!from.length) return;
    to.push(JSON.stringify(this.level));
    this.level = JSON.parse(from.pop());
    this.sel = null;
    this.fill();
    this.lighting();
    this.rebuild();
  }

  remove() {
    const S = this.sel;
    if (!S) return;
    this.change(() => {
      if (S.kind === 'box') this.level.boxes.splice(S.i, 1);
      else if (S.kind === 'spawn') this.level.spawns.splice(S.i, 1);
      else if (S.kind === 'item') this.level.items.splice(S.i, 1);
      else this.level.flags = null;
    });
    this.sel = null;
    this.rebuild();
  }

  duplicate() {
    const S = this.sel;
    if (S?.kind !== 'box') return;
    if (this.level.boxes.length >= LEVEL_LIMITS.boxes) return this.say(`A level can have at most ${LEVEL_LIMITS.boxes} boxes.`);
    const b = this.level.boxes[S.i].slice(), w = b[3] - b[0];
    // the copy goes beside it, on the side away from the camera's left
    const right = new THREE.Vector3(Math.sin((this.cam.yaw * Math.PI) / 180), -Math.cos((this.cam.yaw * Math.PI) / 180), 0);
    const ax = Math.abs(right.x) > Math.abs(right.y) ? 0 : 1, dir = Math.sign(ax ? right.y : right.x) || 1, step = (ax ? b[4] - b[1] : w) * dir;
    b[ax] += step; b[ax + 3] += step;
    this.change(() => this.level.boxes.push(b));
    this.sel = { kind: 'box', i: this.level.boxes.length - 1 };
    this.rebuild();
  }

  // move the selection by d (world units), or with grow resize a box's far side
  nudge(d, grow) {
    const S = this.sel;
    if (!S) return;
    this.change(() => {
      if (S.kind === 'box') {
        const b = this.level.boxes[S.i];
        for (let k = 0; k < 3; k++) {
          if (!d[k]) continue;
          if (grow) b[k + 3] = Math.max(b[k] + 1, b[k + 3] + d[k]);
          else { b[k] += d[k]; b[k + 3] += d[k]; }
        }
      } else {
        const p = S.kind === 'spawn' ? this.level.spawns[S.i] : S.kind === 'item' ? null : this.level.flags[S.i];
        if (p) for (let k = 0; k < 3; k++) p[k] += d[k];
        else { const it = this.level.items[S.i]; for (let k = 0; k < 3; k++) it[k + 1] += d[k]; }
      }
    }, () => (S.kind === 'box' ? this.syncBox(S.i) : this.rebuild()));
  }

  // ---------------------------------------------------------------- clicking in the world
  pick(x, y) {
    const r = this.el.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1), this.camera);
    const hits = this.ray.intersectObjects([...this.marks.children, ...this.root.children, this.ground], true);
    const h = hits[0];
    if (!h) return null;
    const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 0, 1);
    return { point: h.point, normal: h.object === this.ground ? new THREE.Vector3(0, 0, 1) : n, data: h.object.userData };
  }

  snap(v) { return Math.round(v / this.grid) * this.grid; }

  // where a new box goes against a surface: on top of a floor, against a wall
  placeBox(hit) {
    const p = hit.point, n = hit.normal, s = this.brush;
    const mins = [0, 0, 0], maxs = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const nk = [n.x, n.y, n.z][k], pk = [p.x, p.y, p.z][k];
      if (nk > 0.5) { mins[k] = Math.round(pk); maxs[k] = mins[k] + s[k]; } else if (nk < -0.5) { maxs[k] = Math.round(pk); mins[k] = maxs[k] - s[k]; } else { mins[k] = this.snap(pk - s[k] / 2); maxs[k] = mins[k] + s[k]; }
    }
    return [...mins, ...maxs, this.mat];
  }

  click(x, y) {
    const hit = this.pick(x, y);
    if (!hit) return;
    const L = this.level, lim = LEVEL_LIMITS;
    const floor = hit.normal.z > 0.5;
    const at = [this.snap(hit.point.x), this.snap(hit.point.y), Math.round(hit.point.z)];
    if (this.tool === 'select') {
      this.sel = hit.data.kind ? { kind: hit.data.kind, i: hit.data.i } : null;
      if (this.sel?.kind === 'box') this.setMat(L.boxes[this.sel.i][6]);
      if (this.sel?.kind === 'item') { this.itemKind = L.items[this.sel.i][0]; $('ed-item').value = this.itemKind; }
      this.showSel();
      return;
    }
    if (this.tool === 'box') {
      if (L.boxes.length >= lim.boxes) return this.say(`A level can have at most ${lim.boxes} boxes.`);
      this.change(() => L.boxes.push(this.placeBox(hit)));
      this.sel = { kind: 'box', i: L.boxes.length - 1 };
      this.rebuild();
      return;
    }
    if (!floor) return this.say('Put that on a floor (the top of a box).');
    if (this.tool === 'spawn') {
      if (L.spawns.length >= lim.spawns) return this.say(`A level can have at most ${lim.spawns} spawn points.`);
      const yaw = Math.round((Math.atan2(-at[1], -at[0]) * 180) / Math.PI / 15) * 15; // facing the middle
      this.change(() => L.spawns.push([...at, yaw]));
      this.sel = { kind: 'spawn', i: L.spawns.length - 1 };
    } else if (this.tool === 'item') {
      if (L.items.length >= lim.items) return this.say(`A level can have at most ${lim.items} items.`);
      this.change(() => L.items.push([this.itemKind, ...at]));
      this.sel = { kind: 'item', i: L.items.length - 1 };
    } else if (this.tool === 'flag') {
      // the red flag first, then the blue one (placing again starts over)
      if (!this.flagHalf || L.flags) {
        if (L.flags) this.change(() => { L.flags = null; });
        this.flagHalf = at;
        this.say('Red flag placed. Now click where the blue flag goes.');
      } else {
        const red = this.flagHalf;
        this.flagHalf = null;
        this.change(() => { L.flags = [red, at]; });
        this.sel = { kind: 'flag', i: 1 };
        this.say('Both flags placed.');
      }
    }
    this.rebuild();
  }

  hover(x, y) {
    if (this.tool !== 'box' || !this.ghost) { if (this.ghost) this.ghost.visible = false; return; }
    const hit = this.pick(x, y);
    if (!hit) { this.ghost.visible = false; return; }
    const b = this.placeBox(hit);
    this.ghost.visible = true;
    this.ghost.scale.set(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    this.ghost.position.set((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
  }

  // ---------------------------------------------------------------- input
  input() {
    const view = $('ed-view');
    let down = null; // { x, y, button, moved, drag }
    view.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      view.setPointerCapture(e.pointerId);
      down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, button: e.button, moved: false, drag: null };
      // a selected box under the pointer with the Select tool: slide it along the floor
      if (e.button === 0 && this.tool === 'select' && this.sel?.kind === 'box') {
        const hit = this.pick(e.clientX, e.clientY);
        if (hit?.data.kind === 'box' && hit.data.i === this.sel.i) {
          const b = this.level.boxes[this.sel.i];
          down.drag = { plane: new THREE.Plane(new THREE.Vector3(0, 0, 1), -hit.point.z), from: hit.point.clone(), start: b.slice(), marked: false };
        }
      }
    });
    view.addEventListener('pointermove', (e) => {
      if (!this.active) return;
      if (!down) return this.hover(e.clientX, e.clientY);
      const dx = e.clientX - down.lx, dy = e.clientY - down.ly;
      down.lx = e.clientX; down.ly = e.clientY;
      if (Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > 5) down.moved = true;
      if (!down.moved) return;
      if (down.drag) {
        const r = this.el.getBoundingClientRect();
        this.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), this.camera);
        const p = this.ray.ray.intersectPlane(down.drag.plane, new THREE.Vector3());
        if (!p) return;
        const D = down.drag, b = this.level.boxes[this.sel.i];
        if (!D.marked) { this.mark(); D.marked = true; this.redoStack = []; }
        const ox = this.snap(p.x - D.from.x), oy = this.snap(p.y - D.from.y);
        b[0] = D.start[0] + ox; b[3] = D.start[3] + ox; b[1] = D.start[1] + oy; b[4] = D.start[4] + oy;
        this.syncBox(this.sel.i);
        return;
      }
      // look around
      this.cam.yaw -= dx * 0.25;
      this.cam.pitch = Math.max(-89, Math.min(89, this.cam.pitch - dy * 0.25));
    });
    const up = (e) => {
      if (!down) return;
      const d = down;
      down = null;
      if (!d.moved && d.button === 0) this.click(e.clientX, e.clientY);
      if (d.drag?.marked) this.showSel();
    };
    view.addEventListener('pointerup', up);
    view.addEventListener('pointercancel', () => { down = null; });
    view.addEventListener('wheel', (e) => {
      if (!this.active) return;
      e.preventDefault();
      this.cam.pos.addScaledVector(this.forward(), -Math.sign(e.deltaY) * Math.max(32, this.cam.pos.z * 0.15));
    }, { passive: false });
    // keys: only while the editor is open and you're not typing in one of its boxes
    document.addEventListener('keydown', (e) => {
      if (!this.active || e.target.closest?.('input, select, textarea')) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.code === 'KeyZ') { e.preventDefault(); return this.undo(e.shiftKey); }
      if (ctrl && e.code === 'KeyY') { e.preventDefault(); return this.undo(true); }
      if (ctrl && e.code === 'KeyS') { e.preventDefault(); return this.save(true); }
      if (ctrl && e.code === 'KeyD') { e.preventDefault(); return this.duplicate(); }
      if (e.code === 'Delete' || e.code === 'Backspace') { e.preventDefault(); return this.remove(); }
      if (e.code === 'Escape') { if (!$('ed-open').hidden) { $('ed-open').hidden = true; return; } this.sel = null; this.showSel(); return; }
      const tool = /^Digit([1-5])$/.exec(e.code);
      if (tool) return this.setTool(TOOLS[+tool[1] - 1][0]);
      if ((e.code === 'KeyQ' || e.code === 'KeyE') && this.sel?.kind === 'spawn') {
        const s = this.level.spawns[this.sel.i];
        return this.change(() => { s[3] = ((s[3] + (e.code === 'KeyQ' ? 15 : -15) + 540) % 360) - 180; }, () => this.rebuild());
      }
      // arrows move along the world axis closest to the camera's view
      const arrow = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowRight: [1, 0], ArrowLeft: [-1, 0] }[e.code];
      if (arrow && this.sel) {
        e.preventDefault();
        const y = (Math.round(this.cam.yaw / 90) * 90 * Math.PI) / 180;
        const fx = Math.round(Math.cos(y)), fy = Math.round(Math.sin(y));
        const g = this.grid, d = [(fx * arrow[1] + fy * arrow[0]) * g, (fy * arrow[1] - fx * arrow[0]) * g, 0];
        return this.nudge(d, e.shiftKey && this.sel.kind === 'box');
      }
      if ((e.code === 'PageUp' || e.code === 'PageDown') && this.sel) { e.preventDefault(); return this.nudge([0, 0, (e.code === 'PageUp' ? 1 : -1) * this.grid], e.shiftKey && this.sel.kind === 'box'); }
      if (e.code === 'Space') e.preventDefault();
      this.keys.add(e.code);
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  forward() {
    const y = (this.cam.yaw * Math.PI) / 180, p = (this.cam.pitch * Math.PI) / 180;
    return new THREE.Vector3(Math.cos(p) * Math.cos(y), Math.cos(p) * Math.sin(y), Math.sin(p));
  }

  // ---------------------------------------------------------------- every frame (instead of the game)
  frame(dt) {
    const game = this.opts.game();
    const r = game.renderer;
    const k = this.keys, f = this.forward();
    const speed = (k.has('ShiftLeft') || k.has('ShiftRight') ? 2400 : 800) * dt;
    const right = new THREE.Vector3(f.y, -f.x, 0).normalize();
    if (k.has('KeyW')) this.cam.pos.addScaledVector(f, speed);
    if (k.has('KeyS')) this.cam.pos.addScaledVector(f, -speed);
    if (k.has('KeyD')) this.cam.pos.addScaledVector(right, speed);
    if (k.has('KeyA')) this.cam.pos.addScaledVector(right, -speed);
    if (k.has('Space')) this.cam.pos.z += speed;
    if (k.has('KeyC') || k.has('ControlLeft')) this.cam.pos.z -= speed;
    this.camera.position.copy(this.cam.pos);
    this.camera.lookAt(this.cam.pos.clone().add(f));
    const w = r.domElement.clientWidth || innerWidth, h = r.domElement.clientHeight || innerHeight;
    if (this.camera.aspect !== w / h) { this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); }
    r.autoClear = true;
    r.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------- saving, testing, publishing
  // the level checked for the server: { level } or { error } (said on screen)
  checked() {
    const r = checkLevel(this.level);
    if (r.error) this.say(r.error);
    return r;
  }

  save(loud) {
    const all = load();
    if (!this.localId) this.localId = 'l' + Date.now().toString(36);
    this.level.saved = Date.now();
    all[this.localId] = this.level;
    // keep the 30 most recent
    const ids = Object.keys(all).sort((a, b) => (all[b].saved || 0) - (all[a].saved || 0));
    for (const id of ids.slice(30)) delete all[id];
    const ok = store(all);
    try { localStorage.setItem(CURRENT, JSON.stringify({ id: this.localId })); } catch {}
    this.dirty = false;
    if (loud) this.say(ok ? `Saved "${this.level.name}" in this browser.` : 'Couldn\'t save: this browser\'s storage is full.');
  }

  // your saved levels, and workshop levels you downloaded (to edit a copy)
  openList() {
    const all = load(), box = $('ed-open');
    const lib = this.opts.library?.() || [];
    const mine = Object.entries(all).sort((a, b) => (b[1].saved || 0) - (a[1].saved || 0));
    box.innerHTML = `<h3>Your levels</h3><ul>${mine.map(([id, L]) => `<li><span>${esc(L.name)} <small class="ed-count">${L.boxes.length} boxes</small></span><button type="button" class="btn" data-open="${esc(id)}">Open</button><button type="button" class="btn" data-del="${esc(id)}">Delete</button></li>`).join('') || '<li><span class="ed-count">None saved yet.</span></li>'}</ul>
      ${lib.length ? `<h3>From the workshop (edit a copy)</h3><ul>${lib.map((e) => `<li><span>${esc(e.name)} <small class="ed-count">by ${esc(e.by)}</small></span><button type="button" class="btn" data-copy="${esc(e.id)}">Copy</button></li>`).join('')}</ul>` : ''}
      <div class="ed-row" style="justify-content:flex-end"><button type="button" class="btn" id="ed-open-close">Close</button></div>`;
    box.hidden = false;
    $('ed-open-close').onclick = () => (box.hidden = true);
    for (const b of box.querySelectorAll('[data-open]')) b.onclick = () => { this.save(false); this.localId = b.dataset.open; this.use(load()[this.localId]); box.hidden = true; };
    for (const b of box.querySelectorAll('[data-del]')) b.onclick = () => { if (!confirm('Delete this level from this browser?')) return; const a = load(); delete a[b.dataset.del]; store(a); if (this.localId === b.dataset.del) this.localId = null; this.openList(); };
    for (const b of box.querySelectorAll('[data-copy]')) b.onclick = async () => {
      const L = await this.opts.fetchLevel?.(b.dataset.copy);
      if (!L) return this.say('Couldn\'t download that level.');
      this.save(false);
      this.localId = null;
      this.use({ ...L, name: (L.name + ' copy').slice(0, LEVEL_LIMITS.name) });
      box.hidden = true;
    };
  }

  use(L) {
    this.level = JSON.parse(JSON.stringify(L));
    this.level.spawns ||= []; this.level.items ||= []; this.level.flags ||= null;
    this.undoStack = []; this.redoStack = []; this.sel = null; this.flagHalf = null;
    this.fill();
    this.lighting();
    this.rebuild();
    // look at it from a corner
    const b = this.level.boxes[0];
    if (b) { this.cam.pos.set(b[0] - 300, b[1] - 300, b[5] + 600); this.cam.yaw = 45; this.cam.pitch = -30; }
  }

  test() {
    const r = this.checked();
    if (r.error) return;
    this.save(false);
    const mode = $('ed-testmode').value;
    this.active = false;
    this.el.hidden = true;
    this.keys.clear();
    this.opts.test(r.level, mode);
  }

  async publish() {
    const r = this.checked();
    if (r.error) return;
    if (!confirm(`Publish "${r.level.name}" to the workshop? Everyone will be able to play it. (Published levels can't be changed: publish again for a new version.)`)) return;
    this.save(false);
    $('ed-publish').disabled = true;
    const res = await this.opts.publish(r.level).catch(() => ({ error: 'Can\'t reach the server.' }));
    $('ed-publish').disabled = false;
    this.say(res.error || `Published "${res.item.name}". Find it in the Workshop.`);
  }
}
