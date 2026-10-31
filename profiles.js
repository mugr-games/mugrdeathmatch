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
import { COSMETIC as COSMETIC_CAT, BATTLE_PASS, passTier } from './public/js/cosmetics.js';
const COSMETIC_SLOT = Object.fromEntries(Object.entries(COSMETIC_CAT).map(([k, v]) => [k, v.slot]));
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

// lifetime stats kept on every profile. Counters add up; "best" ones keep the highest value seen.
const COUNTERS = ['kills', 'deaths', 'headshots', 'wins', 'matches', 'zkills', 'coins', 'goals', 'finishes', 'heists'];
const BESTS = ['streak', 'round'];
const LOWS = ['pkbest']; // lower is better (fastest parkour run, seconds)
// leaderboard categories: how each ranks a profile (null = not on that board yet)
export const BOARDS = {
  kills: (s) => s.kills || null,
  wins: (s) => s.wins || null,
  kd: (s) => ((s.kills || 0) >= 20 ? Math.round(((s.kills || 0) / Math.max(1, s.deaths || 0)) * 100) / 100 : null),
  streak: (s) => s.streak || null,
  zkills: (s) => s.zkills || null,
  coins: (s) => s.coins || null,
  goals: (s) => s.goals || null,
  heists: (s) => s.heists || null,
  parkour: (s) => s.pkbest || null,
};
const ASCENDING = new Set(['parkour']); // boards where the smallest value is best
const BOARD_SIZE = 100;

// a JSON file of key -> value
function fileStore(file) {
  let all = {};
  try { all = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  return {
    name: `file ${file}`,
    kind: 'file',
    async load(key) { return all[key] || null; },
    async loadMany(keys) { return keys.map((k) => all[k] || null); },
    async keys() { return Object.keys(all); },
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
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.error) throw new Error(j.error || `Redis answered ${r.status}`);
    return j.result;
  };
  return {
    name: 'Upstash Redis',
    kind: 'redis',
    async load(key) { const v = await call(['GET', prefix + key]); return v ? JSON.parse(v) : null; },
    async loadMany(keys) {
      const out = [];
      for (let i = 0; i < keys.length; i += 100) { // MGET in chunks
        const vals = await call(['MGET', ...keys.slice(i, i + 100).map((k) => prefix + k)]);
        for (const v of vals) out.push(v ? JSON.parse(v) : null);
      }
      return out;
    },
    // every key under this prefix (SCAN, so it never blocks the database)
    async keys() {
      const found = [];
      let cursor = '0';
      do {
        const [next, batch] = await call(['SCAN', cursor, 'MATCH', prefix + '*', 'COUNT', '500']);
        cursor = String(next);
        for (const k of batch) found.push(k.slice(prefix.length));
      } while (cursor !== '0' && found.length < 100000);
      return found;
    },
    count() { return 0; }, // no cap: Redis holds them, not this server's memory
    // a whole batch in at most two requests: one MSET for the changes, one DEL for removals
    async save(dirty) {
      const sets = [], dels = [];
      for (const [key, v] of dirty) {
        if (v === null) dels.push(prefix + key);
        else sets.push(prefix + key, JSON.stringify(v));
      }
      if (sets.length) await call(['MSET', ...sets]);
      if (dels.length) await call(['DEL', ...dels]);
    },
    async check() {
      const stamp = String(Date.now());
      await call(['SET', 'mugr:health', stamp]);
      if ((await call(['GET', 'mugr:health'])) !== stamp) throw new Error('a test save did not read back');
    },
  };
}

// a store with an in-memory cache and batched, retried saves. Reading never guesses: if the store can't be
// reached, get() fails instead of answering "missing", so nothing is created over real data.
function cachedStore(store, label, status) {
  const cache = new Map();
  const loading = new Map(); // key -> promise, so two requests don't load or create the same entry twice
  const dirty = new Map();
  let timer = null;
  const save = (key, v) => {
    cache.set(key, v);
    dirty.set(key, v);
    if (timer) return;
    timer = setTimeout(flush, 2000);
  };
  // write everything waiting; failed writes go back in the queue and are tried again shortly
  async function flush() {
    clearTimeout(timer);
    timer = null;
    if (!dirty.size) return true;
    const batch = new Map(dirty);
    dirty.clear();
    try {
      await store.save(batch);
      if (status) { status.ok = true; status.error = null; }
      return true;
    } catch (e) {
      console.error(`[${label}] could not save`, e.message);
      if (status) { status.ok = false; status.error = e.message; }
      for (const [k, x] of batch) if (!dirty.has(k)) dirty.set(k, x);
      if (!timer) timer = setTimeout(flush, 5000);
      return false;
    }
  }
  // the entry for a key; create() makes one when there is none (or returns null to leave it missing)
  const get = (key, create) => {
    if (cache.has(key)) return Promise.resolve(cache.get(key));
    if (!loading.has(key)) {
      loading.set(key, (async () => {
        let v;
        try { v = await store.load(key); } catch (e) {
          console.error(`[${label}] could not load`, e.message);
          throw new Error('The server can\'t reach its database right now. Try again in a moment.');
        }
        if (!v && create) { v = create(); if (v) save(key, v); }
        if (v) cache.set(key, v);
        return v;
      })().finally(() => loading.delete(key)));
    }
    return loading.get(key);
  };
  // several at once: cached ones from memory, the rest in one go from the store
  async function getMany(keys) {
    const missing = keys.filter((k) => !cache.has(k));
    if (missing.length) {
      const vals = await store.loadMany(missing);
      missing.forEach((k, i) => { if (vals[i] && !cache.has(k)) cache.set(k, vals[i]); });
    }
    return keys.map((k) => cache.get(k) || null);
  }
  // every key: the saved ones plus any not saved yet
  const keys = async () => [...new Set([...(await store.keys()), ...cache.keys()])];
  return { get, getMany, keys, save, flush, pending: () => dirty.size, count: () => store.count(), name: store.name, kind: store.kind, check: store.check };
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
  // where things are saved and whether saving works (shown in /api/info and the owner's Moderation panel)
  const storage = { kind: redis ? 'redis' : 'file', ok: !redis, error: null };
  const profiles = cachedStore(mk(file, 'mugr:p:'), 'profiles', storage);
  const accounts = cachedStore(mk(path.join(path.dirname(file), 'accounts.json'), 'mugr:u:'), 'accounts', storage);
  const dms = cachedStore(mk(path.join(path.dirname(file), 'messages.json'), 'mugr:d:'), 'messages', storage);
  const bans = cachedStore(mk(path.join(path.dirname(file), 'bans.json'), 'mugr:b:'), 'bans', storage);
  const boards = cachedStore(mk(path.join(path.dirname(file), 'leaderboard.json'), 'mugr:l:'), 'leaderboard', storage);
  // uploaded pictures for image capes and flags, by hash: { data, status: pending|ok|rejected, by, at, tokens }
  const images = cachedStore(mk(path.join(path.dirname(file), 'images.json'), 'mugr:i:'), 'images', storage);
  // the workshop (workshop.js): published levels and charms, their ratings and the index
  const workshop = cachedStore(mk(path.join(path.dirname(file), 'workshop.json'), 'mugr:w:'), 'workshop', storage);
  // players' reports of other players' looks, bios and names, for staff (the newest 200)
  const reports = cachedStore(mk(path.join(path.dirname(file), 'reports.json'), 'mugr:r:'), 'reports', storage);
  console.log(`[profiles] saving coins, cosmetics and accounts to ${profiles.name}`);
  if (profiles.kind === 'file' && (process.env.RENDER || process.env.NODE_ENV === 'production')) console.warn('[profiles] WARNING: the host forgets files when it sleeps or restarts. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to keep accounts.');
  const stores = [profiles, accounts, dms, bans, boards, images, workshop, reports];

  // the leaderboard: the top 100 signed-in players in each category, kept as one saved document
  let board = null;
  const boardReady = boards.get('top', () => Object.fromEntries(Object.keys(BOARDS).map((k) => [k, []])))
    .then((b) => { board = b; for (const k of Object.keys(BOARDS)) board[k] ||= []; })
    .catch((e) => console.error('[leaderboard] could not load', e.message));
  function rank(pr) {
    if (!pr.name || !board) return;
    let changed = false;
    for (const [k, score] of Object.entries(BOARDS)) {
      const v = score(pr.stats || {});
      const list = board[k];
      const i = list.findIndex((e) => e.n === pr.name);
      if (v === null) { if (i >= 0) { list.splice(i, 1); changed = true; } continue; }
      const asc = ASCENDING.has(k);
      if (i >= 0) { if (list[i].v === v) continue; list[i].v = v; }
      else if (list.length >= BOARD_SIZE && (asc ? v >= list[list.length - 1].v : v <= list[list.length - 1].v)) continue;
      else list.push({ n: pr.name, v });
      list.sort((a, b) => (asc ? a.v - b.v : b.v - a.v));
      if (list.length > BOARD_SIZE) list.length = BOARD_SIZE;
      changed = true;
    }
    if (changed) boards.save('top', board);
  }
  if (profiles.check) {
    profiles.check().then(() => { storage.ok = true; console.log('[profiles] Upstash Redis test save worked: saving works'); })
      .catch((e) => {
        storage.ok = false;
        storage.error = /NOPERM|read.?only/i.test(e.message) ? `${e.message} (this looks like the read-only token: use the normal UPSTASH_REDIS_REST_TOKEN)` : e.message;
        console.error('[profiles] SAVING DOES NOT WORK. Upstash Redis refused a test save:', storage.error);
      });
  }
  const tokenOf = (pr) => pr._token;
  const touch = (pr) => profiles.save(tokenOf(pr), pr);

  // the profile for a token, created on first use; null for a malformed token
  async function load(token) {
    if (typeof token !== 'string' || !TOKEN.test(token)) return null;
    let pr;
    try { pr = await profiles.get(token, () => (profiles.count() >= MAX_PROFILES ? null : { coins: 0, owned: [], eq: {} })); } catch { return null; }
    if (pr && !pr._token) Object.defineProperty(pr, '_token', { value: token, enumerable: false });
    return pr;
  }

  const view = (pr) => ({ coins: pr.coins, owned: pr.owned, eq: pr.eq, name: pr.name || null, stats: pr.stats || {}, role: pr.role || null, img: pr.img || null, imgSt: pr.imgSt || null, bp: passOf(pr), wc: pr.wc || null });

  // ---------------------------------------------------------------- battle pass
  // pr.bp: { s: season, xp, prem: bought premium, f/p: the last tier whose free/premium reward was given }.
  // A new season starts everyone again at tier 0 (items from earlier seasons stay owned).
  function passOf(pr) {
    if (!pr.bp || pr.bp.s !== BATTLE_PASS.season) pr.bp = { s: BATTLE_PASS.season, xp: 0, prem: false, f: 0, p: 0 };
    return pr.bp;
  }
  function grant(pr, reward, got) {
    if (reward.startsWith('coins:')) { pr.coins += +reward.slice(6); got.push(reward); return; }
    if (COSMETIC[reward] && !pr.owned.includes(reward)) { pr.owned.push(reward); got.push(reward); }
  }
  // give every reward up to the current tier that hasn't been given yet; returns what was given
  function catchUp(pr) {
    const bp = passOf(pr), tier = passTier(bp.xp), got = [];
    for (; bp.f < tier; bp.f++) grant(pr, BATTLE_PASS.tiers[bp.f][0], got);
    if (bp.prem) for (; bp.p < tier; bp.p++) grant(pr, BATTLE_PASS.tiers[bp.p][1], got);
    return got;
  }
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
    // keep changes made to a profile elsewhere (free roam money and garage)
    save: (pr) => touch(pr),
    storage,
    workshop,
    // save everything now (before the server stops)
    flush: () => Promise.all(stores.map((s) => s.flush())),
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
      rank(pr);
      return { token, ...view(pr) };
    },
    // staff: the owner makes someone an admin, a mod or the co-owner; each comes with its own free cosmetic,
    // put on straight away. role null takes it away.
    async setRole(name, role) {
      const key = String(name || '').trim().toLowerCase();
      const acc = NAME.test(key) ? await accounts.get(key) : null;
      if (!acc) return { error: `No account called ${name}.` };
      if (key === OWNER_NAME) return { error: 'That is the owner.' };
      const pr = await load(acc.token);
      if (!pr) return { error: 'That save could not be loaded.' };
      acc.role = role || null;
      accounts.save(key, acc);
      pr.role = role || null;
      const gift = { admin: ['admin_hat'], mod: ['mod_visor'], coowner: ['goated_cape', 'admin_hat'] }[role] || [];
      for (const id of gift) if (!pr.owned.includes(id)) pr.owned.push(id);
      if (gift[0]) pr.eq[COSMETIC_SLOT[gift[0]]] = gift[0];
      touch(pr);
      return { pr, name: acc.name };
    },
    // the owner sets up an account for someone (the co-owner) with a password the owner types in
    async createStaff(name, password, role) {
      name = String(name || '').trim();
      password = String(password || '');
      if (!NAME.test(name)) return { error: 'Usernames are 3 to 16 letters, numbers or _.' };
      if (password.length < 6 || password.length > 100) return { error: 'Passwords need at least 6 characters.' };
      const key = name.toLowerCase();
      if (key === OWNER_NAME) return { error: 'That name is reserved.' };
      if (await accounts.get(key)) return this.setRole(name, role); // already there: just make them staff
      const token = newToken();
      const pr = await load(token);
      if (!pr) return { error: 'The server is full.' };
      accounts.save(key, { name, token, created: Date.now(), ...(await hashPassword(password)) });
      pr.name = name;
      touch(pr);
      return this.setRole(name, role);
    },
    async login(name, password, guestToken) {
      const key = String(name || '').trim().toLowerCase();
      const acc = NAME.test(key) ? await accounts.get(key) : null;
      if (!acc || !(await checkPassword(acc, String(password || '')))) return { error: 'Wrong username or password.' };
      const pr = await load(acc.token);
      if (!pr) return { error: 'The server can\'t reach its database right now. Try again in a moment.' };
      // coins and items this browser earned as a guest join the account (once: the guest is emptied)
      const guest = guestToken !== acc.token ? await load(guestToken) : null;
      if (guest && !guest.name && (guest.coins > 0 || guest.owned.length || Object.values(guest.stats || {}).some(Boolean))) {
        pr.coins += guest.coins;
        for (const id of guest.owned) if (!pr.owned.includes(id)) pr.owned.push(id);
        const gs = guest.stats || {}, s = (pr.stats ||= {});
        for (const k of COUNTERS) if (gs[k]) s[k] = (s[k] || 0) + gs[k];
        for (const k of BESTS) if ((gs[k] || 0) > (s[k] || 0)) s[k] = gs[k];
        for (const k of LOWS) if (gs[k] && (!s[k] || gs[k] < s[k])) s[k] = gs[k];
        guest.stats = {};
        guest.coins = 0;
        guest.owned = [];
        guest.eq = {};
        touch(guest);
        touch(pr);
        rank(pr);
      }
      return { token: acc.token, ...view(pr) };
    },
    award(pr, n) {
      pr.coins += n;
      this.stat(pr, { coins: n });
    },
    // battle pass XP: returns { tier, got } when a tier was reached (got: the rewards given), else null
    passXp(pr, xp) {
      if (!pr || !(xp > 0)) return null;
      const bp = passOf(pr), before = passTier(bp.xp);
      bp.xp += Math.round(xp);
      const tier = passTier(bp.xp);
      const got = tier > before ? catchUp(pr) : [];
      touch(pr);
      return tier > before ? { tier, got } : null;
    },
    // buy the premium track (coins): every premium reward up to your tier comes at once
    buyPass(pr) {
      const bp = passOf(pr);
      if (bp.prem) return 'You already have the premium pass.';
      if (pr.coins < BATTLE_PASS.premiumPrice) return `You need ${BATTLE_PASS.premiumPrice - pr.coins} more coins.`;
      pr.coins -= BATTLE_PASS.premiumPrice;
      bp.prem = true;
      catchUp(pr);
      touch(pr);
      return null;
    },

    // ---------------------------------------------------------------- owner tools
    // every registered account with its coins, newest first
    async listAccounts() {
      const keys = (await accounts.keys()).filter((k) => !k.startsWith('_'));
      const accs = (await accounts.getMany(keys)).filter(Boolean);
      const prs = await profiles.getMany(accs.map((a) => a.token));
      return accs.map((a, i) => ({ name: a.name, created: a.created || 0, coins: prs[i]?.coins || 0, kills: prs[i]?.stats?.kills || 0 }))
        .sort((a, b) => b.created - a.created);
    },
    async accountDetail(name) {
      const acc = await accounts.get(String(name || '').toLowerCase());
      if (!acc) return null;
      const pr = await load(acc.token);
      return { name: acc.name, created: acc.created || 0, coins: pr.coins, owned: pr.owned, eq: pr.eq, stats: pr.stats || {}, friends: (acc.friends || []).length };
    },
    // the profile behind an account name (for the server to notify and refresh them)
    async profileOf(name) {
      const acc = await accounts.get(String(name || '').toLowerCase());
      return acc ? load(acc.token) : null;
    },
    // mode: give, take or set; returns the new balance or an error
    async adjustCoins(name, mode, amount) {
      const pr = await this.profileOf(name);
      if (!pr) return { error: `There's no account called ${name}.` };
      amount = Math.floor(Math.abs(Number(amount) || 0));
      if (amount > 1e9) return { error: 'That\'s too many coins.' };
      if (mode === 'give') pr.coins += amount;
      else if (mode === 'take') pr.coins = Math.max(0, pr.coins - amount);
      else if (mode === 'set') pr.coins = amount;
      else return { error: 'Unknown action.' };
      touch(pr);
      return { coins: pr.coins, pr };
    },
    // give or remove one cosmetic; removing takes it off too
    async setItem(name, id, give) {
      const pr = await this.profileOf(name);
      if (!pr) return { error: `There's no account called ${name}.` };
      const item = COSMETIC[id];
      if (!item) return { error: 'There is no such item.' };
      if (give) {
        if (!pr.owned.includes(id)) pr.owned.push(id);
      } else {
        pr.owned = pr.owned.filter((x) => x !== id);
        if (pr.eq[item.slot] === id) delete pr.eq[item.slot];
      }
      touch(pr);
      return { pr };
    },

    // ---------------------------------------------------------------- stats
    // add to counters ({ kills: 1, headshots: 1 }) and raise bests ({ streak: 7 })
    stat(pr, change) {
      if (!pr) return;
      const s = (pr.stats ||= {});
      for (const [k, v] of Object.entries(change)) {
        if (!v) continue;
        if (COUNTERS.includes(k)) s[k] = (s[k] || 0) + v;
        else if (BESTS.includes(k)) { if (v <= (s[k] || 0)) continue; s[k] = v; }
        else if (LOWS.includes(k)) { if (s[k] && v >= s[k]) continue; s[k] = v; }
      }
      touch(pr);
      rank(pr);
    },
    async leaderboard() {
      await boardReady;
      return Object.fromEntries(Object.entries(board || {}).map(([k, list]) => [k, list.slice(0, 50)]));
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
      if ((action === 'add' || action === 'accept') && me.blocked?.includes(okey)) return `Unblock ${other.name} first.`;
      if ((action === 'add' || action === 'accept') && other.blocked?.includes(meKey)) return `${other.name} isn't taking friend requests.`;
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

    // ---------------------------------------------------------------- profiles: bio, look, blocks, reports
    // what anyone can see of an account, or null: its bio, a few stats and the look it last played in
    async publicProfile(name) {
      const acc = await accounts.get(String(name || '').trim().toLowerCase());
      const pr = acc && (await load(acc.token));
      if (!pr) return null;
      const s = pr.stats || {};
      return {
        name: acc.name, created: acc.created || 0, bio: pr.bio || '', look: pr.look || null, pr,
        role: pr.owner ? 'owner' : pr.role || null,
        stats: { kills: s.kills || 0, deaths: s.deaths || 0, wins: s.wins || 0, matches: s.matches || 0 },
      };
    },
    setBio(pr, text) { pr.bio = text; touch(pr); },
    // the suit colour and character someone last played as (their profile shows them like that when offline)
    setLook(pr, color, model) {
      if (pr.look?.c === color && pr.look?.m === model) return;
      pr.look = { c: color, m: model };
      touch(pr);
    },
    // block (on) or unblock someone: a blocked player can't ask to be friends, and any friendship or request
    // between you ends. Returns an error or null.
    async block(meKey, otherName, on) {
      const me = await accounts.get(meKey);
      const okey = String(otherName || '').trim().toLowerCase();
      const other = NAME.test(okey) ? await accounts.get(okey) : null;
      if (!me) return 'Sign in to block players.';
      if (!other) return `There's no player called ${String(otherName || '').slice(0, 16)}.`;
      if (okey === meKey) return 'You can\'t block yourself.';
      me.blocked ||= [];
      const i = me.blocked.indexOf(okey);
      if (on) {
        if (i < 0) {
          if (me.blocked.length >= 500) return 'Your block list is full.';
          me.blocked.push(okey);
        }
        for (const a of [me, other]) { a.friends ||= []; a.incoming ||= []; a.outgoing ||= []; }
        const drop = (list, k) => { const j = list.indexOf(k); if (j >= 0) list.splice(j, 1); };
        drop(me.friends, okey); drop(other.friends, meKey);
        drop(me.incoming, okey); drop(other.outgoing, meKey);
        drop(me.outgoing, okey); drop(other.incoming, meKey);
        accounts.save(okey, other);
      } else if (i >= 0) me.blocked.splice(i, 1);
      accounts.save(meKey, me);
      return null;
    },
    // the account keys this account has blocked
    blockedBy: async (key) => (await accounts.get(key))?.blocked || [],
    async addReport(rec) {
      const list = (await reports.get('_list')) || [];
      rec.id = crypto.randomBytes(6).toString('hex');
      list.push(rec);
      if (list.length > 200) list.splice(0, list.length - 200);
      reports.save('_list', list);
      return rec;
    },
    // open reports, newest first
    listReports: async () => ((await reports.get('_list')) || []).slice().reverse().slice(0, 30),
    async closeReport(id) {
      const list = (await reports.get('_list')) || [];
      const rec = list.find((r) => r.id === id);
      reports.save('_list', list.filter((r) => r.id !== id));
      return rec || null;
    },
    // staff: clear a bio, or turn down the picture on someone's cape or flag
    async clearBio(name) {
      const pr = await this.profileOf(name);
      if (!pr) return null;
      pr.bio = '';
      touch(pr);
      return pr;
    },
    async rejectImageOf(name) {
      const pr = await this.profileOf(name);
      if (!pr?.img) return null;
      const rec = await images.get(pr.img);
      if (rec) { rec.status = 'rejected'; images.save(pr.img, rec); }
      for (const t of rec?.tokens || [tokenOf(pr)]) {
        const o = await profiles.get(t);
        if (o && o.img === pr.img) { o.imgSt = 'rejected'; profiles.save(t, o); }
      }
      return rec?.tokens || [tokenOf(pr)];
    },

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
    // a picture for the image cape or flag: a small JPEG/PNG data URL. It waits for a moderator before anyone
    // else sees it (a picture turned down once can't be sent again).
    async setImage(pr, data) {
      if (!pr.owned.some((id) => COSMETIC[id]?.custom)) return 'Buy the image cape or the image flag first.';
      const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(data || ''));
      if (!m || m[2].length > 60000) return 'That picture is too big, or not a picture.';
      const id = crypto.createHash('sha256').update(m[2]).digest('hex').slice(0, 24);
      let rec = await images.get(id);
      if (rec?.status === 'rejected') return 'A moderator already turned that picture down.';
      if (!rec) rec = { data: String(data), status: 'pending', by: pr.name || 'a guest', at: Date.now(), tokens: [] };
      if (!rec.tokens.includes(tokenOf(pr))) rec.tokens.push(tokenOf(pr));
      images.save(id, rec);
      pr.img = id;
      pr.imgSt = rec.status;
      touch(pr);
      if (rec.status === 'pending') {
        const idx = (await images.get('_pending')) || [];
        if (!idx.includes(id)) { idx.push(id); images.save('_pending', idx.slice(-200)); }
      }
      return null;
    },
    // what's waiting for a moderator (oldest first)
    async pendingImages() {
      const idx = (await images.get('_pending')) || [];
      const recs = await images.getMany(idx);
      return idx.map((id, i) => (recs[i]?.status === 'pending' ? { id, by: recs[i].by, at: recs[i].at, data: recs[i].data } : null)).filter(Boolean).slice(0, 12);
    },
    // a moderator's decision; returns the tokens of the profiles wearing it so their looks can be redrawn
    async judgeImage(id, ok, by) {
      const rec = await images.get(String(id));
      if (!rec || rec.status !== 'pending') return null;
      rec.status = ok ? 'ok' : 'rejected';
      rec.judged = { by, at: Date.now() };
      images.save(String(id), rec);
      const idx = (await images.get('_pending')) || [];
      images.save('_pending', idx.filter((x) => x !== id));
      for (const t of rec.tokens || []) {
        const pr = await profiles.get(t);
        if (pr && pr.img === id) { pr.imgSt = rec.status; profiles.save(t, pr); }
      }
      return rec.tokens || [];
    },
    // the picture itself, only once approved
    async imageData(id) {
      const rec = await images.get(String(id));
      return rec?.status === 'ok' ? rec.data : null;
    },
    buy(pr, id) {
      const item = COSMETIC[id];
      if (!item || item.hidden) return 'There is no such item.';
      if (pr.owned.includes(id)) return 'You already own that.';
      if (pr.coins < item.price) return `You need ${item.price - pr.coins} more coins.`;
      pr.coins -= item.price;
      pr.owned.push(id);
      if (item.slot !== 'emote') pr.eq[item.slot] = id; // wear it straight away (emotes just go on the wheel)
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
