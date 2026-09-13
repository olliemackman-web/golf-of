// Golf ball physics: drag + Magnus lift in flight, surface-dependent bounce
// and rolling on the terrain, trees, water, hole capture. Pure JS, no three.
import { SURF } from './courseData.js';

export const BALL_R = 0.02135;
const MASS = 0.0459, RHO = 1.225, AREA = Math.PI * BALL_R * BALL_R;
const K = 0.5 * RHO * AREA / MASS; // aero constant
const G = 9.81;
export const HOLE_R = 0.054;

// Per-surface response: restitution, sliding friction, rolling deceleration (m/s^2)
const SURFACE = {
  [SURF.ROUGH]:   { e: 0.30, mu: 0.55, roll: 4.2, speed: 0.82, spin: 0.45 },
  [SURF.FAIRWAY]: { e: 0.36, mu: 0.42, roll: 2.7, speed: 1.0, spin: 1.0 },
  [SURF.TEE]:     { e: 0.36, mu: 0.42, roll: 2.7, speed: 1.0, spin: 1.0 },
  [SURF.GREEN]:   { e: 0.38, mu: 0.48, roll: 0.62, speed: 1.0, spin: 1.0 },
  [SURF.SAND]:    { e: 0.10, mu: 0.85, roll: 6.5, speed: 0.72, spin: 0.35 },
  [SURF.WATER]:   { e: 0.0, mu: 1, roll: 9, speed: 0.5, spin: 0.2 },
};
export function surfaceProps(id) { return SURFACE[id] || SURFACE[SURF.ROUGH]; }

export const CLUBS = [
  { id: 'DR', name: 'Driver', speed: 68, loft: 11.5, spin: 2500, len: 1.13, wood: true },
  { id: '3W', name: '3 Wood', speed: 62, loft: 14.5, spin: 3400, len: 1.09, wood: true },
  { id: '4H', name: 'Hybrid', speed: 57, loft: 17, spin: 4300, len: 1.02, wood: true },
  { id: '5I', name: '5 Iron', speed: 54, loft: 19, spin: 5200, len: 0.97 },
  { id: '7I', name: '7 Iron', speed: 49, loft: 23, spin: 6600, len: 0.94 },
  { id: '9I', name: '9 Iron', speed: 43, loft: 29, spin: 8200, len: 0.91 },
  { id: 'PW', name: 'Pitching Wedge', speed: 39, loft: 33, spin: 9200, len: 0.90 },
  { id: 'SW', name: 'Sand Wedge', speed: 32, loft: 40, spin: 10200, len: 0.89, sand: true },
  { id: 'PT', name: 'Putter', speed: 7.5, loft: 0, spin: 0, len: 0.87, putter: true },
];

export class Ball {
  constructor(course) {
    this.course = course;
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.spin = { x: 0, y: 0, z: 0 }; // angular velocity rad/s (world)
    this.mode = 'rest';               // rest | fly | roll | holed | water
    this.wind = { x: 0, z: 0 };
    this.trees = null;                // optional collision provider
    this.hole = null;                 // {x, z}
    this.events = [];
    this.n = { x: 0, y: 1, z: 0 };
    this.airTime = 0; this.maxHeight = 0; this.carry = null; this.launchPos = null; this.bounces = 0;
    this.timeSinceLaunch = 0; this.treeCooldown = 0; this.slowTime = 0;
    this.captureBonus = 0; // putting upgrade: the cup takes slightly faster balls
  }

  place(x, z) {
    this.pos.x = x; this.pos.z = z; this.pos.y = this.course.heightAt(x, z) + BALL_R;
    this.vel.x = this.vel.y = this.vel.z = 0; this.spin.x = this.spin.y = this.spin.z = 0;
    this.mode = 'rest';
  }

  /**
   * Launch: dir = horizontal unit vector, speed m/s, loft deg, backspin rpm,
   * sidespin rpm (+ = ball curves right for a right-hander).
   */
  launch(dir, speed, loftDeg, backRpm, sideRpm) {
    const loft = loftDeg * Math.PI / 180;
    this.vel.x = dir.x * speed * Math.cos(loft); this.vel.z = dir.z * speed * Math.cos(loft); this.vel.y = speed * Math.sin(loft);
    // backspin axis = dir x up ; sidespin axis = -up (slice)
    const ax = -dir.z, az = dir.x; // dir x up  = (dz*0 - 0*... ) => (-dir.z, 0, dir.x)
    const wb = backRpm * 2 * Math.PI / 60, ws = sideRpm * 2 * Math.PI / 60;
    this.spin.x = ax * wb; this.spin.z = az * wb; this.spin.y = -ws;
    this.mode = speed < 0.01 ? 'rest' : (loftDeg <= 0.01 ? 'roll' : 'fly');
    if (this.mode === 'roll') { this.pos.y = this.course.heightAt(this.pos.x, this.pos.z) + BALL_R; }
    this.airTime = 0; this.maxHeight = 0; this.carry = null; this.bounces = 0; this.timeSinceLaunch = 0;
    this.launchPos = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    this.events.length = 0; this.treeCooldown = 0; this.slowTime = 0;
  }

  step(dt) {
    if (this.mode === 'rest' || this.mode === 'holed' || this.mode === 'water' || this.mode === 'oob') return;
    const sub = Math.max(1, Math.ceil(dt / (1 / 480)));
    const h = dt / sub;
    for (let i = 0; i < sub; i++) {
      if (this.mode === 'fly') this.stepFly(h); else if (this.mode === 'roll') this.stepRoll(h);
      if (this.mode === 'fly' || this.mode === 'roll') this.timeSinceLaunch += h;
      if (this.timeSinceLaunch > 45 && (this.mode === 'fly' || this.mode === 'roll')) this.stop(); // nothing real takes this long
      if (this.mode === 'rest' || this.mode === 'holed' || this.mode === 'water' || this.mode === 'oob') break;
    }
  }

  stepFly(h) {
    const p = this.pos, v = this.vel, s = this.spin;
    const rx = v.x - this.wind.x, ry = v.y, rz = v.z - this.wind.z;
    const sp = Math.hypot(rx, ry, rz) + 1e-6;
    const w = Math.hypot(s.x, s.y, s.z);
    const cd = 0.225 + 0.06 * Math.min(1, (w * BALL_R) / sp / 0.12);
    const spinRatio = (w * BALL_R) / sp;
    const cl = Math.min(0.27, 1.9 * spinRatio);
    // Magnus direction: spin x vel
    let mx = 0, my = 0, mz = 0;
    if (w > 1e-3) {
      const ux = s.x / w, uy = s.y / w, uz = s.z / w;
      mx = uy * rz - uz * ry; my = uz * rx - ux * rz; mz = ux * ry - uy * rx;
    }
    const ax = K * sp * (-cd * rx + cl * mx);
    const ay = -G + K * sp * (-cd * ry + cl * my);
    const az = K * sp * (-cd * rz + cl * mz);
    v.x += ax * h; v.y += ay * h; v.z += az * h;
    p.x += v.x * h; p.y += v.y * h; p.z += v.z * h;
    const decay = Math.exp(-h / 9);
    s.x *= decay; s.y *= decay; s.z *= decay;
    this.airTime += h;
    if (p.y > this.maxHeight) this.maxHeight = p.y;
    if (this.trees && this.trees.collide(this, h)) return;
    if (!this.course.inBounds(p.x, p.z)) { this.mode = 'oob'; this.events.push({ type: 'oob' }); return; }
    const ground = this.course.heightAt(p.x, p.z);
    if (p.y - BALL_R <= ground) this.contact(ground);
  }

  contact(ground) {
    const p = this.pos, v = this.vel, s = this.spin;
    p.y = ground + BALL_R;
    const surf = this.course.surfaceAt(p.x, p.z);
    if (surf.id === SURF.WATER && this.course.waterLevel !== undefined) {
      if (ground < this.course.waterLevel + 0.05) { this.mode = 'water'; this.events.push({ type: 'water' }); return; }
    }
    const S = surfaceProps(surf.id);
    const n = this.course.normalAt(p.x, p.z, this.n);
    const vn = v.x * n.x + v.y * n.y + v.z * n.z;
    if (vn >= 0) return;
    if (this.carry == null) this.carry = { x: p.x, z: p.z, y: p.y };
    this.bounces++;
    this.events.push({ type: 'bounce', speed: -vn, surface: surf.id });
    const e = S.e * (1 - Math.min(0.55, -vn / 70));
    // tangential velocity
    let tx = v.x - vn * n.x, ty = v.y - vn * n.y, tz = v.z - vn * n.z;
    // contact-point slip includes spin: v_c = v_t + w x (-r n)
    const cx = tx + (s.y * (-n.z) - s.z * (-n.y)) * BALL_R;
    const cy = ty + (s.z * (-n.x) - s.x * (-n.z)) * BALL_R;
    const cz = tz + (s.x * (-n.y) - s.y * (-n.x)) * BALL_R;
    const cs = Math.hypot(cx, cy, cz) + 1e-6;
    const jmax = S.mu * (1 + e) * -vn;
    const j = Math.min(jmax, cs * 2 / 7);
    tx -= cx / cs * j; ty -= cy / cs * j; tz -= cz / cs * j;
    const vnNew = -vn * e;
    v.x = tx + vnNew * n.x; v.y = ty + vnNew * n.y; v.z = tz + vnNew * n.z;
    // spin: partly killed by the impact, partly converted to roll
    const keep = 0.5 * S.spin;
    s.x *= keep; s.y *= keep; s.z *= keep;
    if (vnNew < 0.9 || (surf.id === SURF.SAND && vnNew < 2.5)) {
      // settle into rolling
      const vh = Math.hypot(tx, ty, tz);
      v.x = tx; v.y = ty; v.z = tz;
      this.mode = 'roll';
      if (vh < 0.05) this.stop();
    }
  }

  stepRoll(h) {
    const p = this.pos, v = this.vel;
    const n = this.course.normalAt(p.x, p.z, this.n);
    const surf = this.course.surfaceAt(p.x, p.z);
    if (surf.id === SURF.WATER) { this.mode = 'water'; this.events.push({ type: 'water' }); return; }
    const S = surfaceProps(surf.id);
    // keep velocity in the tangent plane
    let vn = v.x * n.x + v.y * n.y + v.z * n.z;
    v.x -= vn * n.x; v.y -= vn * n.y; v.z -= vn * n.z;
    // gravity along the slope
    const gx = -G * n.y * n.x, gy = -G * (1 - n.y * n.y), gz = -G * n.y * n.z;
    const sp = Math.hypot(v.x, v.y, v.z);
    // rolling resistance opposes motion; grows a bit at low speed (grass grain)
    const dec = S.roll * (1 + (sp < 0.6 ? 0.6 * (1 - sp / 0.6) : 0));
    if (sp > 1e-4) {
      const dv = Math.min(sp, dec * h);
      v.x -= v.x / sp * dv; v.y -= v.y / sp * dv; v.z -= v.z / sp * dv;
    }
    v.x += gx * h; v.y += gy * h; v.z += gz * h;
    // residual spin acts on the roll briefly (backspin check)
    const s = this.spin;
    const sm = Math.hypot(s.x, s.y, s.z);
    if (sm > 1) {
      // surface velocity from spin: w x (-n r)
      const cx = (s.y * (-n.z) - s.z * (-n.y)) * BALL_R, cz = (s.x * (-n.y) - s.y * (-n.x)) * BALL_R;
      v.x -= cx * 6 * h * S.spin; v.z -= cz * 6 * h * S.spin;
      const d = Math.exp(-h * 6); s.x *= d; s.y *= d; s.z *= d;
    }
    p.x += v.x * h; p.y += v.y * h; p.z += v.z * h;
    const ground = this.course.heightAt(p.x, p.z);
    // Leave the ground if it drops away faster than we fall (ridge / bunker lip)
    if (p.y - BALL_R > ground + 0.02 && sp > 1.5) { this.mode = 'fly'; return; }
    p.y = ground + BALL_R;
    if (this.trees && this.trees.collide(this, h)) return;
    if (!this.course.inBounds(p.x, p.z)) { this.mode = 'oob'; this.events.push({ type: 'oob' }); return; }
    if (this.hole) this.checkHole(sp);
    if (this.mode !== 'roll') return;
    const sp2 = Math.hypot(v.x, v.y, v.z);
    const slope = 1 - n.y;
    if (sp2 < 0.04 && slope < 0.06) this.stop();
    // A ball creeping back and forth in a hollow never crosses the threshold above: call it stopped
    // once it has been nearly stationary for a while.
    if (sp2 < 0.3) { this.slowTime += h; if (this.slowTime > 1.2) this.stop(); } else this.slowTime = 0;
  }

  checkHole(sp) {
    const p = this.pos, v = this.vel, H = this.hole;
    const dx = p.x - H.x, dz = p.z - H.z, d = Math.hypot(dx, dz);
    if (d < HOLE_R) {
      // Capture if slow enough that the ball drops before it crosses the cup.
      const vmax = 1.7 + this.captureBonus + (HOLE_R - d) * 14;
      if (sp < vmax) { this.mode = 'holed'; this.events.push({ type: 'holed' }); p.x = H.x; p.z = H.z; v.x = v.y = v.z = 0; return; }
      // Lip-out: deflect and lose speed.
      if (d > HOLE_R * 0.55) {
        const nx = dx / d, nz = dz / d;
        const vn = v.x * nx + v.z * nz;
        if (vn < 0) { v.x -= 1.6 * vn * nx; v.z -= 1.6 * vn * nz; v.x *= 0.7; v.z *= 0.7; this.events.push({ type: 'lipout' }); }
      }
    }
  }

  stop() { this.vel.x = this.vel.y = this.vel.z = 0; this.spin.x = this.spin.y = this.spin.z = 0; this.mode = 'rest'; this.events.push({ type: 'rest' }); }
}

/**
 * Compute launch conditions for a shot. Returns {speed, loft, back, side}.
 * power 0..1, accuracy -1..1 (negative = hook/draw, positive = slice/fade),
 * lie = surface id the ball sits on.
 */
export function shotParams(club, power, accuracy, lie, mods = {}) {
  const S = surfaceProps(lie);
  const spin = mods.spin || { x: 0, y: 0 }, spinPower = mods.spinPower == null ? 0.5 : mods.spinPower;
  if (club.putter) return { speed: club.speed * Math.pow(power, 1.7), loft: 0, back: 0, side: 0, dirErr: accuracy * 2.5 * (mods.puttErr == null ? 1 : mods.puttErr) };
  let speedMul = S.speed, spinMul = S.spin;
  if (lie === SURF.SAND && club.sand) { speedMul = 0.9; spinMul = 0.7; }
  if (lie === SURF.SAND && club.wood) { speedMul = 0.45; spinMul = 0.3; }
  speedMul *= club.wood ? (mods.woodSpeed || 1) : (mods.ironSpeed || 1);
  const p = 0.25 + 0.75 * power;
  const speed = club.speed * p * speedMul;
  // spin.y: +1 = full backspin (higher, stops), -1 = topspin (lower, runs); spin.x: -1 draw .. +1 fade
  const loft = club.loft + (lie === SURF.ROUGH ? 2 : 0) + (1 - power) * 2 + spin.y * spinPower * 2.5;
  const back = Math.max(club.spin * 0.25, club.spin * (0.6 + 0.4 * power) * spinMul * (1 + spin.y * spinPower * 0.65));
  const side = accuracy * (600 + club.speed * 22) * spinMul * (mods.sideMul == null ? 1 : mods.sideMul) + spin.x * spinPower * (900 + club.speed * 10) * spinMul;
  const dirErr = accuracy * 3 * (mods.sideMul == null ? 1 : mods.sideMul) - spin.x * spinPower * 1.2; // shape starts a touch inside the line
  return { speed, loft, back, side, dirErr };
}

/** Simulate a full shot from the current ball state on a private clone. Returns the path + result. */
export function simulateShot(course, from, dir, params, opts = {}) {
  const b = new Ball(course);
  b.pos.x = from.x; b.pos.y = from.y; b.pos.z = from.z;
  b.wind.x = opts.wind ? opts.wind.x : 0; b.wind.z = opts.wind ? opts.wind.z : 0;
  b.trees = opts.trees || null; b.hole = opts.hole || null;
  b.launch(dir, params.speed, params.loft, params.back, params.side);
  const path = [{ x: b.pos.x, y: b.pos.y, z: b.pos.z }];
  const dt = 1 / 120; let t = 0, lastPathT = 0;
  const maxT = opts.maxT || 40;
  while ((b.mode === 'fly' || b.mode === 'roll') && t < maxT) {
    b.step(dt); t += dt;
    if (t - lastPathT >= (b.mode === 'fly' ? 0.05 : 0.12)) { path.push({ x: b.pos.x, y: b.pos.y, z: b.pos.z }); lastPathT = t; }
  }
  path.push({ x: b.pos.x, y: b.pos.y, z: b.pos.z });
  return { path, end: { x: b.pos.x, y: b.pos.y, z: b.pos.z }, mode: b.mode, carry: b.carry, airTime: b.airTime, maxHeight: b.maxHeight, time: t };
}
