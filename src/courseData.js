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
    if (par === 3) { const p = sideOf(0.55, (rnd() < 0.5 ? -1 : 1) * 22); pond = { x: p.x, z: p.z, rx: 22 + rnd() * 8, rz: 30 + rnd() * 10, rot: p.rot }; }
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

/** Normalised elliptical distance (1 = on the edge). */
export function ellipseDist(x, z, e) {
  const c = Math.cos(e.rot), s = Math.sin(e.rot);
  const dx = x - e.x, dz = z - e.z;
  const u = (dx * c + dz * s) / e.rx, v = (-dx * s + dz * c) / e.rz;
  return Math.sqrt(u * u + v * v);
}

export function pondDist(L, x, z) {
  if (!L.pond) return 9;
  const n = fbm(x / 23 + 3.1, z / 23 - 1.7, 3, 2, 0.5);
  return ellipseDist(x, z, L.pond) + n * 0.22;
}

// Height of the fairway centre line by normalised t: tee slightly elevated,
// a dip through the landing area, rising to the green.
function profile(L, t) {
  const k = L.seed;
  return 2.6 * (1 - t) - (1.0 + 0.8 * Math.sin(k * 1.7)) * Math.sin(Math.PI * t) + 1.6 * smoothstep(0.7, 1, t) + Math.sin(t * 6 + k) * 0.5;
}

export function waterLevel(L) {
  if (L._wl == null) L._wl = profile(L, L.pond ? clamp(splineDist(L, L.pond.x, L.pond.z).t, 0, 1) : 0.35) - 1.15;
  return L._wl;
}

/** The terrain height function everything is sampled from. */
export function terrainHeight(L, x, z) {
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

  if (L.pond) {
    const pe = pondDist(L, x, z);
    if (pe < 1.6) {
      const wl = waterLevel(L);
      const inside = smoothstep(1.12, 0.9, pe);
      h = lerp(h, wl - 2.4, inside);
      if (pe > 1.0) h = Math.max(h, wl + 0.25 * smoothstep(1.0, 1.15, pe));
    }
  }
  return h;
}

/** Surface weights [fairway, green, sand, water] in 0..1, plus tee. */
export function surfaceWeights(L, x, z) {
  const n = fbm(x / 16 + 5, z / 16 - 2, 3, 2, 0.5);
  const { d, t } = splineDist(L, x, z);
  let fairway = smoothstep(L.halfWidth + 3, L.halfWidth - 3, d + n * 6) * smoothstep(0.0, 0.03, t);
  if (L.par === 3) fairway *= smoothstep(0.15, 0.3, t); // par 3s carry rough before the fairway
  const eg = ellipseDist(x, z, L.green) + n * 0.05;
  const green = smoothstep(1.06, 0.97, eg);
  fairway = Math.max(fairway, smoothstep(1.55, 1.12, eg));
  const tdx = Math.abs(x - L.tee.x) / (L.tee.w / 2), tdz = Math.abs(z - L.tee.z) / (L.tee.l / 2);
  const tee = smoothstep(1.06, 0.98, Math.max(tdx, tdz));
  let sand = 0;
  for (const b of L.bunkers) { const e = ellipseDist(x, z, b) + fbm(x / 6, z / 6, 2) * 0.08; sand = Math.max(sand, smoothstep(1.02, 0.94, e)); }
  const water = L.pond ? smoothstep(1.0, 0.96, pondDist(L, x, z)) : 0;
  return { fairway, green, sand, water, tee };
}

export class Course {
  constructor(layout) {
    const L = this.layout = layout;
    this.size = L.size; this.res = L.res; this.maskRes = L.maskRes;
    this.waterLevel = L.pond ? waterLevel(L) : -999;
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
      if (d > 120 && (!L.pond || ellipseDist(x, z, L.pond) > 2.5)) continue;
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

  inBounds(x, z) { const h = this.size / 2 - 12; return x > -h && x < h && z > -h && z < h; }
}
