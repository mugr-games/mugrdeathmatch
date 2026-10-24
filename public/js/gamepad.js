// Gamepad support through the browser's Gamepad API (Xbox, PlayStation and most other controllers use the
// "standard" layout). In a match it feeds fwd/side/buttons to the game like the keyboard does; in the menus
// the d-pad or left stick moves between buttons, A presses, B goes back and Start resumes.
//
// Left stick move (click it to sprint) · right stick look (click it to rocket jump) · RT fire · LT aim · A jump ·
// B crouch (hold) · X reload · Y use · LB / RB or d-pad left / right switch weapon · d-pad up last weapon ·
// Back scores · Start menu
import { BTN } from './pmove.js';

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const DEAD = 0.16;
const LOOK_SPEED = 75; // degrees per second at full tilt and sensitivity 1

function stick(x, y) {
  const m = Math.hypot(x, y);
  if (m < DEAD) return [0, 0];
  const k = Math.min(1, (m - DEAD) / (1 - DEAD)) / m;
  return [x * k, y * k];
}

export class GamepadInput {
  // opts: { look(dyaw, dpitch) in degrees, sens(), weapon(dir), lastWeapon(), menu(), start(), back() }
  constructor(opts) {
    this.opts = opts;
    this.fwd = 0;
    this.side = 0;
    this.buttons = 0;
    this.scores = false;
    this.active = false; // a controller has been used recently
    this.sprint = false;
    this.prev = [];
    this.repeat = 0; // menu navigation auto-repeat timer
  }

  reset() {
    this.fwd = this.side = this.buttons = 0;
    this.scores = false;
  }

  pad() {
    const list = navigator.getGamepads ? [...navigator.getGamepads()] : [];
    return list.find((g) => g && g.connected && g.mapping === 'standard') || list.find((g) => g && g.connected) || null;
  }

  // call every frame; playing: a match is on screen and the menu is closed
  poll(dt, playing) {
    const p = this.pad();
    if (!p) { this.reset(); this.active = false; return; }
    const down = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.4));
    const now = p.buttons.map((_, i) => down(i));
    const hit = (i) => now[i] && !this.prev[i];
    const axes = p.axes || [];
    const [lx, ly] = stick(axes[0] || 0, axes[1] || 0);
    const [rx, ry] = stick(axes[2] || 0, axes[3] || 0);
    if (now.some(Boolean) || lx || ly || rx || ry) this.active = true;

    if (playing) {
      this.fwd = -ly;
      this.side = lx;
      if (hit(B.L3)) this.sprint = !this.sprint;
      if (Math.hypot(lx, ly) < 0.3) this.sprint = false; // let go of the stick: stop sprinting
      let b = 0;
      if (now[B.RT]) b |= BTN.ATTACK;
      if (now[B.LT]) b |= BTN.ATTACK2;
      if (now[B.A]) b |= BTN.JUMP;
      if (now[B.B]) b |= BTN.DUCK;
      if (now[B.R3]) b |= BTN.ROCKETJUMP;
      if (now[B.X]) b |= BTN.RELOAD;
      if (now[B.Y]) b |= BTN.USE;
      if (this.sprint) b |= BTN.SPRINT;
      this.buttons = b;
      this.scores = now[B.BACK];
      // look: a curved response so small tilts aim finely and full tilt turns fast
      if (rx || ry) {
        const s = LOOK_SPEED * this.opts.sens() * dt;
        this.opts.look(-rx * Math.abs(rx) * s * 1.6, ry * Math.abs(ry) * s);
      }
      if (hit(B.LB) || hit(B.LEFT)) this.opts.weapon(-1);
      if (hit(B.RB) || hit(B.RIGHT)) this.opts.weapon(1);
      if (hit(B.UP)) this.opts.lastWeapon();
      if (hit(B.START)) this.opts.menu();
    } else {
      this.reset();
      // menus: move focus with the d-pad or left stick (held: repeats), A presses, B backs out
      let dir = 0;
      if (now[B.UP] || ly < -0.6) dir = -1;
      if (now[B.DOWN] || ly > 0.6) dir = 1;
      let side = 0;
      if (now[B.LEFT] || lx < -0.6) side = -1;
      if (now[B.RIGHT] || lx > 0.6) side = 1;
      this.repeat -= dt;
      if ((dir || side) && this.repeat <= 0) {
        if (dir) menuMove(dir);
        else menuAdjust(side);
        this.repeat = this.repeat < -0.5 ? 0.35 : 0.14; // first step waits longer
      }
      if (!dir && !side) this.repeat = -1;
      if (hit(B.A)) document.activeElement?.click?.();
      if (hit(B.B)) this.opts.back();
      if (hit(B.START)) this.opts.start();
    }
    this.prev = now;
  }
}

// the buttons and fields a controller can reach: the open dialog's, or the main menu's
function focusables() {
  const dlgs = [...document.querySelectorAll('.dialog:not([hidden])')];
  const root = dlgs[dlgs.length - 1] || document.getElementById('menu');
  if (!root || root.hidden) return [];
  return [...root.querySelectorAll('button, select, input, [tabindex]')].filter((el) => !el.disabled && el.offsetParent !== null && el.tabIndex !== -1);
}

function menuMove(dir) {
  const els = focusables();
  if (!els.length) return;
  const i = els.indexOf(document.activeElement);
  const next = els[i < 0 ? (dir > 0 ? 0 : els.length - 1) : (i + dir + els.length) % els.length];
  next.focus();
  next.scrollIntoView?.({ block: 'nearest' });
}

// left / right changes a dropdown or slider; elsewhere it moves focus like up / down
function menuAdjust(side) {
  const el = document.activeElement;
  if (el && el.tagName === 'SELECT') {
    el.selectedIndex = Math.max(0, Math.min(el.options.length - 1, el.selectedIndex + side));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el && el.tagName === 'INPUT' && el.type === 'range') {
    side > 0 ? el.stepUp() : el.stepDown();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else menuMove(side);
}
