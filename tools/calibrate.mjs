import { CLUBS, shotParams, simulateShot } from '../src/physics.js';
import { SURF } from '../src/courseData.js';
// Flat course stub
const course = { heightAt: () => 0, normalAt: (x, z, o = {}) => { o.x = 0; o.y = 1; o.z = 0; return o; }, surfaceAt: () => ({ id: SURF.FAIRWAY, w: {} }), inBounds: () => true, waterLevel: -99 };
const yd = (m) => (m * 1.09361).toFixed(0);
for (const c of CLUBS) {
  const p = shotParams(c, 1, 0, SURF.FAIRWAY);
  const r = simulateShot(course, { x: 0, y: 0.021, z: 0 }, { x: 0, z: 1 }, p);
  const carry = r.carry ? Math.hypot(r.carry.x, r.carry.z) : 0;
  const total = Math.hypot(r.end.x, r.end.z);
  console.log(c.name.padEnd(15), 'carry', yd(carry).padStart(4), 'yd  total', yd(total).padStart(4), 'yd  apex', r.maxHeight.toFixed(1), 'm  air', r.airTime.toFixed(1), 's', r.mode);
}
// Slice test
const p = shotParams(CLUBS[0], 1, 0.6, SURF.FAIRWAY);
const r = simulateShot(course, { x: 0, y: 0.021, z: 0 }, { x: 0, z: 1 }, p);
console.log('driver 60% slice: end x', r.end.x.toFixed(1), 'z', r.end.z.toFixed(1));
// Putt
const course2 = { ...course, surfaceAt: () => ({ id: SURF.GREEN, w: {} }) };
for (const pw of [0.3, 0.6, 1]) { const pp = shotParams(CLUBS[8], pw, 0, SURF.GREEN); const rr = simulateShot(course2, { x: 0, y: 0.021, z: 0 }, { x: 0, z: 1 }, pp); console.log('putt', pw, 'speed', pp.speed.toFixed(2), 'roll', Math.hypot(rr.end.x, rr.end.z).toFixed(1), 'm'); }
