// Builds the standalone Windows server: "dist/Deathmatch Server.exe" holds Node, the server and every game file,
// so it runs on a PC with nothing installed. Uses Node's single executable application support.
// Usage: npm install, then node tools/build_exe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { inject } from 'postject';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const EXE = path.join(DIST, 'Deathmatch Server.exe');
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
fs.mkdirSync(DIST, { recursive: true });

// 1. the server and its modules as one CommonJS file (single executables run CommonJS)
await build({
  entryPoints: [path.join(ROOT, 'exe.js')], bundle: true, platform: 'node', format: 'cjs', target: 'node20',
  outfile: path.join(DIST, 'bundle.cjs'), external: ['bufferutil', 'utf-8-validate'], logLevel: 'error',
});

// 2. game files the browser downloads: all of public/ (models load from beside the .exe instead), three.js,
//    and the three.js addons the client imports plus whatever those import in turn
const assets = {};
const add = (f) => (assets[rel(f)] = f);
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) { if (rel(f) !== 'public/models') walk(f); } else add(f); } };
walk(path.join(ROOT, 'public'));
add(path.join(ROOT, 'node_modules/three/build/three.module.js'));
const JSM = path.join(ROOT, 'node_modules/three/examples/jsm');
const queue = [];
for (const f of fs.readdirSync(path.join(ROOT, 'public/js'))) {
  const src = fs.readFileSync(path.join(ROOT, 'public/js', f), 'utf8');
  for (const m of src.matchAll(/from 'three\/addons\/([^']+)'/g)) queue.push(path.join(JSM, m[1]));
}
while (queue.length) {
  const f = queue.pop();
  if (assets[rel(f)]) continue;
  add(f);
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/(?:from|import)\s*'(\.{1,2}\/[^']+)'/g)) queue.push(path.join(path.dirname(f), m[1]));
}

// 3. the blob Node embeds, then a copy of node.exe with the blob injected
const config = path.join(DIST, 'sea-config.json');
const blob = path.join(DIST, 'sea-prep.blob');
fs.writeFileSync(config, JSON.stringify({ main: path.join(DIST, 'bundle.cjs'), output: blob, disableExperimentalSEAWarning: true, assets }, null, 1));
execFileSync(process.execPath, ['--experimental-sea-config', config], { stdio: 'inherit' });
fs.copyFileSync(process.execPath, EXE);
await inject(EXE, 'NODE_SEA_BLOB', fs.readFileSync(blob), { sentinelFuse: 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2' });
for (const f of [config, blob, path.join(DIST, 'bundle.cjs')]) fs.rmSync(f);
console.log(`built ${rel(EXE)}: ${Object.keys(assets).length} game files, ${(fs.statSync(EXE).size / 1048576).toFixed(0)} MB`);
