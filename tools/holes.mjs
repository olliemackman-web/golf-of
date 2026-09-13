import { COURSES, holeFor, HOLE_COUNT, courseYards } from '../src/courseData.js';
for (let c = 0; c < COURSES.length; c++) {
  let tot = 0; console.log(`== ${COURSES[c].name} (${courseYards(c)} yds)`);
  for (let i = 0; i < HOLE_COUNT; i++) { const h = holeFor(c, i); tot += h.par; const maxX = Math.max(...h.spline.map(p => Math.abs(p[0]))); console.log(`H${h.number} ${(h.name || '').padEnd(20)} par ${h.par} ${h.yards} yd size ${h.size} bend ${(h.bendAngle*180/Math.PI).toFixed(0)}° maxX ${maxX.toFixed(0)} bunkers ${h.bunkers.length} pond ${h.pond ? (h.carry ? 'carry' : 'y') : '-'}`); }
  console.log('total par', tot);
}
