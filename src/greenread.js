// Green reading: a grid of dots laid on the putting surface that drift downhill, faster and
// redder where the slope is steeper, so the break can be read before the putt is struck.
import * as THREE from 'three';
import { SURF } from './courseData.js';

const MAX = 1600, CELL = 0.7;

export class GreenRead {
  constructor() {
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * 3); this.dir = new Float32Array(MAX * 2); this.slope = new Float32Array(MAX); this.phase = new Float32Array(MAX);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aDir', new THREE.BufferAttribute(this.dir, 2));
    geo.setAttribute('aSlope', new THREE.BufferAttribute(this.slope, 1));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(this.phase, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 600 }, uCell: { value: CELL } },
      vertexShader: `attribute vec2 aDir; attribute float aSlope, aPhase; uniform float uTime, uScale, uCell; varying vec3 vColor; varying float vAlpha;
        void main() {
          float sp = clamp(aSlope / 0.055, 0.0, 1.0);            // a 5.5% slope reads as "steep" on a green
          float moving = step(0.0035, aSlope);
          float t = fract(uTime * (0.22 + 1.5 * sp) * moving + aPhase);
          vec3 p = position; float along = (t - 0.5) * uCell * 0.92 * moving;
          p.xz += aDir * along; p.y -= aSlope * along;
          vAlpha = mix(0.55, sin(3.14159 * t), moving);
          vColor = mix(mix(vec3(1.0), vec3(1.0, 0.86, 0.25), smoothstep(0.12, 0.5, sp)), vec3(1.0, 0.3, 0.2), smoothstep(0.5, 1.0, sp));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = max(1.5, (0.036 + 0.018 * sp) * uScale / max(0.05, -mv.z)); gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying vec3 vColor; varying float vAlpha;
        void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; if (r > 1.0) discard;
          gl_FragColor = vec4(vColor, vAlpha * 0.9 * (1.0 - smoothstep(0.55, 1.0, r)));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5; this.points.visible = false;
  }

  /** Lay the dots over the part of the green between the ball and the hole (and a margin round both). */
  build(course, ball, pin) {
    const pad = 4.5, x0 = Math.min(ball.x, pin.x) - pad, x1 = Math.max(ball.x, pin.x) + pad, z0 = Math.min(ball.z, pin.z) - pad, z1 = Math.max(ball.z, pin.z) + pad;
    // a long putt covers a lot of green: open the grid out rather than run past the dot budget
    const cell = Math.max(CELL, Math.sqrt((x1 - x0) * (z1 - z0) / MAX) * 1.05), n = { x: 0, y: 1, z: 0 };
    let k = 0;
    for (let x = x0; x <= x1 && k < MAX; x += cell) for (let z = z0; z <= z1 && k < MAX; z += cell) {
      const id = course.surfaceAt(x, z).id; if (id !== SURF.GREEN) continue;
      if (Math.hypot(x - pin.x, z - pin.z) < 0.18) continue;
      course.normalAt(x, z, n);
      const hl = Math.hypot(n.x, n.z);
      this.pos[k * 3] = x; this.pos[k * 3 + 1] = course.heightAt(x, z) + 0.018; this.pos[k * 3 + 2] = z;
      this.dir[k * 2] = hl > 1e-5 ? n.x / hl : 0; this.dir[k * 2 + 1] = hl > 1e-5 ? n.z / hl : 0; // the normal leans downhill
      this.slope[k] = hl / n.y; this.phase[k] = (Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
      k++;
    }
    this.mat.uniforms.uCell.value = cell;
    const g = this.points.geometry; g.setDrawRange(0, k);
    for (const a of ['position', 'aDir', 'aSlope', 'aPhase']) g.attributes[a].needsUpdate = true;
    this.points.visible = k > 0; this.count = k;
  }
  hide() { this.points.visible = false; }
  update(time, camera, viewportH) { this.mat.uniforms.uTime.value = time; this.mat.uniforms.uScale.value = viewportH / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)); }
}
