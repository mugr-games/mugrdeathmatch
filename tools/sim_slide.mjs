// Sliding: sprint on a flat floor, then crouch: you should shoot forward faster, glide, and slow to a crawl.
import { BoxWorld } from '../public/js/collide.js';
import { pmove, newPlayerState, BTN } from '../public/js/pmove.js';

const world = new BoxWorld([{ mins: [-20000, -2000, -64], maxs: [20000, 2000, 0] }], []);
const ps = newPlayerState([0, 0, 1]);
const dt = 1 / 60;
const step = (buttons, n) => { for (let i = 0; i < n; i++) pmove(world, ps, { fwd: 1, side: 0, buttons, yaw: 0, pitch: 0 }, dt); };
const speed = () => Math.round(Math.hypot(ps.velocity[0], ps.velocity[1]));
step(BTN.SPRINT, 90);
const run = speed();
step(BTN.SPRINT | BTN.DUCK, 1);
const start = speed(), sliding = ps.slide > 0;
step(BTN.SPRINT | BTN.DUCK, 30);
const mid = speed();
step(BTN.SPRINT | BTN.DUCK, 60);
const end = speed();
console.log({ run, start, sliding, mid, end, slideLeft: ps.slide });
const ok = run >= 380 && sliding && start > run && mid > 250 && end < 160;
console.log(ok ? 'PASS' : 'FAIL');
process.exit(ok ? 0 : 1);
