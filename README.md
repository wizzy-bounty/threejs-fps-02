# threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/wizzy-bounty/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/wizzy-bounty/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**IRONSPUR** — a complete 5v5 round-based tactical FPS for the browser, in the style
Counter-Strike made famous but with its own map, names and art: a dusk rail foundry
where the attacking Emberline plant a thermal charge at the Furnace Yard (site A) or
the Tank Depot (site B) and the Wardens hold the yard.

- **Full round structure** — 15-second buy phase, 100-second rounds, 40-second bomb
  fuse, first to 7. Win by elimination, detonation, defuse or the clock.
- **Real economy** — kill/plant/defuse rewards, win and escalating loss bonuses, and a
  buy menu (B): SMG, carbine, scoped Longshot .50, upgraded pistol, vests, and frag,
  flash and smoke grenades. Dying costs you your loadout.
- **Gunplay that pays for patience** — head/torso/leg hit volumes with a 4x head
  multiplier, distance falloff, armour, recoil kick, and a spread model that grows
  while you run, jump or spray and shrinks when you stop and crouch.
- **Team-plan bots** — nine bots on a waypoint graph with split attack routes (rail
  lane, foundry hall, a late lurker), site holds, vision cones with line-of-sight and
  smoke checks, hearing for gunfire and footsteps, burst-and-strafe engagements,
  post-plant rotations and defuses. They spend the grenades they buy — smoke to
  cover a site execute, flash into the site, smoke on the planted charge — call out
  contacts and gunfire on the radio, and take post-plant holds facing the retake
  entries.
- **One map, drawn from one table** — every solid in Ironspur Yard drives both the
  rendered geometry and the collision/vision tests, so what you see is what blocks you.
  Lit A/B pylons mark the sites, furnace and tank lights warm the dusk, and the
  ground carries the yard's wear: oil stains, cracks, lane lines and hazard chevrons
  at both site gates.
- **A HUD that always says the objective** — a compass strip with both sites and
  their distances, and an objective chip that follows the round (buy plan, carrier,
  planted charge).
- **No build step, no network** — static ES modules, three.js 0.187.0 vendored,
  synthesised WebAudio sound, a fixed-step simulation kept apart from rendering.

## Run it

```sh
node serve.ts          # serves game/ on http://localhost:8080
```

Open the page, click to play. WASD + mouse, B buys, E plants, Tab shows the board.
For a hands-off look, `game/index.html?shot=push&seed=1` (also `buy`, `plant`, `end`)
renders a frozen seeded scene — that is how the screenshots in `screenshots/` were taken.

`main.ts` is the hand-in program: it copies `game/` and `screenshots/` to the output
directory and writes `dossier.json` with the kit's builder.

```
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
