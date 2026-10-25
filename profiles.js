// Player profiles and accounts, kept on the server so nobody can edit their own balance.
//
// A profile (coins, owned cosmetics, what's equipped) belongs to a random secret token. Guests just keep
// the token in their browser. Registering ties a username and password to the token, so logging in on
// any device hands that token back. Passwords are stored only as salted scrypt hashes.
//
// The owner account ("watermelon") can't be registered: the server creates it at start-up from the
// OWNER_PASSWORD environment variable, with a million coins and the Owner cape.
//
// Storage: JSON files by default. Hosts whose disk is wiped on restart (Render's free plan) can use a free
// Upstash Redis database instead: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { COSMETIC, COS_SLOTS } from './public/js/cosmetics.js';
import { badName } from './filter.js';

const TOKEN = /^[a-f0-9]{32}$/;
const NAME = /^[A-Za-z0-9_]{3,16}$/;
const MAX_PROFILES = 100000;
export const OWNER_NAME = 'watermelon';
const OWNER_COINS = 1000000;
const OWNER_ITEMS = ['owner_cape'];

// a JSON file of key -> value
function fileStore(file) {
  let all = {};
  try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return {
    name: `file ${file}`,
    async load(key) { return all[key] || null; },
    count() { return Object.keys(all).length; },
    async save(dirty) {
      for (const [key, v] of dirty) { if (v === null) delete all[key]; else all[key] = v; }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(all));
      fs.renameSync(file + '.tmp', file);
    },
  };
}

// Upstash Redis over its REST API (no extra packages): one key per entry
function redisStore(url, token, prefix) {
  const call = async (cmd) => {
    const r = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
    if (!r.ok) throw new Error(`Redis answered ${r.status}`);
    return (await r.json()).result;
  };
  return {
    name: 'Upstash Redis',
    async load(key) { const v = await call(['GET', prefix + key]); return v ? JSON.parse(v) : null; },
    count() { return 0; }, // no cap: Redis holds them, not this server's memory
    async save(dirty) {
      for (const [key, v] of dirty) await call(v === null ? ['DEL', prefix + key] : ['SET', prefix + key, JSON.stringify(v)]);
    },
  };
}

// a store with an in-memory cache and batched, retried saves
function cachedStore(store, label) {
  const cache = new Map();
  const loading = new Map(); // key -> promise, so two requests don't load or create the same entry twice
  const dirty = new Map();
  let timer = null;
  const save = (key, v) => {
    cache.set(key, v);
    dirty.set(key, v);
    if (timer) return;
    timer = setTimeout(async () => {
      timer = null;
      const batch = new Map(dirty);
      dirty.clear();
      try { await store.save(batch); } catch (e) {
        console.error(`[${label}] could not save`, e.message);
        for (const [k, x] of batch) if (!dirty.has(k)) dirty.set(k, x); // try again with the next change
      }
    }, 2000);
  };
  // the entry for a key; create() makes one when there is none (or returns null to leave it missing)
  const get = (key, create) => {
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (!loading.has(key)) {
      loading.set(key, (async () => {
        let v = null;
        try { v = await store.load(key); } catch (e) { console.error(`[${label}] could not load`, e.message); }
        if (!v && create) { v = create(); if (v) save(key, v); }
        if (v) cache.set(key, v);
        return v;
      })().finally(() => loading.delete(key)));
    }
    return loading.get(key);
  };
  return { get, save, count: () => store.count(), name: store.name };
}

const scrypt = (password, salt) => new Promise((res, rej) => crypto.scrypt(password, salt, 64, (e, k) => (e ? rej(e) : res(k))));
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return { salt, hash: (await scrypt(password, salt)).toString('hex') };
}
async function checkPassword(acc, password) {
  const want = Buffer.from(acc.hash, 'hex');
  const got = await scrypt(password, acc.salt);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

export function createProfiles(file) {
  const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;
  const mk = (f, prefix) => (redis ? redisStore(process.env.UPSTASH_REDIS_REST_URL, process.env.UPSTASH_REDIS_REST_TOKEN, prefix) : fileStore(f));
  const profiles = cachedStore(mk(file, 'mugr:p:'), 'profiles');
  const accounts = cachedStore(mk(path.join(path.dirname(file), 'accounts.json'), 'mugr:u:'), 'accounts');
  const dms = cachedStore(mk(path.join(path.dirname(file), 'messages.json'), 'mugr:d:'), 'messages');
  const bans = cachedStore(mk(path.join(path.dirname(file), 'bans.json'), 'mugr:b:'), 'bans');
  console.log(`[profiles] saving coins, cosmetics and accounts to ${profiles.name}`);
  const tokenOf = (pr) => pr._token;
  const touch = (pr) => profiles.save(tokenOf(pr), pr);

  // the profile for a token, created on first use; null for a malformed token
  async function load(token) {
    if (typeof token !== 'string' || !TOKEN.test(token)) return null;
    const pr = await profiles.get(token, () => (profiles.count() >= MAX_PROFILES ? null : { coins: 0, owned: [], eq: {} }));
    if (pr && !pr._token) Object.defineProperty(pr, '_token', { value: token, enumerable: false });
    return pr;
  }

  const view = (pr) => ({ coins: pr.coins, owned: pr.owned, eq: pr.eq, name: pr.name || null });
  const newToken = () => crypto.randomBytes(16).toString('hex');

  // give the owner their coins (once) and items
  function ownerPerks(pr) {
    pr.name = OWNER_NAME;
    if (!pr.owner) { pr.owner = true; pr.coins += OWNER_COINS; }
    for (const id of OWNER_ITEMS) if (!pr.owned.includes(id)) { pr.owned.push(id); pr.eq[COSMETIC[id].slot] = id; }
    touch(pr);
  }

  // start-up: create or update the owner account from OWNER_PASSWORD
  async function setupOwner() {
    const password = process.env.OWNER_PASSWORD;
    if (!password) { console.log(`[accounts] OWNER_PASSWORD is not set: the "${OWNER_NAME}" account stays locked`); return; }
    let acc = await accounts.get(OWNER_NAME);
    if (!acc) {
      acc = { name: OWNER_NAME, token: newToken(), created: Date.now(), ...(await hashPassword(password)) };
      accounts.save(OWNER_NAME, acc);
      console.log(`[accounts] created the owner account "${OWNER_NAME}"`);
    } else if (!(await checkPassword(acc, password))) {
      Object.assign(acc, await hashPassword(password)); // OWNER_PASSWORD changed: the new one wins
      accounts.save(OWNER_NAME, acc);
      console.log(`[accounts] updated the owner account's password`);
    }
    ownerPerks(await load(acc.token));
  }
  const ready = setupOwner().catch((e) => console.error('[accounts] owner setup failed', e.message));

  return {
    load,
    view,
    ready,
    // is this name (any capitalisation) a registered account or the reserved owner name?
    async nameTaken(name) {
      const key = String(name || '').toLowerCase();
      return key === OWNER_NAME || !!(NAME.test(key) && (await accounts.get(key)));
    },
    // guestToken: the browser's current save code, so a guest keeps their coins when they register
    async register(name, password, guestToken) {
      name = String(name || '').trim();
      password = String(password || '');
      if (!NAME.test(name)) return { error: 'Usernames are 3 to 16 letters, numbers or _.' };
      if (password.length < 6 || password.length > 100) return { error: 'Passwords need at least 6 characters.' };
      const key = name.toLowerCase();
      if (key === OWNER_NAME) return { error: 'That name is reserved.' };
      if (badName(name)) return { error: 'Please pick a different name.' };
      if (await accounts.get(key)) return { error: 'That name is taken.' };
      let pr = await load(guestToken);
      const token = pr && !pr.name ? guestToken : newToken(); // a save code already tied to an account can't be reused
      if (!pr || pr.name) pr = await load(token);
      if (!pr) return { error: 'The server is full.' };
      accounts.save(key, { name, token, created: Date.now(), ...(await hashPassword(password)) });
      pr.name = name;
      touch(pr);
      return { token, ...view(pr) };
    },
    async login(name, password) {
      const key = String(name || '').trim().toLowerCase();
      const acc = NAME.test(key) ? await accounts.get(key) : null;
      if (!acc || !(await checkPassword(acc, String(password || '')))) return { error: 'Wrong username or password.' };
      const pr = await load(acc.token);
      return { token: acc.token, ...view(pr) };
    },
    award(pr, n) {
      pr.coins += n;
      touch(pr);
    },

    // ---------------------------------------------------------------- friends (account keys are lower-case names)
    account: (key) => accounts.get(String(key || '').toLowerCase()),
    // { friends, incoming, outgoing } as display names
    async friendsOf(key) {
      const acc = await accounts.get(key);
      const names = async (list) => (await Promise.all((list || []).map((k) => accounts.get(k)))).filter(Boolean).map((a) => a.name);
      return acc ? { friends: await names(acc.friends), incoming: await names(acc.incoming), outgoing: await names(acc.outgoing) } : { friends: [], incoming: [], outgoing: [] };
    },
    // action: add (send a request, or accept theirs), accept, decline, remove. Returns an error or null.
    async friend(meKey, action, otherName) {
      const me = await accounts.get(meKey);
      const okey = String(otherName || '').trim().toLowerCase();
      const other = NAME.test(okey) ? await accounts.get(okey) : null;
      if (!me) return 'Sign in to add friends.';
      if (!other) return `There's no player called ${String(otherName || '').slice(0, 16)}.`;
      if (okey === meKey) return 'That\'s you!';
      for (const a of [me, other]) { a.friends ||= []; a.incoming ||= []; a.outgoing ||= []; }
      const drop = (list, k) => { const i = list.indexOf(k); if (i >= 0) list.splice(i, 1); };
      if (action === 'add' || action === 'accept') {
        if (me.friends.includes(okey)) return `You're already friends with ${other.name}.`;
        if (me.incoming.includes(okey)) { // they asked first: accept
          drop(me.incoming, okey); drop(other.outgoing, meKey);
          me.friends.push(okey); other.friends.push(meKey);
        } else if (action === 'accept') return 'There\'s no request to accept.';
        else {
          if (me.outgoing.includes(okey)) return 'You already sent a request.';
          if (me.friends.length >= 200) return 'Your friends list is full.';
          if (other.incoming.length >= 100) return `${other.name} has too many requests waiting.`;
          me.outgoing.push(okey); other.incoming.push(meKey);
        }
      } else if (action === 'decline') { drop(me.incoming, okey); drop(other.outgoing, meKey); }
      else if (action === 'remove') { drop(me.friends, okey); drop(other.friends, meKey); drop(me.outgoing, okey); drop(other.incoming, meKey); }
      else return 'Unknown action.';
      accounts.save(meKey, me);
      accounts.save(okey, other);
      return null;
    },
    areFriends: async (a, b) => !!(await accounts.get(a))?.friends?.includes(b),

    // ---------------------------------------------------------------- direct messages (the last 100 per pair)
    async dmHistory(a, b) {
      return (await dms.get([a, b].sort().join('|'))) || [];
    },
    async dmAdd(a, b, msg) {
      const key = [a, b].sort().join('|');
      const list = (await dms.get(key)) || [];
      list.push(msg);
      if (list.length > 100) list.splice(0, list.length - 100);
      dms.save(key, list);
    },

    // ---------------------------------------------------------------- bans: by account, save code and address
    // keys: ['a:<account>', 't:<token>', 'i:<address>']; the index lists every ban for the owner's panel
    async isBanned(keys) {
      for (const k of keys) { const b = k && (await bans.get(k)); if (b) return b; }
      return null;
    },
    async ban(name, keys, by, reason) {
      const rec = { name, by, reason: String(reason || '').slice(0, 120), at: Date.now(), keys: keys.filter(Boolean) };
      for (const k of rec.keys) bans.save(k, rec);
      const index = (await bans.get('_index')) || [];
      index.push(rec);
      bans.save('_index', index);
      return rec;
    },
    // lift every ban on that name; returns how many
    async unban(name) {
      const key = String(name || '').trim().toLowerCase();
      const index = (await bans.get('_index')) || [];
      const gone = index.filter((r) => r.name.toLowerCase() === key);
      for (const r of gone) for (const k of r.keys) bans.save(k, null);
      bans.save('_index', index.filter((r) => !gone.includes(r)));
      return gone.length;
    },
    listBans: async () => ((await bans.get('_index')) || []).map(({ name, by, reason, at }) => ({ name, by, reason, at })),
    buy(pr, id) {
      const item = COSMETIC[id];
      if (!item || item.hidden) return 'There is no such item.';
      if (pr.owned.includes(id)) return 'You already own that.';
      if (pr.coins < item.price) return `You need ${item.price - pr.coins} more coins.`;
      pr.coins -= item.price;
      pr.owned.push(id);
      pr.eq[item.slot] = id; // wear it straight away
      touch(pr);
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
      touch(pr);
      return null;
    },
  };
}
