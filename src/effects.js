// What the ball kicks up: turf from an iron shot, sand from a bunker, a splash and ripples from
// water, leaves out of a tree, a puff where it lands. One point cloud, updated on the CPU.
import * as THREE from 'three';

const MAX = 900;
const TURF = [[0.1, 0.19, 0.045], [0.13, 0.23, 0.055], [0.17, 0.27, 0.07], [0.08, 0.15, 0.04], [0.13, 0.095, 0.05]];
const SAND = [[0.78, 0.68, 0.46], [0.7, 0.6, 0.4], [0.86, 0.77, 0.56]];
const WATER = [[0.82, 0.9, 1.0], [0.68, 0.8, 0.95], [1, 1, 1]];
const LEAF = [[0.1, 0.22, 0.05], [0.16, 0.27, 0.06], [0.24, 0.24, 0.07]];

export class Effects {
  constructor(scene) {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3); this.col = new Float32Array(MAX * 3); this.size = new Float32Array(MAX); this.alpha = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute vec3 aColor; attribute float aSize, aAlpha; uniform float uScale; varying vec3 vColor; varying float vAlpha;
        void main() { vColor = aColor; vAlpha = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = max(1.0, aSize * uScale / max(0.05, -mv.z)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vColor; varying float vAlpha;
        void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0 || vAlpha < 0.01) discard;
          // a soft-edged, slightly shaded grain rather than a flat disc
          gl_FragColor = vec4(vColor * (1.12 - 0.4 * r - 0.25 * d.y), vAlpha * (1.0 - smoothstep(0.6, 1.0, r)));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 6;
    scene.add(this.points);
    this.vel = new Float32Array(MAX * 3); this.life = new Float32Array(MAX); this.max = new Float32Array(MAX);
    this.grav = new Float32Array(MAX); this.drag = new Float32Array(MAX); this.flut = new Float32Array(MAX);
    this.next = 0; this.live = 0;
    // water ripples: flat rings that spread and fade
    this.rings = [];
    const rgeo = new THREE.RingGeometry(0.9, 1, 56); rgeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 6; i++) {
      const r = new THREE.Mesh(rgeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      r.visible = false; r.renderOrder = 4; r.userData = { t: 0, dur: 1, delay: 0, to: 1 }; scene.add(r); this.rings.push(r);
    }
    this.ground = null; // (x, z) => height, set by the game for each hole
  }

  /** Add one particle. p: position, v: velocity, c: [r,g,b], size in metres, life in seconds. */
  spawn(px, py, pz, vx, vy, vz, c, size, life, grav = 9.8, drag = 0.6, flutter = 0) {
    const i = this.next; this.next = (this.next + 1) % MAX;
    this.pos[i * 3] = px; this.pos[i * 3 + 1] = py; this.pos[i * 3 + 2] = pz;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    this.size[i] = size; this.life[i] = life; this.max[i] = life; this.grav[i] = grav; this.drag[i] = drag; this.flut[i] = flutter;
    this.live = Math.max(this.live, 1);
  }

  /** A spray thrown forward and up along `dir` (unit, horizontal), fanned out to the sides. */
  spray(p, dir, n, palette, { speed = 4, up = 3, spread = 0.5, size = 0.03, life = 0.9, grav = 9.8, drag = 0.8 } = {}) {
    for (let k = 0; k < n; k++) {
      const a = (Math.random() - 0.5) * 2 * spread, c = Math.cos(a), s = Math.sin(a);
      const sp = speed * (0.35 + Math.random() * 0.9);
      const dx = dir.x * c - dir.z * s, dz = dir.x * s + dir.z * c;
      this.spawn(p.x + (Math.random() - 0.5) * 0.08, p.y + Math.random() * 0.03, p.z + (Math.random() - 0.5) * 0.08,
        dx * sp, up * (0.4 + Math.random() * 0.9), dz * sp, palette[(Math.random() * palette.length) | 0], size * (0.5 + Math.random()), life * (0.6 + Math.random() * 0.7), grav, drag);
    }
  }

  /** Iron or wedge through the turf: blades and crumbs of soil thrown down the line. */
  turf(p, dir, power = 1) { this.spray(p, dir, Math.round(26 + 40 * power), TURF, { speed: 2.5 + 3.5 * power, up: 1.6 + 2.2 * power, spread: 0.45, size: 0.02, life: 0.9 }); }
  /** Out of a bunker: a fan of sand that hangs for a moment. */
  sand(p, dir, power = 1) {
    this.spray(p, dir, Math.round(70 + 90 * power), SAND, { speed: 2.5 + 4 * power, up: 2.2 + 3 * power, spread: 0.7, size: 0.02, life: 1.1, drag: 1.6 });
    this.spray(p, dir, 26, SAND, { speed: 1.2, up: 1.2, spread: 3.1, size: 0.05, life: 0.9, grav: 3, drag: 2.5 });
  }
  /** The ball landing: a ring of turf or sand, sized by how hard it came down. */
  puff(p, surface, speed) {
    const k = Math.min(1, speed / 14); if (k < 0.12) return;
    const sandy = surface === 'sand';
    this.spray(p, { x: 1, z: 0 }, Math.round((sandy ? 46 : 10) * k + 4), sandy ? SAND : TURF, { speed: (sandy ? 2.2 : 1.6) * (0.5 + k), up: (sandy ? 2.8 : 1.8) * (0.4 + k), spread: Math.PI, size: sandy ? 0.022 : 0.024, life: 0.75, drag: sandy ? 1.6 : 0.8 });
  }
  /** Into the pond: a crown of droplets, a column in the middle and spreading ripples. */
  splash(p, level) {
    const q = { x: p.x, y: level + 0.02, z: p.z };
    this.spray(q, { x: 1, z: 0 }, 90, WATER, { speed: 2.6, up: 4.6, spread: Math.PI, size: 0.075, life: 1.2, drag: 0.5 });
    this.spray(q, { x: 1, z: 0 }, 40, WATER, { speed: 0.5, up: 7.5, spread: Math.PI, size: 0.1, life: 1.3, drag: 0.4 });
    for (let i = 0; i < 4; i++) {
      const r = this.rings[(this.ringNext = ((this.ringNext || 0) + 1) % this.rings.length)];
      r.position.set(p.x, level + 0.03, p.z); r.userData = { t: 0, delay: i * 0.28, dur: 2.2, to: 2.6 + i * 0.9 }; r.visible = true; r.material.opacity = 0; r.scale.setScalar(0.05);
    }
  }
  /** Through a tree: a few leaves shaken loose, drifting down. */
  leaves(p) {
    for (let k = 0; k < 16; k++) this.spawn(p.x + (Math.random() - 0.5) * 1.2, p.y + (Math.random() - 0.5) * 0.8, p.z + (Math.random() - 0.5) * 1.2,
      (Math.random() - 0.5) * 1.5, Math.random() * 0.6, (Math.random() - 0.5) * 1.5, LEAF[(Math.random() * LEAF.length) | 0], 0.07 + Math.random() * 0.06, 2.2 + Math.random() * 1.8, 1.3, 1.2, 1.5 + Math.random() * 2);
  }

  update(dt, camera, viewportH) {
    this.mat.uniforms.uScale.value = viewportH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    for (const r of this.rings) {
      if (!r.visible) continue;
      const d = r.userData; d.t += dt; const u = (d.t - d.delay) / d.dur;
      if (u < 0) continue;
      if (u >= 1) { r.visible = false; continue; }
      r.scale.setScalar(0.1 + d.to * (1 - (1 - u) * (1 - u))); r.material.opacity = 0.5 * (1 - u) * Math.min(1, u * 8);
    }
    if (!this.live) return;
    let live = 0;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const k = i * 3, f = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[k] *= f; this.vel[k + 2] *= f; this.vel[k + 1] = this.vel[k + 1] * f - this.grav[i] * dt;
      if (this.flut[i]) { const w = this.life[i] * 5 + i; this.vel[k] += Math.sin(w) * this.flut[i] * dt; this.vel[k + 2] += Math.cos(w * 0.8) * this.flut[i] * dt; }
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      // come to rest on the ground, then fade
      if (this.ground && this.vel[k + 1] < 0) { const g = this.ground(this.pos[k], this.pos[k + 2]) + 0.01; if (this.pos[k + 1] < g) { this.pos[k + 1] = g; this.vel[k] = this.vel[k + 1] = this.vel[k + 2] = 0; this.grav[i] = 0; this.life[i] = Math.min(this.life[i], 0.35); } }
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.alpha[i] = Math.min(1, this.life[i] / (this.max[i] * 0.35));
      live++;
    }
    this.live = live;
    const a = this.points.geometry.attributes; a.position.needsUpdate = true; a.aAlpha.needsUpdate = true; a.aColor.needsUpdate = true; a.aSize.needsUpdate = true;
  }
}
