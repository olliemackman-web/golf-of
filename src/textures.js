// All textures are painted at load time onto canvases — nothing is downloaded.
import * as THREE from 'three';
import { mulberry32, fbm, clamp } from './noise.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function makeTex(c, { srgb = true, repeat = true, aniso = 16 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function hsl(h, s, l) { return `hsl(${h},${s}%,${l}%)`; }

/**
 * Turf: a soil-dark base, patchy hue drift (yellow-green vs blue-green), then thousands of
 * short, thin blade strokes at two scales. Tileable. Kept fairly neutral so the terrain
 * shader can tint it per surface without the colours going neon.
 */
export function grassTexture({ size = 512, seed = 7, hue = 92, sat = 38, light = 27, blades = 16000, period = 6 } = {}) {
  const c = canvas(size, size), ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = fbm(x / size * period, y / size * period, 5, 2, 0.55, period);
    const n2 = fbm(x / size * period * 6, y / size * period * 6, 3, 2, 0.5, period * 6);
    const patch = fbm(x / size * period * 0.5 + 3, y / size * period * 0.5 + 7, 3, 2, 0.5, period * 0.5);
    const l = light - 4 + n * 5 + n2 * 3;
    const h = hue + patch * 14 - 4;            // patches drift toward yellow or blue-green
    const s = sat + n2 * 8 - patch * 6;
    const rgb = hslToRgb(h / 360, clamp(s, 0, 100) / 100, clamp(l, 0, 100) / 100);
    const i = (y * size + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.lineCap = 'round';
  const stroke = (x, y, len, ang, w, col, alpha) => {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.globalAlpha = alpha;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len); ctx.stroke();
    }
  };
  // long, dark understorey blades first, then short bright tips on top
  for (let i = 0; i < blades * 0.4; i++) {
    const x = rnd() * size, y = rnd() * size;
    stroke(x, y, 6 + rnd() * 9, -Math.PI / 2 + (rnd() - 0.5) * 1.8, 1.2 + rnd() * 1.2, hsl(hue + (rnd() - 0.5) * 18, sat + rnd() * 10, light - 6 + rnd() * 10), 0.22 + rnd() * 0.2);
  }
  for (let i = 0; i < blades * 1.25; i++) {
    const x = rnd() * size, y = rnd() * size;
    const lift = rnd();
    stroke(x, y, 2.5 + rnd() * 5.5, -Math.PI / 2 + (rnd() - 0.5) * 1.5, 0.8 + rnd() * 0.9, hsl(hue + (rnd() - 0.5) * 24, sat + 8 + rnd() * 14, light + 4 + lift * lift * 28), 0.3 + rnd() * 0.35);
  }
  ctx.globalAlpha = 1;
  return c;
}

/** Normal map derived from the luminance of a canvas (Sobel). */
export function normalFromCanvas(src, strength = 2.0) {
  const w = src.width, h = src.height;
  const sctx = src.getContext('2d'); const sd = sctx.getImageData(0, 0, w, h).data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (sd[i * 4] * 0.3 + sd[i * 4 + 1] * 0.59 + sd[i * 4 + 2] * 0.11) / 255;
  const c = canvas(w, h), ctx = c.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  const L = (x, y) => lum[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (L(x + 1, y - 1) + 2 * L(x + 1, y) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x - 1, y) + L(x - 1, y + 1));
    const dy = (L(x - 1, y + 1) + 2 * L(x, y + 1) + L(x + 1, y + 1)) - (L(x - 1, y - 1) + 2 * L(x, y - 1) + L(x + 1, y - 1));
    let nx = -dx * strength, ny = -dy * strength, nz = 1;
    const len = Math.hypot(nx, ny, nz); nx /= len; ny /= len; nz /= len;
    const i = (y * w + x) * 4; d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Raked bunker sand: pale, slightly warm, fine rake ripples and a few darker grains. */
export function sandTexture({ size = 512, seed = 11 } = {}) {
  const c = canvas(size, size), ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = fbm(x / size * 4, y / size * 4, 4, 2, 0.5, 4);
    const ripple = Math.sin((x * 0.3 + y * 0.95) / size * 110 + n * 4) * 0.5;
    const g = fbm(x / size * 120, y / size * 120, 2, 2, 0.5, 120);
    const l = 72 + n * 4 + ripple * 2.5 + g * 4;
    const rgb = hslToRgb((40 + n * 4) / 360, 0.28 + n * 0.04, clamp(l, 0, 100) / 100);
    const i = (y * size + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 6000; i++) {
    ctx.fillStyle = `rgba(${150 + rnd() * 60 | 0},${130 + rnd() * 50 | 0},${95 + rnd() * 40 | 0},${0.25 + rnd() * 0.35})`;
    ctx.fillRect(rnd() * size, rnd() * size, 1, 1);
  }
  return c;
}

/** Bark: grey-brown, low saturation, with deep vertical fissures and lighter ridges. */
export function barkTexture({ w = 256, h = 512, seed = 21 } = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  const img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm(x / w * 12, y / h * 3, 4, 2, 0.5, 12);
    const streak = fbm(x / w * 48, y / h * 2, 3, 2, 0.6, 48);
    const ridge = 1 - Math.abs(fbm(x / w * 24, y / h * 1.5, 2, 2, 0.5, 24));
    const l = 17 + n * 6 + streak * 7 + ridge * 6;
    const rgb = hslToRgb((26 + n * 10) / 360, 0.13 + Math.max(0, n) * 0.06, clamp(l, 0, 100) / 100);
    const i = (y * w + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 140; i++) {
    const x = rnd() * w, y0 = rnd() * h, len = 40 + rnd() * 200;
    const dark = rnd() < 0.7;
    ctx.strokeStyle = dark ? 'rgba(12,9,6,0.55)' : 'rgba(120,110,95,0.22)'; ctx.lineWidth = dark ? 1 + rnd() * 1.5 : 1;
    for (const ox of [0, w, -w]) { ctx.beginPath(); ctx.moveTo(x + ox, y0); ctx.lineTo(x + ox + (rnd() - 0.5) * 10, y0 + len); ctx.stroke(); }
  }
  // lichen and moss flecks
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = rnd() < 0.5 ? `rgba(120,130,90,${0.08 + rnd() * 0.12})` : `rgba(90,110,70,${0.08 + rnd() * 0.1})`;
    ctx.beginPath(); ctx.ellipse(rnd() * w, rnd() * h, 2 + rnd() * 6, 1 + rnd() * 3, rnd() * 3, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

/** A cluster of leaves on transparent — many of these cards make a canopy. */
export function leafCardTexture({ size = 256, seed = 31, hue = 100, conifer = false } = {}) {
  const c = canvas(size, size), ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2;
  if (conifer) {
    // Sprays of needles radiating from short twigs; denser, darker and bluer than broadleaf.
    ctx.lineCap = 'round';
    for (let t = 0; t < 10; t++) {
      const tx = cx + (rnd() - 0.5) * size * 0.6, ty = cy + (rnd() - 0.5) * size * 0.6;
      const ta = rnd() * Math.PI * 2, tl = 40 + rnd() * 55;
      ctx.strokeStyle = 'rgba(60,40,24,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(ta) * tl, ty + Math.sin(ta) * tl); ctx.stroke();
      for (let n = 0; n < 80; n++) {
        const s = rnd(), px = tx + Math.cos(ta) * tl * s, py = ty + Math.sin(ta) * tl * s;
        const na = ta + (rnd() < 0.5 ? 1 : -1) * (0.45 + rnd() * 0.9), nl = 9 + rnd() * 15;
        ctx.strokeStyle = hsl(hue + 8 + (rnd() - 0.5) * 18, 28 + rnd() * 18, 14 + s * 6 + rnd() * 14);
        ctx.lineWidth = 1.0 + rnd() * 0.8;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); ctx.stroke();
      }
    }
  } else {
    // A twiggy clump: a few branchlets from the centre, each carrying many small pointed leaves.
    // Leaves deep in the clump are darker, the outer ones catch the light, so a card reads as a
    // lit volume rather than a flat sticker.
    const leaf = (x, y, rot, len, wid, l, sat, alpha) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.globalAlpha = alpha;
      const g = ctx.createLinearGradient(0, -len * 0.5, 0, len * 0.5);
      g.addColorStop(0, hsl(hue + (rnd() - 0.5) * 12, sat, l - 6));
      g.addColorStop(1, hsl(hue + (rnd() - 0.5) * 12, sat + 6, l + 7));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(0, -len * 0.5);
      ctx.quadraticCurveTo(wid, -len * 0.1, 0, len * 0.5);
      ctx.quadraticCurveTo(-wid, -len * 0.1, 0, -len * 0.5);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, -len * 0.45); ctx.lineTo(0, len * 0.45); ctx.stroke();
      ctx.restore();
    };
    ctx.strokeStyle = 'rgba(55,40,25,0.75)'; ctx.lineCap = 'round';
    for (let b = 0; b < 6; b++) {
      const ba = (b / 6) * Math.PI * 2 + (rnd() - 0.5) * 0.8, bl = size * (0.22 + rnd() * 0.18);
      const ex = cx + Math.cos(ba) * bl, ey = cy + Math.sin(ba) * bl;
      ctx.lineWidth = 2.2; ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
    }
    const total = 150;
    for (let i = 0; i < total; i++) {
      // radius biased outward so the silhouette is full, with a soft fall-off at the very edge
      const rr = Math.pow(rnd(), 0.6) * size * 0.46, a = rnd() * Math.PI * 2;
      const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr;
      const depth = rr / (size * 0.46);                       // 0 centre .. 1 edge
      const edgeFade = 1 - Math.max(0, (depth - 0.86) / 0.14); // thin out at the rim
      if (rnd() > edgeFade + 0.15) continue;
      const len = 22 + rnd() * 20, wid = len * (0.28 + rnd() * 0.16);
      const l = 17 + depth * 13 + rnd() * 10, sat = 33 + rnd() * 16;
      leaf(x, y, a + Math.PI / 2 + (rnd() - 0.5) * 1.2, len, wid, l, sat, 0.85 + rnd() * 0.15);
    }
    ctx.globalAlpha = 1;
  }
  return c;
}

/** A tuft of tapered grass blades fanning up from the bottom centre, dark at the root. */
export function grassBladeTexture({ w = 128, h = 256, seed = 41, hue = 88 } = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 14; i++) {
    const x0 = w / 2 + (rnd() - 0.5) * 34, top = 6 + rnd() * 70;
    const lean = (rnd() - 0.5) * 80, width = 2.5 + rnd() * 4;
    const dry = rnd() < 0.25; // the odd straw-coloured blade
    const g = ctx.createLinearGradient(0, h, 0, top);
    g.addColorStop(0, hsl(hue - 12, 35, 15));
    g.addColorStop(0.55, hsl(hue + rnd() * 8, dry ? 30 : 42, dry ? 36 : 30 + rnd() * 7));
    g.addColorStop(1, hsl(dry ? 52 : hue + 14, dry ? 40 : 46, dry ? 54 : 42 + rnd() * 9));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 - width, h);
    ctx.quadraticCurveTo(x0 + lean * 0.3 - width * 0.4, (h + top) / 2, x0 + lean, top);
    ctx.quadraticCurveTo(x0 + lean * 0.3 + width * 0.4, (h + top) / 2, x0 + width, h);
    ctx.closePath(); ctx.fill();
  }
  return c;
}

/** Hex-packed dimples as a bump map (dark = deep). */
export function ballBumpTexture({ w = 512, h = 256 } = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, w, h);
  const cols = 34, rows = 20, dx = w / cols, dy = h / rows;
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
    const x = (q + (r % 2) * 0.5) * dx, y = (r + 0.5) * dy;
    const rad = Math.min(dx, dy) * 0.42;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, '#3a3a3a'); g.addColorStop(0.8, '#8a8a8a'); g.addColorStop(1, '#ffffff');
    ctx.fillStyle = g;
    for (const ox of [0, w, -w]) { ctx.beginPath(); ctx.arc(x + ox, y, rad, 0, Math.PI * 2); ctx.fill(); }
  }
  return c;
}

export function flagTexture(number = 1) {
  const c = canvas(256, 160), ctx = c.getContext('2d');
  ctx.fillStyle = '#d31f2a'; ctx.fillRect(0, 0, 256, 160);
  const g = ctx.createLinearGradient(0, 0, 256, 0); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.3, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 160);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 110px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 128, 84);
  return c;
}

export function cloudTexture({ size = 256, seed = 51 } = {}) {
  const c = canvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size - 0.5, v = y / size - 0.5;
    const r = Math.hypot(u * 1.0, v * 1.7);
    const n = fbm(x / size * 3 + seed, y / size * 3, 6, 2, 0.55) * 0.5 + 0.5;
    let a = clamp((n * 1.25 - r * 2.0), 0, 1); a = a * a * (3 - 2 * a);
    // flat, slightly shaded bases and bright tops
    const shade = 205 + n * 30 + Math.max(0, -v) * 40;
    const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = clamp(shade, 0, 255); d[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Loose tileable noise used by the terrain shader to break up tiling.
 * r: slow patches, g: mid detail, b: ridged "worn / clover" patches, a: fine speckle.
 */
export function noiseTexture({ size = 256, seed = 61 } = {}) {
  const c = canvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = fbm(x / size * 4 + seed, y / size * 4, 4, 2, 0.5, 4) * 0.5 + 0.5;
    const b = fbm(x / size * 16, y / size * 16 + seed, 3, 2, 0.5, 16) * 0.5 + 0.5;
    const r = 1 - Math.abs(fbm(x / size * 8 + 5, y / size * 8 + 9, 3, 2, 0.5, 8));
    const s = fbm(x / size * 64 + 2, y / size * 64 + 4, 2, 2, 0.5, 64) * 0.5 + 0.5;
    const i = (y * size + x) * 4; d[i] = a * 255; d[i + 1] = b * 255; d[i + 2] = clamp(r * r, 0, 1) * 255; d[i + 3] = s * 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) { r = g = b = l; } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => { t = ((t % 1) + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
    r = f(h + 1 / 3); g = f(h); b = f(h - 1 / 3);
  }
  return [r * 255, g * 255, b * 255];
}

export { makeTex };
