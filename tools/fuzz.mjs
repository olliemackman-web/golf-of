// Random shots on every hole: looks for balls that never stop, NaNs, balls under the ground, and timeouts.
import { Course, holeFor, HOLE_COUNT, SURF, splinePoint, splineLength } from '../src/courseData.js';
import { CLUBS, shotParams, simulateShot, BALL_R } from '../src/physics.js';
import { buildVegetation, TreeField } from '../src/vegetation.js';
import { mulberry32 } from '../src/noise.js';
const rnd = mulberry32(42);
let total = 0, timeouts = 0, nans = 0, under = 0, stuck = 0, holed = 0, water = 0, oob = 0, trees = 0, treeHits = 0;
const t0 = Date.now();
for (let n = 0; n < HOLE_COUNT; n++) {
  const L = holeFor(parseInt(process.env.COURSE || '0', 10), n); const course = new Course(L);
  let field;
  try { field = buildVegetation(course, {}, { tufts: 10, reeds: 10 }).field; } catch (e) { console.log('veg build failed on hole', n + 1, e.message); field = new TreeField(); }
  const len = splineLength(L);
  let holeTimeouts = 0, holeUnder = 0;
  for (let k = 0; k < 220; k++) {
    // start somewhere along the hole, sometimes off in the rough
    const sp = splinePoint(L, rnd() * len);
    const off = (rnd() - 0.5) * 60;
    const x = sp.x + off, z = sp.z + (rnd() - 0.5) * 20;
    if (!course.inBounds(x, z)) continue;
    const lie = course.surfaceAt(x, z).id;
    if (lie === SURF.WATER) continue;
    const club = CLUBS[Math.floor(rnd() * CLUBS.length)];
    const power = 0.05 + rnd() * 0.95, acc = (rnd() - 0.5) * 2;
    const p = shotParams(club, power, acc, lie);
    const yaw = rnd() * Math.PI * 2;
    const from = { x, y: course.heightAt(x, z) + BALL_R, z };
    const r = simulateShot(course, from, { x: Math.sin(yaw), z: Math.cos(yaw) }, p, { wind: { x: (rnd() - 0.5) * 8, z: (rnd() - 0.5) * 8 }, trees: field, hole: L.pin, maxT: 60 });
    total++;
    const e = r.end;
    if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.z)) { nans++; console.log('NaN', n + 1, club.id, power, acc); continue; }
    if (r.mode === 'fly' || r.mode === 'roll') { timeouts++; holeTimeouts++; if (holeTimeouts <= 2) console.log(`timeout hole ${n + 1} ${club.id} pow ${power.toFixed(2)} from (${x.toFixed(0)},${z.toFixed(0)}) end (${e.x.toFixed(1)},${e.y.toFixed(2)},${e.z.toFixed(1)}) mode ${r.mode} t ${r.time.toFixed(0)}`); }
    if (r.mode === 'holed') holed++; if (r.mode === 'water') water++; if (r.mode === 'oob') oob++;
    if (r.mode === 'rest') { const g = course.heightAt(e.x, e.z); if (e.y < g + BALL_R - 0.05) { under++; holeUnder++; if (holeUnder <= 2) console.log(`under ground hole ${n + 1}: y ${e.y.toFixed(2)} ground ${g.toFixed(2)}`); } }
  }
  console.log(`hole ${n + 1} done (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
console.log({ total, timeouts, nans, under, holed, water, oob });
