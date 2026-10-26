// Friends, direct messages, notices and the owner's moderation panel. Everything travels over the game's
// socket, so it works from the menu and in a match. The server checks every request; this is just the UI.
import { esc } from './hud.js';

const $ = (id) => document.getElementById(id);
const time = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// opts: { game, account() -> signed-in name or null, join(code), refresh(), maps() -> [{ id, name }], cosmetics }
export class Social {
  constructor(opts) {
    this.opts = opts;
    this.g = opts.game;
    this.data = { friends: [], incoming: [], outgoing: [] };
    this.chatWith = null; // the friend whose messages are open
    this.msgs = [];
    this.unread = new Map(); // friend name -> count
    this.g.onSocial = (m) => this.receive(m);

    $('fr-close').onclick = () => this.close();
    $('fr-add').onsubmit = (e) => {
      e.preventDefault();
      const name = $('fr-name').value.trim();
      if (name) this.send({ t: 'friend', action: 'add', name });
      $('fr-name').value = '';
    };
    $('fr-msg-form').onsubmit = (e) => {
      e.preventDefault();
      const text = $('fr-msg').value.trim();
      if (text && this.chatWith) this.send({ t: 'dm', to: this.chatWith, text });
      $('fr-msg').value = '';
    };
    $('fr-msg').addEventListener('keydown', (e) => e.stopPropagation()); // typing isn't movement
    $('fr-name').addEventListener('keydown', (e) => e.stopPropagation());
    $('mod-close').onclick = () => { $('dlg-mod').hidden = true; };
    this.cosmetics = opts.cosmetics || [];
    $('ban-ok').onclick = () => location.reload();
  }

  send(msg) {
    this.g.socket(() => this.g.send(msg));
  }

  open() {
    $('dlg-friends').hidden = false;
    const signedIn = !!this.opts.account();
    $('fr-guest').hidden = signedIn;
    $('fr-body').hidden = !signedIn;
    if (signedIn) this.send({ t: 'friends' });
    this.renderChat();
  }

  close() {
    $('dlg-friends').hidden = true;
  }

  isOpen() {
    return !$('dlg-friends').hidden;
  }

  // ---------------------------------------------------------------- messages from the server
  receive(m) {
    if (m.t === 'friends') { this.data = m; this.renderFriends(); }
    else if (m.t === 'friend-error') { $('fr-err').textContent = m.text; setTimeout(() => ($('fr-err').textContent = ''), 4000); }
    else if (m.t === 'dms') {
      if (m.with.toLowerCase() === (this.chatWith || '').toLowerCase()) { this.msgs = m.msgs; this.renderChat(); }
    } else if (m.t === 'dm') this.onDm(m);
    else if (m.t === 'sys') this.notice(m.text);
    else if (m.t === 'mod') { this.mod = m; this.renderMod(); }
    else if (m.t === 'mod-accounts') { this.accounts = m.accounts; if (this.modTab === 'accounts' && !this.acct) this.renderMod(); }
    else if (m.t === 'mod-account') { if (m.account) { this.acct = m.account; this.modTab = 'accounts'; this.renderMod(); } }
    else if (m.t === 'announce') this.announce(m.text);
    else if (m.t === 'refresh') this.opts.refresh?.();
    else if (m.t === 'banned') this.banned(m);
    else if (m.t === 'review') this.review(m.items);
  }

  // staff: custom pictures waiting for review, each with Approve and Turn down
  review(items) {
    let el = $('dlg-review');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dlg-review';
      el.className = 'review';
      document.body.appendChild(el);
    }
    if (!items.length) { el.hidden = true; this.notice('All pictures reviewed.'); return; }
    el.hidden = false;
    el.innerHTML = `<div class="rv-box"><h3>Pictures to review</h3><p>Approve only pictures that are fine for everyone. Anything rude, violent or with nudity: turn it down.</p><div class="rv-list">${items.map((it) => `<div class="rv-item"><img src="${esc(it.data)}" alt=""><small>by ${esc(it.by)}</small><span><button type="button" class="btn primary" data-ok="${esc(it.id)}">Approve</button><button type="button" class="btn" data-no="${esc(it.id)}">Turn down</button></span></div>`).join('')}</div><button type="button" class="btn" id="rv-close">Close</button></div>`;
    $('rv-close').onclick = () => { el.hidden = true; };
    for (const b of el.querySelectorAll('[data-ok], [data-no]')) b.onclick = () => this.send({ t: 'review', id: b.dataset.ok || b.dataset.no, ok: !!b.dataset.ok });
  }

  onDm(m) {
    const me = (this.opts.account() || '').toLowerCase();
    const other = m.from.toLowerCase() === me ? m.to : m.from;
    if (this.isOpen() && this.chatWith && other.toLowerCase() === this.chatWith.toLowerCase()) {
      this.msgs.push(m);
      this.renderChat();
      return;
    }
    if (m.from.toLowerCase() === me) return;
    this.unread.set(other, (this.unread.get(other) || 0) + 1);
    this.badge();
    this.notice(`Message from ${m.from}: ${m.text}`, true);
    this.g.sound?.chat();
    if (this.isOpen()) this.renderFriends();
  }

  // a notice in the match's chat feed, or a pop-up in the menus
  notice(text, dm) {
    if (this.g.connected) this.g.hud.say('', (dm ? '✉ ' : '') + text, true);
    const el = $('notice');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => el.classList.remove('show'), 4500);
  }

  badge() {
    let n = 0;
    for (const v of this.unread.values()) n += v;
    n += this.data.incoming.length;
    const b = $('fr-badge');
    b.hidden = !n;
    b.textContent = n > 9 ? '9+' : String(n);
  }

  // ---------------------------------------------------------------- friends list
  renderFriends() {
    const d = this.data;
    const row = (html) => `<li>${html}</li>`;
    const btn = (label, act, name, cls = '') => `<button type="button" class="btn ${cls}" data-act="${act}" data-name="${esc(name)}">${label}</button>`;
    const friends = [...d.friends].sort((a, b) => b.online - a.online || a.name.localeCompare(b.name));
    $('fr-list').innerHTML = [
      ...d.incoming.map((n) => row(`<span class="fr-who"><b>${esc(n)}</b><small>wants to be friends</small></span>${btn('Accept', 'accept', n, 'primary')}${btn('Decline', 'decline', n)}`)),
      ...friends.map((f) => {
        const un = this.unread.get(f.name);
        const where = f.online ? (f.room ? `Playing ${esc(f.room.name)} · ${esc(f.room.map)}` : 'In the menus') : 'Offline';
        return row(`<span class="fr-who"><i class="dot${f.online ? ' on' : ''}"></i><b>${esc(f.name)}</b><small>${where}</small></span>`
          + (f.room ? btn('Join', 'join', f.room.code, 'primary') : '')
          + btn(`Message${un ? ` (${un})` : ''}`, 'chat', f.name)
          + btn('×', 'remove', f.name, 'x'));
      }),
      ...d.outgoing.map((n) => row(`<span class="fr-who"><b>${esc(n)}</b><small>request sent</small></span>${btn('Cancel', 'remove', n)}`)),
    ].join('') || '<li class="empty">No friends yet. Add someone by their account name.</li>';
    for (const b of $('fr-list').querySelectorAll('button')) {
      b.onclick = () => {
        const { act, name } = b.dataset;
        if (act === 'chat') this.openChat(name);
        else if (act === 'join') { this.close(); this.opts.join(name); }
        else if (act === 'remove' && !confirm(`Remove ${name}?`)) return;
        else this.send({ t: 'friend', action: act, name });
      };
    }
    this.badge();
  }

  openChat(name) {
    this.chatWith = name;
    this.msgs = [];
    this.unread.delete(name);
    this.badge();
    this.renderFriends();
    this.renderChat();
    this.send({ t: 'dms', with: name });
    $('fr-msg').focus();
  }

  renderChat() {
    const on = !!this.chatWith;
    $('fr-chat').hidden = !on;
    if (!on) return;
    $('fr-chat-title').textContent = this.chatWith;
    const me = (this.opts.account() || '').toLowerCase();
    const box = $('fr-msgs');
    box.innerHTML = this.msgs.map((m) => `<div class="dm${m.from.toLowerCase() === me ? ' mine' : ''}"><span>${esc(m.text)}</span><small>${time(m.at)}</small></div>`).join('')
      || '<p class="empty">No messages yet. Say hi!</p>';
    box.scrollTop = box.scrollHeight;
  }

  // ---------------------------------------------------------------- the owner menu
  openMod(tab = this.modTab || 'players') {
    $('dlg-mod').hidden = false;
    this.modTab = tab;
    this.acct = null;
    this.send({ t: 'mod', action: 'list' });
    if (tab === 'accounts') this.send({ t: 'mod', action: 'accounts' });
    this.renderMod();
  }

  mod_(action, extra = {}) {
    this.send({ t: 'mod', action, ...extra });
  }

  renderMod() {
    const m = this.mod || { players: [], bans: [] };
    const st = m.storage || {};
    $('mod-storage').textContent = st.kind === 'file' ? 'Saving: files on this server (lost if the host wipes them).'
      : st.ok ? 'Saving: online database, working.' : `Saving is NOT working: ${st.error || 'checking…'}`;
    $('mod-storage').classList.toggle('err', st.kind === 'redis' && !st.ok);
    const tabs = [['players', `Players (${m.players.length})`], ['accounts', 'Accounts'], ['server', 'Server'], ['bans', `Bans (${m.bans.length})`]];
    $('mod-tabs').innerHTML = tabs.map(([k, l]) => `<button class="tab${k === this.modTab ? ' on' : ''}" data-tab="${k}" role="tab">${l}</button>`).join('');
    const pane = $('mod-pane');
    const btn = (label, act, data = {}, cls = '') => `<button type="button" class="btn ${cls}" data-act="${act}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(String(v))}"`).join(' ')}>${label}</button>`;
    if (this.modTab === 'players') {
      pane.innerHTML = `<div class="mod-opts"><input type="text" id="mod-reason" maxlength="120" placeholder="Reason (optional, shown to them and posted to Discord)">`
        + `<label>Mute for <input type="number" id="mod-mins" value="10" min="1" max="1440"> min</label></div>`
        + `<ul class="fr-list mod-list">${m.players.map((p) => `<li><span class="fr-who"><b>${esc(p.name)}</b><small>${p.account ? 'account' : 'guest'} · ${p.room ? esc(p.room) + (p.here ? ' (your game)' : '') : 'in the menus'}${p.muted ? ` · muted ${p.muted} min` : ''}</small></span><span class="mod-btns">`
          + (p.room ? btn('Slay', 'slay', { name: p.name }) + btn('Heal', 'heal', { name: p.name }) + btn('Guns', 'guns', { name: p.name }) + (p.here ? btn('Go to', 'goto', { name: p.name }) + btn('Bring', 'bring', { name: p.name }) : '') : '')
          + (p.muted ? btn('Unmute', 'unmute', { name: p.name }) : btn('Mute', 'mute', { name: p.name }))
          + btn('Kick', 'kick', { name: p.name }) + btn('Ban', 'ban', { name: p.name }, 'danger')
          + '</span></li>').join('') || '<li class="empty">Nobody else is online.</li>'}</ul>`
        + '<p class="hint">Chat commands work too: /kick name, /ban name reason, /unban name, /bans.</p>';
    } else if (this.modTab === 'accounts') {
      if (this.acct) {
        const a = this.acct, s = a.stats || {};
        pane.innerHTML = `<div class="mod-acct-head">${btn('‹ All accounts', 'back')}<h3>${esc(a.name)}</h3><small>joined ${new Date(a.created).toLocaleDateString()} · ${a.friends} friends</small></div>`
          + `<div class="mod-coins"><span class="coins">${a.coins.toLocaleString()}</span><input type="number" id="mod-amount" value="1000" min="0">`
          + btn('Give', 'coins', { name: a.name, mode: 'give' }, 'primary') + btn('Take', 'coins', { name: a.name, mode: 'take' }) + btn('Set to', 'coins', { name: a.name, mode: 'set' })
          + `</div><h4>Cosmetics</h4><div class="mod-items">${this.cosmetics.map((c) => {
            const has = a.owned.includes(c.id);
            return `<div class="mod-item${has ? ' has' : ''}"><b>${esc(c.name)}</b><small>${c.slot}${Object.values(a.eq).includes(c.id) ? ' · wearing' : ''}</small>${has ? btn('Remove', 'item', { name: a.name, id: c.id, give: '' }) : btn('Give', 'item', { name: a.name, id: c.id, give: '1' }, 'primary')}</div>`;
          }).join('')}</div>`
          + `<h4>Stats</h4><p class="mod-stats">Kills ${s.kills || 0} · Deaths ${s.deaths || 0} · Wins ${s.wins || 0} · Matches ${s.matches || 0} · Best streak ${s.streak || 0} · Zombie kills ${s.zkills || 0} · Coins earned ${(s.coins || 0).toLocaleString()}</p>`
          + (a.name.toLowerCase() === 'watermelon' ? '' : `<div class="actions" style="justify-content:flex-start">${btn('Ban', 'ban', { name: a.name }, 'danger')}${btn('Unban', 'unban', { name: a.name })}</div>`);
      } else {
        const list = this.accounts;
        const q = (this.acctFilter || '').toLowerCase();
        const shown = list ? list.filter((a) => a.name.toLowerCase().includes(q)) : [];
        pane.innerHTML = `<div class="mod-opts"><input type="text" id="mod-search" placeholder="Search accounts" value="${esc(this.acctFilter || '')}"><span class="hint">${list ? `${list.length} account${list.length === 1 ? '' : 's'}` : 'Loading…'}</span></div>`
          + `<ul class="fr-list mod-list">${shown.map((a) => `<li><span class="fr-who"><b>${esc(a.name)}</b><small>joined ${new Date(a.created).toLocaleDateString()} · ${a.kills} kills</small></span><span class="coins">${a.coins.toLocaleString()}</span>${btn('Manage', 'open', { name: a.name }, 'primary')}</li>`).join('') || (list ? '<li class="empty">No accounts match.</li>' : '')}</ul>`;
      }
    } else if (this.modTab === 'server') {
      const me = m.me;
      pane.innerHTML = `<h4>Announcement</h4><div class="mod-opts"><input type="text" id="mod-announce" maxlength="200" placeholder="Shown in big letters to everyone online">${btn('Send', 'announce', {}, 'primary')}</div>`
        + `<h4>Your powers</h4>` + (me ? `<div class="mod-opts">${btn(`God mode: ${me.god ? 'ON' : 'off'}`, 'god', {}, me.god ? 'primary' : '')}${btn(`Infinite ammo: ${me.ammo ? 'ON' : 'off'}`, 'ammo', {}, me.ammo ? 'primary' : '')}</div>`
          + `<h4>This match: ${esc(me.room)}</h4><div class="mod-opts"><select id="mod-map">${this.opts.maps().map((x) => `<option value="${x.id}"${x.id === me.map ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select>${btn('Change map', 'map')}${btn('End match', 'end')}${btn(`Add bot (${me.bots})`, 'addbot')}${btn('Remove bot', 'kickbot')}</div>`
          : '<p class="hint">Join a match to use God mode, Infinite ammo and the match controls.</p>');
    } else {
      pane.innerHTML = `<ul class="fr-list mod-list">${m.bans.map((b) => `<li><span class="fr-who"><b>${esc(b.name)}</b><small>${esc(b.reason || '')} · ${new Date(b.at).toLocaleDateString()}</small></span>${btn('Unban', 'unban', { name: b.name })}</li>`).join('') || '<li class="empty">Nobody is banned.</li>'}</ul>`;
    }
    for (const b of $('mod-tabs').children) b.onclick = () => this.openMod(b.dataset.tab);
    const search = $('mod-search');
    if (search) { search.oninput = () => { this.acctFilter = search.value; const pos = search.selectionStart; this.renderMod(); const s2 = $('mod-search'); s2.focus(); s2.setSelectionRange(pos, pos); }; }
    for (const el of pane.querySelectorAll('input, select')) el.addEventListener('keydown', (e) => e.stopPropagation());
    for (const b of pane.querySelectorAll('button[data-act]')) b.onclick = () => this.modClick(b.dataset);
  }

  modClick(d) {
    const val = (id) => $(id)?.value.trim() || '';
    const act = d.act;
    if (act === 'back') { this.acct = null; this.send({ t: 'mod', action: 'accounts' }); return this.renderMod(); }
    if (act === 'open') return this.mod_('account', { name: d.name });
    if (act === 'ban' && !confirm(`Ban ${d.name}? They won't be able to play from this account, browser or internet connection.`)) return;
    if (act === 'slay' && !confirm(`Slay ${d.name}?`)) return;
    if (act === 'coins') return this.mod_('coins', { name: d.name, mode: d.mode, amount: Number(val('mod-amount')) || 0 });
    if (act === 'item') return this.mod_('item', { name: d.name, id: d.id, give: !!d.give });
    if (act === 'announce') { const text = val('mod-announce'); if (text) this.mod_('announce', { text }); return; }
    if (act === 'map') return this.mod_('map', { map: val('mod-map') });
    if (act === 'end' && !confirm('End this match now?')) return;
    this.mod_(act, { name: d.name, reason: val('mod-reason'), minutes: Number(val('mod-mins')) || 10 });
    // account actions refresh the account view
    if (this.acct && (act === 'ban' || act === 'unban')) setTimeout(() => this.mod_('account', { name: this.acct.name }), 300);
  }

  // a big message across the top of everyone's screen
  announce(text) {
    const el = $('announce');
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    this.g.sound?.roundEnd?.();
    clearTimeout(this.annTimer);
    this.annTimer = setTimeout(() => { el.hidden = true; }, 8000);
  }

  // ---------------------------------------------------------------- banned or kicked
  banned(m) {
    $('ban-title').textContent = m.kicked ? 'You were kicked' : 'You are banned';
    $('ban-reason').textContent = m.reason || '';
    $('ban-ok').hidden = !m.kicked;
    $('banned').hidden = false;
    document.exitPointerLock?.();
  }
}
