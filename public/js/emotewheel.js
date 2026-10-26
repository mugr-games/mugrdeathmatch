// The emote wheel (0): every emote round a ring. With the mouse captured, moving it points at one and a
// click picks it; the number keys pick one straight away; on a touch screen, tap one.
import { EMOTES } from './cosmetics.js';
import { esc } from './hud.js';

const TAU = Math.PI * 2;

export class EmoteWheel {
  // pick(id): start that emote
  constructor(pick) {
    this.pick = pick;
    this.open = false;
    this.cur = -1;
    this.vx = this.vy = 0;
    const n = EMOTES.length;
    const el = (this.el = document.createElement('div'));
    el.id = 'emotewheel';
    el.hidden = true;
    el.innerHTML = `<div class="ew-ring">${EMOTES.map((e, i) => {
      const a = -Math.PI / 2 + (i / n) * TAU;
      return `<button type="button" class="ew-item" data-i="${i}" style="left:${(50 + Math.cos(a) * 34).toFixed(1)}%;top:${(50 + Math.sin(a) * 34).toFixed(1)}%"><b>${i + 1}</b>${esc(e.name)}</button>`;
    }).join('')}<div class="ew-mid">EMOTES<small>Point and click, or press 1–${n}.<br>Move to stop. 0 closes.</small></div></div>`;
    document.body.append(el);
    for (const b of el.querySelectorAll('.ew-item')) {
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.choose(+b.dataset.i); });
      b.addEventListener('pointerenter', () => this.highlight(+b.dataset.i));
    }
  }

  toggle(on = !this.open) {
    this.open = on;
    this.el.hidden = !on;
    this.vx = this.vy = 0;
    this.highlight(-1);
  }

  // mouse movement while it's open: points from the middle toward a slice
  mouse(dx, dy) {
    this.vx += dx;
    this.vy += dy;
    const r = Math.hypot(this.vx, this.vy);
    if (r > 120) { this.vx *= 120 / r; this.vy *= 120 / r; }
    if (r < 25) return this.highlight(-1);
    const n = EMOTES.length, a = (((Math.atan2(this.vy, this.vx) + Math.PI / 2) % TAU) + TAU) % TAU;
    this.highlight(Math.round((a / TAU) * n) % n);
  }

  highlight(i) {
    this.cur = i;
    this.el.querySelectorAll('.ew-item').forEach((b, j) => b.classList.toggle('on', j === i));
  }

  click() {
    if (this.cur >= 0) this.choose(this.cur);
    else this.toggle(false);
  }

  key(n) {
    if (n >= 1 && n <= EMOTES.length) this.choose(n - 1);
  }

  choose(i) {
    this.toggle(false);
    this.pick(EMOTES[i].id);
  }
}
