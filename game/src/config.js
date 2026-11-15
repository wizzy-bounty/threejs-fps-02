// config.js — every tunable of IRONSPUR in one place: palette, weapons, economy, round timings.
// Nothing in here touches the DOM or three.js; it is pure data the other modules read.

// Dusk rail-foundry palette. One warm sky, ash ground, teal steel, rust and cream structures,
// amber for the attacking Emberline, deep teal for the defending Yard Wardens.
// v4 BRIGHTEN: the v3 cinematic pass went too dark (map/ground near-black in 3 of 4
// frames), so the palette is lifted a step — ground and haze lighter, sky top less
// deep — while the dusk identity stays.
export const PALETTE = {
  sky: 0x31424f,
  horizon: 0xe07a3f,
  fog: 0xa88a68,
  sun: 0xffb36b,
  ground: 0x6a6055,
  groundDark: 0x524a41,
  rail: 0x33302c,
  sleeper: 0x4c3b2c,
  steel: 0x4a7a72,
  steelDark: 0x3a5c55,
  rust: 0xb3562c,
  cream: 0xd9c9a3,
  charcoal: 0x4a443c,
  crate: 0x8a6844,
  crateDark: 0x6e5234,
  tank: 0xb8b0a0,
  furnace: 0x70422a,
  siteA: 0xc23b22,
  siteB: 0xd9a441,
  atk: 0xe8873a,
  def: 0x35a29b,
  atkDark: 0x8a4f1e,
  defDark: 0x1e5f59,
};

export const TEAMS = {
  atk: { name: 'EMBERLINE', short: 'EMB' },
  def: { name: 'WARDENS', short: 'WRD' },
};

export const MATCH = {
  winRounds: 7,          // first to 7 takes the match
  maxRounds: 13,
  buySeconds: 15,
  roundSeconds: 100,
  bombSeconds: 40,       // fuse once planted
  endSeconds: 6,         // pause on the round-end banner
  plantSeconds: 3.2,
  defuseSeconds: 5,
  startMoney: 800,
  maxMoney: 16000,
};

export const REWARDS = {
  kill: 300,
  plant: 300,            // to the planter
  defuse: 300,           // to the defuser
  win: 3250,
  lossBase: 1400,        // +500 per consecutive loss, capped by lossCap
  lossStep: 500,
  lossCap: 3400,
};

// kind: 'pistol' | 'smg' | 'rifle' | 'sniper'. damage is per bullet at point blank before the
// head/leg multiplier and armour; falloffStart/falloffEnd scale it down to minFactor at range.
// spread is the base cone in radians for a still, standing shooter; moveSpread is added at full
// run speed, airSpread in the air, and crouchFactor multiplies the total while crouched.
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'P9 Sidearm', kind: 'pistol', price: 0, slot: 'sidearm',
    damage: 34, headMult: 4, legMult: 0.75, rpm: 380, auto: false,
    mag: 12, reserve: 100, reload: 1.5, range: 90,
    falloffStart: 14, falloffEnd: 46, minFactor: 0.55,
    spread: 0.006, moveSpread: 0.028, airSpread: 0.09, crouchFactor: 0.7,
    bloom: 0.004, bloomMax: 0.03, recoil: 0.011, kick: 0.5, moveFactor: 1.0,
  },
  p9x: {
    id: 'p9x', name: 'P9X Longslide', kind: 'pistol', price: 500, slot: 'sidearm',
    damage: 38, headMult: 4, legMult: 0.75, rpm: 420, auto: false,
    mag: 15, reserve: 100, reload: 1.5, range: 95,
    falloffStart: 16, falloffEnd: 50, minFactor: 0.6,
    spread: 0.005, moveSpread: 0.026, airSpread: 0.09, crouchFactor: 0.7,
    bloom: 0.0035, bloomMax: 0.026, recoil: 0.012, kick: 0.55, moveFactor: 1.0,
  },
  kestrel: {
    id: 'kestrel', name: 'Kestrel-9 SMG', kind: 'smg', price: 1250, slot: 'primary',
    damage: 26, headMult: 4, legMult: 0.75, rpm: 800, auto: true,
    mag: 32, reserve: 128, reload: 2.1, range: 70,
    falloffStart: 10, falloffEnd: 34, minFactor: 0.45,
    spread: 0.011, moveSpread: 0.03, airSpread: 0.1, crouchFactor: 0.75,
    bloom: 0.003, bloomMax: 0.034, recoil: 0.008, kick: 0.35, moveFactor: 1.04,
  },
  carbine: {
    id: 'carbine', name: 'M7 Carbine', kind: 'rifle', price: 2700, slot: 'primary',
    damage: 40, headMult: 4, legMult: 0.75, rpm: 640, auto: true,
    mag: 30, reserve: 120, reload: 2.4, range: 120,
    falloffStart: 22, falloffEnd: 70, minFactor: 0.72,
    spread: 0.0045, moveSpread: 0.034, airSpread: 0.11, crouchFactor: 0.65,
    bloom: 0.0042, bloomMax: 0.03, recoil: 0.014, kick: 0.7, moveFactor: 0.96,
  },
  longshot: {
    id: 'longshot', name: 'Longshot .50', kind: 'sniper', price: 4750, slot: 'primary',
    damage: 112, headMult: 2.2, legMult: 0.55, rpm: 42, auto: false,
    mag: 5, reserve: 30, reload: 3.1, range: 220,
    falloffStart: 40, falloffEnd: 160, minFactor: 0.9,
    spread: 0.0006, moveSpread: 0.12, airSpread: 0.2, crouchFactor: 0.5,
    bloom: 0.0, bloomMax: 0.0, recoil: 0.06, kick: 1.6, moveFactor: 0.88, scoped: true,
  },
};

export const GRENADES = {
  frag: { id: 'frag', name: 'Frag Charge', price: 300, radius: 6.5, maxDamage: 92 },
  flash: { id: 'flash', name: 'Flash Pellet', price: 200, radius: 17, blindMax: 3.6 },
  smoke: { id: 'smoke', name: 'Smoke Canister', price: 300, radius: 3.4, seconds: 13 },
};

export const GEAR = {
  vest: { id: 'vest', name: 'Flak Vest', price: 650 },
  vesthelm: { id: 'vesthelm', name: 'Vest + Helm', price: 1000 },
};

// Bot callsigns, ours alone. Allies first, then the Warden squad.
export const ALLY_NAMES = ['Vex', 'Ondo', 'Rurik', 'Sable'];
export const ENEMY_NAMES = ['Hask', 'Mire', 'Cobalt', 'Yuna', 'Petrov'];
