# Riverbend Golf — first-person golf in the browser

Eighteen generated holes (par 72) played from the golfer's eyes. Everything on screen is generated
in code at load time: the terrain and its surface mask, the grass/sand/bark/leaf
textures, the trees and rough, the golfer rig and clubs, the swing animation,
and every sound.

## Run

```bash
python3 -m http.server 8765 -d /Users/oliver/golf-pov
```

Then open http://localhost:8765 (or `http://<this-mac's-LAN-IP>:8765` on a
phone on the same Wi-Fi). No build step; three.js is vendored under `vendor/`.

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
| Swing: start, stop the power bar, then stop the accuracy bar as it reaches 100% | Space ×3 | SWING ×3 |
| Ball camera | C | CAM |
| Restart hole | R | — |

## Layout

- `src/courseData.js` — `makeHole(n)` designs each of the 18 holes from a seed; heightmap, surface mask and physics lookups for the hole in play (no three.js; runs in node — `node tools/holes.mjs` lists the course).
- `src/physics.js` — ball flight (drag + Magnus), bounce, roll, hole capture, club table. `tools/calibrate.mjs` prints carry per club.
- `src/terrain.js` — terrain splat shader (rough / fairway stripes / green / sand / water), water, far hills, sky, clouds, cup + flag.
- `src/vegetation.js` — instanced trees (trunks + leaf cards), grass tufts, reeds, tree collisions.
- `src/golfer.js` — POV rig (arms, hands, legs, club models) and the procedural swing.
- `src/profile.js` — profiles, coins and upgrades in localStorage; `src/menus.js` — profile picker, shop, spin pad.
- `src/main.js` — game states, cameras, input, HUD wiring. `window.__game.step(sec)` advances the sim by hand for debugging; `__game.paused = true` stops the loop.
