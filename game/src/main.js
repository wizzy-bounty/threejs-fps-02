// main.js — bootstrap and the game loop. The simulation runs on a fixed 1/60 step
// (rounds, player, bots, weapons) and rendering just draws the state it leaves, so
// the game plays identically at any display rate. A ?shot=<name>&seed=<n> URL builds
// a frozen, seeded scene instead of a live match: that is how the entry's screenshots
// are taken, and it is handy for debugging a pose.

import * as THREE from 'three';
import { G, setBanner, pushRadio, pushFeed } from './state.js';
import { PALETTE } from './config.js';
import { buildMap } from './map.js';
import { initFx, updateFx, smokePuff } from './fx.js';
import { initAudio } from './audio.js';
import { initInput, lockPointer, consumeStep, pressed } from './input.js';
import { updatePlayer, initViewmodel, updateCamera } from './player.js';
import { updateBots } from './bots.js';
import { updateWeapons, newGun } from './weapons.js';
import { switchSlot } from './weapons.js';
import * as rounds from './rounds.js';
import { initHud, updateHud, setBuyOpen, isBuyOpen, toggleBuy, buyDigit } from './hud.js';
import { poseActor } from './actors.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
// ?autostart runs the match without the click/pointer-lock gate, so the full game
// loop can be exercised headlessly (CI, smoke tests). No aiming is possible there.
const AUTOSTART = params.has('autostart');
const seed = Number(params.get('seed') || 20261115) >>> 0;

const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.28;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
// v4 BRIGHTEN: fog pushed out (was 55–250) so the map reads as far as v2 did
// instead of sinking into haze; the dusk mood comes from the palette, not fog.
scene.fog = new THREE.Fog(PALETTE.fog, 80, 320);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 500);
scene.add(camera);

// Dusk sky: a gradient dome, warm at the horizon, deep blue-grey overhead.
{
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.sky) },
      bottom: { value: new THREE.Color(PALETTE.horizon) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 bottom; void main(){ float t = smoothstep(-0.06, 0.5, normalize(vP).y); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(340, 24, 12), skyMat));
}

const hemi = new THREE.HemisphereLight(0xffd9b3, 0x50463c, 1.95);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffb36b, 2.5);
sun.position.set(-48, 62, -30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -64;
sun.shadow.camera.right = 64;
sun.shadow.camera.top = 50;
sun.shadow.camera.bottom = -50;
sun.shadow.camera.near = 5;
sun.shadow.camera.far = 190;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
scene.add(sun);
scene.add(sun.target);

// v2: three warm site lights so the objective reads at dusk — the furnace glow at
// site A (it flickers, like a real foundry mouth), a cool teal wash over the Tank
// Depot at site B, and a warm lamp over the foundry hall. No shadows on these;
// the sun keeps the only shadow map.
const furnaceLight = new THREE.PointLight(0xff7a2e, 620, 46, 1.8);
furnaceLight.position.set(41, 7, -26);
scene.add(furnaceLight);
const tankLight = new THREE.PointLight(0x7fd4c8, 330, 38, 1.8);
tankLight.position.set(39, 6, 23);
scene.add(tankLight);
const hallLight = new THREE.PointLight(0xffc46b, 280, 30, 1.8);
hallLight.position.set(11, 4.2, 0);
scene.add(hallLight);

buildMap(scene);
initFx(scene);
initViewmodel(camera);
initHud();
G.headless = AUTOSTART; // the charge goes to a bot in headless runs (see rounds.js)
rounds.initMatch(scene, seed);

// Debug/testing handle: the whole game state, for headless smoke tests and tuning.
window.__ironspur = G;

// Fast-forward the fixed-step sim by N seconds without rendering — headless
// round-arc tests (buy → execute → plant → round end) run on this, not on
// wall-clock waits. Gameplay code never calls it.
window.__advance = (seconds) => {
  const n = Math.max(0, Math.round(seconds * 60));
  for (let i = 0; i < n; i++) step(STEP);
};

// ---- frozen screenshot scenes ------------------------------------------------------

function pose(a, x, z, yaw, opts = {}) {
  a.pos.set(x, 0, z);
  a.yaw = yaw;
  a.pitch = opts.pitch || 0;
  a.crouch = !!opts.crouch;
  if (opts.hp !== undefined) a.hp = opts.hp;
  if (opts.dead) { a.alive = false; a.hp = 0; a.deathT = 1; }
  if (a.brain) {
    a.brain.state = 'hold';
    a.brain.holdPos = { x, z };
    a.brain.baseYaw = yaw;
    a.brain.faceYaw = yaw;
  }
}

function givePrimary(a, id) {
  a.guns.primary = newGun(id);
  switchSlot(a, 'primary');
}

function setupShot(kind) {
  const atk = G.actors.filter((a) => a.team === 'atk');
  const def = G.actors.filter((a) => a.team === 'def');
  const p = G.player;
  G.banner = null;

  if (kind === 'buy') {
    G.round = 3;
    G.score.atk = 2;
    G.score.def = 1;
    p.money = 4750;
    // Staged team chatter + last round's kill, so the radio panel and the feed
    // read in the buy frame exactly as they do mid-match.
    pushRadio('Vex: PLAN — HIT SITE B');
    pushRadio('Ondo: BUYING CARBINE — 2700');
    pushFeed('Vex ▸ Hask  ·  M7 Carbine');
    setBanner('ROUND 3', 'Buy phase — B for the buy menu', 9999);
    setBuyOpen(true);
    return;
  }

  if (kind === 'push') {
    G.phase = 'live';
    G.phaseT = 63;
    G.round = 5;
    G.score.atk = 3;
    G.score.def = 2;
    givePrimary(p, 'carbine');
    p.money = 3200;
    pushRadio('Vex: CONTACT RAIL LANE NORTH — 2 HOSTILES');
    pushRadio('Ondo: EXECUTING SITE B — SMOKE OUT');
    pushFeed('Rurik ▸ Petrov  ·  Longshot .50');
    pose(p, -26, -13.4, Math.PI / 2, { pitch: 0.01 });
    pose(atk[1], -19.5, -11.6, Math.PI / 2);
    pose(atk[2], -29.5, -21.5, Math.PI / 2, { crouch: true });
    pose(def[0], -7, -15.2, -Math.PI / 2, { hp: 62 });
    pose(def[1], -3, -20.8, -Math.PI / 2);
    givePrimary(def[0], 'carbine');
    // One exchanged volley, frozen mid-flight: tracers and muzzle flashes hang in
    // the air because the sim clock never advances past this step.
    def[0].wantFire = true;
    def[0].pressedFire = true;
    p.wantFire = true;
    p.pressedFire = true;
    updateWeapons(1 / 60);
    p.wantFire = false;
    def[0].wantFire = false;
    // The pose is staged, not played: undo any damage the volley did so the frame
    // shows the firefight, not the damage vignette.
    p.hp = 78;
    p.hurtT = -9;
    def[0].hp = 62;
    def[0].hurtT = -9;
    G.shake = 0;
    return;
  }

  if (kind === 'plant') {
    G.phase = 'planted';
    G.round = 8;
    G.score.atk = 4;
    G.score.def = 3;
    G.bomb.planted = true;
    G.bomb.site = 'A';
    G.bomb.x = 37.5;
    G.bomb.z = -21.5;
    G.bomb.fuse = 29;
    G.phaseT = 29;
    rounds.showBombProp();
    givePrimary(p, 'carbine');
    p.hp = 64;
    p.money = 1900;
    pushRadio('Vex: CHARGE PLANTED SITE A — HOLDING');
    pushRadio('Sable: HOLDING FURNACE YARD');
    pushFeed('Vex ▸ Mire  ·  M7 Carbine');
    pushFeed('Sable ▸ Cobalt  ·  Kestrel-9 SMG');
    pose(p, 27, -13.6, 2.24);
    pose(atk[1], 30.5, -25.5, Math.PI / 2);
    pose(def[0], 45.5, -29.5, -0.76);
    pose(def[1], 34, -22.8, 0, { dead: true });
    pose(def[2], 42.5, -24.5, 0, { dead: true });
    // v4: the smoke sits at the far furnace corner of the site now, not in the
    // middle of the player's sightline — and it is smaller/thinner (fx.js).
    G.smokes.push({ x: 44.5, y: 1.2, z: -28.5, r: 2.4, until: 1e9 });
    smokePuff(44.5, 1.2, -28.5, 2.4, 9999);
    setBanner('CHARGE PLANTED', 'Site A — hold the site', 9999);
    return;
  }

  // 'end': the round is Emberline's, over the planted site.
  G.phase = 'over';
  G.phaseT = 4;
  G.round = 10;
  G.score.atk = 6;
  G.score.def = 4;
  G.winner = 'atk';
  givePrimary(p, 'carbine');
  p.hp = 41;
  p.money = 5300;
  pose(p, 25.5, -12.8, 2.22);
  pose(atk[1], 30, -24.8, 2.2);
  pose(def[0], 34, -22.8, 0, { dead: true });
  pose(def[1], 37, -19.8, 0, { dead: true });
  // v4: the end frame shows the scoreboard (boardForced), and it must read as a
  // match the bots actually played in — every bot has kills, not just the player
  // (v3's board showed WIZZY 14, everyone else 0). Kills balance deaths per side.
  const tally = {
    You: [6, 2, 5300], Vex: [4, 3, 4100], Ondo: [3, 2, 2900], Rurik: [5, 3, 3600],
    Sable: [3, 3, 2200], Hask: [3, 5, 2400], Mire: [2, 4, 1500], Cobalt: [4, 3, 3100],
    Yuna: [1, 5, 1200], Petrov: [3, 4, 2700],
  };
  for (const a of G.actors) {
    const t = tally[a.isPlayer ? 'You' : a.name];
    if (t) { a.kills = t[0]; a.deaths = t[1]; a.money = t[2]; }
  }
  p.money = 5300;
  G.boardForced = true;
  pushRadio('Vex: SITE A CLEAR — HOLDING');
  pushRadio('Ondo: 2 HOSTILES DOWN MID');
  pushFeed('You ▸ Hask  ·  M7 Carbine');
  pushFeed('Vex ▸ Yuna  ·  M7 Carbine');
  setBanner('EMBERLINE TAKE THE ROUND', 'The charge detonated — Site A', 9999);
}

// ---- live-match flow -----------------------------------------------------------------

const overlay = document.getElementById('overlay');
const overlayCopy = document.getElementById('overlay-copy');
const playButton = document.getElementById('play');
let started = false;
let matchShown = false;

playButton.addEventListener('click', () => {
  initAudio();
  if (G.phase === 'matchover') {
    rounds.initMatch(scene, (Math.random() * 1e9) >>> 0);
    matchShown = false;
  }
  started = true;
  overlay.hidden = true;
  lockPointer(renderer.domElement);
});

document.addEventListener('pointerlockchange', () => {
  const isLocked = document.pointerLockElement === renderer.domElement;
  if (!isLocked && started && G.phase !== 'matchover' && !SHOT) {
    overlayCopy.textContent = 'Paused. The Wardens are not going anywhere.';
    playButton.textContent = 'Click to resume';
    overlay.hidden = false;
  }
  if (isLocked) overlay.hidden = true;
});

if (SHOT) {
  setupShot(SHOT);
  overlay.hidden = true;
  started = true;
}
if (AUTOSTART) {
  overlay.hidden = true;
  started = true;
}

// ---- the loop --------------------------------------------------------------------------

const STEP = 1 / 60;
let acc = 0;
let last = performance.now();
let shotReady = false;

function step(dt) {
  G.time += dt;
  rounds.update(dt);
  updatePlayer(dt);
  updateBots(dt);
  updateWeapons(dt);
  updateFx(dt);
  if (G.playerFlash > 0) G.playerFlash = Math.max(0, G.playerFlash - dt);
  consumeStep();
}

function animate(now) {
  requestAnimationFrame(animate);
  const dtReal = Math.min(0.1, (now - last) / 1000);
  last = now;

  // The furnace breathes: its light flickers on the sim clock, which stands still
  // in a frozen ?shot= scene, so screenshots stay deterministic.
  furnaceLight.intensity = 620 + Math.sin(G.time * 7.3) * 45 + Math.sin(G.time * 13.7) * 25;

  if (SHOT) {
    // Frozen scene: draw the posed state, never advance the clock.
    for (const a of G.actors) poseActor(a, 0);
    updateCamera(camera, 0.016);
    updateHud();
    renderer.render(scene, camera);
    if (!shotReady) {
      shotReady = true;
      window.__shotReady = true;
    }
    return;
  }

  // Frame-level UI keys are read before the steps consume the press queue.
  if (pressed.has('KeyB')) toggleBuy();
  if (isBuyOpen()) for (let n = 1; n <= 9; n++) if (pressed.has('Digit' + n)) buyDigit(n);

  const isLocked = document.pointerLockElement === renderer.domElement;
  if (started && (isLocked || AUTOSTART) && G.phase !== 'matchover') {
    acc += dtReal;
    let steps = 0;
    while (acc >= STEP && steps < 5) {
      step(STEP);
      acc -= STEP;
      steps++;
    }
    if (steps === 5) acc = 0;
  } else {
    consumeStep();
  }

  if (G.phase === 'matchover' && !matchShown) {
    matchShown = true;
    document.exitPointerLock();
    overlayCopy.textContent = `Final score — Emberline ${G.score.atk}, Wardens ${G.score.def}. The yard ${G.winner === 'atk' ? 'burns amber' : 'stays teal'} tonight.`;
    playButton.textContent = 'Play again';
    overlay.hidden = false;
  }

  for (const a of G.actors) poseActor(a, dtReal);
  updateCamera(camera, dtReal);
  updateHud();
  renderer.render(scene, camera);
}
requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
