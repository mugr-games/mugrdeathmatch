// Browser client: rendering pipeline, input, prediction, interpolation, viewmodel, effects and UI glue.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BoxWorld, MASK_SHOT } from './collide.js';
import { pmove, newPlayerState, BTN, eyeHeight } from './pmove.js';
import { WEAPONS, WEAPON_INDEX, ITEMS } from './weapons.js';
import { initLoadout, weaponThink, spreadDirs, viewDir, unpackOwn, hitTest } from './sim.js';
import { loadMap } from './maps.js';
import { stepProj } from './projectiles.js';
import { makeSky, haloMaterial, setPotato } from './shaders.js';
import { loadSlot, instance, WEAPON_SLOT, ITEM_SLOT } from './assets.js';
import { Synth } from './synth.js';
import { Hud } from './hud.js';
import { Avatar, ZOMBIE_SKIN, MODELS } from './avatar.js';
import { Ragdoll } from './ragdoll.js';
import { ZombiesView } from './zview.js';
import { socketUrl } from './net.js';

const DEG = Math.PI / 180;
const INTERP = 0.1; // seconds behind the server for remote players
const TEAM_COLOR = { red: 3, blue: 1 }; // suit colour index for each team
const TEAM_RGB = { red: '#e0473a', blue: '#3a7fe0' };
const PROP_SIZE = { crate: { half: 20, h: 40 }, barrel: { half: 14, h: 40 } };

export const QUALITY = {
  // potato: for old phones and laptops. Draws at a third of the pixels with no shadows, post effects or
  // bump mapping, simpler lighting, and keeps fewer bodies and bullet holes around.
  potato: { pixel: 0.55, dprCap: 1, ao: false, bloom: false, shadow: 0, msaa: 0, potato: true, ragdolls: 3, decals: 25 },
  low: { pixel: 0.75, ao: false, bloom: false, shadow: 1024, msaa: 0 },
  medium: { pixel: 1, ao: false, bloom: true, shadow: 2048, msaa: 4 },
  high: { pixel: 1.5, ao: true, bloom: true, shadow: 4096, msaa: 4 },
};

function angDiff(a, b) {
  return ((b - a) % 360 + 540) % 360 - 180;
}

// Source-style model frame (X forward, Y left, Z up) -> camera frame (-Z forward, +Y up, +X right)
const TO_VIEW = new THREE.Matrix4().set(0, -1, 0, 0, 0, 0, 1, 0, -1, 0, 0, 0, 0, 0, 0, 1);

// ------------------------------------------------------------------ small procedural textures for effects
function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const GLOW = canvasTex(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,220,150,.8)'); r.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
const FLASH = canvasTex(128, (g, s) => {
  g.translate(s / 2, s / 2);
  for (let i = 0; i < 7; i++) {
    g.rotate((Math.PI * 2) / 7);
    const r = g.createLinearGradient(0, 0, s / 2, 0);
    r.addColorStop(0, 'rgba(255,240,200,1)'); r.addColorStop(1, 'rgba(255,150,40,0)');
    g.fillStyle = r;
    g.beginPath(); g.moveTo(0, -s * 0.06); g.lineTo(s * (0.3 + Math.random() * 0.2), 0); g.lineTo(0, s * 0.06); g.fill();
  }
  const r = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.22);
  r.addColorStop(0, 'rgba(255,255,240,1)'); r.addColorStop(1, 'rgba(255,180,80,0)');
  g.fillStyle = r; g.fillRect(-s / 2, -s / 2, s, s);
});
const HOLE = canvasTex(32, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(10,10,10,1)'); r.addColorStop(0.35, 'rgba(20,18,16,.9)'); r.addColorStop(0.6, 'rgba(40,36,32,.35)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});

// ------------------------------------------------------------------ explosive barrel (props)
function explosiveBarrel() {
  const red = new THREE.MeshStandardMaterial({ color: 0xa8261d, roughness: 0.5, metalness: 0.5 });
  const band = new THREE.MeshStandardMaterial({ color: 0xe8b400, roughness: 0.6, metalness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.5, metalness: 0.6 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(14, 14, 38, 20).rotateX(Math.PI / 2), red);
  body.position.z = 19;
  const b1 = new THREE.Mesh(new THREE.CylinderGeometry(14.3, 14.3, 4, 20).rotateX(Math.PI / 2), band);
  b1.position.z = 26;
  const b2 = b1.clone();
  b2.position.z = 12;
  const lid = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 1.5, 20).rotateX(Math.PI / 2), dark);
  lid.position.z = 38.5;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 2, 8).rotateX(Math.PI / 2), dark);
  cap.position.set(6, 0, 39.5);
  for (const m of [body, b1, b2, lid]) m.castShadow = m.receiveShadow = true;
  return [body, b1, b2, lid, cap];
}

// ------------------------------------------------------------------ remote player body
class Character {
  constructor(game, color, proto, model = 0, cos = {}) {
    this.game = game;
    this.root = new THREE.Group();
    this.root.matrixAutoUpdate = false;
    this.real = !!(proto && proto.real);
    if (this.real) {
      this.model = instance(proto);
      this.root.add(this.model);
      this.mixer = new THREE.AnimationMixer(this.model);
      const find = (re) => proto.animations.find((c) => re.test(c.name));
      const first = proto.animations[0];
      this.clips = {
        idle: find(/idle|stand|breath/i) || first,
        walk: find(/walk/i), run: find(/run|sprint|jog/i), jump: find(/jump|fall|air/i),
        crouch: find(/crouch|sneak|duck/i), death: find(/death|die|dead/i),
      };
      this.actions = new Map();
      this.current = null;
      this.mount = new THREE.Group(); // weapon at chest height, pointing forward
      this.mount.position.set(14, -8, 44);
      this.root.add(this.mount);
    } else {
      this.avatar = new Avatar(color, model, cos);
      this.avatar.root.matrixAutoUpdate = true;
      this.root.add(this.avatar.root);
      this.mount = this.avatar.hand;
    }
    this.weapon = null;
    this.wslot = null;
  }

  // powerup glow on the suit (null = none)
  setGlow(hex) {
    if (this.glow === hex || !this.avatar) return;
    this.glow = hex;
    const suit = this.avatar.mats[0];
    suit.emissive.set(hex || 0x000000);
    suit.emissiveIntensity = hex ? 0.8 : 1;
  }

  play(name) {
    const clip = this.clips[name] || this.clips.idle;
    if (!clip || clip === this.current) return;
    let a = this.actions.get(clip);
    if (!a) { a = this.mixer.clipAction(clip); this.actions.set(clip, a); }
    a.reset();
    if (name === 'death' || name === 'jump') { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    a.fadeIn(0.15).play();
    const prev = this.current && this.actions.get(this.current);
    if (prev) prev.fadeOut(0.15);
    this.current = clip;
  }

  async setWeapon(slot) {
    if (slot === this.wslot) return;
    this.wslot = slot;
    if (this.weapon) { this.mount.remove(this.weapon); this.weapon = null; }
    const proto = await loadSlot(slot);
    if (this.wslot !== slot) return;
    this.weapon = instance(proto);
    this.weapon.position.x = 4;
    this.mount.add(this.weapon);
  }

  // st: { speed, fwdSpeed, sideSpeed, ground, ducked, pitch, alive }
  animate(dt, st) {
    if (this.avatar) return this.avatar.animate(dt, st);
    let want = 'idle';
    if (!st.alive) want = 'death';
    else if (!st.ground) want = 'jump';
    else if (st.ducked) want = 'crouch';
    else if (st.speed > 260) want = 'run';
    else if (st.speed > 15) want = this.clips.walk ? 'walk' : 'run';
    this.play(want);
    const a = this.current && this.actions.get(this.current);
    if (a && (want === 'walk' || want === 'run')) a.timeScale = Math.max(0.6, Math.min(1.8, st.speed / (want === 'run' ? 400 : 200)));
    this.mixer.update(dt);
    this.mount.position.z = st.ducked ? 26 : 44;
    this.mount.rotation.y = Math.max(-1, Math.min(1, st.pitch * DEG));
  }

  dispose() {
    this.root.traverse((o) => { if (o.geometry && !o.isSkinnedMesh && !o.geometry.userData.keep) o.geometry.dispose?.(); });
    this.avatar?.dispose();
  }
}

// ------------------------------------------------------------------ game
export class Game {
  constructor(canvas, settings) {
    this.settings = settings;
    this.canvas = canvas;
    this.q = QUALITY[settings.quality] || QUALITY.medium;
    setPotato(this.q.potato);
    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: this.q.potato ? 'low-power' : 'high-performance', stencil: false }));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = this.q.shadow > 0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.sound = new Synth();
    this.sound.setVolume(settings.volume);
    this.hud = new Hud();

    this.scene = new THREE.Scene();
    this.vmScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 3, 60000);
    this.camera.matrixAutoUpdate = false;
    this.vmCamera = new THREE.PerspectiveCamera(54, 1, 0.5, 400);

    // lights: sun with shadows, sky/ground fill, and one reusable muzzle light
    this.sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
    this.sun.castShadow = this.q.shadow > 0;
    if (this.q.shadow) this.sun.shadow.mapSize.set(this.q.shadow, this.q.shadow);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 1.2;
    this.scene.add(this.sun, this.sun.target);
    // potato's simple materials don't pick up the sky reflections that light shaded sides, so fill harder
    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x5a4a3a, this.q.potato ? 2.6 : 0.55);
    this.scene.add(this.hemi);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 420, 2);
    this.scene.add(this.flashLight);
    const vmSun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    vmSun.position.set(0.4, 1, 0.6);
    this.vmFlash = new THREE.PointLight(0xffb060, 0, 60, 2);
    this.vmScene.add(vmSun, new THREE.HemisphereLight(0xbfd6ff, 0x5a4a3a, 0.7), this.vmFlash);

    this.players = new Map();
    this.zv = new ZombiesView(this); // zombies mode: the horde, shops and round HUD
    this.projectiles = new Map();
    this.ragdolls = [];
    this.props = [];
    this.flagObjs = {};
    this.rules = undefined;
    this.items = [];
    this.effects = [];
    this.decals = [];
    this.ps = newPlayerState();
    initLoadout(this.ps);
    this.ps.alive = false;
    this.cmds = [];
    this.seq = 0;
    this.yaw = 0;
    this.pitch = 0;
    this.wantW = WEAPON_INDEX.smg1;
    this.lastW = WEAPON_INDEX.pistol;
    this.keys = new Set();
    this.mouseButtons = 0;
    this.serverTime = 0;
    this.serverRecv = 0;
    this.renderTime = 0;
    this.smoothErr = [0, 0, 0];
    this.stepDist = 0;
    this.info = new Map();
    this.connected = false;
    this.mapId = null;
    this.vm = { holder: new THREE.Group(), model: null, wi: -1, draw: 1, kick: 0, swing: 1, reload: 0, reloadDur: 1, bob: 0, swayX: 0, swayY: 0, lastYaw: 0, lastPitch: 0 };
    this.vmScene.add(this.vm.holder);
    this.vmFlashSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: FLASH, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: 0xffffff }));
    this.vmFlashSprite.visible = false;
    this.vmScene.add(this.vmFlashSprite);
    this.flashT = 0;

    this.buildComposer();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.playerProto = loadSlot('player');
  }

  buildComposer() {
    if (this.q.potato) return; // potato draws straight to the screen: no extra render targets
    const r = this.renderer;
    const w = innerWidth, h = innerHeight;
    const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.q.msaa });
    this.composer = new EffectComposer(r, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.q.ao) {
      this.ao = new GTAOPass(this.scene, this.camera, w, h);
      this.ao.updateGtaoMaterial({ radius: 28, distanceExponent: 1.2, thickness: 12, scale: 1.1, samples: 16 });
      this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
      this.ao.blendIntensity = 0.9;
      this.composer.addPass(this.ao);
    }
    const vmPass = new RenderPass(this.vmScene, this.vmCamera);
    vmPass.clear = false;
    vmPass.clearDepth = true;
    this.composer.addPass(vmPass);
    if (this.q.bloom) this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(w, h), 0.45, 0.55, 0.92));
    this.composer.addPass(new OutputPass());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(window.devicePixelRatio, this.q.dprCap || 2) * this.q.pixel;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, h);
    }
    const aspect = w / h;
    // horizontal FOV at 4:3 like Source; keep the vertical angle and widen for widescreen
    const vfov = (2 * Math.atan(Math.tan((this.settings.fov * DEG) / 2) * 0.75)) / DEG;
    this.baseFov = vfov;
    this.camera.aspect = aspect; this.camera.fov = vfov; this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = aspect;
    this.vmCamera.fov = (2 * Math.atan(Math.tan((60 * DEG) / 2) * 0.75)) / DEG;
    this.vmCamera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- map
  async loadMap(id, progress = () => {}) {
    if (this.mapId === id) return;
    const map = await loadMap(id, progress);
    if (this.mapGroup) { this.scene.remove(this.mapGroup); this.mapGroup.traverse((o) => o.geometry?.dispose()); }
    this.mapGroup = map.group;
    this.mapTick = map.tick || null;
    this.scene.add(map.group);
    this.world = new BoxWorld(map.boxes, map.pads);
    this.killZ = map.killZ;
    this.spawns = map.spawns;
    this.mapName = map.name;
    this.mapId = id;

    // sun and its shadow box sized to the map
    const [lo, hi] = map.bounds;
    const c = new THREE.Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2);
    const half = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
    const dir = new THREE.Vector3(...map.sun).normalize();
    this.sun.position.copy(c).addScaledVector(dir, half * 1.5);
    this.sun.target.position.copy(c);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -half; cam.right = cam.top = half;
    cam.near = 1; cam.far = half * 3.2;
    cam.updateProjectionMatrix();
    this.sun.up.set(0, 0, 1);

    if (this.sky) this.scene.remove(this.sky);
    this.sky = makeSky(map.sun);
    this.scene.add(this.sky);
    // reflections: the sky rendered into a prefiltered environment map
    const env = new THREE.Scene();
    const sky2 = makeSky(map.sun);
    sky2.scale.setScalar(100);
    env.add(sky2);
    const pm = new THREE.PMREMGenerator(this.renderer);
    const tex = pm.fromScene(env, 0.02, 1, 1000).texture;
    pm.dispose();
    this.scene.environment = tex;
    this.vmScene.environment = tex;
    progress('');
  }

  // ---------------------------------------------------------------- networking
  // action: { t: 'join', room, password } or { t: 'create', settings }. Reuses the open socket.
  connect(name, color, action) {
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.socket(() => this.ws.send(JSON.stringify({ ...action, name, color, model: this.settings.model | 0, token: this.token })));
    });
  }

  // the server socket, opened on first use; go runs once it's open
  socket(go) {
    if (this.ws && this.ws.readyState === 1) return go();
    if (this.ws && this.ws.readyState === 0) return this.ws.addEventListener('open', go, { once: true });
    const ws = (this.ws = new WebSocket(socketUrl()));
    ws.onopen = go;
    ws.onerror = () => this.settle(new Error('Could not reach the server.'));
    ws.onclose = () => {
      this.ws = null;
      const was = this.connected;
      this.connected = false;
      this.stopWatching();
      this.settle(new Error('Lost connection to the server.'));
      if (was && this.onDisconnect) this.onDisconnect();
    };
    ws.onmessage = async (e) => {
      const m = JSON.parse(e.data);
      if (m.t === 'welcome' && m.watch) {
        // the menu background: a public game in progress, watched from a chase camera
        if (this.connected || this.pending) return;
        try { await this.onWelcome(m); this.resetView(); this.watching = m.room; this.onWatch?.(m.room); } catch { this.stopWatching(); }
      } else if (m.t === 'welcome') {
        this.watching = null;
        this.connected = false;
        try { await this.onWelcome(m); this.resetView(); this.connected = true; this.settle(); } catch (err) { this.settle(err); }
      } else if (m.t === 'watch-none') { this.stopWatching(); this.onWatch?.(null); }
      else if (m.t === 'error') this.settle(new Error(m.text));
      else if (m.t === 'left') this.connected = false;
      else if (this.connected || this.watching) this.onMessage(m);
    };
  }

  // menu: watch the busiest public game (asks again now and then so it follows the action)
  watch() {
    clearInterval(this.watchTimer);
    const ask = () => { if (!this.connected && !this.pending) this.socket(() => this.send({ t: 'watch' })); };
    ask();
    this.watchTimer = setInterval(() => {
      // re-pick when nothing is happening where we are, so the menu finds a busier game
      const alive = [...this.players.values()].some((pl) => pl.obj?.root.visible);
      if (!this.watching || !alive) ask();
    }, 15000);
  }

  stopWatching() {
    if (!this.watching) return;
    this.watching = null;
    for (const pl of [...this.players.values()]) this.removePlayer(pl.id);
    for (const pr of this.projectiles.values()) this.scene.remove(pr.obj);
    this.projectiles.clear();
    this.clearRagdolls();
  }

  // chase camera for watching: follow one live player for a while, then switch, preferring real people
  spectateCamera(dt, now) {
    let pl = this.players.get(this.watchId);
    if (!pl || !pl.obj?.root.visible || now > (this.watchUntil || 0)) {
      const live = [...this.players.values()].filter((p) => p.obj?.root.visible && p.snaps.length);
      const people = live.filter((p) => !this.info.get(p.id)?.bot);
      const pool = people.length ? people : live;
      if (!pool.length) return null;
      const next = pool.filter((p) => p.id !== this.watchId);
      pl = (next.length ? next : pool)[Math.floor(Math.random() * (next.length ? next : pool).length)];
      if (pl.id !== this.watchId) this.watchEye = null;
      this.watchId = pl.id;
      this.watchUntil = now + 9;
    }
    const snap = pl.snaps[pl.snaps.length - 1];
    const at = [pl.pos[0], pl.pos[1], pl.pos[2] + 14];
    // behind the player and a little to the side, drifting slowly around them
    const yaw = snap.yaw + 25 + Math.sin(now * 0.2) * 20;
    const back = viewDir(yaw, 18);
    const want = [at[0] - back[0] * 140, at[1] - back[1] * 140, at[2] + 30];
    const tr = this.world.trace(at, want, [-6, -6, -6], [6, 6, 6]);
    const goal = tr.endpos;
    if (!this.watchEye) this.watchEye = goal.slice();
    const k = Math.min(1, dt * 4);
    for (let i = 0; i < 3; i++) this.watchEye[i] += (goal[i] - this.watchEye[i]) * k;
    return { eye: this.watchEye.slice(), at };
  }

  resetView() {
    this.smoothErr = [0, 0, 0];
    this.stepSmooth = 0;
    this.lastEyeZ = undefined;
    this.clock = undefined;
  }

  settle(err) {
    const p = this.pending;
    this.pending = null;
    if (!p) return;
    if (err) p.reject(err);
    else p.resolve();
  }

  leave() {
    this.send({ t: 'leave' });
    this.connected = false;
    for (const pl of [...this.players.values()]) this.removePlayer(pl.id);
    for (const pr of this.projectiles.values()) this.scene.remove(pr.obj);
    this.projectiles.clear();
    this.clearRagdolls();
    this.setupProps([]);
    this.setupFlags(null);
    this.zv.clear();
    this.hud.teamBar(null);
    this.hud.teamPick(null);
    this.hud.powers([]);
    this.hud.vote(null);
    this.ps.alive = true;
  }

  async onWelcome(m) {
    this.myId = m.id;
    this.fraglimit = m.fraglimit;
    this.rules = m.rules;
    if (!m.watch) {
      this.room = m.room;
      this.onRoom && this.onRoom(m.room);
    }
    for (const pr of this.projectiles.values()) this.scene.remove(pr.obj);
    this.projectiles.clear();
    this.info.clear();
    for (const p of m.players) this.info.set(p.id, p);
    for (const pl of [...this.players.values()]) this.removePlayer(pl.id);
    await this.loadMap(m.map, this.onProgress || (() => {}));
    this.setupItems(m.items);
    this.mode = m.mode;
    this.caplimit = m.caplimit;
    this.teamScore = m.teamScore ? [m.teamScore.red, m.teamScore.blue] : [0, 0];
    this.pickLeft = m.pick || 0;
    this.zmState = null;
    this.setupProps(m.props || []);
    this.setupFlags(m.flags);
    this.zv.setup(m.cz);
    this.clearRagdolls();
    this.voting = null;
    this.hud.vote(null);
    this.intermission = false;
    this.cmds = [];
    this.hud.message('');
    this.setupViewmodel(true);
    clearInterval(this.pingTimer);
    if (!m.watch) this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
  }

  send(o) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o));
  }

  onMessage(m) {
    switch (m.t) {
      case 's': return this.onSnapshot(m);
      case 'join': this.info.set(m.p.id, m.p); if (m.p.id !== this.myId) this.hud.say('', `${m.p.name} joined the game`, true); break;
      case 'leave': { const i = this.info.get(m.id); if (i) this.hud.say('', `${i.name} left the game`, true); this.info.delete(m.id); this.removePlayer(m.id); break; }
      case 'coins': this.onCoins?.(m); break;
      case 'info': this.info.set(m.p.id, { ...this.info.get(m.p.id), ...m.p }); this.removePlayer(m.p.id); break;
      case 'chat': { const i = this.info.get(m.id); this.hud.say(i ? i.name : '?', m.text); this.sound.chat(); break; }
      case 'votes': if (this.voting) { this.voting.counts = m.c; this.hud.vote(this.voting); } break;
      case 'score': for (const [id, f, d, ping, points] of m.s) { const i = this.info.get(id); if (i) Object.assign(i, { frags: f, deaths: d, ping, points }); } break;
      case 'pong': { const rtt = performance.now() - m.c; this.ping = rtt; this.send({ t: 'rtt', v: Math.round(rtt) }); break; }
    }
  }

  onSnapshot(m) {
    const now = performance.now() / 1000;
    this.serverTime = m.st;
    this.serverRecv = now;
    this.timeLeft = m.tl;
    if (m.fl) this.flagState = m.fl;
    if (m.ts) this.teamScore = m.ts;
    this.zmState = m.zm || null;
    this.pickLeft = m.pk || 0;
    this.zv.snapshot(m);
    // own state: take the server's, then replay commands it hasn't processed yet (watchers have none)
    if (m.me) {
      const before = this.eye();
      const wasAlive = this.ps.alive;
      const ps = unpackOwn(m.me, newPlayerState());
      this.cmds = this.cmds.filter((c) => c.seq > m.ack);
      for (const c of this.cmds) {
        if (ps.alive) pmove(this.world, ps, c.cmd, c.dt, this.rules);
        weaponThink(ps, c.cmd, c.dt, () => {}, null);
      }
      this.ps = ps;
      const after = this.eye();
      if (wasAlive && ps.alive) {
        for (let i = 0; i < 3; i++) this.smoothErr[i] += before[i] - after[i];
        if (Math.hypot(...this.smoothErr) > 32) this.smoothErr = [0, 0, 0];
      } else this.smoothErr = [0, 0, 0];
    }

    for (const row of m.pl) {
      const id = row[0];
      if (id === this.myId) continue;
      let pl = this.players.get(id);
      if (!pl) pl = this.addPlayer(id);
      pl.snaps.push({ t: m.st, o: [row[1], row[2], row[3]], yaw: row[4], pitch: row[5], flags: row[6], w: row[7], v: [row[8], row[9], row[10]] });
      while (pl.snaps.length > 30) pl.snaps.shift();
      pl.seen = m.st;
    }
    for (const pl of [...this.players.values()]) if (m.st - pl.seen > 1) this.removePlayer(pl.id);
    for (const ev of m.ev) this.onEvent(ev);
  }

  onEvent(ev) {
    const me = this.myId;
    if (this.mode === 'zombies' && this.zv.event(ev)) return;
    switch (ev.e) {
      case 'proj': {
        const W = WEAPONS[ev.w];
        this.spawnProjectile(ev.id, ev.w, ev.o, ev.v);
        if (ev.owner !== me) this.sound.launch(W.proj.kind, ev.o);
        break;
      }
      case 'bounce': {
        const pr = this.projectiles.get(ev.id);
        if (pr) { pr.pos = ev.o.slice(); pr.vel = ev.v.slice(); pr.rest = false; }
        this.sound.bounce(ev.o);
        break;
      }
      case 'pend': {
        // a bolt stopped: leave it stuck where it landed for a few seconds
        const pr = this.projectiles.get(ev.id);
        if (pr) {
          pr.obj.position.set(...ev.o);
          pr.stuck = 5;
          this.projectiles.delete(ev.id);
          this.addEffect(pr.obj, 5, null);
        }
        this.sound.thunk(ev.o, !!ev.hit);
        break;
      }
      case 'boom': {
        const pr = this.projectiles.get(ev.id);
        if (pr) { this.scene.remove(pr.obj); this.projectiles.delete(ev.id); }
        this.explosion(ev.o);
        break;
      }
      case 'shot': {
        if (ev.id === me) return; // predicted locally already
        const W = WEAPONS[ev.w];
        const pl = this.players.get(ev.id);
        const muzzle = pl?.muzzle || ev.s;
        this.sound.gun(W.id, ev.s, false);
        for (const h of ev.h) { this.tracer(muzzle, h, W.pierce); this.impact(h, h[3], h[4], h[5]); }
        if (pl) this.worldFlash(muzzle);
        break;
      }
      case 'melee': {
        const pos = ev.id === me ? null : this.players.get(ev.id)?.pos;
        if (ev.id !== me) this.sound.swing(pos);
        if (ev.hit) this.sound.clang(pos, ev.hit === 2);
        break;
      }
      case 'snd':
        if (ev.id !== me && ev.k === 'reload') this.sound.reload(WEAPONS[ev.w].id, this.players.get(ev.id)?.pos, WEAPONS[ev.w].reload);
        break;
      case 'hurt': {
        if (ev.id === me) {
          this.sound.hurt(null, true);
          if (ev.a && ev.dir) this.hud.damage(-angDiff(this.yaw, Math.atan2(-ev.dir[1], -ev.dir[0]) / DEG));
          else this.hud.damage(180);
          this.vm.kick = Math.min(1.5, this.vm.kick + ev.d / 40);
        } else {
          const pl = this.players.get(ev.id);
          if (pl) this.sound.hurt(pl.pos, false);
          if (ev.a === me) this.sound.hitTick();
        }
        break;
      }
      case 'kill': {
        const k = this.info.get(ev.k), v = this.info.get(ev.v);
        this.hud.kill(ev.k && ev.k !== ev.v ? k?.name || '?' : '', v?.name || '?', ev.w, ev.hs, ev.k === me || ev.v === me);
        this.sound.death(ev.v === me ? null : ev.o);
        const pl = this.players.get(ev.v);
        if (pl) pl.deathAt = performance.now() / 1000;
        if (ev.v === me) { this.deathAt = performance.now() / 1000; this.killer = ev.k !== me ? k?.name : null; }
        this.spawnRagdoll(ev.v, ev.o, ev.y, ev.vv || [0, 0, 0], ev.dk);
        break;
      }
      case 'spawn':
        if (ev.id === me) { this.yaw = ev.y; this.pitch = 0; this.deathAt = 0; this.hud.message(''); this.setupViewmodel(true); }
        else { const pl = this.players.get(ev.id); if (pl) { pl.snaps.length = 0; pl.deathAt = 0; } }
        break;
      case 'item': {
        const it = this.items[ev.i];
        if (it) { it.up = !!ev.up; if (it.obj) it.obj.visible = it.up; }
        if (!ev.up && ev.id === me) this.sound.pickup(WEAPON_INDEX[ev.k] !== undefined ? 'weapon' : ev.k);
        break;
      }
      case 'intermission': {
        this.intermission = true;
        this.hud.scoreboard(true, this.info.values(), this.myId, this.mapName, this.scoreTeams(), this.scoreExtra());
        this.hud.teamPick(null);
        const WIN = { draw: 'Draw', red: 'Red team wins', blue: 'Blue team wins', human: 'The survivors made it!', zombie: 'The zombies win', gameover: `GAME OVER · you survived ${ev.round || 0} round${ev.round === 1 ? '' : 's'}` };
        const title = WIN[ev.win] || 'Match over';
        if (ev.vote) {
          this.voting = { options: ev.vote, counts: {}, mine: null, ends: performance.now() / 1000 + ev.secs, title };
          this.hud.vote(this.voting);
          this.hud.message('');
        } else this.hud.message(title, `Next map: ${ev.next}`);
        this.sound.pickup('weapon');
        break;
      }
      case 'prop': this.propState(ev.i, !!ev.up); break;
      case 'infect': {
        const name = this.info.get(ev.id)?.name || 'Someone';
        if (ev.first) this.hud.say('', `${name} is patient zero! Run!`, true);
        else this.hud.say('', `${name} was infected`, true);
        if (ev.id === me) {
          this.hud.message(ev.first ? 'You are patient zero' : 'You are infected', 'Claw the survivors to turn them');
          setTimeout(() => this.hud.message(''), 3000);
        }
        this.sound.hurt(ev.id === me ? null : this.players.get(ev.id)?.pos, ev.id === me);
        break;
      }
      case 'live':
        this.hud.message('Match started', 'Teams are locked in. Fight!');
        setTimeout(() => this.hud.message(''), 2500);
        this.hud.teamPick(null);
        this.sound.pickup('weapon');
        break;
      case 'flag': this.flagEvent(ev); break;
    }
  }

  // ---------------------------------------------------------------- remote players
  addPlayer(id) {
    const pl = { id, snaps: [], seen: 0, obj: null, pos: [0, 0, 0], stepDist: 0, deathAt: 0, wi: -1 };
    this.players.set(id, pl);
    this.playerProto.then((proto) => {
      if (!this.players.has(id) || pl.obj) return;
      const info = this.info.get(id);
      pl.obj = new Character(this, this.colorFor(info), proto, this.modelFor(info), info?.team === 'zombie' ? {} : info?.cos);
      this.scene.add(pl.obj.root);
    });
    return pl;
  }

  removePlayer(id) {
    const pl = this.players.get(id);
    if (!pl) return;
    if (pl.obj) { this.scene.remove(pl.obj.root); pl.obj.dispose(); }
    this.players.delete(id);
  }

  updatePlayers(dt) {
    const t = this.renderTime;
    const now = performance.now() / 1000;
    for (const pl of this.players.values()) {
      const s = pl.snaps;
      if (!s.length) continue;
      let a = s[0], b = s[0];
      for (let i = 0; i < s.length; i++) {
        if (s[i].t <= t) a = s[i];
        b = s[i];
        if (s[i].t >= t) break;
      }
      const f = b.t > a.t ? Math.max(0, Math.min(1, (t - a.t) / (b.t - a.t))) : 1;
      const o = [0, 1, 2].map((k) => a.o[k] + (b.o[k] - a.o[k]) * f);
      const yaw = a.yaw + angDiff(a.yaw, b.yaw) * f;
      const pitch = a.pitch + (b.pitch - a.pitch) * f;
      const flags = b.flags, alive = !!(flags & 4), vel = b.v;
      const speed = Math.hypot(vel[0], vel[1]);
      pl.pos = [o[0], o[1], o[2] + 36];
      if (alive && flags & 2 && speed > 140) {
        pl.stepDist += speed * dt;
        if (pl.stepDist > 80) { pl.stepDist = 0; this.sound.step(o, 0.5, this.surfaceAt(o)); }
      }
      if (!pl.obj) continue;
      if (b.w !== pl.wi) { pl.wi = b.w; pl.obj.setWeapon(WEAPON_SLOT[WEAPONS[b.w].id]); }
      const yr = yaw * DEG;
      pl.obj.animate(dt, {
        speed, fwdSpeed: vel[0] * Math.cos(yr) + vel[1] * Math.sin(yr), sideSpeed: vel[0] * Math.sin(yr) - vel[1] * Math.cos(yr),
        ground: !!(flags & 2), ducked: !!(flags & 1), pitch, alive,
      });
      const m = new THREE.Matrix4().makeRotationZ(yr).setPosition(o[0], o[1], o[2]);
      pl.obj.root.matrix.copy(m);
      pl.obj.root.matrixWorldNeedsUpdate = true;
      pl.obj.root.visible = alive; // dead bodies are ragdolls
      pl.obj.setGlow(flags & 64 ? 0xff2a2a : flags & 16 ? 0x9a3cff : flags & 32 ? 0xffc23a : null);
      if (pl.obj.weapon) pl.obj.weapon.visible = alive;
      pl.obj.root.updateMatrixWorld(true);
      pl.muzzle = new THREE.Vector3(20, 0, 2).applyMatrix4(pl.obj.mount.matrixWorld).toArray();
    }
  }

  surfaceAt(o) {
    const tr = this.world.trace([o[0], o[1], o[2] + 4], [o[0], o[1], o[2] - 16], [0, 0, 0], [0, 0, 0]);
    const mat = this.world.boxes[tr.box]?.mat;
    if (mat === 'plate' || mat === 'metal') return 'metal';
    if (this.mapId === 'csdm' && o[2] < 50) return 'grass';
    return 'stone';
  }

  // a character model in a suit colour holding a weapon slot (for zombies and other non-players)
  makeCharacter(color, slot, model = 0) {
    return this.playerProto.then((proto) => {
      const c = new Character(this, color, proto, model);
      if (slot) c.setWeapon(slot);
      return c;
    });
  }

  // ---------------------------------------------------------------- team colours
  colorFor(info) {
    if (info?.team === 'zombie') return ZOMBIE_SKIN;
    if (TEAM_COLOR[info?.team] !== undefined) return TEAM_COLOR[info.team];
    return (info?.color | 0) || 0;
  }

  modelFor(info) {
    return info?.team === 'zombie' ? 0 : ((info?.model | 0) % MODELS.length + MODELS.length) % MODELS.length;
  }

  // scoreboard grouping for the mode, null for free for all
  scoreTeams() {
    const ts = this.teamScore || [0, 0];
    if (this.mode === 'ctf') return [['red', `Red team · ${ts[0]} captures`], ['blue', `Blue team · ${ts[1]} captures`]];
    if (this.mode === 'tdm') return [['red', `Red team · ${ts[0]} frags`], ['blue', `Blue team · ${ts[1]} frags`]];
    if (this.mode === 'infection') return [['human', 'Survivors'], ['zombie', 'Zombies']];
    return null;
  }

  // an extra scoreboard column for the mode
  scoreExtra() {
    if (this.mode === 'ctf') return { title: 'Caps', get: (p) => p.caps | 0 };
    if (this.mode === 'zombies') return { title: 'Points', get: (p) => p.points | 0 };
    return null;
  }

  // what ends the match, for the timer line
  limitLabel() {
    const fl = this.fraglimit;
    if (this.mode === 'ctf') return `${this.caplimit} CAPTURES`;
    if (this.mode === 'infection') return 'SURVIVE THE CLOCK';
    if (this.mode === 'zombies') return 'SURVIVE';
    if (this.mode === 'tdm') return this.pickLeft ? 'WARM-UP' : fl ? `${fl} TEAM FRAGS` : 'NO FRAG LIMIT';
    return fl ? `${fl} FRAGS` : 'NO FRAG LIMIT';
  }

  // team deathmatch warm-up: 1 red, 2 blue, 3 auto
  pickTeam(index) {
    const team = ['red', 'blue', 'auto'][index];
    if (!team || !this.pickLeft) return;
    this.send({ t: 'team', team });
    this.sound.ui(1100);
  }

  // ---------------------------------------------------------------- ragdolls
  spawnRagdoll(id, origin, yaw, vel, ducked, color) {
    const info = this.info.get(id);
    const doll = new Ragdoll(this.world, origin, yaw || 0, vel, color ?? this.colorFor(info), !!ducked, color === undefined ? this.modelFor(info) : 0);
    this.scene.add(doll.group);
    this.ragdolls.push({ id, doll, born: performance.now() / 1000 });
    while (this.ragdolls.length > (this.q.ragdolls || 10)) this.removeRagdoll(this.ragdolls[0]);
  }

  removeRagdoll(r) {
    this.scene.remove(r.doll.group);
    r.doll.dispose();
    this.ragdolls.splice(this.ragdolls.indexOf(r), 1);
  }

  clearRagdolls() {
    for (const r of [...(this.ragdolls || [])]) this.removeRagdoll(r);
    this.ragdolls = [];
  }

  updateRagdolls(dt) {
    const now = performance.now() / 1000;
    for (const r of [...this.ragdolls]) {
      r.doll.step(Math.min(dt, 1 / 30));
      // bodies stay a while, then sink away
      const age = now - r.born;
      if (age > 12) r.doll.group.position.z -= dt * 20;
      if (age > 14) this.removeRagdoll(r);
    }
  }

  // ---------------------------------------------------------------- destructible props
  setupProps(list) {
    for (const pr of this.props || []) this.scene.remove(pr.obj);
    this.props = [];
    for (const [i, kind, o, up] of list) {
      const P = PROP_SIZE[kind] || PROP_SIZE.crate;
      const box = this.world.addBox({ mins: [o[0] - P.half, o[1] - P.half, o[2]], maxs: [o[0] + P.half, o[1] + P.half, o[2] + P.h], mat: 'prop' });
      const g = new THREE.Group();
      g.position.set(o[0], o[1], o[2]);
      if (kind === 'barrel') g.add(...explosiveBarrel());
      else loadSlot('crate').then((proto) => g.add(instance(proto)));
      g.visible = !!up;
      this.world.setEnabled(box, !!up);
      this.scene.add(g);
      this.props[i] = { i, kind, o, obj: g, box };
    }
  }

  propState(i, up) {
    const pr = this.props[i];
    if (!pr) return;
    pr.obj.visible = up;
    this.world.setEnabled(pr.box, up);
    if (up) return;
    // break apart into a handful of tumbling pieces
    const mat = new THREE.MeshStandardMaterial({ color: pr.kind === 'barrel' ? 0xa02a22 : 0x8a6236, roughness: 0.7, metalness: pr.kind === 'barrel' ? 0.5 : 0 });
    for (let k = 0; k < 9; k++) {
      const piece = new THREE.Mesh(new THREE.BoxGeometry(4 + Math.random() * 8, 2 + Math.random() * 4, 4 + Math.random() * 10), mat);
      piece.castShadow = true;
      piece.position.set(pr.o[0] + (Math.random() - 0.5) * 30, pr.o[1] + (Math.random() - 0.5) * 30, pr.o[2] + 10 + Math.random() * 25);
      const v = new THREE.Vector3((Math.random() - 0.5) * 300, (Math.random() - 0.5) * 300, 150 + Math.random() * 250);
      const spin = new THREE.Vector3(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      this.addEffect(piece, 2.2, (e, kk, d) => {
        v.z -= 600 * d;
        const next = piece.position.clone().addScaledVector(v, d);
        const tr = this.world.trace(piece.position.toArray(), next.toArray(), [-2, -2, -2], [2, 2, 2]);
        if (tr.fraction < 1) { piece.position.fromArray(tr.endpos); v.multiplyScalar(0.3); v.z = Math.abs(v.z) * 0.3; }
        else piece.position.copy(next);
        piece.rotation.x += spin.x * d; piece.rotation.y += spin.y * d;
        if (kk > 0.8) piece.scale.setScalar(Math.max(0.01, (1 - kk) * 5));
      });
    }
    if (pr.kind === 'crate') this.sound.thunk(pr.o, false);
  }

  // ---------------------------------------------------------------- capture the flag
  setupFlags(flags) {
    for (const f of Object.values(this.flagObjs || {})) { this.scene.remove(f.flag); this.scene.remove(f.base); }
    this.flagObjs = {};
    this.flagState = null;
    if (!flags) return;
    this.flagState = ['red', 'blue'].map((t) => [flags[t].pos, flags[t].carrier, flags[t].dropped ? 1 : 0]);
    for (const t of ['red', 'blue']) {
      const col = new THREE.Color(TEAM_RGB[t]);
      const flag = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 80, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xd0d0d0, metalness: 0.8, roughness: 0.3 }));
      pole.position.z = 40;
      pole.castShadow = true;
      // the cloth is a strip of segments that ripple in turn
      const cloth = [];
      for (let k = 0; k < 6; k++) {
        const seg = new THREE.Mesh(new THREE.PlaneGeometry(6, 24), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6, side: THREE.DoubleSide, roughness: 0.8 }));
        seg.rotation.x = Math.PI / 2;
        seg.position.set(3 + k * 6, 0, 66);
        seg.castShadow = true;
        flag.add(seg);
        cloth.push(seg);
      }
      flag.add(pole);
      flag.userData.cloth = cloth;
      const base = new THREE.Mesh(new THREE.RingGeometry(34, 46, 40), new THREE.MeshBasicMaterial({ color: col.clone().multiplyScalar(2.5), transparent: true, opacity: 0.85, side: THREE.DoubleSide, toneMapped: false }));
      base.position.set(flags[t].home[0], flags[t].home[1], flags[t].home[2] + 1);
      this.scene.add(flag, base);
      this.flagObjs[t] = { flag, base, home: flags[t].home };
    }
  }

  updateFlags(dt, t) {
    if (!this.flagState || !this.flagObjs.red) return;
    ['red', 'blue'].forEach((team, i) => {
      const [pos, carrier] = this.flagState[i];
      const f = this.flagObjs[team];
      let p = pos;
      if (carrier) {
        const pl = this.players.get(carrier);
        if (carrier === this.myId) { f.flag.visible = false; return; }
        if (pl) p = [pl.pos[0], pl.pos[1], pl.pos[2] - 6]; // on the carrier's back
      }
      f.flag.visible = true;
      f.flag.position.set(p[0], p[1], p[2]);
      f.flag.rotation.z = carrier ? 0 : t * 0.4;
      f.flag.userData.cloth.forEach((seg, k) => {
        seg.position.y = Math.sin(t * 6 - k * 0.8) * k * 0.8;
        seg.rotation.y = Math.sin(t * 6 - k * 0.8) * 0.25;
      });
    });
  }

  flagEvent(ev) {
    const who = this.info.get(ev.id)?.name || 'Someone';
    const flagName = ev.t === 'red' ? 'red' : 'blue';
    const mine = this.info.get(this.myId)?.team;
    if (ev.act === 'take') { this.hud.say('', `${who} took the ${flagName} flag`, true); this.sound.pickup(mine === ev.t ? 'battery' : 'weapon'); }
    if (ev.act === 'drop') this.hud.say('', `${who} dropped the ${flagName} flag`, true);
    if (ev.act === 'return') { this.hud.say('', `The ${flagName} flag was returned`, true); this.sound.ui(600); }
    if (ev.act === 'cap') {
      const team = ev.t === 'red' ? 'Blue' : 'Red';
      this.hud.say('', `${who} captured the ${flagName} flag. ${team} scores!`, true);
      this.hud.message(`${team} scores!`, `${ev.score.red} – ${ev.score.blue}`);
      setTimeout(() => this.hud.message(''), 2500);
      this.sound.pickup('battery');
      setTimeout(() => this.sound.pickup('weapon'), 180);
    }
  }

  castVote(index) {
    const v = this.voting;
    if (!v || !v.options[index]) return;
    v.mine = v.options[index].id;
    this.send({ t: 'vote', map: v.mine });
    this.sound.ui(1100);
    this.hud.vote(v);
  }

  // ---------------------------------------------------------------- items
  setupItems(list) {
    for (const it of this.items) if (it?.obj) this.scene.remove(it.obj);
    this.items = [];
    const COLORS = { health: '#4dff8a', vial: '#4dff8a', battery: '#4fb8ff', ammo: '#ffd24d', megahealth: '#4dff8a', heavyarmor: '#4fb8ff', damage: '#b04dff', haste: '#ffc23a', boots: '#4dffe0' };
    for (const [i, kind, o, up] of list) {
      const it = { i, kind, o, up: !!up, obj: null };
      this.items[i] = it;
      const slot = ITEM_SLOT[kind] || WEAPON_SLOT[kind];
      loadSlot(slot).then((proto) => {
        const g = new THREE.Group();
        const model = instance(proto);
        if (kind === 'vial') model.scale.setScalar(0.6);
        if (kind === 'megahealth' || kind === 'heavyarmor') model.scale.setScalar(1.35);
        const spin = new THREE.Group();
        spin.add(model);
        spin.position.z = 10;
        g.add(spin);
        const halo = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), haloMaterial(COLORS[kind] || '#ff9a3c'));
        halo.position.z = 1;
        g.add(halo);
        g.position.set(o[0], o[1], o[2]);
        g.visible = it.up;
        it.obj = g;
        it.spin = spin;
        it.halo = halo;
        this.scene.add(g);
      });
    }
  }

  updateItems(t) {
    for (const it of this.items) {
      if (!it?.obj) continue;
      it.spin.rotation.z = t * 1.2 + it.i;
      it.spin.position.z = 12 + Math.sin(t * 2 + it.i) * 3;
      it.halo.material.uniforms.uTime.value = t + it.i;
    }
  }

  // ---------------------------------------------------------------- viewmodel (procedurally animated)
  async setupViewmodel(force) {
    const wi = this.ps.cur;
    if (!force && this.vm.wi === wi) return;
    this.vm.wi = wi;
    const proto = await loadSlot(WEAPON_SLOT[WEAPONS[wi].id]);
    if (this.vm.wi !== wi) return;
    if (this.vm.model) this.vm.holder.remove(this.vm.model);
    const model = instance(proto);
    model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    const size = proto.object.userData.size || new THREE.Vector3(20, 3, 6);
    this.vm.model = model;
    this.vm.len = size.x;
    this.vm.muzzle = new THREE.Vector3(size.x / 2 + 1, 0, size.z * 0.18);
    this.vm.holder.add(model);
    this.vm.draw = 0;
    this.vm.reload = 0;
  }

  vmEvent(name, dur) {
    const vm = this.vm;
    if (name === 'fire') vm.kick = Math.min(1.6, vm.kick + (['shotgun', '357', 'autoshotgun', 'railgun'].includes(WEAPONS[this.ps.cur].id) ? 1 : 0.45));
    if (name === 'swing') vm.swing = 0;
    if (name === 'reload') { vm.reload = 0.0001; vm.reloadDur = dur; }
  }

  updateViewmodel(dt) {
    const vm = this.vm;
    if (vm.wi !== this.ps.cur) this.setupViewmodel();
    vm.holder.visible = this.ps.alive && this.connected && !this.zoomed;
    if (!vm.model) return;
    vm.draw = Math.min(1, vm.draw + dt / 0.4);
    vm.kick *= Math.exp(-dt * 14);
    vm.swing = Math.min(1, vm.swing + dt / 0.35);
    if (vm.reload > 0) { vm.reload += dt / vm.reloadDur; if (vm.reload >= 1) vm.reload = 0; }
    // sway lags behind mouse movement
    const dy = angDiff(vm.lastYaw, this.yaw), dp = this.pitch - vm.lastPitch;
    vm.lastYaw = this.yaw; vm.lastPitch = this.pitch;
    vm.swayX += (Math.max(-3, Math.min(3, dy * 0.25)) - vm.swayX) * Math.min(1, dt * 10);
    vm.swayY += (Math.max(-3, Math.min(3, dp * 0.25)) - vm.swayY) * Math.min(1, dt * 10);
    const speed = Math.hypot(this.ps.velocity[0], this.ps.velocity[1]);
    const bobAmt = this.ps.onGround ? Math.min(1, speed / 400) : 0;
    vm.bob += dt * (5 + speed / 70);
    const L = vm.len || 20;
    const draw = 1 - Math.pow(1 - vm.draw, 3);
    const rl = vm.reload > 0 ? Math.sin(vm.reload * Math.PI) : 0;
    const swing = vm.swing < 1 ? Math.sin(vm.swing * Math.PI) : 0;
    // position in camera space (x right, y up, z toward viewer)
    const x = 5.5 + Math.sin(vm.bob) * 0.5 * bobAmt + vm.swayX * 0.6 - swing * 4;
    const y = -5.5 - L * 0.06 - Math.abs(Math.cos(vm.bob)) * 0.5 * bobAmt - (1 - draw) * 12 - rl * 5 + vm.swayY * 0.4;
    const z = -9 - L * 0.42 + vm.kick * 2.4 + swing * 3;
    const m = new THREE.Matrix4().makeTranslation(x, y, z);
    m.multiply(new THREE.Matrix4().makeRotationX(vm.kick * 0.12 + rl * 0.35 - (1 - draw) * 0.6));
    m.multiply(new THREE.Matrix4().makeRotationY(-vm.swayX * 0.03 + swing * 1.1));
    m.multiply(new THREE.Matrix4().makeRotationZ(rl * 0.5));
    m.multiply(TO_VIEW);
    vm.holder.matrixAutoUpdate = false;
    vm.holder.matrix.copy(m);
    vm.holder.matrixWorldNeedsUpdate = true;
    // muzzle flash
    if (this.flashT > 0) {
      this.flashT -= dt;
      const p = vm.muzzle.clone().applyMatrix4(m);
      this.vmFlashSprite.position.copy(p);
      this.vmFlashSprite.scale.setScalar(5 + Math.random() * 3);
      this.vmFlashSprite.material.rotation = Math.random() * 6;
      this.vmFlashSprite.visible = true;
      this.vmFlash.position.copy(p);
      this.vmFlash.intensity = 4000;
    } else {
      this.vmFlashSprite.visible = false;
      this.vmFlash.intensity = 0;
    }
  }

  // ---------------------------------------------------------------- local weapon effects (predicted)
  localFire(wi, cmd, seq) {
    const W = WEAPONS[wi];
    const eye = this.eye();
    if (W.melee) {
      this.sound.swing(null);
      this.vmEvent('swing');
      const f = viewDir(cmd.yaw, cmd.pitch);
      const end = eye.map((v, i) => v + f[i] * W.range);
      const tr = this.world.trace(eye, end, [-4, -4, -4], [4, 4, 4], MASK_SHOT);
      if (tr.fraction < 1) { this.impact(tr.endpos, 0, 1, tr.normal); this.sound.clang(null, false); }
      return;
    }
    if (W.proj) {
      // the projectile itself arrives from the server a moment later; sound and kick happen now
      this.sound.launch(W.proj.kind, null);
      this.vmEvent('fire');
      this.recoil = (this.recoil || 0) + (W.proj.kind === 'rocket' ? 2 : 0.6);
      if (W.proj.kind === 'rocket') this.worldFlash(this.muzzleWorld(eye, cmd));
      return;
    }
    this.sound.gun(W.id, null, true);
    this.vmEvent('fire');
    this.flashT = 0.045;
    this.recoil = (this.recoil || 0) + ({ '357': 3, shotgun: 2.5, railgun: 3, autoshotgun: 1.6, lmg: 0.6 }[W.id] || 0.5);
    if (W.id === 'shotgun') setTimeout(() => { if (this.ps.cur === wi) this.sound.pump(null); }, 350);
    const muzzle = this.muzzleWorld(eye, cmd);
    this.worldFlash(muzzle);
    for (const d of spreadDirs(W, cmd.yaw, cmd.pitch, seq, !!(cmd.buttons & BTN.ATTACK2) && !!W.zoom)) {
      const end = eye.map((v, i) => v + d[i] * 8192);
      const tr = this.world.trace(eye, end, [0, 0, 0], [0, 0, 0], MASK_SHOT);
      let frac = tr.fraction, who = 0;
      // the railgun beam goes through players to the wall
      if (!W.pierce) for (const pl of this.players.values()) {
        const s = pl.snaps[pl.snaps.length - 1];
        if (!s || !(s.flags & 4)) continue;
        const h = hitTest(eye, end, [pl.pos[0], pl.pos[1], pl.pos[2] - 36], s.flags & 1);
        if (h && h.frac < frac) { frac = h.frac; who = pl.id; }
      }
      if (!W.pierce) for (const z of this.zv.targets()) {
        const h = hitTest(eye, end, z.o, false);
        if (h && h.frac < frac) { frac = h.frac; who = z.id; }
      }
      const hp = eye.map((v, i) => v + d[i] * 8192 * frac);
      this.tracer(muzzle, hp, W.pierce);
      this.impact(hp, who, who ? 0 : tr.fraction < 1 ? 1 : 0, tr.normal);
    }
  }

  localEvent(name) {
    const W = WEAPONS[this.ps.cur];
    if (name === 'draw') { this.setupViewmodel(true); this.sound.ui(700); }
    else if (name === 'empty') this.sound.empty(null);
    else if (name === 'reload') { this.vmEvent('reload', W.reload); this.sound.reload(W.id, null, W.reload); }
    else if (name === 'reloadstart' || name === 'reloadshell') { this.vmEvent('reload', 0.5); this.sound.click(null, 0.8, 0.5); }
    else if (name === 'reloadfinish') this.sound.pump(null);
  }

  muzzleWorld(eye, cmd) {
    const f = viewDir(cmd.yaw, cmd.pitch);
    const y = cmd.yaw * DEG;
    const r = [Math.sin(y), -Math.cos(y), 0];
    return [eye[0] + f[0] * 24 + r[0] * 6, eye[1] + f[1] * 24 + r[1] * 6, eye[2] + f[2] * 24 - 5];
  }

  // ---------------------------------------------------------------- effects
  addEffect(obj, life, update) {
    this.scene.add(obj);
    this.effects.push({ obj, life, t: 0, update });
  }

  worldFlash(pos) {
    this.flashLight.position.set(pos[0], pos[1], pos[2]);
    this.flashLight.intensity = 60000;
    this.flashLightT = 0.05;
  }

  tracer(from, to, rail) {
    const dir = new THREE.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    if (!rail && (dir.length() < 80 || Math.random() > 0.7)) return;
    if (rail) {
      // railgun: a bright core with a few strands twisting around it, fading slowly
      const core = new THREE.LineBasicMaterial({ color: new THREE.Color(2, 4, 8), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
      const pts = [], n = Math.max(8, Math.round(dir.length() / 12));
      const side = new THREE.Vector3(-dir.y, dir.x, 0).normalize(), up = new THREE.Vector3().crossVectors(dir, side).normalize();
      for (let i = 0; i <= n; i++) {
        const t = i / n, a = t * dir.length() / 18;
        pts.push(new THREE.Vector3(...from).addScaledVector(dir, t).addScaledVector(side, Math.cos(a) * 3).addScaledVector(up, Math.sin(a) * 3));
      }
      const spiral = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), core.clone());
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]), core);
      this.addEffect(line, 0.6, (e, k) => (core.opacity = 1 - k));
      this.addEffect(spiral, 0.9, (e, k) => (spiral.material.opacity = 1 - k));
      return;
    }
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...from), new THREE.Vector3(...to)]);
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color(4, 3.2, 1.6), transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const line = new THREE.Line(g, mat);
    this.addEffect(line, 0.07, (e, k) => (mat.opacity = 1 - k));
  }

  impact(pos, hitPlayer, hitWorld, normal) {
    if (hitPlayer) {
      for (let i = 0; i < 5; i++) {
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x6a0000, transparent: true, depthWrite: false }));
        s.position.set(pos[0], pos[1], pos[2]);
        s.scale.setScalar(3 + Math.random() * 4);
        const v = [Math.random() * 80 - 40, Math.random() * 80 - 40, Math.random() * 80];
        this.addEffect(s, 0.45, (e, k, dt) => { s.position.x += v[0] * dt; s.position.y += v[1] * dt; s.position.z += (v[2] -= 500 * dt) * dt; s.material.opacity = 1 - k; });
      }
      return;
    }
    if (!hitWorld) return;
    const n = new THREE.Vector3(...normal);
    // sparks
    const count = 8;
    const geo = new THREE.BufferGeometry();
    const pts = new Float32Array(count * 3), vel = [];
    for (let i = 0; i < count; i++) {
      pts.set([pos[0] + n.x, pos[1] + n.y, pos[2] + n.z], i * 3);
      const r = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.2).add(n).normalize().multiplyScalar(150 + Math.random() * 200);
      vel.push(r);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const pm = new THREE.PointsMaterial({ size: 2.5, map: GLOW, color: new THREE.Color(3, 2, 1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const sparks = new THREE.Points(geo, pm);
    this.addEffect(sparks, 0.25, (e, k, dt) => {
      for (let i = 0; i < count; i++) {
        vel[i].z -= 600 * dt;
        pts[i * 3] += vel[i].x * dt; pts[i * 3 + 1] += vel[i].y * dt; pts[i * 3 + 2] += vel[i].z * dt;
      }
      geo.attributes.position.needsUpdate = true;
      pm.opacity = 1 - k;
    });
    // dust
    const d = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0x6b6458, transparent: true, depthWrite: false }));
    d.position.set(pos[0] + n.x * 2, pos[1] + n.y * 2, pos[2] + n.z * 2);
    this.addEffect(d, 0.6, (e, k, dt) => { d.scale.setScalar(4 + 18 * k); d.material.opacity = 0.5 * (1 - k); d.position.addScaledVector(n, dt * 20); d.position.z += dt * 8; });
    // bullet hole
    if (!this.decalMat) this.decalMat = new THREE.MeshBasicMaterial({ map: HOLE, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    const q = new THREE.Mesh(this.decalGeo || (this.decalGeo = new THREE.PlaneGeometry(5, 5)), this.decalMat);
    q.position.set(pos[0] + n.x * 0.2, pos[1] + n.y * 0.2, pos[2] + n.z * 0.2);
    q.lookAt(q.position.clone().add(n));
    q.rotateZ(Math.random() * 6);
    this.scene.add(q);
    this.decals.push(q);
    if (this.decals.length > (this.q.decals || 100)) this.scene.remove(this.decals.shift());
    this.sound.impact(pos);
  }

  spawnProjectile(id, wi, pos, vel) {
    const W = WEAPONS[wi], P = W.proj;
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x3a3d42, metalness: 0.7, roughness: 0.35 });
    if (P.kind === 'bolt') {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 18, 6).rotateZ(Math.PI / 2), metal);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.8, 3, 6).rotateZ(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.9, roughness: 0.2 }));
      tip.position.x = 10;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(4, 0.2, 2.2), new THREE.MeshStandardMaterial({ color: 0xd04020, roughness: 0.6 }));
      fin.position.x = -8;
      g.add(rod, tip, fin);
    } else if (P.kind === 'rocket') {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.6, 12, 4, 10).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5b6248, metalness: 0.3, roughness: 0.6 }));
      const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(4, 2.2, 0.8), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
      flame.position.x = -9;
      flame.scale.setScalar(10);
      g.add(body, flame);
    } else {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(2.6, 12, 8), new THREE.MeshStandardMaterial({ color: 0x3f4a2c, roughness: 0.7, metalness: 0.2 }));
      const band = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.35, 6, 16), metal);
      const led = new THREE.Mesh(new THREE.SphereGeometry(0.6, 6, 4), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: new THREE.Color(1, 0.1, 0.05), emissiveIntensity: 0 }));
      led.position.z = 2.6;
      g.add(shell, band, led);
      g.userData.led = led;
    }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    g.position.set(...pos);
    this.scene.add(g);
    this.projectiles.set(id, { obj: g, pos: pos.slice(), vel: vel.slice(), t: 0, P, kind: P.kind, smoke: 0 });
  }

  updateProjectiles(dt) {
    for (const pr of this.projectiles.values()) {
      const res = stepProj(this.world, pr, pr.P, dt);
      pr.obj.position.set(...pr.pos);
      const sp = Math.hypot(...pr.vel);
      if (sp > 1 && pr.kind !== 'grenade') {
        // point along the flight path
        const d = new THREE.Vector3(...pr.vel).normalize();
        pr.obj.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d);
      } else if (pr.kind === 'grenade' && !pr.rest) pr.obj.rotation.x += dt * 12;
      if (pr.kind === 'grenade') {
        // blink faster as the fuse runs down
        const left = Math.max(0.05, pr.P.fuse - pr.t);
        pr.obj.userData.led.material.emissiveIntensity = Math.sin(pr.t * Math.PI * 2 * (2 + 6 / left)) > 0 ? 6 : 0;
      }
      if (pr.kind === 'rocket') {
        pr.smoke -= dt;
        if (pr.smoke <= 0) {
          pr.smoke = 0.03;
          const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0x9a948a, transparent: true, depthWrite: false }));
          puff.position.copy(pr.obj.position);
          this.addEffect(puff, 0.9, (e, k) => { puff.scale.setScalar(4 + 26 * k); puff.material.opacity = 0.35 * (1 - k); puff.position.z += 0.3; });
        }
      }
      // the server decides when it explodes; just stop drawing it inside the wall meanwhile
      if (res && res.hit && pr.kind !== 'bolt') pr.obj.visible = false;
    }
  }

  explosion(pos) {
    const at = new THREE.Vector3(...pos);
    this.flashLight.position.copy(at);
    this.flashLight.intensity = 900000;
    this.flashLight.distance = 900;
    this.flashLightT = 0.12;
    // fireball
    for (let i = 0; i < 6; i++) {
      const f = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: new THREE.Color(4, 1.8 + Math.random(), 0.5), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, transparent: true }));
      const off = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() * 0.6).multiplyScalar(40);
      f.position.copy(at).add(off);
      const grow = 60 + Math.random() * 60;
      this.addEffect(f, 0.35 + Math.random() * 0.2, (e, k) => { f.scale.setScalar(20 + grow * k); f.material.opacity = 1 - k; });
    }
    // smoke column
    for (let i = 0; i < 8; i++) {
      const sm = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color: 0x4a4744, transparent: true, depthWrite: false }));
      sm.position.copy(at).add(new THREE.Vector3(Math.random() * 60 - 30, Math.random() * 60 - 30, Math.random() * 20));
      const rise = 30 + Math.random() * 40;
      this.addEffect(sm, 2 + Math.random(), (e, k, d) => { sm.scale.setScalar(40 + 110 * k); sm.material.opacity = 0.55 * (1 - k); sm.position.z += rise * d; });
    }
    // sparks
    const count = 24, pts = new Float32Array(count * 3), vel = [];
    for (let i = 0; i < count; i++) {
      pts.set([pos[0], pos[1], pos[2]], i * 3);
      vel.push(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() * 0.8).normalize().multiplyScalar(300 + Math.random() * 500));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    const pm = new THREE.PointsMaterial({ size: 4, map: GLOW, color: new THREE.Color(4, 2.5, 1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.addEffect(new THREE.Points(geo, pm), 0.7, (e, k, d) => {
      for (let i = 0; i < count; i++) { vel[i].z -= 700 * d; pts[i * 3] += vel[i].x * d; pts[i * 3 + 1] += vel[i].y * d; pts[i * 3 + 2] += vel[i].z * d; }
      geo.attributes.position.needsUpdate = true;
      pm.opacity = 1 - k;
    });
    // scorch mark on the floor below
    const tr = this.world.trace(pos, [pos[0], pos[1], pos[2] - 80], [0, 0, 0], [0, 0, 0]);
    if (tr.fraction < 1) {
      if (!this.scorchMat) this.scorchMat = new THREE.MeshBasicMaterial({ map: HOLE, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(110, 110), this.scorchMat);
      q.position.set(tr.endpos[0], tr.endpos[1], tr.endpos[2] + 0.3);
      q.rotation.z = Math.random() * 6;
      this.scene.add(q);
      this.decals.push(q);
      if (this.decals.length > (this.q.decals || 100)) this.scene.remove(this.decals.shift());
    }
    // shake the camera by how close it was
    const d = at.distanceTo(new THREE.Vector3(...this.eye()));
    this.shake = Math.max(this.shake || 0, Math.max(0, 1 - d / 900) * 9);
    this.sound.explosion(pos);
  }

  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const e = this.effects[i];
      e.t += dt;
      const k = Math.min(1, e.t / e.life);
      if (e.update) e.update(e, k, dt);
      if (e.t >= e.life) {
        this.scene.remove(e.obj);
        e.obj.geometry?.dispose?.();
        e.obj.material?.dispose?.();
        this.effects.splice(i, 1);
      }
    }
    if (this.flashLightT > 0) { this.flashLightT -= dt; if (this.flashLightT <= 0) { this.flashLight.intensity = 0; this.flashLight.distance = 420; } }
  }

  // ---------------------------------------------------------------- input -> commands
  eye() {
    return [this.ps.origin[0], this.ps.origin[1], this.ps.origin[2] + eyeHeight(this.ps)];
  }

  buildCmd() {
    const k = this.keys;
    let fwd = 0, side = 0, buttons = 0;
    if (!this.typing) {
      if (k.has('KeyW')) fwd += 1;
      if (k.has('KeyS')) fwd -= 1;
      if (k.has('KeyD')) side += 1;
      if (k.has('KeyA')) side -= 1;
      if (k.has('Space')) buttons |= BTN.JUMP;
      if (k.has('ControlLeft') || k.has('KeyC')) buttons |= BTN.DUCK;
      if (k.has('ShiftLeft')) buttons |= BTN.SPRINT;
      if (k.has('AltLeft')) buttons |= BTN.WALK;
      if (k.has('KeyR')) buttons |= BTN.RELOAD;
      if (k.has('KeyE')) buttons |= BTN.USE;
      if (k.has('KeyQ')) buttons |= BTN.ROCKETJUMP;
      if (this.mouseButtons & 1) buttons |= BTN.ATTACK;
      if (this.mouseButtons & 2) buttons |= BTN.ATTACK2;
      for (const extra of [this.touch, this.pad]) {
        if (!extra) continue;
        fwd += extra.fwd;
        side += extra.side;
        buttons |= extra.buttons;
      }
    }
    const len = Math.hypot(fwd, side);
    if (len > 1) { fwd /= len; side /= len; }
    return { fwd, side, buttons, yaw: this.yaw, pitch: this.pitch, w: this.wantW };
  }

  stepInput(dt) {
    while (dt > 0) {
      const step = Math.min(dt, 1 / 30);
      dt -= step;
      // Predict with exactly the values the server will see. Rounding only on the wire made the two
      // simulations drift apart a little every tick, and each snapshot snapped the camera back.
      const raw = this.buildCmd();
      const ms = +(step * 1000).toFixed(2);
      const d = ms / 1000;
      const cmd = { fwd: +raw.fwd.toFixed(2), side: +raw.side.toFixed(2), buttons: raw.buttons, yaw: +raw.yaw.toFixed(2), pitch: +raw.pitch.toFixed(2), w: raw.w };
      const seq = ++this.seq;
      this.cmds.push({ seq, cmd, dt: d });
      if (this.cmds.length > 200) this.cmds.shift();
      this.send({ t: 'c', c: [{ s: seq, f: cmd.fwd, sd: cmd.side, b: cmd.buttons, y: cmd.yaw, p: cmd.pitch, w: cmd.w, ms, rt: +this.renderTime.toFixed(3) }] });
      const ps = this.ps;
      if (ps.alive) {
        const wasGround = ps.onGround;
        pmove(this.world, ps, cmd, d, this.rules);
        if (ps.onGround && !wasGround && ps.landSpeed > 250) this.sound.land(null, Math.min(0.8, ps.landSpeed / 900));
        if (ps.jumped) { ps.jumped = false; this.sound.step(null, 0.3, this.surfaceAt(ps.origin)); }
        const sp = Math.hypot(ps.velocity[0], ps.velocity[1]);
        if (ps.onGround && sp > 140) {
          this.stepDist += sp * d;
          if (this.stepDist > (sp > 300 ? 100 : 76)) { this.stepDist = 0; this.sound.step(null, 0.28, this.surfaceAt(ps.origin)); }
        }
      }
      weaponThink(ps, cmd, d, (wi) => this.localFire(wi, cmd, seq), (n) => this.localEvent(n));
    }
  }

  selectSlot(slot) {
    const owned = WEAPONS.map((w, i) => i).filter((i) => (this.ps.owned >> i) & 1 && WEAPONS[i].slot === slot);
    if (!owned.length) { this.sound.ui(300); return; }
    const cur = owned.indexOf(this.wantW);
    this.pick(owned[(cur + 1) % owned.length]);
  }

  cycleWeapon(dir) {
    const owned = WEAPONS.map((w, i) => i).filter((i) => (this.ps.owned >> i) & 1);
    if (!owned.length) return;
    const cur = Math.max(0, owned.indexOf(this.wantW));
    this.pick(owned[(cur + dir + owned.length) % owned.length]);
  }

  pick(i) {
    if (i === this.wantW) return;
    this.lastW = this.wantW;
    this.wantW = i;
    this.sound.ui(1000);
    this.hud.weaponSelect({ ...this.ps, cur: i });
  }

  // ---------------------------------------------------------------- frame
  frame(dt, t) {
    if (!this.world) return;
    const now = performance.now() / 1000;
    // Server clock: advance smoothly and drift toward each snapshot's estimate instead of jumping to it,
    // so network jitter doesn't make other players stutter.
    const est = this.serverTime + (now - this.serverRecv);
    if (this.clock === undefined || Math.abs(est - this.clock) > 0.5) this.clock = est;
    else this.clock += dt + (est - this.clock) * Math.min(1, dt * 2);
    this.renderTime = this.clock - INTERP;

    if (this.connected) {
      if (this.ps.cur !== this.wantW && !((this.ps.owned >> this.wantW) & 1)) this.wantW = this.ps.cur;
      this.stepInput(dt);
    }
    for (let i = 0; i < 3; i++) this.smoothErr[i] *= Math.max(0, 1 - dt * 12);
    this.recoil = Math.max(0, (this.recoil || 0) - dt * 10);

    const ps = this.ps;
    const predicted = this.eye();
    let eye = predicted.map((v, i) => v + this.smoothErr[i]);
    // ease the view over stair steps (the block map is all half-block steps) instead of snapping up
    const rawZ = predicted[2];
    const crouching = ps.duckAmt > 0.001 && ps.duckAmt < 0.999;
    if (this.lastEyeZ !== undefined && ps.onGround && this.lastGround && !crouching) {
      const dz = rawZ - this.lastEyeZ;
      if (dz > 4 && dz <= 24) this.stepSmooth = Math.max(-24, (this.stepSmooth || 0) - dz);
    }
    this.stepSmooth = (this.stepSmooth || 0) * Math.exp(-dt * 12);
    this.lastEyeZ = rawZ;
    this.lastGround = ps.onGround;
    eye[2] += this.stepSmooth;
    let yaw = this.yaw, pitch = this.pitch - (this.recoil || 0) * 0.5;
    let roll = 0;
    let lookAt = null;
    if (!ps.alive && this.connected) {
      const rd = this.ragdolls.find((r) => r.id === this.myId);
      if (rd) {
        // death camera: back off from your body and watch it fall, without going through walls
        const c = rd.doll.center();
        const k = Math.min(1, (now - this.deathAt) / 1.2);
        const back = viewDir(this.yaw, 25);
        const want = [c[0] - back[0] * 150 * k, c[1] - back[1] * 150 * k, c[2] + 20 + 70 * k];
        const tr = this.world.trace(c, want, [-6, -6, -6], [6, 6, 6]);
        eye = tr.endpos.slice();
        lookAt = c;
      } else {
        const k = this.deathAt ? Math.min(1, (now - this.deathAt) / 0.5) : 1;
        eye = [ps.origin[0], ps.origin[1], ps.origin[2] + 64 - 52 * k];
        roll = 30 * k;
      }
      if (this.deathAt && now - this.deathAt > 1.5) this.hud.message(this.killer ? `Killed by ${this.killer}` : 'You died', this.mode === 'zombies' ? 'You will be back next round' : this.pad?.active ? 'Press RT to respawn' : this.touch ? 'Tap FIRE to respawn' : 'Click to respawn');
    }
    this.sound.setScene(this.watching && !this.connected ? 0.3 : 1);
    if (this.watching && !this.connected) {
      const cam = this.spectateCamera(dt, now);
      if (cam) { eye = cam.eye; lookAt = cam.at; roll = 0; }
    }
    const Wc = WEAPONS[ps.cur];
    this.zoomed = this.connected && ps.alive && !!Wc.zoom && !!(this.mouseButtons & 2 || (this.touch && this.touch.buttons & BTN.ATTACK2) || (this.pad && this.pad.buttons & BTN.ATTACK2)) && !this.typing;
    const fov = this.zoomed ? Wc.zoom : this.baseFov;
    if (this.camera.fov !== fov) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.zoomScale = this.zoomed ? Wc.zoom / this.baseFov : 1;
    const scope = document.getElementById('scope');
    if (scope && scope.hidden === this.zoomed) scope.hidden = !this.zoomed;
    this.shake = Math.max(0, (this.shake || 0) - dt * 14);
    if (this.shake > 0) {
      const a = this.shake;
      eye = eye.map((v) => v + (Math.random() - 0.5) * a);
      roll += (Math.random() - 0.5) * a * 0.6;
    }
    if (lookAt) {
      const d = [lookAt[0] - eye[0], lookAt[1] - eye[1], lookAt[2] - eye[2]];
      this.setCamera(eye, (Math.atan2(d[1], d[0]) * 180) / Math.PI, (-Math.atan2(d[2], Math.hypot(d[0], d[1])) * 180) / Math.PI, 0);
    } else this.setCamera(eye, yaw, pitch, roll);
    this.sound.listener(eye, viewDir(yaw, pitch), [0, 0, 1]);
    this.sky.position.set(eye[0], eye[1], eye[2]);
    this.sky.userData.uniforms.uTime.value = t;
    this.mapTick?.(t);

    this.updatePlayers(dt);
    if (this.mode === 'zombies') this.zv.update(dt, t);
    this.updateItems(t);
    this.updateViewmodel(dt);
    this.updateProjectiles(dt);
    this.updateRagdolls(dt);
    this.updateFlags(dt, t);
    this.updateEffects(dt);
    const myTeam = this.info.get(this.myId)?.team;
    if (this.connected && this.mode && this.mode !== 'dm' && this.mode !== 'zombies') {
      const limit = this.mode === 'ctf' ? this.caplimit : this.fraglimit;
      this.hud.teamBar({ kind: this.mode, score: this.teamScore, limit, state: this.flagState, myTeam, myId: this.myId, zm: this.zmState });
    }
    if (this.connected && this.mode === 'tdm' && this.pickLeft && !this.intermission) {
      const counts = { red: 0, blue: 0 };
      for (const i of this.info.values()) if (counts[i.team] !== undefined) counts[i.team]++;
      this.hud.teamPick({ secs: this.pickLeft, counts, mine: myTeam });
    } else this.hud.teamPick(null);
    // own powerups with seconds left
    const pw = [];
    for (const [k, def] of Object.entries(ITEMS)) if (def.power && ps[def.power] > ps.time) pw.push([def.name, Math.ceil(ps[def.power] - ps.time)]);
    this.hud.powers(ps.alive ? pw : []);
    if (this.voting) this.hud.vote(this.voting);
    this.hud.update(ps);
    if (this.timeLeft !== undefined && this.connected) this.hud.setTimer(this.timeLeft, this.limitLabel());
    if (!this.intermission) this.hud.scoreboard(this.keys.has('Tab') || !!this.touch?.scores || !!this.pad?.scores, this.info.values(), this.myId, this.mapName, this.scoreTeams(), this.scoreExtra());
    if (this.composer) this.composer.render(dt);
    else {
      // potato: the world, then the weapon in hand over it
      const r = this.renderer;
      r.autoClear = false;
      r.clear();
      r.render(this.scene, this.camera);
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
    }
  }

  setCamera(eye, yaw, pitch, roll = 0) {
    const f = viewDir(yaw, pitch);
    const y = yaw * DEG;
    let r = [Math.sin(y), -Math.cos(y), 0];
    let u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    if (roll) {
      const c = Math.cos(roll * DEG), s = Math.sin(roll * DEG);
      const r2 = r.map((v, i) => v * c + u[i] * s), u2 = u.map((v, i) => u[i] * c - r[i] * s);
      r = r2; u = u2;
    }
    this.camera.matrix.set(r[0], u[0], -f[0], eye[0], r[1], u[1], -f[1], eye[1], r[2], u[2], -f[2], eye[2], 0, 0, 0, 1);
    this.camera.updateMatrixWorld(true);
  }

  chat(text) {
    if (text.trim()) this.send({ t: 'chat', text });
  }
}
