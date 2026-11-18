// Course data: 18 generated hole layouts, the heightmap and the surface mask
// for whichever hole is being played. No three.js here so the same code runs
// in node for calibration.
import { fbm, smoothstep, clamp, lerp, mulberry32 } from './noise.js';
import { OLDJOES } from './oldjoesData.js';

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
  { id: 'highland', name: 'Highland Lakes', par: 72, blurb: 'A hill course: climbs and drops, leaning fairways, sloping greens, lochs and two island greens. The ball goes where the ground sends it.', hole: (n) => makeHoleFromSpec({ ...HIGHLAND[n], seed: 300 + n * 7, firm: true }, n) },
  { id: 'oldjoes', name: "Old Joe's", par: 54, blurb: 'The real nine-hole pitch and putt at Great Cornard, Suffolk, laid out from its map and played twice round. Short holes, small greens, nowhere to hide.', credit: 'Map data © OpenStreetMap contributors', hole: (n) => makeMapHole(OLDJOES_COURSE, n) },
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
  if (spec.land) { green.slope = gs.slope || 0; green.dir = (gs.dir || 0) * Math.PI / 180; green.tier = gs.tier || 0; green.fx = Math.sin(endDir); green.fz = Math.cos(endDir); }
  const pa = rnd() * Math.PI * 2, pr = rnd() * 4;
  const pin = { x: green.x + Math.cos(pa) * pr, z: green.z + Math.sin(pa) * pr };
  if (green.tier) { // keep the hole off the step between the two levels
    const along = (pin.x - green.x) * green.fx + (pin.z - green.z) * green.fz;
    if (Math.abs(along) < 3.2) { const push = (along >= 0 ? 3.6 : -3.6) - along; pin.x += green.fx * push; pin.z += green.fz * push; }
  }
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
  const L = { index: n, number: n + 1, name: spec.name, par, len, size, res: 512, maskRes: 1024, spline: pts, halfWidth, tee, green, pin, bunkers, pond, seed: spec.seed || 40 + n, yards: spec.yards, bendAngle, carry: spec.pond && spec.pond.side === 'C', scenery: spec.scenery || null, fairwayFromTee: !!spec.fairwayFromTee };
  if (spec.land) {
    L.land = { rise: 0, dip: 0, tilt: 0, crown: 0, mounds: 0, hills: 1.5, bowl: 0, ...spec.land };
    L.blurb = spec.blurb || ''; L.firm = !!spec.firm; L.islands = [];
    L.ponds = (spec.lakes || []).map((q, i) => {
      const off = q.off != null ? q.off : q.side === 'C' ? 0 : (q.side === 'L' ? 1 : -1) * (halfWidth + q.rx * 0.8);
      const p = alongHole(L, q.at, off);
      return { x: p.x, z: p.z, rx: q.rx, rz: q.rz, rot: p.dir, seed: 3 + i * 5 };
    });
    L.pond = L.ponds[0] || null; L.carry = (spec.lakes || []).some((q) => q.side === 'C');
    if (spec.island === 'green') { L.ponds[0].x = green.x; L.ponds[0].z = green.z; L.islands.push({ x: green.x, z: green.z, rx: green.rx * 1.42, rz: green.rz * 1.42, rot: green.rot, green: true }); L.islandGreen = true; }
    else if (spec.island) { const p = alongHole(L, spec.island.at, spec.island.off || 0); L.islands.push({ x: p.x, z: p.z, rx: spec.island.rx, rz: spec.island.rz, rot: p.dir }); }
    // each loch finds its own level: just under the lowest ground on its shore
    for (const q of L.ponds) {
      // (the low shore is banked up to hold the water, the high shore is left as a bank above it)
      const hs = [];
      for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2, c = Math.cos(q.rot), s = Math.sin(q.rot), u = Math.cos(a) * q.rx * 1.22, v = Math.sin(a) * q.rz * 1.22; hs.push(landHeight(L, q.x + u * c - v * s, q.z + u * s + v * c)); }
      hs.sort((a, b) => a - b);
      q.level = hs[7] - 0.5;
      for (const k of L.islands) if (ellipseDist(k.x, k.z, q) < 1) q.level = Math.min(q.level, landHeight(L, k.x, k.z) - 1.1);
    }
  }
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

// ---- Highland Lakes: a hill course laid out by hand ----
// Same spec shape as Gosfield, plus the ground itself:
//   land: { rise (m, green above the tee; negative = downhill), dip (m, + = a valley through the middle,
//           - = over a crest), tilt (cross slope, m per m, + = high on the left so the ball runs right),
//           crown (the fairway falls away on both sides), mounds (m of roll in the fairway), hills (how
//           rugged the ground beside the hole is), bowl (m, banks round the green that feed the ball in) }
//   green: { rx, rz, slope (m per m), dir (degrees: 0 = falls toward the front, 90 = falls to the left,
//           180 = away from you, -90 = to the right), tier (m: the back half is a raised shelf) }
//   lakes: [{ at, off | side, rx (across), rz (along) }]   several per hole; side 'C' lies across the line
//   island: 'green' — the green stands in the first lake; or { at, rx, rz } — a landing island in it
const HIGHLAND = [
  { name: 'First Light', par: 4, yards: 385, bend: { at: 0.55, deg: 8 }, halfWidth: 18,
    land: { rise: -7, dip: 1, tilt: 0.025, mounds: 0.5, hills: 1.5 },
    green: { rx: 15, rz: 13, slope: 0.022, dir: 0 },
    lakes: [{ at: 0.6, side: 'R', rx: 26, rz: 44 }],
    bunkers: [{ at: 0.58, side: 'L', rx: 8, rz: 5 }, { green: 'L', rx: 6, rz: 4 }],
    blurb: 'Downhill from a high tee. The fairway leans to the right, toward the loch.' },
  { name: 'The Saddle', par: 5, yards: 525, bend: { at: 0.45, deg: -18 }, halfWidth: 17,
    land: { rise: 10, dip: -2.5, tilt: -0.02, mounds: 0.8, hills: 1.8 },
    green: { rx: 15, rz: 12, slope: 0.028, dir: 20, tier: 0.5 },
    bunkers: [{ at: 0.5, side: 'R', rx: 9, rz: 5 }, { at: 0.78, side: 'L', rx: 7, rz: 5 }, { green: 'FR', rx: 6, rz: 4 }],
    blurb: 'Uphill all the way, over a saddle at the turn. The green is on two levels.' },
  { name: 'Heron Isle', par: 3, yards: 152, halfWidth: 13,
    land: { rise: -6, dip: 0, hills: 1.4 },
    green: { rx: 15, rz: 14, slope: 0.018, dir: 60 },
    lakes: [{ at: 1.0, off: 0, rx: 42, rz: 40 }], island: 'green',
    blurb: 'An island green from a high tee. Nothing but water short, long, left and right.' },
  { name: 'Long Meadow', par: 4, yards: 412, halfWidth: 18,
    land: { rise: 2, dip: 1.2, tilt: 0.05, mounds: 0.4, hills: 1.4 },
    green: { rx: 14, rz: 13, slope: 0.03, dir: -90 },
    lakes: [{ at: 0.5, side: 'R', rx: 24, rz: 95 }],
    bunkers: [{ at: 0.62, side: 'L', rx: 9, rz: 5 }, { green: 'L', rx: 6, rz: 4.5 }],
    blurb: 'The whole hole leans right. Anything landing on the right half will run toward the water.' },
  { name: "Kelpie's Carry", par: 4, yards: 368, halfWidth: 18,
    land: { rise: -3, dip: 0.5, mounds: 0.5, hills: 1.5 },
    green: { rx: 14, rz: 12, slope: 0.025, dir: 180 },
    lakes: [{ at: 0.74, side: 'C', rx: 60, rz: 26 }],
    bunkers: [{ green: 'B', rx: 7, rz: 4 }, { at: 0.5, side: 'R', rx: 8, rz: 5 }],
    blurb: 'Lay up short of the loch, then carry it. The green falls away from you.' },
  { name: 'The Shelf', par: 3, yards: 184, halfWidth: 13,
    land: { rise: 8, dip: 1.5, hills: 1.9, bowl: 1.2 },
    green: { rx: 14, rz: 15, slope: 0.02, dir: 0, tier: 0.55 },
    bunkers: [{ green: 'F', rx: 8, rz: 4 }, { green: 'FL', rx: 5.5, rz: 4 }],
    blurb: 'Uphill to a two-tier green cut into the hillside. Short is in the bunker; the banks behind feed back.' },
  { name: "Stag's Leap", par: 5, yards: 548, bend: { at: 0.5, deg: 22 }, halfWidth: 18,
    land: { rise: -15, dip: -1, tilt: 0.02, mounds: 0.9, hills: 2.0 },
    green: { rx: 15, rz: 13, slope: 0.025, dir: 90 },
    lakes: [{ at: 0.93, side: 'L', rx: 26, rz: 34 }],
    bunkers: [{ at: 0.52, side: 'L', rx: 9, rz: 5.5 }, { at: 0.74, side: 'R', rx: 8, rz: 5 }, { green: 'R', rx: 6, rz: 4 }],
    blurb: 'A long drop from the top of the course. The green tilts left, toward the loch beside it.' },
  { name: 'The Hollow', par: 4, yards: 342, bend: { at: 0.6, deg: -10 }, halfWidth: 17,
    land: { rise: -1, dip: 5, tilt: -0.03, mounds: 0.6, hills: 1.6, bowl: 1.5 },
    green: { rx: 14, rz: 12, slope: 0.03, dir: 45 },
    bunkers: [{ at: 0.55, side: 'R', rx: 8, rz: 5 }, { green: 'F', rx: 7, rz: 4 }],
    blurb: 'Down into a hollow and up again. The green sits in a bowl that gathers the ball.' },
  { name: 'Homeward', par: 4, yards: 432, bend: { at: 0.6, deg: -12 }, halfWidth: 18,
    land: { rise: 7, dip: 1.5, tilt: -0.025, mounds: 0.5, hills: 1.6 },
    green: { rx: 15, rz: 13, slope: 0.026, dir: 0 },
    lakes: [{ at: 0.28, side: 'R', rx: 24, rz: 38 }],
    bunkers: [{ at: 0.62, side: 'R', rx: 9, rz: 5 }, { green: 'FL', rx: 6, rz: 4 }, { green: 'R', rx: 6, rz: 4 }],
    blurb: 'A long climb to the turn. It plays a club more than the yardage.' },
  { name: 'The Narrows', par: 4, yards: 396, halfWidth: 13,
    land: { rise: 0, dip: 0.6, crown: 0.045, mounds: 0.3, hills: 1.3 },
    green: { rx: 13, rz: 13, slope: 0.02, dir: 135 },
    lakes: [{ at: 0.42, side: 'L', rx: 22, rz: 46 }, { at: 0.7, side: 'R', rx: 22, rz: 44 }],
    bunkers: [{ green: 'F', rx: 6, rz: 4 }],
    blurb: 'A narrow, crowned fairway between two lochs. Miss either side and the slope helps it in.' },
  { name: 'Twin Islands', par: 5, yards: 575, halfWidth: 19,
    land: { rise: -4, dip: 0, mounds: 0.5, hills: 1.5 },
    green: { rx: 15, rz: 13, slope: 0.022, dir: -45 },
    lakes: [{ at: 0.72, side: 'C', rx: 80, rz: 58 }], island: { at: 0.72, rx: 23, rz: 27 },
    bunkers: [{ at: 0.45, side: 'L', rx: 9, rz: 5 }, { green: 'L', rx: 6, rz: 4 }, { green: 'B', rx: 7, rz: 4 }],
    blurb: 'Drive short of the loch. Then either a short iron to the island in the middle or one long carry over all of it.' },
  { name: 'Peat Bank', par: 3, yards: 141, halfWidth: 13,
    land: { rise: -9, dip: 0, hills: 1.8 },
    green: { rx: 14, rz: 12, slope: 0.03, dir: 0 },
    lakes: [{ at: 0.52, side: 'C', rx: 36, rz: 20 }],
    bunkers: [{ green: 'B', rx: 8, rz: 4 }, { green: 'L', rx: 5.5, rz: 4 }],
    blurb: 'A short drop shot over water to a green that slopes hard back toward it.' },
  { name: 'Ridgeback', par: 4, yards: 421, bend: { at: 0.55, deg: 10 }, halfWidth: 15,
    land: { rise: 2, dip: -3.5, crown: 0.06, mounds: 0.4, hills: 2.0 },
    green: { rx: 14, rz: 13, slope: 0.024, dir: -90 },
    bunkers: [{ at: 0.5, side: 'R', rx: 8, rz: 5 }, { at: 0.56, side: 'L', rx: 8, rz: 5 }, { green: 'FR', rx: 6, rz: 4 }],
    blurb: 'Along the spine of a ridge. The fairway falls away on both sides, so the middle is the only place to be.' },
  { name: 'Otter Pool', par: 4, yards: 357, bend: { at: 0.48, deg: 28 }, halfWidth: 17,
    land: { rise: -2, dip: 1.5, tilt: -0.035, mounds: 0.5, hills: 1.5 },
    green: { rx: 14, rz: 12, slope: 0.026, dir: 90 },
    lakes: [{ at: 0.56, side: 'L', rx: 30, rz: 40 }],
    bunkers: [{ at: 0.62, side: 'R', rx: 9, rz: 5 }, { green: 'R', rx: 6, rz: 4 }],
    blurb: 'A dogleg left round a loch, and the fairway leans toward it. Cut off as much as you dare.' },
  { name: 'The Cauldron', par: 3, yards: 172, halfWidth: 13,
    land: { rise: -4, dip: 2, hills: 2.2, bowl: 2.2 },
    green: { rx: 13, rz: 13, slope: 0.028, dir: 200 },
    bunkers: [{ green: 'FL', rx: 6, rz: 4 }, { green: 'FR', rx: 6, rz: 4 }, { green: 'B', rx: 7, rz: 4, far: 2 }],
    blurb: 'A green in a deep bowl. The banks all round will throw a wide one back toward the middle.' },
  { name: "Eagle's Fall", par: 5, yards: 502, bend: { at: 0.5, deg: -20 }, halfWidth: 18,
    land: { rise: -11, dip: -1.5, tilt: 0.03, mounds: 0.8, hills: 1.9 },
    green: { rx: 14, rz: 12, slope: 0.028, dir: -90 },
    lakes: [{ at: 0.95, side: 'R', rx: 24, rz: 32 }],
    bunkers: [{ at: 0.5, side: 'R', rx: 9, rz: 5 }, { at: 0.8, side: 'L', rx: 8, rz: 5 }, { green: 'L', rx: 6, rz: 4 }],
    blurb: 'Downhill and reachable in two, if you take on the loch right of the green. Everything leans that way.' },
  { name: 'Isle of Mist', par: 4, yards: 338, halfWidth: 17,
    land: { rise: -3, dip: 1, mounds: 0.5, hills: 1.5 },
    green: { rx: 16, rz: 15, slope: 0.02, dir: -60 },
    lakes: [{ at: 1.0, off: 0, rx: 46, rz: 42 }], island: 'green',
    bunkers: [{ at: 0.55, side: 'L', rx: 8, rz: 5 }],
    blurb: 'A short four to a second island green. The drive is easy; the approach is not.' },
  { name: 'Lochside', par: 4, yards: 446, bend: { at: 0.6, deg: -10 }, halfWidth: 18,
    land: { rise: 6, dip: 1, tilt: -0.04, mounds: 0.5, hills: 1.6 },
    green: { rx: 15, rz: 13, slope: 0.025, dir: 90, tier: 0.4 },
    lakes: [{ at: 0.45, side: 'L', rx: 28, rz: 110 }],
    bunkers: [{ at: 0.6, side: 'R', rx: 9, rz: 5 }, { green: 'R', rx: 6, rz: 4 }, { green: 'FL', rx: 6, rz: 4 }],
    blurb: 'Home, uphill, with the loch all down the left and the ground leaning into it.' },
];

// Old Joe's: the generated map data, plus what the map cannot show. Holes 1 to 6 have a low bank of
// fairway, about a foot high, round the green, open where the fairway runs in.
const OLDJOES_COURSE = { ...OLDJOES, berms: [1, 2, 3, 4, 5, 6] };

// ---- Courses built from a map (tools/osm2course.mjs) ----
// The map gives every shape on the course in metres east and north. Each hole is built in its own
// frame (the tee-to-green line runs up +z through the middle), but with the whole course laid out
// round it, so the next green and the hedge behind the tee are where they really are.

/** A polygon ready for point tests: flat [x, z, x, z...] with its bounding box. */
function packPoly(pts) {
  const p = new Float64Array(pts.length * 2); let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, cx = 0, cz = 0;
  pts.forEach(([x, z], i) => { p[i * 2] = x; p[i * 2 + 1] = z; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); cx += x; cz += z; });
  return { p, n: pts.length, x0, x1, z0, z1, cx: cx / pts.length, cz: cz / pts.length };
}
/** Signed distance to a packed polygon's edge: positive inside, negative outside (-99 when well clear of it). */
export function polyDist(P, x, z, margin = 6) {
  if (x < P.x0 - margin || x > P.x1 + margin || z < P.z0 - margin || z > P.z1 + margin) return -99;
  const a = P.p, n = P.n; let inside = false, best = Infinity;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = a[i * 2], zi = a[i * 2 + 1], xj = a[j * 2], zj = a[j * 2 + 1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
    const dx = xj - xi, dz = zj - zi, l2 = dx * dx + dz * dz; let u = l2 ? ((x - xi) * dx + (z - zi) * dz) / l2 : 0; u = u < 0 ? 0 : u > 1 ? 1 : u;
    const ex = x - xi - dx * u, ez = z - zi - dz * u, d = ex * ex + ez * ez; if (d < best) best = d;
  }
  return inside ? Math.sqrt(best) : -Math.sqrt(best);
}
/** The ellipse that best covers a polygon's outline: centre, radii and turn, in the layout's ellipse convention. */
function fitEllipse(pts) {
  let cx = 0, cz = 0; for (const [x, z] of pts) { cx += x; cz += z; } cx /= pts.length; cz /= pts.length;
  let sxx = 0, szz = 0, sxz = 0; for (const [x, z] of pts) { sxx += (x - cx) ** 2; szz += (z - cz) ** 2; sxz += (x - cx) * (z - cz); }
  sxx /= pts.length; szz /= pts.length; sxz /= pts.length;
  const rot = 0.5 * Math.atan2(2 * sxz, sxx - szz), t = (sxx + szz) / 2, k = Math.hypot((sxx - szz) / 2, sxz);
  return { x: cx, z: cz, rx: Math.max(1.5, Math.sqrt(2 * (t + k))), rz: Math.max(1.5, Math.sqrt(2 * Math.max(0.01, t - k))), rot };
}
/** The gently rolling ground a mapped course sits on, by its real-world position, so it is the same from every hole. */
function mapBase(wx, wy) { return fbm(wx / 150 + 3, wy / 150 - 2, 3, 2, 0.5) * 1.8 + fbm(wx / 45 + 7, wy / 45, 2, 2, 0.5) * 0.4 + fbm(wx / 9, wy / 9 + 5, 2, 2, 0.5) * 0.08; }

/**
 * Build hole n of a mapped course. A nine-hole course is played twice round: the second time each
 * hole is the same ground with the pin moved to the other side of the green.
 */
export function makeMapHole(M, n) {
  const N9 = M.holes.length, k = n % N9, second = n >= N9, H = M.holes[k];
  const a = H.pts[0], b = H.pts[H.pts.length - 1], dl = Math.hypot(b[0] - a[0], b[1] - a[1]), d0 = (b[0] - a[0]) / dl, d1 = (b[1] - a[1]) / dl;
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  // map (east, north) -> hole frame: z runs from tee to green, +x is to the left of that line
  const loc = ([px, py]) => [-((px - mx) * d1 - (py - my) * d0), (px - mx) * d0 + (py - my) * d1];
  const locAll = (pts) => pts.map(loc);
  const frame = { mx, my, d0, d1 };
  const base = (x, z) => mapBase(mx + d0 * z - d1 * x, my + d1 * z + d0 * x);
  const size = 640, lim = size / 2 - 14, inWorld = ([x, z]) => Math.abs(x) < lim && Math.abs(z) < lim;
  const rnd = mulberry32(8800 + k * 131);

  // the hole line, resampled to nine evenly spaced points
  const line = locAll(H.pts), cum = [0]; for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + Math.hypot(line[i][0] - line[i - 1][0], line[i][1] - line[i - 1][1]));
  const len = cum[cum.length - 1], spline = [];
  for (let i = 0; i < 9; i++) { const s = len * i / 8; let j = 1; while (j < cum.length - 1 && cum[j] < s) j++; const u = (s - cum[j - 1]) / (cum[j] - cum[j - 1] || 1); spline.push([line[j - 1][0] + (line[j][0] - line[j - 1][0]) * u, line[j - 1][1] + (line[j][1] - line[j - 1][1]) * u]); }

  const nearest = (list, p) => { let best = 0, bd = Infinity; list.forEach((q, i) => { const e = fitEllipse(q), d = Math.hypot(e.x - p[0], e.z - p[1]); if (d < bd) { bd = d; best = i; } }); return best; };
  const greensL = M.greens.map(locAll), teesL = M.tees.map(locAll), bunkersL = M.bunkers.map(locAll), waterL = M.water.map(locAll);
  const gi = nearest(greensL, line[line.length - 1]), ti = nearest(teesL, line[0]);
  const green = fitEllipse(greensL[gi]), teeE = fitEllipse(teesL[ti]);
  const tee = { x: teeE.x, z: teeE.z, w: 6, l: 8 };
  // every green tilts its own way (by its place on the map, so it is the same green from any hole)
  const shapes = {
    fairways: M.fairways.map((p) => packPoly(locAll(p))),
    greens: greensL.map((p, i) => { const P = packPoly(p), e = fitEllipse(p), g = mulberry32(4100 + i * 53), ang = g() * Math.PI * 2, mag = 0.013 + g() * 0.015, ax = Math.cos(ang) * mag, ay = Math.sin(ang) * mag; return { P, cx: e.x, cz: e.z, h: base(e.x, e.z) + 0.3, sx: -ax * d1 + ay * d0, sz: ax * d0 + ay * d1 }; }),
    tees: teesL.map((p) => { const P = packPoly(p), e = fitEllipse(p); return { P, h: base(e.x, e.z) + 0.2 }; }),
    bunkers: bunkersL.map((p) => packPoly(p)),
    water: waterL.map((p) => packPoly(p)),
    boundary: M.boundary ? packPoly(locAll(M.boundary)) : null,
    hedges: M.hedges.map(locAll), fences: (M.fences || []).map(locAll),
    buildings: M.buildings.map(locAll).filter((p) => p.every(inWorld)),
    roads: M.roads.map((r) => ({ kind: r.kind, pts: locAll(r.pts).filter(inWorld) })).filter((r) => r.pts.length > 1),
  };
  // Old Joe's first six greens are ringed by a low bank of fairway, about a foot high, open where the
  // fairway runs in. `berms` lists which holes have one; the opening faces back down that hole's line.
  for (const j of M.berms || []) {
    const Hj = M.holes[j - 1]; if (!Hj) continue;
    const lj = locAll(Hj.pts), end = lj[lj.length - 1], prev = lj[lj.length - 2], G = shapes.greens[nearest(greensL, end)];
    const ax = prev[0] - G.cx, az = prev[1] - G.cz, al = Math.hypot(ax, az) || 1;
    G.berm = { ax: ax / al, az: az / al, h: 0.3 };
  }
  // the mapped pin first time round; the far side of the green from it the second
  const gp = shapes.greens[gi].P; let pinL = M.pins.map(loc).reduce((best, p) => (Math.hypot(p[0] - green.x, p[1] - green.z) < Math.hypot(best[0] - green.x, best[1] - green.z) ? p : best));
  if (polyDist(gp, pinL[0], pinL[1]) < 1.5) pinL = [green.x, green.z];
  if (second) { // the spot on the green, clear of its edge, that is furthest from the first pin
    let best = null, bd = -1;
    for (let k2 = 0; k2 < 24; k2++) for (const r of [0.75, 0.55, 0.35]) { const a2 = k2 / 24 * Math.PI * 2, q = [green.x + Math.cos(a2) * green.rx * r, green.z + Math.sin(a2) * green.rz * r]; if (polyDist(gp, q[0], q[1]) < 2.2) continue; const dd = Math.hypot(q[0] - pinL[0], q[1] - pinL[1]); if (dd > bd) { bd = dd; best = q; } }
    if (best) pinL = best;
  }
  const pin = { x: pinL[0], z: pinL[1] };
  const bunkers = bunkersL.map(fitEllipse).filter((e) => inWorld([e.x, e.z]));
  const pondList = waterL.map((p) => { const e = fitEllipse(p); return { ...e, rx: e.rx * 1.25, rz: e.rz * 1.25, seed: 3, level: base(e.x, e.z) - 0.55 }; }).filter((e) => inWorld([e.x, e.z]));

  // Scenery straight off the map. A hedge is an overgrown fence line: three ranks of bushes with
  // hawthorn and oak coming up through them (the fence itself is built with the course furniture).
  // Woods, and scrub that lies inside the course, are stands of tall pine planted too close to play through.
  const spots = [];
  for (const h of shapes.hedges) for (let i = 1; i < h.length; i++) {
    const dx = h[i][0] - h[i - 1][0], dz = h[i][1] - h[i - 1][1], l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
    for (let s = 0; s < l; s += 1.7) for (const row of [-1.7, 0, 1.7]) {
      const u = (s + rnd() * 0.8) / l, o = row + (rnd() - 0.5) * 0.9, p = [h[i - 1][0] + dx * u + nx * o, h[i - 1][1] + dz * u + nz * o];
      if (inWorld(p)) spots.push({ x: p[0], z: p[1], kind: 'bush', h: 3 + rnd() * 1.8, soft: row !== 0 });
    }
    for (let s = rnd() * 5; s < l; s += 5 + rnd() * 5) { const u = s / l, o = (rnd() - 0.5) * 2.4, p = [h[i - 1][0] + dx * u + nx * o, h[i - 1][1] + dz * u + nz * o]; if (inWorld(p)) spots.push(rnd() < 0.45 ? { x: p[0], z: p[1], kind: 'oak', h: 8 + rnd() * 5 } : { x: p[0], z: p[1], kind: 'thorn', h: 5 + rnd() * 2.5 }); }
  }
  for (const t of M.trees.map(loc)) if (inWorld(t)) spots.push({ x: t[0], z: t[1], kind: 'oak', h: 11 + rnd() * 3 });
  for (const r of (M.treeRows || []).map(locAll)) for (let i = 1; i < r.length; i++) { const l = Math.hypot(r[i][0] - r[i - 1][0], r[i][1] - r[i - 1][1]); for (let s = 0; s < l; s += 6) { const u = s / l, p = [r[i - 1][0] + (r[i][0] - r[i - 1][0]) * u, r[i - 1][1] + (r[i][1] - r[i - 1][1]) * u]; if (inWorld(p)) spots.push({ x: p[0], z: p[1], kind: 'oak', h: 10 + rnd() * 4 }); } }
  const stand = (P, kind, gap) => { for (let x = P.x0; x <= P.x1; x += gap) for (let z = P.z0; z <= P.z1; z += gap) { const p = [x + (rnd() - 0.5) * gap * 0.5, z + (rnd() - 0.5) * gap * 0.5]; if (polyDist(P, p[0], p[1]) > 0.6 && inWorld(p)) spots.push({ x: p[0], z: p[1], kind, h: 16 + rnd() * 5 }); } };
  for (const w of (M.woods || []).map(locAll)) stand(packPoly(w), 'wallpine', 2.3);
  for (const s of M.scrub.map(locAll)) {
    const P = packPoly(s);
    if (shapes.boundary && polyDist(shapes.boundary, P.cx, P.cz, 20) > 0) { stand(P, 'wallpine', 2.3); continue; }
    const want = Math.min(260, (P.x1 - P.x0) * (P.z1 - P.z0) / 22);
    for (let i = 0, got = 0; i < want * 4 && got < want; i++) { const p = [P.x0 + rnd() * (P.x1 - P.x0), P.z0 + rnd() * (P.z1 - P.z0)]; if (polyDist(P, p[0], p[1]) < 1 || !inWorld(p)) continue; got++; spots.push(rnd() < 0.18 ? { x: p[0], z: p[1], kind: 'oak', h: 8 + rnd() * 4 } : { x: p[0], z: p[1], kind: 'bush', h: 2.4 + rnd() * 2.4, soft: true }); }
  }

  const yards = Math.round(len * 1.09361);
  const guard = bunkers.filter((e) => Math.hypot(e.x - green.x, e.z - green.z) < Math.max(green.rx, green.rz) + 14).length;
  const wet = pondList.some((q) => splineDistPts(spline, q.x, q.z) < Math.max(q.rx, q.rz) + 14);
  const L = { index: n, number: n + 1, par: 3, len, size, res: 512, maskRes: 1024, spline, halfWidth: 11, tee, green, pin, bunkers, pond: pondList[0] || null, ponds: pondList, seed: 700, yards, bendAngle: 0, shapes, frame, mapped: true,
    scenery: { style: 'parkland', tufts: 0.5, trees: [], spots, boundary: shapes.boundary, woodland: { beyond: 1e9 } },
    blurb: `${yards} yards${second ? ', second time round, with the pin moved' : ''}. ${guard ? `${guard} bunker${guard === 1 ? '' : 's'} by the green` : 'No bunkers by the green'}${wet ? ', and the pond in play' : ''}.` };
  return L;
}
function splineDistPts(pts, x, z) { let best = Infinity; for (const p of pts) best = Math.min(best, Math.hypot(p[0] - x, p[1] - z)); return best; }

/** Ground height on a mapped course: the rolling base, with greens and tees levelled, bunkers dug and ponds cut. */
function mapHeight(L, x, z) {
  const S = L.shapes, F = L.frame;
  let h = mapBase(F.mx + F.d0 * z - F.d1 * x, F.my + F.d1 * z + F.d0 * x);
  for (const g of S.greens) {
    const d = polyDist(g.P, x, z, 6); if (d <= -5) continue;
    h = lerp(h, g.h + g.sx * (x - g.cx) + g.sz * (z - g.cz), smoothstep(-4, 0.5, d));
    if (g.berm) h += g.berm.h * bermWeight(g, x, z, d);
  }
  for (const t of S.tees) { const d = polyDist(t.P, x, z, 3); if (d > -2.5) h = lerp(h, t.h, smoothstep(-2, 0.3, d)); }
  for (const b of S.bunkers) { const d = polyDist(b, x, z, 2); if (d > -1.6) h += -0.55 * smoothstep(-0.4, 1.6, d) + 0.1 * smoothstep(-1.5, -0.7, d) * (1 - smoothstep(-0.7, -0.1, d)); }
  S.water.forEach((w, i) => { const d = polyDist(w, x, z, 7); if (d > -6 && L.ponds[i]) { const wl = L.ponds[i].level; h = d < 0 ? Math.max(h, wl + 0.18) : lerp(Math.max(h, wl + 0.18), wl - 1.8, smoothstep(0, 2.4, d)); } });
  return h;
}
/** How much of a green's low surrounding bank stands at (x, z): a ridge just off the green, open toward the fairway. */
function bermWeight(g, x, z, d) {
  if (d > -0.5 || d < -3.4) return 0;
  const ridge = smoothstep(-3.4, -2.2, d) * (1 - smoothstep(-1.5, -0.5, d));
  const rx = x - g.cx, rz = z - g.cz, rl = Math.hypot(rx, rz) || 1, facing = (rx * g.berm.ax + rz * g.berm.az) / rl; // 1 = straight back down the hole
  return ridge * (1 - smoothstep(0.62, 0.86, facing));
}
/** Surface weights on a mapped course, straight from the mapped shapes. */
function mapWeights(L, x, z) {
  const S = L.shapes, wob = fbm(x / 5 + 1, z / 5, 2, 2, 0.5) * 0.3;
  let fairway = 0, green = 0, tee = 0, sand = 0, water = 0;
  for (const f of S.fairways) { const d = polyDist(f, x, z, 2); if (d > -1.5) fairway = Math.max(fairway, smoothstep(-0.7, 0.7, d + wob)); }
  for (const g of S.greens) { const d = polyDist(g.P, x, z, 4); if (d > -1) green = Math.max(green, smoothstep(-0.4, 0.4, d + wob * 0.3)); if (g.berm && d > -4) fairway = Math.max(fairway, smoothstep(-3.9, -3.3, d)); } // the bank is mown as fairway
  for (const t of S.tees) { const d = polyDist(t.P, x, z, 2); if (d > -1) tee = Math.max(tee, smoothstep(-0.3, 0.3, d)); }
  for (const b of S.bunkers) { const d = polyDist(b, x, z, 2); if (d > -1) sand = Math.max(sand, smoothstep(-0.35, 0.35, d + wob * 0.4)); }
  for (const w of S.water) { const d = polyDist(w, x, z, 2); if (d > -1) water = Math.max(water, smoothstep(-0.3, 0.3, d)); }
  return { fairway: Math.max(fairway, 0), green, sand, water, tee };
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
  let best = Infinity, bt = 0, bs = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
    const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
    let u = ((x - ax) * dx + (z - az) * dz) / l2; u = clamp(u, 0, 1);
    const px = ax + dx * u, pz = az + dz * u;
    const d = (x - px) * (x - px) + (z - pz) * (z - pz);
    if (d < best) { best = d; bt = (cum[i] + (cum[i + 1] - cum[i]) * u) / len; bs = (x - px) * dz - (z - pz) * dx; }
  }
  const dist = Math.sqrt(best);
  return { d: dist, t: bt, s: bs >= 0 ? dist : -dist }; // s: the same distance, signed (+ = left of the line)
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
  if (L.land) { const T = L.land, u = clamp(t, 0, 1); return T.rise * u * u * (3 - 2 * u) - T.dip * Math.sin(Math.PI * u) + 1.2 * (1 - smoothstep(0, 0.1, t)) + Math.sin(t * 7 + k) * 0.35; }
  return 2.6 * (1 - t) - (1.0 + 0.8 * Math.sin(k * 1.7)) * Math.sin(Math.PI * t) + 1.6 * smoothstep(0.7, 1, t) + Math.sin(t * 6 + k) * 0.5;
}

/** Water level of a pond: a little below the ground it sits in. */
export function pondLevel(L, q) {
  if (q._wl == null) q._wl = (q.level != null ? q.level : profile(L, clamp(splineDist(L, q.x, q.z).t, 0, 1)) - 1.15);
  return q._wl;
}
export function waterLevel(L) { const ps = ponds(L); return ps.length ? pondLevel(L, ps[0]) : -999; }

/**
 * The lie of the land on a hill course, before bunkers are dug and lochs are flooded. Beside the
 * hole the ground is rugged; along it the fairway follows the hole's own rise and fall, leans with
 * its cross slope, may fall away from a crown, and rolls with mounds. The green is a tilted plane
 * (two planes, for a tiered green), sometimes ringed with banks.
 */
function landHeight(L, x, z) {
  const T = L.land, ox = L.seed * 131.7, oz = L.seed * 71.3;
  const big = fbm((x + ox) / 210 + 10, (z + oz) / 210 + 4, 4, 2, 0.5) * 6.5 * T.hills;
  const med = fbm((x + ox) / 55 - 3, (z + oz) / 55 + 7, 3, 2, 0.5) * 1.3 * (0.6 + 0.4 * T.hills);
  const small = fbm(x / 9 + 1, z / 9 - 5, 2, 2, 0.5) * 0.14;
  const { d, t, s } = splineDist(L, x, z);
  const hw = L.halfWidth, prof = profile(L, t), sc = clamp(s, -(hw + 30), hw + 30);
  const lean = T.tilt * sc - T.crown * Math.max(0, Math.abs(sc) - 3);
  const wild = prof + lean + big + med + small;                 // the hillside keeps the hole's slope
  const mown = prof + lean + med * 0.3 + fbm(x / 24 + 2 + ox, z / 24 - 4, 2, 2, 0.5) * T.mounds + small;
  let h = lerp(wild, mown, smoothstep(hw + 34, hw + 4, d));
  const g = L.green, eg = ellipseDist(x, z, g), gx = x - g.x, gz = z - g.z;
  // downhill direction on the green: `dir` turned from "toward the front"
  const cd = Math.cos(g.dir), sd = Math.sin(g.dir), ux = -g.fx * cd - g.fz * sd, uz = -g.fz * cd + g.fx * sd;
  const along = gx * g.fx + gz * g.fz;
  let hg = profile(L, 1) + 0.9 - g.slope * (gx * ux + gz * uz) + g.tier * (smoothstep(-2.6, 2.6, along) - 0.5) + fbm(x / 7, z / 7, 2) * 0.04;
  h = lerp(h, hg, smoothstep(1.75, 1.0, eg));
  if (T.bowl) h += T.bowl * smoothstep(1.25, 2.3, eg) * (1 - smoothstep(2.3, 3.8, eg));
  const tdx = x - L.tee.x, tdz = z - L.tee.z;
  h = lerp(h, profile(L, 0) + 0.35, smoothstep(1.35, 1.0, Math.max(Math.abs(tdx) / (L.tee.w / 2), Math.abs(tdz) / (L.tee.l / 2))));
  return h;
}
/** How far inside one of the hole's islands (x, z) is: 1 on the island, 0 in the water round it. */
function islandWeight(L, x, z) {
  let w = 0;
  for (const k of L.islands || []) w = Math.max(w, smoothstep(1.12, 0.98, ellipseDist(x, z, k) + fbm(x / 9 + 4, z / 9, 2) * 0.05));
  return w;
}

/** Terrain height ignoring ponds and bunkers — used to pick a water level for a decorative lake. */
function terrainHeightBase(L, x, z) {
  if (L.land) return landHeight(L, x, z);
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
  if (L.shapes) return mapHeight(L, x, z);
  if (L.land) {
    let h = landHeight(L, x, z);
    for (const b of L.bunkers) {
      const e = ellipseDist(x, z, b) + fbm(x / 6, z / 6, 2) * 0.08;
      h -= smoothstep(1.15, 0.75, e) * 0.75;
      h += smoothstep(1.35, 1.1, e) * (1 - smoothstep(1.1, 0.95, e)) * 0.12;
    }
    for (const q of ponds(L)) {
      const pe = pondDistOne(q, x, z);
      if (pe < 1.6) {
        const wl = pondLevel(L, q), isl = islandWeight(L, x, z);
        let hw = lerp(h, wl - 2.4, smoothstep(1.12, 0.9, pe));
        if (pe > 1.0) hw = Math.max(hw, wl + 0.3 * smoothstep(1.0, 1.15, pe) * (1 - smoothstep(1.3, 1.6, pe)));
        h = lerp(hw, Math.max(h, wl + 0.7), isl); // an island keeps its own ground, clear of the water
      }
    }
    return h;
  }
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
  if (L.shapes) return mapWeights(L, x, z);
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
  let water = ponds(L).length ? smoothstep(1.0, 0.96, pondDist(L, x, z)) : 0;
  if (water > 0 && L.islands && L.islands.length) water *= 1 - islandWeight(L, x, z);
  return { fairway, green, sand, water, tee };
}

/**
 * The cart path: a strip that runs down one side of a generated hole, beyond the rough, from by
 * the tee to short of the green. Looks only (the ball plays it as rough). Returns the centre line
 * as [x, z] points, cached on the layout; empty for Starfall and for hand-laid holes, whose
 * scenery is placed from the real ground.
 */
export function cartPath(L) {
  if (L._path) return L._path;
  const pts = [];
  if (!L.space && !L.scenery && L.par > 3) {
    // keep to the side away from the pond
    let side = 1;
    if (L.pond) { const { t } = splineDist(L, L.pond.x, L.pond.z); const f = alongHole(L, t, 0); side = (L.pond.x - f.x) * Math.cos(f.dir) - (L.pond.z - f.z) * Math.sin(f.dir) > 0 ? -1 : 1; }
    const off = (L.halfWidth || 16) + 14.5, step = 4 / (L.len || 400);
    for (let t = 0.02; t <= 0.9; t += step) {
      const p = alongHole(L, t, side * (off + Math.sin(t * 9 + L.seed) * 1.6));
      if (L.bunkers.some((b) => ellipseDist(p.x, p.z, b) < 1.5) || ponds(L).some((q) => ellipseDist(p.x, p.z, q) < 1.3)) { if (pts.length > 4) break; pts.length = 0; continue; }
      pts.push([p.x, p.z]);
    }
    if (pts.length < 6) pts.length = 0;
  }
  return (L._path = pts);
}
/** Distance from (x, z) to the cart path's centre line (Infinity when the hole has none). */
export function pathDist(L, x, z) {
  const p = cartPath(L); let best = Infinity;
  for (let i = 0; i < p.length - 1; i++) {
    const ax = p[i][0], az = p[i][1], dx = p[i + 1][0] - ax, dz = p[i + 1][1] - az;
    const u = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - dx * u, z - az - dz * u));
  }
  return best;
}

/**
 * How much of the ground at (x, z) is unmown native grass (0..1): the tall golden fescue that grows
 * beyond the rough. Looks only — the ball still plays it as rough. Patchy, and kept clear of the
 * tee, the green and the bunkers.
 */
export function fescueWeight(L, x, z) {
  if (L.space) return 0;
  if (L.shapes) { // a mapped course is mown throughout; the long grass is the farmland outside its boundary
    if (!L.shapes.boundary) return 0;
    const out = -polyDist(L.shapes.boundary, x, z, 14); if (out < 2) return 0;
    return smoothstep(2, 9, out) * smoothstep(0.25, 0.45, fbm(x / 46 + 11, z / 46 - 5, 3) * 0.5 + 0.5);
  }
  const { d } = splineDist(L, x, z);
  const hw = L.halfWidth || 16;
  let w = smoothstep(hw + 7, hw + 17, d);
  if (w <= 0) return 0;
  w *= smoothstep(26, 44, Math.hypot(x - L.green.x, z - L.green.z));
  w *= smoothstep(16, 30, Math.hypot(x - L.tee.x, z - L.tee.z));
  for (const b of L.bunkers) w *= smoothstep(1.6, 3.2, ellipseDist(x, z, b));
  for (const q of ponds(L)) w *= smoothstep(1.15, 1.6, ellipseDist(x, z, q));
  w *= smoothstep(1.3, 2.6, pathDist(L, x, z));
  for (const k of L.clear || []) w *= smoothstep(k.r * 0.8, k.r, Math.hypot(x - k.x, z - k.z));
  // drifts of fescue between patches of ordinary rough
  const n = fbm(x / 46 + 11 + L.seed * 0.01, z / 46 - 5, 3) * 0.5 + 0.5;
  return w * smoothstep(0.3, 0.5, n);
}

export class Course {
  constructor(layout) {
    const L = this.layout = layout;
    this.size = L.size; this.res = L.res; this.maskRes = L.maskRes;
    // Starfall: anything that drops below the void level is gone (the ball treats it like water)
    this.voidLevel = L.space ? L.space.voidLevel : null;
    this.rollScale = L.firm ? 0.6 : 1; // a firm, fast-running course: the ball rolls out further and slopes have more say
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
      else if (!L.shapes && d > 120 && !ponds(L).some((q) => ellipseDist(x, z, q) < 2.5)) continue; // (a mapped course has shapes all over the world, not only along this hole)
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
