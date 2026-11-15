// Trees (instanced trunks + leaf cards), rough grass tufts, pond reeds, and
// the tree collision field the ball physics calls into.
import * as THREE from 'three';
import { mulberry32, fbm, smoothstep } from './noise.js';
import { splineDist, ellipseDist, SURF, alongHole, ponds, fescueWeight, pathDist } from './courseData.js';
import { BALL_R } from './physics.js';

const windUniform = { value: 0 };
export function setWindTime(t) { windUniform.value = t; }

/**
 * Vertex-shader wind for instanced foliage; weight by `uv.y` for blades. With `crown`, each card
 * also takes its normal from the per-instance `aOut` attribute (the direction out of the tree's
 * crown) instead of its own face, so a canopy shades as one rounded mass: bright toward the sun,
 * dark on the far side.
 */
function addWind(mat, { byUv = false, amp = 0.12, freq = 1.0, crown = false } = {}) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;' + (crown ? '\nattribute vec3 aOut;' : ''))
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
    if (crown) {
      shader.vertexShader = shader.vertexShader
        .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = aOut;')
        .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalize(normalMatrix * aOut);');
      // no flipping for the back face: the crown normal is the same seen from either side of a card
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
    }
  };
  mat.customProgramCacheKey = () => `wind-${byUv}-${amp}-${freq}-${crown}`;
}

/**
 * Individual grass blades in a disc around the ball, so the ground under the golfer's eyes is
 * grass and not a painted texture. One instanced mesh, laid out again each time the ball comes
 * to rest: long blades in the rough, a short nap on the fairway, nothing on greens, tees or sand.
 */
export class GrassPatch {
  /** `grassCanvas` is the turf texture's canvas: the blades take its average colour so they match the ground. */
  constructor(count = 12000, radius = 3.6, grassCanvas = null) {
    this.count = count; this.radius = radius;
    this.base = [0.09, 0.2, 0.05];
    if (grassCanvas && grassCanvas.getContext) {
      const d = grassCanvas.getContext('2d').getImageData(0, 0, grassCanvas.width, grassCanvas.height).data, lin = (u) => Math.pow(u / 255, 2.2);
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4 * 37) { r += lin(d[i]); g += lin(d[i + 1]); b += lin(d[i + 2]); n++; }
      this.base = [r / n, g / n, b / n];
    }
    // a tapered, slightly bent blade; normals point up so it takes the light like the turf under it
    const P = [[-0.5, 0], [0.5, 0], [-0.32, 0.5], [0.32, 0.5], [0, 1]];
    const pos = [], uv = [], nor = [], col = [];
    for (const [x, y] of P) { pos.push(x, y, 0.28 * y * y); uv.push(x + 0.5, y); nor.push(0, 1, 0); const c = 0.62 + 0.62 * y; col.push(c, c, c * 0.92); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    // both windings, single-sided: a double-sided material would flip the normal on the far face and black it out
    geo.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4, 0, 2, 1, 1, 2, 3, 2, 4, 3]);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    addWind(mat, { byUv: true, amp: 0.014, freq: 1.7 });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.receiveShadow = true; this.mesh.frustumCulled = false; this.mesh.visible = false;
    // fixed scatter, denser toward the middle where the eye is
    const rnd = mulberry32(977); this.spots = new Float32Array(count * 5);
    for (let i = 0; i < count; i++) { const a = rnd() * Math.PI * 2, r = radius * Math.pow(rnd(), 0.72); this.spots.set([Math.cos(a) * r, Math.sin(a) * r, rnd(), rnd(), rnd()], i * 5); }
  }

  /** Lay the blades out around (cx, cz) on this course. */
  place(course, cx, cz) {
    const L = course.layout, R = this.radius, S = this.spots, B = this.base;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      const ox = S[i * 5], oz = S[i * 5 + 1], r1 = S[i * 5 + 2], r2 = S[i * 5 + 3], r3 = S[i * 5 + 4];
      const x = cx + ox, z = cz + oz, r = Math.hypot(ox, oz);
      const sf = course.surfaceAt(x, z).id;
      let h = 0, w = 0;
      if (sf === SURF.ROUGH && fescueWeight(L, x, z) < 0.3) { h = 0.05 + r1 * 0.06; w = 0.009 + r2 * 0.008; const k = 1.0 + r3 * 0.45; c.setRGB(B[0] * 0.62 * k, B[1] * 0.78 * k, B[2] * 0.46 * k); }
      else if (sf === SURF.FAIRWAY && r < R * 0.7) { h = 0.014 + r1 * 0.012; w = 0.007 + r2 * 0.005; const k = 0.9 + r3 * 0.25; c.setRGB(B[0] * 1.02 * k, B[1] * 1.2 * k, B[2] * 0.6 * k); }
      // thin out toward the rim so the patch has no edge, and keep the ball itself in view
      h *= (1 - smoothstep(R * 0.6, R, r)) * (0.4 + 0.6 * smoothstep(0.05, 0.3, r));
      if (h <= 0.002) { m.makeScale(0, 0, 0); this.mesh.setMatrixAt(i, m); continue; }
      e.set((r1 - 0.5) * 0.5, r2 * Math.PI * 2, (r3 - 0.5) * 0.5);
      m.compose(p.set(x, course.heightAt(x, z) - 0.004, z), q.setFromEuler(e), s.set(w, h, w));
      this.mesh.setMatrixAt(i, m); this.mesh.setColorAt(i, c);
    }
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.visible = true;
  }
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
  const CARDS_B = quality.cardsBroad || 84, CARDS_C = quality.cardsConifer || 64, MAX_TUFTS = quality.tufts || 60000, MAX_REEDS = quality.reeds || 9000;
  const rnd = mulberry32(2024);
  const group = new THREE.Group();
  const field = new TreeField();
  const L = course.layout;

  const sc = L.scenery || null;
  const okSpot = (x, z, minSpline) => {
    if (!course.inBounds(x, z)) return false;
    if (pathDist(L, x, z) < 3.2) return false;                                   // the cart path stays clear
    for (const k of L.clear || []) if (Math.hypot(x - k.x, z - k.z) < k.r) return false; // and so do the buildings
    const { d, t } = splineDist(L, x, z);
    if (d < minSpline) return false;
    const s = course.surfaceAt(x, z);
    if (s.id !== SURF.ROUGH) return false;
    if (ponds(L).some((q) => ellipseDist(x, z, q) < 1.25)) return false;
    if (ellipseDist(x, z, L.green) < 2.2) return false;
    if (Math.hypot(x - L.tee.x, z - L.tee.z) < 14) return false;
    if (Math.hypot(x - L.tee.x, (z - L.tee.z) * 0.6) < 30 && z < L.tee.z) return false; // keep the overhead aim camera behind the tee clear
    for (const b of L.bunkers) if (ellipseDist(x, z, b) < 1.8) return false;
    return true;
  };

  const specs = [];
  const addTree = (x, z, forceKind, o = {}) => {
    const n = fbm(x / 70 + 4, z / 70 - 6, 2);
    const conifer = forceKind != null ? forceKind : (n > 0.3 ? rnd() < 0.5 : rnd() < 0.08); // parkland: mostly broadleaf, with stands of pine
    // a few species within each kind: oak and birch among the broadleaves, spruce and Scots pine among the conifers
    if (forceKind == null) {
      const r = rnd();
      if (!conifer && r < 0.24) { const h = 11 + rnd() * 6; o = { h, canopyR: h * 0.2 + rnd() * 0.5, canopyRy: h * 0.36, canopyY: h * 0.6, trunkH: h * 0.34, trunkR: 0.11 + h * 0.012, density: 0.25, tint: 1.08 + rnd() * 0.12, warm: 0.7 + rnd() * 0.3, species: 'birch' }; }
      else if (conifer && r < 0.42) { const h = 12 + rnd() * 8; o = { h, canopyR: h * 0.24 + rnd() * 0.6, canopyRy: h * 0.22, canopyY: h * 0.78, trunkH: h * 0.56, density: 0.4, tint: 0.92, species: 'pine', crownFrom: 0.56 }; }
    }
    const h = o.h || (conifer ? 11 + rnd() * 8 : 8.5 + rnd() * 8);
    const trunkR = o.trunkR || 0.18 + h * 0.022 + rnd() * 0.08;
    const canopyR = o.canopyR || (conifer ? h * 0.2 + rnd() * 0.8 : h * 0.36 + rnd() * 1.2);
    const y = course.heightAt(x, z) - 0.15;
    const spec = { x, z, y, h, trunkR, conifer, canopyR, canopyRy: o.canopyRy || (conifer ? h * 0.42 : canopyR * 0.85), canopyY: o.canopyY != null ? o.canopyY : (conifer ? h * 0.55 : h - canopyR * 0.75), trunkH: o.trunkH || (conifer ? h * 0.3 : h - canopyR), density: o.density || (conifer ? 0.5 : 0.3), tint: o.tint || 0.85 + rnd() * 0.3, rot: rnd() * Math.PI * 2, noCards: !!o.noCards, cards: o.cards, species: o.species || (conifer ? 'spruce' : 'oak'), crownFrom: o.crownFrom || 0.3, warm: o.warm };
    specs.push(spec); if (!o.noCollide) field.add(spec);
    return spec;
  };
  /** Named tree kinds for hand-placed scenery (sizes from the drone footage). */
  const KIND = {
    oak: (h) => ({ h, conifer: false, canopyR: h * 0.55, canopyRy: h * 0.42, canopyY: h - h * 0.42 * 0.85, trunkH: h * 0.4, trunkR: 0.3 + h * 0.035, density: 0.45, tint: 0.95, cards: Math.round(70 + h * 5) }),
    willow: (h) => ({ h, conifer: false, canopyR: h * 0.5, canopyRy: h * 0.5, canopyY: h * 0.55, trunkH: h * 0.3, trunkR: 0.25 + h * 0.03, density: 0.4, tint: 1.15, cards: Math.round(60 + h * 5) }),
    cedar: (h) => ({ h, conifer: true, canopyR: h * 0.26, canopyRy: h * 0.45, canopyY: h * 0.55, trunkH: h * 0.2, trunkR: 0.3 + h * 0.035, density: 0.7, tint: 0.8, cards: Math.round(70 + h * 4) }),
    pine: (h) => ({ h, conifer: true, canopyR: h * 0.24, canopyY: h * 0.62, trunkH: h * 0.45, trunkR: 0.2 + h * 0.025, density: 0.45, tint: 0.9, cards: 60 }),
    poplar: (h) => ({ h, conifer: false, canopyR: h * 0.2, canopyRy: h * 0.42, canopyY: h * 0.56, trunkH: h * 0.3, trunkR: 0.2 + h * 0.02, density: 0.5, tint: 1.05, cards: Math.round(40 + h * 3) }),
    bush: (h) => ({ h, conifer: false, canopyR: h * 0.75, canopyRy: h * 0.55, canopyY: h * 0.55, trunkH: h * 0.3, trunkR: 0.1, density: 0.5, tint: 0.85, cards: 16 }),
  };

  // Hand-placed scenery (specimen trees, hedge + fence, lake reeds) when the hole has it
  if (sc) {
    for (const t of sc.trees || []) {
      const p = alongHole(L, t.at, t.off);
      const k = KIND[t.kind] || KIND.oak; const o = k(t.h || 12);
      addTree(p.x, p.z, o.conifer, o);
    }
    if (sc.hedge) {
      const hg = sc.hedge, sign = hg.side === 'L' ? 1 : -1;
      const rows = hg.thick ? [0, 3.5, 7] : [0];
      for (const row of rows) for (let t = hg.from; t <= hg.to; t += 2.0 / (L.len || 400)) {
        const p = alongHole(L, t, sign * (hg.off + row + (rnd() - 0.5) * 1.6));
        const o = KIND.bush(hg.thick ? 3.5 + rnd() * 3 + row * 0.5 : 2.4 + rnd() * 1.2); addTree(p.x, p.z, false, { ...o, noCollide: rnd() < 0.5 });
      }
      if (hg.thick) for (let t = hg.from; t <= hg.to; t += 9 / (L.len || 400)) { const p = alongHole(L, t, sign * (hg.off + 6 + rnd() * 6)); const o = KIND.oak(9 + rnd() * 5); addTree(p.x, p.z, false, o); }
      for (let t = hg.from; t <= (hg.thick ? -1 : hg.to); t += 4.5 / (L.len || 400)) {
        const p = alongHole(L, t, sign * (hg.off - 2.2));
        addTree(p.x, p.z, false, { h: 1.25, trunkR: 0.055, canopyR: 0.01, canopyY: 1, trunkH: 1.25, noCards: true, noCollide: true, tint: 1 });
      }
    }
  }
  // Tree lines flanking the fairway
  for (let i = 0; i < (sc && sc.style === 'parkland' ? 0 : 900); i++) {
    const a = rnd() * Math.PI * 2, r = 30 + Math.pow(rnd(), 0.7) * 55;
    // sample along the corridor: pick a random point along the spline
    const k = Math.floor(rnd() * (L.spline.length - 1)), u = rnd();
    const sx = L.spline[k][0] + (L.spline[k + 1][0] - L.spline[k][0]) * u, sz = L.spline[k][1] + (L.spline[k + 1][1] - L.spline[k][1]) * u;
    const x = sx + Math.cos(a) * r, z = sz + Math.sin(a) * r;
    if (okSpot(x, z, 33)) addTree(x, z);
  }
  // Perimeter woodland
  for (let i = 0; i < 2600; i++) {
    const x = (rnd() - 0.5) * (L.size - 20), z = (rnd() - 0.5) * (L.size - 20);
    const { d, t } = splineDist(L, x, z);
    if (d < 75) continue;
    if (sc && sc.woodland) {
      // parkland: keep the woods well away, except the belt behind the green
      const gdx = x - L.green.x, gdz = z - L.green.z;
      const endDir = L.spline.length > 1 ? Math.atan2(L.spline[L.spline.length - 1][0] - L.spline[L.spline.length - 2][0], L.spline[L.spline.length - 1][1] - L.spline[L.spline.length - 2][1]) : 0;
      const ahead = gdx * Math.sin(endDir) + gdz * Math.cos(endDir);
      const behind = ahead > 32 && Math.abs(gdx * Math.cos(endDir) - gdz * Math.sin(endDir)) < 140;
      // which side of the line is this point on? (left normal of the hole direction at the nearest point)
      const fr = alongHole(L, t, 0); const leftness = (x - fr.x) * Math.cos(fr.dir) - (z - fr.z) * Math.sin(fr.dir);
      const wl = sc.woodland;
      const leftNear = wl.beyondL != null && t <= (wl.leftTo != null ? wl.leftTo : 2) && t >= (wl.leftFrom || 0);
      const rightNear = wl.beyondR != null && t <= (wl.rightTo != null ? wl.rightTo : 2) && t >= (wl.rightFrom || 0);
      const beyond = leftness > 0 ? (leftNear ? wl.beyondL : wl.beyond) : (rightNear ? wl.beyondR : wl.beyond);
      if (d < beyond && !behind) continue;
      if (behind && rnd() < 0.35) continue;
    }
    const dens = fbm(x / 120 + 1, z / 120 + 3, 3) * 0.5 + 0.5;
    if (rnd() > dens * 1.1 + 0.15) continue;
    if (okSpot(x, z, sc ? 40 : 60)) { if (sc) { const big = rnd() < 0.7; const h = big ? 14 + rnd() * 8 : 12 + rnd() * 6; const o = big ? KIND.oak(h) : KIND.cedar(h); addTree(x, z, o.conifer, { ...o, cards: Math.round(o.cards * 0.6) }); } else addTree(x, z); }
  }
  // Specimen trees around the pond and the green
  for (let i = 0; i < (L.pond && !sc ? 12 : 0); i++) { const a = rnd() * Math.PI * 2; const x = L.pond.x + Math.cos(a) * (L.pond.rx + 8 + rnd() * 10), z = L.pond.z + Math.sin(a) * (L.pond.rz + 8 + rnd() * 10); if (okSpot(x, z, 24)) addTree(x, z, false); }
  for (let i = 0; i < (sc ? 0 : 10); i++) { const a = rnd() * Math.PI * 2; const x = L.green.x + Math.cos(a) * (32 + rnd() * 14), z = L.green.z + Math.sin(a) * (30 + rnd() * 14); if (okSpot(x, z, 25)) addTree(x, z, rnd() < 0.5); }

  // ---- Canopy occlusion: soft dark discs under every crown, sampled by the terrain shader ----
  const ao = paintCanopyOcclusion(specs, L.size);

  // ---- Crown lobes: a broadleaf crown is several overlapping masses, not one ball ----
  for (const t of specs) {
    if (t.conifer || t.noCards) continue;
    const slender = t.canopyRy > t.canopyR * 1.3, n = t.canopyR < 1.5 ? 1 : slender ? 3 : 3 + Math.floor(rnd() * 3);
    t.lobes = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + rnd() * 1.2, out = n === 1 ? 0 : slender ? 0.12 : 0.34 + rnd() * 0.2;
      const ly = n === 1 ? 0 : slender ? (k / (n - 1) - 0.5) * 1.1 * t.canopyRy : (rnd() - 0.4) * 0.7 * t.canopyRy;
      t.lobes.push({ x: Math.cos(a) * out * t.canopyR, y: ly, z: Math.sin(a) * out * t.canopyR, r: t.canopyR * (n === 1 ? 1 : slender ? 0.85 : 0.52 + rnd() * 0.16) });
    }
  }

  // ---- Trunks (flared at the root) and the limbs that carry each lobe ----
  const trunkGeo = new THREE.LatheGeometry([[1.5, 0], [1.12, 0.035], [0.98, 0.1], [0.86, 0.4], [0.55, 1]].map(([r, y]) => new THREE.Vector2(r, y)), 10);
  const trunkMat = new THREE.MeshStandardMaterial({ map: tex.bark, roughness: 0.96, color: 0xcfc8be });
  const BARK = { birch: [2.3, 2.3, 2.2], pine: [1.25, 0.92, 0.74], spruce: [0.95, 0.9, 0.86], oak: [1, 1, 1] };
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, specs.length);
  trunks.castShadow = true; trunks.receiveShadow = true;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pv = new THREE.Vector3(), barkC = new THREE.Color();
  const yUp = new THREE.Vector3(0, 1, 0), limbDir = new THREE.Vector3();
  const limbs = [];
  specs.forEach((t, i) => {
    const th = t.conifer ? t.h * 0.95 : t.trunkH + t.canopyR * 0.6;
    m.compose(pv.set(t.x, t.y, t.z), q.setFromAxisAngle(yUp, t.rot), s.set(t.trunkR, th, t.trunkR));
    trunks.setMatrixAt(i, m);
    const bk = BARK[t.species] || BARK.oak; trunks.setColorAt(i, barkC.setRGB(bk[0], bk[1], bk[2]));
    if (t.lobes && t.lobes.length > 1 && t.trunkR > 0.12) t.lobes.forEach((lb, k) => {
      const y0 = t.trunkH * (0.72 + 0.1 * k);
      limbDir.set(lb.x * 0.85, t.canopyY + lb.y - y0, lb.z * 0.85);
      limbs.push({ x: t.x, y: t.y + y0, z: t.z, dx: limbDir.x, dy: limbDir.y, dz: limbDir.z, r: t.trunkR * 0.42, bk });
    });
  });
  group.add(trunks);
  if (limbs.length) {
    const limbMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, limbs.length);
    limbMesh.castShadow = true;
    limbs.forEach((lb, i) => {
      limbDir.set(lb.dx, lb.dy, lb.dz); const len = limbDir.length(); limbDir.normalize();
      m.compose(pv.set(lb.x, lb.y, lb.z), q.setFromUnitVectors(yUp, limbDir), s.set(lb.r, len, lb.r));
      limbMesh.setMatrixAt(i, m); limbMesh.setColorAt(i, barkC.setRGB(lb.bk[0], lb.bk[1], lb.bk[2]));
    });
    group.add(limbMesh);
  }

  // ---- Crown cores: a dark, solid mass inside each canopy so the leaf cards read as the lit skin
  // of a full tree and the sky does not show through the middle ----
  const crowned = specs.filter((t) => !t.noCards);
  const coreMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, flatShading: false });
  const mkCores = (list, geo, place) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, coreMat, list.length);
    mesh.castShadow = true; mesh.receiveShadow = true;
    const cc = new THREE.Color();
    list.forEach((t, i) => { place(t); mesh.setMatrixAt(i, m); const k = 0.75 + 0.25 * t.tint; mesh.setColorAt(i, cc.setRGB(0.024 * k, 0.056 * k, 0.019 * k)); });
    group.add(mesh);
  };
  const yAxis = new THREE.Vector3(0, 1, 0);
  // one core inside each lobe of a broadleaf crown, well under the leaf skin
  const lobeCores = [];
  for (const t of crowned) if (!t.conifer) { const squash = Math.min(1.5, t.canopyRy / t.canopyR); for (const lb of t.lobes) lobeCores.push({ x: t.x + lb.x, y: t.y + t.canopyY + lb.y, z: t.z + lb.z, r: lb.r * 0.5, ry: lb.r * 0.5 * 0.85 * squash, tint: t.tint, rot: t.rot }); }
  mkCores(lobeCores, new THREE.IcosahedronGeometry(1, 2), (c) => m.compose(pv.set(c.x, c.y, c.z), q.setFromAxisAngle(yAxis, c.rot), s.set(c.r, c.ry, c.r)));
  const coneGeo = new THREE.ConeGeometry(1, 1, 9, 1); coneGeo.translate(0, 0.5, 0);
  mkCores(crowned.filter((t) => t.conifer), coneGeo, (t) => m.compose(pv.set(t.x, t.y + t.h * (t.crownFrom + 0.04), t.z), q.setFromAxisAngle(yAxis, t.rot), s.set(t.canopyR * (t.species === 'pine' ? 0.34 : 0.5), t.h * (1 - t.crownFrom) * 0.86, t.canopyR * (t.species === 'pine' ? 0.34 : 0.5))));

  // ---- Canopies: leaf cards ----
  const nCards = (t, conifer) => t.cards || (conifer ? CARDS_C : CARDS_B);
  const makeCards = (texture, list, conifer) => {
    let count = 0; for (const t of list) count += nCards(t, conifer);
    const mat = new THREE.MeshStandardMaterial({ map: texture, alphaTest: quality.aa ? 0.3 : 0.45, alphaToCoverage: !!quality.aa, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    addWind(mat, { amp: 0.14, freq: 0.9, crown: true });
    const cardGeo = new THREE.PlaneGeometry(1, 1), outs = new Float32Array(count * 3);
    cardGeo.setAttribute('aOut', new THREE.InstancedBufferAttribute(outs, 3));
    const mesh = new THREE.InstancedMesh(cardGeo, mat, count);
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: texture, alphaTest: 0.45 });
    const color = new THREE.Color(), tintC = new THREE.Color();
    const Z = new THREE.Vector3(0, 0, 1), outward = new THREE.Vector3(), roll = new THREE.Quaternion();
    let i = 0;
    for (const t of list) {
      const n = nCards(t, conifer);
      // Every tree gets its own colour: a warm yellow-green, a cool blue-green or anything between.
      const warm = t.warm != null ? t.warm : rnd();
      tintC.setRGB((0.80 + 0.28 * warm) * t.tint, (0.98 + 0.03 * warm) * t.tint, (0.94 - 0.30 * warm) * t.tint);
      for (let k = 0; k < n; k++) {
        let px, py, pz, size, hf;
        if (conifer) {
          const u = k / n; // 0 bottom .. 1 top
          const yy = t.h * t.crownFrom + u * t.h * (1 - t.crownFrom);
          const rr = t.canopyR * (t.species === 'pine' ? 0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, u * 1.15)) : 1 - u * 0.92) * (0.6 + rnd() * 0.55);
          const a = rnd() * Math.PI * 2;
          px = Math.cos(a) * rr; pz = Math.sin(a) * rr; py = yy; hf = u;
          size = 1.4 + t.canopyR * 0.7 * (1 - u * 0.5) + rnd() * 0.8;
        } else {
          // bias toward the shell of the crown so the silhouette is full and the interior is not wasted
          // on the skin of one of the crown's lobes
          const lb = t.lobes[k % t.lobes.length], squash = Math.min(1.5, t.canopyRy / t.canopyR);
          const a = rnd() * Math.PI * 2, b = Math.acos(2 * rnd() - 1), rr = lb.r * (0.5 + 0.5 * Math.pow(rnd(), 0.6));
          px = lb.x + Math.sin(b) * Math.cos(a) * rr; pz = lb.z + Math.sin(b) * Math.sin(a) * rr; py = t.canopyY + lb.y + Math.cos(b) * rr * 0.85 * squash;
          hf = 0.5 + (py - t.canopyY) / (2 * t.canopyRy);
          size = Math.max(1.1, lb.r * (1.05 + rnd() * 0.7));
        }
        if (conifer) {
          q.setFromEuler(new THREE.Euler(-0.9 + rnd() * 0.5, Math.atan2(px, pz) + (rnd() - 0.5), (rnd() - 0.5) * 0.4));
        } else if (rnd() < 0.7) {
          // face outward from the crown centre (with jitter) so the sunny side lights up and the far side falls dark
          outward.set(px + (rnd() - 0.5) * t.canopyR * 0.8, (py - t.canopyY) * 0.7 + (rnd() - 0.5) * t.canopyR * 0.6, pz + (rnd() - 0.5) * t.canopyR * 0.8).normalize();
          q.setFromUnitVectors(Z, outward).multiply(roll.setFromAxisAngle(Z, rnd() * Math.PI * 2));
        } else {
          q.setFromEuler(new THREE.Euler(rnd() * Math.PI, rnd() * Math.PI, rnd() * Math.PI));
        }
        m.compose(pv.set(t.x + px, t.y + py, t.z + pz), q, s.set(size, size, 1));
        mesh.setMatrixAt(i, m);
        // crown normal: out from the middle of the tree, lifted a little so the tops catch the sky
        const oy = conifer ? 0.45 * Math.hypot(px, pz) + 0.2 : (py - t.canopyY) + 0.3 * t.canopyR, ol = Math.hypot(px, oy, pz) || 1;
        outs[i * 3] = px / ol; outs[i * 3 + 1] = oy / ol; outs[i * 3 + 2] = pz / ol;
        // darker low in the crown, brighter on top, with per-card scatter
        const shade = (0.74 + 0.34 * Math.min(1, Math.max(0, hf))) * (0.86 + rnd() * 0.28);
        color.copy(tintC).multiplyScalar(shade);
        mesh.setColorAt(i, color);
        i++;
      }
    }
    mesh.count = i;
    return mesh;
  };
  const broad = specs.filter((t) => !t.conifer && !t.noCards), cone = specs.filter((t) => t.conifer && !t.noCards);
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
  // Tall golden fescue fills the native-grass zones; the mown rough only gets the odd small tuft,
  // coloured like the ground so it reads as texture and not as dots.
  const tuftSpots = [], fescueSpots = [];
  const tuftScale = sc && sc.tufts != null ? sc.tufts : 1, MAX_FESCUE = Math.round(MAX_TUFTS * Math.max(0.4, tuftScale)), MAX_ROUGH = 0; // loose tufts in the mown rough only ever read as debris
  for (let i = 0; i < 300000; i++) {
    const x = (rnd() - 0.5) * (L.size - 40), z = (rnd() - 0.5) * (L.size - 40);
    const { d } = splineDist(L, x, z);
    if (d > 95) continue;
    const sf = course.surfaceAt(x, z);
    if (sf.id !== SURF.ROUGH) continue;
    if (ponds(L).some((q) => ellipseDist(x, z, q) < 1.15)) continue;
    const fw = fescueWeight(L, x, z);
    if (fw > 0.3) { if (fescueSpots.length < MAX_FESCUE && rnd() < fw) fescueSpots.push({ x, z }); }
    else if (fw < 0.05 && tuftSpots.length < MAX_ROUGH && rnd() < 0.12) tuftSpots.push({ x, z, reed: false });
    if (fescueSpots.length >= MAX_FESCUE && tuftSpots.length >= MAX_ROUGH) break;
  }
  for (const q of ponds(L)) for (let i = 0; i < MAX_REEDS; i++) {
    const a = rnd() * Math.PI * 2, rr = 1.0 + rnd() * 0.12;
    const c = Math.cos(q.rot), sn = Math.sin(q.rot);
    const lx = Math.cos(a) * q.rx * rr, lz = Math.sin(a) * q.rz * rr;
    const x = q.x + lx * c - lz * sn, z = q.z + lx * sn + lz * c;
    if (course.heightAt(x, z) < course.waterLevelAt(x, z) - 0.05) continue;
    tuftSpots.push({ x, z, reed: true });
  }
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, tuftSpots.length);
  tufts.receiveShadow = true;
  const col = new THREE.Color();
  tuftSpots.forEach((t, i) => {
    const y = course.heightAt(t.x, t.z) - 0.02;
    const sc = t.reed ? 0.45 + rnd() * 0.35 : 0.3 + rnd() * 0.3;
    const hgt = t.reed ? 1.0 + rnd() * 0.7 : 0.14 + rnd() * 0.16;
    m.compose(pv.set(t.x, y, t.z), q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.25, rnd() * Math.PI, (rnd() - 0.5) * 0.25)), s.set(sc, hgt, sc));
    tufts.setMatrixAt(i, m);
    // tufts sit in the rough's own colour range rather than glowing above it
    if (t.reed) col.setRGB(0.72 + rnd() * 0.2, 0.60 + rnd() * 0.15, 0.34); else { const v = 0.62 + rnd() * 0.3; col.setRGB(v * (0.86 + rnd() * 0.14), v * 1.02, v * 0.62); }
    tufts.setColorAt(i, col);
  });
  group.add(tufts);
  if (fescueSpots.length) {
    const fesMat = new THREE.MeshStandardMaterial({ map: tex.bladeDry, alphaTest: quality.aa ? 0.35 : 0.5, alphaToCoverage: !!quality.aa, side: THREE.DoubleSide, roughness: 1 });
    addWind(fesMat, { byUv: true, amp: 0.16, freq: 1.25 });
    const fescue = new THREE.InstancedMesh(tuftGeo, fesMat, fescueSpots.length);
    fescue.receiveShadow = true;
    fescueSpots.forEach((t, i) => {
      const y = course.heightAt(t.x, t.z) - 0.03;
      const w = 0.8 + rnd() * 0.7, hgt = 0.55 + rnd() * 0.55;
      m.compose(pv.set(t.x, y, t.z), q.setFromEuler(new THREE.Euler((rnd() - 0.5) * 0.3, rnd() * Math.PI, (rnd() - 0.5) * 0.3)), s.set(w, hgt, w));
      fescue.setMatrixAt(i, m);
      const b = 0.8 + rnd() * 0.4, g = rnd() < 0.25 ? 1.12 : 1; // the odd greener clump
      fescue.setColorAt(i, col.setRGB(b * (g > 1 ? 0.86 : 1.06), b * g, b * 0.82));
    });
    group.add(fescue);
  }

  return { group, field, count: specs.length, tufts: tuftSpots.length, ao };
}

/**
 * Soft occlusion discs under each crown, painted in world space. The terrain shader multiplies
 * this in so trees sit on the ground everywhere, not only inside the live shadow map's range.
 * Returns null where there is no DOM (the node tools).
 */
function paintCanopyOcclusion(specs, size, res = 1024) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = res; c.height = res;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, res, res);
  const k = res / size;
  for (const t of specs) {
    if (t.noCards) continue;
    const r = Math.max(0.6, t.canopyR * (t.conifer ? 0.95 : 1.08)) * k;
    const cx = (t.x / size + 0.5) * res, cy = (t.z / size + 0.5) * res;
    const a = Math.min(0.85, 0.35 + t.density * 0.7);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${a})`); g.addColorStop(0.55, `rgba(255,255,255,${a * 0.55})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping; tex.flipY = false;
  tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
  return tex;
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
