// hud.js — every DOM element of the HUD: top bar (score, timer, round), a compass
// strip with the two sites, an objective chip that always says what this round
// wants, health and armour, money and ammunition, a crosshair that breathes with
// the spread model, the kill feed, banners, the buy menu, the Tab scoreboard and
// the full-screen effects (damage vignette, flash blindness, sniper scope).
// updateHud runs once per rendered frame and only touches the DOM when a value
// actually changed.

import { G } from './state.js';
import { MATCH, TEAMS, WEAPONS, GRENADES } from './config.js';
import { curGun } from './actors.js';
import { siteAt, SITES } from './map.js';
import { playerBuy } from './rounds.js';
import { down } from './input.js';

const el = {};
let buyOpen = false;
let feedSig = '';
let radioSig = '';
let rosterSig = '';
let buySig = '';
let boardSig = '';
let compassSig = '';
let objectiveSig = '';

const BUY_CATALOG = [
  { id: 'kestrel', key: '1' }, { id: 'carbine', key: '2' }, { id: 'longshot', key: '3' },
  { id: 'p9x', key: '4' }, { id: 'vest', key: '5' }, { id: 'vesthelm', key: '6' },
  { id: 'frag', key: '7' }, { id: 'flash', key: '8' }, { id: 'smoke', key: '9' },
];

function itemInfo(id) {
  if (WEAPONS[id]) return { name: WEAPONS[id].name, price: WEAPONS[id].price };
  if (GRENADES[id]) return { name: GRENADES[id].name, price: GRENADES[id].price };
  if (id === 'vest') return { name: 'Flak Vest', price: 650 };
  return { name: 'Vest + Helm', price: 1000 };
}

function owned(id) {
  const p = G.player;
  if (WEAPONS[id]) return p.guns[WEAPONS[id].slot]?.def.id === id;
  if (GRENADES[id]) return p.nades[id] > 0;
  if (id === 'vest') return p.vest;
  return p.helmet;
}

export function setBuyOpen(v) {
  buyOpen = v && G.phase === 'buy';
  el.buy.hidden = !buyOpen;
}

export function isBuyOpen() {
  return buyOpen;
}

export function initHud() {
  for (const id of ['timer', 'score-atk', 'score-def', 'round-label', 'hp-fill', 'hp-num', 'armor-num',
    'ammo-mag', 'ammo-res', 'wep-name', 'money', 'crosshair', 'hitmarker', 'feed', 'radio', 'radio-rows',
    'roster', 'roster-atk', 'roster-def', 'banner',
    'banner-title', 'banner-sub', 'buy', 'buy-grid', 'buy-money', 'board', 'board-body',
    'vignette', 'flashfx', 'scopefx', 'interact', 'interact-label', 'interact-fill',
    'bombind', 'bombind-fill', 'bombind-label', 'carrier', 'compass-marks',
    'objective']) {
    el[id] = document.getElementById(id);
  }
  el['buy-grid'].innerHTML = '';
  for (const item of BUY_CATALOG) {
    const info = itemInfo(item.id);
    const btn = document.createElement('button');
    btn.className = 'buy-item';
    btn.dataset.item = item.id;
    btn.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${info.name}</span><span class="buy-price">$${info.price}</span><span class="buy-state"></span>`;
    btn.addEventListener('click', () => { playerBuy(item.id); buySig = ''; });
    el['buy-grid'].appendChild(btn);
  }
}

function fmtTime(s) {
  s = Math.max(0, Math.ceil(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function refreshBuy() {
  const p = G.player;
  const sig = `${p.money}|${p.guns.primary?.def.id}|${p.guns.sidearm?.def.id}|${p.vest}|${p.helmet}|${p.nades.frag}${p.nades.flash}${p.nades.smoke}`;
  if (sig === buySig) return;
  buySig = sig;
  el['buy-money'].textContent = `$${p.money}`;
  for (const btn of el['buy-grid'].children) {
    const id = btn.dataset.item;
    const info = itemInfo(id);
    const has = owned(id);
    btn.disabled = has || p.money < info.price;
    btn.querySelector('.buy-state').textContent = has ? 'OWNED' : p.money < info.price ? '—' : 'BUY';
  }
}

function refreshBoard() {
  const rows = [...G.actors].sort((a, b) => b.kills - a.kills);
  const sig = rows.map((a) => `${a.name}${a.kills}/${a.deaths}/${a.money}/${a.alive}`).join('|') + G.score.atk + ':' + G.score.def;
  if (sig === boardSig) return;
  boardSig = sig;
  el['board-body'].innerHTML = rows.map((a) => `
    <tr class="${a.alive ? '' : 'dead'} ${a.isPlayer ? 'me' : ''}">
      <td class="t-${a.team}">${a.isPlayer ? 'You' : a.name}</td>
      <td>${a.team === 'atk' ? 'EMBERLINE' : 'WARDENS'}</td>
      <td>${a.kills}</td><td>${a.deaths}</td><td>$${a.money}</td>
    </tr>`).join('');
}

// Number-key purchases while the menu is open; called by main.js, which owns the
// per-frame press queue (the sim steps consume `pressed` before frames render).
export function buyDigit(n) {
  const item = BUY_CATALOG.find((i) => i.key === String(n));
  if (item && buyOpen) { playerBuy(item.id); buySig = ''; }
}

export function toggleBuy() {
  setBuyOpen(!buyOpen);
}

// ---- compass + objective --------------------------------------------------------

// The yaw that faces each cardinal: forward is (sin yaw, cos yaw), so north (-z)
// is yaw PI, east (+x) PI/2, south (+z) 0, west (-x) -PI/2.
const CARDINALS = [
  ['N', Math.PI], ['NE', Math.PI * 0.75], ['E', Math.PI / 2], ['SE', Math.PI / 4],
  ['S', 0], ['SW', -Math.PI / 4], ['W', -Math.PI / 2], ['NW', -Math.PI * 0.75],
];
const COMPASS_HALF = 1.05; // radians either side of facing that the strip shows

function wrapPi(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function compassMark(left, cls, text) {
  return `<span class="${cls}" style="left:${left.toFixed(1)}%">${text}</span>`;
}

function refreshCompass() {
  const p = G.player;
  const yaw = Math.round(p.yaw * 50) / 50;
  const px = Math.round(p.pos.x * 2) / 2;
  const pz = Math.round(p.pos.z * 2) / 2;
  const sig = `${yaw}|${px}|${pz}|${G.phase}`;
  if (sig === compassSig) return;
  compassSig = sig;
  const marks = [];
  const siteMarks = [];
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const rel = wrapPi(Math.atan2(s.cx - p.pos.x, s.cz - p.pos.z) - p.yaw);
    if (Math.abs(rel) > COMPASS_HALF) continue;
    const left = 50 + (rel / COMPASS_HALF) * 50;
    const dist = Math.round(Math.hypot(s.cx - p.pos.x, s.cz - p.pos.z));
    siteMarks.push({ left, html: compassMark(left, `site site-${key.toLowerCase()}`, `${key} ${dist}m`) });
  }
  for (const [label, bearing] of CARDINALS) {
    const rel = wrapPi(bearing - p.yaw);
    if (Math.abs(rel) > COMPASS_HALF) continue;
    const left = 50 + (rel / COMPASS_HALF) * 50;
    // A site marker wins its slot: a cardinal tick printed over it reads as noise.
    // The marker text ("A 15m") is wide, so the exclusion covers its half-width.
    if (siteMarks.some((m) => Math.abs(m.left - left) < 9)) continue;
    marks.push(compassMark(left, 'tick', label));
  }
  marks.push(...siteMarks.map((m) => m.html));
  el['compass-marks'].innerHTML = marks.join('');
}

function objectiveText() {
  if (G.phase === 'matchover') return '';
  if (G.phase === 'buy') {
    const site = G.plan?.site;
    return site ? `BUY PHASE — PLAN: HIT SITE ${site} · ${SITES[site].name}` : 'BUY PHASE — GEAR UP';
  }
  if (G.bomb.planted) return `CHARGE PLANTED — HOLD SITE ${G.bomb.site} · ${SITES[G.bomb.site].name}`;
  if (G.phase === 'live' || G.phase === 'planted') {
    if (G.bomb.carrier === G.player) {
      return siteAt(G.player.pos.x, G.player.pos.z)
        ? 'YOU CARRY THE CHARGE — HOLD E TO PLANT'
        : 'YOU CARRY THE CHARGE — PLANT AT SITE A OR B';
    }
    if (G.bomb.carrier) {
      const site = G.plan?.site;
      return `${G.bomb.carrier.name.toUpperCase()} CARRIES THE CHARGE — PUSH SITE ${site || '?'}`;
    }
    return 'RECOVER THE CHARGE — THEN PLANT AT A OR B';
  }
  return '';
}

function refreshObjective() {
  const text = objectiveText();
  if (text === objectiveSig) return;
  objectiveSig = text;
  el.objective.hidden = !text;
  el.objective.textContent = text;
}

// Radio panel: the last three team callouts, on their own — never mixed into
// the kill feed. A silent panel reads as "no team play", so it stays visible
// with a header even when no callout is live.
function refreshRadio() {
  const radio = G.radio.filter((r) => r.until > G.time);
  const radioSigNow = radio.map((r) => r.text).join('|');
  if (radioSigNow !== radioSig) {
    radioSig = radioSigNow;
    el['radio-rows'].innerHTML = radio.length
      ? radio.map((r) => `<div>▸ ${r.text}</div>`).join('')
      : '<div class="quiet">— radio quiet —</div>';
  }
}

// Team roster strip: both squads with alive pips, so the 5v5 reads at a
// glance without opening the scoreboard. Dead names are struck through.
function refreshRoster() {
  const rosterSigNow = G.actors.map((a) => `${a.name}${a.alive ? 1 : 0}`).join('|');
  if (rosterSigNow !== rosterSig) {
    rosterSig = rosterSigNow;
    for (const team of ['atk', 'def']) {
      const mates = G.actors.filter((a) => a.team === team);
      const row = mates.map((a) => `<span class="${a.alive ? '' : 'dead'}">${a.isPlayer ? 'You' : a.name} ${a.alive ? '●' : '○'}</span>`).join(' ');
      el[team === 'atk' ? 'roster-atk' : 'roster-def'].innerHTML =
        `<b class="t-${team}">${team === 'atk' ? 'EMBERLINE' : 'WARDENS'} ${mates.filter((a) => a.alive).length}</b> ${row}`;
    }
  }
}

export function updateHud() {
  const p = G.player;
  if (!p) return;

  if (G.phase !== 'buy' && buyOpen) setBuyOpen(false);
  if (buyOpen) refreshBuy();
  el.board.hidden = !(down.has('Tab') || G.boardForced);
  el.board.classList.toggle('forced', G.boardForced);
  // The roster is redundant while the full scoreboard is up — and at 720p the
  // board's bottom rows would sit on top of it. Hide the strip then.
  el.roster.hidden = !el.board.hidden;
  if (!el.board.hidden) refreshBoard();
  refreshCompass();
  refreshObjective();
  refreshRadio();
  refreshRoster();

  el['score-atk'].textContent = G.score.atk;
  el['score-def'].textContent = G.score.def;
  el['round-label'].textContent = `ROUND ${Math.max(1, G.round)} / ${MATCH.maxRounds}`;
  el.timer.textContent = G.phase === 'buy' ? `BUY ${fmtTime(G.phaseT)}` : fmtTime(G.phaseT);
  el.timer.classList.toggle('danger', G.phase === 'planted' || (G.phase === 'live' && G.phaseT < 11));

  el['hp-fill'].style.width = `${Math.max(0, p.hp)}%`;
  el['hp-num'].textContent = Math.max(0, Math.ceil(p.hp));
  el['armor-num'].textContent = p.vest ? Math.ceil(p.armorHp) : 0;

  const gun = curGun(p);
  if (gun) {
    el['ammo-mag'].textContent = p.reloadT > 0 ? '--' : gun.mag;
    el['ammo-res'].textContent = `/ ${gun.reserve}`;
    el['wep-name'].textContent = gun.def.name.toUpperCase();
    // Low-ammo warning: mag at/below 25% (incl. empty) turns red; while
    // reloading the mag shows '--', so warn on the reserve number instead.
    const low = gun.def.mag > 0 && gun.mag <= gun.def.mag * 0.25;
    el['ammo-mag'].style.color = low && p.reloadT <= 0 ? '#ff5a3c' : '';
    el['ammo-res'].style.color = low && p.reloadT > 0 ? '#ff5a3c' : '';
  } else {
    el['ammo-mag'].textContent = '1';
    el['ammo-res'].textContent = '';
    el['ammo-mag'].style.color = '';
    el['ammo-res'].style.color = '';
    el['wep-name'].textContent = p.slot.toUpperCase() + ' — CLICK TO THROW';
  }
  el.money.textContent = `$${p.money}`;

  // Crosshair gap follows the same spread the bullets use.
  let gap = 7;
  if (gun) {
    const speedFrac = Math.min(1, p.speed2d / 4.6);
    let spread = gun.def.spread + p.bloom + gun.def.moveSpread * speedFrac * speedFrac;
    if (p.crouch) spread *= gun.def.crouchFactor;
    gap = 5 + spread * 620;
  }
  el.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
  el.crosshair.style.opacity = p.alive && !p.scoped ? 1 : 0;
  el.hitmarker.style.opacity = G.time - G.hitmark < 0.13 ? 1 : 0;

  // Kill feed.
  const feed = G.feed.filter((f) => f.until > G.time);
  const sig = feed.map((f) => f.text).join('|');
  if (sig !== feedSig) {
    feedSig = sig;
    el.feed.innerHTML = feed.map((f) => `<div>${f.text}</div>`).join('');
  }

  // Banner.
  if (G.banner && G.banner.until > G.time) {
    el.banner.hidden = false;
    el['banner-title'].textContent = G.banner.title;
    el['banner-sub'].textContent = G.banner.sub;
  } else el.banner.hidden = true;

  // Who holds the charge (only while the round is actually being played).
  const roundLive = G.phase === 'buy' || G.phase === 'live';
  if (roundLive && G.bomb.carrier === p && !G.bomb.planted) {
    el.carrier.hidden = false;
    el.carrier.textContent = siteAt(p.pos.x, p.pos.z)
      ? 'IN THE SITE — HOLD E TO PLANT THE CHARGE'
      : 'YOU HAVE THE CHARGE — PLANT AT SITE A OR B';
  } else if (roundLive && G.bomb.carrier && !G.bomb.planted) {
    el.carrier.hidden = false;
    el.carrier.textContent = `${G.bomb.carrier.name} HAS THE CHARGE`;
  } else el.carrier.hidden = true;

  // Planting progress (player only; bots show through the bomb indicator).
  if (G.bomb.carrier === p && G.bomb.plantT > 0) {
    el.interact.hidden = false;
    el['interact-label'].textContent = 'PLANTING THE CHARGE';
    el['interact-fill'].style.width = `${(G.bomb.plantT / MATCH.plantSeconds) * 100}%`;
  } else el.interact.hidden = true;

  // Planted bomb indicator with the fuse as a draining bar, seconds included.
  if (G.bomb.planted && (G.phase === 'planted')) {
    el.bombind.hidden = false;
    el['bombind-label'].textContent = `CHARGE PLANTED — SITE ${G.bomb.site} · ${fmtTime(G.bomb.fuse)}`;
    el['bombind-fill'].style.width = `${(G.bomb.fuse / MATCH.bombSeconds) * 100}%`;
  } else el.bombind.hidden = true;

  // Full-screen effects.
  const hurtRecent = G.time - (p.hurtT || -9) < 0.4;
  el.vignette.style.opacity = !p.alive ? 0.75 : hurtRecent ? 0.6 : p.hp < 30 ? 0.32 + Math.sin(G.time * 5) * 0.08 : 0;
  el.flashfx.style.opacity = Math.min(1, G.playerFlash / 1.6);
  el.scopefx.style.opacity = p.scoped ? 1 : 0;
}
