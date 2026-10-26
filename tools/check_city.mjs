// Prints the free roam county as text (one character per cell) and checks the places and the cost of a cell.
// Usage: node tools/check_city.mjs
import { N, district, D, PLACES, genCell, roadH, roadV, exits, hasSignal } from '../public/js/citygen.js';
const CH = { [D.OCEAN]: '~', [D.LAKE]: '=', [D.CITY]: '#', [D.SUBURB]: '+', [D.TOWN]: 'T', [D.BEACH]: '.', [D.FARM]: 'f', [D.FOREST]: '^', [D.DESERT]: ':', [D.FIELD]: ',', [D.MOUNTAIN]: 'M', [D.AIRPORT]: 'A', [D.AIRBASE]: 'B' };
const at = new Map(PLACES.map((p) => [p.i + ',' + p.j, p.type[0].toUpperCase()]));
for (let j = N - 1; j >= -N; j -= 1) {
  let row = '';
  for (let i = -N; i < N; i++) row += at.get(i + ',' + j) || CH[district(i, j)];
  console.log(row);
}
const count = {};
for (const p of PLACES) count[p.type] = (count[p.type] || 0) + 1;
console.log('places', count, 'bad', PLACES.filter((p) => ![D.CITY, D.TOWN, D.SUBURB, D.FARM, D.FIELD, D.DESERT, D.FOREST, D.BEACH].includes(district(p.i, p.j))).map((p) => p.type + '@' + p.i + ',' + p.j));
let boxes = 0, deco = 0, cells = 0, t0 = performance.now(), maxB = 0, signals = 0;
for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) {
  const c = genCell(i, j, true);
  boxes += c.boxes.length; deco += c.deco.length; cells++; maxB = Math.max(maxB, c.boxes.length); signals += c.signals.length;
}
console.log({ cells, boxes, deco, maxB, signals, msPerCell: ((performance.now() - t0) / cells).toFixed(3) });
// roads: how many nodes, how many dead ends
let nodes = 0, dead = 0;
for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) { const e = exits(i, j); if (e.length) nodes++; if (e.length === 1) dead++; }
console.log({ nodes, dead });
