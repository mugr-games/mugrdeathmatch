// The cosmetics catalogue, shared by the server (prices, ownership) and the client (shop, wardrobe, drawing).
// Cosmetics only change looks. Coins: 10 per kill, 100 for winning a team deathmatch or capture the flag match.

export const COIN_KILL = 10;
export const COIN_TEAM_WIN = 100;

export const COS_SLOTS = { hat: 'Hats', back: 'Back', glow: 'Visor glow' };

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
  { id: 'cape', slot: 'back', name: 'Cape', price: 200 },
  { id: 'banner', slot: 'back', name: 'Back banner', price: 300 },
  { id: 'jetpack', slot: 'back', name: 'Jetpack', price: 450 },
  { id: 'wings', slot: 'back', name: 'Wings', price: 800 },
  { id: 'glow_red', slot: 'glow', name: 'Red', price: 60, color: '#ff2e2e' },
  { id: 'glow_green', slot: 'glow', name: 'Green', price: 60, color: '#3dff6a' },
  { id: 'glow_pink', slot: 'glow', name: 'Pink', price: 90, color: '#ff4fd8' },
  { id: 'glow_gold', slot: 'glow', name: 'Gold', price: 150, color: '#ffc21a' },
  { id: 'glow_white', slot: 'glow', name: 'White', price: 150, color: '#ffffff' },
  { id: 'glow_rainbow', slot: 'glow', name: 'Rainbow', price: 700, color: 'rainbow' },
];

export const COSMETIC = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
