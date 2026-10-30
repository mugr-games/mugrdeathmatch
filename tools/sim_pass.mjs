// Battle pass rules, on a throwaway save file: XP reaches tiers, each tier gives its free reward once, the
// premium track costs coins and hands over everything up to your tier, and nothing is given twice.
//   node tools/sim_pass.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createProfiles } from '../profiles.js';
import { BATTLE_PASS, COSMETIC } from '../public/js/cosmetics.js';

delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.OWNER_PASSWORD;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mugr-pass-'));
const P = createProfiles(path.join(dir, 'profiles.json'));
const fail = [];
const check = (ok, what) => { if (!ok) fail.push(what); };

const pr = await P.load('a'.repeat(32));
const B = BATTLE_PASS, T = B.xpPerTier;
check(P.view(pr).bp.xp === 0 && !P.view(pr).bp.prem, 'starts at 0 XP, free only');

// a little XP: no tier yet
check(P.passXp(pr, T - 1) === null, 'no tier before 1000 XP');
// one more point: tier 1, its free reward
const coins0 = pr.coins;
const up1 = P.passXp(pr, 1);
check(up1?.tier === 1 && up1.got.length === 1 && up1.got[0] === B.tiers[0][0], 'tier 1 gives the free reward');
check(pr.coins === coins0 + 50, 'tier 1 free coins paid');

// several tiers at once: every free reward in between, items owned
const up = P.passXp(pr, T * 5);
check(up?.tier === 6, 'jumps to tier 6');
check(pr.owned.includes('charm_bp_dogtag') && pr.owned.includes('wskin_bp_hazard'), 'free items from tiers 2 and 6 owned');
check(!pr.owned.includes('wskin_bp_circuit'), 'premium item not given without premium');

// premium: too poor, then bought, catching up on tiers 1 to 6
pr.coins = 100;
check(/more coins/.test(P.buyPass(pr) || ''), 'premium refused without enough coins');
pr.coins = B.premiumPrice;
check(P.buyPass(pr) === null, 'premium bought');
const premCoins = B.tiers.slice(0, 6).map((t) => t[1]).filter((r) => r.startsWith('coins:')).reduce((n, r) => n + +r.slice(6), 0);
check(pr.coins === premCoins, `paid exactly the price and got the premium coins (${pr.coins} vs ${premCoins})`);
for (const [, r] of B.tiers.slice(0, 6)) if (!r.startsWith('coins:')) check(pr.owned.includes(r), 'premium item ' + r);
check(P.buyPass(pr) === 'You already have the premium pass.', 'premium only once');

// to the end: everything owned exactly once, XP past the last tier gives nothing more
P.passXp(pr, T * 100);
const all = B.tiers.flat().filter((r) => !r.startsWith('coins:'));
for (const id of all) check(pr.owned.filter((x) => x === id).length === 1, 'owned once: ' + id);
check(P.passXp(pr, T * 10) === null, 'no more tiers after 30');
check(P.view(pr).bp.f === 30 && P.view(pr).bp.p === 30, 'both tracks complete');

// pass items can be worn but not bought
check(P.equip(pr, 'skin', 'skin_bp_mugrhex') === null, 'pass suit skin can be worn');
check(P.buy(pr, 'wskin_bp_void') !== null && COSMETIC.wskin_bp_void.hidden, 'pass items are not for sale');

await P.flush();
fs.rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ tier: P.view(pr).bp, owned: pr.owned.length, fail }, null, 1));
console.log(fail.length ? 'FAIL' : 'PASS');
process.exit(fail.length ? 1 : 0);
