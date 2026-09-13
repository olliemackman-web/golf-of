// Seeded PRNG + tileable gradient noise / fbm. Everything procedural in the
// game (terrain, textures, tree placement) is derived from these so the course
// is identical on every load.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PERM = new Uint8Array(512);
{
  const r = mulberry32(1337);
  const p = [];
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
}
const GRAD = [[1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1]];

function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
function lerp(a, b, t) { return a + (b - a) * t; }

/** 2D Perlin noise in [-1,1]. `period` (integer) makes it tile; 0 = no tiling. */
export function noise2(x, y, period = 0) {
  let xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  let x0 = xi, x1 = xi + 1, y0 = yi, y1 = yi + 1;
  if (period) { x0 = ((x0 % period) + period) % period; x1 = ((x1 % period) + period) % period; y0 = ((y0 % period) + period) % period; y1 = ((y1 % period) + period) % period; }
  x0 &= 255; x1 &= 255; y0 &= 255; y1 &= 255;
  const g00 = GRAD[PERM[x0 + PERM[y0]] & 7], g10 = GRAD[PERM[x1 + PERM[y0]] & 7];
  const g01 = GRAD[PERM[x0 + PERM[y1]] & 7], g11 = GRAD[PERM[x1 + PERM[y1]] & 7];
  const n00 = g00[0] * xf + g00[1] * yf, n10 = g10[0] * (xf - 1) + g10[1] * yf;
  const n01 = g01[0] * xf + g01[1] * (yf - 1), n11 = g11[0] * (xf - 1) + g11[1] * (yf - 1);
  const u = fade(xf), v = fade(yf);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.4142;
}

/** Fractal Brownian motion in roughly [-1,1]. */
export function fbm(x, y, octaves = 5, lacunarity = 2, gain = 0.5, period = 0) {
  let amp = 1, sum = 0, norm = 0, fx = x, fy = y, p = period;
  for (let i = 0; i < octaves; i++) {
    sum += amp * noise2(fx, fy, p);
    norm += amp; amp *= gain; fx *= lacunarity; fy *= lacunarity; if (p) p *= lacunarity;
  }
  return sum / norm;
}

export function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
export function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
export { lerp };
