// HUD overlay (DOM). Numbers and weapon glyphs use the HL2 fonts from the player's own install when present.
import { WEAPONS, PERKS } from './weapons.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = $('hud');
    this.hp = $('hp-val');
    this.ar = $('ar-val');
    this.arBox = $('ar-box');
    this.clip = $('ammo-clip');
    this.res = $('ammo-res');
    this.ammoName = $('ammo-name');
    this.hpBar = $('hp-bar');
    this.arBar = $('ar-bar');
    this.ammoBox = $('ammo-box');
    this.feed = $('killfeed');
    this.chat = $('chatlog');
    this.sel = $('wsel');
    this.center = $('center-msg');
    this.dmg = $('dmg');
    this.timer = $('timer');
    this.board = $('scoreboard');
    this.selTimer = 0;
    this.last = {};
  }

  show(on) {
    this.el.hidden = !on;
  }

  pulse(el) {
    el.classList.remove('pulse');
    void el.offsetWidth;
    el.classList.add('pulse');
  }

  update(ps) {
    const hp = Math.max(0, ps.hp | 0);
    if (hp !== this.last.hp) {
      this.hp.textContent = hp;
      if (this.hpBar) this.hpBar.style.width = `${Math.min(100, hp)}%`;
      this.hp.parentElement.classList.toggle('low', hp <= 20);
      if (this.last.hp !== undefined) this.pulse(this.hp.parentElement);
      this.last.hp = hp;
    }
    const ar = ps.armor | 0;
    if (ar !== this.last.ar) {
      this.ar.textContent = ar;
      if (this.arBar) this.arBar.style.width = `${Math.min(100, ar)}%`;
      this.arBox.hidden = ar <= 0;
      if (this.last.ar !== undefined && ar > 0) this.pulse(this.arBox);
      this.last.ar = ar;
    }
    const W = WEAPONS[ps.cur];
    const key = `${ps.alive}|${ps.cur}|${ps.clips?.[ps.cur]}|${W.ammo ? ps.ammo?.[W.ammo] : ''}`;
    if (key !== this.last.ammo) {
      this.ammoBox.hidden = !W.ammo || !ps.alive;
      if (W.ammo) {
        this.clip.textContent = ps.clips[ps.cur];
        if (this.ammoName) this.ammoName.textContent = W.name;
        this.res.textContent = ps.ammo[W.ammo];
        this.ammoBox.classList.toggle('low', ps.clips[ps.cur] === 0);
      }
      this.last.ammo = key;
    }
    this.arBox.hidden = ar <= 0 || !ps.alive;
  }

  weaponSelect(ps) {
    const slots = Array.from({ length: 5 }, () => []);
    WEAPONS.forEach((w, i) => { if ((ps.owned >> i) & 1) slots[w.slot].push(i); });
    this.sel.innerHTML = slots.map((list, s) => `<div class="slot"><span class="num">${s + 1}</span>${list.map((i) => `<div class="wbox${i === ps.cur ? ' on' : ''}"><span class="wname">${WEAPONS[i].name}</span></div>`).join('') || '<div class="wbox empty"></div>'}</div>`).join('');
    this.sel.classList.add('show');
    clearTimeout(this.selTimer);
    this.selTimer = setTimeout(() => this.sel.classList.remove('show'), 1600);
  }

  kill(killer, victim, weapon, head, mine) {
    const W = WEAPONS.find((w) => w.id === weapon);
    const row = document.createElement('div');
    row.className = 'kf' + (mine ? ' mine' : '');
    const icon = `<span class="kfw">${W ? esc(W.name) : weapon === 'fall' ? 'FELL' : ['guard', 'police', 'swat'].includes(weapon) ? weapon.toUpperCase() : weapon === 'bleedout' ? 'BLED OUT' : '☠'}</span>`;
    row.innerHTML = `${killer ? `<b>${esc(killer)}</b>` : ''} ${icon}${head ? '<span class="hs">HS</span>' : ''} <b class="v">${esc(victim)}</b>`;
    this.feed.prepend(row);
    while (this.feed.children.length > 5) this.feed.lastChild.remove();
    setTimeout(() => row.classList.add('fade'), 6000);
    setTimeout(() => row.remove(), 7000);
  }

  say(name, text, sys) {
    const row = document.createElement('div');
    row.className = 'cl' + (sys ? ' sys' : '');
    row.innerHTML = sys ? esc(text) : `<b>${esc(name)}</b>: ${esc(text)}`;
    this.chat.append(row);
    while (this.chat.children.length > 8) this.chat.firstChild.remove();
    setTimeout(() => row.classList.add('fade'), 9000);
  }

  damage(angleDeg) {
    // angle of the attacker relative to view: 0 = in front
    const d = document.createElement('div');
    d.className = 'dmgarc';
    d.style.transform = `translate(-50%,-50%) rotate(${angleDeg}deg)`;
    this.dmg.append(d);
    setTimeout(() => d.remove(), 900);
    this.dmg.classList.remove('flash');
    void this.dmg.offsetWidth;
    this.dmg.classList.add('flash');
  }

  message(text, sub = '') {
    this.center.innerHTML = text ? `<div>${esc(text)}</div>${sub ? `<small>${esc(sub)}</small>` : ''}` : '';
  }

  // label: what ends the match ("30 FRAGS", "FIRST TO 3", "SURVIVE")
  setTimer(sec, label) {
    const time = sec < 0 ? 'NO TIME LIMIT' : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    this.timer.textContent = `${time}  ·  ${label}`;
  }

  // teams: null (free for all) or [[key, title], ...] to group players by p.team; extra: { title, get(p) } adds a column
  scoreboard(on, players, myId, map, teams, extra) {
    this.board.hidden = !on;
    if (!on) return;
    const rows = [...players].sort((a, b) => b.frags - a.frags || a.deaths - b.deaths);
    const row = (p) => `<tr class="${p.id === myId ? 'me' : ''}"><td>${esc(p.name)}</td>${extra ? `<td>${extra.get(p)}</td>` : ''}<td>${p.frags}</td><td>${p.deaths}</td><td>${p.bot ? 'BOT' : p.ping | 0}</td></tr>`;
    const head = `<thead><tr><th>Name</th>${extra ? `<th>${extra.title}</th>` : ''}<th>${extra && extra.title === 'Points' ? 'Kills' : 'Score'}</th><th>Deaths</th><th>Ping</th></tr></thead>`;
    let body;
    if (teams) {
      body = teams.map(([t, title]) => `<tr class="team ${t}"><td colspan="5">${esc(title)}</td></tr>${rows.filter((p) => p.team === t).map(row).join('')}`).join('');
    } else body = rows.map(row).join('');
    this.board.innerHTML = `<div class="sb-head"><span>${esc(map || '')}</span><span>${rows.length} player${rows.length === 1 ? '' : 's'}</span></div><table>${head}<tbody>${body}</tbody></table>`;
  }

  // score bar at the top for team modes. st: { kind: 'ctf'|'tdm'|'zombie', ... } or null
  teamBar(st) {
    if (!this.ctfEl) {
      this.ctfEl = document.createElement('div');
      this.ctfEl.id = 'ctf';
      this.el.append(this.ctfEl);
    }
    this.ctfEl.hidden = !st;
    if (!st) return;
    let html;
    if (st.kind === 'infection') {
      const [humans, zombies, started, countdown] = st.zm || [0, 0, 0, -1];
      const mid = started ? (st.myTeam === 'zombie' ? 'infect them all' : 'survive until the clock runs out') : countdown < 0 ? 'waiting for a second player' : `outbreak in ${countdown}s`;
      html = `<span class="blue">SURVIVORS ${humans}</span><span class="mid">${mid}</span><span class="zombie">${zombies} ZOMBIES</span>`;
    } else {
      const where = (i) => {
        const f = st.state && st.state[i];
        if (!f) return 'home';
        if (f[1] === st.myId) return 'you have it!';
        return f[1] ? 'taken' : f[2] ? 'dropped' : 'home';
      };
      const goal = st.kind === 'ctf' ? `first to ${st.limit}` : st.kind === 'soccer' ? (st.limit ? `first to ${st.limit} goals` : 'most goals wins') : st.kind === 'mugrball' ? (st.limit ? `first to ${st.limit} points` : 'most points wins') : st.limit ? `first to ${st.limit} frags` : 'most frags wins';
      html = `<span class="red">RED ${st.score[0]}</span><span class="mid">${goal}${st.myTeam ? ` · you are ${st.myTeam}` : ''}</span><span class="blue">${st.score[1]} BLUE</span>`;
      if (st.kind === 'ctf') html += `<div class="flags"><span class="red">red flag: ${where(0)}</span><span class="blue">blue flag: ${where(1)}</span></div>`;
    }
    if (html === this.ctfKey) return;
    this.ctfKey = html;
    this.ctfEl.innerHTML = html;
  }

  // team deathmatch warm-up: pick a side. v: { secs, counts: {red, blue}, mine } or null
  teamPick(v) {
    if (!this.pickEl) {
      this.pickEl = document.createElement('div');
      this.pickEl.className = 'pickpanel';
      this.pickEl.id = 'teampick';
      document.body.append(this.pickEl);
    }
    this.pickEl.hidden = !v;
    if (!v) return;
    const opt = (k, key, name, n) => `<li class="${v.mine === key ? 'mine' : ''} ${key}"><kbd>${k}</kbd><span>${name}</span>${n === undefined ? '' : `<b>${n}</b>`}</li>`;
    const html = `<h3>Pick your team</h3><p>Warm-up: nothing counts yet. Press 1–3 · match starts in ${v.secs}s</p>
      <ol>${opt(1, 'red', 'Red team', v.counts.red)}${opt(2, 'blue', 'Blue team', v.counts.blue)}${opt(3, 'auto', 'Auto (fewest players)')}</ol>`;
    if (html === this.pickKey) return;
    this.pickKey = html;
    this.pickEl.innerHTML = html;
  }

  // active powerups under the health box: [[name, secondsLeft], ...]
  powers(list) {
    if (!this.powEl) {
      this.powEl = document.createElement('div');
      this.powEl.id = 'powers';
      this.el.append(this.powEl);
    }
    const html = list.map(([n, t]) => `<span>${esc(n)} <b>${t}</b></span>`).join('');
    if (html === this.powKey) return;
    this.powKey = html;
    this.powEl.innerHTML = html;
  }

  // zombies HUD: round tally, points, perks, power-ups, the "press E" line and the downed screen. st or null.
  zombies(st) {
    if (!this.zEl) {
      this.zEl = document.createElement('div');
      this.zEl.id = 'zhud';
      this.zEl.innerHTML = '<div class="zround"></div><div class="zleft"></div><div class="zpoints"></div><div class="zperks"></div><div class="zpow"></div><div class="zprompt"></div><div class="zdown"><b>YOU ARE DOWN</b><span></span><i><em></em></i></div>';
      this.el.append(this.zEl);
      this.z = Object.fromEntries(['zround', 'zleft', 'zpoints', 'zperks', 'zpow', 'zprompt', 'zdown'].map((k) => [k, this.zEl.querySelector('.' + k)]));
    }
    this.zEl.hidden = !st;
    if (!st) return;
    const set = (el, html) => { if (el.dataset.v !== html) { el.dataset.v = html; el.innerHTML = html; } };
    set(this.z.zround, st.round ? String(st.round) : '');
    set(this.z.zleft, st.phase === 1 ? `next round in ${st.phaseSecs}s` : st.phase === 2 ? `${st.left} zombie${st.left === 1 ? '' : 's'} left` : '');
    if (this.lastPoints !== undefined && st.points > this.lastPoints) {
      // a little +points float for each gain
      const f = document.createElement('span');
      f.className = 'zgain';
      f.textContent = `+${st.points - this.lastPoints}`;
      this.z.zpoints.append(f);
      setTimeout(() => f.remove(), 900);
    }
    this.lastPoints = st.points;
    const pts = this.z.zpoints.firstChild && this.z.zpoints.firstChild.nodeType === 3 ? this.z.zpoints.firstChild : this.z.zpoints.insertBefore(document.createTextNode(''), this.z.zpoints.firstChild);
    pts.nodeValue = String(st.points);
    set(this.z.zperks, Object.values(PERKS).filter((P) => st.perks & P.bit).map((P) => `<span style="background:${P.color}" title="${P.name}">${P.name[0]}</span>`).join(''));
    set(this.z.zpow, [st.insta ? `<span>INSTA-KILL ${st.insta}</span>` : '', st.double ? `<span>DOUBLE POINTS ${st.double}</span>` : ''].join(''));
    set(this.z.zprompt, st.prompt ? `<span class="${st.prompt.ok ? '' : 'no'}">${esc(st.prompt.text)}</span>` : '');
    this.z.zdown.hidden = !st.downed;
    if (st.downed) {
      set(this.z.zdown.querySelector('span'), st.revive ? 'Being revived...' : `Bleeding out in ${st.bleed}s. A teammate can revive you.`);
      this.z.zdown.querySelector('em').style.width = `${st.revive}%`;
    }
  }

  flashPoints() {
    if (!this.z) return;
    this.pulse(this.z.zpoints);
  }

  // end-of-match map vote; v: { options:[{id,name}], counts, mine, ends, title } or null
  vote(v) {
    if (!this.voteEl) {
      this.voteEl = document.createElement('div');
      this.voteEl.className = 'pickpanel';
      this.voteEl.id = 'vote';
      document.body.append(this.voteEl);
    }
    this.voteEl.hidden = !v;
    if (!v) return;
    const secs = Math.max(0, Math.ceil(v.ends - performance.now() / 1000));
    const key = `${JSON.stringify(v.counts)}|${v.mine}|${secs}`;
    if (key === this.voteKey) return;
    this.voteKey = key;
    this.voteEl.innerHTML = `<h3>${esc(v.title)}</h3><p>Vote for the next map: press 1–${v.options.length} · ${secs}s</p>
      <ol>${v.options.map((o, i) => `<li class="${v.mine === o.id ? 'mine' : ''}"><kbd>${i + 1}</kbd><span>${esc(o.name)}</span><b>${v.counts[o.id] || 0}</b></li>`).join('')}</ol>`;
  }
}

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
