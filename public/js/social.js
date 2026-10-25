// Friends, direct messages, notices and the owner's moderation panel. Everything travels over the game's
// socket, so it works from the menu and in a match. The server checks every request; this is just the UI.
import { esc } from './hud.js';

const $ = (id) => document.getElementById(id);
const time = (at) => new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// opts: { game, account() -> signed-in name or null, join(code), signIn() }
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
    $('mod-reason').addEventListener('keydown', (e) => e.stopPropagation());
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
    else if (m.t === 'mod') this.renderMod(m);
    else if (m.t === 'banned') this.banned(m);
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

  // ---------------------------------------------------------------- owner moderation
  openMod() {
    $('dlg-mod').hidden = false;
    this.send({ t: 'mod', action: 'list' });
  }

  renderMod(m) {
    const reason = () => $('mod-reason').value.trim();
    const st = m.storage || {};
    $('mod-storage').textContent = st.kind === 'file' ? 'Saving: files on this server (lost if the host wipes them).'
      : st.ok ? 'Saving: online database, working.' : `Saving is NOT working: ${st.error || 'checking…'}`;
    $('mod-storage').classList.toggle('err', st.kind === 'redis' && !st.ok);
    $('mod-players').innerHTML = m.players.length ? m.players.map((p) => `<li><span class="fr-who"><b>${esc(p.name)}</b><small>${p.account ? 'account' : 'guest'} · ${p.room ? esc(p.room) : 'in the menus'}</small></span>`
      + (p.account === 'watermelon' ? '<small>you</small>' : `<button type="button" class="btn" data-act="kick" data-name="${esc(p.name)}">Kick</button><button type="button" class="btn danger" data-act="ban" data-name="${esc(p.name)}">Ban</button>`) + '</li>').join('')
      : '<li class="empty">Nobody else is online.</li>';
    $('mod-bans').innerHTML = m.bans.length ? m.bans.map((b) => `<li><span class="fr-who"><b>${esc(b.name)}</b><small>${esc(b.reason || '')} · ${new Date(b.at).toLocaleDateString()}</small></span><button type="button" class="btn" data-act="unban" data-name="${esc(b.name)}">Unban</button></li>`).join('')
      : '<li class="empty">Nobody is banned.</li>';
    for (const b of document.querySelectorAll('#dlg-mod button[data-act]')) {
      b.onclick = () => {
        const { act, name } = b.dataset;
        if (act === 'ban' && !confirm(`Ban ${name}? They won't be able to play from this account, browser or internet connection.`)) return;
        this.send({ t: 'mod', action: act, name, reason: reason() });
      };
    }
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
