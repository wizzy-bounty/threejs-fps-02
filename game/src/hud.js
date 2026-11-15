// hud.js — every DOM element of the HUD: top bar (score, timer, round), health and
// armour, money and ammunition, a crosshair that breathes with the spread model, the
// kill feed, banners, the buy menu, the Tab scoreboard and the full-screen effects
// (damage vignette, flash blindness, sniper scope). updateHud runs once per rendered
// frame and only touches the DOM when a value actually changed.

import { G } from './state.js';
import { MATCH, TEAMS, WEAPONS, GRENADES } from './config.js';
import { curGun } from './actors.js';
import { siteAt } from './map.js';
import { playerBuy } from './rounds.js';
import { down } from './input.js';

const el = {};
let buyOpen = false;
let feedSig = '';
let buySig = '';
let boardSig = '';

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
    'ammo-mag', 'ammo-res', 'wep-name', 'money', 'crosshair', 'hitmarker', 'feed', 'banner',
    'banner-title', 'banner-sub', 'buy', 'buy-grid', 'buy-money', 'board', 'board-body',
    'vignette', 'flashfx', 'scopefx', 'interact', 'interact-label', 'interact-fill',
    'bombind', 'bombind-fill', 'bombind-label', 'carrier']) {
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

export function updateHud() {
  const p = G.player;
  if (!p) return;

  if (G.phase !== 'buy' && buyOpen) setBuyOpen(false);
  if (buyOpen) refreshBuy();
  el.board.hidden = !down.has('Tab');
  if (!el.board.hidden) refreshBoard();

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

  // Planted bomb indicator with the fuse as a draining bar.
  if (G.bomb.planted && (G.phase === 'planted')) {
    el.bombind.hidden = false;
    el['bombind-label'].textContent = `CHARGE PLANTED — SITE ${G.bomb.site}`;
    el['bombind-fill'].style.width = `${(G.bomb.fuse / MATCH.bombSeconds) * 100}%`;
  } else el.bombind.hidden = true;

  // Full-screen effects.
  const hurtRecent = G.time - (p.hurtT || -9) < 0.4;
  el.vignette.style.opacity = !p.alive ? 0.75 : hurtRecent ? 0.6 : p.hp < 30 ? 0.32 + Math.sin(G.time * 5) * 0.08 : 0;
  el.flashfx.style.opacity = Math.min(1, G.playerFlash / 1.6);
  el.scopefx.style.opacity = p.scoped ? 1 : 0;
}
