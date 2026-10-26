// The heist menus: the Heist dialog (find a crew, host a private one, join with a code) and the planning
// screen (a blueprint of the bank, the crew and their roles, approach and difficulty, ready and start, and
// the last job's results). The server decides everything; this shows it and sends what you pick.
import { CODE_MAPS } from './mapdefs.js';
import { esc } from './hud.js';
import { pageUrl } from './net.js';

const $ = (id) => document.getElementById(id);
const ROLES = {
  hacker: ['Hacker', 'Hacks the vault and cameras much faster'],
  enforcer: ['Enforcer', 'Shotgun, rifle, armour; bags don\'t slow you'],
  infiltrator: ['Infiltrator', 'Hard to spot, silenced pistol, quick ties and takedowns'],
  lookout: ['Lookout', 'Sees guards and cameras through walls; sniper'],
};
const DIFFS = [['easy', 'Easy', '×1 pay · slow guards, police wait 55s'], ['normal', 'Normal', '×1.6 pay · more guards and cameras'], ['hard', 'Hard', '×2.5 pay · sharp guards, SWAT, no respawns']];
const APPROACHES = [['stealth', 'Stealth', 'Walk in unmasked. Nobody has to know (×1.5 pay if the alarm never goes).'], ['loud', 'Loud', 'Masks on, alarm in 25 seconds, fight the police while the drill runs.']];

// opts: { game() -> Game, play(action, errEl, code), pause(), resume(), leave(), status(text), name() }
export class HeistMenu {
  constructor(opts) {
    this.o = opts;
    this.plan = null;
    $('btn-heist').onclick = () => { this.o.game()?.sound.start(); $('hz-err').textContent = ''; $('dlg-heist').hidden = false; };
    $('hz-close').onclick = () => { $('dlg-heist').hidden = true; };
    this.job = 'bank';
    for (const b of document.querySelectorAll('#hz-jobs button')) b.onclick = () => { this.job = b.dataset.job; for (const o of document.querySelectorAll('#hz-jobs button')) o.classList.toggle('on', o === b); };
    $('hz-find').onclick = () => this.o.play({ t: 'join', room: 'HEIST', job: this.job }, $('hz-err'));
    $('hz-host').onclick = () => this.o.play({ t: 'create', settings: { mode: 'heist', map: this.job, private: true, name: `${this.o.name()}'s crew` } }, $('hz-err'));
    $('hz-code-form').onsubmit = (e) => {
      e.preventDefault();
      const code = $('hz-code').value.trim().toUpperCase();
      if (code) this.o.play({ t: 'join', room: code }, $('hz-err'), code);
    };
    $('hz-code').addEventListener('keydown', (e) => e.stopPropagation());
    $('pl-leave').onclick = () => { $('dlg-plan').hidden = true; this.o.leave(); };
    $('pl-invite').onclick = async () => {
      const link = `${pageUrl()}#${this.plan?.code}`;
      try { await navigator.clipboard.writeText(link); this.msg(`Invite link copied: ${link}`, true); } catch { this.msg(`Invite link: ${link}`, true); }
    };
    $('pl-ready').onclick = () => this.send({ k: 'ready', ready: !this.mine()?.ready });
    $('pl-start').onclick = () => this.send({ k: 'start' });
    $('pl-go').onclick = () => { $('dlg-plan').hidden = true; this.o.resume(); };
  }

  send(m) {
    this.o.game()?.send({ t: 'heist', ...m });
  }

  mine() {
    const g = this.o.game();
    return this.plan?.crew.find((c) => c.id === g?.myId);
  }

  msg(text, ok) {
    $('pl-msg').textContent = text;
    $('pl-msg').style.color = ok ? 'var(--text-dim)' : '';
    clearTimeout(this.msgT);
    this.msgT = setTimeout(() => ($('pl-msg').textContent = ''), 5000);
  }

  // the server sent the crew's state; was: the phase before
  update(plan, was) {
    this.plan = plan;
    $('dlg-heist').hidden = true;
    const g = this.o.game();
    if (plan.phase === 'planning') {
      if (was !== 'planning' || $('dlg-plan').hidden) this.showPlan();
    } else if (plan.phase === 'heist' && was === 'planning' && !$('dlg-plan').hidden) {
      // the host started it: one click to go (the browser needs it to capture the mouse)
      $('pl-go').hidden = false;
      for (const id of ['pl-ready', 'pl-start']) $(id).hidden = true;
    }
    this.render();
    if (!g?.connected) $('dlg-plan').hidden = true;
  }

  showPlan() {
    this.o.pause();
    $('dlg-plan').hidden = false;
    $('pl-go').hidden = true;
    this.render();
  }

  render() {
    const p = this.plan, g = this.o.game();
    if (!p || !g) return;
    const host = p.host === g.myId, me = this.mine();
    $('pl-code').textContent = `${p.private ? 'private crew' : 'public crew'} · code ${p.code}`;
    $('dlg-plan-title').firstChild.textContent = `Planning: ${p.title || 'The Bank Job'} `;
    const rows = p.crew.map((c) => `<li><b>${esc(c.name)}</b>${c.id === p.host ? ' <small>(host)</small>' : ''} <span class="role">${esc(ROLES[c.role]?.[0] || '')}</span><span class="rd${c.ready || c.id === p.host ? ' on' : ''}">${c.id === p.host ? 'HOST' : c.ready ? 'READY' : 'not ready'}</span></li>`);
    for (let i = p.crew.length; i < 4; i++) rows.push(`<li class="empty">${i < 2 ? 'Waiting for a robber…' : 'Open slot'}</li>`);
    $('pl-crew').innerHTML = rows.join('');
    const taken = new Set(p.crew.filter((c) => c.id !== g.myId).map((c) => c.role));
    $('pl-roles').innerHTML = Object.entries(ROLES).map(([k, [name, about]]) => `<button type="button" data-r="${k}" class="${me?.role === k ? 'on' : ''}"${taken.has(k) || p.phase !== 'planning' ? ' disabled' : ''}><b>${name}</b><small>${esc(about)}</small></button>`).join('');
    for (const b of $('pl-roles').children) b.onclick = () => this.send({ k: 'role', role: b.dataset.r });
    const seg = (el, list, cur, key) => {
      $(el).innerHTML = list.map(([k, name]) => `<button type="button" data-v="${k}" class="${cur === k ? 'on' : ''}"${host && p.phase === 'planning' ? '' : ' disabled'}>${name}</button>`).join('');
      for (const b of $(el).children) b.onclick = () => this.send({ k: 'set', [key]: b.dataset.v });
    };
    seg('pl-approach', APPROACHES, p.approach, 'approach');
    seg('pl-diff', DIFFS, p.difficulty, 'difficulty');
    $('pl-host-note').textContent = host ? '(you choose)' : '(the host chooses)';
    const note = (APPROACHES.find((a) => a[0] === p.approach)?.[2] || '') + ' ' + (DIFFS.find((d) => d[0] === p.difficulty)?.[2] || '');
    $('pl-approach').title = note;
    if (!$('pl-note')) $('pl-diff').insertAdjacentHTML('afterend', '<div class="seg-note" id="pl-note"></div>');
    $('pl-note').textContent = note;
    const r = p.result;
    $('pl-result').className = r ? (r.success ? 'win' : 'lose') : '';
    $('pl-result').innerHTML = r ? `<b>Last job: ${r.success ? 'success' : 'failed'}</b> (${esc(r.difficulty)}) · ${esc(r.why)}<br>`
      + `${r.bags} bag${r.bags === 1 ? '' : 's'}, ${r.boxes} box${r.boxes === 1 ? '' : 'es'} · <b>$${(r.reward || 0).toLocaleString()} each</b> in Free Roam cash (${r.coins} coins)${r.stealth ? ' · stealth bonus' : ''}<br>`
      + `${r.kills} down · ${r.civs} civilian${r.civs === 1 ? '' : 's'} hurt · ${Math.floor(r.time / 60)}:${String(r.time % 60).padStart(2, '0')}` : '';
    if (p.phase === 'planning') {
      $('pl-go').hidden = true;
      $('pl-ready').hidden = host;
      $('pl-start').hidden = !host;
      $('pl-ready').textContent = me?.ready ? 'Not ready' : 'Ready';
      const others = p.crew.filter((c) => c.id !== p.host);
      $('pl-start').disabled = p.crew.length < 2 || others.some((c) => !c.ready);
      $('pl-start').title = p.crew.length < 2 ? 'You need at least 2 robbers' : others.some((c) => !c.ready) ? 'Waiting for everyone to be ready' : '';
    }
    this.board();
  }

  // the blueprint: walls from the map, then guards and their routes, cameras and what you'll need
  board() {
    const def = CODE_MAPS[this.plan?.map] || CODE_MAPS.bank, H = def.heist, c = $('pl-board'), x = c.getContext('2d');
    const d = ['easy', 'normal', 'hard'].indexOf(this.plan?.difficulty || 'normal');
    const lo = H.board?.lo || [-1250, -1000], hi = H.board?.hi || [900, 560];
    const sc = Math.min(c.width / (hi[0] - lo[0]), c.height / (hi[1] - lo[1]));
    const X = (v) => (v - lo[0]) * sc, Y = (v) => c.height - (v - lo[1]) * sc;
    x.fillStyle = '#0e2a4a';
    x.fillRect(0, 0, c.width, c.height);
    // a faint grid
    x.strokeStyle = 'rgba(120,170,230,.12)';
    x.lineWidth = 1;
    for (let gx = Math.ceil(lo[0] / 100) * 100; gx <= hi[0]; gx += 100) { x.beginPath(); x.moveTo(X(gx), 0); x.lineTo(X(gx), c.height); x.stroke(); }
    for (let gy = Math.ceil(lo[1] / 100) * 100; gy <= hi[1]; gy += 100) { x.beginPath(); x.moveTo(0, Y(gy)); x.lineTo(c.width, Y(gy)); x.stroke(); }
    // walls and furniture (tall things solid, low things outlined)
    for (const b of def.boxes) {
      if (b.mat === 'clip' || b.maxs[2] <= 1 || b.mins[2] > 160) continue;
      const w = (b.maxs[0] - b.mins[0]) * sc, h = (b.maxs[1] - b.mins[1]) * sc;
      if (w > c.width * 0.9) continue;
      if (b.maxs[2] - b.mins[2] > 100) { x.fillStyle = 'rgba(200,225,255,.85)'; x.fillRect(X(b.mins[0]), Y(b.maxs[1]), w, h); } else { x.strokeStyle = 'rgba(200,225,255,.6)'; x.strokeRect(X(b.mins[0]), Y(b.maxs[1]), w, h); }
    }
    for (const dd of def.doors) { x.fillStyle = dd.name === 'vault' ? '#e0e0e0' : '#ffb000'; x.fillRect(X(dd.mins[0]), Y(dd.maxs[1]) - 1, (dd.maxs[0] - dd.mins[0]) * sc, Math.max(3, (dd.maxs[1] - dd.mins[1]) * sc)); }
    const label = (t, px, py, col) => { x.fillStyle = col; x.font = '600 11px system-ui, sans-serif'; x.fillText(t, X(px) + 6, Y(py) - 6); };
    const dot = (px, py, col, r = 4) => { x.fillStyle = col; x.beginPath(); x.arc(X(px), Y(py), r, 0, Math.PI * 2); x.fill(); };
    // rooms
    x.fillStyle = 'rgba(200,225,255,.45)';
    x.font = 'italic 11px system-ui, sans-serif';
    for (const [t, px, py] of H.board?.rooms || [['LOBBY', -80, -380], ['TELLERS', -80, -90], ['CORRIDOR', -80, 70], ['SECURITY', -560, 470], ['MANAGER', -200, 470], ['VAULT', 300, 470], ['STREET', -300, -820], ['ALLEY', 700, 300]]) x.fillText(t, X(px), Y(py));
    // cameras: little cones
    for (const cam of H.cameras) {
      if ((cam.min || 0) > d) continue;
      const a = (-cam.yaw * Math.PI) / 180, s = (cam.sweep + 20) * (Math.PI / 180);
      x.fillStyle = 'rgba(255,210,58,.12)';
      x.beginPath(); x.moveTo(X(cam.o[0]), Y(cam.o[1])); x.arc(X(cam.o[0]), Y(cam.o[1]), 380 * sc, a - s, a + s); x.closePath(); x.fill();
      dot(cam.o[0], cam.o[1], '#ffd23a', 3.5);
    }
    // guards: their posts and patrol routes
    for (const gd of H.guards) {
      if ((gd.min || 0) > d) continue;
      if (gd.route) {
        x.strokeStyle = gd.captain ? 'rgba(106,200,255,.7)' : 'rgba(255,106,90,.6)';
        x.setLineDash([5, 4]);
        x.beginPath();
        gd.route.forEach(([px, py], i) => (i ? x.lineTo(X(px), Y(py)) : x.moveTo(X(px), Y(py))));
        x.stroke();
        x.setLineDash([]);
        dot(gd.route[0][0], gd.route[0][1], gd.captain ? '#6ac8ff' : '#ff6a5a', 5);
        if (gd.captain) label('captain (keycard)', gd.route[0][0], gd.route[0][1], '#6ac8ff');
      } else {
        dot(gd.o[0], gd.o[1], '#ff6a5a', 5);
        const a = (-gd.yaw * Math.PI) / 180;
        x.strokeStyle = '#ff6a5a';
        x.beginPath(); x.moveTo(X(gd.o[0]), Y(gd.o[1])); x.lineTo(X(gd.o[0]) + Math.cos(a) * 14, Y(gd.o[1]) + Math.sin(a) * 14); x.stroke();
      }
    }
    for (const s of H.staff) if ((s.min || 0) <= d) dot(s.o[0], s.o[1], 'rgba(255,255,255,.7)', 3);
    // what you're after
    x.fillStyle = '#6ac8ff'; x.fillRect(X(H.keycard[0]) - 4, Y(H.keycard[1]) - 4, 8, 8); label('keycard', H.keycard[0], H.keycard[1], '#6ac8ff');
    label(H.escape === 'boat' ? 'vault' : H.loot === 'painting' ? 'strongroom' : 'vault', H.panel[0], H.panel[1] + 60, '#e0e0e0');
    label('monitors', H.terminal[0], H.terminal[1], '#ffd23a');
    label('alarm wiring', H.wiring[0], H.wiring[1] - 30, '#ffb000');
    for (const a of H.alarms) { x.fillStyle = '#ff4040'; x.beginPath(); x.moveTo(X(a[0]), Y(a[1]) - 6); x.lineTo(X(a[0]) + 5, Y(a[1]) + 4); x.lineTo(X(a[0]) - 5, Y(a[1]) + 4); x.fill(); }
    for (const ph of H.phones) dot(ph[0], ph[1], 'rgba(255,90,200,.8)', 2.5);
    x.strokeStyle = '#5aff8a'; x.lineWidth = 2;
    x.beginPath(); x.arc(X(H.van.o[0]), Y(H.van.o[1]), H.van.r * sc, 0, Math.PI * 2); x.stroke();
    label(H.escape === 'boat' ? 'getaway boat' : 'getaway van', H.van.o[0], H.van.o[1] - 60, '#5aff8a');
    x.lineWidth = 1;
  }
}
