// Player profiles: the card you get by clicking someone (in the friends list, the leaderboard, the Players list
// in a match, or your own name in the menu). It shows how they look, turning, their bio and a few stats, with
// buttons to add them as a friend, message them, block them, or report their look, bio or name. The server
// checks everything. Blocking hides their chat and voice for you; a guest's blocks are kept in this browser.
import { Preview } from './locker.js';
import { esc } from './hud.js';

const $ = (id) => document.getElementById(id);
const LOCAL_KEY = 'arena.blocked';
const BIO_MAX = 160;
const ROLE = { owner: 'Owner', coowner: 'Co-owner', admin: 'Admin', mod: 'Moderator' };
export const PROFILE_TYPES = new Set(['profile', 'profile-error', 'blocked', 'report-sent', 'reports']);

export class ProfileCard {
  // opts: { game, social, voice, account() -> signed-in name or null, signIn() }
  constructor(opts) {
    this.opts = opts;
    this.g = opts.game;
    this.serverBlocked = new Set(); // account keys this account has blocked (the server's list)
    this.localBlocked = new Set();
    try { for (const n of JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')) this.localBlocked.add(n); } catch {}
    this.cur = null;
    this.g.isBlocked = (info) => !!info && this.isBlocked(info.name);
    $('pf-close').onclick = () => this.close();
    $('pls-close').onclick = () => { $('dlg-players').hidden = true; };
    $('dlg-profile').addEventListener('keydown', (e) => { if (e.target.matches('input, textarea')) e.stopPropagation(); });
  }

  isBlocked(name) {
    const k = String(name || '').toLowerCase();
    return this.serverBlocked.has(k) || this.localBlocked.has(k);
  }

  send(msg) {
    this.g.socket(() => this.g.send(msg));
  }

  // who: { name } for an account, { id } for someone in your game
  open(who) {
    this.reset(who.name);
    this.want = who;
    this.msg('Loading…');
    this.send({ t: 'profile', ...who });
  }

  reset(name) {
    this.reporting = false;
    this.cur = null;
    $('dlg-profile').hidden = false;
    $('pf-name').textContent = name || '';
    for (const id of ['pf-tags', 'pf-bio', 'pf-stats', 'pf-actions']) $(id).innerHTML = '';
    $('pf-report').hidden = true;
    this.preview ||= new Preview($('pf-canvas'));
    this.preview.clear();
    this.preview.start();
  }

  // a card made here rather than asked for (a guest's own card in the menus, where the server has none)
  show(card) {
    this.reset(card.name);
    this.want = null;
    this.cur = card;
    this.msg('');
    this.render();
  }

  close() {
    $('dlg-profile').hidden = true;
    this.preview?.stop();
  }

  msg(text, err = false) {
    $('pf-msg').textContent = text || '';
    $('pf-msg').classList.toggle('err', err);
  }

  receive(m) {
    if (m.t === 'blocked') { this.serverBlocked = new Set(m.list); this.changed(); return; }
    if (m.t === 'reports') return this.reports(m.items);
    if ($('dlg-profile').hidden) return;
    if (m.t === 'profile') {
      if (m.error) return this.msg(m.error, true);
      // a reply for someone else (the card was opened again meanwhile) is dropped
      const w = this.want || {};
      const mine = (w.name && m.name.toLowerCase() === w.name.toLowerCase()) || (w.id != null && m.id === w.id) || this.cur?.name === m.name;
      if (!mine) return;
      this.cur = m;
      this.msg('');
      this.render();
    } else if (m.t === 'profile-error') this.msg(m.text, true);
    else if (m.t === 'report-sent') { this.reporting = false; $('pf-report').hidden = true; this.msg(m.text); }
  }

  // the blocks changed: voice and the Players list follow
  changed() {
    this.opts.voice?.refreshBlocks?.();
    if (!$('dlg-players').hidden) this.openPlayers();
  }

  // ---------------------------------------------------------------- the card
  render() {
    const p = this.cur, signedIn = !!this.opts.account();
    $('pf-name').textContent = p.name;
    this.preview.show(p.color, p.model, p.cos || {});
    const tags = [];
    if (p.bot) tags.push('<span>Computer player</span>');
    else tags.push(p.account ? '<span>Account</span>' : '<span>Guest</span>');
    if (p.role) tags.push(`<span class="role">${ROLE[p.role] || esc(p.role)}</span>`);
    if (!p.bot) tags.push(p.online ? `<span class="on">● ${p.room ? `Playing ${esc(p.room)}` : 'Online'}</span>` : '<span>Offline</span>');
    if (p.me) tags.push('<span class="role">You</span>');
    if (p.account && p.joined) tags.push(`<span>Joined ${new Date(p.joined).toLocaleDateString()}</span>`);
    $('pf-tags').innerHTML = tags.join('');

    // the bio: yours to edit, or theirs to read
    const bio = $('pf-bio');
    if (p.me && p.account) {
      bio.innerHTML = `<textarea id="pf-bio-text" maxlength="${BIO_MAX}" placeholder="Write something about yourself">${esc(p.bio)}</textarea>`
        + `<div class="pf-bio-row"><small id="pf-bio-left"></small><button type="button" class="btn primary" id="pf-bio-save">Save bio</button></div>`;
      const ta = $('pf-bio-text'), left = () => { $('pf-bio-left').textContent = `${BIO_MAX - ta.value.length} letters left`; };
      ta.oninput = left;
      left();
      $('pf-bio-save').onclick = () => { this.send({ t: 'bio', text: ta.value }); this.msg('Saving…'); };
    } else if (p.me) bio.innerHTML = '<p class="empty">Sign in to write a bio and get friends.</p>';
    else if (p.bot) bio.innerHTML = '<p class="empty">A computer player.</p>';
    else bio.innerHTML = p.bio ? `<p>${esc(p.bio)}</p>` : `<p class="empty">${p.account ? 'No bio yet.' : 'Guests don’t have a bio.'}</p>`;

    const s = p.stats;
    $('pf-stats').innerHTML = s ? [['Kills', s.kills], ['Deaths', s.deaths], ['K/D', (s.kills / Math.max(1, s.deaths)).toFixed(2)], ['Wins', s.wins]]
      .map(([k, v]) => `<div><b>${typeof v === 'number' ? v.toLocaleString() : v}</b><small>${k}</small></div>`).join('') : '';

    // what you can do
    const btn = (label, act, cls = '') => `<button type="button" class="btn ${cls}" data-act="${act}">${label}</button>`;
    const acts = [];
    if (p.me) {
      if (!p.account) acts.push(btn('Sign in / Register', 'signin', 'primary'));
    } else if (!p.bot) {
      const blocked = p.blocked || this.isBlocked(p.name);
      if (p.account && signedIn && !blocked) {
        if (p.friend === 'friends') acts.push(btn('Message', 'message', 'primary'), btn('Remove friend', 'unfriend'));
        else if (p.friend === 'incoming') acts.push(btn('Accept friend request', 'accept', 'primary'), btn('Decline', 'decline'));
        else if (p.friend === 'outgoing') acts.push(btn('Request sent · Cancel', 'unfriend'));
        else acts.push(btn('Add friend', 'add', 'primary'));
      } else if (p.account && !signedIn) acts.push(btn('Sign in to add friends', 'signin'));
      acts.push(blocked ? btn('Unblock', 'unblock') : btn('Block', 'block', 'danger'));
      acts.push(btn('Report', 'report'));
    }
    $('pf-actions').innerHTML = acts.join('');
    for (const b of $('pf-actions').querySelectorAll('button')) b.onclick = () => this.act(b.dataset.act);
    this.renderReport();
  }

  act(a) {
    const p = this.cur;
    if (a === 'signin') { this.close(); this.opts.signIn(); return; }
    if (a === 'message') { this.close(); this.opts.social.open(); this.opts.social.openChat(p.name); return; }
    if (a === 'add' || a === 'accept' || a === 'decline') { this.send({ t: 'friend', action: a, name: p.name }); this.later(); return; }
    if (a === 'unfriend') {
      if (p.friend === 'friends' && !confirm(`Remove ${p.name} from your friends?`)) return;
      this.send({ t: 'friend', action: 'remove', name: p.name });
      this.later();
      return;
    }
    if (a === 'block' || a === 'unblock') {
      const on = a === 'block';
      if (on && !confirm(`Block ${p.name}? You won't see their chat or hear their voice${p.account && this.opts.account() ? ', and they can\'t message you or ask to be friends' : ''}.`)) return;
      const k = p.name.toLowerCase();
      if (p.account && this.opts.account()) this.send({ t: 'block', name: p.name, on });
      else {
        // a guest on either side: kept in this browser
        if (on) this.localBlocked.add(k); else this.localBlocked.delete(k);
        try { localStorage.setItem(LOCAL_KEY, JSON.stringify([...this.localBlocked].slice(-500))); } catch {}
        p.blocked = on;
        this.changed();
        this.render();
      }
      this.msg(on ? `${p.name} is blocked.` : `${p.name} is unblocked.`);
      return;
    }
    if (a === 'report') { this.reporting = !this.reporting; this.renderReport(); }
  }

  // ask again in a moment, once the server has the change
  later() {
    const p = this.cur;
    setTimeout(() => { if (this.cur === p && !$('dlg-profile').hidden) this.send({ t: 'profile', ...(p.account ? { name: p.name } : { id: p.id }) }); }, 350);
  }

  // what to report and why
  renderReport() {
    const box = $('pf-report'), p = this.cur;
    box.hidden = !this.reporting;
    if (!this.reporting || !p) return;
    const choices = [['skin', 'Their look'], ...(p.bio ? [['bio', 'Their bio']] : []), ['name', 'Their name']];
    box.innerHTML = `<b>Report ${esc(p.name)}</b><p>What's wrong? Staff will take a look.</p>`
      + `<div class="pf-what">${choices.map(([k, l], i) => `<label><input type="radio" name="pf-what" value="${k}"${i ? '' : ' checked'}> ${l}</label>`).join('')}</div>`
      + `<input type="text" id="pf-note" maxlength="200" placeholder="Anything staff should know (optional)" autocomplete="off">`
      + `<div class="actions"><button type="button" class="btn" id="pf-rep-cancel">Cancel</button><button type="button" class="btn danger" id="pf-rep-send">Send report</button></div>`;
    $('pf-rep-cancel').onclick = () => { this.reporting = false; this.renderReport(); };
    $('pf-rep-send').onclick = () => {
      const what = box.querySelector('input[name=pf-what]:checked')?.value;
      this.send({ t: 'report', what, note: $('pf-note').value, ...(p.account ? { name: p.name } : { id: p.id }) });
      this.msg('Sending…');
    };
  }

  // ---------------------------------------------------------------- everyone in your game
  openPlayers() {
    const g = this.g, list = [...g.info.values()].sort((a, b) => (b.frags | 0) - (a.frags | 0));
    $('dlg-players').hidden = false;
    $('pls-list').innerHTML = list.map((i) => {
      const tag = i.id === g.myId ? 'You' : i.bot ? 'Computer player' : i.acct ? 'Account' : 'Guest';
      return `<li data-id="${i.id}" class="pls-row"><span class="fr-who"><b>${esc(i.name)}${this.isBlocked(i.name) ? ' <small class="pls-blocked">blocked</small>' : ''}</b><small>${tag}${i.team ? ` · ${esc(i.team)} team` : ''}</small></span><span class="pls-score">${i.frags | 0}</span><button type="button" class="btn">Profile</button></li>`;
    }).join('') || '<li class="empty">Nobody here.</li>';
    for (const li of $('pls-list').querySelectorAll('li[data-id]')) li.onclick = () => this.open({ id: +li.dataset.id });
  }

  // ---------------------------------------------------------------- staff: reports
  reports(items) {
    let el = $('dlg-reports');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dlg-reports';
      el.className = 'review';
      document.body.appendChild(el);
    }
    if (!items.length) { el.hidden = true; this.opts.social.notice('No reports left.'); return; }
    el.hidden = false;
    const what = { skin: 'look', bio: 'bio', name: 'name' };
    el.innerHTML = `<div class="rv-box"><h3>Reports</h3><p>Check each one. Clear a bio or take a picture down if it isn't fine for everyone; ban with /ban name reason.</p><div class="rp-list">${items.map((r) => `<div class="rp-item">`
      + `<b>${esc(r.name)}</b> <small>${r.account ? 'account' : 'guest'} · their ${what[r.what]} · reported by ${esc(r.by)} · ${new Date(r.at).toLocaleString()}</small>`
      + (r.what === 'bio' ? `<blockquote>${esc(r.bio || '(empty)')}</blockquote>` : r.what === 'skin' ? `<blockquote>${esc(r.look || '')}</blockquote>` : '')
      + (r.note ? `<p class="rp-note">“${esc(r.note)}”</p>` : '')
      + `<span><button type="button" class="btn" data-id="${r.id}" data-act="view" data-name="${esc(r.name)}" ${r.account ? '' : 'disabled'}>Profile</button>`
      + (r.what === 'bio' && r.account ? `<button type="button" class="btn danger" data-id="${r.id}" data-act="clearbio">Clear bio</button>` : '')
      + (r.img ? `<button type="button" class="btn danger" data-id="${r.id}" data-act="picture">Take picture down</button>` : '')
      + `<button type="button" class="btn" data-id="${r.id}" data-act="dismiss">Dismiss</button></span></div>`).join('')}</div><button type="button" class="btn" id="rp-close">Close</button></div>`;
    $('rp-close').onclick = () => { el.hidden = true; };
    for (const b of el.querySelectorAll('button[data-act]')) b.onclick = () => {
      if (b.dataset.act === 'view') return this.open({ name: b.dataset.name });
      this.send({ t: 'report-act', id: b.dataset.id, action: b.dataset.act });
    };
  }
}
