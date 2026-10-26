// The solid boxes of every cell must come out the same whether or not the visual details are built
// (the server builds without them, the browser draws with them). Usage: node tools/check_city_same.mjs
import { N, genCell } from '../public/js/citygen.js';
let bad = 0;
for (let i = -N; i < N; i++) for (let j = -N; j < N; j++) {
  const a = JSON.stringify(genCell(i, j, false).boxes), b = JSON.stringify(genCell(i, j, true).boxes);
  if (a !== b && bad++ < 5) console.log('differs', i, j);
}
console.log(bad ? `${bad} cells differ` : 'all cells match');
process.exit(bad ? 1 : 0);
