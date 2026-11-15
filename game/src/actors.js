// actors.js — the actor record every combatant shares (the player and all nine bots),
// the low-poly soldier mesh built for each bot, and the damage/kill bookkeeping.
// One record shape for everyone keeps the weapon, bot and round code free of
// player-vs-bot special cases: controllers differ, actors do not.

import * as THREE from 'three';
import { G, pushFeed } from './state.js';
import { PALETTE, REWARDS } from './config.js';
import { newGun } from './weapons.js';
import { sfx } from './audio.js';

let nextId = 1;

export function makeActor(team, name, isPlayer) {
  const actor = {
    id: nextId++,
    team, name, isPlayer,
    alive: true,
    pos: new THREE.Vector3(),
    vel: new THREE.Vector3(),
    yaw: 0, pitch: 0,
    crouch: false, grounded: true, vy: 0,
    speed2d: 0,
    hp: 100,
    vest: false, helmet: false, armorHp: 0,
    money: 0, kills: 0, deaths: 0,
    guns: { primary: null, sidearm: newGun('p9') },
    slot: 'sidearm',
    nades: { frag: 0, flash: 0, smoke: 0 },
    fireT: 0, reloadT: 0, bloom: 0,
    wantFire: false, pressedFire: false,
    scoped: false, kickPitch: 0,
    blindT: 0, hurtT: 0, lastHurtYaw: 0,
    deathT: 0,
    mesh: null, gunMesh: null,
    brain: null,
  };
  return actor;
}

export function curGun(actor) {
  if (actor.slot === 'primary' || actor.slot === 'sidearm') return actor.guns[actor.slot];
  return null;
}

export function eyeHeight(actor) {
  return actor.crouch ? 1.14 : 1.6;
}

export function chestHeight(actor) {
  return actor.crouch ? 0.82 : 1.24;
}

// ---- the soldier mesh -----------------------------------------------------------
// Boxes only, built facing +Z (the yaw convention in physics): legs, torso in team
// colours, a darker vest, head with a visor slit, and a gun in the right hand whose
// barrel length follows the weapon kind. Death tips the whole group backwards.

const boxGeoCache = new Map();
function part(w, h, d, color, x, y, z, parent) {
  const key = `${w}|${h}|${d}`;
  let geo = boxGeoCache.get(key);
  if (!geo) { geo = new THREE.BoxGeometry(w, h, d); boxGeoCache.set(key, geo); }
  const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

export function buildActorMesh(actor, scene) {
  const g = new THREE.Group();
  const teamCol = actor.team === 'atk' ? PALETTE.atk : PALETTE.def;
  const darkCol = actor.team === 'atk' ? PALETTE.atkDark : PALETTE.defDark;
  part(0.17, 0.74, 0.2, PALETTE.charcoal, -0.13, 0.37, 0, g);   // legs
  part(0.17, 0.74, 0.2, PALETTE.charcoal, 0.13, 0.37, 0, g);
  part(0.54, 0.62, 0.3, teamCol, 0, 1.05, 0, g);                 // torso
  part(0.58, 0.4, 0.34, darkCol, 0, 1.12, 0, g);                 // vest
  part(0.15, 0.5, 0.15, teamCol, -0.36, 1.08, 0.04, g);          // arms
  part(0.15, 0.5, 0.15, teamCol, 0.36, 1.08, 0.04, g);
  part(0.3, 0.3, 0.3, 0xc9a184, 0, 1.56, 0, g);                  // head
  part(0.32, 0.12, 0.32, darkCol, 0, 1.72, 0, g);                // helmet cap
  const visor = part(0.24, 0.07, 0.02, 0x14181c, 0, 1.58, 0.16, g);
  visor.castShadow = false;
  const gun = new THREE.Group();
  part(0.09, 0.16, 0.52, 0x22252a, 0, 0, 0.18, gun);              // receiver
  part(0.05, 0.05, 0.42, 0x14161a, 0, 0.05, 0.55, gun);           // barrel
  part(0.07, 0.22, 0.09, 0x2c2f36, 0, -0.16, 0.12, gun);          // magazine
  gun.position.set(0.3, 1.22, 0.28);
  g.add(gun);
  actor.gunMesh = gun;
  actor.mesh = g;
  scene.add(g);
  return g;
}

// Sync a bot's mesh to its simulation state. The player has no mesh (first person).
export function poseActor(actor, dt) {
  const g = actor.mesh;
  if (!g) return;
  g.position.copy(actor.pos);
  g.rotation.set(0, actor.yaw, 0);
  if (!actor.alive) {
    actor.deathT = Math.min(1, actor.deathT + dt * 2.4);
    g.rotation.x = -actor.deathT * Math.PI * 0.48;
    g.position.y = actor.pos.y - actor.deathT * 0.2;
    return;
  }
  const targetScaleY = actor.crouch ? 0.8 : 1;
  g.scale.y += (targetScaleY - g.scale.y) * Math.min(1, dt * 14);
  // A simple run cycle: legs swing via the whole-body bob, gun bobs with speed.
  const bob = actor.speed2d > 0.4 && actor.grounded ? Math.sin(G.time * 11 + actor.id) * 0.035 : 0;
  g.position.y = actor.pos.y + Math.abs(bob);
  if (actor.gunMesh) {
    const def = curGun(actor)?.def;
    const len = def?.kind === 'sniper' ? 1.5 : def?.kind === 'smg' ? 0.75 : 1;
    actor.gunMesh.scale.set(1, 1, len);
    actor.gunMesh.visible = actor.slot === 'primary' || actor.slot === 'sidearm';
  }
}

// ---- damage ---------------------------------------------------------------------

export function damage(victim, amount, part, attacker, weaponName) {
  if (!victim.alive || amount <= 0) return;
  let applied = amount;
  if (victim.armorHp > 0) {
    const protectedPart = part !== 'head' || victim.helmet;
    if (protectedPart) {
      applied = amount * 0.55;
      victim.armorHp = Math.max(0, victim.armorHp - amount * 0.45);
    }
  }
  victim.hp -= applied;
  victim.hurtT = G.time;
  if (attacker) {
    victim.lastHurtYaw = Math.atan2(attacker.pos.x - victim.pos.x, attacker.pos.z - victim.pos.z);
    victim.lastHurtBy = attacker;
  }
  if (victim.isPlayer) {
    G.shake = Math.min(0.6, G.shake + 0.12);
    sfx.hurt();
  }
  if (attacker && attacker.isPlayer && victim.team !== attacker.team) {
    G.hitmark = G.time;
    sfx.hit();
  }
  if (victim.hp <= 0) kill(victim, attacker, weaponName, part === 'head');
}

export function kill(victim, attacker, weaponName, headshot) {
  victim.alive = false;
  victim.hp = 0;
  victim.deaths++;
  victim.deathT = 0;
  victim.wantFire = false;
  if (G.bomb.carrier === victim) {
    G.bomb.carrier = null;
    G.bomb.dropped = true;
    G.bomb.x = victim.pos.x;
    G.bomb.z = victim.pos.z;
  }
  if (attacker && attacker !== victim && attacker.team !== victim.team) {
    attacker.kills++;
    attacker.money = Math.min(16000, attacker.money + REWARDS.kill);
    if (attacker.isPlayer) sfx.kill();
  }
  const aName = attacker ? attacker.name : '—';
  pushFeed(`${aName} ▸ ${victim.name}  ·  ${weaponName}${headshot ? '  ·  HEADSHOT' : ''}`);
}
