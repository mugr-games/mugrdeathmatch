// Weapon table shared by server (damage, timing, ammo, projectiles) and client (HUD, viewmodel, sounds).
// slot = number key (0 → key 1). proj = fired as a simulated projectile instead of an instant trace.
// pierce = the shot goes through players (up to the first wall). zombie = only zombies get it, never a pickup.

export const WEAPONS = [
  { id: 'crowbar', slot: 0, name: 'CROWBAR', melee: true, damage: 25, rate: 0.4, range: 75, clip: -1, ammo: null },
  { id: 'pistol', slot: 1, name: 'PISTOL', damage: 10, rate: 0.12, semi: true, spread: 0.01, clip: 18, ammo: 'pistol', maxAmmo: 150, spawnAmmo: 54, reload: 1.4 },
  { id: '357', slot: 1, name: 'REVOLVER', damage: 75, rate: 0.75, semi: true, spread: 0, clip: 6, ammo: '357', maxAmmo: 12, spawnAmmo: 6, reload: 3.0 },
  { id: 'smg1', slot: 2, name: 'SMG', damage: 12, rate: 0.075, spread: 0.045, clip: 45, ammo: 'smg1', maxAmmo: 225, spawnAmmo: 90, reload: 1.6 },
  { id: 'ar2', slot: 2, name: 'RIFLE', damage: 11, rate: 0.1, spread: 0.03, clip: 30, ammo: 'ar2', maxAmmo: 90, spawnAmmo: 60, reload: 1.6 },
  { id: 'shotgun', slot: 3, name: 'SHOTGUN', damage: 9, rate: 0.75, semi: true, spread: 0.09, pellets: 7, clip: 6, ammo: 'buckshot', maxAmmo: 30, spawnAmmo: 12, reload: 0.5, shellReload: true },
  {
    id: 'crossbow', slot: 3, name: 'CROSSBOW', damage: 100, rate: 0.4, semi: true, spread: 0, clip: 1, ammo: 'bolt', maxAmmo: 10, spawnAmmo: 5, reload: 1.4, autoReload: true,
    proj: { kind: 'bolt', speed: 3500, gravity: 0.08, radius: 0, direct: 100 },
  },
  { id: 'sniper', slot: 3, name: 'SNIPER', damage: 85, rate: 1.2, semi: true, spread: 0.05, zoomSpread: 0, zoom: 22, clip: 5, ammo: 'sniper', maxAmmo: 20, spawnAmmo: 10, reload: 2.2 },
  {
    id: 'rpg', slot: 4, name: 'ROCKETS', damage: 120, rate: 0.9, semi: true, spread: 0, clip: 1, ammo: 'rocket', maxAmmo: 5, spawnAmmo: 3, reload: 1.6, autoReload: true,
    proj: { kind: 'rocket', speed: 1100, gravity: 0, radius: 220, splash: 120, direct: 40, knock: 900 },
  },
  {
    id: 'grenade', slot: 4, name: 'GRENADE', damage: 125, rate: 0.8, semi: true, spread: 0, clip: 1, ammo: 'grenade', maxAmmo: 5, spawnAmmo: 2, reload: 0.6, autoReload: true,
    proj: { kind: 'grenade', speed: 750, up: 120, gravity: 1, bounce: 0.45, fuse: 2.5, radius: 250, splash: 125, knock: 700 },
  },
  { id: 'lmg', slot: 2, name: 'MACHINE GUN', damage: 13, rate: 0.068, spread: 0.06, clip: 100, ammo: 'lmg', maxAmmo: 300, spawnAmmo: 100, reload: 3.2 },
  { id: 'autoshotgun', slot: 3, name: 'AUTO SHOTGUN', damage: 7, rate: 0.26, spread: 0.11, pellets: 6, clip: 8, ammo: 'buckshot', maxAmmo: 30, spawnAmmo: 8, reload: 2.4 },
  { id: 'railgun', slot: 4, name: 'RAILGUN', damage: 90, rate: 1.4, semi: true, spread: 0, clip: 4, ammo: 'cells', maxAmmo: 12, spawnAmmo: 4, reload: 2.5, pierce: true },
  { id: 'claws', slot: 0, name: 'FISTS', melee: true, damage: 40, rate: 0.5, range: 70, clip: -1, ammo: null, zombie: true },
  // more melee (key 1 again to switch between them): quick and short, or slow and heavy
  { id: 'knife', slot: 0, name: 'KNIFE', melee: true, damage: 30, rate: 0.3, range: 62, clip: -1, ammo: null },
  { id: 'bat', slot: 0, name: 'BASEBALL BAT', melee: true, damage: 40, rate: 0.55, range: 84, clip: -1, ammo: null },
  { id: 'katana', slot: 0, name: 'KATANA', melee: true, damage: 55, rate: 0.55, range: 92, clip: -1, ammo: null },
  { id: 'axe', slot: 0, name: 'FIRE AXE', melee: true, damage: 65, rate: 0.8, range: 82, clip: -1, ammo: null },
  { id: 'sledge', slot: 0, name: 'SLEDGEHAMMER', melee: true, damage: 90, rate: 1.1, range: 86, clip: -1, ammo: null },
];

export const WEAPON_INDEX = Object.fromEntries(WEAPONS.map((w, i) => [w.id, i]));
export const SLOT_COUNT = 5;

// Room setting: what everyone spawns with.
export const LOADOUTS = {
  default: { name: 'Standard (crowbar, pistol, SMG)', weapons: ['crowbar', 'pistol', 'smg1'], full: false },
  all: { name: 'Everything, full ammo', weapons: WEAPONS.filter((w) => !w.zombie).map((w) => w.id), full: true },
  melee: { name: 'Melee only (crowbar, knife, bat, katana, axe, sledgehammer)', weapons: ['knife', 'bat', 'katana', 'axe', 'sledge', 'crowbar'], full: false, noPickups: true },
  explosives: { name: 'Explosives', weapons: ['crowbar', 'rpg', 'grenade'], full: true },
  snipers: { name: 'Snipers & revolvers', weapons: ['crowbar', 'sniper', '357'], full: true },
  heavy: { name: 'Heavy (machine gun, auto shotgun, railgun)', weapons: ['crowbar', 'lmg', 'autoshotgun', 'railgun'], full: true },
  zombies: { name: 'Zombies start (knife, pistol)', weapons: ['crowbar', 'pistol'], full: false, hidden: true },
};

// power: a timed boost (seconds). overheal: health can go past 100 up to this.
export const ITEMS = {
  health: { heal: 25, respawn: 20 },
  vial: { heal: 10, respawn: 15 },
  battery: { armor: 15, respawn: 20 },
  ammo: { ammo: true, respawn: 15 },
  megahealth: { heal: 100, overheal: 200, respawn: 60 },
  heavyarmor: { armor: 50, respawn: 40 },
  damage: { power: 'dmgBoost', secs: 20, respawn: 60, name: 'DOUBLE DAMAGE' },
  haste: { power: 'haste', secs: 15, respawn: 45, name: 'HASTE' },
  boots: { power: 'boots', secs: 20, respawn: 45, name: 'JUMP BOOTS' },
};
export const POWERS = { dmgBoost: { mul: 2 }, haste: { mul: 1.35 }, boots: { mul: 1.6 } };

// Pickup kinds handed out to a map's item spots, in order (the important ones first, small maps get fewer spots).
export const ITEM_ROTATION = [
  'health', 'battery', 'shotgun', 'ammo', 'damage', '357', 'crossbow', 'lmg', 'vial', 'rpg', 'haste', 'sniper', 'autoshotgun', 'health',
  'grenade', 'megahealth', 'railgun', 'heavyarmor', 'ar2', 'boots', 'ammo', 'battery', 'shotgun', 'vial', 'rpg', 'health',
  'katana', 'bat', 'sledge', 'knife', 'axe',
];

// Zombies (infection): what a zombie is like
export const ZOMBIE = { hp: 200, firstHp: 400, speed: 1.15 };

// Zombies (rounds, co-op): what things cost and what perks do. bit = the perk's flag in a player's perk set.
export const PERKS = {
  jugg: { bit: 1, name: 'Juggernog', cost: 2500, color: '#d8342a', what: 'more health' },
  speed: { bit: 2, name: 'Speed Cola', cost: 3000, color: '#36c95a', what: 'faster reloads' },
  double: { bit: 4, name: 'Double Tap', cost: 2000, color: '#e8b43a', what: 'faster fire' },
  quick: { bit: 8, name: 'Quick Revive', cost: 1500, color: '#3a8ad2', what: 'faster revives, solo self-revive' },
  stamina: { bit: 16, name: 'Stamin-Up', cost: 2000, color: '#e8782a', what: 'run faster' },
};
export const WALL_COST = { '357': 500, smg1: 1000, ar2: 1200, crossbow: 1250, shotgun: 1500, sniper: 1500, autoshotgun: 2000, lmg: 3000, grenade: 250 };
export const BOX_COST = 950;
export const BOX_POOL = ['357', 'smg1', 'ar2', 'shotgun', 'crossbow', 'sniper', 'rpg', 'grenade', 'lmg', 'autoshotgun', 'railgun', 'katana', 'sledge'];
// Free roam gun shop: [weapon, price, price of a full refill of its ammo]
export const GUN_SHOP = [
  ['pistol', 250, 40], ['357', 700, 90], ['smg1', 1500, 120], ['shotgun', 1300, 100], ['ar2', 3000, 180], ['autoshotgun', 4200, 220],
  ['crossbow', 2200, 150], ['sniper', 5000, 260], ['lmg', 7500, 320], ['grenade', 600, 300], ['rpg', 9500, 900], ['railgun', 15000, 700],
  ['knife', 150, 0], ['bat', 300, 0], ['axe', 800, 0], ['sledge', 1000, 0], ['katana', 1200, 0],
];
export const ARMOR_PRICE = 400;
export const DROP_NAMES = { maxammo: 'MAX AMMO', instakill: 'INSTA-KILL', double: 'DOUBLE POINTS', nuke: 'KABOOM' };
