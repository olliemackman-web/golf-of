import { simulateShot } from '../src/physics.js';
import { SURF } from '../src/courseData.js';
import { TreeField } from '../src/vegetation.js';
const course = { heightAt: () => 0, normalAt: (x, z, o = {}) => { o.x = 0; o.y = 1; o.z = 0; return o; }, surfaceAt: () => ({ id: SURF.FAIRWAY, w: {} }), inBounds: () => true, waterLevel: -99 };
const field = new TreeField();
field.add({ x: 0, z: 60, y: 0, h: 13, trunkR: 0.35, trunkH: 8, canopyR: 5, canopyRy: 4.5, canopyY: 9, density: 0.3 });
let hits = 0, through = 0, ends = [];
for (let i = 0; i < 40; i++) {
  const r = simulateShot(course, { x: (i % 8) * 0.7 - 2.5, y: 0.021, z: 0 }, { x: 0, z: 1 }, { speed: 40 + (i % 3), loft: 14 + (i % 4), back: 4000, side: 0 }, { trees: field });
  const d = Math.hypot(r.end.x, r.end.z); ends.push(d.toFixed(0)); if (d < 80) hits++; else through++;
}
console.log('centre-of-crown shots: hits', hits, 'through', through); console.log('end distances', ends.join(' '));
