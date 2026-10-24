# MUGR DEATHMATCH

A multiplayer deathmatch that runs in the browser. Nothing to install for players: they open the link.
Movement is tuned to Garry's Mod sandbox defaults; the server is authoritative with client prediction and
lag-compensated hit detection.

## Run a server

The easiest way on Windows is the standalone `Deathmatch Server.exe`: it contains Node, the server and every
game file, so it runs on a PC with nothing installed. Double-click it to start the server, open the game and
print the links to share (an internet link for friends too when `cloudflared` is installed). Build it with:

```
npm install
node tools/build_exe.mjs
```

It is written to `dist/`. Models can go in a `models` folder beside the .exe.

From source instead, with Node 18+:

On Windows, double-click `Run Game.exe` to start the server in the background and open the game at
http://localhost:8027. Keep the `public/` and `node_modules/` folders beside the launcher. The launcher
is in this repository's root folder.

```
npm install
npm start
```

Open http://localhost:8027. To let friends join over the internet without port forwarding, run a
Cloudflare quick tunnel and send them the https link it prints:

```
cloudflared tunnel --url http://localhost:8027
```

Settings (environment variables): `PORT` (default 8027), `MAPS` (rotation, default `csdm,foundry`),
`FRAGLIMIT` (30), `TIMELIMIT` in minutes (15).

## Online hosting (free): a GitHub link plus a Render server

The game page lives on GitHub Pages at `https://<your-username>.github.io/<repo>`. GitHub Pages only serves
files, so the multiplayer server runs on Render's free plan and the page connects to it.

1. Push this folder to a public GitHub repository (free GitHub Pages needs a public repository).
2. On render.com, sign in with GitHub, choose New → Blueprint, pick the repository and apply (`render.yaml`
   describes the server). Note the address it gets, like `https://mugr-deathmatch.onrender.com`.
3. In the GitHub repository: Settings → Secrets and variables → Actions → Variables, add `GAME_SERVER_URL` with
   that address. Then Settings → Pages → Source: GitHub Actions, and re-run the "Publish the game page"
   workflow from the Actions tab.
4. Optional but recommended, so coins survive: Render's free servers lose their files when they sleep (after
   15 idle minutes) or restart. Create a free Redis database on upstash.com, then in Render open the service →
   Environment and add `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from the database's REST API
   section. Without them, coins and cosmetics reset whenever the server restarts.

The free server sleeps when nobody has played for 15 minutes; the page wakes it, which takes about a minute.
Every push redeploys both. Coins belong to the browser and the address: share one link (the GitHub one).

## Models

Put downloaded models in `public/models/`, named after their slot: `player`, `crowbar`, `pistol`, `revolver`,
`smg`, `rifle`, `shotgun`, `medkit`, `armor`, `ammo`, `crate`, `barrels`. Each can be a `.glb`, `.gltf` or `.fbx`
file, or a folder of that name holding one (e.g. `public/models/pistol/scene.gltf`). The loader turns them to
face forward and scales them; anything missing uses a built-in stand-in. Refresh the page after adding files.

The Sketchfab picks and their authors are listed in `public/js/assets.js` and on the in-game Credits screen.
They are CC BY 4.0, so keep the credits when you share the game.

## Maps

- `foundry`: an original arena defined in `public/js/arena.js`.
- `csdm`: "CS Death Match Map Minecraft" by alpez791 (CC BY 4.0), geometry only, surfaced with this game's shaders.

To add a block-built map model, convert it into collision, spawns and item spots, then add its folder name to `MAPS`:

```
node tools/build_map.mjs public/maps/<name>/<model>.fbx public/maps/<name>/map.json "<Display name>"
```

Only use map models you're allowed to share: everything in `public/` is sent to every player.

## Controls

WASD move · Space jump · Ctrl/C crouch · Shift sprint · Alt slow-walk · Mouse aim/fire · R reload ·
Q rocket jump · 1–4 weapon slots · mouse wheel switch weapon · X last weapon · Tab scores · Y chat · Esc menu

Rocket jump: Q sets off a small blast at your feet that throws you up and the way you're moving. It works with
any weapon, costs a few health points, knocks back anyone next to you, and recharges in 2.5 seconds.

Phones and tablets (turn sideways): touch the left side for a move stick (push it all the way forward to
sprint), drag on the right side to look, and use the on-screen buttons for fire, aim, jump, duck (toggle),
reload, E, RJ (rocket jump), weapon switching, scores, chat and pause. Tap a line to pick a team or vote for a map.
Add `?touch=1` to the address to try the touch controls on a computer.

Gamepads: left stick move (click it to sprint), right stick look (click it to rocket jump), RT fire, LT aim, A jump, B crouch, X reload,
Y use, LB / RB or d-pad left / right switch weapon, d-pad up last weapon, Back scores, Start menu. In the menus
the d-pad moves between buttons, A presses, B goes back and Start resumes the game.

## Coins and cosmetics

Every kill pays 10 coins, and every player on the winning team of a team deathmatch or capture the flag match
gets 100. Spend them in the Shop on hats (including three free helmets), back items and visor glows, then
put them on in the Wardrobe. There are no accounts: each browser keeps a secret save code, and the server
stores coins and items in `data/profiles.json` (beside the .exe in the standalone build).

## Graphics

Options → Graphics: Potato (old or slow devices: no shadows, effects or bump mapping), Low, Medium (bloom, soft shadows), High (adds ambient occlusion and sharper
shadows). Surfaces are procedural shaders computed on the GPU; sounds are synthesised in the browser.
