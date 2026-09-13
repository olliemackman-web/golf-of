import { Course, makeHole } from '../src/courseData.js';
import { CLUBS, shotParams, simulateShot, BALL_R } from '../src/physics.js';
let t=Date.now(); const course = new Course(makeHole(2)); console.log('Course build ms', Date.now()-t);
const L = course.layout; const from = { x: L.tee.x, y: course.heightAt(L.tee.x, L.tee.z)+BALL_R, z: L.tee.z };
for (const c of [CLUBS[0], CLUBS[4], CLUBS[8]]) { t=Date.now(); for (let i=0;i<9;i++) simulateShot(course, from, {x:0,z:1}, shotParams(c, 0.5+i*0.05, 0, 1), {maxT:30}); console.log(c.id, '9 sims ms', Date.now()-t); }
