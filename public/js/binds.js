// Controls you can change (Options → Controls): each action's keyboard keys and controller button. The
// game asks held(keys, id) / isKey(code, id) / padFor(id) instead of naming keys itself. Changes are kept
// with the other settings in this browser.

// keys: keyboard codes (KeyboardEvent.code); pad: a button of the standard controller layout (-1: none);
// mouse: what the mouse does for it (not changeable). Movement on a controller is always the left stick.
export const ACTIONS = [
  { id: 'fwd', name: 'Move forward', keys: ['KeyW'], pad: -1 },
  { id: 'back', name: 'Move back', keys: ['KeyS'], pad: -1 },
  { id: 'left', name: 'Move left', keys: ['KeyA'], pad: -1 },
  { id: 'right', name: 'Move right', keys: ['KeyD'], pad: -1 },
  { id: 'jump', name: 'Jump', keys: ['Space'], pad: 0 },
  { id: 'duck', name: 'Crouch (sprint + crouch to slide)', keys: ['ControlLeft', 'KeyC'], pad: 1 },
  { id: 'sprint', name: 'Sprint', keys: ['ShiftLeft'], pad: 10 },
  { id: 'walk', name: 'Walk', keys: ['AltLeft'], pad: -1 },
  { id: 'attack', name: 'Fire', keys: [], pad: 7, mouse: 'Left click' },
  { id: 'aim', name: 'Aim down sights', keys: [], pad: 6, mouse: 'Right click' },
  { id: 'reload', name: 'Reload', keys: ['KeyR'], pad: 2 },
  { id: 'use', name: 'Use / get in', keys: ['KeyE'], pad: 3 },
  { id: 'rocketjump', name: 'Rocket jump', keys: ['KeyQ'], pad: 11 },
  { id: 'prevweapon', name: 'Previous weapon', keys: [], pad: 4, mouse: 'Wheel' },
  { id: 'nextweapon', name: 'Next weapon', keys: [], pad: 5, mouse: 'Wheel' },
  { id: 'lastweapon', name: 'Last weapon', keys: ['KeyX'], pad: 12 },
  { id: 'emote', name: 'Emote wheel', keys: ['Digit0', 'Numpad0'], pad: 13 },
  { id: 'third', name: 'Third person / car camera', keys: ['KeyF'], pad: -1 },
  { id: 'chat', name: 'Chat', keys: ['KeyT', 'KeyY'], pad: -1 },
  { id: 'scores', name: 'Scoreboard', keys: ['Tab'], pad: 8 },
  { id: 'phone', name: 'Phone (free roam)', keys: ['KeyP'], pad: -1 },
  { id: 'map', name: 'Big map (free roam)', keys: ['KeyM'], pad: -1 },
  { id: 'mask', name: 'Mask on (heists)', keys: ['KeyG'], pad: -1 },
  { id: 'horn', name: 'Horn', keys: ['KeyH'], pad: -1 },
];
export const ACTION = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

// your changes: { id: { keys?: [...], pad?: n } } (only what differs from the defaults)
let custom = {};
export function setBinds(b) { custom = b && typeof b === 'object' ? b : {}; }
export function getBinds() { return custom; }

export const keysFor = (id) => custom[id]?.keys ?? ACTION[id]?.keys ?? [];
export const padFor = (id) => custom[id]?.pad ?? ACTION[id]?.pad ?? -1;
export const isKey = (code, id) => keysFor(id).includes(code);
// held(keys, id): any of the action's keys in a set of held key codes
export const held = (keys, id) => keysFor(id).some((c) => keys.has(c));

// a key or button for an action. A key or button another action had is taken from it (no double binds).
export function bindKey(id, code) {
  for (const a of ACTIONS) if (a.id !== id && keysFor(a.id).includes(code)) custom[a.id] = { ...custom[a.id], keys: keysFor(a.id).filter((c) => c !== code) };
  custom[id] = { ...custom[id], keys: code ? [code] : [] };
}
export function bindPad(id, button) {
  for (const a of ACTIONS) if (a.id !== id && padFor(a.id) === button) custom[a.id] = { ...custom[a.id], pad: -1 };
  custom[id] = { ...custom[id], pad: button };
}
export function resetBinds() { custom = {}; }

// names to show
const KEY_NAMES = { Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt', Tab: 'Tab', Enter: 'Enter', Backspace: 'Backspace', CapsLock: 'Caps Lock', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\' };
export function keyName(code) {
  if (!code) return '';
  if (KEY_NAMES[code]) return KEY_NAMES[code];
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
}
export const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start', 'L3 (left stick)', 'R3 (right stick)', 'D-pad up', 'D-pad down', 'D-pad left', 'D-pad right'];
export const padName = (b) => (b >= 0 ? PAD_NAMES[b] || `Button ${b}` : '');
