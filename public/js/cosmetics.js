// The cosmetics catalogue, shared by the server (prices, ownership) and the client (shop, wardrobe, drawing).
// Cosmetics only change looks. Coins: 10 per kill, 100 for winning a team deathmatch or capture the flag match.

import { WEAPONS, WEAPON_INDEX, WEAPON_PRICE } from './weapons.js';

export const COIN_KILL = 10;
export const COIN_TEAM_WIN = 100;

export const COS_SLOTS = { hat: 'Hats', back: 'Back', glow: 'Visor glow', skin: 'Suit skins', wskin: 'Gun skins', charm: 'Gun charms', menu: 'Menu theme', emote: 'Emotes', body: 'Body', weapon: 'Weapons' };

export const COSMETICS = [
  // helmets take the wearer's suit colours; free to pick up in the shop
  { id: 'helmet_visor', slot: 'hat', name: 'Courier helmet', price: 0 },
  { id: 'helmet_combat', slot: 'hat', name: 'Combat helmet', price: 0 },
  { id: 'helmet_heavy', slot: 'hat', name: 'Heavy helmet', price: 0 },
  { id: 'cap', slot: 'hat', name: 'Ball cap', price: 50 },
  { id: 'beanie', slot: 'hat', name: 'Beanie', price: 80 },
  { id: 'headphones', slot: 'hat', name: 'Headphones', price: 120 },
  { id: 'party', slot: 'hat', name: 'Party hat', price: 150 },
  { id: 'cone', slot: 'hat', name: 'Traffic cone', price: 200 },
  { id: 'horns', slot: 'hat', name: 'Horns', price: 250 },
  { id: 'tophat', slot: 'hat', name: 'Top hat', price: 300 },
  { id: 'halo', slot: 'hat', name: 'Halo', price: 600 },
  { id: 'crown', slot: 'hat', name: 'Crown', price: 1000 },
  { id: 'maska', slot: 'hat', name: 'Heavy visor helmet', price: 1200 },
  // body extras: in the wearer's own suit colour (or suit skin)
  { id: 'big_butt', slot: 'body', name: 'Big butt', price: 300 },
  { id: 'cape', slot: 'back', name: 'Cape', price: 200 },
  { id: 'banner', slot: 'back', name: 'Back banner', price: 300 },
  { id: 'jetpack', slot: 'back', name: 'Jetpack', price: 450 },
  { id: 'wings', slot: 'back', name: 'Wings', price: 800 },
  // your own picture (checked automatically, then approved by a moderator before anyone else sees it)
  { id: 'image_cape', slot: 'back', name: 'Custom image cape', price: 1500, custom: true },
  { id: 'image_flag', slot: 'back', name: 'Custom image flag', price: 1200, custom: true },
  { id: 'glow_red', slot: 'glow', name: 'Red', price: 60, color: '#ff2e2e' },
  { id: 'glow_green', slot: 'glow', name: 'Green', price: 60, color: '#3dff6a' },
  { id: 'glow_pink', slot: 'glow', name: 'Pink', price: 90, color: '#ff4fd8' },
  { id: 'glow_gold', slot: 'glow', name: 'Gold', price: 150, color: '#ffc21a' },
  { id: 'glow_white', slot: 'glow', name: 'White', price: 150, color: '#ffffff' },
  { id: 'glow_rainbow', slot: 'glow', name: 'Rainbow', price: 700, color: 'rainbow' },
  // suit skins: the whole suit in a finish (finish: a pattern from skins.js). Not shown in team games,
  // where the team colour has to show.
  { id: 'skin_woodland', slot: 'skin', name: 'Woodland camo', price: 500, finish: 'woodland', color: '#4d5a32' },
  { id: 'skin_arctic', slot: 'skin', name: 'Arctic camo', price: 600, finish: 'arctic', color: '#dfe6ea' },
  { id: 'skin_digital', slot: 'skin', name: 'Digital camo', price: 700, finish: 'digital', color: '#3a5f8a' },
  { id: 'skin_candy', slot: 'skin', name: 'Candy stripe', price: 800, finish: 'candy', color: '#ff6fb5' },
  { id: 'skin_carbon', slot: 'skin', name: 'Carbon fibre', price: 900, finish: 'carbon', color: '#1d1f24' },
  { id: 'skin_tiger', slot: 'skin', name: 'Tiger stripe', price: 900, finish: 'tiger', color: '#f08a1c' },
  { id: 'skin_toxic', slot: 'skin', name: 'Toxic', price: 1100, finish: 'toxic', color: '#6cff3a' },
  { id: 'skin_lava', slot: 'skin', name: 'Molten lava', price: 1400, finish: 'lava', color: '#ff5a10' },
  { id: 'skin_neon', slot: 'skin', name: 'Neon grid', price: 1500, finish: 'neon', color: '#00e5ff' },
  { id: 'skin_galaxy', slot: 'skin', name: 'Galaxy', price: 1600, finish: 'galaxy', color: '#5a2a9a' },
  { id: 'skin_chrome', slot: 'skin', name: 'Chrome', price: 1800, finish: 'chrome', color: '#dfe4ea' },
  { id: 'skin_gold', slot: 'skin', name: 'Gold plated', price: 2000, finish: 'gold', color: '#e8b021' },
  // gun skins: every gun you hold, in a finish
  { id: 'wskin_woodland', slot: 'wskin', name: 'Woodland camo', price: 250, finish: 'woodland', color: '#4d5a32' },
  { id: 'wskin_arctic', slot: 'wskin', name: 'Arctic camo', price: 300, finish: 'arctic', color: '#dfe6ea' },
  { id: 'wskin_digital', slot: 'wskin', name: 'Digital camo', price: 350, finish: 'digital', color: '#3a5f8a' },
  { id: 'wskin_carbon', slot: 'wskin', name: 'Carbon fibre', price: 400, finish: 'carbon', color: '#1d1f24' },
  { id: 'wskin_candy', slot: 'wskin', name: 'Candy stripe', price: 400, finish: 'candy', color: '#ff6fb5' },
  { id: 'wskin_tiger', slot: 'wskin', name: 'Tiger stripe', price: 450, finish: 'tiger', color: '#f08a1c' },
  { id: 'wskin_toxic', slot: 'wskin', name: 'Toxic', price: 600, finish: 'toxic', color: '#6cff3a' },
  { id: 'wskin_lava', slot: 'wskin', name: 'Molten lava', price: 750, finish: 'lava', color: '#ff5a10' },
  { id: 'wskin_neon', slot: 'wskin', name: 'Neon grid', price: 800, finish: 'neon', color: '#00e5ff' },
  { id: 'wskin_galaxy', slot: 'wskin', name: 'Galaxy', price: 900, finish: 'galaxy', color: '#5a2a9a' },
  { id: 'wskin_chrome', slot: 'wskin', name: 'Chrome', price: 1000, finish: 'chrome', color: '#dfe4ea' },
  { id: 'wskin_gold', slot: 'wskin', name: 'Gold plated', price: 1200, finish: 'gold', color: '#e8b021' },
  // gun charms: a trinket hanging off the side of every gun (charm: the model in skins.js)
  { id: 'charm_dice', slot: 'charm', name: 'Lucky die', price: 150, charm: 'dice' },
  { id: 'charm_duck', slot: 'charm', name: 'Rubber duck', price: 150, charm: 'duck' },
  { id: 'charm_heart', slot: 'charm', name: 'Heart', price: 150, charm: 'heart' },
  { id: 'charm_pizza', slot: 'charm', name: 'Pizza slice', price: 150, charm: 'pizza' },
  { id: 'charm_skull', slot: 'charm', name: 'Skull', price: 200, charm: 'skull' },
  { id: 'charm_eightball', slot: 'charm', name: 'Eight ball', price: 200, charm: 'eightball' },
  { id: 'charm_star', slot: 'charm', name: 'Gold star', price: 250, charm: 'star' },
  { id: 'charm_crown', slot: 'charm', name: 'Little crown', price: 400, charm: 'crown' },
  { id: 'charm_mugr', slot: 'charm', name: 'MUGR logo', price: 500, charm: 'mugr' },
  // menu themes: the menus and HUD in another colour instead of the orange (accent and accent2: the
  // gradient's two ends)
  { id: 'menu_mono', slot: 'menu', name: 'Steel', price: 100, color: '#d8dde3', accent: '#e4e8ec', accent2: '#9aa3ad' },
  { id: 'menu_crimson', slot: 'menu', name: 'Crimson', price: 150, color: '#ff3b4a', accent: '#ff4d5a', accent2: '#c4122a' },
  { id: 'menu_toxic', slot: 'menu', name: 'Toxic green', price: 150, color: '#7cff3a', accent: '#8dff4a', accent2: '#2fbf1a' },
  { id: 'menu_ice', slot: 'menu', name: 'Ice blue', price: 150, color: '#4fd2ff', accent: '#5fd8ff', accent2: '#1a7cff' },
  { id: 'menu_teal', slot: 'menu', name: 'Teal', price: 150, color: '#2fe0c0', accent: '#3fe8c8', accent2: '#0f9c86' },
  { id: 'menu_purple', slot: 'menu', name: 'Royal purple', price: 200, color: '#b46bff', accent: '#c07bff', accent2: '#7a2cff' },
  { id: 'menu_pink', slot: 'menu', name: 'Hot pink', price: 200, color: '#ff5fc8', accent: '#ff6fcf', accent2: '#ff2a8a' },
  { id: 'menu_gold', slot: 'menu', name: 'Gold', price: 250, color: '#ffd84a', accent: '#ffe066', accent2: '#e0a400' },
  // not sold: only the owner account has it
  { id: 'owner_cape', slot: 'back', name: 'Owner cape', price: 0, hidden: true },
  // staff: given with the role, never sold
  { id: 'admin_hat', slot: 'hat', name: 'Admin hat', price: 0, hidden: true },
  { id: 'mod_visor', slot: 'hat', name: 'Mod visor', price: 0, hidden: true },
  { id: 'goated_cape', slot: 'back', name: 'GOATED cape', price: 0, hidden: true },
];

export const COSMETIC = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));

// Emotes, picked from the wheel (0). Bought in the shop (price in coins; 0: everyone has it). bpm: the music's
// tempo, which the moves keep to; loop: dances go on until you move, the others play once (len seconds);
// song: its music, a file in sounds/emotes/ (without one, or if it won't load, a loop made by the synth
// plays). The moves are in emotes.js.
export const EMOTES = [
  { id: 'griddy', name: 'The Griddy', price: 400, bpm: 140, loop: true },
  { id: 'clark', name: 'Captain Clark', price: 600, bpm: 103.4, loop: true, song: 'clark.mp3' },
  { id: 'verity', name: 'Lord Verity', price: 600, bpm: 105.2, loop: true, song: 'verity.mp3' },
  { id: 'architect', name: 'The Architect', price: 800, bpm: 117.5, loop: true, song: 'architect.mp3' },
  { id: 'wave', name: 'Wave', price: 0, bpm: 120, len: 2.6 },
  { id: 'dab', name: 'Dab', price: 200, bpm: 120, len: 2.2 },
];
export const EMOTE = Object.fromEntries(EMOTES.map((e) => [e.id, e]));
// in the shop as emote_<id>; owned: the profile's owned items. Staff and the owner have them all.
for (const e of EMOTES) if (e.price) COSMETICS.push({ id: 'emote_' + e.id, slot: 'emote', name: e.name, price: e.price });
for (const c of COSMETICS) if (c.slot === 'emote') COSMETIC[c.id] = c;
// weapons for your loadout, in the shop as wpn_<id> (owning one puts it in your armoury, not on you)
const title = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
for (const [id, price] of Object.entries(WEAPON_PRICE)) {
  const W = WEAPONS[WEAPON_INDEX[id]];
  if (W) COSMETICS.push((COSMETIC['wpn_' + id] = { id: 'wpn_' + id, slot: 'weapon', name: title(W.name), price, weapon: id }));
}
export const hasEmote = (id, owned = [], staff = false) => !!EMOTE[id] && (!EMOTE[id].price || staff || owned.includes('emote_' + id));
