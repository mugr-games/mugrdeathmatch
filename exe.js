// Entry point of the standalone server .exe (built by tools/build_exe.mjs): starts the game server, opens it
// in the browser, prints the links to share and, when cloudflared is installed, makes an internet link for friends.
// Closing the window stops everything.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ready } from './server.js';

process.title = 'MUGR DEATHMATCH server';
const line = '-'.repeat(64);

ready.then((port) => {
  const local = `http://localhost:${port}`;
  const lan = Object.values(os.networkInterfaces()).flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => `http://${a.address}:${port}`);
  console.log(`\n${line}\n  MUGR DEATHMATCH SERVER is running. Close this window to stop it.\n${line}`);
  console.log(`  You:                 ${local}`);
  for (const u of lan) console.log(`  Same Wi-Fi / LAN:    ${u}`);
  console.log(line);
  if (!process.env.NO_BROWSER) spawn('cmd', ['/c', 'start', '', local], { windowsHide: true, stdio: 'ignore' }).unref();
  tunnel(port);
});

// cloudflared from PATH, beside the .exe, or its usual install folders
function findCloudflared() {
  const dirs = [path.dirname(process.execPath), ...(process.env.PATH || '').split(path.delimiter),
    'C:\\Program Files (x86)\\cloudflared', 'C:\\Program Files\\cloudflared',
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links')];
  for (const d of dirs) {
    const f = path.join(d.replace(/"/g, ''), 'cloudflared.exe');
    if (d && fs.existsSync(f)) return f;
  }
  return null;
}

// A Cloudflare quick tunnel: a free https link to this server that works from anywhere, no port forwarding.
// It is kept alive: if cloudflared stops, or the link stops answering, a new tunnel (and new link) starts.
// The current link is always written to "FRIEND LINK.txt" beside the .exe.
const LINK_FILE = path.join(path.dirname(process.execPath), 'FRIEND LINK.txt');
let cf = null, stopping = false;
function tunnel(port) {
  const exe = findCloudflared();
  if (!exe) {
    console.log('  Internet link: install cloudflared to get one (then restart this server):');
    console.log('    winget install --id Cloudflare.cloudflared');
    console.log(`${line}\n`);
    return;
  }
  console.log('  Internet link:       starting...');
  const proc = (cf = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${port}`], { windowsHide: true }));
  let link = null, misses = 0, check = null;
  const scan = (d) => {
    const m = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/.exec(String(d));
    if (!m || link) return;
    link = m[0];
    console.log(`\n${line}\n  SEND THIS TO YOUR FRIENDS:  ${link}\n${line}\n`);
    try { fs.writeFileSync(LINK_FILE, `Send this link to your friends:\r\n\r\n${link}\r\n\r\n(updated ${new Date().toLocaleString()})\r\n`); } catch {}
    // every 2 minutes make sure the link still reaches us; three misses in a row and the tunnel is replaced
    check = setInterval(async () => {
      try {
        const r = await fetch(`${link}/api/info`, { signal: AbortSignal.timeout(15000) });
        misses = r.ok ? 0 : misses + 1;
      } catch { misses++; }
      if (misses >= 3) { console.log('  The internet link stopped answering. Making a new one...'); proc.kill(); }
    }, 120000);
  };
  proc.stdout.on('data', scan);
  proc.stderr.on('data', scan);
  proc.on('error', (e) => console.log(`  Internet link failed: ${e.message}`));
  proc.on('exit', () => {
    clearInterval(check);
    if (stopping) return;
    console.log('  The internet link stopped. Starting a new one in 10 seconds...');
    setTimeout(() => tunnel(port), 10000);
  });
}
const stop = () => { stopping = true; if (cf) cf.kill(); };
process.on('exit', stop);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { stop(); process.exit(0); });
// a bug in one game shouldn't take the whole server (and everyone's link) down with it
process.on('uncaughtException', (e) => console.error(`[error] ${new Date().toISOString()} ${e && e.stack || e}`));
process.on('unhandledRejection', (e) => console.error(`[error] ${new Date().toISOString()} ${e && e.stack || e}`));
