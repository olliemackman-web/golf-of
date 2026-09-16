// Course data: 18 generated hole layouts, the heightmap and the surface mask
// for whichever hole is being played. No three.js here so the same code runs
// in node for calibration.
import { fbm, smoothstep, clamp, lerp, mulberry32 } from './noise.js';

export const SURF = { ROUGH: 0, FAIRWAY: 1, GREEN: 2, SAND: 3, WATER: 4, TEE: 5 };
export const SURF_NAME = ['Rough', 'Fairway', 'Green', 'Bunker', 'Water', 'Tee'];
export const HOLE_COUNT = 18;
export const COURSE_NAME = 'Riverbend';

// Par sequence: front 36, back 36 — 4 par threes, 10 fours, 4 fives.
const PARS = [4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 5, 3, 4, 4, 3, 4, 5, 4];

// ---- Gosfield Lake: transcribed from the club's hole diagrams (white tees) ----
// bend: degrees, + = dogleg LEFT, at = fraction along the hole where it starts.
// bunkers: fairway {at, side:'L'|'R'} or greenside {green:'L'|'R'|'F'|'B'|'FL'|'FR'}.
// pond: {at, side:'L'|'R'|'C' (carry over it), rx, rz}.
const GOSFIELD = [
  { name: "Gosfield Hall", par: 5, yards: 514, bend: { at: 0.7, deg: -6 }, halfWidth: 19,
    bunkers: [{ at: 0.52, side: 'R', rx: 9, rz: 4.5 }, { green: 'FL', rx: 7.5, rz: 3.6, far: 1 }, { green: 'R', rx: 5.5, rz: 3.5 }],
    green: { rx: 16, rz: 13 },
    // Transcribed from the drone flyover: open parkland, boundary hedge + fence down the left with
    // fields beyond, big specimen oaks, cedars by the green on the right, lake and reeds behind-right.
    scenery: {
      style: 'parkland', tufts: 0.2,
      hedge: { side: 'L', from: 0.02, to: 1.02, off: 31 },
      trees: [
        { at: 0.07, off: 23, kind: 'oak', h: 17 },       // big oak left, just past the tee
        { at: 0.3, off: 40, kind: 'oak', h: 14 }, { at: 0.55, off: 36, kind: 'pine', h: 13 }, { at: 0.72, off: 35, kind: 'oak', h: 15 },
        { at: 0.86, off: 34, kind: 'willow', h: 11 }, { at: 0.93, off: 38, kind: 'willow', h: 10 },
        { at: 0.41, off: -27, kind: 'oak', h: 18 },      // the big oak on the right at ~210 yds
        { at: 0.5, off: -40, kind: 'oak', h: 12 }, { at: 0.58, off: -33, kind: 'cedar', h: 15 }, { at: 0.6, off: -44, kind: 'oak', h: 13 },
        { at: 0.64, off: -30, kind: 'pine', h: 9 }, { at: 0.8, off: -38, kind: 'oak', h: 14 },
        { at: 0.9, off: -28, kind: 'cedar', h: 21 },     // tall cedar short-right of the green
        { at: 0.97, off: -36, kind: 'oak', h: 12 }, { at: 1.03, off: -24, kind: 'oak', h: 11 },
        { at: 1.06, off: -6, kind: 'oak', h: 13 }, { at: 1.08, off: 10, kind: 'oak', h: 15 }, { at: 1.1, off: -18, kind: 'cedar', h: 17 },
        { at: 1.09, off: 24, kind: 'willow', h: 11 }, { at: 1.12, off: 2, kind: 'oak', h: 16 },
      ],
      lake: { at: 1.1, off: -38, rx: 26, rz: 16 },       // behind the green, right — reeds along it
      woodland: { beyond: 120, behindGreen: 1.14 },       // dense trees only far out and past the green
    } },
  { name: 'Boat House', par: 3, yards: 174, halfWidth: 21, fairwayFromTee: true,
    // Drone footage: a wide mown fan from the tee, the reedy lake down the left behind a line of
    // oaks, a big double oak short-left of the green, three bunkers ~20 yds short, woods behind.
    bunkers: [{ at: 0.86, off: 7, rx: 4.5, rz: 3 }, { at: 0.89, off: 0, rx: 5, rz: 3.2 }, { at: 0.9, off: -13, rx: 5.5, rz: 3.4 }],
    green: { rx: 14, rz: 13 },
    scenery: {
      style: 'parkland', tufts: 0.35,
      lake: { at: 0.42, off: 50, rx: 24, rz: 58 },
      trees: [
        { at: 0.06, off: 24, kind: 'oak', h: 12 }, { at: 0.16, off: 27, kind: 'willow', h: 10 }, { at: 0.28, off: 24, kind: 'oak', h: 11 },
        { at: 0.4, off: 26, kind: 'oak', h: 13 }, { at: 0.52, off: 28, kind: 'willow', h: 11 }, { at: 0.63, off: 25, kind: 'oak', h: 14 },
        { at: 0.78, off: 21, kind: 'oak', h: 17 }, { at: 0.81, off: 18, kind: 'oak', h: 14 },   // the double oak short-left of the green
        { at: 0.75, off: -34, kind: 'oak', h: 10 }, { at: 0.94, off: -24, kind: 'oak', h: 11 }, { at: 1.05, off: -30, kind: 'oak', h: 9 },
        { at: 1.06, off: 14, kind: 'oak', h: 15 }, { at: 1.08, off: -4, kind: 'oak', h: 16 }, { at: 1.1, off: 28, kind: 'willow', h: 12 }, { at: 1.12, off: 6, kind: 'oak', h: 14 },
      ],
      woodland: { beyond: 62, beyondR: 150, behindGreen: 1.1 },
    } },
  { name: 'Lake Lookout', par: 4, yards: 370, bend: { at: 0.62, deg: 20 }, halfWidth: 18,
    // Drone footage: thicket down the left to the big oak at 200, open right with oaks and a poplar
    // row, the fairway climbs to a crest, then the reedy lake sits short-left of the green.
    pond: { at: 0.8, off: 15, rx: 15, rz: 24 },
    bunkers: [{ green: 'R', rx: 6.5, rz: 4 }],
    green: { rx: 14, rz: 12 },
    scenery: {
      style: 'parkland', tufts: 0.3,
      hedge: { side: 'L', from: 0.0, to: 0.5, off: 22, thick: true },
      trees: [
        { at: 0.1, off: -25, kind: 'oak', h: 18 }, { at: 0.34, off: -40, kind: 'oak', h: 12 },
        { at: 0.5, off: -31, kind: 'poplar', h: 17 }, { at: 0.54, off: -35, kind: 'poplar', h: 18 }, { at: 0.58, off: -31, kind: 'poplar', h: 16 }, { at: 0.56, off: -44, kind: 'oak', h: 12 },
        { at: 0.55, off: 24, kind: 'oak', h: 19 },        // the big tree left at 201
        { at: 0.64, off: 31, kind: 'oak', h: 13 }, { at: 0.7, off: 40, kind: 'willow', h: 11 },
        { at: 0.72, off: -28, kind: 'oak', h: 11 }, { at: 0.9, off: -26, kind: 'oak', h: 13 },
        { at: 1.04, off: -12, kind: 'oak', h: 12 }, { at: 1.05, off: 26, kind: 'oak', h: 11 }, { at: 1.1, off: -32, kind: 'poplar', h: 17 },
        { at: 1.13, off: 8, kind: 'oak', h: 14 }, { at: 1.16, off: -20, kind: 'oak', h: 13 },
      ],
      woodland: { beyondL: 30, leftTo: 0.52, beyond: 150, behindGreen: 1.3 },
    } },
  { name: 'Cottage Park', par: 5, yards: 539, bend: { at: 0.55, deg: 18 }, bunkers: [] },
  { name: 'Lake Wood', par: 3, yards: 187, pond: { at: 0.28, side: 'C', rx: 24, rz: 17 }, bunkers: [{ green: 'FR', rx: 5, rz: 4 }] },
  { name: 'Pimlico', par: 5, yards: 534, bunkers: [{ at: 0.44, side: 'L', rx: 8, rz: 5 }, { at: 0.58, side: 'L', rx: 8, rz: 5 }, { green: 'B', rx: 6, rz: 4.5 }] },
  { name: 'Swan Lake', par: 4, yards: 360, bend: { at: 0.66, deg: 12 }, pond: { at: 0.37, side: 'L', rx: 20, rz: 28 }, bunkers: [], green: { rx: 11, rz: 17, narrow: true } },
  { name: 'Roman Crossing', par: 3, yards: 161, bunkers: [{ green: 'FR', rx: 6, rz: 4.5 }, { green: 'R', rx: 5, rz: 4 }] },
  { name: "Rowe's Clock Tower", par: 4, yards: 365, bend: { at: 0.62, deg: -22 }, bunkers: [{ green: 'L', rx: 6.5, rz: 4.5 }] },
  { name: "Commander's View", par: 4, yards: 395, bend: { at: 0.5, deg: -30 }, pond: { at: 0.5, side: 'L', rx: 24, rz: 30 }, bunkers: [{ green: 'R', rx: 6, rz: 4.5 }, { green: 'FR', rx: 5.5, rz: 4 }] },
  { name: "Bridie's Fall", par: 5, yards: 486, bend: { at: 0.5, deg: 10 }, bunkers: [{ at: 0.42, side: 'L', rx: 8, rz: 5 }, { at: 0.5, side: 'R', rx: 8, rz: 5 }, { green: 'FL', rx: 6, rz: 4.5 }, { green: 'FR', rx: 6, rz: 4.5 }], green: { rx: 10, rz: 18, narrow: true } },
  { name: 'Edmondsey', par: 4, yards: 409, bunkers: [{ at: 0.47, side: 'L', rx: 7, rz: 4.5 }, { at: 0.53, side: 'L', rx: 7, rz: 4.5 }] },
  { name: 'Bounces', par: 4, yards: 330, bunkers: [{ at: 0.56, side: 'L', rx: 8, rz: 5 }, { at: 0.63, side: 'R', rx: 8, rz: 5 }, { green: 'R', rx: 6, rz: 4.5 }, { green: 'FR', rx: 5.5, rz: 4 }], green: { rx: 17, rz: 15 } },
  { name: "Cotton's Choice", par: 4, yards: 432, pond: { at: 0.88, side: 'R', rx: 15, rz: 17 }, bunkers: [{ at: 0.46, side: 'R', rx: 8, rz: 5 }] },
  { name: 'Pheasant Flight', par: 3, yards: 187, bunkers: [{ green: 'F', rx: 11, rz: 6, far: 4 }] },
  { name: "Brake's Wood", par: 4, yards: 378, halfWidth: 13, bunkers: [{ green: 'R', rx: 5, rz: 4 }] },
  { name: "O'Shea's Cottage", par: 3, yards: 157, bunkers: [{ green: 'L', rx: 6, rz: 4.5 }, { green: 'R', rx: 6, rz: 4.5 }] },
  { name: 'Paddock Pond', par: 5, yards: 536, bend: { at: 0.7, deg: -12 }, pond: { at: 0.6, side: 'C', rx: 22, rz: 24 }, bunkers: [{ at: 0.44, side: 'L', rx: 9, rz: 5.5 }], green: { rx: 18, rz: 15 } },
];

// ---- Starfall: turf islands floating in space ----
// Every hole is a chain of islands with nothing but void between them. `islands` are fairway
// pads: `at` is metres from the tee along the line, `off` metres left (+) or right (-) of it,
// rx across / rz along in metres. The tee pad and the green (with a 3 m apron) are islands too.
// Greens are small. Anything that leaves an island is lost and replayed with a penalty.
// Full carries in metres for reference (flat lie, no spin): DR 207 (+25 roll), 3W 196 (+21),
// 4H 180 (+19), 5I 169 (+17), 7I 151 (+12), 9I 127 (+8), PW 111 (+5), SW 81 (+3). The tee pad sits
// a metre or two above the islands, which adds a few metres. A driver island is centred at 222.
const SPACE = [
  { name: 'Launch Pad', par: 4, yards: 340, green: { rx: 9.5, rz: 8.5 },
    islands: [{ at: 222, rx: 16, rz: 26 }], craters: [{ island: 0, dx: 9, dz: 6, rx: 3.5, rz: 2.5 }] },
  { name: 'Low Orbit', par: 3, yards: 150, green: { rx: 9, rz: 8 },
    islands: [{ at: 108, off: -13, rx: 8, rz: 9 }] },
  { name: 'Kuiper Belt', par: 5, yards: 520, green: { rx: 9, rz: 8.5 }, bend: { at: 0.55, deg: 12 },
    islands: [{ at: 150, rx: 12, rz: 14 }, { at: 222, rx: 15, rz: 26 }, { at: 350, rx: 13, rz: 22 }], craters: [{ island: 1, dx: -8, dz: -8, rx: 4, rz: 3 }] },
  { name: 'Solar Wind', par: 4, yards: 380, green: { rx: 9, rz: 8 }, bend: { at: 0.5, deg: -20 },
    islands: [{ at: 224, off: -6, rx: 14, rz: 26 }] },
  { name: 'Debris Field', par: 3, yards: 185, green: { rx: 10, rz: 9 },
    islands: [{ at: 138, off: 10, rx: 9, rz: 10 }] },
  { name: 'Dark Side', par: 4, yards: 410, green: { rx: 10, rz: 9 },
    islands: [{ at: 222, rx: 14, rz: 26 }] },
  { name: 'Perihelion', par: 5, yards: 545, green: { rx: 9.5, rz: 8.5 }, bend: { at: 0.45, deg: 16 },
    islands: [{ at: 130, rx: 11, rz: 13 }, { at: 222, rx: 14, rz: 26 }, { at: 370, rx: 12, rz: 22 }] },
  { name: 'Lagrange Point', par: 5, yards: 480, green: { rx: 9, rz: 8 },
    islands: [{ at: 222, rx: 14, rz: 24 }, { at: 320, off: 8, rx: 12, rz: 18 }, { at: 390, off: -7, rx: 8, rz: 9 }], craters: [{ island: 0, dx: 0, dz: 10, rx: 4, rz: 3 }] },
  { name: 'Red Shift', par: 3, yards: 210, green: { rx: 10, rz: 9 },
    islands: [{ at: 160, off: 11, rx: 10, rz: 16 }] },
  { name: 'Escape Velocity', par: 4, yards: 355, green: { rx: 9, rz: 8 },
    islands: [{ at: 205, off: 6, rx: 15, rz: 22 }], craters: [{ island: 0, dx: -9, dz: 0, rx: 3.5, rz: 3 }] },
  { name: 'The Void', par: 5, yards: 560, green: { rx: 9, rz: 8.5 }, bend: { at: 0.6, deg: -14 },
    islands: [{ at: 222, rx: 13, rz: 26 }, { at: 340, off: -10, rx: 12, rz: 24 }, { at: 430, off: 6, rx: 11, rz: 18 }] },
  { name: 'Ion Trail', par: 3, yards: 135, green: { rx: 7.5, rz: 7 }, islands: [] },
  { name: 'Asteroid Alley', par: 4, yards: 395, green: { rx: 9, rz: 8 },
    islands: [{ at: 222, rx: 11, rz: 30 }] },
  { name: 'Zero G', par: 4, yards: 330, green: { rx: 9.5, rz: 8.5 },
    islands: [{ at: 172, rx: 14, rz: 18 }, { at: 232, off: -10, rx: 9, rz: 12 }] },
  { name: 'Supernova', par: 3, yards: 165, green: { rx: 9, rz: 8 },
    islands: [{ at: 176, off: 14, rx: 9, rz: 9 }] },
  { name: 'Wormhole', par: 4, yards: 425, green: { rx: 9, rz: 8.5 }, bend: { at: 0.5, deg: 25 },
    islands: [{ at: 222, off: 6, rx: 14, rz: 26 }, { at: 290, off: 14, rx: 10, rz: 14 }] },
  { name: 'Event Horizon', par: 5, yards: 500, green: { rx: 9.5, rz: 8.5 },
    islands: [{ at: 222, rx: 14, rz: 24 }, { at: 330, rx: 13, rz: 20 }], craters: [{ island: 0, dx: 6, dz: -6, rx: 5, rz: 3.5 }] },
  { name: 'Splashdown', par: 4, yards: 365, green: { rx: 9, rz: 9 },
    islands: [{ at: 222, rx: 13, rz: 24 }] },
];

export const COURSES = [
  { id: 'riverbend', name: 'Riverbend', par: 72, blurb: 'Generated parkland — doglegs, ponds and deep bunkers.', hole: (n) => makeHole(n) },
  { id: 'gosfield', name: 'Gosfield Lake', par: 72, blurb: 'The real Essex 18, hole by hole: Gosfield Hall to Paddock Pond.', hole: (n) => makeHoleFromSpec(GOSFIELD[n], n) },
  { id: 'starfall', name: 'Starfall', par: 72, blurb: 'Turf islands adrift in deep space. Tiny greens, fairways you have to carry to, and nothing but void between. Hard.', hole: (n) => makeSpaceHole(SPACE[n], n) },
];

/** Build a Starfall hole: the usual spline and green, then the island shapes hung off it. */
export function makeSpaceHole(spec, n) {
  const L = makeHoleFromSpec({ ...spec, bunkers: [], halfWidth: 14 }, n);
  L.name = spec.name; L.seed = 90 + n;
  const rnd = mulberry32(7700 + n * 613);
  const g = L.green;
  const shapes = [];
  // tee pad
  shapes.push({ x: L.tee.x, z: L.tee.z, rx: L.tee.w / 2 + 4.5, rz: L.tee.l / 2 + 5, rot: 0, h: 3.0, dish: 0.1, kind: 'tee' });
  // fairway islands, each at its own height with a shallow dish so balls drift back toward the middle
  const islands = [];
  for (const s of spec.islands || []) {
    const p = alongHole(L, (s.at - 14) / L.len, s.off || 0);
    const I = { x: p.x, z: p.z, rx: s.rx, rz: s.rz, rot: p.dir, h: 1.2 + (rnd() - 0.5) * 2.4, dish: 0.35, kind: 'fairway' };
    islands.push(I); shapes.push(I);
  }
  // green island: the green plus a 6 m fairway apron, dished like a shallow gravity well so a ball
  // that lands on it tends to gather toward the middle rather than run off the back
  shapes.push({ x: g.x, z: g.z, rx: g.rx + 6, rz: g.rz + 6, rot: g.rot, h: 1.8 + (rnd() - 0.5) * 1.6, dish: 0.45, kind: 'green' });
  // craters: bunkers set into the islands
  L.bunkers = [];
  for (const c of spec.craters || []) {
    const I = islands[c.island]; if (!I) continue;
    const cs = Math.cos(I.rot), sn = Math.sin(I.rot);
    L.bunkers.push({ x: I.x + c.dx * cs - c.dz * sn, z: I.z + c.dx * sn + c.dz * cs, rx: c.rx, rz: c.rz, rot: I.rot });
  }
  L.space = { shapes, islands, voidLevel: -14, floor: -70 };
  L.pond = null; L.ponds = [];
  return L;
}
export function holeFor(courseIndex, n) { const c = COURSES[courseIndex] || COURSES[0]; const L = c.hole(n); L.courseId = c.id; L.courseName = c.name; L.courseIndex = COURSES.indexOf(c); return L; }
export function courseYards(courseIndex) { let t = 0; for (let i = 0; i < HOLE_COUNT; i++) t += holeFor(courseIndex, i).yards; return t; }

/** Build a hole layout from a hand-written spec (same shape as makeHole's output). */
export function makeHoleFromSpec(spec, n) {
  const rnd = mulberry32(5100 + n * 331);
  const par = spec.par;
  const len = spec.yards * 0.9144 - 20; // tee box and pin offset make up the rest
  const bendAt = spec.bend ? spec.bend.at : 0.6, bendAngle = spec.bend ? spec.bend.deg * Math.PI / 180 : 0;
  const N = 9, ds = len / (N - 1);
  const pts = []; let x = 0, z = -len / 2;
  for (let i = 0; i < N; i++) {
    pts.push([x, z]);
    const s = (i + 0.5) / (N - 1);
    const heading = bendAngle * smoothstep(bendAt, bendAt + 0.28, s);
    x += Math.sin(heading) * ds; z += Math.cos(heading) * ds;
  }
  const last = pts[N - 1], prev = pts[N - 2];
  const endDir = Math.atan2(last[0] - prev[0], last[1] - prev[1]);
  const gs = spec.green || {};
  const green = { x: last[0] + Math.sin(endDir) * 6, z: last[1] + Math.cos(endDir) * 6, rx: gs.rx || 14, rz: gs.rz || 12, rot: endDir + Math.PI / 2 + (gs.narrow ? 0 : (rnd() - 0.5) * 0.4) };
  const pa = rnd() * Math.PI * 2, pr = rnd() * 4;
  const pin = { x: green.x + Math.cos(pa) * pr, z: green.z + Math.sin(pa) * pr };
  const tee = { x: pts[0][0], z: pts[0][1] - 14, w: 9, l: 14 };
  const halfWidth = spec.halfWidth || (par === 3 ? 14 : 16);
  const sideOf = (t, off) => {
    const i = clamp(Math.round(t * (N - 1)), 1, N - 2);
    const dx = pts[i + 1][0] - pts[i - 1][0], dz = pts[i + 1][1] - pts[i - 1][1], l = Math.hypot(dx, dz);
    const rx = dz / l, rz = -dx / l; // + = left of the line
    const u = t * (N - 1) - i; const bx = pts[i][0] + (pts[Math.min(N - 1, i + 1)][0] - pts[i][0]) * Math.max(0, u), bz = pts[i][1] + (pts[Math.min(N - 1, i + 1)][1] - pts[i][1]) * Math.max(0, u);
    return { x: bx + rx * off, z: bz + rz * off, rot: Math.atan2(dx, dz) };
  };
  const bunkers = [];
  const GA = { F: Math.PI, B: 0, L: Math.PI / 2, R: -Math.PI / 2, FL: 3 * Math.PI / 4, FR: -3 * Math.PI / 4 };
  for (const b of spec.bunkers || []) {
    if (b.green) {
      const a = endDir + GA[b.green];
      const r = Math.max(green.rx, green.rz) + 5 + (b.far || 0) + (b.green === 'F' ? 2 : 0);
      bunkers.push({ x: green.x + Math.sin(a) * r, z: green.z + Math.cos(a) * r, rx: b.rx || 6, rz: b.rz || 4.5, rot: a + Math.PI / 2 });
    } else {
      const p = sideOf(b.at, b.off != null ? b.off : (b.side === 'L' ? 1 : -1) * (halfWidth + 3));
      bunkers.push({ x: p.x, z: p.z, rx: b.rx || 8, rz: b.rz || 5, rot: p.rot });
    }
  }
  let pond = null;
  if (spec.pond) {
    const q = spec.pond;
    const off = q.off != null ? q.off : q.side === 'C' ? 0 : (q.side === 'L' ? 1 : -1) * (halfWidth + q.rx * 0.75);
    const p = sideOf(q.at, off);
    pond = { x: p.x, z: p.z, rx: q.rx, rz: q.rz, rot: p.rot + (q.side === 'C' ? Math.PI / 2 : 0) };
  }
  const size = Math.max(520, Math.ceil((len + 200) / 20) * 20);
  const L = { index: n, number: n + 1, name: spec.name, par, len, size, res: 512, maskRes: 1024, spline: pts, halfWidth, tee, green, pin, bunkers, pond, seed: 40 + n, yards: spec.yards, bendAngle, carry: spec.pond && spec.pond.side === 'C', scenery: spec.scenery || null, fairwayFromTee: !!spec.fairwayFromTee };
  if (spec.scenery && spec.scenery.lake) {
    const q = spec.scenery.lake; const p = alongHole(L, q.at, q.off);
    const lake = { x: p.x, z: p.z, rx: q.rx, rz: q.rz, rot: p.dir, seed: 7 };
    lake.level = terrainHeightBase(L, lake.x, lake.z) - 0.6;
    L.ponds = pond ? [pond, lake] : [lake];
  }
  return L;
}

/** Deterministically design hole `n` (0-based). All distances in metres. */
export function makeHole(n) {
  const rnd = mulberry32(9100 + n * 7919);
  const par = PARS[n];
  const len = par === 3 ? 125 + rnd() * 70 : par === 4 ? 300 + rnd() * 90 : 430 + rnd() * 80;
  // dogleg: none on par 3s, otherwise a bend part way along
  let bendAt = 0.58 + rnd() * 0.1, bendAngle = 0;
  if (par === 4) bendAngle = (rnd() < 0.5 ? -1 : 1) * (12 + rnd() * 26) * Math.PI / 180;
  if (par === 5) bendAngle = (rnd() < 0.5 ? -1 : 1) * (18 + rnd() * 22) * Math.PI / 180;
  if (par === 4 && rnd() < 0.3) bendAngle *= 0.35; // some near-straight fours
  if (par === 5) bendAt = 0.42 + rnd() * 0.12;
  const N = 9, ds = len / (N - 1);
  const pts = []; let x = 0, z = -len / 2, heading = 0;
  for (let i = 0; i < N; i++) {
    pts.push([x, z]);
    const s = (i + 0.5) / (N - 1);
    const turn = bendAngle * smoothstep(bendAt, bendAt + 0.28, s);
    heading = turn;
    x += Math.sin(heading) * ds; z += Math.cos(heading) * ds;
  }
  const last = pts[N - 1], prev = pts[N - 2];
  const endDir = Math.atan2(last[0] - prev[0], last[1] - prev[1]);
  const green = { x: last[0] + Math.sin(endDir) * 6, z: last[1] + Math.cos(endDir) * 6, rx: 13 + rnd() * 4, rz: 11 + rnd() * 3, rot: endDir + Math.PI / 2 + (rnd() - 0.5) * 0.6 };
  const pa = rnd() * Math.PI * 2, pr = rnd() * 4.5;
  const pin = { x: green.x + Math.cos(pa) * pr, z: green.z + Math.sin(pa) * pr };
  const tee = { x: pts[0][0], z: pts[0][1] - 14, w: 9, l: 14 };
  const halfWidth = par === 3 ? 14 : 15 + rnd() * 4;
  const side = (i) => (pts[Math.min(N - 1, i + 1)][0] - pts[Math.max(0, i - 1)][0]) ? null : null;
  // bunkers
  const bunkers = [];
  const sideOf = (t, off) => { // point at fraction t of the hole, offset sideways
    const i = clamp(Math.round(t * (N - 1)), 1, N - 2);
    const dx = pts[i + 1][0] - pts[i - 1][0], dz = pts[i + 1][1] - pts[i - 1][1], l = Math.hypot(dx, dz);
    const rx = dz / l, rz = -dx / l; // right-hand normal
    return { x: pts[i][0] + rx * off, z: pts[i][1] + rz * off, rot: Math.atan2(dx, dz) };
  };
  if (par > 3) {
    const inside = bendAngle > 0 ? 1 : -1; // inside of the dogleg (positive angle bends toward +x)
    const b = sideOf(bendAt + 0.06, -inside * (halfWidth + 3));
    bunkers.push({ x: b.x, z: b.z, rx: 9 + rnd() * 3, rz: 5.5 + rnd(), rot: b.rot + 0.3 * inside });
    if (rnd() < 0.6) { const c = sideOf(0.4 + rnd() * 0.1, inside * (halfWidth + 5)); bunkers.push({ x: c.x, z: c.z, rx: 7 + rnd() * 3, rz: 4.5 + rnd(), rot: c.rot - 0.2 }); }
  }
  const gb = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < gb; i++) {
    const a = endDir + Math.PI + (i - (gb - 1) / 2) * 1.5 + (rnd() - 0.5) * 0.5; // around the front/sides
    const r = Math.max(green.rx, green.rz) + 6 + rnd() * 3;
    bunkers.push({ x: green.x + Math.sin(a) * r, z: green.z + Math.cos(a) * r, rx: 6 + rnd() * 2.5, rz: 4.5 + rnd() * 1.5, rot: a + Math.PI / 2 });
  }
  // water on some holes
  let pond = null;
  const wantWater = n === 0 || rnd() < 0.45;
  if (wantWater) {
    if (par === 3) { const rx = 20 + rnd() * 8, sgn = rnd() < 0.5 ? -1 : 1; const p = sideOf(0.55, sgn * (halfWidth + rx + 2)); pond = { x: p.x, z: p.z, rx, rz: 30 + rnd() * 10, rot: p.rot }; }
    else { const s = bendAngle > 0 ? -1 : 1; const p = sideOf(0.22 + rnd() * 0.18, s * (halfWidth + 30)); pond = { x: p.x, z: p.z, rx: 28 + rnd() * 8, rz: 40 + rnd() * 10, rot: p.rot + (rnd() - 0.5) * 0.4 }; }
  }
  const size = Math.max(520, Math.ceil((len + 200) / 20) * 20);
  const yards = Math.hypot(pin.x - tee.x, pin.z - tee.z) * 1.09361;
  return { index: n, number: n + 1, par, len, size, res: 512, maskRes: 1024, spline: pts, halfWidth, tee, green, pin, bunkers, pond, seed: n + 1, yards: Math.round(yards), bendAngle };
}

// ---- geometry helpers --------------------------------------------------
function polyline(L) {
  if (L._poly) return L._poly;
  const pts = L.spline;
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let s = 0; s < 8; s++) {
      const t = s / 8, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z = 0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, z]);
    }
  }
  out.push(pts[pts.length - 1].slice());
  let len = 0; const cum = [0];
  for (let i = 1; i < out.length; i++) { len += Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]); cum.push(len); }
  L._poly = { pts: out, cum, len };
  return L._poly;
}

/** Distance to the fairway centre line, and normalised position t along it. */
export function splineDist(L, x, z) {
  const { pts, cum, len } = polyline(L);
  let best = Infinity, bt = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let u = ((x - ax) * dx + (z - az) * dz) / l2; u = clamp(u, 0, 1);
    const px = ax + dx * u, pz = az + dz * u;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best) { best = d; bt = (cum[i] + (cum[i + 1] - cum[i]) * u) / len; }
  }
  return { d: Math.sqrt(best), t: bt };
}

/** Point on the centre line at arc-length `s` metres from the tee end. */
export function splinePoint(L, s) {
  const { pts, cum, len } = polyline(L);
  const target = clamp(s, 0, len);
  for (let i = 1; i < pts.length; i++) if (cum[i] >= target) { const u = (target - cum[i - 1]) / (cum[i] - cum[i - 1] || 1); return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, z: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u, len }; }
  return { x: pts[pts.length - 1][0], z: pts[pts.length - 1][1], len };
}
export function splineLength(L) { return polyline(L).len; }
/** Point at fraction t along the hole plus its left-hand unit normal (off > 0 = left of the line). */
export function alongHole(L, t, off = 0) {
  const { pts, cum, len } = polyline(L);
  const target = clamp(t, 0, 1.4) * len;
  let i = pts.length - 2;
  for (let k = 1; k < pts.length; k++) if (cum[k] >= target) { i = k - 1; break; }
  const a = pts[i], b = pts[i + 1];
  const segLen = cum[i + 1] - cum[i] || 1;
  const u = (target - cum[i]) / segLen; // may exceed 1 past the green: extrapolate along the last segment
  let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
  const x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u;
  return { x: x + dz * off, z: z - dx * off, dir: Math.atan2(dx, dz) };
}

/** Normalised elliptical distance (1 = on the edge). */
export function ellipseDist(x, z, e) {
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  const dx = x - e.x, dz = z - e.z;
  const u = (dx * c + dz * s) / e.rx, v = (-dx * s + dz * c) / e.rz;
  return Math.sqrt(u * u + v * v);
}

export function ponds(L) { return L.ponds || (L.pond ? [L.pond] : []); }
function pondDistOne(q, x, z) {
  const n = fbm(x / 23 + 3.1 + (q.seed || 0), z / 23 - 1.7, 3, 2, 0.5);
  return ellipseDist(x, z, q) + n * 0.22;
}
/** Nearest pond: normalised distance and the pond itself. */
export function pondDist(L, x, z) {
  let best = 9, which = null;
  for (const q of ponds(L)) { const d = pondDistOne(q, x, z); if (d < best) { best = d; which = q; } }
  return best;
}
export function nearestPond(L, x, z) {
  let best = 9, which = null;
  for (const q of ponds(L)) { const d = pondDistOne(q, x, z); if (d < best) { best = d; which = q; } }
  return { d: best, pond: which };
}

// Height of the fairway centre line by normalised t: tee slightly elevated,
// a dip through the landing area, rising to the green.
function profile(L, t) {
  const k = L.seed;
  return 2.6 * (1 - t) - (1.0 + 0.8 * Math.sin(k * 1.7)) * Math.sin(Math.PI * t) + 1.6 * smoothstep(0.7, 1, t) + Math.sin(t * 6 + k) * 0.5;
}

/** Water level of a pond: a little below the ground it sits in. */
export function pondLevel(L, q) {
  if (q._wl == null) q._wl = (q.level != null ? q.level : profile(L, clamp(splineDist(L, q.x, q.z).t, 0, 1)) - 1.15);
  return q._wl;
}
export function waterLevel(L) { const ps = ponds(L); return ps.length ? pondLevel(L, ps[0]) : -999; }

/** Terrain height ignoring ponds and bunkers — used to pick a water level for a decorative lake. */
function terrainHeightBase(L, x, z) {
  const ox = L.seed * 131.7, oz = L.seed * 71.3;
  const big = fbm((x + ox) / 210 + 10, (z + oz) / 210 + 4, 4, 2, 0.5) * 6.5;
  const med = fbm((x + ox) / 55 - 3, (z + oz) / 55 + 7, 3, 2, 0.5) * 1.3;
  let h = big + med;
  const { d, t } = splineDist(L, x, z);
  const w = smoothstep(L.halfWidth + 30, L.halfWidth + 3, d);
  h = lerp(h, profile(L, t) + med * 0.35, w);
  const eg = ellipseDist(x, z, L.green);
  h = lerp(h, profile(L, 1) + 0.9, smoothstep(1.7, 1.0, eg));
  return h;
}

/** Starfall: islands at their own heights with sheer sides, the void floor far below. */
function spaceHeight(L, x, z) {
  const n = fbm(x / 11 + 2, z / 11 - 3, 2, 2, 0.5);
  const small = fbm(x / 7 + 1, z / 7 - 5, 2, 2, 0.5) * 0.12;
  let mask = 0, hsum = 0, wsum = 0;
  for (const S of L.space.shapes) {
    const e = ellipseDist(x, z, S) + n * 0.05;
    if (e > 1.5) continue;
    const w = smoothstep(1.32, 1.08, e); // flat out through the rim of rough, then the cliff
    const inside = Math.min(1, e);
    const top = S.h - S.dish * (1 - inside * inside) + small;
    mask = Math.max(mask, w); hsum += w * top; wsum += w;
  }
  const top = wsum > 0 ? hsum / wsum : 0;
  let h = lerp(L.space.floor, top, mask);
  if (mask > 0.5) for (const b of L.bunkers) {
    const e = ellipseDist(x, z, b) + fbm(x / 6, z / 6, 2) * 0.08;
    h -= smoothstep(1.15, 0.75, e) * 0.7;
  }
  return h;
}

/** Starfall surfaces: fairway on the islands, a rim of rough at the cliff edge, void beyond. */
function spaceWeights(L, x, z) {
  const n = fbm(x / 11 + 2, z / 11 - 3, 2, 2, 0.5);
  let fairway = 0, island = 0;
  for (const S of L.space.shapes) {
    const e = ellipseDist(x, z, S) + n * 0.05;
    if (e > 1.3) continue;
    fairway = Math.max(fairway, smoothstep(1.0, 0.94, e));
    island = Math.max(island, smoothstep(1.12, 1.06, e));
  }
  const eg = ellipseDist(x, z, L.green) + n * 0.03;
  const green = smoothstep(1.04, 0.97, eg);
  const tdx = Math.abs(x - L.tee.x) / (L.tee.w / 2), tdz = Math.abs(z - L.tee.z) / (L.tee.l / 2);
  const tee = smoothstep(1.06, 0.98, Math.max(tdx, tdz));
  let sand = 0;
  for (const b of L.bunkers) { const e = ellipseDist(x, z, b) + fbm(x / 6, z / 6, 2) * 0.08; sand = Math.max(sand, smoothstep(1.02, 0.94, e)); }
  return { fairway, green, sand, water: 1 - island, tee };
}

/** The terrain height function everything is sampled from. */
export function terrainHeight(L, x, z) {
  if (L.space) return spaceHeight(L, x, z);
  const ox = L.seed * 131.7, oz = L.seed * 71.3;
  const big = fbm((x + ox) / 210 + 10, (z + oz) / 210 + 4, 4, 2, 0.5) * 6.5;
  const med = fbm((x + ox) / 55 - 3, (z + oz) / 55 + 7, 3, 2, 0.5) * 1.3;
  const small = fbm(x / 9 + 1, z / 9 - 5, 2, 2, 0.5) * 0.14;
  let h = big + med + small;

  const { d, t } = splineDist(L, x, z);
  const corridor = profile(L, t) + med * 0.35 + small;
  const w = smoothstep(L.halfWidth + 30, L.halfWidth + 3, d);
  h = lerp(h, corridor, w);

  const eg = ellipseDist(x, z, L.green);
  const hg = profile(L, 1) + 0.9 + (x - L.green.x) * 0.012 - (z - L.green.z) * 0.008 + fbm(x / 7, z / 7, 2) * 0.06;
  h = lerp(h, hg, smoothstep(1.7, 1.0, eg));

  const tdx = x - L.tee.x, tdz = z - L.tee.z;
  const tw = smoothstep(1.35, 1.0, Math.max(Math.abs(tdx) / (L.tee.w / 2), Math.abs(tdz) / (L.tee.l / 2)));
  h = lerp(h, profile(L, 0) + 0.35, tw);

  for (const b of L.bunkers) {
    const e = ellipseDist(x, z, b) + fbm(x / 6, z / 6, 2) * 0.08;
    const inside = smoothstep(1.15, 0.75, e);
    h -= inside * 0.75;
    h += smoothstep(1.35, 1.1, e) * (1 - smoothstep(1.1, 0.95, e)) * 0.12;
  }

  for (const q of ponds(L)) {
    const pe = pondDistOne(q, x, z);
    if (pe < 1.6) {
      const wl = pondLevel(L, q);
      const inside = smoothstep(1.12, 0.9, pe);
      h = lerp(h, wl - 2.4, inside);
      if (pe > 1.0) h = Math.max(h, wl + 0.25 * smoothstep(1.0, 1.15, pe));
    }
  }
  return h;
}

/** Surface weights [fairway, green, sand, water] in 0..1, plus tee. */
export function surfaceWeights(L, x, z) {
  if (L.space) return spaceWeights(L, x, z);
  const n = fbm(x / 16 + 5, z / 16 - 2, 3, 2, 0.5);
  const { d, t } = splineDist(L, x, z);
  let fairway = smoothstep(L.halfWidth + 3, L.halfWidth - 3, d + n * 6) * smoothstep(0.0, 0.03, t);
  if (L.par === 3 && !L.fairwayFromTee) fairway *= smoothstep(0.15, 0.3, t); // par 3s carry rough before the fairway
  const eg = ellipseDist(x, z, L.green) + n * 0.05;
  const green = smoothstep(1.06, 0.97, eg);
  fairway = Math.max(fairway, smoothstep(1.55, 1.12, eg));
  const tdx = Math.abs(x - L.tee.x) / (L.tee.w / 2), tdz = Math.abs(z - L.tee.z) / (L.tee.l / 2);
  const tee = smoothstep(1.06, 0.98, Math.max(tdx, tdz));
  let sand = 0;
  for (const b of L.bunkers) { const e = ellipseDist(x, z, b) + fbm(x / 6, z / 6, 2) * 0.08; sand = Math.max(sand, smoothstep(1.02, 0.94, e)); }
  const water = ponds(L).length ? smoothstep(1.0, 0.96, pondDist(L, x, z)) : 0;
  return { fairway, green, sand, water, tee };
}

export class Course {
  constructor(layout) {
    const L = this.layout = layout;
    this.size = L.size; this.res = L.res; this.maskRes = L.maskRes;
    // Starfall: anything that drops below the void level is gone (the ball treats it like water)
    this.voidLevel = L.space ? L.space.voidLevel : null;
    this.waterLevel = L.space ? L.space.voidLevel : waterLevel(L);
    this.ponds = ponds(L).map((q) => ({ pond: q, level: pondLevel(L, q) }));
    const N = L.res, half = L.size / 2, step = L.size / (N - 1);
    this.heights = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) this.heights[j * N + i] = terrainHeight(L, -half + i * step, -half + j * step);
    this.step = step;
    const M = L.maskRes, mstep = L.size / M;
    this.mask = new Uint8Array(M * M * 4);
    this.teeMask = new Uint8Array(M * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = -half + (i + 0.5) * mstep, z = -half + (j + 0.5) * mstep;
      const { d } = splineDist(L, x, z);
      const k = (j * M + i) * 4;
      if (L.space) { this.mask[k + 3] = 255; if (d > 90) continue; } // void by default; islands paint over it
      else if (d > 120 && !ponds(L).some((q) => ellipseDist(x, z, q) < 2.5)) continue;
      const s = surfaceWeights(L, x, z);
      const water = s.water, sand = s.sand * (1 - water), green = Math.max(s.green, s.tee) * (1 - water) * (1 - sand);
      const fairway = s.fairway * (1 - water) * (1 - sand) * (1 - green);
      this.mask[k] = fairway * 255; this.mask[k + 1] = green * 255; this.mask[k + 2] = sand * 255; this.mask[k + 3] = water * 255;
      this.teeMask[j * M + i] = s.tee * 255;
    }
  }

  heightAt(x, z) {
    const N = this.res, half = this.size / 2;
    const fx = clamp((x + half) / this.step, 0, N - 1.001), fz = clamp((z + half) / this.step, 0, N - 1.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j, H = this.heights;
    const h00 = H[j * N + i], h10 = H[j * N + i + 1], h01 = H[(j + 1) * N + i], h11 = H[(j + 1) * N + i + 1];
    return (h00 * (1 - u) + h10 * u) * (1 - v) + (h01 * (1 - u) + h11 * u) * v;
  }

  normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const e = 0.5;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    let nx = -dx / (2 * e), ny = 1, nz = -dz / (2 * e);
    const l = Math.hypot(nx, ny, nz); out.x = nx / l; out.y = ny / l; out.z = nz / l; return out;
  }

  surfaceAt(x, z) {
    const M = this.maskRes, half = this.size / 2, mstep = this.size / M;
    const i = clamp(((x + half) / mstep) | 0, 0, M - 1), j = clamp(((z + half) / mstep) | 0, 0, M - 1);
    const k = (j * M + i) * 4, m = this.mask;
    const w = { fairway: m[k] / 255, green: m[k + 1] / 255, sand: m[k + 2] / 255, water: m[k + 3] / 255 };
    const rough = Math.max(0, 1 - w.fairway - w.green - w.sand - w.water);
    let id = SURF.ROUGH, best = rough;
    if (w.fairway > best) { id = SURF.FAIRWAY; best = w.fairway; }
    if (w.green > best) { id = SURF.GREEN; best = w.green; }
    if (w.sand > best) { id = SURF.SAND; best = w.sand; }
    if (w.water > best) { id = SURF.WATER; best = w.water; }
    if (id === SURF.GREEN && this.teeMask[j * M + i] > 128) id = SURF.TEE;
    return { id, w };
  }

  /** Water level of the pond nearest this point (the ball checks it on contact). */
  waterLevelAt(x, z) { if (this.voidLevel != null) return this.voidLevel; let best = 9, lvl = this.waterLevel; for (const p of this.ponds) { const d = ellipseDist(x, z, p.pond); if (d < best) { best = d; lvl = p.level; } } return lvl; }
  inBounds(x, z) { const h = this.size / 2 - 12; return x > -h && x < h && z > -h && z < h; }
}
