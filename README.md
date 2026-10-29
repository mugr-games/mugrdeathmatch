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

## Online hosting (free): Koyeb

The game server (which also serves the game page) runs on Koyeb's free instance. It needs an always-on Node
server with WebSockets, so hosts that only run short functions (Vercel, Netlify, Cloudflare Pages) can't run it.

1. Push this folder to a GitHub repository.
2. On koyeb.com, sign in with GitHub and choose Create Web Service → GitHub, then pick the repository and the
   `main` branch. Leave the builder on Buildpack: it finds `package.json` and runs `npm start`. Pick the Free
   instance. Under Ports keep 8000 (HTTP, path `/`): Koyeb passes it to the server in `PORT`.
3. Under Environment variables add these (never put their values in a file in the repository):
   - `OWNER_PASSWORD`: the password for the owner account `watermelon` (1,000,000 coins and the Owner cape).
     The server creates the account when it starts; change the variable to change the password. Nobody can
     register that name.
   - `DISCORD_WEBHOOK_URL`: moderation reports. In Discord, open a channel's settings → Integrations → Webhooks →
     New Webhook → Copy Webhook URL. Filtered chat and direct messages, bans, unbans and kicks are posted there.
     Keep that address private: anyone with it can post to the channel.
   - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: strongly recommended, so accounts and coins
     survive. Free servers lose their files when they sleep or restart. Create a free Redis database on
     upstash.com and copy these from its REST API section. Without them, accounts, coins and cosmetics reset
     whenever the server restarts.
4. Deploy. The game is at the address Koyeb gives the service, like `https://<service>-<org>.koyeb.app`.

Every push to `main` redeploys. The free instance sleeps after an hour with nobody connected and wakes when
someone opens the page. Guests' coins belong to the browser and the address; signed-in players keep theirs on
any device.

Optional GitHub Pages copy of the page: in the GitHub repository, Settings → Secrets and variables → Actions →
Variables, add `GAME_SERVER_URL` with the server's address, then Settings → Pages → Source: GitHub Actions. The
"Publish the game page" workflow publishes `https://<your-username>.github.io/<repo>`, which connects to that
server.

`render.yaml` still describes the same server for Render (New → Blueprint), with the same environment variables.

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

## Friends, messages and moderation

Signed-in players add friends by account name, see who's online and which game they're in (with a Join
button), and send each other direct messages (friends only; the last 100 per pair are kept).

Every chat line, direct message and name goes through `filter.js`: swearing is starred out, while slurs, hate
and telling someone to hurt themselves are blocked. Both kinds are reported to the Discord webhook.

The owner (`watermelon`) has an **Owner menu** in the main menu:

- **Players**: everyone online, with Kick, Ban, Mute (for a set number of minutes), and in a match Slay, Heal,
  give every gun, and (in your own game) Go to and Bring.
- **Accounts**: every registered account (searchable), with coins and join date. Open one to give, take or set
  coins, give or remove any cosmetic (including the Owner cape), see their stats, and ban or unban them.
- **Server**: a big announcement to everyone online; your own God mode and Infinite ammo; and for your current
  match: change the map, end it, add or remove bots. It also shows whether saving works.
- **Bans**: everyone banned, with Unban.

Coin, cosmetic, mute and ban changes are posted to the Discord webhook. In a match the same bans work from chat: `/kick name [reason]`, `/ban name [reason]`,
`/unban name`, `/bans`. A ban covers the player's account, their browser's save code and their internet
address, so it sticks when they make a new account (it can also catch others sharing that connection).

## Stats and leaderboard

Every player's kills, deaths, headshots, wins, matches, best kill streak, zombie kills, best zombie round and
coins earned are kept on their profile (guests' stats move into their account when they sign in). The menu's
Leaderboard shows the top 50 signed-in players for kills, wins, K/D (from 20 kills), best streak, zombie kills
and coins earned, next to your own stats. A win is being on the winning team, or top scorer in deathmatch.

## Coins and cosmetics

Every kill pays 10 coins, and every player on the winning team of a team deathmatch or capture the flag match
gets 100. Spend them in the Shop on hats (including three free helmets), back items and visor glows, then
put them on in the Wardrobe. There are no accounts: each browser keeps a secret save code, and the server
stores coins and items in `data/profiles.json` (beside the .exe in the standalone build).

## Graphics

Options → Graphics: Potato (old or slow devices: no shadows, effects or bump mapping), Low, Medium (bloom, soft shadows), High (adds ambient occlusion and sharper
shadows). Surfaces are procedural shaders computed on the GPU; sounds are synthesised in the browser.
