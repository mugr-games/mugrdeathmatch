// Phone and tablet controls: a floating move stick on the left, drag anywhere on the right to look, and
// on-screen buttons. The game reads fwd/side/buttons from here the same way it reads the keyboard.
import { BTN } from './pmove.js';

// a phone or tablet (a laptop with a touch screen still has a mouse); ?touch=1 forces it on for testing
export const isTouch = () => /[?&]touch=1/.test(location.search) || matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);

// [id, label, button bit or action]; held buttons set a bit while pressed, the others act once on tap
const BUTTONS = [
  ['fire', 'FIRE', BTN.ATTACK],
  ['aim', 'AIM', BTN.ATTACK2],
  ['jump', 'JUMP', BTN.JUMP],
  ['rj', 'RJ', BTN.ROCKETJUMP],
  ['duck', 'DUCK', 'duck'],
  ['reload', 'R', BTN.RELOAD],
  ['use', 'E', BTN.USE],
  ['prev', '‹', 'prev'],
  ['next', '›', 'next'],
  ['scores', 'TAB', 'scores'],
  ['chat', 'SAY', 'chat'],
  ['emote', 'DANCE', 'emote'],
  ['phone', 'PHONE', 'phone'],
  ['menu', '❚❚', 'menu'],
];

export class TouchControls {
  // opts: { look(dx, dy), weapon(dir), chat(), menu() }
  constructor(opts) {
    this.opts = opts;
    this.fwd = 0;
    this.side = 0;
    this.buttons = 0;
    this.ducked = false;
    this.scores = false;
    this.stick = null; // { id, x, y }
    this.lookers = new Map(); // pointerId -> { x, y }
    this.held = new Map(); // pointerId -> bit

    const el = (this.el = document.createElement('div'));
    el.id = 'touch';
    el.hidden = true;
    el.innerHTML = `<div class="stick" hidden><i></i></div>` +
      BUTTONS.map(([id, label]) => `<button type="button" class="tb tb-${id}" data-id="${id}" aria-label="${id}">${label}</button>`).join('');
    document.body.append(el);
    this.stickEl = el.querySelector('.stick');
    this.knob = this.stickEl.firstChild;

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, (e) => this.up(e));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  show(on) {
    this.el.hidden = !on;
    if (!on) this.reset();
  }

  reset() {
    this.fwd = this.side = this.buttons = 0;
    this.stick = null;
    this.stickEl.hidden = true;
    this.lookers.clear();
    this.held.clear();
    for (const b of this.el.querySelectorAll('.tb.on')) if (b.dataset.id !== 'duck' && b.dataset.id !== 'scores') b.classList.remove('on');
  }

  down(e) {
    e.preventDefault();
    // the phone and the shops sit under this layer: a tap on one goes to it
    const ui = !e.target.closest('.tb') && document.elementsFromPoint(e.clientX, e.clientY).find((el) => el.closest?.('#fp-phone, #fp-shop'));
    if (ui) { this.opts.tapUI?.(ui); return; }
    try { this.el.setPointerCapture(e.pointerId); } catch {}
    const b = e.target.closest('.tb');
    if (b) {
      const def = BUTTONS.find((d) => d[0] === b.dataset.id);
      const act = def[2];
      if (typeof act === 'number') {
        this.held.set(e.pointerId, act);
        b.classList.add('on');
        this.sync();
        // dragging off the fire button still turns the view, like most mobile shooters
        if (act === BTN.ATTACK) this.lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      } else this.tap(act, b);
      return;
    }
    if (e.clientX < innerWidth * 0.4 && !this.stick) {
      this.stick = { id: e.pointerId, x: e.clientX, y: e.clientY };
      Object.assign(this.stickEl.style, { left: e.clientX + 'px', top: e.clientY + 'px' });
      this.knob.style.transform = '';
      this.stickEl.hidden = false;
    } else this.lookers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  }

  move(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      const R = 56;
      let dx = e.clientX - this.stick.x, dy = e.clientY - this.stick.y;
      const d = Math.hypot(dx, dy);
      if (d > R) { dx *= R / d; dy *= R / d; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const dead = 0.15;
      const nx = dx / R, ny = -dy / R;
      this.side = Math.abs(nx) < dead ? 0 : nx;
      this.fwd = Math.abs(ny) < dead ? 0 : ny;
      // push the stick all the way forward to sprint
      this.sprint = d >= R * 0.98 && ny > 0.8;
      this.sync();
      return;
    }
    const l = this.lookers.get(e.pointerId);
    if (l) {
      this.opts.look(e.clientX - l.x, e.clientY - l.y);
      l.x = e.clientX;
      l.y = e.clientY;
    }
  }

  up(e) {
    if (this.stick && e.pointerId === this.stick.id) {
      this.stick = null;
      this.stickEl.hidden = true;
      this.fwd = this.side = 0;
      this.sprint = false;
    }
    this.lookers.delete(e.pointerId);
    const bit = this.held.get(e.pointerId);
    if (bit !== undefined) {
      this.held.delete(e.pointerId);
      if (![...this.held.values()].includes(bit)) {
        const def = BUTTONS.find((d) => d[2] === bit);
        this.el.querySelector(`.tb-${def[0]}`).classList.remove('on');
      }
    }
    this.sync();
  }

  tap(act, b) {
    if (act === 'duck') { this.ducked = !this.ducked; b.classList.toggle('on', this.ducked); }
    else if (act === 'scores') { this.scores = !this.scores; b.classList.toggle('on', this.scores); }
    else if (act === 'prev') this.opts.weapon(-1);
    else if (act === 'next') this.opts.weapon(1);
    else if (act === 'chat') this.opts.chat();
    else if (act === 'emote') this.opts.emote();
    else if (act === 'phone') this.opts.phone?.();
    else if (act === 'menu') this.opts.menu();
    this.sync();
  }

  sync() {
    let bits = 0;
    for (const v of this.held.values()) bits |= v;
    if (this.ducked) bits |= BTN.DUCK;
    if (this.sprint) bits |= BTN.SPRINT;
    this.buttons = bits;
  }
}
