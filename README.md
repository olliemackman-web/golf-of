# Riverbend Golf — first-person golf in the browser

A single par-4 played from the golfer's eyes. Everything on screen is generated
in code at load time: the terrain and its surface mask, the grass/sand/bark/leaf
textures, the trees and rough, the golfer rig and clubs, the swing animation,
and every sound.

## Run

```bash
python3 -m http.server 8765 -d /Users/oliver/golf-pov
```

Then open http://localhost:8765 (or `http://<this-mac's-LAN-IP>:8765` on a
phone on the same Wi-Fi). No build step; three.js is vendored under `vendor/`.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Aim | mouse drag / ← → | drag |
| Aim view (behind → overhead → landing) | V | VIEW |
| Target power (moves the landing ring, marks the meter) | W / S | slider |
| Club | Q / E / wheel | ◀ ▶ |
| Swing (start, set power, strike at the line) | Space ×3 | SWING ×3 |
| Ball camera | C | CAM |
| Restart hole | R | — |

## Layout

- `src/courseData.js` — hole layout, heightmap, surface mask, physics lookups (no three.js; runs in node).
- `src/physics.js` — ball flight (drag + Magnus), bounce, roll, hole capture, club table. `tools/calibrate.mjs` prints carry per club.
- `src/terrain.js` — terrain splat shader (rough / fairway stripes / green / sand / water), water, far hills, sky, clouds, cup + flag.
- `src/vegetation.js` — instanced trees (trunks + leaf cards), grass tufts, reeds, tree collisions.
- `src/golfer.js` — POV rig (arms, hands, legs, club models) and the procedural swing.
- `src/main.js` — game states, cameras, input, HUD wiring. `window.__game.step(sec)` advances the sim by hand for debugging; `__game.paused = true` stops the loop.
