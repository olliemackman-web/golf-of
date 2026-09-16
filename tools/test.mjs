// Headless checks that need no browser: `npm test` runs this.
// Each check throws on failure so the exit code is non-zero.
import { Course, holeFor, COURSES, HOLE_COUNT, SURF, splinePoint, splineLength, courseYards } from '../src/courseData.js';
import { CLUBS, shotParams, simulateShot, BALL_R } from '../src/physics.js';
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

check('every course is 18 holes of par 72', () => {
  COURSES.forEach((c, ci) => {
    let par = 0;
    for (let n = 0; n < HOLE_COUNT; n++) {
      const L = holeFor(ci, n);
      assert([3, 4, 5].includes(L.par), `${c.name} hole ${n + 1} par ${L.par}`);
      assert(L.yards > 90 && L.yards < 650, `${c.name} hole ${n + 1} yards ${L.yards}`);
      par += L.par;
    }
    assert(par === 72, `${c.name} par ${par}`);
    assert(courseYards(ci) > 5000, `${c.name} yardage ${courseYards(ci)}`);
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

check('every Starfall hole is doable: a route with margin reaches the green in par + 1', () => {
  const ci = COURSES.findIndex((c) => c.id === 'starfall');
  assert(ci >= 0, 'no Starfall course');
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
      const targets = [L.pin, ...L.space.islands.filter((I) => Math.hypot(I.x - pos.x, I.z - pos.z) > 25)];
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
      assert(pick, `${L.name}: no safe shot from ${dPin.toFixed(0)}m out after ${legs} leg(s) (${cands.length} landings, none with margin)`);
      route.push(`${pick.club.id}@${Math.round(pick.pw * 100)}%${pick.onGreen ? ' green' : ` ${Math.round(pick.left)}m left`}`);
      pos = { x: pick.end.x, z: pick.end.z }; legs++;
    }
    const line = `  ${String(n + 1).padStart(2)} ${L.name.padEnd(16)} par ${L.par} ${String(L.yards).padStart(3)}y: ${route.join(' → ')}`;
    console.log(line); report.push(line);
    assert(home(pos), `${L.name}: not home after ${legs} legs (${route.join(', ')})`);
  }
  void flat;
});

if (failures.length) { console.log(`\n${failures.length} check(s) failed`); process.exit(1); }
console.log('\nall checks passed');
