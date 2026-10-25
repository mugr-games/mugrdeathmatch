// Validates code-built maps: spawns/items/props/flags clear of geometry, and every jump pad lands on solid ground.
import { BoxWorld } from '../public/js/collide.js';
import { pmove, newPlayerState } from '../public/js/pmove.js';
import { CODE_MAPS } from '../public/js/mapdefs.js';
const HULL = [[-16, -16, 0], [16, 16, 72]];
for (const [id, m] of Object.entries(CODE_MAPS)) {
  const w = new BoxWorld(m.boxes, m.pads);
  const issues = [];
  const stuck = (o, mins = HULL[0], maxs = HULL[1]) => w.trace(o, o, mins, maxs).startsolid;
  const floating = (o) => w.trace(o, [o[0], o[1], o[2] - 40], HULL[0], HULL[1]).fraction === 1;
  m.spawns.forEach((s, i) => { if (stuck(s.origin)) issues.push(`spawn ${i} stuck ${s.origin}`); else if (floating(s.origin)) issues.push(`spawn ${i} floating ${s.origin}`); });
  m.items.forEach((t, i) => { const o = [t.o[0], t.o[1], t.o[2] + 2]; if (stuck(o, [-10, -10, 0], [10, 10, 20])) issues.push(`item ${t.kind} stuck ${t.o}`); else if (w.trace(o, [o[0], o[1], o[2] - 30], [-2, -2, 0], [2, 2, 2]).fraction === 1) issues.push(`item ${t.kind} floating ${t.o}`); });
  (m.props || []).forEach((p, i) => { const o = [p.o[0], p.o[1], p.o[2] + 2]; if (stuck(o, [-20, -20, 0], [20, 20, 40])) issues.push(`prop ${p.kind} stuck ${p.o}`); });
  for (const [team, f] of Object.entries(m.flags || {})) { const o = [f[0], f[1], f[2] + 1]; if (stuck(o, [-12, -12, 0], [12, 12, 60])) issues.push(`flag ${team} stuck ${f}`); else if (floating(o)) issues.push(`flag ${team} floating ${f}`); }
  // the heist: where guards, staff and the things you use stand (doors shut)
  if (m.heist) {
    const hw = new BoxWorld([...m.boxes, ...(m.doors || []).map((d) => ({ ...d, mat: 'door' }))], m.pads);
    const spot = (o, what) => { const q = [o[0], o[1], (o[2] || 0) + 1]; if (hw.trace(q, q, HULL[0], HULL[1]).startsolid) issues.push(`${what} stuck ${o}`); else if (hw.trace(q, [q[0], q[1], q[2] - 40], HULL[0], HULL[1]).fraction === 1) issues.push(`${what} floating ${o}`); };
    const H = m.heist;
    H.guards.forEach((g, i) => { if (g.o) spot(g.o, `guard ${i}`); (g.route || []).forEach((r, k) => spot(r, `guard ${i} route ${k}`)); });
    H.staff.forEach((s, i) => { spot(s.o, `staff ${i}`); (s.route || []).forEach((r, k) => spot(r, `staff ${i} route ${k}`)); });
    for (const k of ['terminal', 'wiring', 'panel']) spot(H[k], k);
    H.alarms.forEach((a, i) => spot(a, `alarm ${i}`));
    H.phones.forEach((a, i) => spot(a, `phone ${i}`));
    H.police.forEach((a, i) => spot(a, `police spawn ${i}`));
    H.carts.forEach((a, i) => spot(a, `cart spot ${i}`));
    H.boxes.forEach((a, i) => spot(a, `deposit spot ${i}`));
    for (const [k, list] of Object.entries(H.doorUse)) list.forEach((a, i) => spot(a, `door ${k} use ${i}`));
  }
  // jump pads: step onto each pad and see where the player comes down
  (m.pads || []).forEach((p, i) => {
    const c = [(p.mins[0] + p.maxs[0]) / 2, (p.mins[1] + p.maxs[1]) / 2, p.maxs[2] - 3];
    const ps = newPlayerState(c);
    let airborne = false, t = 0;
    for (; t < 600; t++) { pmove(w, ps, { fwd: 0, side: 0, buttons: 0, yaw: 0, pitch: 0 }, 1 / 60); if (!ps.onGround) airborne = true; if (airborne && ps.onGround) break; if (ps.origin[2] < m.killZ) break; }
    if (!airborne || ps.origin[2] < m.killZ || t >= 600) issues.push(`pad ${i} at ${c.map(Math.round)} -> ${ps.origin.map(Math.round)} (fell or never landed)`);
  });
  console.log(`${id}: ${m.boxes.length} boxes, ${m.spawns.length} spawns, ${m.items.length} items, ${(m.props || []).length} props, ${(m.pads || []).length} pads -> ${issues.length ? issues.length + ' problems' : 'OK'}`);
  issues.forEach((x) => console.log('   ' + x));
}
