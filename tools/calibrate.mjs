import { CLUBS, shotParams, simulateShot } from '../src/physics.js';
import { SURF } from '../src/courseData.js';
const course = { heightAt: () => 0, normalAt: (x, z, o = {}) => { o.x = 0; o.y = 1; o.z = 0; return o; }, surfaceAt: () => ({ id: SURF.FAIRWAY, w: {} }), inBounds: () => true, waterLevel: -99 };
const yd = (m) => (m * 1.09361).toFixed(0);
const run = (c, mods) => { const p = shotParams(c, 1, 0, SURF.FAIRWAY, mods); const r = simulateShot(course, { x: 0, y: 0.021, z: 0 }, { x: 0, z: 1 }, p); const carry = r.carry ? Math.hypot(r.carry.x, r.carry.z) : 0; return { carry: +yd(carry), total: +yd(Math.hypot(r.end.x, r.end.z)) }; };
for (const c of CLUBS) { if (c.putter) continue; const n = run(c, {}), b = run(c, { spin: { x: 0, y: 1 }, spinPower: 1 }), t = run(c, { spin: { x: 0, y: -1 }, spinPower: 1 }); console.log(c.name.padEnd(15), `carry ${n.carry} total ${n.total} (+${n.total - n.carry})  | max back: carry ${b.carry} total ${b.total} | max top: carry ${t.carry} total ${t.total}`); }
