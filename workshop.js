// The workshop: levels made in the level editor and charms made in the charm maker, published by signed-in
// players for anyone to browse, rate, play and wear.
//
// Saved in the same database as accounts (profiles.workshop): one entry per item ("i:<id>": the whole thing,
// with everyone's star ratings) and an index ("_index") of every item's summary for the browse lists.
// Everything sent in is checked here: sizes, names, coordinates and materials (checkLevel, checkCharm).
import crypto from 'node:crypto';
import { checkLevel, levelProblem, cleanLevelName } from './public/js/mapdefs.js';
import { checkCharm } from './public/js/cosmetics.js';

const MAX_ITEMS = 5000; // in the whole workshop
const PER_ACCOUNT = 40; // published by one account
const PUBLISH_GAP = 15000; // ms between publishes by one account
const LIST = 60; // items in one browse list
const STAFF = new Set(['owner', 'coowner', 'admin', 'mod']);

export function createWorkshop({ profiles, ownerName, checkText, badName, changed }) {
  const store = profiles.workshop;
  const lastPublish = new Map(); // account -> time
  const counted = new Set(); // "id|token": downloads counted since start-up (once each)
  let index = null;
  const ready = store.get('_index', () => []).then((x) => { index = x; }).catch((e) => console.error('[workshop] could not load the index', e.message));
  const saveIndex = () => store.save('_index', index);

  const rating = (e) => (e.cnt ? Math.round((e.sum / e.cnt) * 10) / 10 : 0);
  const summary = (e) => ({ id: e.id, kind: e.kind, name: e.name, by: e.by, at: e.at, n: e.n || 0, rating: rating(e), votes: e.cnt || 0, dl: e.dl || 0, c: e.c });
  const staff = (pr) => pr.name?.toLowerCase() === ownerName || STAFF.has(pr.role);
  const nameError = (name) => (name.length < 3 ? 'Names need 3 to 32 letters or numbers.' : badName(name) || checkText(name).level ? 'Please pick a different name.' : null);

  async function publish(pr, m) {
    if (!pr.name) return { error: 'Sign in to publish to the workshop.' };
    await ready;
    if (!index) return { error: 'The workshop can\'t be reached right now. Try again in a moment.' };
    const key = pr.name.toLowerCase();
    if (Date.now() - (lastPublish.get(key) || 0) < PUBLISH_GAP) return { error: 'Wait a few seconds before publishing again.' };
    if (index.filter((e) => e.k === key).length >= PER_ACCOUNT) return { error: `You've published ${PER_ACCOUNT} things already. Delete one first.` };
    if (index.length >= MAX_ITEMS) return { error: 'The workshop is full.' };
    const kind = m.kind === 'charm' ? 'charm' : m.kind === 'level' ? 'level' : null;
    if (!kind) return { error: 'Unknown kind of item.' };
    let data, n = 0, name;
    if (kind === 'level') {
      const r = checkLevel(m.data);
      if (r.error) return r;
      const problem = levelProblem(r.level);
      if (problem) return { error: problem };
      data = r.level;
      name = data.name;
      n = data.boxes.length;
    } else {
      const r = checkCharm(m.data);
      if (r.error) return r;
      data = r.charm;
      name = cleanLevelName(m.name);
      if (data.text && (badName(data.text) || checkText(data.text).level)) return { error: 'Please pick different letters for the charm.' };
    }
    const bad = nameError(name);
    if (bad) return { error: bad };
    const id = crypto.randomBytes(5).toString('hex');
    const e = { id, kind, name, by: pr.name, k: key, at: Date.now(), n, sum: 0, cnt: 0, dl: 0, c: kind === 'charm' ? data : undefined };
    store.save('i:' + id, { id, kind, name, by: pr.name, k: key, at: e.at, data, stars: {} });
    index.push(e);
    saveIndex();
    lastPublish.set(key, Date.now());
    console.log(`[workshop] ${pr.name} published ${kind} "${name}" (${id})`);
    return { item: summary(e) };
  }

  // browse: kind level|charm, sort top|new|plays, q a search, mine: only yours
  async function list(q, pr) {
    await ready;
    if (!index) return { error: 'The workshop can\'t be reached right now.' };
    const kind = q.kind === 'charm' ? 'charm' : 'level';
    const words = String(q.q || '').toLowerCase().slice(0, 40).split(/\s+/).filter(Boolean);
    const me = q.mine && pr?.name ? pr.name.toLowerCase() : null;
    let out = index.filter((e) => e.kind === kind && (!me || e.k === me) && words.every((w) => e.name.toLowerCase().includes(w) || e.by.toLowerCase().includes(w)));
    const score = (e) => (e.cnt ? (e.sum + 3 * 2) / (e.cnt + 2) : 0); // a few votes don't beat many good ones
    if (q.sort === 'new') out.sort((a, b) => b.at - a.at);
    else if (q.sort === 'plays') out.sort((a, b) => (b.dl || 0) - (a.dl || 0) || b.at - a.at);
    else out.sort((a, b) => score(b) - score(a) || (b.dl || 0) - (a.dl || 0) || b.at - a.at);
    return { items: out.slice(0, LIST).map(summary), total: out.length };
  }

  // one item, whole (a level's boxes); counts as a download once per save code
  async function get(id, pr) {
    const rec = /^[a-f0-9]{10}$/.test(String(id)) ? await store.get('i:' + id) : null;
    if (!rec) return { error: 'That item isn\'t in the workshop any more.' };
    await ready;
    const e = index?.find((x) => x.id === rec.id);
    const tag = rec.id + '|' + (pr?._token || '');
    if (e && pr && !counted.has(tag)) {
      if (counted.size > 50000) counted.clear();
      counted.add(tag);
      e.dl = (e.dl || 0) + 1;
      saveIndex();
    }
    const mine = pr?.name ? rec.stars[pr.name.toLowerCase()] || 0 : 0;
    return { item: { ...(e ? summary(e) : { id: rec.id, kind: rec.kind, name: rec.name, by: rec.by }), data: rec.data, myStars: mine } };
  }

  async function rate(pr, id, stars) {
    if (!pr.name) return { error: 'Sign in to rate things.' };
    stars = Math.round(+stars);
    if (!(stars >= 1 && stars <= 5)) return { error: 'Ratings are 1 to 5 stars.' };
    const rec = /^[a-f0-9]{10}$/.test(String(id)) ? await store.get('i:' + id) : null;
    await ready;
    const e = index?.find((x) => x.id === id);
    if (!rec || !e) return { error: 'That item isn\'t in the workshop any more.' };
    const key = pr.name.toLowerCase();
    if (rec.k === key) return { error: 'You can\'t rate your own.' };
    const before = rec.stars[key] || 0;
    rec.stars[key] = stars;
    e.sum += stars - before;
    if (!before) e.cnt++;
    store.save('i:' + id, rec);
    saveIndex();
    return { item: summary(e), myStars: stars };
  }

  async function remove(pr, id) {
    await ready;
    const e = index?.find((x) => x.id === id);
    if (!e) return { error: 'That item isn\'t in the workshop any more.' };
    if (!pr.name || (e.k !== pr.name.toLowerCase() && !staff(pr))) return { error: 'Only the person who made it can delete it.' };
    index.splice(index.indexOf(e), 1);
    store.save('i:' + id, null);
    saveIndex();
    console.log(`[workshop] ${pr.name} deleted ${e.kind} "${e.name}" (${id})`);
    return { ok: true };
  }

  // wear a workshop charm on your guns (id null: take it off)
  async function equip(pr, id) {
    if (id === null || id === undefined || id === '') {
      if (pr.eq.charm === 'ws') delete pr.eq.charm;
      delete pr.wc;
    } else {
      const rec = /^[a-f0-9]{10}$/.test(String(id)) ? await store.get('i:' + id) : null;
      if (!rec || rec.kind !== 'charm') return { error: 'That charm isn\'t in the workshop any more.' };
      pr.eq.charm = 'ws';
      pr.wc = { id: rec.id, name: rec.name, ...rec.data };
    }
    profiles.save(pr);
    changed(pr);
    return null;
  }

  // a game started on a published level (counted once per save code, like downloads)
  function played(id, token) {
    const e = index?.find((x) => x.id === id);
    const tag = id + '|' + String(token || '');
    if (!e || counted.has(tag)) return;
    if (counted.size > 50000) counted.clear();
    counted.add(tag);
    e.dl = (e.dl || 0) + 1;
    saveIndex();
  }

  // a published level for a game: its checked data, or null
  async function level(id) {
    const rec = /^[a-f0-9]{10}$/.test(String(id)) ? await store.get('i:' + id) : null;
    return rec?.kind === 'level' ? rec.data : null;
  }

  // POST /api/workshop/<route> { token, ... } and GET /api/workshop?kind=&sort=&q=
  function http(req, res, route, json, url) {
    if (req.method === 'GET') {
      const q = Object.fromEntries(url.searchParams);
      return void (q.token ? profiles.load(q.token) : Promise.resolve(null)).then((pr) => list(q, pr)).then((r) => json(res, r)).catch((e) => json(res, { error: e.message }));
    }
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 96000) req.destroy(); });
    req.on('end', async () => {
      let m;
      try { m = JSON.parse(body || '{}'); } catch { return json(res, { error: 'Bad request.' }); }
      try {
        const pr = await profiles.load(m.token);
        if (route === 'get') return json(res, await get(m.id, pr));
        if (!pr) return json(res, { error: 'Your save code is not valid.' });
        if (route === 'publish') return json(res, await publish(pr, m));
        if (route === 'rate') return json(res, await rate(pr, m.id, m.stars));
        if (route === 'delete') return json(res, await remove(pr, String(m.id || '')));
        if (route === 'equip') {
          const error = await equip(pr, m.id === null ? null : String(m.id || ''));
          return json(res, error ? { error, ...profiles.view(pr) } : profiles.view(pr));
        }
        json(res, { error: 'Unknown request.' });
      } catch (e) { json(res, { error: e.message }); }
    });
  }

  return { http, level, played, ready };
}
