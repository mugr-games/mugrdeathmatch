// Builds the game page for GitHub Pages: the files in public/ plus three.js, with the online game server's
// address filled in (the page is static; the server runs elsewhere, e.g. Render). Run after `npm ci`:
//   GAME_SERVER_URL=https://mugr-deathmatch.onrender.com node tools/build_pages.mjs _site
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.resolve(process.argv[2] || '_site');
const server = (process.env.GAME_SERVER_URL || '').trim().replace(/\/+$/, '');
if (!/^https?:\/\/[^/\s"<>]+$/.test(server)) {
  console.error('Set GAME_SERVER_URL to the game server\'s address, like https://mugr-deathmatch.onrender.com');
  console.error('On GitHub: repository Settings → Secrets and variables → Actions → Variables → New repository variable.');
  process.exit(1);
}

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(path.join(ROOT, 'public'), out, { recursive: true });
// three.js, served by the game server at /vendor when it hosts the page itself
const three = path.join(ROOT, 'node_modules/three');
fs.mkdirSync(path.join(out, 'vendor'), { recursive: true });
fs.copyFileSync(path.join(three, 'build/three.module.js'), path.join(out, 'vendor/three.module.js'));
fs.cpSync(path.join(three, 'examples/jsm'), path.join(out, 'vendor/addons'), { recursive: true });

const index = path.join(out, 'index.html');
const html = fs.readFileSync(index, 'utf8');
let filled = html.replace('<meta name="game-server" content="">', `<meta name="game-server" content="${server}">`);
if (filled === html) { console.error('index.html has no <meta name="game-server" content=""> to fill in'); process.exit(1); }
// link previews need absolute addresses; PAGE_URL comes from actions/configure-pages
const page = (process.env.PAGE_URL || '').trim().replace(/\/+$/, '');
if (/^https?:\/\/[^\s"<>]+$/.test(page)) filled = withPageUrl(filled, page);
else console.warn('PAGE_URL not set: link previews will have no picture');
fs.writeFileSync(index, filled);
fs.writeFileSync(path.join(out, '.nojekyll'), '');
console.log(`Built ${out} for the game server at ${server}`);

function withPageUrl(text, base) {
  return text.replace('<meta property="og:image" content="preview.png">', `<meta property="og:image" content="${base}/preview.png">`)
    .replace('<meta property="og:url" content="">', `<meta property="og:url" content="${base}/">`);
}
