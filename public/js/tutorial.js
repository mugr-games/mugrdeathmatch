// The starter tutorial: a few cards shown the first time someone opens the game (and from Options → How to
// play) covering the controls, the slot machine loadouts and coins. The keys shown are your own binds.
import { keysFor, keyName } from './binds.js';
import { esc } from './hud.js';

const SEEN = 'mugr.tutorial';
const key = (id) => `<kbd>${esc(keysFor(id).map(keyName).join(' / ') || '—')}</kbd>`;

function steps() {
  return [
    {
      title: 'Welcome to MUGR DEATHMATCH',
      body: `<p>Here's how to play. It takes a minute.</p>
        <ul class="tut-keys">
          <li>${key('fwd')}${key('left')}${key('back')}${key('right')} move · <kbd>mouse</kbd> look</li>
          <li><kbd>left click</kbd> shoot · <kbd>right click</kbd> aim down the sights</li>
          <li>${key('sprint')} sprint · ${key('jump')} jump · ${key('duck')} crouch (sprint and crouch to slide)</li>
          <li>${key('reload')} reload · ${key('use')} use / get in · <kbd>1–5</kbd> or the wheel to switch weapons</li>
          <li>${key('emote')} emotes · ${key('chat')} chat · ${key('scores')} scores</li>
        </ul>
        <p class="tut-dim">Change any key (or controller button) in Options → Controls. On a phone or tablet, use the buttons on screen.</p>`,
    },
    {
      title: 'The slot machine',
      body: `<p>In the main deathmatch, team and flag rooms there are <b>no guns lying around</b>. Every time you spawn, a <b>slot machine</b> rolls one weapon for each number key: <kbd>1</kbd> melee, <kbd>2</kbd> sidearm, <kbd>3</kbd> rifle or SMG, <kbd>4</kbd> shotgun or sniper, <kbd>5</kbd> an explosive.</p>
        <p>Watch the reels land at the top of the screen. Every life is a new roll, so you might get a railgun, a frying pan, or both.</p>
        <p class="tut-dim">Switch weapons with <kbd>1–5</kbd> or the mouse wheel. Free roam has its own gun shop in the city, heists give you your crew role's guns, and zombies sells guns off the walls.</p>`,
    },
    {
      title: 'Coins',
      body: `<p>Coins buy cosmetics in the Shop: hats, capes, suit and gun skins, charms, emotes and menu themes.</p>
        <p>Every kill earns <b>10 coins</b>; winning a team deathmatch or capture the flag match earns <b>100</b>. Sign in (top left) to keep them on any device.</p>`,
    },
    {
      title: 'Ready',
      body: `<p>Press <b>Play</b> and pick a room. Good luck out there.</p>
        <p class="tut-dim">You can see this again any time from Options → How to play.</p>`,
      last: true,
    },
  ];
}

export function showTutorial() {
  let el = document.getElementById('dlg-tutorial');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dlg-tutorial';
    el.className = 'dialog';
    el.setAttribute('role', 'dialog');
    document.body.append(el);
  }
  const S = steps();
  let i = 0;
  const close = () => { el.hidden = true; try { localStorage.setItem(SEEN, '1'); } catch {} };
  const draw = () => {
    const s = S[i];
    el.innerHTML = `<div class="tut-step">${i + 1} / ${S.length}</div><h2>${esc(s.title)}</h2>${s.body}
      <div class="actions">
        <button class="btn" data-t="skip">${s.last ? 'Close' : 'Skip'}</button>
        ${i ? '<button class="btn" data-t="back">Back</button>' : ''}
        ${s.last ? '<button class="btn primary" data-t="done">Let\'s play</button>' : '<button class="btn primary" data-t="next">Next</button>'}
      </div>`;
    el.querySelector('[data-t=skip]').onclick = close;
    el.querySelector('[data-t=back]')?.addEventListener('click', () => { i--; draw(); });
    el.querySelector('[data-t=next]')?.addEventListener('click', () => { i++; draw(); });
    el.querySelector('[data-t=done]')?.addEventListener('click', close);
    el.querySelector('.btn.primary')?.focus();
  };
  draw();
  el.hidden = false;
}

// the first time this browser opens the game
export function tutorialSeen() {
  try { return !!localStorage.getItem(SEEN); } catch { return true; }
}
