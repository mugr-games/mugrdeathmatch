// Phone and tablet controls: a floating move stick on the left, drag anywhere on the right to look, and
// on-screen buttons. The game reads fwd/side/buttons from here the same way it reads the keyboard.
import { BTN } from './pmove.js';

// a phone or tablet (a laptop with a touch screen still has a mouse); ?touch=1 forces it on for testing
export const isTouch = () => /[?&]touch=1/.test(location.search) || matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);

// small line icons for the buttons (24x24, drawn with the button's text colour)
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON = {
  fire: svg('<circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>'),
  aim: svg('<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M1 12h4M19 12h4"/>'),
  jump: svg('<path d="M12 20V5M6 11l6-6 6 6"/>'),
  duck: svg('<path d="M6 7l6 6 6-6M6 13l6 6 6-6"/>'),
  reload: svg('<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>'),
  use: svg('<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4a1.5 1.5 0 0 1 3 0v7M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a5 5 0 0 1-4-2l-2.6-3.6a1.5 1.5 0 0 1 2.3-1.9L8 14"/>'),
  rj: svg('<path d="M12 2c3 2.5 4 6 4 9v4H8v-4c0-3 1-6.5 4-9z"/><circle cx="12" cy="9" r="1.5"/><path d="M8 13l-3 3v3l3-2M16 13l3 3v3l-3-2M10 19l2 3 2-3"/>'),
  scores: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  chat: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
  emote: svg('<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5a4.5 4.5 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01" stroke-width="3"/>'),
  phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M11 18.5h2"/>'),
  menu: svg('<path d="M9 5v14M15 5v14" stroke-width="3"/>'),
};

// [id, label, button bit or action]; held buttons set a bit while pressed, the others act once on tap
const BUTTONS = [
  ['fire', ICON.fire, BTN.ATTACK],
  ['aim', ICON.aim + '<b>AIM</b>', 'aim'], // tap to aim, tap again to stop
  ['jump', ICON.jump, BTN.JUMP],
  ['rj', ICON.rj, BTN.ROCKETJUMP],
  ['duck', ICON.duck, 'duck'],
  ['reload', ICON.reload, BTN.RELOAD],
  ['use', ICON.use, BTN.USE],
  ['prev', '‹', 'prev'], // the two halves of the weapon box: previous and next weapon
  ['next', '›', 'next'],
  ['scores', ICON.scores, 'scores'],
  ['chat', ICON.chat, 'chat'],
  ['emote', ICON.emote, 'emote'],
  ['phone', ICON.phone, 'phone'],
  ['menu', ICON.menu, 'menu'],
];
const NAMES = { fire: 'Fire', aim: 'Aim', jump: 'Jump', rj: 'Rocket jump', duck: 'Duck', reload: 'Reload', use: 'Use', prev: 'Previous weapon', next: 'Next weapon', scores: 'Scores', chat: 'Chat', emote: 'Dance', phone: 'Phone', menu: 'Pause' };

export class TouchControls {
  // opts: { look(dx, dy), weapon(dir), chat(), menu() }
  constructor(opts) {
    this.opts = opts;
    this.fwd = 0;
    this.side = 0;
    this.buttons = 0;
    this.ducked = false;
    this.aimed = false;
    this.scores = false;
    this.stick = null; // { id, x, y }
    this.lookers = new Map(); // pointerId -> { x, y }
    this.held = new Map(); // pointerId -> bit

    const el = (this.el = document.createElement('div'));
    el.id = 'touch';
    el.hidden = true;
    el.innerHTML = `<div class="stick-home" aria-hidden="true"><i></i></div><div class="stick" hidden><i></i></div>` +
      BUTTONS.map(([id, label]) => `<button type="button" class="tb tb-${id}" data-id="${id}" aria-label="${NAMES[id]}">${label}</button>`).join('');
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
    this.el.classList.remove('moving');
    this.lookers.clear();
    this.held.clear();
    for (const b of this.el.querySelectorAll('.tb.on')) if (!['duck', 'aim', 'scores'].includes(b.dataset.id)) b.classList.remove('on');
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
      this.el.classList.add('moving');
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
      this.el.classList.remove('moving');
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
    if (act === 'aim') { this.aimed = !this.aimed; b.classList.toggle('on', this.aimed); }
    else if (act === 'duck') { this.ducked = !this.ducked; b.classList.toggle('on', this.ducked); }
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
    if (this.aimed) bits |= BTN.ATTACK2;
    if (this.sprint) bits |= BTN.SPRINT;
    this.buttons = bits;
  }
}
