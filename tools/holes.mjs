import { makeHole, HOLE_COUNT } from '../src/courseData.js';
let tot = 0;
for (let i = 0; i < HOLE_COUNT; i++) { const h = makeHole(i); tot += h.par; const maxX = Math.max(...h.spline.map(p => Math.abs(p[0]))); console.log(`H${h.number} par ${h.par} ${h.yards} yd size ${h.size} bend ${(h.bendAngle*180/Math.PI).toFixed(0)}° maxX ${maxX.toFixed(0)} bunkers ${h.bunkers.length} pond ${h.pond ? 'y' : '-'}`); }
console.log('total par', tot);
