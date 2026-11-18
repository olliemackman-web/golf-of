// Headless checks that need no browser: `npm test` runs this.
// Each check throws on failure so the exit code is non-zero.
import { Course, holeFor, COURSES, HOLE_COUNT, SURF, splinePoint, splineLength, courseYards, alongHole, polyDist } from '../src/courseData.js';
const polyDistAt = (g, x, z) => polyDist(g.P, x, z, 8);
import { Ball, CLUBS, shotParams, simulateShot, BALL_R } from '../src/physics.js';
import { buildVegetation } from '../src/vegetation.js';
import { mulberry32 } from '../src/noise.js';

// buildVegetation is given no textures here, and three warns about each undefined map; that is expected.
const warn = console.warn;
console.warn = (...a) => { if (!String(a[0]).includes("parameter 'map'")) warn(...a); };

const failures = [];
function check(name, fn) {
  const t0 = Date.now();
  try { fn(); console.log(`ok   ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failures.push(name); console.log(`FAIL ${name}: ${e.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

check('every course is 18 holes at its stated par (72, or 54 for the pitch and putt)', () => {
  COURSES.forEach((c, ci) => {
    let par = 0;
    for (let n = 0; n < HOLE_COUNT; n++) {
      const L = holeFor(ci, n);
      assert([3, 4, 5].includes(L.par), `${c.name} hole ${n + 1} par ${L.par}`);
      assert(L.yards > (c.par < 60 ? 50 : 90) && L.yards < 650, `${c.name} hole ${n + 1} yards ${L.yards}`);
      par += L.par;
    }
    assert(par === c.par && (par === 72 || par === 54), `${c.name} par ${par}, stated ${c.par}`);
    assert(courseYards(ci) > (c.par < 60 ? 1800 : 5000), `${c.name} yardage ${courseYards(ci)}`);
  });
});

check('every hole builds, has a dry tee and pin, and vegetation builds', () => {
  COURSES.forEach((c, ci) => {
    for (let n = 0; n < HOLE_COUNT; n++) {
      const L = holeFor(ci, n);
      const course = new Course(L);
      for (const [label, p] of [['tee', L.tee], ['pin', L.pin]]) {
        assert(course.inBounds(p.x, p.z), `${c.name} hole ${n + 1} ${label} out of bounds`);
        const s = course.surfaceAt(p.x, p.z).id;
        assert(s !== SURF.WATER, `${c.name} hole ${n + 1} ${label} is in water`);
        assert(Number.isFinite(course.heightAt(p.x, p.z)), `${c.name} hole ${n + 1} ${label} height NaN`);
      }
      assert(course.surfaceAt(L.pin.x, L.pin.z).id === SURF.GREEN, `${c.name} hole ${n + 1} pin not on the green`);
      buildVegetation(course, {}, { tufts: 10, reeds: 10 });
    }
  });
});

check('club carries are ordered longest to shortest', () => {
  const flat = { heightAt: () => 0, normalAt: (x, z, o = {}) => { o.x = 0; o.y = 1; o.z = 0; return o; }, surfaceAt: () => ({ id: SURF.FAIRWAY, w: {} }), inBounds: () => true, waterLevel: -99 };
  let prev = Infinity;
  for (const c of CLUBS) {
    if (c.id === 'PT') continue;
    const r = simulateShot(flat, { x: 0, y: BALL_R, z: 0 }, { x: 0, z: 1 }, shotParams(c, 1, 0, SURF.FAIRWAY), { maxT: 30 });
    const carry = r.carry ? Math.hypot(r.carry.x, r.carry.z) : Math.hypot(r.end.x, r.end.z);
    assert(Number.isFinite(carry) && carry > 20, `${c.id} carry ${carry}`);
    assert(carry <= prev + 1, `${c.id} carries ${carry.toFixed(0)}m, longer than the club before it (${prev.toFixed(0)}m)`);
    prev = carry;
  }
});

check('random shots settle without NaNs, timeouts or sinking under ground', () => {
  const rnd = mulberry32(7);
  let total = 0;
  for (let ci = 0; ci < COURSES.length; ci++) {
    for (let n = 0; n < HOLE_COUNT; n += 3) {
      const L = holeFor(ci, n); const course = new Course(L);
      const field = buildVegetation(course, {}, { tufts: 10, reeds: 10 }).field;
      const len = splineLength(L);
      for (let k = 0; k < 40; k++) {
        const sp = splinePoint(L, rnd() * len);
        const x = sp.x + (rnd() - 0.5) * 60, z = sp.z + (rnd() - 0.5) * 20;
        if (!course.inBounds(x, z)) continue;
        const lie = course.surfaceAt(x, z).id;
        if (lie === SURF.WATER) continue;
        const club = CLUBS[Math.floor(rnd() * CLUBS.length)];
        const p = shotParams(club, 0.05 + rnd() * 0.95, (rnd() - 0.5) * 2, lie);
        const yaw = rnd() * Math.PI * 2;
        const r = simulateShot(course, { x, y: course.heightAt(x, z) + BALL_R, z }, { x: Math.sin(yaw), z: Math.cos(yaw) }, p, { wind: { x: (rnd() - 0.5) * 8, z: (rnd() - 0.5) * 8 }, trees: field, hole: L.pin, maxT: 60 });
        total++;
        const e = r.end;
        assert(Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.z), `NaN on ${COURSES[ci].name} hole ${n + 1} with ${club.id}`);
        assert(r.mode !== 'fly' && r.mode !== 'roll', `ball never stopped on ${COURSES[ci].name} hole ${n + 1} with ${club.id} (mode ${r.mode})`);
        if (r.mode === 'rest') assert(e.y >= course.heightAt(e.x, e.z) + BALL_R - 0.05, `ball under ground on ${COURSES[ci].name} hole ${n + 1}`);
      }
    }
  }
  assert(total > 200, `only ${total} shots simulated`);
});

/**
 * Plays every hole of a course with the simulator and demands a route that reaches the green in
 * par + 1, where each shot still finishes safe when hit a little heavy, light, pulled or pushed.
 * `waypoints(L)` lists the places besides the pin worth aiming at (islands, the fairway ahead).
 */
function doable(courseId, waypoints) {
  const ci = COURSES.findIndex((c) => c.id === courseId);
  assert(ci >= 0, `no ${courseId} course`);
  const flat = { x: 0, z: 0 };
  const safe = (course, r) => {
    if (r.mode !== 'rest') return false;
    const id = course.surfaceAt(r.end.x, r.end.z).id;
    return id === SURF.FAIRWAY || id === SURF.GREEN || id === SURF.TEE || id === SURF.SAND || id === SURF.ROUGH;
  };
  const shoot = (course, pos, club, power, yaw) => {
    const lie = course.surfaceAt(pos.x, pos.z).id;
    const p = shotParams(club, power, 0, lie);
    return simulateShot(course, { x: pos.x, y: course.heightAt(pos.x, pos.z) + BALL_R, z: pos.z }, { x: Math.sin(yaw), z: Math.cos(yaw) }, p, { maxT: 40 });
  };
  const report = [];
  for (let n = 0; n < HOLE_COUNT; n++) {
    const L = holeFor(ci, n); const course = new Course(L);
    let pos = { x: L.tee.x, z: L.tee.z }, legs = 0; const route = [];
    // home = on the green, or resting on the island within 10 m of the pin (a putt from the apron)
    const home = (p) => course.surfaceAt(p.x, p.z).id === SURF.GREEN || Math.hypot(L.pin.x - p.x, L.pin.z - p.z) < 10;
    while (legs < L.par + 1 && !home(pos)) {
      const dPin = Math.hypot(L.pin.x - pos.x, L.pin.z - pos.z);
      // aim at the pin and at every island centre ahead, a little either side of each
      const targets = [L.pin, ...waypoints(L).filter((I) => Math.hypot(I.x - pos.x, I.z - pos.z) > 25 && Math.hypot(L.pin.x - I.x, L.pin.z - I.z) < dPin - 15)];
      const yaws = [];
      for (const T of targets) { const a = Math.atan2(T.x - pos.x, T.z - pos.z); yaws.push(a - 0.03, a, a + 0.03); }
      const cands = [];
      for (const club of CLUBS) {
        if (club.putter && dPin > 30) continue;
        for (let pw = 0.1; pw <= 1.001; pw += 0.025) for (const yaw of yaws) {
          const r = shoot(course, pos, club, pw, yaw);
          if (!safe(course, r)) continue;
          const left = Math.hypot(L.pin.x - r.end.x, L.pin.z - r.end.z);
          if (left > dPin - 20 && !home(r.end)) continue; // a shot has to make real progress
          const lieEnd = course.surfaceAt(r.end.x, r.end.z).id;
          if (!home(r.end) && lieEnd !== SURF.FAIRWAY && lieEnd !== SURF.TEE) continue; // aim for the middle of an island, not its rim or a crater
          cands.push({ club, pw, yaw, end: r.end, left, onGreen: home(r.end) });
        }
      }
      cands.sort((a, b) => (a.onGreen === b.onGreen ? a.left - b.left : a.onGreen ? -1 : 1));
      // the shot has to survive being a little heavy, light, pulled or pushed
      let pick = null;
      for (const c of cands.slice(0, 200)) {
        let ok = 0, tot = 0;
        for (const pm of [0.96, 1, 1.04]) for (const ym of [-0.02, 0, 0.02]) { tot++; if (safe(course, shoot(course, pos, c.club, Math.min(1, c.pw * pm), c.yaw + ym))) ok++; }
        if (ok / tot >= 0.75) { pick = { ...c, margin: ok / tot }; break; }
      }
      assert(pick, `${L.name || 'hole ' + (n + 1)}: no safe shot from ${dPin.toFixed(0)}m out after ${legs} leg(s) (${cands.length} landings, none with margin)`);
      route.push(`${pick.club.id}@${Math.round(pick.pw * 100)}%${pick.onGreen ? ' green' : ` ${Math.round(pick.left)}m left`}`);
      pos = { x: pick.end.x, z: pick.end.z }; legs++;
    }
    const line = `  ${String(n + 1).padStart(2)} ${(L.name || 'Hole ' + (n + 1)).padEnd(16)} par ${L.par} ${String(L.yards).padStart(3)}y: ${route.join(' → ')}`;
    console.log(line); report.push(line);
    assert(home(pos), `${L.name || 'hole ' + (n + 1)}: not home after ${legs} legs (${route.join(', ')})`);
  }
  void flat;
}

check('every Starfall hole is doable: a route with margin reaches the green in par + 1', () => doable('starfall', (L) => L.space.islands));

check("every Old Joe's hole is doable: a route with margin reaches the green in par + 1", () => doable('oldjoes', () => []));

check('every Highland Lakes hole is doable: a route with margin reaches the green in par + 1', () => doable('highland', (L) => {
  const pts = []; for (let t = 0.25; t < 0.95; t += 0.07) { const p = alongHole(L, t, 0); pts.push({ x: p.x, z: p.z }); }
  return [...pts, ...(L.islands || [])];
}));

check("Old Joe's follows its map: nine real holes played twice, each tee and pin on its own mapped tee and green", () => {
  const ci = COURSES.findIndex((c) => c.id === 'oldjoes'); assert(ci >= 0, "no Old Joe's course");
  const want = [72, 100, 179, 97, 96, 82, 191, 136, 181]; // yards along each mapped hole line
  for (let n = 0; n < HOLE_COUNT; n++) {
    const L = holeFor(ci, n), course = new Course(L);
    assert(L.par === 3, `hole ${n + 1} par ${L.par}`);
    assert(Math.abs(L.yards - want[n % 9]) <= 1, `hole ${n + 1} is ${L.yards} yds, the map says ${want[n % 9]}`);
    assert(course.surfaceAt(L.tee.x, L.tee.z).id === SURF.TEE, `hole ${n + 1}: the tee is not on a mapped tee`);
    assert(course.surfaceAt(L.pin.x, L.pin.z).id === SURF.GREEN, `hole ${n + 1}: the pin is not on a green`);
    assert(Math.hypot(L.pin.x - L.green.x, L.pin.z - L.green.z) < Math.max(L.green.rx, L.green.rz), `hole ${n + 1}: the pin is not on this hole's green`);
    if (n >= 9) { const A = holeFor(ci, n - 9); assert(Math.hypot(A.pin.x - L.pin.x, A.pin.z - L.pin.z) > 3, `hole ${n + 1}: the pin has not moved for the second time round`); }
  }
  // holes 1 to 6: a bank about a foot high stands just off the green at the back, and is open at the front
  for (let n = 0; n < 9; n++) {
    const L = holeFor(ci, n), course = new Course(L), g = L.shapes.greens.find((q) => Math.hypot(q.cx - L.green.x, q.cz - L.green.z) < 1);
    // how far the ground just off the green stands above the line from the green's edge to the ground beyond, along one bearing
    const rise = (ang) => { let ridge = -9, edge = null, beyond = null; for (let r = 2; r < 20; r += 0.2) { const x = L.green.x + Math.sin(ang) * r, z = L.green.z + Math.cos(ang) * r, d = polyDistAt(g, x, z), y = course.heightAt(x, z); if (d > 0.2) edge = y; else if (d < -0.8 && d > -3.2) ridge = Math.max(ridge, y); else if (d < -4.6 && beyond == null) beyond = y; } return ridge - (edge + beyond) / 2; };
    // behind and to the sides (the best of several bearings: a bunker may be cut into one of them), and straight back down the hole
    const back = Math.max(...[-1.6, -1.1, -0.6, 0, 0.6, 1.1, 1.6].map((a) => rise(a + (g.berm ? Math.atan2(g.berm.ax, g.berm.az) + Math.PI : 0)))), front = rise(g.berm ? Math.atan2(g.berm.ax, g.berm.az) : Math.PI);
    if (n < 6) assert(g.berm && back - front > 0.1, `hole ${n + 1}: the ground behind the green stands ${back.toFixed(2)} m proud, at the opening ${front.toFixed(2)} m`);
    else assert(!g.berm, `hole ${n + 1} should have no bank`);
  }
  // the stand of pines in the middle of the course stops a ball: fire a spread of low and high shots through it
  { const L = holeFor(ci, 1), course = new Course(L), field = buildVegetation(course, {}, { tufts: 10, reeds: 10 }).field;
    const pines = L.scenery.spots.filter((s) => s.kind === 'wallpine' && Math.hypot(s.x - L.green.x, s.z - L.green.z) < 60); assert(pines.length >= 12, `only ${pines.length} pines in the stand by the 2nd green`);
    const cx = pines.reduce((a, s) => a + s.x, 0) / pines.length, cz = pines.reduce((a, s) => a + s.z, 0) / pines.length; let through = 0, shots = 0;
    for (const club of CLUBS.filter((c) => ['5I', '7I', '9I'].includes(c.id))) for (let a = 0; a < 6.28; a += 0.4) for (const off of [-3, 0, 3]) {
      const sx = cx + Math.cos(a) * 30, sz = cz + Math.sin(a) * 30, yaw = Math.atan2(cx - sx, cz - sz) + off / 30; if (!course.inBounds(sx, sz)) continue;
      const r = simulateShot(course, { x: sx, y: course.heightAt(sx, sz) + BALL_R, z: sz }, { x: Math.sin(yaw), z: Math.cos(yaw) }, shotParams(club, 0.8, 0, SURF.FAIRWAY), { trees: field, maxT: 30 });
      shots++; if ((r.end.x - sx) * Math.sin(yaw) + (r.end.z - sz) * Math.cos(yaw) > 30 + 14) through++;
    }
    console.log(`  pine stand: ${pines.length} trees; ${through} of ${shots} shots fired through it came out the far side`);
    assert(through / shots < 0.12, `${through} of ${shots} shots got through the pines`); }
  // all nine greens, the bunkers and the pond are on the ground from any one hole
  const L = holeFor(ci, 4), course = new Course(L); let greens = 0, wet = 0, sand = 0;
  for (const g of L.shapes.greens) if (course.surfaceAt(g.cx, g.cz).id === SURF.GREEN) greens++;
  for (const b of L.bunkers) if (course.surfaceAt(b.x, b.z).id === SURF.SAND) sand++;
  for (const q of L.ponds) if (course.surfaceAt(q.x, q.z).id === SURF.WATER) wet++;
  console.log(`  from hole 5: ${greens} greens, ${sand} bunkers and ${wet} pond on the ground`);
  assert(greens === 9 && sand >= 8 && wet === 1, `expected 9 greens, the bunkers and the pond; got ${greens}, ${sand}, ${wet}`);
});

check('Highland Lakes: the ground sends the ball downhill', () => {
  const ci = COURSES.findIndex((c) => c.id === 'highland');
  // Long Meadow leans right (high on the left): a ball rolled straight down the middle drifts right
  { const L = holeFor(ci, 3), course = new Course(L); const a = alongHole(L, 0.4, 0);
    const b = new Ball(course); b.place(a.x, a.z); b.vel.x = Math.sin(a.dir) * 9; b.vel.z = Math.cos(a.dir) * 9; b.mode = 'roll';
    for (let i = 0; i < 4000 && b.mode === 'roll'; i++) b.step(1 / 240);
    const left = (b.pos.x - a.x) * Math.cos(a.dir) - (b.pos.z - a.z) * Math.sin(a.dir), run = (b.pos.x - a.x) * Math.sin(a.dir) + (b.pos.z - a.z) * Math.cos(a.dir);
    console.log(`  Long Meadow: rolled ${run.toFixed(1)} m and drifted ${(-left).toFixed(2)} m right`);
    assert(b.mode === 'rest', `ball never stopped (${b.mode})`); assert(left < -0.25, `expected a drift to the right, got ${(-left).toFixed(2)} m`); }
  // every green: a ball set rolling gently across the slope finishes below where a flat green would leave it
  let worst = Infinity, steep = 0;
  for (let n = 0; n < HOLE_COUNT; n++) {
    const L = holeFor(ci, n), course = new Course(L), g = L.green, nrm = course.normalAt(g.x, g.z);
    const hl = Math.hypot(nrm.x, nrm.z); assert(hl > 1e-4, `${L.name}: the green is dead flat`);
    const dx = nrm.x / hl, dz = nrm.z / hl; // downhill
    const b = new Ball(course); b.place(g.x, g.z); b.vel.x = -dz * 1.6; b.vel.z = dx * 1.6; b.mode = 'roll'; // across the slope
    for (let i = 0; i < 6000 && b.mode === 'roll'; i++) b.step(1 / 240);
    const down = (b.pos.x - g.x) * dx + (b.pos.z - g.z) * dz;
    assert(b.mode === 'rest' || b.mode === 'holed', `${L.name}: a putt across the green never stopped (${b.mode})`);
    worst = Math.min(worst, down); steep = Math.max(steep, hl / nrm.y);
    assert(down > 0.05, `${L.name}: a putt across the slope did not break downhill (${down.toFixed(2)} m)`);
  }
  console.log(`  greens: every cross-slope putt broke downhill, the least by ${worst.toFixed(2)} m; steepest centre slope ${(steep * 100).toFixed(1)}%`);
  // the two island greens really are islands: water in most directions just beyond the apron
  for (const n of [2, 16]) {
    const L = holeFor(ci, n), course = new Course(L), g = L.green; let wet = 0, tot = 0;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) { tot++; const c = Math.cos(g.rot), s = Math.sin(g.rot), u = Math.cos(a) * g.rx * 1.75, v = Math.sin(a) * g.rz * 1.75; if (course.surfaceAt(g.x + u * c - v * s, g.z + u * s + v * c).id === SURF.WATER) wet++; }
    assert(wet / tot > 0.9, `${L.name}: only ${wet}/${tot} directions off the green are water`);
  }
});

if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
