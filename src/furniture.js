// The things a course has besides grass: tee markers, a hole sign and bench by each tee, yardage
// posts down the fairway, rakes by the bunkers, a cart path, a clubhouse behind the first, tenth
// and last tees, and a few birds overhead. All looks: the ball does not collide with any of it.
import * as THREE from 'three';
import { alongHole, cartPath } from './courseData.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, ...o });

function signTexture(L) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 192; const x = c.getContext('2d');
  x.fillStyle = '#17392b'; x.fillRect(0, 0, 256, 192);
  x.strokeStyle = '#f3eedc'; x.lineWidth = 5; x.strokeRect(9, 9, 238, 174);
  x.fillStyle = '#f3eedc'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 100px Georgia, serif'; x.fillText(String(L.number), 76, 100);
  x.font = 'bold 26px Arial'; x.fillText(`PAR ${L.par}`, 178, 74);
  x.font = 'bold 30px Arial'; x.fillText(String(L.yards), 178, 112); x.font = '18px Arial'; x.fillText('YARDS', 178, 140);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

function wallTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#efe9da'; x.fillRect(0, 0, 512, 128);
  for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(120,110,90,${Math.random() * 0.05})`; x.fillRect(Math.random() * 512, Math.random() * 128, 30 + Math.random() * 60, 2); }
  // a row of tall windows and a door
  for (let i = 0; i < 7; i++) {
    const wx = 28 + i * 68;
    if (i === 3) { x.fillStyle = '#2b3a32'; x.fillRect(wx + 4, 34, 36, 94); x.fillStyle = '#c9a54a'; x.fillRect(wx + 32, 84, 4, 4); continue; }
    x.fillStyle = '#31404a'; x.fillRect(wx, 30, 44, 62);
    const g = x.createLinearGradient(wx, 30, wx + 44, 92); g.addColorStop(0, 'rgba(190,215,235,0.75)'); g.addColorStop(1, 'rgba(90,120,150,0.5)'); x.fillStyle = g; x.fillRect(wx + 3, 33, 38, 56);
    x.fillStyle = '#efe9da'; x.fillRect(wx + 20, 30, 4, 62); x.fillRect(wx, 59, 44, 4);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

function buildClubhouse() {
  const g = new THREE.Group();
  const W = 24, D = 10, H = 4.6;
  const wall = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), [std(0xe9e2d0), std(0xe9e2d0), std(0xe9e2d0), std(0xe9e2d0), std(0xffffff, { map: wallTexture() }), std(0xe9e2d0)]);
  wall.position.y = H / 2; wall.castShadow = true; wall.receiveShadow = true; g.add(wall);
  // pitched slate roof: a triangular prism with a generous overhang
  const s = new THREE.Shape(); s.moveTo(-D / 2 - 1.2, 0); s.lineTo(D / 2 + 1.2, 0); s.lineTo(0, 3.6); s.closePath();
  const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: W + 2, bevelEnabled: false }), std(0x3c444c, { roughness: 0.9 }));
  roof.rotation.y = Math.PI / 2; roof.position.set(-(W + 2) / 2, H, 0); roof.castShadow = true; g.add(roof);
  // veranda along the front: a low deck, posts and a flat canopy
  const deck = new THREE.Mesh(new THREE.BoxGeometry(W, 0.3, 3.2), std(0x8a7558)); deck.position.set(0, 0.15, D / 2 + 1.6); deck.receiveShadow = true; g.add(deck);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(W + 0.6, 0.16, 3.6), std(0x3c444c)); canopy.position.set(0, 3.1, D / 2 + 1.7); canopy.castShadow = true; g.add(canopy);
  for (let i = 0; i <= 6; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3, 0.16), std(0xf4f0e4)); p.position.set(-W / 2 + 0.3 + i * (W - 0.6) / 6, 1.6, D / 2 + 3.1); p.castShadow = true; g.add(p); }
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.6, 1.1), std(0x9a6a52)); chimney.position.set(W / 2 - 4, H + 2.6, -1); chimney.castShadow = true; g.add(chimney);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 1, 2, D + 1), std(0x77736a)); plinth.position.y = -1; g.add(plinth); // hides any gap on sloping ground
  return g;
}

function buildBench() {
  const g = new THREE.Group(), wood = std(0x7a5a3a), iron = std(0x22252a, { metalness: 0.5, roughness: 0.5 });
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.035, 0.11), wood); s.position.set(0, 0.45, -0.13 + i * 0.13); s.castShadow = true; g.add(s); }
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.03), wood); s.position.set(0, 0.6 + i * 0.13, -0.24 - i * 0.03); s.castShadow = true; g.add(s); }
  for (const x of [-0.62, 0.62]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 0.42), iron); l.position.set(x, 0.42, -0.08); l.castShadow = true; g.add(l); }
  return g;
}

/** A strip draped on the ground along a line of [x, z] points, three vertices across so it follows a cross-slope. */
function ribbon(course, path, w, color) {
  const pos = [], uv = [], idx = [];
  path.forEach(([x, z], i) => {
    const a = path[Math.max(0, i - 1)], b = path[Math.min(path.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), nz = b[0] - a[0]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    for (const k of [-1, 0, 1]) { const px = x + nx * w * k, pz = z + nz * w * k; pos.push(px, course.heightAt(px, pz) + 0.05, pz); uv.push(k * 0.5 + 0.5, i * 0.5); }
    if (i) { const o = (i - 1) * 3; idx.push(o, o + 3, o + 1, o + 1, o + 3, o + 4, o + 1, o + 4, o + 2, o + 2, o + 4, o + 5); }
  });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, std(color, { roughness: 0.95, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.receiveShadow = true; return m;
}
/** Split a line into pieces no longer than `step` so a ribbon laid along it can follow the ground. */
function densify(pts, step = 4) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step)); for (let k = 1; k <= n; k++) out.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
  return out;
}

export function buildFurniture(course, { space = false, birds = true } = {}) {
  const g = new THREE.Group(), L = course.layout, t = L.tee;
  const H = (x, z) => course.heightAt(x, z);
  const start = alongHole(L, 0, 0), fx = Math.sin(start.dir), fz = Math.cos(start.dir); // the way the hole sets off
  L.clear = [];

  // tee markers: a pair of painted blocks either side of the ball
  const markCol = { riverbend: 0x2456d8, gosfield: 0xf2f0e8, highland: 0xd8a020, oldjoes: 0xd22b25 }[L.courseId] || 0x2456d8;
  const mk = std(space ? 0x9fe8ff : markCol, { roughness: 0.45, emissive: space ? 0x1a6a80 : 0x000000 });
  const half = Math.min(2.6, t.w / 2 - 1);
  for (const dx of [-half, half]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.075, 16, 10), mk); m.scale.set(1, 0.72, 1);
    m.position.set(t.x + dx, H(t.x + dx, t.z - 0.6) + 0.045, t.z - 0.6); m.castShadow = true; g.add(m);
  }
  if (space) return g;

  // hole sign, ball washer and bench beside the tee
  const side = t.w / 2 + 2.4;
  const sx = t.x - side, sz = t.z + 1, sy = H(sx, sz);
  const post = std(0x4a3a28);
  for (const dx of [-0.36, 0.36]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 1.25, 0.07), post); p.position.set(sx + dx, sy + 0.62, sz); p.castShadow = true; g.add(p); }
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.62, 0.04), [post, post, post, post, post, std(0xffffff, { map: signTexture(L) })]); // faces back toward the golfer walking on to the tee
  board.position.set(sx, sy + 1.0, sz - 0.04); board.castShadow = true; g.add(board);
  const wx = sx + 1.1, wy = H(wx, sz);
  const wp = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 8), std(0x2a2d31, { metalness: 0.5 })); wp.position.set(wx, wy + 0.47, sz); wp.castShadow = true; g.add(wp);
  const wb = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.26, 0.13), std(0xc02a22, { roughness: 0.4 })); wb.position.set(wx, wy + 0.98, sz); wb.castShadow = true; g.add(wb);
  const bench = buildBench(); const bx = t.x + side + 0.6, bz = t.z - 1.5; bench.position.set(bx, H(bx, bz), bz); bench.rotation.y = -Math.PI / 2 + 0.25; g.add(bench);

  // yardage posts on both edges of the fairway: red 100, white 150, blue 200 yards from the middle of the green
  for (const [yd, col] of L.shapes ? [] : [[100, 0xd22b25], [150, 0xf4f2ea], [200, 0x2456d8]]) {
    const tt = 1 - (yd * 0.9144) / (L.len || 400); if (tt < 0.08) continue;
    for (const s of [-1, 1]) {
      const p = alongHole(L, tt, s * ((L.halfWidth || 16) + 1.5));
      if (course.surfaceAt(p.x, p.z).w.water > 0.3 || course.surfaceAt(p.x, p.z).w.sand > 0.3) continue;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.9, 8), std(col, { roughness: 0.5 })); m.position.set(p.x, H(p.x, p.z) + 0.45, p.z); m.castShadow = true; g.add(m);
    }
  }

  // a rake left beside each bunker
  const rakeMat = std(0xb9b29a), rakeHead = std(0x2f6a3a);
  for (const b of L.bunkers) {
    const a = (b.x * 0.37 + b.z * 0.11) % 6.28, rx = b.x + Math.cos(a) * (b.rx + 1.1), rz = b.z + Math.sin(a) * (b.rz + 1.1);
    if (course.surfaceAt(rx, rz).id !== 0) continue; // only on rough: not in sand, on a green or across a fairway
    const r = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1.5, 6), rakeMat); shaft.rotation.z = Math.PI / 2; shaft.castShadow = true; r.add(shaft);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 0.42), rakeHead); head.position.x = 0.75; r.add(head);
    r.position.set(rx, H(rx, rz) + 0.03, rz); r.rotation.y = a + 1.3; g.add(r);
  }

  // cart path: a ribbon draped on the ground, three vertices across so it follows a cross-slope
  const path = cartPath(L);
  if (path.length > 1) g.add(ribbon(course, path, 1.15, 0xb9ae98));

  // a mapped course brings its own buildings and roads
  if (L.shapes) {
    const wallM = std(0xe6dfcc), roofM = std(0x4a4f55, { roughness: 0.9 });
    for (const pts of L.shapes.buildings) {
      const sh = new THREE.Shape(); pts.forEach(([x, z], i) => (i ? sh.lineTo(x, -z) : sh.moveTo(x, -z)));
      let lo = Infinity, cx = 0, cz = 0; for (const [x, z] of pts) { lo = Math.min(lo, H(x, z)); cx += x / pts.length; cz += z / pts.length; }
      const area = Math.abs(THREE.ShapeUtils.area(pts.map(([x, z]) => new THREE.Vector2(x, z)))), tall = area > 200 ? 4.2 : area > 60 ? 3.4 : 2.6;
      const geo = new THREE.ExtrudeGeometry(sh, { depth: tall + 0.6, bevelEnabled: false }); geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, [roofM, wallM]); m.position.y = lo - 0.6; m.castShadow = true; m.receiveShadow = true; g.add(m);
      L.clear.push({ x: cx, z: cz, r: Math.sqrt(area) * 0.8 + 4 });
    }
    // the old post-and-rail fence each hedge has grown up round (and any fence the map shows on its own)
    const runs = [...L.shapes.hedges, ...L.shapes.fences].map((p) => densify(p, 2.4)), nSeg = runs.reduce((a, r) => a + r.length, 0);
    if (nSeg) {
      const wood = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), std(0x6b543a, { roughness: 0.95 }), nSeg * 3);
      const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), X = new THREE.Vector3(1, 0, 0), dv = new THREE.Vector3(); let k = 0;
      for (const r of runs) r.forEach(([x, z], i) => {
        const y = H(x, z);
        mt.compose(pv.set(x, y + 0.6, z), q.identity(), sv.set(0.11, 1.35, 0.11)); wood.setMatrixAt(k++, mt);
        if (!i) return;
        const [px, pz] = r[i - 1], py = H(px, pz);
        for (const up of [0.5, 0.98]) { dv.set(x - px, y - py, z - pz); const len = dv.length(); mt.compose(pv.set((x + px) / 2, (y + py) / 2 + up, (z + pz) / 2), q.setFromUnitVectors(X, dv.normalize()), sv.set(len, 0.1, 0.04)); wood.setMatrixAt(k++, mt); }
      });
      wood.count = k; wood.castShadow = true; g.add(wood);
    }
    for (const r of L.shapes.roads) g.add(ribbon(course, densify(r.pts), r.kind === 'service' ? 1.6 : 2.6, r.kind === 'service' ? 0x8f8a80 : 0x5f6166));
  }

  // the clubhouse stands behind the first, tenth and last tees
  if ([0, 9, 17].includes(L.index) && !L.shapes) {
    const cx = t.x - fx * 46 + fz * 16, cz = t.z - fz * 46 - fx * 16;
    if (course.inBounds(cx, cz)) {
      const ch = buildClubhouse(); ch.position.set(cx, Math.max(H(cx, cz), course.waterLevel + 0.5), cz); ch.rotation.y = start.dir + 0.18; g.add(ch);
      L.clear.push({ x: cx, z: cz, r: 20 });
    }
  }

  // a few birds wheeling high over the hole
  const flock = [];
  if (birds) {
    const mid = alongHole(L, 0.5, 0), wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.16, 0, 0, -0.16, 0.62, 0, -0.05], 3)); wing.computeVertexNormals();
    const bm = new THREE.MeshBasicMaterial({ color: 0x1c1f24, side: THREE.DoubleSide, fog: true });
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Group(), l = new THREE.Mesh(wing, bm), r = new THREE.Mesh(wing, bm); r.scale.x = -1; b.add(l, r);
      b.userData = { l, r, cx: mid.x + Math.sin(i * 2.4) * 70, cz: mid.z + Math.cos(i * 1.7) * 90, rad: 30 + (i * 37 % 50), h: 28 + (i * 13 % 30), sp: (0.1 + (i % 3) * 0.03) * (i % 2 ? 1 : -1), ph: i * 1.9 };
      g.add(b); flock.push(b);
    }
  }
  g.userData.update = (time) => {
    for (const b of flock) {
      const d = b.userData, a = d.ph + time * d.sp;
      b.position.set(d.cx + Math.cos(a) * d.rad, d.h + Math.sin(time * 0.3 + d.ph) * 3, d.cz + Math.sin(a) * d.rad);
      b.rotation.y = -a - (d.sp > 0 ? Math.PI / 2 : -Math.PI / 2) + Math.PI / 2;
      // a few beats, then a glide
      const beat = Math.sin(time * 9 + d.ph) * (Math.sin(time * 0.7 + d.ph) > -0.2 ? 0.7 : 0.1);
      d.l.rotation.z = beat; d.r.rotation.z = -beat;
    }
  };
  return g;
}
