// bots.js — the nine bot soldiers: navigation over a waypoint graph, perception
// (vision cones, line of sight, smoke, hearing), team plans per round, and a small
// state machine per bot: route, hold, engage, plant, defuse, rotate, fetch.
// Bots play by the player's rules — same movement physics, same spread model — their
// skill lives in reaction time, aim error and burst discipline, not in cheats.

import { G } from './state.js';
import { MATCH } from './config.js';
import { WAYPOINTS, SITES, SOLIDS, siteAt } from './map.js';
import { moveActor, sightBlocked } from './physics.js';
import { smokeBlocks, purchase, switchSlot } from './weapons.js';
import { curGun, eyeHeight, chestHeight } from './actors.js';

// ---- waypoint graph ---------------------------------------------------------------

const nodes = WAYPOINTS.map(([x, z]) => ({ x, z }));
const edges = nodes.map(() => []);
let graphBuilt = false;

function walkClear(x0, z0, x1, z1) {
  const d = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(1, Math.ceil(d / 0.6));
  for (let i = 0; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps;
    const z = z0 + ((z1 - z0) * i) / steps;
    for (const s of SOLIDS) {
      if (s.h > 0.55 && x > s.x0 - 0.45 && x < s.x1 + 0.45 && z > s.z0 - 0.45 && z < s.z1 + 0.45) return false;
    }
  }
  return true;
}

function buildGraph() {
  if (graphBuilt) return;
  graphBuilt = true;
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const d = Math.hypot(nodes[i].x - nodes[j].x, nodes[i].z - nodes[j].z);
      if (d < 30 && walkClear(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z)) {
        edges[i].push(j);
        edges[j].push(i);
      }
    }
  }
}

function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = (nodes[i].x - x) ** 2 + (nodes[i].z - z) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

// Breadth-first path as a list of plain {x, z} points, ending at the exact target.
export function findPath(sx, sz, tx, tz) {
  buildGraph();
  if (walkClear(sx, sz, tx, tz)) return [{ x: tx, z: tz }];
  const start = nearestNode(sx, sz);
  const goal = nearestNode(tx, tz);
  const prev = new Array(nodes.length).fill(-1);
  const seen = new Array(nodes.length).fill(false);
  const queue = [start];
  seen[start] = true;
  while (queue.length) {
    const cur = queue.shift();
    if (cur === goal) break;
    for (const nb of edges[cur]) {
      if (!seen[nb]) { seen[nb] = true; prev[nb] = cur; queue.push(nb); }
    }
  }
  const path = [];
  let cur = goal;
  while (cur !== -1) {
    path.push({ x: nodes[cur].x, z: nodes[cur].z });
    if (cur === start) break;
    cur = prev[cur];
  }
  path.reverse();
  path.push({ x: tx, z: tz });
  return path;
}

function pathVia(sx, sz, via, tx, tz) {
  if (!via) return findPath(sx, sz, tx, tz);
  const a = findPath(sx, sz, via.x, via.z);
  const b = findPath(via.x, via.z, tx, tz);
  return a.concat(b.slice(1));
}

// ---- brains -------------------------------------------------------------------------

export function makeBrain(actor) {
  return {
    skill: 0.82 + G.rand() * 0.36,
    state: 'hold',
    path: [], pathI: 0,
    goal: null, holdPos: null, faceYaw: actor.yaw, scanT: 0, baseYaw: actor.yaw,
    seen: null, seenSince: 0, reactT: 0,
    heard: null, lastNoiseAt: -1, alertUntil: 0,
    thinkT: G.rand() * 0.1,
    strafeDir: 1, strafeT: 0, burstT: 0, burstOn: false,
    actionT: 0, plantReady: false, defuseDone: false,
    delay: 0, crouchHold: false,
  };
}

function setPath(a, path) {
  a.brain.path = path;
  a.brain.pathI = 0;
}

function pointInSite(site, inset = 3) {
  const s = SITES[site];
  return {
    x: s.x0 + inset + G.rand() * (s.x1 - s.x0 - inset * 2),
    z: s.z0 + inset + G.rand() * (s.z1 - s.z0 - inset * 2),
  };
}

// Round plans, called by rounds.js at every round start. Attackers commit to the
// planned site with split routes (the carrier goes through the hall, entries down the
// rail lane, one lurker late through mid); Wardens hold both sites and mid.
export function assignPlans() {
  buildGraph();
  const site = G.plan.site;
  const other = site === 'A' ? 'B' : 'A';
  const atk = G.actors.filter((a) => a.team === 'atk' && a.brain);
  const def = G.actors.filter((a) => a.team === 'def' && a.brain);
  const laneVia = site === 'A' ? { x: 24, z: -24 } : { x: 24, z: 24 };
  const hallVia = { x: 5, z: 0 };

  let role = 0;
  for (const a of atk) {
    const b = a.brain;
    resetBrain(b, a);
    if (a === G.bomb.carrier) {
      b.state = 'plant';
      b.goal = pointInSite(site);
      setPath(a, pathVia(a.pos.x, a.pos.z, hallVia, b.goal.x, b.goal.z));
    } else if (role === 2) {
      b.state = 'route';
      b.delay = 5 + G.rand() * 5;
      b.goal = pointInSite(site);
      setPath(a, pathVia(a.pos.x, a.pos.z, { x: 24, z: 0 }, b.goal.x, b.goal.z));
      role++;
    } else {
      b.state = 'route';
      b.goal = pointInSite(site, 4.5);
      setPath(a, pathVia(a.pos.x, a.pos.z, role === 0 ? laneVia : hallVia, b.goal.x, b.goal.z));
      role++;
    }
  }

  const holds = {
    A: [{ x: 37, z: -15 }, { x: 45, z: -28 }, { x: 33, z: -21 }],
    B: [{ x: 37, z: 15 }, { x: 45, z: 18 }, { x: 33, z: 25 }],
  };
  const defPlan = [
    { site, i: 0 }, { site, i: 1 }, { site: other, i: 0 }, { site: other, i: 1 }, { site: 'M', i: 0 },
  ];
  def.forEach((a, idx) => {
    const b = a.brain;
    resetBrain(b, a);
    const plan = defPlan[idx % defPlan.length];
    const pos = plan.site === 'M' ? { x: 24, z: 0 } : holds[plan.site][plan.i];
    b.state = 'hold';
    b.holdPos = pos;
    b.goal = pos;
    b.baseYaw = pos.x > 30 || plan.site === 'M' ? -Math.PI / 2 : Math.PI;
    b.faceYaw = b.baseYaw;
    setPath(a, findPath(a.pos.x, a.pos.z, pos.x, pos.z));
  });
}

function resetBrain(b, a) {
  b.state = 'hold';
  b.seen = null;
  b.heard = null;
  b.actionT = 0;
  b.plantReady = false;
  b.defuseDone = false;
  b.delay = 0;
  b.path = [];
  b.pathI = 0;
  b.faceYaw = a.yaw;
  b.crouchHold = false;
}

// ---- buying ---------------------------------------------------------------------------

export function botBuy(a) {
  const tryBuy = (id) => purchase(a, id);
  if (!a.guns.primary) {
    if (a.money >= 4750 && G.rand() < 0.22) tryBuy('longshot');
    else if (a.money >= 3350) tryBuy('carbine');
    else if (a.money >= 1250) tryBuy('kestrel');
  }
  if (!a.vest && a.money >= 1000 && a.guns.primary) tryBuy('vesthelm');
  else if (!a.vest && a.money >= 650) tryBuy('vest');
  else if (a.vest && !a.helmet && a.money >= 1000) tryBuy('vesthelm');
  if (a.money >= 1000 && G.rand() < 0.6) tryBuy('frag');
  if (a.money >= 800 && G.rand() < 0.5) tryBuy('flash');
  if (a.money >= 900 && G.rand() < 0.4) tryBuy('smoke');
  if (a.guns.primary) switchSlot(a, 'primary');
}

// ---- perception -------------------------------------------------------------------------

function perceive(a, b) {
  const eyeY = a.pos.y + eyeHeight(a);
  let best = null, bestD = Infinity;
  for (const e of G.actors) {
    if (e === a || !e.alive || e.team === a.team) continue;
    const dx = e.pos.x - a.pos.x, dz = e.pos.z - a.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > 58) continue;
    const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
    const dot = d > 0.01 ? (fx * dx + fz * dz) / d : 1;
    if (dot < 0.42 && d > 4.5) continue; // outside the vision cone and not on top of us
    if (sightBlocked(a.pos.x, a.pos.z, e.pos.x, e.pos.z)) continue;
    if (smokeBlocks(a.pos.x, eyeY, a.pos.z, e.pos.x, e.pos.y + chestHeight(e), e.pos.z)) continue;
    if (d < bestD) { bestD = d; best = e; }
  }
  if (best) {
    if (!b.seen || b.seen.actor !== best) {
      b.seenSince = G.time;
      b.reactT = (0.26 + G.rand() * 0.16) / b.skill;
    }
    b.seen = { actor: best, at: G.time, x: best.pos.x, z: best.pos.z };
  }
  // Hearing: any noise inside its radius since the last check. Gunfire raises an
  // alert and turns a holding bot toward it; footsteps only turn the head.
  for (const n of G.noises) {
    if (n.at <= b.lastNoiseAt) continue;
    b.lastNoiseAt = n.at;
    const d = Math.hypot(n.x - a.pos.x, n.z - a.pos.z);
    if (d < n.radius) {
      b.heard = { x: n.x, z: n.z, at: n.at, kind: n.kind };
      if (n.kind === 'shot' || n.kind === 'boom') {
        b.alertUntil = G.time + 6;
        if (b.state === 'hold') b.faceYaw = Math.atan2(n.x - a.pos.x, n.z - a.pos.z);
      }
    }
  }
}

// ---- decisions ----------------------------------------------------------------------------

function decide(a, b) {
  if (a.blindT > 0.5) return;
  const fresh = b.seen && G.time - b.seen.at < 1.4 && b.seen.actor.alive;

  if (G.bomb.planted) {
    if (a.team === 'def' && b.state !== 'defuse' && !fresh) {
      // Rotate on the planted site; the closest Warden goes for the defuse.
      let closest = null, cd = Infinity;
      for (const d of G.actors) {
        if (d.team !== 'def' || !d.alive) continue;
        const dist = Math.hypot(d.pos.x - G.bomb.x, d.pos.z - G.bomb.z);
        if (dist < cd) { cd = dist; closest = d; }
      }
      if (closest === a) {
        b.state = 'defuse';
        b.goal = { x: G.bomb.x, z: G.bomb.z };
        setPath(a, findPath(a.pos.x, a.pos.z, G.bomb.x, G.bomb.z));
      } else if (b.state !== 'rotate') {
        b.state = 'rotate';
        b.goal = pointInSite(G.bomb.site, 5);
        setPath(a, findPath(a.pos.x, a.pos.z, b.goal.x, b.goal.z));
      }
      return;
    }
    if (a.team === 'atk' && b.state !== 'hold' && !fresh) {
      b.state = 'hold';
      b.holdPos = { x: a.pos.x, z: a.pos.z };
      b.baseYaw = Math.atan2(G.bomb.x - a.pos.x, G.bomb.z - a.pos.z) + Math.PI;
      return;
    }
  }

  if (fresh && b.state !== 'plant' && b.state !== 'defuse') {
    b.state = 'engage';
    return;
  }
  if (b.state === 'engage' && !fresh) {
    // Lost them: push the last seen point, then fall back to the plan.
    if (b.seen && Math.hypot(b.seen.x - a.pos.x, b.seen.z - a.pos.z) > 2) {
      b.state = 'route';
      b.goal = { x: b.seen.x, z: b.seen.z };
      setPath(a, findPath(a.pos.x, a.pos.z, b.seen.x, b.seen.z));
    } else {
      b.state = a.team === 'def' ? 'hold' : 'route';
      if (b.goal) setPath(a, findPath(a.pos.x, a.pos.z, b.goal.x, b.goal.z));
    }
    b.seen = null;
    return;
  }

  if (!G.bomb.planted && G.bomb.dropped && a.team === 'atk' && a !== G.bomb.carrier && b.state !== 'fetch') {
    // Someone should pick the charge up: the nearest attacker goes.
    let closest = null, cd = Infinity;
    for (const t of G.actors) {
      if (t.team !== 'atk' || !t.alive || t.isPlayer) continue;
      const dist = Math.hypot(t.pos.x - G.bomb.x, t.pos.z - G.bomb.z);
      if (dist < cd) { cd = dist; closest = t; }
    }
    if (closest === a) {
      b.state = 'fetch';
      b.goal = { x: G.bomb.x, z: G.bomb.z };
      setPath(a, findPath(a.pos.x, a.pos.z, G.bomb.x, G.bomb.z));
    }
  }

  if (a === G.bomb.carrier && b.state === 'fetch') {
    b.state = 'plant';
    b.goal = pointInSite(G.plan.site);
    setPath(a, findPath(a.pos.x, a.pos.z, b.goal.x, b.goal.z));
  }

  if (a === G.bomb.carrier && b.state !== 'plant' && !G.bomb.planted && !fresh) {
    b.state = 'plant';
    b.goal = pointInSite(G.plan.site);
    setPath(a, findPath(a.pos.x, a.pos.z, b.goal.x, b.goal.z));
  }
}

// ---- per-step behaviour ----------------------------------------------------------------------

function turnToward(a, targetYaw, rate, dt) {
  let diff = targetYaw - a.yaw;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const step = Math.max(-rate * dt, Math.min(rate * dt, diff));
  a.yaw += step;
  return Math.abs(diff) < 0.05;
}

function followPath(a, dt, speedMul = 1) {
  const b = a.brain;
  if (b.pathI >= b.path.length) return true;
  const node = b.path[b.pathI];
  const dx = node.x - a.pos.x, dz = node.z - a.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.9) { b.pathI++; return b.pathI >= b.path.length; }
  turnToward(a, Math.atan2(dx, dz), 9, dt);
  const gun = curGun(a);
  moveActor(a, dx / d, dz / d, dt, 4.8 * (gun ? gun.def.moveFactor : 1) * speedMul);
  return false;
}

function engageStep(a, b, dt) {
  const t = b.seen.actor;
  const dx = t.pos.x - a.pos.x, dz = t.pos.z - a.pos.z;
  const dist = Math.hypot(dx, dz);
  const aimYaw = Math.atan2(dx, dz);
  turnToward(a, aimYaw + Math.sin(G.time * 1.9 + a.id * 3.1) * 0.03 / b.skill, 7.5, dt);
  const eyeY = a.pos.y + eyeHeight(a);
  const targetY = t.pos.y + (G.rand() < 0.3 ? 1.5 : chestHeight(t));
  const wantPitch = Math.atan2(targetY - eyeY, Math.max(1, dist));
  a.pitch += (wantPitch - a.pitch) * Math.min(1, dt * 9);

  // Strafe in bursts, hold still to shoot: the accuracy model rewards the pause.
  b.strafeT -= dt;
  if (b.strafeT <= 0) {
    b.strafeT = 0.55 + G.rand() * 0.8;
    b.strafeDir = G.rand() < 0.5 ? -1 : 1;
    b.crouchHold = G.rand() < 0.3;
  }
  const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw);
  let wx = -fz * b.strafeDir, wz = fx * b.strafeDir;
  if (dist < 7) { wx += -fx * 0.6; wz += -fz * 0.6; }
  if (dist > 30) { wx += fx * 0.8; wz += fz * 0.8; }
  const wl = Math.hypot(wx, wz) || 1;
  a.crouch = b.crouchHold;
  moveActor(a, wx / wl, wz / wl, dt, 4.3);

  // Fire control: only with a clear line, after the reaction delay, in bursts.
  const clear = !sightBlocked(a.pos.x, a.pos.z, t.pos.x, t.pos.z)
    && !smokeBlocks(a.pos.x, eyeY, a.pos.z, t.pos.x, t.pos.y + chestHeight(t), t.pos.z);
  const reacted = G.time - b.seenSince > b.reactT;
  b.burstT -= dt;
  if (b.burstT <= 0) {
    b.burstOn = !b.burstOn && clear && reacted;
    b.burstT = b.burstOn ? 0.3 + G.rand() * 0.25 : 0.3 + G.rand() * 0.45;
    if (b.burstOn) a.pressedFire = true;
  }
  const gun = curGun(a);
  a.wantFire = b.burstOn && clear && reacted && !!gun && gun.def.auto;
  if (gun && gun.mag === 0) a.wantFire = false;
}

function stepBot(a, dt) {
  const b = a.brain;
  a.wantFire = false;
  a.pressedFire = false;
  if (a.blindT > 0) a.blindT -= dt;

  b.thinkT -= dt;
  if (b.thinkT <= 0) {
    b.thinkT = 0.1;
    perceive(a, b);
    decide(a, b);
  }

  if (a.blindT > 0.4) {
    a.crouch = true;
    moveActor(a, 0, 0, dt, 4.8);
    return;
  }

  switch (b.state) {
    case 'engage':
      if (b.seen && b.seen.actor.alive) engageStep(a, b, dt);
      else b.state = 'route';
      break;
    case 'plant': {
      const inSite = siteAt(a.pos.x, a.pos.z) === G.plan.site;
      if (inSite && a === G.bomb.carrier) {
        a.crouch = true;
        moveActor(a, 0, 0, dt, 4.8);
        b.actionT += dt;
        if (b.actionT >= MATCH.plantSeconds) b.plantReady = true;
      } else {
        a.crouch = false;
        followPath(a, dt);
      }
      break;
    }
    case 'defuse': {
      const d = Math.hypot(G.bomb.x - a.pos.x, G.bomb.z - a.pos.z);
      if (d > 1.5) followPath(a, dt);
      else {
        a.crouch = true;
        moveActor(a, 0, 0, dt, 4.8);
        turnToward(a, Math.atan2(G.bomb.x - a.pos.x, G.bomb.z - a.pos.z), 6, dt);
        b.actionT += dt;
        if (b.actionT >= MATCH.defuseSeconds) b.defuseDone = true;
      }
      break;
    }
    case 'hold': {
      if (b.holdPos && Math.hypot(b.holdPos.x - a.pos.x, b.holdPos.z - a.pos.z) > 1.2) {
        followPath(a, dt);
      } else {
        moveActor(a, 0, 0, dt, 4.8);
        b.scanT -= dt;
        if (b.scanT <= 0) {
          b.scanT = 1.8 + G.rand() * 1.8;
          b.faceYaw = b.baseYaw + (G.rand() - 0.5) * 1.5;
          b.crouchHold = G.rand() < 0.22;
        }
        a.crouch = b.crouchHold;
        turnToward(a, b.faceYaw, 2.2, dt);
      }
      break;
    }
    default: { // route, rotate, fetch
      if (b.delay > 0) {
        b.delay -= dt;
        moveActor(a, 0, 0, dt, 4.8);
        break;
      }
      a.crouch = false;
      const arrived = followPath(a, dt, b.state === 'rotate' ? 1.0 : 0.97);
      if (arrived) {
        if (b.state === 'rotate') {
          b.state = 'hold';
          b.holdPos = { x: a.pos.x, z: a.pos.z };
          b.baseYaw = a.yaw;
        } else if (b.state === 'route') {
          b.state = 'hold';
          b.holdPos = { x: a.pos.x, z: a.pos.z };
          b.baseYaw = a.team === 'atk' ? Math.PI / 2 : -Math.PI / 2;
        }
      }
    }
  }
}

export function updateBots(dt) {
  if (G.phase !== 'live' && G.phase !== 'planted') return;
  for (const a of G.actors) {
    if (a.isPlayer || !a.alive || !a.brain) continue;
    stepBot(a, dt);
  }
}
