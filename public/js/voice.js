// Voice chat, like Call of Duty's. Game chat: in a match you're put in its voice channel automatically (your
// team, or everyone in free-for-all). Party chat: the voice servers in the Voice tab (one per game mode, a
// lobby, and any players make); being in one overrides game chat. Audio goes straight between browsers
// (WebRTC); the server only passes the call setup along. Open mic, push to talk (hold V) or mic off; a
// volume for each person; a speaker over the heads of people talking and a list of talkers on the HUD.
import * as THREE from 'three';
import { esc } from './hud.js';

const $ = (id) => document.getElementById(id);
// public address finders, so two browsers behind home routers can find each other
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const PTT_KEY = 'KeyV';
const SPEAKING = 0.02; // loudness (RMS) that counts as talking
const TEAM_COLOR = { red: '#ff6a5a', blue: '#62a8ff', zombie: '#8fdc5a' };

function load() {
  try { return JSON.parse(localStorage.getItem('voice') || '{}'); } catch { return {}; }
}

// the speaker drawn over a talking player's head
let speakerTex = null;
function speakerSprite() {
  if (!speakerTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(0,0,0,.55)';
    g.beginPath(); g.arc(32, 32, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(14, 26); g.lineTo(24, 26); g.lineTo(36, 15); g.lineTo(36, 49); g.lineTo(24, 38); g.lineTo(14, 38); g.closePath(); g.fill();
    g.strokeStyle = '#6dff95'; g.lineWidth = 4; g.lineCap = 'round';
    for (const r of [8, 15]) { g.beginPath(); g.arc(38, 32, r, -0.8, 0.8); g.stroke(); }
    speakerTex = new THREE.CanvasTexture(c);
    speakerTex.colorSpace = THREE.SRGBColorSpace;
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: speakerTex, depthTest: false, transparent: true }));
  s.scale.set(14, 14, 1);
  s.renderOrder = 10;
  return s;
}

// opts: { game, account() -> signed-in name or null, signIn() }
export class Voice {
  constructor(opts) {
    this.opts = opts;
    this.g = opts.game;
    this.g.onVoice = (m) => this.receive(m);
    this.g.onVoiceFrame = () => this.frame();
    this.channels = [];
    this.max = 8;
    this.ch = null; // { id, name, game } of the channel you're in
    this.me = 0;
    this.listen = false; // listen only (guests, muted players, or no microphone)
    this.peers = new Map(); // voice id -> { name, pid, muted, listen, pc, audio, analyser, queue, speaking, icon }
    this.stream = null; // your microphone
    this.muted = false;
    this.deaf = false;
    this.pttDown = false;
    this.wantGame = null; // the match + team we last asked game chat for
    this.prefs = { gameChat: true, mic: 'open', volumes: {}, ...load() };
    if (this.prefs.ptt !== undefined) { this.prefs.mic = this.prefs.ptt ? 'ptt' : 'open'; delete this.prefs.ptt; }

    $('vc-close').onclick = () => this.close();
    $('vc-signin').onclick = () => { this.close(); this.opts.signIn(); };
    $('vc-create').onsubmit = (e) => {
      e.preventDefault();
      const name = $('vc-name').value.trim();
      if (name) this.join(null, name);
      $('vc-name').value = '';
    };
    $('vc-name').addEventListener('keydown', (e) => e.stopPropagation()); // typing isn't movement
    $('vc-mute').onclick = () => this.setMuted(!this.muted);
    $('vc-deafen').onclick = () => this.setDeaf(!this.deaf);
    $('vc-leave').onclick = () => this.leave();
    $('vc-game').checked = !!this.prefs.gameChat;
    $('vc-game').onchange = () => { this.prefs.gameChat = $('vc-game').checked; this.save(); this.wantGame = null; this.syncGame(); };
    $('vc-mic').value = this.prefs.mic;
    $('vc-mic').onchange = () => { this.prefs.mic = $('vc-mic').value; this.save(); this.micChanged(); };
    // push to talk works in the menu and in a match, but not while typing
    document.addEventListener('keydown', (e) => {
      if (e.code !== PTT_KEY || e.repeat || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
      this.pttDown = true;
      this.applyMic();
    });
    document.addEventListener('keyup', (e) => { if (e.code === PTT_KEY) { this.pttDown = false; this.applyMic(); } });
    window.addEventListener('blur', () => { this.pttDown = false; this.applyMic(); });
    setInterval(() => { this.syncGame(); this.meter(); }, 120);
  }

  save() {
    try { localStorage.setItem('voice', JSON.stringify(this.prefs)); } catch { /* private mode */ }
  }

  send(k, extra = {}) {
    this.g.socket(() => this.g.send({ t: 'voice', k, ...extra }));
  }

  open() {
    $('dlg-voice').hidden = false;
    const signedIn = !!this.opts.account();
    $('vc-guest').hidden = signedIn;
    $('vc-create').hidden = !signedIn;
    this.send('list');
    this.render();
  }

  close() {
    $('dlg-voice').hidden = true;
    this.send('unlist');
  }

  error(text) {
    $('vc-err').textContent = text;
    clearTimeout(this.errTimer);
    this.errTimer = setTimeout(() => ($('vc-err').textContent = ''), 6000);
  }

  // the microphone, if you're signed in and haven't turned it off. False: listen only.
  async mic() {
    if (this.stream) return true;
    if (!this.opts.account() || this.prefs.mic === 'off') return false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      if (!this.micDenied) this.error('No microphone: you can listen but not talk. Allow the microphone in the browser (the icon in the address bar) to talk.');
      this.micDenied = true;
      return false;
    }
    this.audioCtx();
    this.myAnalyser = this.analyse(this.stream);
    this.applyMic();
    return true;
  }

  audioCtx() {
    this.ctx = this.ctx || new AudioContext();
    this.ctx.resume?.();
  }

  // party chat: join a voice server by id, or make a new one with this name
  async join(id, name) {
    if (!this.opts.account()) return this.error('Sign in to use party chat.');
    this.audioCtx();
    if (!(await this.mic()) && this.prefs.mic !== 'off') return;
    if (name) this.send('create', { name });
    else this.send('join', { ch: id });
  }

  // leave party chat (game chat picks up again in a match)
  leave() {
    if (this.ch?.game) { this.prefs.gameChat = false; $('vc-game').checked = false; this.save(); this.send('game-leave'); }
    else this.send('leave');
    this.hangAll();
    this.wantGame = null;
  }

  hangAll() {
    for (const id of [...this.peers.keys()]) this.hang(id);
    this.ch = null;
    this.me = 0;
    // let go of the microphone so the browser's "recording" light goes off
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.myAnalyser = null;
    this.render();
  }

  // game chat follows you: into a match, onto your team, out again
  syncGame() {
    const g = this.g;
    const team = g.connected ? g.info.get(g.myId)?.team || '' : null;
    const key = g.connected && this.prefs.gameChat ? `${g.room?.code}|${g.myId}|${team}` : null;
    if (key === this.wantGame) return;
    this.wantGame = key;
    if (this.ch && !this.ch.game) return; // party chat wins
    if (!key) { if (this.ch?.game) { this.send('game-leave'); this.hangAll(); } return; }
    this.audioCtx();
    this.mic().then(() => this.send('game'));
  }

  micChanged() {
    if (this.prefs.mic === 'off') { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; this.myAnalyser = null; }
    // calls are set up with or without a microphone: join again to switch
    const ch = this.ch;
    if (ch && (this.prefs.mic === 'off') !== this.listen) {
      if (ch.game) { this.send('game-leave'); this.hangAll(); this.wantGame = null; } else { this.send('leave'); this.hangAll(); this.join(ch.id); }
    }
    this.applyMic();
    this.render();
  }

  setMuted(m) {
    this.muted = m;
    this.applyMic();
    if (this.ch) this.send('mute', { muted: m });
    this.render();
  }

  setDeaf(d) {
    this.deaf = d;
    for (const p of this.peers.values()) this.volume(p);
    this.render();
  }

  // the microphone is live unless muted, off, or push to talk is on and V isn't held
  applyMic() {
    const live = !this.muted && !this.listen && this.prefs.mic !== 'off' && (this.prefs.mic !== 'ptt' || this.pttDown);
    this.stream?.getAudioTracks().forEach((t) => { t.enabled = live; });
    this.live = live && !!this.stream;
  }

  // someone was blocked or unblocked
  refreshBlocks() {
    for (const p of this.peers.values()) this.volume(p);
  }

  volume(p) {
    if (!p.audio) return;
    // nobody hears a listen-only member, whatever their browser sends
    p.audio.muted = this.deaf || p.listen || !!this.opts.blocked?.(p.name); // and nobody you've blocked
    p.audio.volume = this.prefs.volumes[p.name] ?? 1;
  }

  // ---------------------------------------------------------------- messages from the server
  receive(m) {
    if (m.k === 'list') { this.channels = m.channels; this.max = m.max; this.render(); }
    else if (m.k === 'error') this.error(m.text);
    else if (m.k === 'joined') {
      for (const id of [...this.peers.keys()]) this.hang(id);
      this.ch = { id: m.ch, name: m.name, game: m.game };
      this.me = m.you;
      this.muted = false;
      this.listen = m.listen || !this.stream;
      this.applyMic();
      for (const p of m.members) this.call(p, true);
      if (!m.game) this.g.sound?.ui(1100);
      this.render();
    } else if (m.k === 'member-join') { this.peer(m.m); this.render(); }
    else if (m.k === 'member-leave') { this.hang(m.id); this.render(); }
    else if (m.k === 'member') { const p = this.peers.get(m.m.id); if (p) { p.muted = m.m.muted; } this.render(); }
    else if (m.k === 'signal') this.signal(m.from, m.data);
    else if (m.k === 'left') {
      const wasGame = m.game;
      this.hangAll();
      if (m.why) this.error(m.why);
      if (wasGame) this.wantGame = null; // switched team or left the match: sync again
    }
  }

  // ---------------------------------------------------------------- the calls
  peer(info) {
    let p = this.peers.get(info.id);
    if (!p) {
      p = { id: info.id, name: info.name, pid: info.pid || 0, muted: !!info.muted, listen: !!info.listen, pc: null, audio: null, analyser: null, queue: [], speaking: false, icon: null };
      this.peers.set(info.id, p);
    }
    if (!p.pc) {
      const pc = (p.pc = new RTCPeerConnection({ iceServers: ICE }));
      if (this.stream && !this.listen) for (const t of this.stream.getTracks()) pc.addTrack(t, this.stream);
      else pc.addTransceiver('audio', { direction: 'recvonly' }); // listen only
      pc.onicecandidate = (e) => { if (e.candidate) this.send('signal', { to: p.id, data: { candidate: e.candidate.toJSON() } }); };
      pc.ontrack = (e) => this.hear(p, e.streams[0] || new MediaStream([e.track]));
      pc.onconnectionstatechange = () => { p.state = pc.connectionState; this.render(); };
    }
    return p;
  }

  // the newcomer calls everyone already there (so two people never call each other at once)
  async call(info, offer) {
    const p = this.peer(info);
    if (!offer) return;
    const desc = await p.pc.createOffer();
    await p.pc.setLocalDescription(desc);
    this.send('signal', { to: p.id, data: { sdp: p.pc.localDescription.toJSON() } });
  }

  async signal(from, data) {
    const p = this.peers.get(from) || this.peer({ id: from, name: '…' });
    const pc = p.pc;
    try {
      if (data.sdp) {
        await pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          this.send('signal', { to: from, data: { sdp: pc.localDescription.toJSON() } });
        }
        // network candidates that came before the call description
        for (const c of p.queue.splice(0)) await pc.addIceCandidate(c).catch(() => {});
      } else if (data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
        else p.queue.push(data.candidate);
      }
    } catch (e) {
      console.warn('[voice]', e);
    }
  }

  hear(p, stream) {
    if (!p.audio) {
      p.audio = new Audio();
      p.audio.autoplay = true;
    }
    p.audio.srcObject = stream;
    this.volume(p);
    p.audio.play().catch(() => {});
    this.audioCtx();
    p.analyser = this.analyse(stream);
  }

  hang(id) {
    const p = this.peers.get(id);
    if (!p) return;
    p.pc?.close();
    if (p.audio) { p.audio.pause(); p.audio.srcObject = null; }
    if (p.icon) { p.icon.parent?.remove(p.icon); p.icon.material.dispose(); }
    this.peers.delete(id);
  }

  analyse(stream) {
    if (!this.ctx) return null;
    try {
      const a = this.ctx.createAnalyser();
      a.fftSize = 512;
      this.ctx.createMediaStreamSource(stream).connect(a);
      return { a, buf: new Float32Array(a.fftSize) };
    } catch { return null; }
  }

  // who's talking (for the lit-up names, the HUD and the speakers over heads)
  meter() {
    if (!this.ch) { this.hud(); return; }
    const loud = (an) => {
      if (!an) return false;
      an.a.getFloatTimeDomainData(an.buf);
      let s = 0;
      for (const v of an.buf) s += v * v;
      return Math.sqrt(s / an.buf.length) > SPEAKING;
    };
    let changed = false;
    for (const p of this.peers.values()) {
      const now = !this.deaf && !p.listen && (this.prefs.volumes[p.name] ?? 1) > 0 && loud(p.analyser);
      if (now !== p.speaking) { p.speaking = now; changed = true; }
    }
    const meNow = !!this.live && loud(this.myAnalyser);
    if (meNow !== this.speaking) { this.speaking = meNow; changed = true; }
    // just light the names up (redrawing would grab the volume sliders out from under the mouse)
    if (changed) for (const li of $('vc-members').querySelectorAll('li[data-id]')) li.classList.toggle('talk', li.dataset.id === 'me' ? !!this.speaking : !!this.peers.get(+li.dataset.id)?.speaking);
    this.hud();
  }

  // every frame in a match: a speaker over each talking player's head
  frame() {
    const g = this.g;
    for (const p of this.peers.values()) {
      // game chat knows their player; party members in the same match are found by name
      let pid = p.pid;
      if (!pid && g.connected) for (const [id, info] of g.info) if (info.name === p.name) { pid = id; break; }
      const pl = pid && g.players.get(pid);
      const show = p.speaking && pl && pl.obj && pl.obj.root.visible;
      if (show && !p.icon) { p.icon = speakerSprite(); g.scene.add(p.icon); }
      if (p.icon) {
        p.icon.visible = !!show;
        if (show) p.icon.position.set(pl.pos[0], pl.pos[1], pl.pos[2] + 52);
      }
    }
  }

  // ---------------------------------------------------------------- drawing
  render() {
    const inCh = this.ch?.id;
    $('vc-list').innerHTML = this.channels.map((c) => {
      const here = c.id === inCh, full = c.members.length >= this.max;
      const names = c.members.map((m) => `<span${m.muted ? ' class="muted"' : ''}>${esc(m.name)}</span>`).join(', ');
      return `<li class="${here ? 'here' : ''}"><div><b>${esc(c.name)}</b> <small>${c.members.length}/${this.max}</small><div class="who">${names || '<i>empty</i>'}</div></div>`
        + (here ? '<span class="tag">you’re here</span>' : `<button class="btn${full ? '' : ' primary'}" data-ch="${c.id}"${full ? ' disabled' : ''}>${full ? 'Full' : 'Join'}</button>`) + '</li>';
    }).join('') || '<li class="empty">Loading…</li>';
    for (const b of $('vc-list').querySelectorAll('button[data-ch]')) b.onclick = () => this.join(b.dataset.ch);
    $('vc-room-title').textContent = this.ch ? (this.ch.game ? `Game chat: ${this.ch.name}` : `Party: ${this.ch.name}`) : 'Not in voice';
    $('vc-controls').hidden = !this.ch;
    $('vc-mute').textContent = this.muted ? 'Unmute mic' : 'Mute mic';
    $('vc-mute').classList.toggle('on', this.muted);
    $('vc-mute').hidden = this.listen;
    $('vc-deafen').textContent = this.deaf ? 'Undeafen' : 'Deafen';
    $('vc-deafen').classList.toggle('on', this.deaf);
    $('vc-leave').textContent = this.ch?.game ? 'Turn off game chat' : 'Leave';
    $('btn-voice').classList.toggle('live', !!this.ch);
    $('vc-badge').hidden = !this.ch;
    $('vc-badge').textContent = this.ch ? String(this.peers.size + 1) : '';
    this.renderMembers();
  }

  renderMembers() {
    if (!this.ch) {
      $('vc-members').innerHTML = `<li class="empty">${this.prefs.gameChat ? 'Join a match for game chat, or a voice server for party chat.' : 'Join a voice server to talk.'}</li>`;
      return;
    }
    const why = this.listen ? (this.opts.account() ? (this.prefs.mic === 'off' ? 'mic off' : 'listening only') : 'listening only: sign in to talk') : this.muted ? 'muted' : this.prefs.mic === 'ptt' ? 'hold V to talk' : 'open mic';
    const me = `<li data-id="me" class="${this.speaking ? 'talk' : ''}"><span class="dot"></span><b>${esc(this.opts.account() || 'You')}</b> <small>(you, ${why})</small></li>`;
    const rows = [...this.peers.values()].map((p) => {
      const vol = Math.round((this.prefs.volumes[p.name] ?? 1) * 100);
      const state = p.state && p.state !== 'connected' ? ` <small class="warn">${p.state === 'failed' ? 'can’t connect' : 'connecting…'}</small>` : '';
      return `<li data-id="${p.id}" class="${p.speaking ? 'talk' : ''}"><span class="dot"></span><b>${esc(p.name)}</b>${p.muted ? ' <small>muted</small>' : p.listen ? ' <small>listening</small>' : ''}${state}`
        + `<button class="btn x" data-mute="${esc(p.name)}" title="Mute ${esc(p.name)} for you">${vol ? '🔊' : '🔇'}</button>`
        + `<input type="range" min="0" max="100" value="${vol}" data-name="${esc(p.name)}" aria-label="Volume for ${esc(p.name)}"></li>`;
    }).join('');
    $('vc-members').innerHTML = me + rows;
    const setVol = (name, v) => {
      this.prefs.volumes[name] = v;
      for (const p of this.peers.values()) if (p.name === name) this.volume(p);
      this.save();
    };
    for (const r of $('vc-members').querySelectorAll('input[type=range]')) r.oninput = () => setVol(r.dataset.name, +r.value / 100);
    for (const b of $('vc-members').querySelectorAll('button[data-mute]')) {
      b.onclick = () => { const n = b.dataset.mute; setVol(n, (this.prefs.volumes[n] ?? 1) > 0 ? 0 : 1); this.renderMembers(); };
    }
  }

  // on screen, like CoD: who's talking, bottom left, with a speaker each
  hud() {
    const el = $('voice-hud');
    if (!el) return;
    if (!this.ch) { if (!el.hidden) el.hidden = true; this.hudHtml = ''; return; }
    const g = this.g;
    const color = (name, pid) => {
      const info = pid ? g.info.get(pid) : [...g.info.values()].find((i) => i.name === name);
      return TEAM_COLOR[info?.team] || '#fff';
    };
    const rows = [...this.peers.values()].filter((p) => p.speaking).map((p) => `<div><span class="spk">🔊</span><span style="color:${color(p.name, p.pid)}">${esc(p.name)}</span></div>`);
    if (this.speaking) rows.unshift(`<div><span class="spk">🎙</span><span style="color:${color(null, g.myId)}">${esc(this.opts.account() || 'You')}</span></div>`);
    const mic = this.listen ? 'listening' : this.muted ? 'mic muted' : this.prefs.mic === 'ptt' ? (this.pttDown ? 'talking' : 'hold V to talk') : 'open mic';
    const html = `<div class="ch">${this.ch.game ? 'GAME CHAT' : 'PARTY · ' + esc(this.ch.name)} <small>${mic}${this.deaf ? ' · deafened' : ''}</small></div>${rows.join('')}`;
    if (html !== this.hudHtml) { this.hudHtml = html; el.innerHTML = html; }
    el.hidden = false;
  }
}
