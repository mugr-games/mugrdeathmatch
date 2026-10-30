// Page glue: menus, options, credits, input and the frame loop.
import { Game } from './game.js';
import { SUIT_COLORS, MODELS } from './avatar.js';
import { SLOTS, MAP_CREDITS, setAvailable, hasModel } from './assets.js';
import { esc } from './hud.js';
import { TouchControls, isTouch } from './touch.js';
import { Locker, setSaveToken } from './locker.js';
import { GamepadInput } from './gamepad.js';
import { Social } from './social.js';
import { Voice } from './voice.js';
import { HeistMenu } from './planning.js';
import { COSMETICS, COSMETIC, hasEmote, EMOTE } from './cosmetics.js';
import { EmoteWheel } from './emotewheel.js';
import { showTutorial, tutorialSeen } from './tutorial.js';
import { ACTIONS, setBinds, getBinds, isKey, keysFor, padFor, bindKey, bindPad, resetBinds, keyName, padName } from './binds.js';
import { DEVLOG } from './devlog.js';
import { api, pageUrl, SERVER } from './net.js';

// the emote wheel (0)
const wheel = new EmoteWheel((id) => game?.emote(id), (id) => ownsEmote(id));
// emotes you can do: the free ones, the ones you've bought, or all of them for staff and the owner
function ownsEmote(id) {
  const p = locker?.profile || {};
  return hasEmote(id, p.owned || [], !!p.role || p.name === 'watermelon');
}

// A menu theme from the shop: the orange of the menus and HUD swapped for its colour (null: the orange).
// Remembered in this browser too, so it's there straight away next time.
function menuTheme(id, remember = true) {
  const T = COSMETIC[id]?.slot === 'menu' ? COSMETIC[id] : null;
  const st = document.documentElement.style;
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const hi = (h) => '#' + rgb(h).map((v) => Math.round(v + (255 - v) * 0.25).toString(16).padStart(2, '0')).join('');
  if (!T) {
    for (const k of ['--accent', '--accent-2', '--accent-rgb', '--accent2-rgb', '--accent-hi', '--accent2-hi', '--logo-filter']) st.removeProperty(k);
  } else {
    st.setProperty('--accent', T.accent);
    st.setProperty('--accent-2', T.accent2);
    st.setProperty('--accent-rgb', rgb(T.accent).join(', '));
    st.setProperty('--accent2-rgb', rgb(T.accent2).join(', '));
    st.setProperty('--accent-hi', hi(T.accent));
    st.setProperty('--accent2-hi', hi(T.accent2));
    // the logo's orange turned to the theme's hue (or to grey for a grey theme)
    const [r, g, b] = rgb(T.accent).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    let hue = 0;
    if (mx > mn) hue = 60 * (mx === r ? ((g - b) / (mx - mn)) % 6 : mx === g ? (b - r) / (mx - mn) + 2 : (r - g) / (mx - mn) + 4);
    st.setProperty('--logo-filter', mx - mn < 0.2 ? 'grayscale(1) brightness(1.25)' : `hue-rotate(${Math.round(hue - 24)}deg) saturate(1.15)`);
  }
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', T ? T.accent : '#ffb000');
  if (remember) try { localStorage.setItem('mugr.menu', T ? id : ''); } catch {}
}
try { menuTheme(localStorage.getItem('mugr.menu'), false); } catch {}

const $ = (id) => document.getElementById(id);
const canvas = $('view');

// ------------------------------------------------------------------ settings
// school Chromebooks and other small machines start on the lightest graphics (Options can change it)
const CHROMEBOOK = /CrOS/.test(navigator.userAgent || '');
const LOW_END = CHROMEBOOK || (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 4;
const DEFAULTS = { name: '', color: Math.floor(Math.random() * 8), model: Math.floor(Math.random() * MODELS.length), sens: 3, fov: 90, volume: 0.7, music: 0.5, quality: LOW_END || isTouch() ? 'low' : 'medium' };
let settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('arena.settings') || '{}')); } catch {}
setBinds(settings.binds);
// once: a Chromebook that was saved on a heavy setting drops to low
if (CHROMEBOOK && !settings.cbAuto) { settings.cbAuto = 1; if (settings.quality === 'medium' || settings.quality === 'high') settings.quality = 'low'; }
if (!settings.name) settings.name = 'Player' + Math.floor(100 + Math.random() * 900);
const save = () => { try { localStorage.setItem('arena.settings', JSON.stringify(settings)); } catch {} };

let game = null;
let locker = null;
let account = null; // the signed-in username, or null for a guest
let pad = null;
let social = null;
let voice = null; // voice chat channels
let heistMenu = null; // the heist dialog and planning screen
let serverInfo = null;
let playing = false;
const touchMode = isTouch();
let touch = null;
if (touchMode) document.body.classList.add('touch');

// ------------------------------------------------------------------ boot: the menu background is the live map
async function boot() {
  serverInfo = await fetch(api('/api/info')).then((r) => r.json()).catch(() => null);
  // a free online server sleeps when nobody's playing: keep knocking while it wakes (about a minute)
  for (let tries = 0; !serverInfo && SERVER !== location.origin && tries < 40; tries++) {
    status('Waking up the game server… free servers sleep when nobody is playing. This takes up to a minute.');
    await new Promise((r) => setTimeout(r, 5000));
    serverInfo = await fetch(api('/api/info')).then((r) => r.json()).catch(() => null);
  }
  if (!serverInfo) { status('Can\'t reach the game server.'); return; }
  setAvailable(serverInfo.models);
  game = new Game(canvas, settings);
  game.ownsEmote = (id) => ownsEmote(id);
  game.onLockedEmote = (id) => status(`${EMOTE[id].name} is in the shop (Emotes) for ${EMOTE[id].price} coins.`);
  locker = new Locker({ settings, save, sound: game.sound, onLook: (color, model) => game.send({ t: 'color', color, model }), onTheme: menuTheme });
  game.token = locker.token;
  voice = new Voice({ game, account: () => account, signIn: () => $('btn-account').click() });
  game.setThirdPerson(!!settings.thirdPerson);
  heistMenu = new HeistMenu({
    game: () => game, play, resume, status, name: () => settings.name, leave: () => { $('btn-disconnect').click(); closeLobby(); show('menu'); },
    // the planning screen: the menu and mouse capture step aside
    pause: () => { playing = false; if (document.pointerLockElement) document.exitPointerLock(); hide('menu'); closeDialogs(); game.hud.show(false); touch?.show(false); document.body.classList.remove('playing'); },
  });
  game.hv.onPlan = (plan, was) => heistMenu.update(plan, was);
  // free roam: straight into the busiest public county
  $('btn-freeroam').onclick = () => { game.sound.start(); play({ t: 'join', room: 'FREEROAM' }, $('menu-status')); };
  social = new Social({
    game, account: () => account, join: (code) => play({ t: 'join', room: code }, $('l-err'), code),
    refresh: () => locker?.load(), maps: () => serverInfo?.maps || [], cosmetics: COSMETICS,
  });
  game.pad = pad = new GamepadInput({
    sens: () => settings.sens / 3,
    look(dyaw, dpitch) {
      const k = game.zoomed ? game.zoomScale : 1;
      game.yaw = (game.yaw + dyaw * k) % 360;
      game.pitch = Math.max(-89, Math.min(89, game.pitch + dpitch * k));
    },
    weapon: (dir) => game.cycleWeapon(dir),
    lastWeapon: () => game.pick(game.lastW),
    action: (id) => doAction(id),
    wheel: () => wheel.open,
    wheelAim: (dx, dy) => { wheel.vx = 0; wheel.vy = 0; wheel.mouse(dx, dy); },
    wheelPick: () => wheel.click(),
    wheelClose: () => wheel.toggle(false),
    menu: () => { playing = false; if (document.pointerLockElement) document.exitPointerLock(); openMenu(); },
    start: () => { if (!$('btn-resume').hidden && !document.querySelector('.dialog:not([hidden])')) resume(); },
    back: () => { if (document.querySelector('.dialog:not([hidden])')) closeDialogs(); },
  });
  locker.onChange((p) => {
    $('menu-coins').textContent = p.coins.toLocaleString();
    if (!p.unloaded) menuTheme(p.eq.menu); // (not the empty profile from before the server answers)
    account = p.name || null;
    $('acct-name').textContent = account || 'Guest';
    $('btn-account').textContent = account ? 'Account' : 'Sign in / Register';
    $('btn-mod').hidden = account !== 'watermelon'; // the server checks too
    if (account && settings.name !== account) { settings.name = account; save(); }
  });
  game.onCoins = (m) => {
    locker.coins(m.coins);
    if (m.add) coinToast(`+${m.add} coins${m.why === 'win' ? ' · your team won!' : ''}`, m.why === 'win');
  };
  // a battle pass tier reached: say what came with it
  game.onPass = (m) => {
    locker.pass(m);
    const items = m.got.filter((r) => !r.startsWith('coins:')).map((id) => COSMETIC[id]?.name).filter(Boolean);
    const coins = m.got.filter((r) => r.startsWith('coins:')).reduce((n, r) => n + +r.slice(6), 0);
    const got = [...items, coins ? `${coins} coins` : ''].filter(Boolean).join(', ');
    setTimeout(() => coinToast(`Battle pass tier ${m.tier}!${got ? ' ' + got : ''}`, true), 900);
  };
  if (touchMode) {
    game.touch = touch = new TouchControls({
      look(dx, dy) {
        const k = 0.075 * settings.sens * (game.zoomed ? game.zoomScale : 1);
        game.yaw = (game.yaw - dx * k) % 360;
        game.pitch = Math.max(-89, Math.min(89, game.pitch + dy * k));
      },
      weapon: (dir) => game.cycleWeapon(dir),
      chat: () => openChat(),
      emote: () => wheel.toggle(),
      phone: () => game.fv.togglePhone(),
      tapUI: (el) => game.fv.tap(el),
      menu: () => { playing = false; openMenu(); },
    });
  }
  game.onProgress = (t) => loading(t ? `${t}…` : '');
  try {
    loading('Loading map…');
    await game.loadMap(serverInfo.map, game.onProgress);
  } catch (e) {
    loading('');
    status(e.message);
    return;
  }
  loading('');
  const s = game.spawns[Math.floor(Math.random() * game.spawns.length)];
  game.ps.origin = s.origin.slice();
  game.ps.alive = true;
  game.yaw = s.yaw;
  $('btn-join').disabled = false;
  status(`${serverInfo.mapName} · ${serverInfo.players} playing`);
  game.onRoom = showRoom;
  // the menu background shows a public game in progress when there is one
  game.onWatch = (room) => {
    if (game.connected) return;
    status(room ? `Watching ${room.name} · ${room.map} · ${room.players + room.bots} playing` : `${serverInfo.mapName} · ${serverInfo.players} playing`);
  };
  game.watch();
  game.onSpecEnd = () => stopSpectating('The game you were watching has ended.');
  game.onDisconnect = () => {
    playing = false;
    openMenu();
    $('room-tag').hidden = true;
    $('btn-join').querySelector('span').textContent = 'Play';
    $('btn-resume').hidden = $('btn-disconnect').hidden = $('btn-invite').hidden = true;
    status('Disconnected from the server.');
  };
  // new players: how to play, buying guns and the loadout (once; again from Options → How to play)
  if (!tutorialSeen() && !/^#[A-Za-z0-9]{4}$/.test(location.hash)) setTimeout(() => showTutorial(), 600);
  // invite links: /#CODE opens straight into that game
  const invite = /^#([A-Za-z0-9]{4})$/.exec(location.hash);
  if (invite) {
    openLobby();
    $('l-code').value = invite[1].toUpperCase();
    $('l-join-code').click();
  }
}

$('btn-join').onclick = () => openLobby();

// ------------------------------------------------------------------ coins, shop, wardrobe, devlog
let toastTimer = 0;
function coinToast(text, big) {
  const el = $('coin-toast');
  el.textContent = text;
  el.style.fontSize = big ? '24px' : '';
  el.classList.add('show');
  game?.sound.pickup(big ? 'battery' : 'ammo');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), big ? 3500 : 1400);
}
$('btn-shop').onclick = () => { game?.sound.start(); locker?.open('shop'); };
$('btn-wardrobe').onclick = () => { game?.sound.start(); locker?.open('wardrobe'); };
$('btn-pass').onclick = () => { game?.sound.start(); locker?.open('pass'); };
// ------------------------------------------------------------------ accounts
let acctMode = 'login';
function setAcctMode(mode) {
  acctMode = mode;
  for (const b of document.querySelectorAll('.acct-tab')) b.classList.toggle('on', b.dataset.mode === mode);
  $('acct-go').textContent = mode === 'login' ? 'Sign in' : 'Create account';
  $('acct-pass').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('acct-hint').textContent = mode === 'login'
    ? 'Sign in to get your coins and cosmetics on any device. You stay signed in on this browser.'
    : 'Usernames are 3 to 16 letters, numbers or _. Passwords need at least 6 characters. Your coins and cosmetics come with you.';
  $('acct-err').textContent = '';
}
for (const b of document.querySelectorAll('.acct-tab')) b.onclick = () => setAcctMode(b.dataset.mode);
$('btn-account').onclick = () => {
  $('acct-out').hidden = !!account;
  $('acct-in').hidden = !account;
  $('acct-who').textContent = account || '';
  setAcctMode('login');
  show('dlg-account');
  if (!account) $('acct-user').focus();
};
$('acct-cancel').onclick = $('acct-close').onclick = () => hide('dlg-account');
$('acct-form').onsubmit = async (e) => {
  e.preventDefault();
  $('acct-err').textContent = '';
  $('acct-go').disabled = true;
  const body = { name: $('acct-user').value.trim(), password: $('acct-pass').value, token: locker?.token };
  const r = await fetch(api('/api/' + acctMode), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    .then((x) => x.json()).catch(() => ({ error: 'Can\'t reach the server.' }));
  $('acct-go').disabled = false;
  if (r.error) { $('acct-err').textContent = r.error; return; }
  // this browser now uses the account's save code; reload so everything (and any match) picks it up
  setSaveToken(r.token);
  settings.name = r.name;
  save();
  location.reload();
};
$('acct-logout').onclick = () => {
  // a fresh guest save code; the account's coins stay with the account
  try { localStorage.removeItem('arena.token'); } catch {}
  settings.name = 'Player' + Math.floor(100 + Math.random() * 900);
  save();
  location.reload();
};

$('btn-friends').onclick = () => { game?.sound.start(); social?.open(); };
$('btn-voice').onclick = () => { game?.sound.start(); voice?.open(); };

// ------------------------------------------------------------------ leaderboard and your stats
const BOARDS = [
  ['kills', 'Kills'], ['wins', 'Wins'], ['kd', 'K/D', 'Needs 20 kills'], ['streak', 'Best streak'], ['zkills', 'Zombie kills'], ['coins', 'Coins earned'],
  ['goals', 'Goals'], ['parkour', 'Parkour', 'Fastest run'],
];
let lbTab = 'kills', lbData = null;
function renderBoard() {
  $('lb-tabs').innerHTML = BOARDS.map(([k, label]) => `<button class="tab${k === lbTab ? ' on' : ''}" data-k="${k}" role="tab">${label}</button>`).join('');
  for (const b of $('lb-tabs').children) b.onclick = () => { lbTab = b.dataset.k; renderBoard(); };
  const list = lbData?.[lbTab] || [];
  const fmt = (v) => (lbTab === 'kd' ? v.toFixed(2) : lbTab === 'parkour' ? `${Math.floor(v / 60)}:${(v % 60).toFixed(2).padStart(5, '0')}` : v.toLocaleString());
  $('lb-list').innerHTML = lbData === null ? '<li class="empty">Loading…</li>' : lbData.error ? `<li class="empty">${esc(lbData.error)}</li>`
    : list.map((e, i) => `<li class="${e.n === account ? 'me' : ''}"><span class="rank">${i + 1}</span><span class="who">${esc(e.n)}</span><span class="val">${fmt(e.v)}</span></li>`).join('')
      || `<li class="empty">Nobody here yet${BOARDS.find((b) => b[0] === lbTab)[2] ? ` (${BOARDS.find((b) => b[0] === lbTab)[2].toLowerCase()})` : ''}. Play a match to get on the board!</li>`;
  const s = locker?.profile.stats || {};
  const kd = (s.kills || 0) / Math.max(1, s.deaths || 0);
  const rows = [['Kills', s.kills], ['Deaths', s.deaths], ['K/D', kd.toFixed(2)], ['Headshots', s.headshots], ['Wins', s.wins], ['Matches', s.matches], ['Best streak', s.streak], ['Zombie kills', s.zkills], ['Best zombie round', s.round], ['Coins earned', s.coins], ['Goals', s.goals], ['Parkour finishes', s.finishes]];
  $('lb-mine').innerHTML = `<h3>${account ? esc(account) : 'Your stats'}</h3><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${typeof v === 'string' ? v : (v || 0).toLocaleString()}</dd>`).join('')}</dl>`
    + (account ? '' : '<p>Sign in to get on the leaderboard. Your stats so far come with you.</p>');
}
$('btn-leaders').onclick = async () => {
  lbData = null;
  show('dlg-leaders');
  renderBoard();
  await locker?.load(); // fresh personal stats
  lbData = await fetch(api('/api/leaderboard')).then((r) => r.json()).catch(() => ({ error: 'Can\'t reach the server.' }));
  renderBoard();
};
$('lb-close').onclick = () => hide('dlg-leaders');
$('btn-mod').onclick = () => social?.openMod();
$('fr-signin').onclick = () => { social?.close(); $('btn-account').click(); };

// the menu's news card: the newest devlog entry
{
  const d = DEVLOG[0];
  if (d) {
    $('menu-news').innerHTML = `<div class="tag">WHAT'S NEW · ${esc(d.date)}</div><h3>${esc(d.title)}</h3><ul>${d.notes.slice(0, 3).map((n) => `<li>${esc(n)}</li>`).join('')}</ul><button type="button" id="news-more">Read the devlog →</button>`;
    $('news-more').onclick = () => $('btn-devlog').click();
  }
}
$('btn-devlog').onclick = () => {
  $('devlog-list').innerHTML = DEVLOG.map((d) => `<li><h3>${esc(d.title)}<small>${esc(d.date)}</small></h3><ul>${d.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul></li>`).join('');
  show('dlg-devlog');
};
$('dv-ok').onclick = () => hide('dlg-devlog');

// ------------------------------------------------------------------ lobby
let lobbyTimer = 0;
function openLobby() {
  if (!game) return;
  game.sound.start();
  $('l-err').textContent = '';
  show('dlg-lobby');
  refreshRooms();
  clearInterval(lobbyTimer);
  lobbyTimer = setInterval(refreshRooms, 2000);
}
function closeLobby() {
  clearInterval(lobbyTimer);
  hide('dlg-lobby');
}
$('l-close').onclick = closeLobby;

// lobby tabs: online games, or a private game against bots
function lobbyTab(which) {
  for (const t of ['online', 'bots']) {
    $('tab-' + t).classList.toggle('on', t === which);
    $('tab-' + t).setAttribute('aria-selected', String(t === which));
    $('pane-' + t).hidden = t !== which;
  }
  $('l-err').textContent = '';
  if (which === 'bots') setupBotsTab();
}
$('tab-online').onclick = () => lobbyTab('online');
$('tab-bots').onclick = () => lobbyTab('bots');

function setupBotsTab() {
  if ($('b-map').options.length) return;
  $('b-map').innerHTML = '<option value="rotation">Map rotation (vote at the end)</option>' + serverInfo.maps.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  $('b-map').value = 'warehouse';
  $('b-skill').innerHTML = Object.entries(serverInfo.skills || { normal: 'Normal' }).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  $('b-skill').value = 'normal';
  $('b-loadout').innerHTML = Object.entries(serverInfo.loadouts).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  $('b-loadout').value = 'default';
  $('b-count').max = serverInfo.maxBots || 15;
  const fmt = () => {
    $('b-count-v').textContent = `${$('b-count').value} bot${+$('b-count').value === 1 ? '' : 's'}`;
    $('b-frags-v').textContent = +$('b-frags').value ? `${$('b-frags').value} frags` : 'None';
  };
  $('b-count').oninput = $('b-frags').oninput = fmt;
  fmt();
}
$('b-go').onclick = () => {
  const mode = $('b-mode').value;
  const s = { name: `${settings.name} vs bots`, mode, map: $('b-map').value, bots: +$('b-count').value, botSkill: $('b-skill').value, loadout: $('b-loadout').value, fraglimit: +$('b-frags').value, timelimit: 15, private: true, items: true, maxPlayers: 16 };
  if (mode === 'tdm' && s.fraglimit) s.fraglimit = Math.max(s.fraglimit, 50);
  play({ t: 'create', settings: s }, $('l-err'));
};

async function refreshRooms() {
  const list = await fetch(api('/api/rooms')).then((r) => r.json()).catch(() => null);
  if (!list) { $('l-rooms').innerHTML = '<tr><td colspan="5" class="empty">Can’t reach the server.</td></tr>'; return; }
  $('l-rooms').innerHTML = list.length ? list.map((r) => {
    const goal = r.mode === 'ctf' ? `capture the flag, ${r.caplimit} caps` : r.mode === 'soccer' ? `soccer, first to ${r.caplimit} goals`
      : r.mode === 'mugrball' ? `mugrball, first to ${r.caplimit} points` : r.mode === 'parkour' ? 'parkour: race the course' : r.mode === 'infection' ? 'infection' : r.mode === 'zombies' ? 'zombies: survive the rounds' : r.mode === 'tdm' ? `team deathmatch, ${r.fraglimit ? r.fraglimit + ' team frags' : 'no frag limit'}` : r.fraglimit ? `${r.fraglimit} frags` : 'no frag limit';
    const rules = [goal, r.mode === 'zombies' ? 'co-op' : r.timelimit ? `${r.timelimit} min${r.mode === 'infection' ? ' rounds' : ''}` : 'no time limit'];
    if (r.bots) rules.push(`${r.bots} bot${r.bots === 1 ? '' : 's'} (${r.botSkill.toLowerCase()})`);
    if (r.gravity !== 1) rules.push(`gravity ${r.gravity}×`);
    if (r.speed !== 1) rules.push(`speed ${r.speed}×`);
    if (r.jump !== 1) rules.push(`jump ${r.jump}×`);
    if (!r.items) rules.push('no pickups');
    const full = r.players >= r.max;
    return `<tr class="${full ? 'full' : ''}"><td>${r.locked ? '🔒 ' : ''}${esc(r.name)}<small>${esc(rules.join(' · '))}</small></td>
      <td>${esc(r.map)}${r.rotation ? '<small>map rotation</small>' : ''}</td><td>${r.players}/${r.max}</td><td>${esc(r.loadout)}</td>
      <td class="room-go"><button class="btn" data-room="${r.id}" data-locked="${r.locked ? 1 : 0}" data-name="${esc(r.name)}" ${full ? 'disabled' : ''}>${full ? 'Full' : 'Join'}</button>${r.mode === 'freeplay' ? '' : `<button class="btn" data-watch="${r.id}" data-locked="${r.locked ? 1 : 0}" data-name="${esc(r.name)}" title="Watch without playing">Watch</button>`}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="empty">No public games right now. Create one.</td></tr>';
}
$('l-rooms').addEventListener('click', (e) => {
  const w = e.target.closest('button[data-watch]');
  if (w) return w.dataset.locked === '1' ? askPassword(w.dataset.watch, w.dataset.name, true) : spectate(w.dataset.watch, $('l-err'));
  const b = e.target.closest('button[data-room]');
  if (!b) return;
  if (b.dataset.locked === '1') askPassword(b.dataset.room, b.dataset.name);
  else play({ t: 'join', room: b.dataset.room }, $('l-err'));
});
$('l-join-code').onclick = () => {
  const code = $('l-code').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) { $('l-err').textContent = 'Room codes are 4 letters and numbers.'; return; }
  play({ t: 'join', room: code }, $('l-err'), code);
};
$('l-watch-code').onclick = () => {
  const code = $('l-code').value.trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(code)) { $('l-err').textContent = 'Room codes are 4 letters and numbers.'; return; }
  spectate(code, $('l-err'));
};
$('l-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('l-join-code').click(); });

let passTarget = null, passWatch = false;
function askPassword(room, name, watch = false) {
  passTarget = room;
  passWatch = watch;
  $('p-what').textContent = `“${name}” needs a password.`;
  $('p-err').textContent = '';
  $('p-pass').value = '';
  show('dlg-pass');
  $('p-pass').focus();
}
$('p-cancel').onclick = () => hide('dlg-pass');
$('p-go').onclick = () => (passWatch ? spectate(passTarget, $('p-err'), $('p-pass').value) : play({ t: 'join', room: passTarget, password: $('p-pass').value }, $('p-err')));
$('p-pass').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('p-go').click(); });

// create game: fields mirror the server's room settings
const CREATE_SLIDERS = [
  ['c-max', 'maxPlayers', (v) => `${v} players`], ['c-frags', 'fraglimit', (v) => (+v ? `${v} frags` : 'None')],
  ['c-time', 'timelimit', (v) => (+v ? `${v} min` : 'None')], ['c-grav', 'gravity', (v) => `${(+v).toFixed(2)}×`],
  ['c-speed', 'speed', (v) => `${(+v).toFixed(2)}×`], ['c-jump', 'jump', (v) => `${(+v).toFixed(2)}×`],
];
$('l-create').onclick = () => {
  const d = serverInfo.defaults;
  $('c-name').value = `${settings.name}'s game`;
  $('c-mode').innerHTML = Object.entries(serverInfo.modes || { dm: 'Deathmatch' }).filter(([k]) => k !== 'heist').map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  $('c-mode').value = 'dm';
  $('c-mode').onchange = () => {
    const m = $('c-mode').value;
    $('c-caps-row').hidden = m !== 'ctf';
    for (const id of ['c-frags', 'c-time', 'c-loadout', 'c-items']) $(id).closest('.row').hidden = m === 'zombies';
    if (m === 'zombies' && $('c-map').value === 'rotation') $('c-map').value = 'city';
    // soccer, mugrball and parkour have their own map
    $('c-map').disabled = m === 'soccer' || m === 'parkour' || m === 'mugrball';
    $('c-caps-row').hidden = m !== 'ctf' && m !== 'soccer' && m !== 'mugrball';
    $('c-caps').value = { ctf: 3, soccer: 5, mugrball: 10 }[m] || $('c-caps').value;
    $('c-caps').oninput();
  };
  $('c-caps-row').hidden = true;
  $('c-caps').value = 3;
  $('c-caps-v').textContent = '3 captures';
  $('c-caps').oninput = () => {
    const n = +$('c-caps').value, unit = { soccer: 'goal', mugrball: 'point' }[$('c-mode').value] || 'capture';
    $('c-caps-v').textContent = `${n} ${unit}${n === 1 ? '' : 's'}`;
  };
  $('c-map').innerHTML = '<option value="rotation">Map rotation (vote at the end)</option>' + serverInfo.maps.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
  $('c-map').value = 'rotation';
  $('c-loadout').innerHTML = Object.entries(serverInfo.loadouts).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
  $('c-loadout').value = d.loadout;
  for (const [id, key, fmt] of CREATE_SLIDERS) {
    $(id).value = key === 'maxPlayers' ? 8 : d[key];
    $(id + '-v').textContent = fmt($(id).value);
    $(id).oninput = () => ($(id + '-v').textContent = fmt($(id).value));
  }
  $('c-items').checked = true;
  for (const id of ['c-frags', 'c-time', 'c-loadout', 'c-items']) $(id).closest('.row').hidden = false;
  $('c-private').checked = false;
  $('c-pass').value = '';
  $('c-err').textContent = '';
  show('dlg-create');
};
$('c-cancel').onclick = () => hide('dlg-create');
$('c-go').onclick = () => {
  const s = { name: $('c-name').value, mode: $('c-mode').value, caplimit: +$('c-caps').value, map: $('c-map').value, loadout: $('c-loadout').value, items: $('c-items').checked, private: $('c-private').checked, password: $('c-pass').value };
  for (const [id, key] of CREATE_SLIDERS) s[key] = +$(id).value;
  play({ t: 'create', settings: s }, $('c-err'));
};

async function play(action, errEl, code) {
  errEl.textContent = '';
  loading('Joining…');
  try {
    if (game.connected) game.leave();
    await game.connect(settings.name, settings.color, action);
  } catch (e) {
    loading('');
    // a code for a password-protected game: ask for the password, then retry with it
    if (code && /password/i.test(e.message)) return askPassword(code, `Room ${code}`);
    errEl.textContent = e.message;
    return;
  }
  loading('');
  closeLobby();
  hide('dlg-create');
  hide('dlg-pass');
  $('btn-join').querySelector('span').textContent = 'Find another game';
  $('btn-resume').hidden = $('btn-disconnect').hidden = $('btn-invite').hidden = false;
  resume();
}

// ------------------------------------------------------------------ spectating: watch a game without playing in it
async function spectate(room, errEl, password) {
  errEl.textContent = '';
  if (!game) return;
  loading('Joining as a spectator…');
  try {
    if (game.connected) game.leave();
    await game.spectate(room, password);
  } catch (e) {
    loading('');
    if (/password/i.test(e.message) && password === undefined) return askPassword(room, `Room ${room}`, true);
    errEl.textContent = e.message;
    game.watch();
    return;
  }
  loading('');
  closeLobby();
  hide('dlg-pass');
  closeDialogs();
  hide('menu');
  $('room-tag').hidden = true;
  $('btn-resume').hidden = $('btn-disconnect').hidden = $('btn-invite').hidden = true;
  $('btn-join').querySelector('span').textContent = 'Play';
}
function stopSpectating(text) {
  game.stopSpectating();
  game.watch();
  openMenu();
  openLobby();
  if (text) $('l-err').textContent = text;
}

function showRoom(room) {
  const tag = $('room-tag');
  tag.hidden = false;
  tag.textContent = room.private ? `${room.name} · private · invite code ${room.code} · ${pageUrl()}#${room.code}` : `${room.name} · code ${room.code}`;
}

$('btn-resume').onclick = resume;
$('btn-invite').onclick = async () => {
  if (!game?.room) return;
  const link = `${pageUrl()}#${game.room.code}`;
  try {
    await navigator.clipboard.writeText(link);
    status(`Invite link copied: ${link}`);
  } catch {
    status(`Invite link: ${link}`);
  }
};
$('btn-disconnect').onclick = () => {
  game.leave();
  game.watch();
  $('room-tag').hidden = true;
  $('btn-join').querySelector('span').textContent = 'Play';
  $('btn-resume').hidden = $('btn-disconnect').hidden = $('btn-invite').hidden = true;
  game.hud.show(false);
  openLobby();
};

// Raw mouse input avoids OS acceleration and the large bogus jumps Chrome can report under pointer lock;
// browsers without it fall back to normal pointer lock.
function lockPointer() {
  if (touchMode) {
    // phones: no mouse to capture; go full screen and sideways instead (where the browser allows it)
    const d = document.documentElement;
    if (!document.fullscreenElement && d.requestFullscreen) d.requestFullscreen({ navigationUI: 'hide' }).then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
    return;
  }
  const p = canvas.requestPointerLock?.({ unadjustedMovement: true });
  if (p && p.catch) p.catch(() => canvas.requestPointerLock?.()?.catch?.(() => {}));
}

function resume() {
  // a heist crew that's still planning goes back to the planning screen
  if (game?.connected && game.hv?.planning()) { heistMenu.showPlan(); return; }
  hide('menu');
  closeDialogs();
  game.hud.show(true);
  playing = true;
  touch?.show(true);
  document.body.classList.add('playing');
  lockPointer();
}

function openMenu() {
  wheel.toggle(false);
  show('menu');
  game?.hud.show(false);
  $('scope').hidden = true;
  game?.keys.clear();
  if (game) game.mouseButtons = 0;
  touch?.show(false);
  document.body.classList.remove('playing');
}

// ------------------------------------------------------------------ credits
$('btn-credits').onclick = () => {
  const rows = Object.entries(SLOTS).filter(([, d]) => d.credit).map(([slot, d]) => [d.credit, hasModel(slot)]);
  const maps = Object.values(MAP_CREDITS).map((c) => [c, true]);
  $('credit-list').innerHTML = [...maps, ...rows].map(([[title, author, url, note], have]) =>
    `<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(title)}</a> by ${esc(author)}${note ? `<small>${esc(note)}</small>` : ''}${have ? '' : '<small>Not added to this server yet</small>'}</li>`).join('');
  show('dlg-credits');
};
$('cr-ok').onclick = () => hide('dlg-credits');

// ------------------------------------------------------------------ options
function fillOptions() {
  $('o-name').value = settings.name;
  $('o-name').disabled = !!account; // signed in: you play under your account name
  const sel = $('o-color');
  sel.innerHTML = SUIT_COLORS.map((c, i) => `<option value="${i}">${c.name}</option>`).join('');
  sel.value = String(settings.color);
  const ms = $('o-model');
  ms.innerHTML = MODELS.map((m, i) => `<option value="${i}">${m.name}: ${m.blurb}</option>`).join('');
  ms.value = String(settings.model | 0);
  for (const [id, key, fmt] of [['o-sens', 'sens', (v) => v.toFixed(1)], ['o-fov', 'fov', (v) => v + '°'], ['o-vol', 'volume', (v) => Math.round(v * 100) + '%'], ['o-music', 'music', (v) => Math.round(v * 100) + '%']]) {
    $(id).value = settings[key];
    $(id + '-v').textContent = fmt(+settings[key]);
    $(id).oninput = () => { settings[key] = +$(id).value; $(id + '-v').textContent = fmt(settings[key]); applyLive(); };
  }
  $('o-quality').value = settings.quality;
}

function applyLive() {
  if (!game) return;
  game.sound.setVolume(settings.volume);
  game.sound.lobby(!playing && !game.spec, settings.music ?? 0.5);
  game.resize();
}

$('btn-options').onclick = () => { fillOptions(); show('dlg-options'); };
$('o-ok').onclick = () => {
  const name = $('o-name').value.trim().slice(0, 24);
  if (name && !account) settings.name = name;
  const color = +$('o-color').value, model = +$('o-model').value;
  if (color !== settings.color || model !== settings.model) { settings.color = color; settings.model = model; game?.send({ t: 'color', color, model }); }
  const quality = $('o-quality').value, reload = quality !== settings.quality;
  settings.quality = quality;
  save();
  // graphics settings are fixed when the renderer starts; outside a match, apply them at once
  if (reload && !game?.connected) return location.reload();
  applyLive();
  hide('dlg-options');
};

// ------------------------------------------------------------------ input
let skipMouse = 0;
document.addEventListener('pointerlockchange', () => {
  // the first events after the lock engages often carry a huge leftover movement
  if (document.pointerLockElement === canvas) skipMouse = 2;
  if (document.pointerLockElement !== canvas && playing && !chatOpen) {
    playing = false;
    openMenu();
  }
});
canvas.addEventListener('click', () => { if (playing && document.pointerLockElement !== canvas) lockPointer(); });

document.addEventListener('mousemove', (e) => {
  if (!playing || !game || document.pointerLockElement !== canvas) return;
  if (skipMouse > 0) { skipMouse--; return; }
  // drop impossible single-event jumps (a real flick is spread over many small events)
  if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
  if (wheel.open) return wheel.mouse(e.movementX, e.movementY);
  if (game.fv.mapMouse(e.movementX, e.movementY)) return; // the big map's cursor
  const k = 0.022 * settings.sens * (game.zoomed ? game.zoomScale : 1);
  game.yaw = (game.yaw - e.movementX * k) % 360;
  game.pitch = Math.max(-89, Math.min(89, game.pitch + e.movementY * k));
});
document.addEventListener('mousedown', (e) => {
  if (!playing || !game) return;
  if (wheel.open && document.pointerLockElement === canvas) { if (e.button === 0) wheel.click(); else wheel.toggle(false); return; }
  if (game.fv.click(e.button)) return; // the phone and the gun shop take clicks
  game.mouseButtons |= e.button === 0 ? 1 : e.button === 2 ? 2 : 0;
});
document.addEventListener('mouseup', (e) => { if (game) game.mouseButtons &= ~(e.button === 0 ? 1 : e.button === 2 ? 2 : 0); });
document.addEventListener('contextmenu', (e) => e.preventDefault());
// spectating: click for the next player, right click for the one before, Space to look through their eyes, Esc to leave
const spectating = () => game?.spec && !playing && $('menu').hidden;
canvas.addEventListener('mousedown', (e) => { if (spectating()) game.specNext(e.button === 2 ? -1 : 1); });
document.addEventListener('keydown', (e) => {
  if (!spectating() || e.target.closest?.('input, textarea, select')) return;
  if (e.code === 'ArrowRight') game.specNext(1);
  else if (e.code === 'ArrowLeft') game.specNext(-1);
  else if (e.code === 'Space') { e.preventDefault(); game.spec.mode = game.spec.mode === 'eyes' ? 'chase' : 'eyes'; game.watchEye = null; }
  else if (e.code === 'Escape') stopSpectating();
});
document.addEventListener('wheel', (e) => { if (playing && game && !game.fv.bigMapWheel(e.deltaY) && !game.fv.wheel(e.deltaY)) game.cycleWeapon(e.deltaY > 0 ? 1 : -1); }, { passive: true });

let chatOpen = false;
function openChat() {
  chatOpen = true;
  game.typing = true;
  $('chatbox').hidden = false;
  $('chatinput').value = '';
  $('chatinput').focus();
  document.exitPointerLock?.();
}
function closeChat(send) {
  if (send) game.chat($('chatinput').value);
  chatOpen = false;
  game.typing = false;
  $('chatbox').hidden = true;
  lockPointer();
}
$('chatinput').addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Enter') closeChat(true);
  if (e.key === 'Escape') closeChat(false);
});

document.addEventListener('keydown', (e) => {
  if (!game || !playing || chatOpen) return;
  if (e.code === 'Tab' || e.code === 'Space' || e.code === 'AltLeft') e.preventDefault();
  game.keys.add(e.code);
  // the emote wheel (0 unless changed); while it's open the number keys pick an emote
  if (!e.repeat && isKey(e.code, 'emote') && !game.fv.phoneOpen()) { wheel.toggle(); return; }
  if (wheel.open) {
    const n = /^(Digit|Numpad)([1-9])$/.exec(e.code);
    if (n) { wheel.key(+n[2]); return; }
    if (e.code === 'Escape') wheel.toggle(false);
  }
  // free roam: the phone (P, or the up arrow), which then takes the arrows, Enter and Backspace
  if (game.fv.active) {
    if (!e.repeat && (isKey(e.code, 'phone') || (e.code === 'ArrowUp' && !game.fv.phoneOpen() && !game.fv.shop))) { game.fv.togglePhone(); return; }
    if (game.fv.key(e.code)) { e.preventDefault(); return; }
    if (!e.repeat && isKey(e.code, 'map')) { game.fv.toggleBigMap(); return; }
  }
  if (e.repeat) return;
  // during the end-of-match vote the number keys pick a map instead of a weapon
  if (/^Digit[1-5]$/.test(e.code)) numberKey(+e.code.slice(5));
  for (const id of ['lastweapon', 'third', 'chat']) if (isKey(e.code, id)) { e.preventDefault(); doAction(id); }
});
// the one-press actions, from a key or a controller button
function doAction(id) {
  if (!game || !playing) return;
  const key = keyName(keysFor(id)[0]) || padName(padFor(id));
  if (id === 'emote') wheel.toggle();
  else if (id === 'phone' && game.fv.active) game.fv.togglePhone();
  else if (id === 'map' && game.fv.active) game.fv.toggleBigMap();
  else if (id === 'lastweapon') game.pick(game.lastW);
  else if (id === 'chat') openChat();
  else if (id === 'third') {
    // in a car it switches the car camera; on foot, third person
    if (game.fv.active && (game.ps.car || game.ps.seat)) { const first = game.fv.toggleView(); save(); status(first ? `First person driving (${key} for the chase camera)` : `Chase camera (${key} for first person)`); return; }
    settings.thirdPerson = !game.thirdPerson; game.setThirdPerson(settings.thirdPerson); save(); status(game.thirdPerson ? `Third person (${key} to switch back)` : 'First person');
  }
}

// ------------------------------------------------------------------ Options → Controls
let capture = null; // { id, kind: 'key' | 'pad' } while waiting for a key or button
function renderBinds() {
  $('b-list').innerHTML = ACTIONS.map((a) => {
    const k = capture?.id === a.id && capture.kind === 'key' ? 'Press a key…' : keysFor(a.id).map(keyName).join(' / ') || (a.mouse ? '' : '—');
    const p = capture?.id === a.id && capture.kind === 'pad' ? 'Press a button…' : padName(padFor(a.id)) || '—';
    return `<tr><td>${a.name}</td><td><button type="button" class="btn bkey" data-id="${a.id}" data-kind="key">${k}${a.mouse ? `<small>${k && k !== '—' ? ' · ' : ''}${a.mouse}</small>` : ''}</button></td><td><button type="button" class="btn bkey" data-id="${a.id}" data-kind="pad">${p}</button></td></tr>`;
  }).join('');
  for (const b of $('b-list').querySelectorAll('.bkey')) b.onclick = () => { capture = { id: b.dataset.id, kind: b.dataset.kind }; renderBinds(); if (capture.kind === 'pad') waitPad(); };
}
function saveBinds() { settings.binds = getBinds(); save(); capture = null; renderBinds(); }
// keyboard: the next key pressed (Escape cancels, Backspace or Delete clears)
document.addEventListener('keydown', (e) => {
  if (!capture || capture.kind !== 'key') return;
  e.preventDefault();
  e.stopImmediatePropagation();
  if (e.code === 'Escape') { capture = null; renderBinds(); return; }
  bindKey(capture.id, e.code === 'Backspace' || e.code === 'Delete' ? null : e.code);
  saveBinds();
}, true);
// controller: the next button pressed
function waitPad() {
  const pads = () => (navigator.getGamepads ? [...navigator.getGamepads()] : []).filter(Boolean);
  const was = new Set();
  for (const p of pads()) p.buttons.forEach((b, i) => { if (b.pressed) was.add(i); });
  const t0 = performance.now();
  const look = () => {
    if (!capture || capture.kind !== 'pad') return;
    for (const p of pads()) for (let i = 0; i < p.buttons.length; i++) {
      if (p.buttons[i].pressed && !was.has(i)) { bindPad(capture.id, i); saveBinds(); return; }
      if (!p.buttons[i].pressed) was.delete(i);
    }
    if (performance.now() - t0 > 8000) { capture = null; renderBinds(); status('No controller button pressed.'); return; }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
}
$('o-controls').onclick = () => { hide('dlg-options'); capture = null; renderBinds(); show('dlg-binds'); };
$('b-reset').onclick = () => { resetBinds(); saveBinds(); };
$('o-tutorial').onclick = () => { hide('dlg-options'); showTutorial(); };
$('b-ok').onclick = () => { capture = null; hide('dlg-binds'); show('dlg-options'); };
document.addEventListener('keyup', (e) => game?.keys.delete(e.code));
function numberKey(n) {
  if (game.voting) game.castVote(n - 1);
  else if (game.mode === 'tdm' && game.pickLeft && n <= 3) game.pickTeam(n - 1);
  else game.selectSlot(n - 1);
}
// phones: tap a line of the team pick or map vote instead of pressing its number
document.addEventListener('pointerdown', (e) => {
  const li = e.target.closest?.('.pickpanel li');
  if (!li || !game || !playing) return;
  e.preventDefault();
  numberKey([...li.parentNode.children].indexOf(li) + 1);
});
addEventListener('gamepadconnected', (e) => status(`Controller connected: ${e.gamepad.id.replace(/\s*\(.*$/, '')}. D-pad to move, A to choose.`));
addEventListener('blur', () => { game?.keys.clear(); if (game) game.mouseButtons = 0; });

// ------------------------------------------------------------------ loop
let last = performance.now(), fpsAcc = 0, fpsN = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!game || !game.world) return;
  if (!game.connected) {
    // menu: slow look-around from a spawn point
    game.yaw += dt * 3;
    game.pitch = 5;
  }
  pad?.poll(dt, playing && !chatOpen && !!game.connected);
  // touch: the phone button only in free roam; the other buttons step aside while the phone or a shop is up
  if (touch) {
    touch.el.classList.toggle('fp', !!game.fv.active);
    touch.el.classList.toggle('ui', !!(game.fv.phoneOpen() || game.fv.shop));
  }
  game.frame(dt, now / 1000);
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) {
    $('netinfo').textContent = `${Math.round(fpsN / fpsAcc)} fps${game.ping ? ' · ' + Math.round(game.ping) + ' ms' : ''}`;
    fpsAcc = 0; fpsN = 0;
  }
}
requestAnimationFrame(loop);

// ------------------------------------------------------------------ helpers
// lobby music: on in the menus, off while you play. Browsers only allow sound after a click or key press.
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => game?.sound.start(), { once: true, capture: true });
setInterval(() => game?.sound.lobby(!playing && !game.spec, settings.music ?? 0.5), 300);

function show(id) { $(id).hidden = false; }
function hide(id) { $(id).hidden = true; }
function closeDialogs() { hide('dlg-binds'); if ($('dlg-tutorial')) hide('dlg-tutorial'); capture = null; hide('dlg-heist'); hide('dlg-leaders'); hide('dlg-options'); hide('dlg-credits'); hide('dlg-devlog'); hide('dlg-account'); hide('dlg-friends'); hide('dlg-mod'); locker?.close(); hide('dlg-create'); hide('dlg-pass'); closeLobby(); }
function status(t) { $('menu-status').textContent = t; }
function loading(t) { $('loading').hidden = !t; $('loading-text').textContent = t; }

boot();
window.__game = () => game;
