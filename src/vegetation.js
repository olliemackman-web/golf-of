// Trees (instanced trunks + leaf cards), rough grass tufts, pond reeds, and
// the tree collision field the ball physics calls into.
import * as THREE from 'three';
import { mulberry32, fbm, smoothstep } from './noise.js';
import { splineDist, ellipseDist, SURF } from './courseData.js';
import { BALL_R } from './physics.js';

const windUniform = { value: 0 };
export function setWindTime(t) { windUniform.value = t; }

/** Vertex-shader wind for instanced foliage; weight by `uv.y` for blades. */
function addWind(mat, { byUv = false, amp = 0.12, freq = 1.0 } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <project_vertex>', `
vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
vec4 wp = modelMatrix * mvPosition;
float wt = uTime * ${freq.toFixed(2)};
float ph = wp.x * 0.13 + wp.z * 0.09;
float sway = sin(wt * 1.1 + ph) * 0.6 + sin(wt * 2.3 + ph * 2.7) * 0.25 + sin(wt * 4.1 + wp.y * 0.7) * 0.15;
float weight = ${byUv ? 'uv.y' : '1.0'};
wp.xyz += vec3(sway, sway * 0.15, sway * 0.5) * ${amp.toFixed(3)} * weight;
mvPosition = viewMatrix * wp;
gl_Position = projectionMatrix * mvPosition;`);
  };
}

export class TreeField {
  constructor() { this.trees = []; this.cell = 24; this.grid = new Map(); this.cooldown = 0; }
  add(t) { this.trees.push(t); const k = this.key(t.x, t.z); if (!this.grid.has(k)) this.grid.set(k, []); this.grid.get(k).push(t); }
  key(x, z) { return `${Math.floor(x / this.cell)},${Math.floor(z / this.cell)}`; }
  near(x, z) {
    const out = [];
    const cx = Math.floor(x / this.cell), cz = Math.floor(z / this.cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const g = this.grid.get(`${cx + i},${cz + j}`); if (g) for (const t of g) out.push(t); }
    return out;
  }
  /**
   * Called by Ball each sub-step (h = step length in seconds). Trunks are solid;
   * canopies are treated as sparse foliage with a mean free path, so a ball can
   * clip a thin edge and get through, or plunge into the middle and drop.
   */
  collide(ball, h = 1 / 480) {
    const p = ball.pos, v = ball.vel;
    if (ball.treeCooldown > 0) { ball.treeCooldown -= h; return false; }
    const cand = this.near(p.x, p.z);
    if (cand.length === 0) return false;
    for (const t of cand) {
      const dx = p.x - t.x, dz = p.z - t.z, d = Math.hypot(dx, dz);
      // trunk
      if (d < t.trunkR + BALL_R && p.y < t.y + t.trunkH) {
        const nx = dx / d, nz = dz / d;
        const vn = v.x * nx + v.z * nz;
        if (vn < 0) { v.x -= 1.6 * vn * nx; v.z -= 1.6 * vn * nz; v.x *= 0.38; v.z *= 0.38; v.y *= 0.45; ball.events.push({ type: 'tree', kind: 'trunk' }); ball.treeCooldown = 0.1; }
        p.x = t.x + nx * (t.trunkR + BALL_R + 0.01); p.z = t.z + nz * (t.trunkR + BALL_R + 0.01);
        return false;
      }
      // canopy
      const cy = p.y - (t.y + t.canopyY);
      const rr = (dx * dx + dz * dz) / (t.canopyR * t.canopyR) + (cy * cy) / (t.canopyRy * t.canopyRy);
      if (rr < 1) {
        const speed = Math.hypot(v.x, v.y, v.z);
        if (speed < 0.4) continue;
        // foliage is denser toward the centre of the crown
        const dens = (0.5 + t.density) * (1.4 - rr);
        const mfp = 1.8 / dens; // metres between branch contacts
        const pHit = 1 - Math.exp(-(speed * h) / mfp);
        const hsh = Math.abs(Math.sin(p.x * 12.9898 + p.y * 78.233 + p.z * 37.719) * 43758.5453) % 1;
        if (hsh < pHit) {
          const h2 = Math.abs(Math.sin(p.x * 3.7 + p.z * 9.1 + p.y * 5.3) * 12345.678) % 1;
          const h3 = Math.abs(Math.sin(p.x * 8.1 + p.z * 2.3 + p.y * 6.7) * 9876.543) % 1;
          const keep = 0.1 + h2 * 0.25;                 // branches soak up most of the pace
          const ang = (h3 - 0.5) * 2.0;
          const c = Math.cos(ang), s = Math.sin(ang);
          const nvx = (v.x * c - v.z * s) * keep, nvz = (v.x * s + v.z * c) * keep;
          v.x = nvx; v.z = nvz;
          v.y = Math.min(0, v.y) * 0.25 - 0.8 - h2 * 2.5;  // and the ball drops out of the tree
          ball.spin.x *= 0.1; ball.spin.y *= 0.1; ball.spin.z *= 0.1;
          ball.events.push({ type: 'tree', kind: 'canopy' });
          ball.treeCooldown = 0.12;
        }
      }
    }
    return false;
  }
}

export function buildVegetation(course, tex, quality = {}) {
  const CARDS_B = quality.cardsBroad || 52, CARDS_C = quality.cardsConifer || 64, MAX_TUFTS = quality.tufts || 60000, MAX_REEDS = quality.reeds || 9000;
  const rnd = mulberry32(2024);
  const group = new THREE.Group();
  const field = new TreeField();
  const L = course.layout;

  const okSpot = (x, z, minSpline) => {
    if (!course.inBounds(x, z)) return false;
    const { d, t } = splineDist(L, x, z);
    if (d < minSpline) return false;
    const s = course.surfaceAt(x, z);
    if (s.id !== SURF.ROUGH) return false;
    if (L.pond && ellipseDist(x, z, L.pond) < 1.25) return false;
    if (ellipseDist(x, z, L.green) < 2.2) return false;
    if (Math.hypot(x - L.tee.x, z - L.tee.z) < 14) return false;
    if (Math.hypot(x - L.tee.x, (z - L.tee.z) * 0.6) < 30 && z < L.tee.z) return false; // keep the overhead aim camera behind the tee clear
    for (const b of L.bunkers) if (ellipseDist(x, z, b) < 1.8) return false;
    return true;
  };

  const specs = [];
  const addTree = (x, z, forceKind) => {
    const n = fbm(x / 70 + 4, z / 70 - 6, 2);
    const conifer = forceKind != null ? forceKind : (n > 0.15 ? rnd() < 0.75 : rnd() < 0.2);
    const h = conifer ? 11 + rnd() * 9 : 8 + rnd() * 7;
    const trunkR = 0.18 + h * 0.022 + rnd() * 0.08;
    const canopyR = conifer ? h * 0.2 + rnd() * 0.8 : h * 0.36 + rnd() * 1.2;
    const y = course.heightAt(x, z) - 0.15;
    const spec = { x, z, y, h, trunkR, conifer, canopyR, canopyRy: conifer ? h * 0.42 : canopyR * 0.85, canopyY: conifer ? h * 0.55 : h - canopyR * 0.75, trunkH: conifer ? h * 0.3 : h - canopyR, density: conifer ? 0.5 : 0.3, tint: 0.85 + rnd() * 0.3, rot: rnd() * Math.PI * 2 };
    specs.push(spec); field.add(spec);
  };

  // Tree lines flanking the fairway
  for (let i = 0; i < 900; i++) {
    const a = rnd() * Math.PI * 2, r = 30 + Math.pow(rnd(), 0.7) * 55;
    // sample along the corridor: pick a random point along the spline
    const k = Math.floor(rnd() * (L.spline.length - 1)), u = rnd();
    const sx = L.spline[k][0] + (L.spline[k + 1][0] - L.spline[k][0]) * u, sz = L.spline[k][1] + (L.spline[k + 1][1] - L.spline[k][1]) * u;
    const x = sx + Math.cos(a) * r, z = sz + Math.sin(a) * r;
    if (okSpot(x, z, 27)) addTree(x, z);
  }
  // Perimeter woodland
  for (let i = 0; i < 2600; i++) {
    const x = (rnd() - 0.5) * (L.size - 20), z = (rnd() - 0.5) * (L.size - 20);
    const { d } = splineDist(L, x, z);
    if (d < 75) continue;
    const dens = fbm(x / 120 + 1, z / 120 + 3, 3) * 0.5 + 0.5;
    if (rnd() > dens * 1.1 + 0.15) continue;
    if (okSpot(x, z, 60)) addTree(x, z);
  }
  // Specimen trees around the pond and the green
  for (let i = 0; i < (L.pond ? 12 : 0); i++) { const a = rnd() * Math.PI * 2; const x = L.pond.x + Math.cos(a) * (L.pond.rx + 8 + rnd() * 10), z = L.pond.z + Math.sin(a) * (L.pond.rz + 8 + rnd() * 10); if (okSpot(x, z, 24)) addTree(x, z, false); }
  for (let i = 0; i < 10; i++) { const a = rnd() * Math.PI * 2; const x = L.green.x + Math.cos(a) * (32 + rnd() * 14), z = L.green.z + Math.sin(a) * (30 + rnd() * 14); if (okSpot(x, z, 25)) addTree(x, z, rnd() < 0.5); }

  // ---- Trunks ----
  const trunkGeo = new THREE.CylinderGeometry(0.55, 1, 1, 8, 1);
  trunkGeo.translate(0, 0.5, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ map: tex.bark, roughness: 0.95 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, specs.length);
  trunks.castShadow = true; trunks.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pv = new THREE.Vector3();
  specs.forEach((t, i) => {
    const th = t.conifer ? t.h * 0.95 : t.trunkH + t.canopyR * 0.6;
    m.compose(pv.set(t.x, t.y, t.z), q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot), s.set(t.trunkR, th, t.trunkR));
    trunks.setMatrixAt(i, m);
  });
  group.add(trunks);

  // ---- Canopies: leaf cards ----
  const cardGeo = new THREE.PlaneGeometry(1, 1);
  const makeCards = (texture, list, conifer) => {
    let count = 0; for (const t of list) count += conifer ? CARDS_C : CARDS_B;
    const mat = new THREE.MeshStandardMaterial({ map: texture, alphaTest: quality.aa ? 0.3 : 0.45, alphaToCoverage: !!quality.aa, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    addWind(mat, { amp: 0.14, freq: 0.9 });
    const mesh = new THREE.InstancedMesh(cardGeo, mat, count);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest: 0.45 });
    const color = new THREE.Color();
    let i = 0;
    for (const t of list) {
      const n = conifer ? CARDS_C : CARDS_B;
      for (let k = 0; k < n; k++) {
        let px, py, pz, size;
        if (conifer) {
          const u = k / n; // 0 bottom .. 1 top
          const yy = t.h * 0.3 + u * t.h * 0.7;
          const rr = t.canopyR * (1 - u * 0.92) * (0.6 + rnd() * 0.55);
          const a = rnd() * Math.PI * 2;
          px = Math.cos(a) * rr; pz = Math.sin(a) * rr; py = yy;
          size = 1.4 + t.canopyR * 0.7 * (1 - u * 0.5) + rnd() * 0.8;
        } else {
          const a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1), rr = t.canopyR * Math.cbrt(rnd()) * 0.95;
          px = Math.sin(b) * Math.cos(a) * rr; pz = Math.sin(b) * Math.sin(a) * rr; py = t.canopyY + Math.cos(b) * rr * 0.8;
          size = t.canopyR * (0.55 + rnd() * 0.45);
        }
        const e = new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI);
        if (conifer) e.set(-0.9 + rnd() * 0.5, Math.atan2(px, pz) + (rnd() - 0.5), (rnd() - 0.5) * 0.4);
        m.compose(pv.set(t.x + px, t.y + py, t.z + pz), q.setFromEuler(e), s.set(size, size, 1));
        mesh.setMatrixAt(i, m);
        const shade = (0.75 + 0.35 * (py / t.h)) * t.tint * (0.85 + rnd() * 0.3);
        color.setRGB(shade, shade, shade);
        mesh.setColorAt(i, color);
        i++;
      }
    }
    mesh.count = i;
    return mesh;
  };
  const broad = specs.filter((t) => !t.conifer), cone = specs.filter((t) => t.conifer);
  const half = Math.floor(broad.length / 2);
  group.add(makeCards(tex.leaf, broad.slice(0, half), false));
  group.add(makeCards(tex.leaf2, broad.slice(half), false));
  group.add(makeCards(tex.needle, cone, true));

  // ---- Rough grass tufts + reeds ----
  const tuftGeo = (function () {
    const a = new THREE.PlaneGeometry(1, 1); a.translate(0, 0.5, 0);
    const b = a.clone(); b.rotateY(Math.PI / 2);
    const c = a.clone(); c.rotateY(Math.PI / 4);
    const merged = mergeGeos([a, b, c]);
    return merged;
  })();
  const tuftMat = new THREE.MeshStandardMaterial({ map: tex.blade, alphaTest: quality.aa ? 0.35 : 0.5, alphaToCoverage: !!quality.aa, side: THREE.DoubleSide, roughness: 1 });
  addWind(tuftMat, { byUv: true, amp: 0.09, freq: 1.4 });
  const tuftSpots = [];
  for (let i = 0; i < 260000; i++) {
    const x = (rnd() - 0.5) * (L.size - 40), z = (rnd() - 0.5) * (L.size - 40);
    const { d } = splineDist(L, x, z);
    if (d > 95) continue;
    const sf = course.surfaceAt(x, z);
    if (sf.id !== SURF.ROUGH) continue;
    if (L.pond && ellipseDist(x, z, L.pond) < 1.15) continue;
    // denser near the fairway edge, thinning further out
    const keep = 0.25 + 0.75 * (1 - smoothstep(20, 70, d));
    if (rnd() > keep) continue;
    tuftSpots.push({ x, z, reed: false });
    if (tuftSpots.length >= MAX_TUFTS) break;
  }
  for (let i = 0; i < (L.pond ? MAX_REEDS : 0); i++) {
    const a = rnd() * Math.PI * 2, rr = 1.0 + rnd() * 0.12;
    const x = L.pond.x + Math.cos(a) * L.pond.rx * rr, z = L.pond.z + Math.sin(a) * L.pond.rz * rr;
    if (course.heightAt(x, z) < course.waterLevel - 0.05) continue;
    tuftSpots.push({ x, z, reed: true });
  }
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftSpots.length);
  tufts.receiveShadow = true;
  const col = new THREE.Color();
  tuftSpots.forEach((t, i) => {
    const y = course.heightAt(t.x, t.z) - 0.02;
    const sc = t.reed ? 0.45 + rnd() * 0.35 : 0.35 + rnd() * 0.35;
    const hgt = t.reed ? 1.0 + rnd() * 0.7 : 0.28 + rnd() * 0.3;
    m.compose(pv.set(t.x, y, t.z), q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.25, rnd() * Math.PI, (rnd() - 0.5) * 0.25)), s.set(sc, hgt, sc));
    tufts.setMatrixAt(i, m);
    if (t.reed) col.setRGB(0.75 + rnd() * 0.2, 0.62 + rnd() * 0.15, 0.35); else { const v = 0.75 + rnd() * 0.45; col.setRGB(v * (0.95 + rnd() * 0.2), v, v * 0.7); }
    tufts.setColorAt(i, col);
  });
  group.add(tufts);

  return { group, field, count: specs.length, tufts: tuftSpots.length };
}

function mergeGeos(geos) {
  const pos = [], uv = [], norm = [], idx = [];
  let off = 0;
  for (const g of geos) {
    const p = g.attributes.position.array, u = g.attributes.uv.array, n = g.attributes.normal.array, ix = g.index.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < u.length; i++) uv.push(u[i]);
    for (let i = 0; i < n.length; i++) norm.push(n[i]);
    for (let i = 0; i < ix.length; i++) idx.push(ix[i] + off);
    off += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
  out.setIndex(idx);
  return out;
}
