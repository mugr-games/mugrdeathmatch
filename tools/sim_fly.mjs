// Flight model check: take off down a long flat strip, climb, turn, then fly level. Prints the flight.
// Usage: node tools/sim_fly.mjs [plane id]
import { BoxWorld } from '../public/js/collide.js';
import { VEHICLES, VEHICLE_INDEX, newCar, amove } from '../public/js/vehicle.js';
const id = process.argv[2] || 'skylark';
const world = new BoxWorld([{ mins: [-50000, -5000, -64], maxs: [50000, 5000, 0], mat: 'asphalt' }], [], 512);
const c = newCar(VEHICLE_INDEX[id], 1, [0, 0, 1], 0);
const V = VEHICLES[c.k];
let t = 0;
const log = (what) => console.log(what.padEnd(10), 't', t.toFixed(1), 'o', c.o.map(Math.round).join(','), 'speed', Math.round(Math.hypot(...c.v)), 'pitch', Math.round(c.pitch), 'roll', Math.round(c.roll), 'yaw', Math.round(c.yaw), 'g', c.g, c.dead ? 'DEAD' : '');
const run = (secs, cmd, every = 2) => { for (let k = 0; k < secs * 60; k++) { const r = amove(world, c, cmd(), 1 / 60); t += 1 / 60; if (r.crash) { log('CRASH'); return; } if (k % (every * 60) === 0) log(''); } };
run(12, () => ({ fwd: 1, side: 0, yaw: 0, pitch: c.g && Math.hypot(...c.v) > V.vr ? -12 : 0 }));
log('airborne?');
run(8, () => ({ fwd: 0, side: 0, yaw: 0, pitch: -20 }));
run(8, () => ({ fwd: 0, side: 0, yaw: 120, pitch: -5 }));
run(6, () => ({ fwd: 0, side: 0, yaw: 120, pitch: 0 }));
log('end');
