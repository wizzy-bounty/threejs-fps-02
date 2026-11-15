// player.js — the human controller: mouse look, WASD movement through the shared
// physics, weapon slots, scope, and the first-person viewmodel + camera. Everything
// the player can do, a bot does through the same actor fields; this module only
// translates input into those fields.

import * as THREE from 'three';
import { G } from './state.js';
import { down, pressed, mouse } from './input.js';
import { moveActor, jump } from './physics.js';
import { curGun, eyeHeight } from './actors.js';
import { switchSlot, startReload } from './weapons.js';
import { emitNoise } from './state.js';

// Read by rounds.js each step: is the player holding the interact key (plant)?
export const playerInput = { interact: false };

const SENS = 0.0021;
let stepT = 0; // footstep noise timer

function applyLook(p) {
  p.yaw -= mouse.dx * SENS;
  p.pitch -= mouse.dy * SENS;
  p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
}

export function updatePlayer(dt) {
  const p = G.player;
  if (!p) return;
  playerInput.interact = down.has('KeyE');
  applyLook(p);
  if (!p.alive) { p.wantFire = false; p.pressedFire = false; return; }

  if (pressed.has('Digit1')) switchSlot(p, 'primary');
  if (pressed.has('Digit2')) switchSlot(p, 'sidearm');
  if (pressed.has('Digit3')) switchSlot(p, 'frag');
  if (pressed.has('Digit4')) switchSlot(p, 'flash');
  if (pressed.has('Digit5')) switchSlot(p, 'smoke');
  if (pressed.has('KeyR')) startReload(p);

  const gun = curGun(p);
  if (pressed.has('MouseRight') && gun && gun.def.scoped) p.scoped = !p.scoped;
  if (!gun || !gun.def.scoped) p.scoped = false;
  G.scoped = p.scoped;

  p.crouch = down.has('ControlLeft') || down.has('KeyC');
  if (pressed.has('Space')) jump(p);

  const f = (down.has('KeyW') ? 1 : 0) - (down.has('KeyS') ? 1 : 0);
  const r = (down.has('KeyD') ? 1 : 0) - (down.has('KeyA') ? 1 : 0);
  const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw);
  const rx = -fz, rz = fx;
  let wx = fx * f + rx * r;
  let wz = fz * f + rz * r;
  const len = Math.hypot(wx, wz);
  if (len > 1) { wx /= len; wz /= len; }

  const frozen = G.phase === 'buy' || G.phase === 'over' || G.phase === 'menu';
  const maxSpeed = 4.8 * (gun ? gun.def.moveFactor : 1) * (p.crouch ? 0.45 : 1) * (p.scoped ? 0.45 : 1);
  moveActor(p, frozen ? 0 : wx, frozen ? 0 : wz, dt, maxSpeed);

  const canAct = G.phase === 'live' || G.phase === 'planted';
  p.wantFire = canAct && mouse.down;
  p.pressedFire = canAct && mouse.pressedDown;

  // Footsteps bots can hear: only at near-full speed, never while crouched.
  stepT -= dt;
  if (p.speed2d > 3.4 && p.grounded && stepT <= 0) {
    emitNoise(p.pos.x, p.pos.z, 9, 'step');
    stepT = 0.36;
  }
}

// ---- viewmodel + camera -----------------------------------------------------------

let vm = null;         // the viewmodel group, parented to the camera
let vmGun = null;      // rebuilt when the held weapon changes
let vmDefId = null;
let bobT = 0;

const vmMats = {
  body: new THREE.MeshLambertMaterial({ color: 0x22252a }),
  dark: new THREE.MeshLambertMaterial({ color: 0x14161a }),
  accent: new THREE.MeshLambertMaterial({ color: 0xe8873a }),
  wood: new THREE.MeshLambertMaterial({ color: 0x8a6844 }),
};

function vmBox(w, h, d, mat, x, y, z, parent) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function buildVmGun(def) {
  const g = new THREE.Group();
  if (!def) return g;
  if (def.kind === 'pistol') {
    vmBox(0.07, 0.11, 0.24, vmMats.body, 0, 0, -0.1, g);
    vmBox(0.05, 0.05, 0.12, vmMats.dark, 0, 0.045, -0.24, g);
    vmBox(0.06, 0.14, 0.08, vmMats.dark, 0, -0.1, -0.02, g);
  } else if (def.kind === 'smg') {
    vmBox(0.08, 0.13, 0.4, vmMats.body, 0, 0, -0.16, g);
    vmBox(0.05, 0.05, 0.2, vmMats.dark, 0, 0.03, -0.42, g);
    vmBox(0.06, 0.2, 0.07, vmMats.dark, 0, -0.14, -0.14, g);
    vmBox(0.04, 0.08, 0.04, vmMats.accent, 0, 0.1, -0.2, g);
  } else if (def.kind === 'sniper') {
    vmBox(0.08, 0.12, 0.52, vmMats.wood, 0, -0.01, -0.2, g);
    vmBox(0.04, 0.04, 0.5, vmMats.dark, 0, 0.03, -0.62, g);
    vmBox(0.07, 0.09, 0.2, vmMats.dark, 0, 0.11, -0.24, g); // scope tube
  } else {
    vmBox(0.08, 0.14, 0.46, vmMats.body, 0, 0, -0.18, g);
    vmBox(0.05, 0.05, 0.26, vmMats.dark, 0, 0.04, -0.5, g);
    vmBox(0.06, 0.2, 0.08, vmMats.dark, 0, -0.15, -0.16, g);
    vmBox(0.03, 0.09, 0.03, vmMats.accent, 0, 0.11, -0.3, g);
  }
  return g;
}

export function initViewmodel(camera) {
  vm = new THREE.Group();
  vm.position.set(0.27, -0.235, -0.45);
  camera.add(vm);
}

export function updateCamera(camera, dt) {
  const p = G.player;
  if (!p) return;
  p.kickPitch = Math.max(0, p.kickPitch - dt * 0.11);
  const pitch = Math.max(-1.5, Math.min(1.5, p.pitch + p.kickPitch));
  const eye = p.pos.y + (p.alive ? eyeHeight(p) : 0.55);
  camera.position.set(p.pos.x, eye, p.pos.z);
  if (G.shake > 0.001) {
    camera.position.x += (G.rand() - 0.5) * G.shake * 0.14;
    camera.position.y += (G.rand() - 0.5) * G.shake * 0.14;
    G.shake = Math.max(0, G.shake - dt * 1.7);
  }
  const cp = Math.cos(pitch);
  camera.lookAt(
    p.pos.x + Math.sin(p.yaw) * cp,
    eye + Math.sin(pitch),
    p.pos.z + Math.cos(p.yaw) * cp,
  );
  const targetFov = p.scoped ? 22 : 75;
  if (Math.abs(camera.fov - targetFov) > 0.2) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 11);
    camera.updateProjectionMatrix();
  }
  // Viewmodel follows the held item, with a speed bob and a recoil kick.
  if (vm) {
    const gun = curGun(p);
    const defId = p.slot === 'primary' || p.slot === 'sidearm' ? (gun ? gun.def.id : null) : p.slot;
    if (defId !== vmDefId) {
      vmDefId = defId;
      if (vmGun) vm.remove(vmGun);
      vmGun = buildVmGun(gun ? gun.def : null);
      if (p.slot === 'frag' || p.slot === 'flash' || p.slot === 'smoke') {
        vmBox(0.11, 0.11, 0.11, vmMats.accent, 0, 0, -0.1, vmGun);
      }
      vm.add(vmGun);
    }
    bobT += dt * (2 + p.speed2d * 1.6);
    const bob = p.grounded && p.speed2d > 0.3 ? Math.sin(bobT * 2) * 0.008 : 0;
    vm.position.y = -0.235 + bob - p.kickPitch * 0.35;
    vm.position.z = -0.45 + p.kickPitch * 1.4;
    vm.visible = p.alive && !p.scoped;
  }
}
