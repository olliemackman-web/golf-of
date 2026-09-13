// Pure data for the hole: layout constants, the heightmap and the surface
// mask. No three.js here so the same code runs in node for calibration.
import { fbm, smoothstep, clamp, lerp } from './noise.js';

export const SURF = { ROUGH: 0, FAIRWAY: 1, GREEN: 2, SAND: 3, WATER: 4, TEE: 5 };
export const SURF_NAME = ['Rough', 'Fairway', 'Green', 'Bunker', 'Water', 'Tee'];

export const LAYOUT = {
  size: 640,          // metres, square, centred on the origin
  res: 512,           // heightmap grid
  maskRes: 1024,      // surface mask resolution
  // Centre line of the fairway (metres). Gentle dogleg right, ~345m tee to pin.
  spline: [[0, -178], [3, -125], [7, -70], [22, -18], [55, 30], [92, 74], [120, 108], [128, 126]],
  halfWidth: 17,
  tee: { x: 0, z: -192, w: 9, l: 14 },
  green: { x: 129, z: 131, rx: 16, rz: 12.5, rot: 0.55 },
  pin: { x: 131.5, z: 133.5 },
  bunkers: [
    { x: 84, z: 32, rx: 11, rz: 6.5, rot: 0.9 },     // inside of the dogleg
    { x: 30, z: -50, rx: 9, rz: 5, rot: 0.2 },        // right of the landing zone
    { x: 110, z: 141, rx: 7.5, rz: 5, rot: 0.4 },     // greenside left
    { x: 145, z: 116, rx: 6.5, rz: 5.5, rot: -0.5 },  // greenside front-right
  ],
  pond: { x: -46, z: 24, rx: 34, rz: 48, rot: 0.15 },
  par: 4,
};

// ---- geometry helpers --------------------------------------------------
let poly = null;
function polyline() {
  if (poly) return poly;
  const pts = LAYOUT.spline;
  const out = [];
  // Catmull-Rom through the control points, 8 samples per segment.
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
  poly = { pts: out, cum, len };
  return poly;
}

/** Distance to the fairway centre line, and normalised position t along it. */
export function splineDist(x, z) {
  const { pts, cum, len } = polyline();
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

/** Normalised elliptical distance (1 = on the edge). */
export function ellipseDist(x, z, e) {
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  const dx = x - e.x, dz = z - e.z;
  const u = (dx * c + dz * s) / e.rx, v = (-dx * s + dz * c) / e.rz;
  return Math.sqrt(u * u + v * v);
}

function pondDist(x, z) {
  const n = fbm(x / 23 + 3.1, z / 23 - 1.7, 3, 2, 0.5);
  return ellipseDist(x, z, LAYOUT.pond) + n * 0.22;
}

// Height of the fairway centre line by normalised t: tee slightly elevated,
// a dip through the landing area, rising to the green.
function profile(t) {
  return 2.6 * (1 - t) - 1.4 * Math.sin(Math.PI * t) + 1.6 * smoothstep(0.7, 1, t);
}

let waterLevelCache = null;
export function waterLevel() {
  if (waterLevelCache == null) waterLevelCache = profile(0.35) - 1.15;
  return waterLevelCache;
}

/** The terrain height function everything is sampled from. */
export function terrainHeight(x, z) {
  const L = LAYOUT;
  const big = fbm(x / 210 + 10, z / 210 + 4, 4, 2, 0.5) * 6.5;
  const med = fbm(x / 55 - 3, z / 55 + 7, 3, 2, 0.5) * 1.3;
  const small = fbm(x / 9 + 1, z / 9 - 5, 2, 2, 0.5) * 0.14;
  let h = big + med + small;

  // Fairway corridor blends toward the design profile.
  const { d, t } = splineDist(x, z);
  const corridor = profile(t) + med * 0.35 + small;
  const w = smoothstep(L.halfWidth + 30, L.halfWidth + 3, d);
  h = lerp(h, corridor, w);

  // Green: a raised, gently tilted plateau with a little undulation.
  const eg = ellipseDist(x, z, L.green);
  const hg = profile(1) + 0.9 + (x - L.green.x) * 0.012 - (z - L.green.z) * 0.008 + fbm(x / 7, z / 7, 2) * 0.06;
  h = lerp(h, hg, smoothstep(1.7, 1.0, eg));

  // Tee box: flat.
  const tdx = x - L.tee.x, tdz = z - L.tee.z;
  const tw = smoothstep(1.35, 1.0, Math.max(Math.abs(tdx) / (L.tee.w / 2), Math.abs(tdz) / (L.tee.l / 2)));
  h = lerp(h, profile(0) + 0.35, tw);

  // Bunkers: scooped out with a soft lip.
  for (const b of L.bunkers) {
    const e = ellipseDist(x, z, b) + fbm(x / 6, z / 6, 2) * 0.08;
    const inside = smoothstep(1.15, 0.75, e);
    h -= inside * 0.75;
    h += smoothstep(1.35, 1.1, e) * (1 - smoothstep(1.1, 0.95, e)) * 0.12; // lip
  }

  // Pond: dug down below the water line, banks feathered.
  const pe = pondDist(x, z);
  if (pe < 1.6) {
    const wl = waterLevel();
    const inside = smoothstep(1.12, 0.9, pe);
    h = lerp(h, wl - 2.4, inside);
    if (pe > 1.0) h = Math.max(h, wl + 0.25 * smoothstep(1.0, 1.15, pe));
  }
  return h;
}

/** Surface weights [fairway, green, sand, water] in 0..1, plus tee. */
export function surfaceWeights(x, z) {
  const L = LAYOUT;
  const n = fbm(x / 16 + 5, z / 16 - 2, 3, 2, 0.5);
  const { d, t } = splineDist(x, z);
  let fairway = smoothstep(L.halfWidth + 3, L.halfWidth - 3, d + n * 6) * smoothstep(0.0, 0.03, t);
  const eg = ellipseDist(x, z, L.green) + n * 0.05;
  const green = smoothstep(1.06, 0.97, eg);
  fairway = Math.max(fairway, smoothstep(1.55, 1.12, eg)); // collar / apron
  const tdx = Math.abs(x - L.tee.x) / (L.tee.w / 2), tdz = Math.abs(z - L.tee.z) / (L.tee.l / 2);
  const tee = smoothstep(1.06, 0.98, Math.max(tdx, tdz));
  let sand = 0;
  for (const b of L.bunkers) { const e = ellipseDist(x, z, b) + fbm(x / 6, z / 6, 2) * 0.08; sand = Math.max(sand, smoothstep(1.02, 0.94, e)); }
  const water = smoothstep(1.0, 0.96, pondDist(x, z));
  return { fairway, green, sand, water, tee };
}

export class Course {
  constructor() {
    const L = LAYOUT;
    this.size = L.size; this.res = L.res; this.maskRes = L.maskRes;
    this.waterLevel = waterLevel();
    const N = L.res, half = L.size / 2, step = L.size / (N - 1);
    this.heights = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) this.heights[j * N + i] = terrainHeight(-half + i * step, -half + j * step);
    this.step = step;
    // Mask: RGBA bytes — R fairway, G green(+tee), B sand, A water.
    const M = L.maskRes, mstep = L.size / M;
    this.mask = new Uint8Array(M * M * 4);
    this.teeMask = new Uint8Array(M * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
      const x = -half + (i + 0.5) * mstep, z = -half + (j + 0.5) * mstep;
      const { d } = splineDist(x, z);
      const k = (j * M + i) * 4;
      if (d > 120 && ellipseDist(x, z, L.pond) > 2.5) { this.mask[k + 3] = 0; continue; } // pure rough far away, skip the work
      const s = surfaceWeights(x, z);
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

  /** Outward unit normal, written into out {x,y,z}. */
  normalAt(x, z, out = { x: 0, y: 1, z: 0 }) {
    const e = 0.5;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
    const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    let nx = -dx / (2 * e), ny = 1, nz = -dz / (2 * e);
    const l = Math.hypot(nx, ny, nz); out.x = nx / l; out.y = ny / l; out.z = nz / l; return out;
  }

  /** Dominant surface id at a point, and the blend weights. */
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

  inBounds(x, z) { const h = this.size / 2 - 12; return x > -h && x < h && z > -h && z < h; }
}
