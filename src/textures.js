// All textures are painted at load time onto canvases — nothing is downloaded.
import * as THREE from 'three';
import { mulberry32, fbm, clamp } from './noise.js';

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function makeTex(c, { srgb = true, repeat = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

function hsl(h, s, l) { return `hsl(${h},${s}%,${l}%)`; }

/** Turf: noisy base + thousands of tiny blade strokes, tileable. */
export function grassTexture({ size = 512, seed = 7, hue = 95, sat = 45, light = 30, blades = 14000, period = 6 } = {}) {
  const c = canvas(size, size), ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = fbm(x / size * period, y / size * period, 5, 2, 0.55, period);
    const n2 = fbm(x / size * period * 7, y / size * period * 7, 3, 2, 0.5, period * 7);
    const l = light + n * 7 + n2 * 4;
    const h = hue + n * 8;
    const s = sat + n2 * 10;
    const rgb = hslToRgb(h / 360, clamp(s, 0, 100) / 100, clamp(l, 0, 100) / 100);
    const i = (y * size + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.lineCap = 'round';
  for (let i = 0; i < blades; i++) {
    const x = rnd() * size, y = rnd() * size;
    const len = 3 + rnd() * 7, ang = -Math.PI / 2 + (rnd() - 0.5) * 1.4;
    const l = light + 6 + rnd() * 22, h = hue + (rnd() - 0.5) * 22;
    ctx.strokeStyle = hsl(h, sat + rnd() * 15, l);
    ctx.lineWidth = 0.6 + rnd() * 1.1;
    ctx.globalAlpha = 0.45 + rnd() * 0.4;
    for (const [ox, oy] of [[0, 0], [size, 0], [-size, 0], [0, size], [0, -size]]) {
      ctx.beginPath(); ctx.moveTo(x + ox, y + oy); ctx.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len); ctx.stroke();
    }
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

export function sandTexture({ size = 512, seed = 11 } = {}) {
  const c = canvas(size, size), ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = fbm(x / size * 4, y / size * 4, 4, 2, 0.5, 4);
    const ripple = Math.sin((x * 0.4 + y * 0.9) / size * 60 + n * 6) * 0.5;
    const g = fbm(x / size * 90, y / size * 90, 2, 2, 0.5, 90);
    const l = 72 + n * 5 + ripple * 2 + g * 5;
    const rgb = hslToRgb(42 / 360, 0.32 + n * 0.05, clamp(l, 0, 100) / 100);
    const i = (y * size + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(${140 + rnd() * 60 | 0},${120 + rnd() * 50 | 0},${80 + rnd() * 40 | 0},${0.3 + rnd() * 0.4})`;
    ctx.fillRect(rnd() * size, rnd() * size, 1, 1);
  }
  return c;
}

export function barkTexture({ w = 256, h = 512, seed = 21 } = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  const img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const n = fbm(x / w * 12, y / h * 3, 4, 2, 0.5, 12);
    const streak = fbm(x / w * 40, y / h * 2, 3, 2, 0.6, 40);
    const l = 22 + n * 8 + streak * 9;
    const rgb = hslToRgb((28 + n * 8) / 360, 0.28, clamp(l, 0, 100) / 100);
    const i = (y * w + x) * 4; d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  ctx.strokeStyle = 'rgba(20,12,6,0.5)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 90; i++) {
    const x = rnd() * w, y0 = rnd() * h, len = 40 + rnd() * 160;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x + (rnd() - 0.5) * 8, y0 + len); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + w, y0); ctx.lineTo(x + w + (rnd() - 0.5) * 8, y0 + len); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - w, y0); ctx.lineTo(x - w + (rnd() - 0.5) * 8, y0 + len); ctx.stroke();
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
    // Sprays of needles radiating from short twigs.
    for (let t = 0; t < 7; t++) {
      const tx = cx + (rnd() - 0.5) * size * 0.6, ty = cy + (rnd() - 0.5) * size * 0.6;
      const ta = rnd() * Math.PI * 2, tl = 40 + rnd() * 50;
      ctx.strokeStyle = 'rgba(70,45,25,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + Math.cos(ta) * tl, ty + Math.sin(ta) * tl); ctx.stroke();
      for (let n = 0; n < 60; n++) {
        const s = rnd(), px = tx + Math.cos(ta) * tl * s, py = ty + Math.sin(ta) * tl * s;
        const na = ta + (rnd() < 0.5 ? 1 : -1) * (0.5 + rnd() * 0.9), nl = 10 + rnd() * 16;
        ctx.strokeStyle = hsl(hue + (rnd() - 0.5) * 20, 35 + rnd() * 20, 18 + rnd() * 18);
        ctx.lineWidth = 1.2 + rnd();
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(na) * nl, py + Math.sin(na) * nl); ctx.stroke();
      }
    }
  } else {
    for (let i = 0; i < 34; i++) {
      const r = rnd() * size * 0.42, a = rnd() * Math.PI * 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const rot = rnd() * Math.PI * 2, rx = 11 + rnd() * 14, ry = rx * (0.45 + rnd() * 0.3);
      const l = 24 + rnd() * 22;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
      const g = ctx.createLinearGradient(-rx, 0, rx, 0);
      g.addColorStop(0, hsl(hue + (rnd() - 0.5) * 16, 45, l - 8));
      g.addColorStop(1, hsl(hue + (rnd() - 0.5) * 16, 50, l + 8));
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-rx, 0); ctx.lineTo(rx, 0); ctx.stroke();
      ctx.restore();
    }
  }
  return c;
}

/** A few tapered grass blades fanning up from the bottom centre. */
export function grassBladeTexture({ w = 128, h = 256, seed = 41, hue = 90 } = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  const rnd = mulberry32(seed);
  ctx.clearRect(0, 0, w, h);
  for (let i = 0; i < 9; i++) {
    const x0 = w / 2 + (rnd() - 0.5) * 30, top = 10 + rnd() * 60;
    const lean = (rnd() - 0.5) * 70, width = 4 + rnd() * 5;
    const g = ctx.createLinearGradient(0, h, 0, top);
    g.addColorStop(0, hsl(hue - 10, 40, 16));
    g.addColorStop(0.6, hsl(hue + rnd() * 10, 48, 30 + rnd() * 8));
    g.addColorStop(1, hsl(hue + 20, 55, 46 + rnd() * 10));
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
    const r = Math.hypot(u * 1.0, v * 1.6);
    const n = fbm(x / size * 3 + seed, y / size * 3, 5, 2, 0.55) * 0.5 + 0.5;
    let a = clamp((n * 1.3 - r * 2.2), 0, 1); a = a * a * (3 - 2 * a);
    const shade = 235 + n * 20;
    const i = (y * size + x) * 4; d[i] = d[i + 1] = d[i + 2] = clamp(shade, 0, 255); d[i + 3] = a * 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Loose tileable noise used by the terrain shader to break up tiling. */
export function noiseTexture({ size = 256, seed = 61 } = {}) {
  const c = canvas(size, size), ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = fbm(x / size * 4 + seed, y / size * 4, 4, 2, 0.5, 4) * 0.5 + 0.5;
    const b = fbm(x / size * 16, y / size * 16 + seed, 3, 2, 0.5, 16) * 0.5 + 0.5;
    const i = (y * size + x) * 4; d[i] = a * 255; d[i + 1] = b * 255; d[i + 2] = 128; d[i + 3] = 255;
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
