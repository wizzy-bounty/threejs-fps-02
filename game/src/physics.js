// physics.js — collision and ray tests against the map's solid table. Movement is a
// circle swept axis-by-axis (so actors slide along walls); sight and bullets are exact
// ray-vs-box tests, so a shot that clears a crate visually also clears it in the sim.

import { SOLIDS } from './map.js';

export const MOVE_BLOCK = 0.55;  // solids taller than this stop a walking actor
export const SIGHT_BLOCK = 1.05; // solids taller than this block a chest-height sight line

// Move a circle (x, z, radius) by (dx, dz), sliding on movement-blocking solids.
// Writes the result into out {x, z}; returns true if anything was hit.
export function slideMove(x, z, dx, dz, radius, out) {
  let hit = false;
  let nx = x + dx;
  for (const s of SOLIDS) {
    if (s.h <= MOVE_BLOCK) continue;
    if (nx + radius > s.x0 && nx - radius < s.x1 && z + radius > s.z0 && z - radius < s.z1) {
      nx = dx > 0 ? Math.min(nx, s.x0 - radius) : Math.max(nx, s.x1 + radius);
      hit = true;
    }
  }
  let nz = z + dz;
  for (const s of SOLIDS) {
    if (s.h <= MOVE_BLOCK) continue;
    if (nx + radius > s.x0 && nx - radius < s.x1 && nz + radius > s.z0 && nz - radius < s.z1) {
      nz = dz > 0 ? Math.min(nz, s.z0 - radius) : Math.max(nz, s.z1 + radius);
      hit = true;
    }
  }
  out.x = nx;
  out.z = nz;
  return hit;
}

// Shared actor movement, used by the player controller and every bot so both play by
// the same rules: velocity accelerates toward the wish direction (fast on the ground,
// weak in the air — no bunny-hop steering), crouching trades speed for accuracy, and
// position integrates through slideMove. actor is duck-typed: pos/vel are Vector3-like,
// crouch/grounded/vy plain fields. maxSpeed already includes weapon and scope factors.
const _slide = { x: 0, z: 0 };
export function moveActor(actor, wishX, wishZ, dt, maxSpeed) {
  const accel = actor.grounded ? 34 : 2.6;
  actor.vel.x += (wishX * maxSpeed - actor.vel.x) * Math.min(1, accel * dt);
  actor.vel.z += (wishZ * maxSpeed - actor.vel.z) * Math.min(1, accel * dt);
  if (actor.crouch) {
    actor.vel.x *= Math.max(0, 1 - 2.2 * dt);
    actor.vel.z *= Math.max(0, 1 - 2.2 * dt);
  }
  slideMove(actor.pos.x, actor.pos.z, actor.vel.x * dt, actor.vel.z * dt, 0.42, _slide);
  actor.pos.x = _slide.x;
  actor.pos.z = _slide.z;
  actor.speed2d = Math.hypot(actor.vel.x, actor.vel.z);
  if (!actor.grounded) {
    actor.vy -= 13.5 * dt;
    actor.pos.y += actor.vy * dt;
    if (actor.pos.y <= 0) {
      actor.pos.y = 0;
      actor.vy = 0;
      actor.grounded = true;
    }
  }
}

export function jump(actor) {
  if (actor.grounded && actor.alive) {
    actor.vy = 4.4;
    actor.grounded = false;
    actor.pos.y = 0.01;
  }
}

// 2D segment vs the sight-blocking solids, for bot vision. A low crate you can see
// over does not block; a boxcar does.
export function sightBlocked(x0, z0, x1, z1) {
  for (const s of SOLIDS) {
    if (s.h <= SIGHT_BLOCK) continue;
    if (segmentBox(x0, z0, x1, z1, s)) return true;
  }
  return false;
}

// Liang-Barsky clip of a segment against one box; true when they touch.
function segmentBox(x0, z0, x1, z1, s) {
  const dx = x1 - x0, dz = z1 - z0;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dz, dz];
  const q = [x0 - s.x0, s.x1 - x0, z0 - s.z0, s.z1 - z0];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
      else { if (t < t0) return false; if (t < t1) t1 = t; }
    }
  }
  return true;
}

// Exact 3D ray vs every solid (slab test) plus the ground plane. origin/dir are
// THREE.Vector3-like {x,y,z}; dir must be normalised. Returns { dist, nx, ny, nz }
// for the nearest surface, or null. Used for bullets and impact effects.
export function rayWorld(ox, oy, oz, dx, dy, dz, maxDist) {
  let best = maxDist;
  let nx = 0, ny = 1, nz = 0;
  for (const s of SOLIDS) {
    let tmin = 0, tmax = best;
    let axis = -1;
    // X slab
    if (Math.abs(dx) < 1e-9) { if (ox < s.x0 || ox > s.x1) continue; }
    else {
      let t1 = (s.x0 - ox) / dx, t2 = (s.x1 - ox) / dx;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; axis = 0; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // Y slab (boxes stand on the ground: y in [0, h])
    if (Math.abs(dy) < 1e-9) { if (oy < 0 || oy > s.h) continue; }
    else {
      let t1 = (0 - oy) / dy, t2 = (s.h - oy) / dy;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; axis = 1; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    // Z slab
    if (Math.abs(dz) < 1e-9) { if (oz < s.z0 || oz > s.z1) continue; }
    else {
      let t1 = (s.z0 - oz) / dz, t2 = (s.z1 - oz) / dz;
      if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
      if (t1 > tmin) { tmin = t1; axis = 2; }
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) continue;
    }
    if (tmin < best && tmin > 0.001) {
      best = tmin;
      nx = axis === 0 ? (dx > 0 ? -1 : 1) : 0;
      ny = axis === 1 ? (dy > 0 ? -1 : 1) : 0;
      nz = axis === 2 ? (dz > 0 ? -1 : 1) : 0;
    }
  }
  if (dy < -1e-9) {
    const t = -oy / dy;
    if (t > 0.001 && t < best) { best = t; nx = 0; ny = 1; nz = 0; }
  }
  return best < maxDist ? { dist: best, nx, ny, nz } : null;
}

// Ray vs one actor's three hit volumes: head sphere, torso and leg cylinders.
// Heights follow the actor's stance; returns { dist, part } or null.
export function rayActor(ox, oy, oz, dx, dy, dz, actor, maxDist) {
  const base = actor.pos.y; // feet (0 unless mid-hop)
  const crouch = actor.crouch;
  const headY = base + (crouch ? 1.16 : 1.56);
  const torsoTop = base + (crouch ? 1.02 : 1.44);
  const torsoBot = base + 0.72;
  const ax = actor.pos.x, az = actor.pos.z;
  let best = null;

  // Head: sphere r 0.23.
  {
    const cx = ax, cy = headY, cz = az;
    const lx = cx - ox, ly = cy - oy, lz = cz - oz;
    const tca = lx * dx + ly * dy + lz * dz;
    if (tca > 0) {
      const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
      const r = 0.23;
      if (d2 < r * r) {
        const t = tca - Math.sqrt(r * r - d2);
        if (t > 0.001 && t < maxDist) best = { dist: t, part: 'head' };
      }
    }
  }
  // Torso and legs: vertical cylinders, tested as a 2D ray-circle plus a y range.
  const parts = [
    { r: 0.37, y0: torsoBot, y1: torsoTop, part: 'torso' },
    { r: 0.34, y0: base + 0.04, y1: torsoBot, part: 'legs' },
  ];
  for (const p of parts) {
    const lx = ax - ox, lz = az - oz;
    const tca = lx * dx + lz * dz;
    if (tca < 0) continue;
    const d2 = lx * lx + lz * lz - tca * tca;
    if (d2 >= p.r * p.r) continue;
    const t = tca - Math.sqrt(p.r * p.r - d2);
    if (t < 0.001 || t > maxDist) continue;
    const y = oy + dy * t;
    if (y < p.y0 || y > p.y1) continue;
    if (!best || t < best.dist) best = { dist: t, part: p.part };
  }
  return best;
}
