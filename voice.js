// Voice chat, like Call of Duty's: game chat and party chat. The audio goes straight between players' browsers
// (WebRTC); the server only keeps who's in which channel and passes the call setup messages (offers, answers,
// network candidates) between two people in the same channel.
//
// Game chat: everyone in a match is put in its channel automatically: your team in team modes, everyone in
// free-for-all. Guests (and muted players) can listen but not talk.
// Party chat: the voice servers in the Voice tab, one for each game mode plus a lobby, and any the players
// make. Signed-in players only, so the owner's bans and mutes apply. Being in one overrides game chat.
//
// Messages, all { t: 'voice', k }:
//   from a client: list, unlist, join { ch }, leave, create { name }, game, game-leave, signal { to, data },
//                  mute { muted }, kick { id } (owner)
//   to a client:   list { channels }, joined { ch, name, game, you, listen, members }, member-join { m },
//                  member-leave { id }, member { m }, signal { from, data }, left { why, game }, error { text }

const MAX_PARTY = 8; // every person connects to every other, so keep channels small
const MAX_GAME = 12;
const MAX_CUSTOM = 20;
const MAX_SIGNAL = 20000; // bytes in one setup message

// api: { send(ws, msg), canTalk(ws) -> error text or null, isOwner(ws), checkName(name) -> error text or null,
//        gameChannel(ws) -> { key, name, pid } for the match the socket is playing in, or null,
//        servers: [names of the fixed voice servers] }
export function createVoice(api) {
  const channels = new Map(); // id -> { id, name, fixed, game, max, members: Map(voice id -> ws) }
  const watchers = new Set(); // sockets with the voice tab open
  let nextId = 1, nextChannel = 1;
  for (const name of api.servers) {
    const id = 'c' + nextChannel++;
    channels.set(id, { id, name, fixed: true, game: false, max: MAX_PARTY, members: new Map() });
  }

  const member = (ws) => ({ id: ws.voice.id, name: ws.profile?.name || ws.name || 'Guest', muted: !!ws.voice.muted, listen: !!ws.voice.listen, pid: ws.voice.pid || 0 });
  const listMsg = () => ({
    t: 'voice', k: 'list', max: MAX_PARTY,
    channels: [...channels.values()].filter((c) => !c.game).map((c) => ({ id: c.id, name: c.name, fixed: c.fixed, members: [...c.members.values()].map(member) })),
  });
  const pushList = () => { const m = listMsg(); for (const ws of watchers) api.send(ws, m); };
  const toChannel = (c, msg, except) => { for (const ws of c.members.values()) if (ws !== except) api.send(ws, msg); };
  const error = (ws, text) => api.send(ws, { t: 'voice', k: 'error', text });
  const current = (ws) => (ws.voice?.ch ? channels.get(ws.voice.ch) : null);

  function leave(ws, why, quiet) {
    const v = ws.voice;
    const c = current(ws);
    if (!v || !c) return;
    v.ch = null;
    c.members.delete(v.id);
    toChannel(c, { t: 'voice', k: 'member-leave', id: v.id });
    if (!c.fixed && !c.members.size) channels.delete(c.id);
    if (why || quiet) api.send(ws, { t: 'voice', k: 'left', why: why || null, game: c.game });
    if (!c.game) pushList();
  }

  function enter(ws, c, extra = {}) {
    if (ws.voice?.ch === c.id) return;
    if (c.members.size >= c.max) return error(ws, `${c.name} is full (${c.max} people).`);
    leave(ws);
    ws.voice = ws.voice || { id: nextId++ };
    Object.assign(ws.voice, { ch: c.id, muted: false, listen: false, pid: 0 }, extra);
    // whoever joins calls everyone already there
    api.send(ws, { t: 'voice', k: 'joined', ch: c.id, name: c.name, game: c.game, you: ws.voice.id, listen: ws.voice.listen, members: [...c.members.values()].map(member) });
    toChannel(c, { t: 'voice', k: 'member-join', m: member(ws) });
    c.members.set(ws.voice.id, ws);
    if (!c.game) pushList();
  }

  function joinParty(ws, id) {
    const c = channels.get(String(id));
    if (!c || c.game) return error(ws, 'That channel has closed.');
    const why = api.canTalk(ws);
    if (why) return error(ws, why);
    enter(ws, c);
  }

  // game chat for the match (and team) this socket is playing in
  function joinGame(ws) {
    const g = api.gameChannel(ws);
    if (!g) return;
    if (current(ws) && !current(ws).game) return; // party chat wins
    let c = channels.get(g.key);
    if (!c) channels.set(g.key, (c = { id: g.key, name: g.name, fixed: false, game: true, max: MAX_GAME, members: new Map() }));
    if (ws.voice?.ch === c.id) return;
    enter(ws, c, { pid: g.pid, listen: !!api.canTalk(ws) });
  }

  return {
    handle(ws, m) {
      if (m.k === 'list') { watchers.add(ws); return api.send(ws, listMsg()); }
      if (m.k === 'unlist') return void watchers.delete(ws);
      if (m.k === 'join') return joinParty(ws, m.ch);
      if (m.k === 'game') return joinGame(ws);
      if (m.k === 'game-leave') { if (current(ws)?.game) leave(ws); return; }
      if (m.k === 'leave') return leave(ws);
      if (m.k === 'create') {
        const why = api.canTalk(ws);
        if (why) return error(ws, why);
        const name = String(m.name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
        if (name.length < 2) return error(ws, 'Give the channel a name (2 to 24 letters).');
        const bad = api.checkName(name);
        if (bad) return error(ws, bad);
        if ([...channels.values()].some((c) => !c.game && c.name.toLowerCase() === name.toLowerCase())) return error(ws, 'There is already a channel with that name.');
        if ([...channels.values()].filter((c) => !c.fixed && !c.game).length >= MAX_CUSTOM) return error(ws, 'Too many channels are open. Join one instead.');
        const id = 'c' + nextChannel++;
        channels.set(id, { id, name, fixed: false, game: false, max: MAX_PARTY, members: new Map() });
        return joinParty(ws, id);
      }
      const v = ws.voice, c = current(ws);
      if (!c) return;
      if (m.k === 'signal') {
        // only to someone in the same channel, and only small setup messages
        const to = c.members.get(+m.to);
        if (!to || to === ws) return;
        const data = m.data && typeof m.data === 'object' ? m.data : null;
        if (!data || JSON.stringify(data).length > MAX_SIGNAL) return;
        return api.send(to, { t: 'voice', k: 'signal', from: v.id, data });
      }
      if (m.k === 'mute') {
        v.muted = !!m.muted;
        toChannel(c, { t: 'voice', k: 'member', m: member(ws) }, ws);
        if (!c.game) pushList();
        return;
      }
      if (m.k === 'kick' && api.isOwner(ws)) {
        for (const ch of channels.values()) {
          const target = ch.members.get(+m.id);
          if (target) leave(target, 'The owner removed you from voice chat.');
        }
      }
    },
    // the socket closed
    gone(ws) {
      watchers.delete(ws);
      leave(ws);
    },
    // the player left their match (or switched team): out of its game chat
    leftMatch(ws) {
      if (ws && current(ws)?.game) leave(ws, null, true);
    },
    // someone was just muted, banned or signed out: out of party chat, and listen-only in game chat
    recheck(sockets) {
      for (const ws of sockets) {
        const c = current(ws);
        if (!c) continue;
        const why = api.canTalk(ws);
        if (!c.game && why) leave(ws, why);
        else if (c.game && !!why !== !!ws.voice.listen) { leave(ws, null, true); joinGame(ws); }
      }
    },
  };
}
