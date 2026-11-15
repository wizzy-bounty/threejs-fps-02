// state.js — the one place game state lives. Every module reads and writes the single
// object G; nothing keeps a private copy of match, round or actor state elsewhere.

// mulberry32: a tiny seeded RNG so a round (and every screenshot) can be reproduced
// exactly from its seed. All gameplay randomness flows through G.rand.
export function makeRng(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const G = {
  rand: makeRng(1),
  time: 0,               // simulation clock, seconds; only the fixed-step loop advances it

  phase: 'menu',         // menu | buy | live | planted | over | matchover
  phaseT: 0,             // seconds left in the current phase
  round: 0,
  score: { atk: 0, def: 0 },
  lossStreak: { atk: 0, def: 0 },
  winner: null,          // team that won the round/match, for banners
  winReason: '',         // 'elimination' | 'detonation' | 'defuse' | 'time' | 'match'

  actors: [],            // the player and nine bots, in spawn order
  player: null,
  bomb: {
    carrier: null,       // actor holding the charge, or null once planted/dropped
    planted: false,
    site: null,          // 'A' | 'B'
    x: 0, z: 0,
    fuse: 0,
    beep: 0,
  },
  plan: null,            // the attacking team's plan for this round: { site, routes }

  smokes: [],            // live smoke volumes { x, y, z, r, until }
  noises: [],            // noise events bots can hear { x, z, radius, at, kind }
  flashes: [],           // recent flash detonations { x, y, z, at }
  feed: [],              // kill feed rows { text, until } for the HUD
  radio: [],             // radio callout rows { text, until } — team chatter, kept
                         // separate from the kill feed so callouts stay readable
  boardForced: false,    // staged ?shot= scenes may force the scoreboard visible
  banner: null,          // centre-screen message { title, sub, until }

  shake: 0,              // camera shake energy, decays in the render loop
  hitmark: 0,            // time the hitmarker was last lit
  playerFlash: 0,        // seconds of flash blindness left on the player
  scoped: false,
};

export function resetMatch(seed) {
  G.rand = makeRng(seed);
  G.time = 0;
  G.round = 0;
  G.score.atk = 0;
  G.score.def = 0;
  G.lossStreak.atk = 0;
  G.lossStreak.def = 0;
  G.winner = null;
  G.winReason = '';
  G.smokes.length = 0;
  G.noises.length = 0;
  G.flashes.length = 0;
  G.feed.length = 0;
  G.radio.length = 0;
  G.boardForced = false;
  G.banner = null;
  G.shake = 0;
  G.playerFlash = 0;
  G.scoped = false;
}

export function aliveActors(team) {
  let n = 0;
  for (const a of G.actors) if (a.alive && (team === undefined || a.team === team)) n++;
  return n;
}

export function emitNoise(x, z, radius, kind) {
  G.noises.push({ x, z, radius, at: G.time, kind });
  if (G.noises.length > 24) G.noises.shift();
}

export function pushFeed(text) {
  G.feed.push({ text, until: G.time + 5 });
  if (G.feed.length > 5) G.feed.shift();
}

// Radio callouts: last three, on their own panel — never mixed into the kill
// feed, so the team chatter reads as team play instead of feed noise.
export function pushRadio(text) {
  G.radio.push({ text, until: G.time + 7 });
  if (G.radio.length > 3) G.radio.shift();
}

export function setBanner(title, sub, seconds) {
  G.banner = { title, sub, until: G.time + seconds };
}
