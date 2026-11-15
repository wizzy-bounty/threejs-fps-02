// weapons.js — guns and grenades. Firing is hitscan against physics.js volumes with a
// spread model that pays for standing still: spread grows with movement, airtime and
// sustained fire (bloom), and shrinks while crouched. Grenades are real projectiles
// that bounce, then detonate into damage (frag), blindness (flash) or a vision-
// blocking volume (smoke, registered in G.smokes where bot perception reads it).

import * as THREE from 'three';
import { G, emitNoise } from './state.js';
import { WEAPONS, GRENADES } from './config.js';
import { rayWorld, rayActor } from './physics.js';
import { curGun, eyeHeight, chestHeight, damage } from './actors.js';
import * as fx from './fx.js';
import { sfx } from './audio.js';

export function newGun(id) {
  const def = WEAPONS[id];
  return { def, mag: def.mag, reserve: def.reserve };
}

export function switchSlot(actor, slot) {
  if (actor.slot === slot || !actor.alive) return;
  if ((slot === 'primary' || slot === 'sidearm') && !actor.guns[slot]) return;
  if ((slot === 'frag' || slot === 'flash' || slot === 'smoke') && actor.nades[slot] <= 0) return;
  actor.slot = slot;
  actor.reloadT = 0;
  actor.scoped = false;
  if (actor.isPlayer) sfx.uiClick();
}

export function startReload(actor) {
  const gun = curGun(actor);
  if (!gun || actor.reloadT > 0 || gun.mag >= gun.def.mag || gun.reserve <= 0) return;
  actor.reloadT = gun.def.reload;
  actor.scoped = false;
  if (actor.isPlayer) sfx.reload();
}

// Distance falloff shared by every gun: full damage to falloffStart, then a smooth
// slide to minFactor at falloffEnd.
function falloff(def, dist) {
  if (dist <= def.falloffStart) return 1;
  if (dist >= def.falloffEnd) return def.minFactor;
  const t = (dist - def.falloffStart) / (def.falloffEnd - def.falloffStart);
  return 1 - t * (1 - def.minFactor);
}

const _dir = new THREE.Vector3();
const _end = new THREE.Vector3();

function fireOnce(actor, gun) {
  const def = gun.def;
  gun.mag--;
  actor.fireT = 60 / def.rpm;
  actor.bloom = Math.min(def.bloomMax, actor.bloom + def.bloom);
  actor.kickPitch += def.recoil;

  // Spread: the price of moving, jumping and spraying, per config.js.
  const speedFrac = Math.min(1, actor.speed2d / 4.6);
  let spread = def.spread + actor.bloom + def.moveSpread * speedFrac * speedFrac;
  if (!actor.grounded) spread += def.airSpread;
  if (actor.crouch) spread *= def.crouchFactor;
  if (def.scoped && !actor.scoped) spread = Math.max(spread, 0.05);
  if (actor.blindT > 0) spread *= 2.4;

  const cp = Math.cos(actor.pitch), sp = Math.sin(actor.pitch);
  const fx0 = Math.sin(actor.yaw) * cp, fy0 = sp, fz0 = Math.cos(actor.yaw) * cp;
  // Two perpendicular axes for the spread cone (right and up around the aim line).
  const rx = fz0, ry = 0, rz = -fx0;
  const ux = ry * fz0 - rz * fy0, uy = rz * fx0 - rx * fz0, uz = rx * fy0 - ry * fx0;
  const g1 = (G.rand() + G.rand() + G.rand() - 1.5) / 1.5;
  const g2 = (G.rand() + G.rand() + G.rand() - 1.5) / 1.5;
  _dir.set(
    fx0 + (rx * g1 + ux * g2) * spread,
    fy0 + (ry * g1 + uy * g2) * spread,
    fz0 + (rz * g1 + uz * g2) * spread,
  ).normalize();

  const eye = actor.pos.y + eyeHeight(actor);
  const ox = actor.pos.x + fx0 * 0.3, oy = eye, oz = actor.pos.z + fz0 * 0.3;

  const wall = rayWorld(ox, oy, oz, _dir.x, _dir.y, _dir.z, def.range);
  let bestDist = wall ? wall.dist : def.range;
  let victim = null, victimHit = null;
  for (const other of G.actors) {
    if (other === actor || !other.alive || other.team === actor.team) continue;
    const hit = rayActor(ox, oy, oz, _dir.x, _dir.y, _dir.z, other, bestDist);
    if (hit && hit.dist < bestDist) { bestDist = hit.dist; victim = other; victimHit = hit; }
  }

  _end.set(ox + _dir.x * bestDist, oy + _dir.y * bestDist, oz + _dir.z * bestDist);
  const mx = actor.pos.x + fx0 * 0.55, my = actor.pos.y + chestHeight(actor) + 0.18, mz = actor.pos.z + fz0 * 0.55;
  fx.tracer(mx, my, mz, _end.x, _end.y, _end.z);
  // No world-space flash for the player: at 0.55 m from the camera it fills the
  // screen; the viewmodel's kick carries the shot in first person.
  if (!actor.isPlayer) fx.muzzle(mx, my, mz, def.kind === 'sniper');
  emitNoise(actor.pos.x, actor.pos.z, def.kind === 'sniper' ? 55 : 38, 'shot');
  if (actor.isPlayer || actor.pos.distanceToSquared(G.player.pos) < 900) sfx.shot(def.kind);

  if (victim) {
    const partMult = victimHit.part === 'head' ? def.headMult : victimHit.part === 'legs' ? def.legMult : 1;
    damage(victim, def.damage * falloff(def, bestDist) * partMult, victimHit.part, actor, def.name);
    fx.impact(_end.x, _end.y, _end.z, 'flesh');
  } else if (wall) {
    fx.impact(_end.x, _end.y, _end.z, 'dust');
  }
}

// ---- grenades -------------------------------------------------------------------

export const projectiles = []; // { kind, pos, vel, fuse, from }

export function throwGrenade(actor, kind) {
  if (actor.nades[kind] <= 0 || actor.fireT > 0) return;
  actor.nades[kind]--;
  actor.fireT = 0.55;
  const cp = Math.cos(actor.pitch), sp = Math.sin(actor.pitch);
  const p = new THREE.Vector3(actor.pos.x, actor.pos.y + eyeHeight(actor) - 0.1, actor.pos.z);
  const v = new THREE.Vector3(Math.sin(actor.yaw) * cp * 13.5, sp * 13.5 + 3.2, Math.cos(actor.yaw) * cp * 13.5);
  projectiles.push({ kind, pos: p, vel: v, fuse: kind === 'smoke' ? 0.85 : kind === 'flash' ? 1.25 : 1.5, from: actor });
  if (actor.isPlayer) sfx.throwIt();
  emitNoise(actor.pos.x, actor.pos.z, 7, 'step');
}

function detonate(n) {
  const def = GRENADES[n.kind];
  const { x, y, z } = n.pos;
  if (n.kind === 'frag') {
    fx.explosionFx(x, Math.max(0.4, y), z);
    sfx.explosion();
    emitNoise(x, z, 46, 'boom');
    if (G.player.pos.distanceTo(n.pos) < 12) G.shake = Math.min(0.8, G.shake + 0.35);
    for (const a of G.actors) {
      if (!a.alive) continue;
      const cx = a.pos.x, cy = a.pos.y + chestHeight(a), cz = a.pos.z;
      const d = Math.hypot(cx - x, cy - y, cz - z);
      const reach = def.radius + 0.5;
      if (d > reach) continue;
      const wall = rayWorld(x, y, z, (cx - x) / (d || 1), (cy - y) / (d || 1), (cz - z) / (d || 1), d);
      if (wall && wall.dist < d - 0.4) continue; // a wall between eats the blast
      const dmg = def.maxDamage * Math.pow(1 - d / reach, 1.35);
      if (dmg > 2) damage(a, dmg, 'torso', n.from, def.name);
    }
  } else if (n.kind === 'flash') {
    fx.muzzle(x, y, z, true);
    sfx.flashPop();
    G.flashes.push({ x, y, z, at: G.time });
    for (const a of G.actors) {
      if (!a.alive) continue;
      const cx = a.pos.x, cy = a.pos.y + eyeHeight(a), cz = a.pos.z;
      const dx = x - cx, dy = y - cy, dz = z - cz;
      const d = Math.hypot(dx, dy, dz);
      if (d > def.radius) continue;
      const wall = rayWorld(cx, cy, cz, dx / (d || 1), dy / (d || 1), dz / (d || 1), d);
      if (wall && wall.dist < d - 0.3) continue;
      // How squarely is the actor looking at the pop? Forward vs direction to flash.
      const fwd = { x: Math.sin(a.yaw), z: Math.cos(a.yaw) };
      const dot = (fwd.x * dx + fwd.z * dz) / (d || 1);
      const facing = dot > 0.5 ? 1 : dot > 0 ? 0.45 : 0.12;
      const blind = def.blindMax * facing * (1 - (d / def.radius) * 0.45);
      if (a.isPlayer) G.playerFlash = Math.max(G.playerFlash, blind);
      else a.blindT = Math.max(a.blindT, blind);
    }
  } else {
    G.smokes.push({ x, y: 1.3, z, r: def.radius, until: G.time + def.seconds });
    fx.smokePuff(x, 1.3, z, def.radius, def.seconds);
    sfx.throwIt();
  }
}

// Does a live smoke volume sit on the segment between two points? Bot vision and
// nothing else consults this — the volumes in G.smokes are the truth, fx just draws.
export function smokeBlocks(x0, y0, z0, x1, y1, z1) {
  for (const s of G.smokes) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0;
    const len2 = dx * dx + dy * dy + dz * dz;
    if (len2 < 1e-6) continue;
    let t = ((s.x - x0) * dx + (s.y - y0) * dy + (s.z - z0) * dz) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = x0 + dx * t - s.x, py = y0 + dy * t - s.y, pz = z0 + dz * t - s.z;
    if (px * px + py * py + pz * pz < s.r * s.r) return true;
  }
  return false;
}

// One purchase path for the player's buy menu and the bots' own shopping: checks the
// price and the slot, then applies. Returns true when the buy went through.
const NADE_CAPS = { frag: 1, flash: 2, smoke: 1 };
export function purchase(actor, id) {
  if (WEAPONS[id]) {
    const def = WEAPONS[id];
    if (actor.money < def.price) return false;
    if (actor.guns[def.slot] && actor.guns[def.slot].def.id === id) return false;
    actor.money -= def.price;
    actor.guns[def.slot] = newGun(id);
    return true;
  }
  if (GRENADES[id]) {
    if (actor.money < GRENADES[id].price || actor.nades[id] >= NADE_CAPS[id]) return false;
    actor.money -= GRENADES[id].price;
    actor.nades[id]++;
    return true;
  }
  if (id === 'vest' || id === 'vesthelm') {
    const price = id === 'vest' ? 650 : 1000;
    if (actor.money < price) return false;
    if (id === 'vest' && actor.vest) return false;
    if (id === 'vesthelm' && actor.helmet) return false;
    actor.money -= price;
    actor.vest = true;
    if (id === 'vesthelm') actor.helmet = true;
    actor.armorHp = 100;
    return true;
  }
  return false;
}

// ---- per-step update --------------------------------------------------------------

export function updateWeapons(dt) {
  for (const actor of G.actors) {
    actor.bloom = Math.max(0, actor.bloom - dt * 0.055);
    actor.fireT -= dt;
    if (actor.reloadT > 0) {
      actor.reloadT -= dt;
      if (actor.reloadT <= 0) {
        const gun = curGun(actor);
        if (gun) {
          const take = Math.min(gun.def.mag - gun.mag, gun.reserve);
          gun.mag += take;
          gun.reserve -= take;
        }
      }
      continue;
    }
    if (!actor.alive || (G.phase !== 'live' && G.phase !== 'planted')) { actor.pressedFire = false; continue; }
    const slot = actor.slot;
    if (slot === 'frag' || slot === 'flash' || slot === 'smoke') {
      if (actor.pressedFire) throwGrenade(actor, slot);
      actor.pressedFire = false;
      continue;
    }
    const gun = curGun(actor);
    if (!gun) { actor.pressedFire = false; continue; }
    const wants = gun.def.auto ? actor.wantFire : actor.pressedFire;
    if (wants && actor.fireT <= 0) {
      if (gun.mag <= 0) {
        if (actor.pressedFire || actor.wantFire) { sfx.dry(); actor.fireT = 0.3; startReload(actor); }
      } else {
        fireOnce(actor, gun);
        if (gun.mag === 0) startReload(actor);
      }
    }
    actor.pressedFire = false;
  }

  // Grenades in flight: gravity, floor and wall bounces, then the fuse.
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const n = projectiles[i];
    n.fuse -= dt;
    n.vel.y -= 21 * dt;
    n.pos.addScaledVector(n.vel, dt);
    if (n.pos.y < 0.1) {
      n.pos.y = 0.1;
      n.vel.y = Math.abs(n.vel.y) * 0.42;
      n.vel.x *= 0.7; n.vel.z *= 0.7;
      if (Math.abs(n.vel.y) < 0.8) n.vel.y = 0;
    }
    // Wall bounce: probe the world ray a short step ahead and reflect crudely.
    const sp = Math.hypot(n.vel.x, n.vel.z);
    if (sp > 0.5) {
      const hit = rayWorld(n.pos.x, Math.max(0.3, n.pos.y), n.pos.z, n.vel.x / sp, 0, n.vel.z / sp, 0.14);
      if (hit) {
        if (Math.abs(hit.nx) > 0.5) n.vel.x *= -0.42;
        if (Math.abs(hit.nz) > 0.5) n.vel.z *= -0.42;
      }
    }
    if (n.fuse <= 0) {
      detonate(n);
      projectiles.splice(i, 1);
    }
  }
}
