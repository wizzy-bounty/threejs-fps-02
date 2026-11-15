// map.js — the Ironspur Yard: one data table of solid boxes drives BOTH the visible
// geometry and every collision / line-of-sight test, so what you see is exactly what
// blocks you. The map is an original dusk rail foundry: two rail lines with boxcars run
// east-west, a foundry hall holds mid, the Furnace Yard (site A) sits north-east and the
// Tank Depot (site B) south-east. Attackers spawn west, Wardens east.

import * as THREE from 'three';
import { PALETTE } from './config.js';

// A solid is an axis-aligned box standing on the ground: { x0, z0, x1, z1, h, c }.
// h decides behaviour in physics.js: above 0.55 it blocks movement, above 1.05 sight.
export const SOLIDS = [];
function B(cx, cz, w, d, h, c) {
  SOLIDS.push({ x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, h, c });
  return SOLIDS[SOLIDS.length - 1];
}

// Perimeter fence walls.
B(0, -36.5, 106, 1, 3.4, PALETTE.charcoal);
B(0, 36.5, 106, 1, 3.4, PALETTE.charcoal);
B(-52.5, 0, 1, 74, 3.4, PALETTE.charcoal);
B(52.5, 0, 1, 74, 3.4, PALETTE.charcoal);

// Foundry hall, mid-east: walls 5 high with doorways west (two), north, south and east.
B(6, -11, 8, 0.8, 5, PALETTE.steelDark);      // north wall, west of the door
B(16, -11, 8, 0.8, 5, PALETTE.steelDark);     // north wall, east of the door
B(5.5, 11, 7, 0.8, 5, PALETTE.steelDark);     // south wall, west of the door
B(16.5, 11, 7, 0.8, 5, PALETTE.steelDark);    // south wall, east of the door
B(2, -7.75, 0.8, 6.5, 5, PALETTE.steelDark);  // west wall segments around two doors
B(2, 1.5, 0.8, 4, 5, PALETTE.steelDark);
B(2, 9.25, 0.8, 3.5, 5, PALETTE.steelDark);
B(20, -6.5, 0.8, 9, 5, PALETTE.steelDark);    // east wall around the centre door
B(20, 6.5, 0.8, 9, 5, PALETTE.steelDark);
B(11, 0, 5, 5, 3.6, PALETTE.furnace);         // the furnace block inside the hall
B(6, -8, 2.2, 2.2, 1.15, PALETTE.crate);      // hall crates
B(16, 7, 2.2, 2.2, 1.15, PALETTE.crate);
B(16, -7, 3, 1.6, 2.2, PALETTE.steel);

// Boxcars on the two rail lines (z = -19 and z = 19). The gaps between cars are the
// crossings; the flat wagon on the north line is low cover you can shoot over.
B(-23.5, -19, 17, 3, 3.1, PALETTE.rust);
B(8.5, -19, 17, 3, 3.1, PALETTE.steel);
B(29, -19, 10, 3, 1.0, PALETTE.charcoal);
B(-11, 19, 16, 3, 3.1, PALETTE.steel);
B(21, 19, 16, 3, 3.1, PALETTE.rust);

// West yard, around the Emberline spawn.
B(-40, -5, 2.4, 2.4, 2.3, PALETTE.crate);
B(-44, 6, 2.2, 2.2, 1.15, PALETTE.crateDark);
B(-36, 11, 3, 1.8, 1.15, PALETTE.crate);
B(-33, -2, 1, 8, 1.15, PALETTE.cream);
B(-38, -13, 2.2, 2.2, 2.3, PALETTE.crate);

// Lane cover, north and south.
B(-12, -25, 2.2, 2.2, 1.15, PALETTE.crate);
B(8, -27, 3, 1.8, 2.3, PALETTE.crateDark);
B(-12, 25, 2.2, 2.2, 2.3, PALETTE.crate);
B(8, 27, 3, 1.8, 1.15, PALETTE.crateDark);
B(25, -25, 7, 2.6, 2.6, PALETTE.rust);        // container, north connector
B(25, 25, 7, 2.6, 2.6, PALETTE.steel);        // container, south connector

// Site A — the Furnace Yard. The furnace itself is a cylinder in the scene; this box is
// its collision twin. Crates and a low wall make the post-plant angles.
B(41, -26, 6.4, 6.4, 7, PALETTE.furnace).twin = true;
B(33, -17, 2.2, 2.2, 2.3, PALETTE.crate);
B(35.5, -29, 2.2, 2.2, 1.15, PALETTE.crateDark);
B(45, -17, 3, 1.8, 1.15, PALETTE.crate);
B(36, -20.5, 5, 0.8, 1.15, PALETTE.cream);
B(46.5, -31, 4, 1.2, 1.6, PALETTE.steel);

// Site B — the Tank Depot. Two tank cylinders get collision twins; a low pipe run
// crosses the site and can be seen over but not walked through.
B(34, 19, 5.2, 5.2, 4.6, PALETTE.tank).twin = true;
B(44, 27, 5.2, 5.2, 4.6, PALETTE.tank).twin = true;
B(39, 23.5, 8, 1, 1.0, PALETTE.rust);
B(33, 29, 2.2, 2.2, 2.3, PALETTE.crate);
B(46, 15, 2.2, 2.2, 1.15, PALETTE.crateDark);
B(42.5, 19, 0.8, 5, 1.15, PALETTE.cream);

// Warden spawn screen, east centre: two wall stubs with a gap each side.
B(40, -5, 0.8, 6, 2.6, PALETTE.steelDark);
B(40, 5, 0.8, 6, 2.6, PALETTE.steelDark);
B(44, -10, 2.2, 2.2, 1.15, PALETTE.crate);
B(44, 10, 2.2, 2.2, 1.15, PALETTE.crate);

// Watchtower column, north mid (scenery legs and platform are visual only).
B(-4, -28, 1.2, 1.2, 4.4, PALETTE.steelDark);

// Barrel clusters: small square twins for round barrels.
B(-20, -3, 1.1, 1.1, 1.1, PALETTE.rust);
B(-20, 4.5, 1.1, 1.1, 1.1, PALETTE.steel);
B(27, -2, 1.1, 1.1, 1.1, PALETTE.rust);
B(27, 3.5, 1.1, 1.1, 1.1, PALETTE.steel);

export const SITES = {
  A: { x0: 31, z0: -31, x1: 47, z1: -15, cx: 39, cz: -23, name: 'FURNACE YARD' },
  B: { x0: 31, z0: 15, x1: 47, z1: 31, cx: 39, cz: 23, name: 'TANK DEPOT' },
};

export function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return key;
  }
  return null;
}

// Spawn points: five a side, everyone facing the middle of the yard.
export const SPAWNS = {
  atk: [
    { x: -47, z: 0, a: Math.PI / 2 }, { x: -46, z: -3.5, a: Math.PI / 2 },
    { x: -46, z: 3.5, a: Math.PI / 2 }, { x: -44, z: -6.5, a: Math.PI / 2 },
    { x: -44, z: 6.5, a: Math.PI / 2 },
  ],
  def: [
    { x: 48, z: 0, a: -Math.PI / 2 }, { x: 47, z: -3.5, a: -Math.PI / 2 },
    { x: 47, z: 3.5, a: -Math.PI / 2 }, { x: 45, z: -6.5, a: -Math.PI / 2 },
    { x: 45, z: 6.5, a: -Math.PI / 2 },
  ],
};

// Navigation nodes shared by both teams. Edges are derived in bots.js: two nodes are
// linked when the straight walk between them clears every movement-blocking solid.
export const WAYPOINTS = [
  [-46, 0], [-38, -8], [-38, 8], [-31, -19], [-31, 19], [-17, -19], [-17, 19],
  [-11, 0], [-3, -7], [-3, 7], [5, -6], [5, 6], [13, -7], [13, 7], [18, 0],
  [24, -13], [24, 13], [33, -23], [37, -15], [45, -28], [33, 23], [37, 30],
  [45, 17], [46, 0], [38, -6], [38, 6], [24, 0], [-3, -25], [-3, 25],
  [24, -24], [24, 24], [-24, -25], [-24, 25], [5, 0], [30, -19], [30, 19],
];

// ---- scene construction -------------------------------------------------------

const materials = new Map();
function mat(color) {
  let m = materials.get(color);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color });
    materials.set(color, m);
  }
  return m;
}

// The ground is one big canvas: ash concrete with speckle, the two rail tracks drawn
// as steel lines over sleeper ticks, painted site circles with their letters, and a
// stencilled yard name at the attacker spawn. Drawn once, no image files.
function groundTexture() {
  const W = 1664, H = 1152; // 16 px per metre over 104 x 72 m
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const px = (x) => (x + 52) * 16;
  const pz = (z) => (z + 36) * 16;
  g.fillStyle = '#786a5b';
  g.fillRect(0, 0, W, H);
  let s = 7; // fixed speckle seed: the ground must look the same on every load
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 9000; i++) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,240,210,0.05)';
    g.fillRect(rnd() * W, rnd() * H, 2.4, 2.4);
  }
  g.fillStyle = 'rgba(0,0,0,0.13)';
  g.fillRect(0, pz(-13), W, pz(13) - pz(-13)); // worn apron in front of the hall
  // Rail tracks at z = -19 and z = 19: sleepers first, then the two steel lines.
  for (const tz of [-19, 19]) {
    g.fillStyle = '#4c3b2c';
    for (let x = -52; x < 52; x += 1.4) g.fillRect(px(x), pz(tz) - 17, 12, 34);
    g.fillStyle = '#2c2a26';
    g.fillRect(0, pz(tz) - 13, W, 4);
    g.fillRect(0, pz(tz) + 9, W, 4);
  }
  // Site circles and letters.
  for (const [key, col] of [['A', '#b0512f'], ['B', '#c49a58']]) {
    const site = SITES[key];
    g.strokeStyle = col;
    g.lineWidth = 7;
    g.beginPath();
    g.arc(px(site.cx), pz(site.cz), 62, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = col;
    g.font = 'bold 92px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(key, px(site.cx), pz(site.cz) + 4);
  }
  g.fillStyle = 'rgba(217,201,163,0.5)';
  g.font = 'bold 44px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('IRONSPUR YARD', px(-41), pz(13.5));
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function box(w, h, d, color, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function buildMap(scene) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(104, 72),
    new THREE.MeshLambertMaterial({ map: groundTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Every solid becomes one box mesh from the same numbers physics uses — except the
  // `.twin` solids (the furnace, the two fuel tanks), whose visible shape is the
  // cylinder built below; the box stays as their collision and sight twin only.
  for (const s of SOLIDS) {
    if (s.twin) continue;
    scene.add(box(s.x1 - s.x0, s.h, s.z1 - s.z0, s.c, (s.x0 + s.x1) / 2, s.h / 2, (s.z0 + s.z1) / 2));
  }

  // Rails: thin steel strips along both tracks (visual only; too low to collide).
  for (const tz of [-19, 19]) for (const off of [-0.8, 0.8]) {
    const rail = box(104, 0.14, 0.18, PALETTE.rail, 0, 0.07, tz + off);
    rail.castShadow = false;
    scene.add(rail);
  }

  // The furnace at site A: squat cylinder, a rim, and its chimney.
  const furnace = new THREE.Mesh(new THREE.CylinderGeometry(3.25, 3.45, 7, 18), mat(PALETTE.furnace));
  furnace.position.set(41, 3.5, -26);
  furnace.castShadow = true;
  scene.add(furnace);
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 4.5, 12), mat(PALETTE.charcoal));
  chimney.position.set(41, 9.2, -26);
  scene.add(chimney);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(2.2, 18),
    new THREE.MeshBasicMaterial({ color: 0xff7a2e }),
  );
  glow.rotation.x = -Math.PI / 2;
  glow.position.set(41, 7.03, -26);
  scene.add(glow);

  // Fuel tanks at site B with rim rings.
  for (const [tx, tz] of [[34, 19], [44, 27]]) {
    const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 4.6, 18), mat(PALETTE.tank));
    tank.position.set(tx, 2.3, tz);
    tank.castShadow = true;
    scene.add(tank);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.09, 6, 24), mat(PALETTE.rust));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(tx, 4.55, tz);
    scene.add(rim);
  }

  // Watchtower: four legs and a cab over the column at (-4, -28).
  for (const [lx, lz] of [[-5.6, -29.6], [-2.4, -29.6], [-5.6, -26.4], [-2.4, -26.4]]) {
    scene.add(box(0.28, 4.4, 0.28, PALETTE.steelDark, lx, 2.2, lz));
  }
  scene.add(box(4.6, 0.3, 4.6, PALETTE.charcoal, -4, 4.55, -28));
  scene.add(box(3.6, 1.9, 3.6, PALETTE.steel, -4, 5.6, -28));

  // Barrels where the small solids sit.
  for (const [bx, bz, col] of [[-20, -3, PALETTE.rust], [-20, 4.5, PALETTE.steel], [27, -2, PALETTE.rust], [27, 3.5, PALETTE.steel]]) {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 12), mat(col));
    barrel.position.set(bx, 0.55, bz);
    barrel.castShadow = true;
    scene.add(barrel);
  }

  // Distant skyline: dark foundry silhouettes beyond the fence, and a crane.
  const far = [[70, -20, 16, 22], [74, 14, 12, 30], [-72, -8, 14, 18], [-70, 22, 10, 26], [30, -58, 26, 16], [-26, 56, 22, 14], [64, 44, 18, 20]];
  for (const [fx, fz, fw, fh] of far) {
    const m = box(fw, fh, 10, 0x2c3138, fx, fh / 2, fz);
    m.castShadow = false;
    m.receiveShadow = false;
    scene.add(m);
  }
  scene.add(box(0.8, 26, 0.8, 0x2c3138, 62, 13, -34));
  scene.add(box(20, 0.8, 0.8, 0x2c3138, 53, 25.5, -34));
}
