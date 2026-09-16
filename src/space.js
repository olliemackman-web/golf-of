// Starfall set dressing: a drifting field of asteroids around the islands.
import * as THREE from 'three';
import { mulberry32, fbm } from './noise.js';
import { splineDist } from './courseData.js';

/** Instanced lumpy rocks placed well clear of the line of play, slowly turning about the hole. */
export function buildAsteroids(course, seed = 1) {
  const rnd = mulberry32(4400 + seed * 97);
  const L = course.layout;
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + fbm(x * 1.7 + 3, y * 1.7 + z * 1.3, 3) * 0.35 + fbm(x * 5, z * 5 + y * 2, 2) * 0.1;
    p.setXYZ(i, x * k, y * k * 0.8, z * k * 1.15);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x7d7772, roughness: 0.96, metalness: 0.05, flatShading: true });
  const N = 90;
  const mesh = new THREE.InstancedMesh(geo, mat, N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const col = new THREE.Color();
  let placed = 0;
  for (let tries = 0; tries < N * 20 && placed < N; tries++) {
    const far = rnd() < 0.35;
    const a = rnd() * Math.PI * 2, r = far ? 500 + rnd() * 1200 : L.size * 0.25 + rnd() * L.size * 0.45;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (!far && splineDist(L, x, z).d < 75) continue; // never over the playing line
    const y = far ? -150 + rnd() * 400 : -70 + rnd() * 120;
    const size = far ? 12 + rnd() * 30 : 3 + Math.pow(rnd(), 2) * 14;
    m.compose(v.set(x, y, z), q.setFromEuler(new THREE.Euler(rnd() * 6.28, rnd() * 6.28, rnd() * 6.28)), s.set(size, size * (0.7 + rnd() * 0.5), size * (0.8 + rnd() * 0.5)));
    mesh.setMatrixAt(placed, m);
    const t = 0.75 + rnd() * 0.45;
    col.setRGB(t, t * (0.96 + rnd() * 0.06), t * (0.92 + rnd() * 0.08));
    mesh.setColorAt(placed, col);
    placed++;
  }
  mesh.count = placed;
  mesh.frustumCulled = false;
  const group = new THREE.Group();
  group.add(mesh);
  group.userData.update = (dt) => { group.rotation.y += dt * 0.0035; };
  return group;
}
