// Player profiles: coins, owned cosmetics and what's equipped, kept on the server so nobody can edit their
// own balance. Each browser holds a random secret token instead of an account.
//
// Storage: a JSON file by default. Hosts whose disk is wiped on restart (Render's free plan) can use a free
// Upstash Redis database instead: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
import fs from 'node:fs';
import path from 'node:path';
import { COSMETIC, COS_SLOTS } from './public/js/cosmetics.js';

const TOKEN = /^[a-f0-9]{32}$/;
const MAX_PROFILES = 100000;

// a JSON file holding every profile
function fileStore(file) {
  let all = {};
  try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return {
    name: `file ${file}`,
    async load(token) { return all[token] || null; },
    count() { return Object.keys(all).length; },
    async save(dirty) {
      for (const [token, pr] of dirty) all[token] = pr;
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(all));
      fs.renameSync(file + '.tmp', file);
    },
  };
}

// Upstash Redis over its REST API (no extra packages): one key per profile
function redisStore(url, token) {
  const call = async (cmd) => {
    const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
    if (!r.ok) throw new Error(`Redis answered ${r.status}`);
    return (await r.json()).result;
  };
  return {
    name: 'Upstash Redis',
    async load(t) { const v = await call(['GET', 'mugr:p:' + t]); return v ? JSON.parse(v) : null; },
    count() { return 0; }, // no cap: Redis holds them, not this server's memory
    async save(dirty) {
      for (const [t, pr] of dirty) await call(['SET', 'mugr:p:' + t, JSON.stringify(pr)]);
    },
  };
}

export function createProfiles(file) {
  const store = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? redisStore(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN)
    : fileStore(file);
  console.log(`[profiles] saving coins and cosmetics to ${store.name}`);
  const cache = new Map(); // token -> profile, everything loaded since the server started
  const loading = new Map(); // token -> promise, so two requests don't create the same profile twice
  const dirty = new Map();
  let timer = null;

  const save = (token, pr) => {
    dirty.set(token, pr);
    if (timer) return;
    timer = setTimeout(async () => {
      timer = null;
      const batch = new Map(dirty);
      dirty.clear();
      try { await store.save(batch); } catch (e) {
        console.error('[profiles] could not save', e.message);
        for (const [t, p] of batch) if (!dirty.has(t)) dirty.set(t, p); // try again with the next change
      }
    }, 2000);
  };
  const tokenOf = (pr) => pr._token;

  // the profile for a token, created on first use; null for a malformed token
  async function load(token) {
    if (typeof token !== 'string' || !TOKEN.test(token)) return null;
    if (cache.has(token)) return cache.get(token);
    if (!loading.has(token)) {
      loading.set(token, (async () => {
        let pr = null;
        try { pr = await store.load(token); } catch (e) { console.error('[profiles] could not load', e.message); }
        if (!pr) {
          if (store.count() >= MAX_PROFILES) return null;
          pr = { coins: 0, owned: [], eq: {} };
          save(token, pr);
        }
        Object.defineProperty(pr, '_token', { value: token, enumerable: false });
        cache.set(token, pr);
        return pr;
      })().finally(() => loading.delete(token)));
    }
    return loading.get(token);
  }

  const view = (pr) => ({ coins: pr.coins, owned: pr.owned, eq: pr.eq });

  return {
    load,
    view,
    award(pr, n) {
      pr.coins += n;
      save(tokenOf(pr), pr);
    },
    buy(pr, id) {
      const item = COSMETIC[id];
      if (!item) return 'There is no such item.';
      if (pr.owned.includes(id)) return 'You already own that.';
      if (pr.coins < item.price) return `You need ${item.price - pr.coins} more coins.`;
      pr.coins -= item.price;
      pr.owned.push(id);
      pr.eq[item.slot] = id; // wear it straight away
      save(tokenOf(pr), pr);
      return null;
    },
    // id null takes the slot off
    equip(pr, slot, id) {
      if (!COS_SLOTS[slot]) return 'There is no such slot.';
      if (id === null || id === undefined || id === '') delete pr.eq[slot];
      else {
        if (!pr.owned.includes(id)) return 'You don\'t own that.';
        if (COSMETIC[id].slot !== slot) return 'That doesn\'t go there.';
        pr.eq[slot] = id;
      }
      save(tokenOf(pr), pr);
      return null;
    },
  };
}
