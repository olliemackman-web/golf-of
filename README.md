# Riverbend Golf — first-person golf in the browser

Two 18-hole courses (par 72 each) played from the golfer's eyes: Riverbend, generated from a seed, and Gosfield Lake, hand-transcribed hole by hole from the club's course guide (`GOSFIELD` in `src/courseData.js` — yards, par, doglegs, bunkers, ponds and carries). Pick the course after picking a player; best rounds are kept per course. A hole spec can also carry hand-placed `scenery` (specimen trees, hedge and fence, a decorative lake, where the woods start) — hole 1 at Gosfield is laid out from drone footage of the real hole. Everything on screen is generated
in code at load time: the terrain and its surface mask, the grass/sand/bark/leaf
textures, the trees and rough, the golfer rig and clubs, the swing animation,
and every sound.

## Run

There is no build step; three.js is vendored under `vendor/`. Any static file server works:

```bash
npm start          # python3 -m http.server 8765, reachable from the LAN
```

Then open http://localhost:8765, or `http://<this-machine's-LAN-IP>:8765` on a
phone on the same Wi-Fi.

To play it on a phone with no computer running, enable GitHub Pages once
(repo **Settings → Pages → Source: GitHub Actions**). Every push to `main` then
publishes the game via `.github/workflows/pages.yml`.

## Develop

```bash
npm install            # eslint + playwright (dev only); links vendor/three so the node tools run
npm run lint           # eslint, built-in rules only (undefined names, unused vars, unreachable code)
npm run check          # headless checks: both courses, every hole, club table, random-shot fuzz
npm test               # lint + check
npm run test:browser   # boots the real game in headless Chromium, desktop and phone profiles
```

`test:browser` needs a Playwright Chromium: run `npx playwright install chromium`
once on a new machine. `SMOKE_SHOT=shot.png npm run test:browser` also saves a screenshot.
`npm run shots [dir]` renders a fixed set of viewpoints (tee, overhead, landing, address, green,
approach) to PNGs for eyeballing graphics changes without a GPU; `COURSE=1` picks Gosfield,
`HOLE=3` adds that hole's tee shot, `ONLY=01,06` limits the views.
`.github/workflows/ci.yml` runs all of the above on every push.

Working from Claude Code on the web or the mobile app: `.claude/hooks/session-start.sh`
installs the dev dependencies when the session starts, so lint and tests work straight away.

Other tools: `npm run holes` lists both courses, `npm run calibrate` prints carry per
club, `npm run fuzz` fires 220 random shots on every hole (`COURSE=1` for Gosfield),
`npm run perf` times course build and shot sims.

## Progression

Pick or create a player on the start screen (profiles live in the browser's localStorage on that device). Each hole pays coins by result — ace 50, eagle 25, birdie 10, par 5, bogey 3, double 2, worse 1 — spent in the PRO SHOP (aim view or the hole-out card) on five upgrade tracks: driver & woods, irons & wedges, forgiveness, putting, spin control (five levels each, 10/20/35/55/80 coins). Upgrades and best round carry across games. The SPIN button (B) opens a pad for draw/fade and back/top spin; spin never changes the carry, only the shape and what the ball does when it lands (full backspin sits, full topspin runs on). It is shown live on the aim line and resets after each shot. Upgrades are +10% clubhead speed per level.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Aim | mouse drag / ← → | drag |
| Aim view (behind → overhead → landing) | V | VIEW |
| Ball spin pad | B | SPIN |
| Pro shop | U | SHOP |
| Target power (moves the landing ring, marks the meter) | W / S | slider |
| Club | Q / E / wheel | ◀ ▶ |
| Swing: start, stop the power bar, then strike when the accuracy marker is in the green (it ping-pongs until you press) | Space ×3 | SWING ×3 |
| Putt: drag back for pace, left/right for line (the dashed line turns green when it drops); lift off and adjust as often as you like, then PUTT, then strike in the green | mouse drag, Space | touch drag, PUTT |
| Ball camera | C | CAM |
| Restart hole | R | — |

## Layout

- `src/courseData.js` — `makeHole(n)` designs each of the 18 holes from a seed; heightmap, surface mask and physics lookups for the hole in play (no three.js; runs in node — `node tools/holes.mjs` lists the course).
- `src/physics.js` — ball flight (drag + Magnus), bounce, roll, hole capture, club table. `tools/calibrate.mjs` prints carry per club.
- `src/terrain.js` — terrain splat shader (rough / first cut / view-dependent mown stripes / green / bunkers with shaded lips / water, plus a baked canopy-shadow map from the trees), water, far hills, gradient sky dome + environment map, clouds, cup + flag.
- `src/vegetation.js` — instanced trees (trunks + leaf cards), grass tufts, reeds, tree collisions.
- `src/golfer.js` — POV rig (arms, hands, legs, club models) and the procedural swing.
- `src/profile.js` — profiles, coins and upgrades in localStorage; `src/menus.js` — profile picker, shop, spin pad.
- `src/main.js` — game states, cameras, input, HUD wiring. `window.__game.step(sec)` advances the sim by hand for debugging; `__game.paused = true` stops the loop.
- `tools/test.mjs` — the `npm run check` suite; `tools/smoke.mjs` — the headless browser boot test.
