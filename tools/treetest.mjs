import { CLUBS, shotParams, simulateShot, Ball } from '../src/physics.js';
import { SURF } from '../src/courseData.js';
import { TreeField } from '../src/vegetation.js';
const course = { heightAt: () => 0, normalAt: (x, z, o = {}) => { o.x = 0; o.y = 1; o.z = 0; return o; }, surfaceAt: () => ({ id: SURF.FAIRWAY, w: {} }), inBounds: () => true, waterLevel: -99 };
const field = new TreeField();
// a broadleaf tree 60m out, canopy centred at 9m up, radius 5
field.add({ x: 0, z: 60, y: 0, h: 13, trunkR: 0.35, trunkH: 8, canopyR: 5, canopyRy: 4.5, canopyY: 9, density: 0.3 });
let hits = 0, through = 0, sum = 0;
for (let i = 0; i < 40; i++) {
  const p = shotParams(CLUBS[4], 0.55 + i * 0.005, 0, SURF.FAIRWAY); // 7 iron, low-ish
  const r = simulateShot(course, { x: (i % 5) * 0.8 - 1.6, y: 0.021, z: 0 }, { x: 0, z: 1 }, p, { trees: field });
  const d = Math.hypot(r.end.x, r.end.z);
  sum += d; if (d < 75) hits++; else through++;
}
console.log('hits', hits, 'through', through, 'mean end', (sum / 40).toFixed(1));
// trunk test
const p = shotParams(CLUBS[4], 0.3, 0, SURF.FAIRWAY);
const r = simulateShot(course, { x: 0, y: 0.021, z: 0 }, { x: 0, z: 1 }, { ...p, loft: 4 }, { trees: field });
console.log('low shot at trunk: end', r.end.x.toFixed(1), r.end.z.toFixed(1), 'maxH', r.maxHeight.toFixed(1));
