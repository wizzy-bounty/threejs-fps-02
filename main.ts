// IRONSPUR — hand-in program (Node 22, standard library only).
//
// The game itself is the static site under game/: plain ES modules the browser loads
// directly, three.js 0.187.0 vendored beside them, no build step and no network. This
// program's whole job is to hand that game in: copy game/ and screenshots/ from this
// repository into the output directory and write dossier.json there with the kit's
// own builder (vendor/makefun-threejs.ts, unchanged), so the dossier the judge reads
// is byte for byte the one the gate rebuilds.
//
// Play it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader, MAKEFUN_OUTPUT_DIR names the output directory:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repo = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(repo, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(repo, 'screenshots'))) {
  cpSync(join(repo, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The caps are the gate's own (reference/gate.json): dossier text at 160 KiB, at most
// 4 screenshots of 256 KiB, game/ at most 993 entries and 48 MiB.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);
