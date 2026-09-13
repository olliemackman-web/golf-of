// Terrain mesh + splat shader, water, far hills, sky, clouds, hole & flag.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { LAYOUT, splineDist } from './courseData.js';
import { HOLE_R } from './physics.js';
import { fbm } from './noise.js';
import * as T from './textures.js';

export function buildTextures() {
  const grassC = T.grassTexture({ seed: 7 });
  const grass = T.makeTex(grassC);
  const grassNormal = T.makeTex(T.normalFromCanvas(grassC, 1.6), { srgb: false });
  const sand = T.makeTex(T.sandTexture());
  const noise = T.makeTex(T.noiseTexture(), { srgb: false });
  const bark = T.makeTex(T.barkTexture());
  const leaf = T.makeTex(T.leafCardTexture({ seed: 31, hue: 105 }), { repeat: false });
  const leaf2 = T.makeTex(T.leafCardTexture({ seed: 77, hue: 88 }), { repeat: false });
  const needle = T.makeTex(T.leafCardTexture({ seed: 45, hue: 130, conifer: true }), { repeat: false });
  const blade = T.makeTex(T.grassBladeTexture(), { repeat: false });
  const cloud = T.makeTex(T.cloudTexture(), { repeat: false });
  const ballBump = T.makeTex(T.ballBumpTexture(), { srgb: false });
  const flag = T.makeTex(T.flagTexture(1), { repeat: false });
  const waterNormal = T.makeTex(T.normalFromCanvas(T.sandTexture({ seed: 99 }), 0.9), { srgb: false });
  return { grass, grassNormal, sand, noise, bark, leaf, leaf2, needle, blade, cloud, ballBump, flag, waterNormal };
}

export function buildTerrain(course, tex) {
  const N = course.res, size = course.size, half = size / 2, step = course.step;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * N * 3), uv = new Float32Array(N * N * 2);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const k = j * N + i;
    pos[k * 3] = -half + i * step; pos[k * 3 + 1] = course.heights[k]; pos[k * 3 + 2] = -half + j * step;
    uv[k * 2] = i / (N - 1); uv[k * 2 + 1] = j / (N - 1);
  }
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  let q = 0;
  for (let j = 0; j < N - 1; j++) for (let i = 0; i < N - 1; i++) {
    const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();

  const maskTex = new THREE.DataTexture(course.mask, course.maskRes, course.maskRes, THREE.RGBAFormat);
  maskTex.flipY = false; maskTex.needsUpdate = true; maskTex.minFilter = THREE.LinearFilter; maskTex.magFilter = THREE.LinearFilter;
  maskTex.wrapS = maskTex.wrapT = THREE.ClampToEdgeWrapping;

  const normalTiles = size / 2.6;
  tex.grassNormal.repeat.set(normalTiles, normalTiles);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, normalMap: tex.grassNormal, normalScale: new THREE.Vector2(0.55, 0.55) });
  // Stripes run along the first fairway segment.
  const s0 = LAYOUT.spline[1], s1 = LAYOUT.spline[3];
  const sd = new THREE.Vector2(s1[0] - s0[0], s1[1] - s0[1]).normalize();
  const stripeDir = new THREE.Vector2(-sd.y, sd.x);
  const uniforms = {
    tMask: { value: maskTex }, tGrass: { value: tex.grass }, tSand: { value: tex.sand }, tNoise: { value: tex.noise },
    uSize: { value: size }, uStripeDir: { value: stripeDir }, uTime: { value: 0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWorldPos;
uniform sampler2D tMask, tGrass, tSand, tNoise;
uniform float uSize; uniform vec2 uStripeDir;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 wuv = vWorldPos.xz;
vec4 mask = texture2D(tMask, wuv / uSize + 0.5);
float fairway = mask.r, green = mask.g, sand = mask.b, water = mask.a;
float rough = clamp(1.0 - fairway - green - sand - water, 0.0, 1.0);
vec3 noiseA = texture2D(tNoise, wuv / 43.0).rgb;
vec3 noiseB = texture2D(tNoise, wuv / 7.3).rgb;
float camDist = length(vWorldPos - cameraPosition);
float farMix = smoothstep(25.0, 140.0, camDist);
vec3 g1 = texture2D(tGrass, wuv / 2.4).rgb;
vec3 g2 = texture2D(tGrass, wuv / 11.0 + 0.37).rgb;
vec3 gFar = texture2D(tGrass, wuv / 37.0 + 0.11).rgb;
vec3 grassBase = mix(mix(g1, g2, 0.45), gFar, farMix * 0.6);
vec3 roughCol = grassBase * vec3(0.82, 0.86, 0.52) * (0.72 + 0.55 * noiseA.r);
roughCol = mix(roughCol, roughCol * vec3(1.2, 1.02, 0.62), smoothstep(0.5, 0.85, noiseA.g) * 0.7);
float stripe = sin(dot(wuv, uStripeDir) * 6.2831 / 7.0);
float stripeF = 0.9 + 0.1 * smoothstep(-0.25, 0.25, stripe);
vec3 fairCol = grassBase * vec3(0.86, 1.14, 0.62) * stripeF * (0.9 + 0.2 * noiseA.r);
vec3 g3 = texture2D(tGrass, wuv / 0.8).rgb;
vec2 sd2 = vec2(-uStripeDir.y, uStripeDir.x);
float chk = smoothstep(-0.2, 0.2, sin(dot(wuv, uStripeDir) * 6.2831 / 2.6)) * 0.5 + smoothstep(-0.2, 0.2, sin(dot(wuv, sd2) * 6.2831 / 2.6)) * 0.5;
vec3 greenCol = mix(g3, grassBase, 0.55) * vec3(0.92, 1.2, 0.7) * (0.9 + 0.14 * chk);
vec3 sandCol = texture2D(tSand, wuv / 3.1).rgb * (0.88 + 0.24 * noiseB.g);
vec3 mud = vec3(0.22, 0.19, 0.12) * (0.8 + 0.4 * noiseB.r);
vec3 splat = roughCol * rough + fairCol * fairway + greenCol * green + sandCol * sand + mud * water;
diffuseColor.rgb *= splat;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(0.96, 0.82, sand);
roughnessFactor = mix(roughnessFactor, 0.6, water);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(mix(normal, nonPerturbedNormal, smoothstep(20.0, 110.0, camDist) * 0.85 + sand * 0.5));`);
  };
  mat.customProgramCacheKey = () => 'terrain-splat';
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.castShadow = false;
  mesh.name = 'terrain';
  return { mesh, uniforms, maskTex };
}

export function buildWater(course, tex, envMap) {
  const p = LAYOUT.pond;
  const r = Math.max(p.rx, p.rz) * 1.45;
  const geo = new THREE.CircleGeometry(r, 64);
  geo.rotateX(-Math.PI / 2);
  tex.waterNormal.repeat.set(r / 4, r / 4);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x1f4a52, roughness: 0.22, metalness: 0.0, transparent: true, opacity: 0.92,
    normalMap: tex.waterNormal, normalScale: new THREE.Vector2(0.35, 0.35), envMap, envMapIntensity: 1.1,
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.tMask = { value: null }; shader.uniforms.uSize = { value: course.size };
    mat.userData.shader = shader;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos; uniform sampler2D tMask; uniform float uSize;')
      .replace('#include <color_fragment>', `#include <color_fragment>
float wmask = texture2D(tMask, vWorldPos.xz / uSize + 0.5).a;
diffuseColor.a *= smoothstep(0.02, 0.5, wmask);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.36, 0.28), (1.0 - smoothstep(0.3, 1.0, wmask)) * 0.6);`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(p.x, course.waterLevel, p.z);
  mesh.receiveShadow = true;
  mesh.renderOrder = 2;
  return mesh;
}

/** Big, cheap hills ringing the course so the horizon isn't empty. */
export function buildFarHills(course) {
  const R = 2600, N = 160;
  const geo = new THREE.PlaneGeometry(R * 2, R * 2, N, N);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    const rise = Math.min(1, Math.max(0, (r - 330) / 500));
    let h = (fbm(x / 600 + 9, z / 600 + 2, 4) * 0.5 + 0.5) * 140 * rise + fbm(x / 150, z / 150, 3) * 18 * rise;
    if (r < 340) {
      // sit well under the real terrain (bunkers/pond are dug out), rising to meet it at the edge
      const edge = course.heightAt(Math.max(-315, Math.min(315, x)), Math.max(-315, Math.min(315, z)));
      const k = Math.min(1, Math.max(0, (r - 300) / 40));
      h = edge - 5 * (1 - k) - 0.3;
    }
    p.setY(i, h);
    const n = fbm(x / 90, z / 90, 3) * 0.5 + 0.5;
    const t = Math.min(1, h / 120);
    col[i * 3] = 0.16 + n * 0.08 + t * 0.05; col[i * 3 + 1] = 0.3 + n * 0.1 - t * 0.04; col[i * 3 + 2] = 0.13 + n * 0.05 + t * 0.06;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.2;
  mesh.receiveShadow = true;
  return mesh;
}

export function buildSky(renderer, scene) {
  const sky = new Sky();
  sky.scale.setScalar(20000);
  const u = sky.material.uniforms;
  u.turbidity.value = 3.2; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.86;
  const elevation = 34, azimuth = 210; // late-morning sun, behind and right of the tee
  const phi = THREE.MathUtils.degToRad(90 - elevation), theta = THREE.MathUtils.degToRad(azimuth);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  u.sunPosition.value.copy(sunDir);
  scene.add(sky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skyScene = new THREE.Scene(); skyScene.add(sky.clone());
  const envMap = pmrem.fromScene(skyScene, 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  return { sky, sunDir, envMap };
}

export function buildClouds(tex) {
  const group = new THREE.Group();
  const mat = new THREE.SpriteMaterial({ map: tex.cloud, transparent: true, depthWrite: false, opacity: 0.9, fog: true });
  const sprites = [];
  for (let i = 0; i < 18; i++) {
    const s = new THREE.Sprite(mat);
    const a = (i / 18) * Math.PI * 2 + Math.sin(i * 7.3) * 0.5, r = 500 + (Math.sin(i * 3.1) * 0.5 + 0.5) * 1400;
    s.position.set(Math.cos(a) * r, 240 + (Math.sin(i * 1.9) * 0.5 + 0.5) * 220, Math.sin(a) * r);
    const w = 260 + (Math.sin(i * 5.7) * 0.5 + 0.5) * 420;
    s.scale.set(w, w * 0.5, 1);
    s.userData.drift = 1.5 + Math.sin(i) * 0.5;
    group.add(s); sprites.push(s);
  }
  group.userData.update = (dt) => { for (const s of sprites) { s.position.x += s.userData.drift * dt; if (s.position.x > 2200) s.position.x = -2200; } };
  return group;
}

/** Cup (cut into the terrain with the depth trick), flagstick and a waving flag. */
export function buildHole(course, tex) {
  const g = new THREE.Group();
  const { x, z } = LAYOUT.pin;
  const y = course.heightAt(x, z);
  g.position.set(x, y, z);
  const depth = 0.11;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(HOLE_R, HOLE_R, depth, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9, side: THREE.BackSide }));
  wall.position.y = -depth / 2; wall.renderOrder = -3; g.add(wall);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(HOLE_R, 32), new THREE.MeshStandardMaterial({ color: 0x0c0c0c, roughness: 1 }));
  bottom.rotation.x = -Math.PI / 2; bottom.position.y = -depth; bottom.renderOrder = -3; g.add(bottom);
  // Invisible cap that punches the hole through the terrain.
  const cap = new THREE.Mesh(new THREE.CircleGeometry(HOLE_R * 0.98, 32), new THREE.MeshBasicMaterial({ colorWrite: false }));
  cap.rotation.x = -Math.PI / 2; cap.position.y = 0.004; cap.renderOrder = -2; g.add(cap);
  const rim = new THREE.Mesh(new THREE.RingGeometry(HOLE_R * 0.97, HOLE_R * 1.08, 32), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.6, side: THREE.DoubleSide }));
  rim.rotation.x = -Math.PI / 2; rim.position.y = 0.006; g.add(rim);
  // Flagstick
  const stickH = 2.13;
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.013, stickH, 12), new THREE.MeshStandardMaterial({ color: 0xf5f0e0, roughness: 0.4, metalness: 0.1 }));
  stick.position.y = stickH / 2 - depth; stick.castShadow = true; g.add(stick);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 }));
  band.position.y = 0.3; g.add(band);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffd23c, roughness: 0.4, metalness: 0.4 }));
  knob.position.y = stickH - depth; g.add(knob);
  const flagW = 0.56, flagH = 0.38;
  const fgeo = new THREE.PlaneGeometry(flagW, flagH, 16, 6);
  fgeo.translate(flagW / 2, 0, 0);
  const fmat = new THREE.MeshStandardMaterial({ map: tex.flag, side: THREE.DoubleSide, roughness: 0.8 });
  const fu = { uTime: { value: 0 } };
  fmat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = fu.uTime;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float fx = uv.x;
transformed.z += sin(fx * 9.0 - uTime * 7.0) * 0.05 * fx + sin(fx * 4.0 - uTime * 3.1) * 0.03 * fx;
transformed.y += sin(fx * 6.0 - uTime * 5.0) * 0.012 * fx;`);
  };
  const flag = new THREE.Mesh(fgeo, fmat);
  flag.position.y = stickH - depth - flagH / 2 - 0.05;
  flag.castShadow = true;
  g.add(flag);
  g.userData.flag = flag; g.userData.uniforms = fu;
  g.userData.update = (t, windDir) => { fu.uTime.value = t; flag.rotation.y = windDir + Math.sin(t * 0.7) * 0.15; };
  return g;
}

export function buildTeeMarkers(course) {
  const g = new THREE.Group();
  const t = LAYOUT.tee;
  const mat = new THREE.MeshStandardMaterial({ color: 0x1e4fd8, roughness: 0.5 });
  for (const dx of [-2.2, 2.2]) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), mat);
    m.position.set(t.x + dx, course.heightAt(t.x + dx, t.z - 1) + 0.05, t.z - 1);
    m.castShadow = true; g.add(m);
  }
  // yardage plate
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.35), new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7 }));
  plate.position.set(t.x - 3.6, course.heightAt(t.x - 3.6, t.z - 2) + 0.03, t.z - 2); plate.rotation.y = 0.3; g.add(plate);
  return g;
}

export { splineDist };
