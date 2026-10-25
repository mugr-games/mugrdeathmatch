// Headless check of free roam traffic: stand still for a while and watch every car near you. Reports how many
// kept moving, how fast, and which sat still the longest (stuck). Usage: node tools/smoke_traffic.mjs <port> [seconds]
import WebSocket from 'ws';
const port = process.argv[2] || 8027, secs = +(process.argv[3] || 45);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ws = new WebSocket(`ws://localhost:${port}`);
const cars = new Map(), peds = new Map();
let snap = null, events = {};
ws.on('message', (d) => {
  const m = JSON.parse(d);
  if (m.t !== 's') return;
  snap = m;
  for (const e of m.ev) events[e.e] = (events[e.e] || 0) + 1;
  for (const r of m.fv || []) {
    let c = cars.get(r[0]);
    if (!c) cars.set(r[0], (c = { id: r[0], k: r[1], first: m.st, samples: 0, still: 0, maxStill: 0, stillSince: null, sum: 0, police: !!(r[9] & 128), path: 0, last: [r[2], r[3]] }));
    const sp = Math.hypot(r[6], r[7]);
    c.samples++; c.sum += sp;
    c.path += Math.hypot(r[2] - c.last[0], r[3] - c.last[1]); c.last = [r[2], r[3]];
    if (sp < 20) { c.stillSince ??= m.st; c.maxStill = Math.max(c.maxStill, m.st - c.stillSince); } else c.stillSince = null;
    c.lastSeen = m.st;
  }
  for (const r of m.fn || []) {
    let p = peds.get(r[0]);
    if (!p) peds.set(r[0], (p = { first: [r[1], r[2]], last: null, kind: r[5] & 3 }));
    p.last = [r[1], r[2]];
  }
});
await new Promise((r) => ws.on('open', r));
ws.send(JSON.stringify({ t: 'join', room: 'FREEROAM', name: 'TrafficWatch', color: 1 }));
let seq = 0;
const t0 = Date.now();
while (Date.now() - t0 < secs * 1000) { ws.send(JSON.stringify({ t: 'c', c: [{ s: ++seq, f: 0, sd: 0, b: 0, y: 0, p: 0, ms: 16.67, rt: 0 }] })); await sleep(17); }
const list = [...cars.values()].filter((c) => c.samples > 20);
const stuck = list.filter((c) => c.maxStill > 15);
const pedMoved = [...peds.values()].map((p) => Math.hypot(p.last[0] - p.first[0], p.last[1] - p.first[1]));
console.log(JSON.stringify({
  me: snap.me.o.map(Math.round), carsSeen: cars.size, watched: list.length,
  avgSpeed: Math.round(list.reduce((n, c) => n + c.sum / c.samples, 0) / Math.max(1, list.length)),
  longestStill: list.map((c) => Math.round(c.maxStill)).sort((a, b) => b - a).slice(0, 8),
  stuck: stuck.map((c) => ({ id: c.id, k: c.k, at: c.last.map(Math.round), still: Math.round(c.maxStill), path: Math.round(c.path) })).slice(0, 6),
  people: peds.size, pedsMedianMoved: Math.round(pedMoved.sort((a, b) => a - b)[pedMoved.length >> 1] || 0), events,
}, null, 1));
process.exit(0);
