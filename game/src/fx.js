// fx.js — transient visuals, all pooled: tracers, muzzle flashes, impact particles,
// smoke clouds and the explosion. Pools are allocated once at init; the per-frame
// update only moves numbers in preallocated arrays, so the hot loop never allocates.

import * as THREE from 'three';
import { G } from './state.js';

let scene = null;

// -- tracers: 48 line segments, additive, fading over 60 ms ----------------------
const TRACERS = 48;
const tracerPool = [];
let tracerIdx = 0;

// -- particles: one Points cloud, 320 slots --------------------------------------
const PMAX = 320;
const pPos = new Float32Array(PMAX * 3);
const pVel = new Float32Array(PMAX * 3);
const pLife = new Float32Array(PMAX);
const pCol = new Float32Array(PMAX * 3);
let pIdx = 0;
let points = null;

// -- muzzle flashes: 10 billboards ----------------------------------------------
const FLASHES = 10;
const flashPool = [];
let flashIdx = 0;

// -- smoke clouds: sprite groups per canister ------------------------------------
const smokeClouds = []; // { sprites: [Sprite], until, growT }

// -- explosion light --------------------------------------------------------------
let boomLight = null;
let boomT = 0;

function radialTexture(inner, outer) {
  const cv = document.createElement('canvas');
  cv.width = 64; cv.height = 64;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 31);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(cv);
}

let smokeTex = null;
let flashTex = null;

export function initFx(s) {
  scene = s;
  smokeTex = radialTexture('rgba(196,192,184,0.85)', 'rgba(196,192,184,0)');
  flashTex = radialTexture('rgba(255,214,140,1)', 'rgba(255,120,30,0)');

  const tracerMat = new THREE.LineBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  for (let i = 0; i < TRACERS; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, tracerMat);
    line.visible = false;
    line.frustumCulled = false;
    scene.add(line);
    tracerPool.push({ line, until: 0 });
  }

  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.14, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false }));
  points.frustumCulled = false;
  for (let i = 0; i < PMAX; i++) pPos[i * 3 + 1] = -50;
  scene.add(points);

  for (let i = 0; i < FLASHES; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    sp.visible = false;
    sp.scale.set(0.7, 0.7, 1);
    scene.add(sp);
    flashPool.push({ sp, until: 0 });
  }

  boomLight = new THREE.PointLight(0xff8a3c, 0, 26, 1.6);
  scene.add(boomLight);
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

export function tracer(x0, y0, z0, x1, y1, z1) {
  const t = tracerPool[tracerIdx];
  tracerIdx = (tracerIdx + 1) % TRACERS;
  const arr = t.line.geometry.attributes.position.array;
  arr[0] = x0; arr[1] = y0; arr[2] = z0; arr[3] = x1; arr[4] = y1; arr[5] = z1;
  t.line.geometry.attributes.position.needsUpdate = true;
  t.line.visible = true;
  t.until = G.time + 0.06;
}

export function muzzle(x, y, z, big) {
  const f = flashPool[flashIdx];
  flashIdx = (flashIdx + 1) % FLASHES;
  f.sp.position.set(x, y, z);
  const s = big ? 1.15 : 0.62;
  f.sp.scale.set(s, s, 1);
  f.sp.visible = true;
  f.until = G.time + 0.045;
}

function spawnParticles(x, y, z, count, color, speed, spread, up) {
  const c = new THREE.Color(color);
  for (let n = 0; n < count; n++) {
    const i = pIdx;
    pIdx = (pIdx + 1) % PMAX;
    pPos[i * 3] = x; pPos[i * 3 + 1] = y; pPos[i * 3 + 2] = z;
    pVel[i * 3] = (G.rand() - 0.5) * 2 * spread * speed;
    pVel[i * 3 + 1] = (G.rand() * up) * speed;
    pVel[i * 3 + 2] = (G.rand() - 0.5) * 2 * spread * speed;
    pLife[i] = 0.28 + G.rand() * 0.3;
    pCol[i * 3] = c.r; pCol[i * 3 + 1] = c.g; pCol[i * 3 + 2] = c.b;
  }
}

export function impact(x, y, z, kind) {
  if (kind === 'flesh') spawnParticles(x, y, z, 7, 0x9c2b1e, 1.6, 0.7, 0.8);
  else if (kind === 'metal') spawnParticles(x, y, z, 6, 0xffc46b, 2.6, 0.9, 0.7);
  else spawnParticles(x, y, z, 5, 0xb8a88e, 1.5, 0.8, 0.9); // dust off concrete and wood
}

export function smokePuff(x, y, z, radius, seconds) {
  const sprites = [];
  const group = new THREE.Group();
  for (let i = 0; i < 13; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, opacity: 0.34, depthWrite: false }));
    const ang = (i / 13) * Math.PI * 2;
    const rr = radius * (0.25 + G.rand() * 0.6);
    sp.position.set(Math.cos(ang) * rr, (G.rand() - 0.3) * radius * 0.7, Math.sin(ang) * rr);
    const sc = radius * (0.9 + G.rand() * 0.7);
    sp.scale.set(sc, sc, 1);
    group.add(sp);
    sprites.push(sp);
  }
  group.position.set(x, y, z);
  scene.add(group);
  smokeClouds.push({ group, until: G.time + seconds, born: G.time });
}

export function explosionFx(x, y, z) {
  spawnParticles(x, y + 0.5, z, 60, 0xff8a3c, 7, 1, 1.4);
  spawnParticles(x, y + 0.5, z, 26, 0x57493c, 4, 1, 1.1);
  muzzle(x, y + 1, z, true);
  boomLight.position.set(x, y + 2.5, z);
  boomLight.intensity = 900;
  boomT = G.time + 0.4;
}

export function updateFx(dt) {
  for (const t of tracerPool) if (t.line.visible && G.time > t.until) t.line.visible = false;
  for (const f of flashPool) if (f.sp.visible && G.time > f.until) f.sp.visible = false;

  let anyAlive = false;
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) continue;
    anyAlive = true;
    pLife[i] -= dt;
    if (pLife[i] <= 0) { pPos[i * 3 + 1] = -50; continue; }
    pVel[i * 3 + 1] -= 5.5 * dt;
    pPos[i * 3] += pVel[i * 3] * dt;
    pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
    pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
    if (pPos[i * 3 + 1] < 0.03) pPos[i * 3 + 1] = 0.03;
  }
  if (anyAlive) {
    points.geometry.attributes.position.needsUpdate = true;
    points.geometry.attributes.color.needsUpdate = true;
  }

  for (let i = smokeClouds.length - 1; i >= 0; i--) {
    const c = smokeClouds[i];
    if (G.time > c.until) {
      scene.remove(c.group);
      smokeClouds.splice(i, 1);
    } else if (G.time > c.until - 1.2) {
      c.group.children.forEach((sp) => { sp.material.opacity = 0.34 * Math.max(0, (c.until - G.time) / 1.2); });
    }
  }

  if (boomLight.intensity > 0) {
    boomLight.intensity = Math.max(0, boomLight.intensity - dt * 2600);
  }
}
