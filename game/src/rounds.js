// rounds.js — the match director: creates the ten actors, runs the phase machine
// (buy -> live -> planted -> over), the bomb (carry, drop, plant, defuse, detonate),
// round-end economy with a loss-streak bonus, and the win checks. It owns no input
// and no rendering; it reads G and writes G, and other modules react.

import * as THREE from 'three';
import { G, resetMatch, setBanner, aliveActors } from './state.js';
import { MATCH, REWARDS, TEAMS, ALLY_NAMES, ENEMY_NAMES } from './config.js';
import { SPAWNS, siteAt } from './map.js';
import { makeActor, buildActorMesh } from './actors.js';
import { makeBrain, assignPlans, botBuy } from './bots.js';
import { newGun, purchase } from './weapons.js';
import { playerInput } from './player.js';
import * as fx from './fx.js';
import { sfx } from './audio.js';

let sceneRef = null;
let bombMesh = null;
let bombLightMat = null;
let lastSite = null;
let siteStreak = 0;

export function initMatch(scene, seed) {
  if (sceneRef && G.actors.length) {
    for (const a of G.actors) if (a.mesh) sceneRef.remove(a.mesh);
  }
  sceneRef = scene;
  resetMatch(seed);
  G.actors = [];
  const player = makeActor('atk', 'You', true);
  player.money = MATCH.startMoney;
  G.player = player;
  G.actors.push(player);
  for (const name of ALLY_NAMES) {
    const a = makeActor('atk', name, false);
    a.money = MATCH.startMoney;
    a.brain = makeBrain(a);
    buildActorMesh(a, scene);
    G.actors.push(a);
  }
  for (const name of ENEMY_NAMES) {
    const a = makeActor('def', name, false);
    a.money = MATCH.startMoney;
    a.brain = makeBrain(a);
    buildActorMesh(a, scene);
    G.actors.push(a);
  }
  if (!bombMesh) {
    bombMesh = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.18, 0.3),
      new THREE.MeshLambertMaterial({ color: 0x2c2f36 }),
    );
    body.position.y = 0.09;
    bombMesh.add(body);
    bombLightMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.1), bombLightMat);
    tip.position.y = 0.21;
    bombMesh.add(tip);
    bombMesh.visible = false;
    scene.add(bombMesh);
  }
  lastSite = null;
  siteStreak = 0;
  G.round = 0;
  startRound();
}

function startRound() {
  G.round++;
  let ai = 0, di = 0;
  for (const a of G.actors) {
    const sp = a.team === 'atk' ? SPAWNS.atk[ai++] : SPAWNS.def[di++];
    a.pos.set(sp.x, 0, sp.z);
    a.vel.set(0, 0, 0);
    a.yaw = sp.a;
    a.pitch = 0;
    a.hp = 100;
    a.alive = true;
    a.deathT = 0;
    a.crouch = false;
    a.blindT = 0;
    a.bloom = 0;
    a.reloadT = 0;
    a.fireT = 0;
    a.scoped = false;
    a.wantFire = false;
    if (a.mesh) a.mesh.rotation.x = 0;
    if (a.diedLastRound) {
      // Death costs the loadout, as it should: back to the P9 and no gear.
      a.guns.primary = null;
      a.guns.sidearm = newGun('p9');
      a.slot = 'sidearm';
      a.nades.frag = 0; a.nades.flash = 0; a.nades.smoke = 0;
      a.vest = false; a.helmet = false; a.armorHp = 0;
      a.diedLastRound = false;
    } else {
      // Survivors keep their guns; magazines and armour are restocked.
      for (const slot of ['primary', 'sidearm']) {
        const gun = a.guns[slot];
        if (gun) { gun.mag = gun.def.mag; gun.reserve = gun.def.reserve; }
      }
      if (a.vest) a.armorHp = 100;
    }
  }

  // The charge goes to a random Emberline hand, a bot's more often than the player's.
  // v5: in headless runs (?autostart — the CI/smoke-test mode, where no aiming is
  // possible) it always goes to a bot, so the simulation exercises the bot plant
  // path every round instead of stalling whenever the idle player holds the
  // charge. Normal play keeps the 62/38 split below.
  const atkTeam = G.actors.filter((a) => a.team === 'atk');
  let carrier;
  if (G.headless) {
    const bots = atkTeam.filter((a) => !a.isPlayer);
    carrier = bots[Math.floor(G.rand() * bots.length)];
  } else if (G.rand() < 0.62) {
    const bots = atkTeam.filter((a) => !a.isPlayer);
    carrier = bots[Math.floor(G.rand() * bots.length)];
  } else {
    carrier = atkTeam[Math.floor(G.rand() * atkTeam.length)];
  }
  G.bomb.carrier = carrier;
  G.bomb.planted = false;
  G.bomb.dropped = false;
  G.bomb.site = null;
  G.bomb.plantT = 0;
  G.bomb.fuse = 0;

  // Pick the target site, never the same one three rounds running.
  let site = G.rand() < 0.5 ? 'A' : 'B';
  if (site === lastSite) {
    siteStreak++;
    if (siteStreak >= 2) { site = site === 'A' ? 'B' : 'A'; siteStreak = 0; }
  } else siteStreak = 0;
  lastSite = site;
  G.plan = { site };

  assignPlans();
  for (const a of G.actors) if (a.brain) botBuy(a);

  G.phase = 'buy';
  G.phaseT = MATCH.buySeconds;
  setBanner(`ROUND ${G.round}`, 'Buy phase — B for the buy menu', 3.2);
  showBombProp();
}

// The charge prop: on the carrier's back (hidden — the HUD says who carries), on the
// ground where it dropped, or planted with its light blinking faster as the fuse runs.
export function showBombProp() {
  if (!bombMesh) return;
  if (G.bomb.planted || G.bomb.dropped) {
    bombMesh.position.set(G.bomb.x, 0, G.bomb.z);
    bombMesh.visible = true;
  } else {
    bombMesh.visible = false;
  }
}

export function playerBuy(id) {
  if (G.phase !== 'buy') return false;
  const ok = purchase(G.player, id);
  if (ok) sfx.buy(); else sfx.denied();
  return ok;
}

function doPlant(planter, site) {
  G.bomb.planted = true;
  G.bomb.site = site;
  G.bomb.x = planter.pos.x;
  G.bomb.z = planter.pos.z;
  G.bomb.carrier = null;
  G.bomb.plantT = 0;
  G.bomb.fuse = MATCH.bombSeconds;
  G.bomb.beep = 0;
  planter.money = Math.min(MATCH.maxMoney, planter.money + REWARDS.plant);
  G.phase = 'planted';
  G.phaseT = MATCH.bombSeconds;
  setBanner('CHARGE PLANTED', `Site ${site} — Wardens are rotating in`, 3);
  sfx.plantDone();
  showBombProp();
}

function handlePlant(dt) {
  const c = G.bomb.carrier;
  if (!c || !c.alive || G.bomb.planted) { G.bomb.plantT = 0; return; }
  const site = siteAt(c.pos.x, c.pos.z);
  if (!site) { G.bomb.plantT = Math.max(0, G.bomb.plantT - dt * 2); return; }
  if (c.isPlayer) {
    if (playerInput.interact && c.speed2d < 0.5) {
      G.bomb.plantT += dt;
      if (G.bomb.plantT >= MATCH.plantSeconds) doPlant(c, site);
    } else {
      G.bomb.plantT = Math.max(0, G.bomb.plantT - dt * 2);
    }
  } else if (c.brain && c.brain.plantReady) {
    doPlant(c, site);
  }
}

function endRound(winner, reason) {
  G.phase = 'over';
  G.phaseT = MATCH.endSeconds;
  G.winner = winner;
  G.winReason = reason;
  G.score[winner]++;
  const loser = winner === 'atk' ? 'def' : 'atk';
  G.lossStreak[loser]++;
  G.lossStreak[winner] = 0;
  const lossBonus = Math.min(REWARDS.lossCap, REWARDS.lossBase + REWARDS.lossStep * (G.lossStreak[loser] - 1));
  for (const a of G.actors) {
    a.money = Math.min(MATCH.maxMoney, a.money + (a.team === winner ? REWARDS.win : lossBonus));
    a.diedLastRound = !a.alive;
    a.wantFire = false;
  }
  const reasonText = {
    elimination: 'Elimination',
    detonation: 'The charge detonated',
    defuse: 'The charge was defused',
    time: 'Time expired',
  }[reason];
  setBanner(`${TEAMS[winner].name} TAKE THE ROUND`, reasonText, MATCH.endSeconds - 0.4);
  if (winner === G.player.team) sfx.roundWin(); else sfx.roundLose();
  if (bombMesh) bombMesh.visible = G.bomb.planted && reason !== 'detonation';
}

function endMatch() {
  G.phase = 'matchover';
  const winner = G.score.atk > G.score.def ? 'atk' : 'def';
  G.winner = winner;
  setBanner(
    winner === 'atk' ? 'EMBERLINE WIN THE MATCH' : 'WARDENS WIN THE MATCH',
    `Final score ${G.score.atk} — ${G.score.def}. Click to play again.`,
    9999,
  );
}

export function update(dt) {
  // Bomb prop light: blink, faster as the fuse burns down.
  if (bombMesh && bombMesh.visible && G.bomb.planted) {
    const rate = G.bomb.fuse < 10 ? 6 : 2.2;
    bombLightMat.color.setHex(Math.sin(G.time * rate * Math.PI) > 0 ? 0xff2a1a : 0x57120c);
  }

  G.phaseT -= dt;
  switch (G.phase) {
    case 'buy':
      if (G.phaseT <= 0) {
        G.phase = 'live';
        G.phaseT = MATCH.roundSeconds;
        setBanner(`ROUND ${G.round}`, 'Eliminate the Wardens — or plant the charge', 2.4);
      }
      break;

    case 'live': {
      if (G.bomb.dropped) {
        for (const a of G.actors) {
          if (a.team !== 'atk' || !a.alive) continue;
          if (Math.hypot(a.pos.x - G.bomb.x, a.pos.z - G.bomb.z) < 1.3) {
            G.bomb.carrier = a;
            G.bomb.dropped = false;
            showBombProp();
            break;
          }
        }
      }
      handlePlant(dt);
      if (G.phase !== 'live') break; // planting flipped the phase
      if (aliveActors('def') === 0) endRound('atk', 'elimination');
      else if (aliveActors('atk') === 0) endRound('def', 'elimination');
      else if (G.phaseT <= 0) endRound('def', 'time');
      break;
    }

    case 'planted': {
      G.bomb.fuse -= dt;
      G.phaseT = G.bomb.fuse;
      G.bomb.beep -= dt;
      if (G.bomb.beep <= 0) {
        sfx.plantBeep(G.bomb.fuse < 5.2);
        G.bomb.beep = G.bomb.fuse < 10 ? 0.5 : 1;
      }
      let defused = false;
      for (const a of G.actors) {
        if (a.team === 'def' && a.brain && a.brain.defuseDone) {
          a.money = Math.min(MATCH.maxMoney, a.money + REWARDS.defuse);
          defused = true;
        }
      }
      if (defused) endRound('def', 'defuse');
      else if (aliveActors('def') === 0) endRound('atk', 'elimination');
      else if (G.bomb.fuse <= 0) {
        fx.explosionFx(G.bomb.x, 0.4, G.bomb.z);
        sfx.explosion();
        G.shake = 0.9;
        endRound('atk', 'detonation');
      }
      break;
    }

    case 'over':
      if (G.phaseT <= 0) {
        if (G.score.atk >= MATCH.winRounds || G.score.def >= MATCH.winRounds || G.round >= MATCH.maxRounds) endMatch();
        else startRound();
      }
      break;

    default:
      break;
  }
}
