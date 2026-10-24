// Where the game server is. Normally the page and the server share an address. A copy of the page hosted
// somewhere else (GitHub Pages, built by tools/build_pages.mjs) names its server in <meta name="game-server">.
const named = document.querySelector('meta[name="game-server"]')?.content?.trim();
export const SERVER = (named || location.origin).replace(/\/+$/, '');

// a server address: api('/api/info')
export const api = (path) => SERVER + path;

// the multiplayer socket
export const socketUrl = () => SERVER.replace(/^http/, 'ws');

// this page's own address, for invite links (keeps a GitHub Pages path like /mugr-deathmatch/)
export const pageUrl = () => location.origin + location.pathname;
