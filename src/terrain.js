// Terrain mesh + splat shader, water, far hills, sky, clouds, hole & flag.
import * as THREE from 'three';
import { splineDist } from './courseData.js';
import { HOLE_R } from './physics.js';
import { fbm } from './noise.js';
import * as T from './textures.js';

export function buildTextures() {
  const grassC = T.grassTexture({ seed: 7 });
  const grass = T.makeTex(grassC);
  const grassNormal = T.makeTex(T.normalFromCanvas(grassC, 1.1), { srgb: false });
  const sand = T.makeTex(T.sandTexture());
  const noise = T.makeTex(T.noiseTexture(), { srgb: false });
  const bark = T.makeTex(T.barkTexture());
  const leaf = T.makeTex(T.leafCardTexture({ seed: 31, hue: 101 }), { repeat: false });
  const leaf2 = T.makeTex(T.leafCardTexture({ seed: 77, hue: 86 }), { repeat: false });
  const needle = T.makeTex(T.leafCardTexture({ seed: 45, hue: 132, conifer: true }), { repeat: false });
  const blade = T.makeTex(T.grassBladeTexture(), { repeat: false });
  const cloud = T.makeTex(T.cloudTexture(), { repeat: false });
  const ballBump = T.makeTex(T.ballBumpTexture(), { srgb: false });
  const flag = T.makeTex(T.flagTexture(1), { repeat: false });
  const waterNormal = T.makeTex(T.normalFromCanvas(T.sandTexture({ seed: 99 }), 0.9), { srgb: false });
  return { grass, grassNormal, sand, noise, bark, leaf, leaf2, needle, blade, cloud, ballBump, flag, waterNormal };
}

/**
 * Terrain mesh with the turf splat shader. `lite` (phones) skips the close-range blade layer and
 * the neighbour taps used for the bunker lip, saving about half the texture fetches per pixel.
 */
export function buildTerrain(course, tex, sunDir = new THREE.Vector3(0.5, 0.7, 0.5), { lite = false, space = false } = {}) {
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

  const normalTiles = size / 2.2;
  tex.grassNormal.repeat.set(normalTiles, normalTiles);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0, normalMap: tex.grassNormal, normalScale: new THREE.Vector2(0.5, 0.5) });
  // Mowing runs along the first fairway segment; stripe bands lie side by side across it.
  const s0 = course.layout.spline[1], s1 = course.layout.spline[3];
  const mowDir = new THREE.Vector2(s1[0] - s0[0], s1[1] - s0[1]).normalize();
  const stripeDir = new THREE.Vector2(-mowDir.y, mowDir.x);
  const sunXZ = new THREE.Vector2(sunDir.x, sunDir.z).normalize();
  // Canopy occlusion is painted by the vegetation pass; until then a single black texel means "none".
  const noAO = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1, THREE.RGBAFormat); noAO.needsUpdate = true;
  const uniforms = {
    tMask: { value: maskTex }, tGrass: { value: tex.grass }, tSand: { value: tex.sand }, tNoise: { value: tex.noise }, tAO: { value: noAO },
    uSize: { value: size }, uStripeDir: { value: stripeDir }, uMowDir: { value: mowDir }, uSunXZ: { value: sunXZ }, uTime: { value: 0 },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos; varying vec3 vWNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(position, 1.0)).xyz; vWNormal = normalize(mat3(modelMatrix) * normal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWorldPos; varying vec3 vWNormal;
uniform sampler2D tMask, tGrass, tSand, tNoise, tAO;
uniform float uSize; uniform vec2 uStripeDir, uMowDir, uSunXZ;
float terrainRim; float terrainSand; float terrainWater; float terrainFair; float terrainGreen; float terrainDist;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec2 wuv = vWorldPos.xz;
vec2 muv = wuv / uSize + 0.5;
vec4 mask = texture2D(tMask, muv);
float fairway = mask.r, green = mask.g, sand = mask.b, water = mask.a;
float rough = clamp(1.0 - fairway - green - sand - water, 0.0, 1.0);
vec4 nA = texture2D(tNoise, wuv / 61.0);
vec4 nB = texture2D(tNoise, wuv / 9.7 + 0.3);
float camDist = length(vWorldPos - cameraPosition);
float farMix = smoothstep(10.0, 80.0, camDist);
// turf detail at three scales, drifting to a macro sample far away so the tiling never shows
vec3 g1 = texture2D(tGrass, wuv / 1.9).rgb;
vec3 g2 = texture2D(tGrass, wuv / 8.3 + 0.37).rgb;
vec3 gFar = texture2D(tGrass, wuv / 41.0 + 0.11).rgb;
vec3 turf = mix(mix(g1, g2, 0.5), gFar, farMix * 0.65);
#ifndef TERRAIN_LITE
// individual blades within a few metres of the eye
vec3 g0 = texture2D(tGrass, wuv / 0.62 + 0.5).rgb;
turf = mix(turf, mix(turf, g0, 0.6), 1.0 - smoothstep(1.5, 14.0, camDist));
#endif
// ROUGH: longer, darker, bluer, with straw-coloured worn patches
vec3 roughCol = turf * vec3(0.70, 0.84, 0.52);
roughCol = mix(roughCol, roughCol * vec3(1.22, 1.06, 0.62), nA.b * 0.6);
roughCol *= 0.74 + 0.52 * nA.r;
roughCol = mix(roughCol, roughCol * vec3(0.86, 0.96, 1.05), nB.g * 0.3);
// FAIRWAY: mown stripes. Bands lie side by side across the fairway; neighbouring bands were mown
// in opposite directions, so a band reads lighter when you look along the way it was mown.
vec2 toCam = normalize(cameraPosition.xz - wuv);
float band = sign(sin(dot(wuv, uStripeDir) * 6.2831 / 6.5));
float sheen = band * dot(toCam, uMowDir);
float stripeF = 1.0 + 0.12 * sheen * (1.0 - farMix * 0.35) + 0.025 * band;
vec3 fairCol = turf * vec3(0.90, 1.06, 0.56) * stripeF * (0.94 + 0.12 * nA.r);
fairCol = mix(fairCol, fairCol * vec3(1.06, 1.0, 0.82), nA.b * 0.3);
// first cut between fairway and rough: half-way colour, a touch darker because it is longer
float core = smoothstep(0.5, 0.97, fairway);
vec3 collarCol = mix(roughCol, fairCol, 0.55) * 0.93;
vec3 fairMixed = mix(collarCol, fairCol, core);
// GREEN: fine cross-cut checker with the same view-dependent sheen, and a fringe collar
vec3 g3 = texture2D(tGrass, wuv / 0.7).rgb;
float chkA = sign(sin(dot(wuv, uStripeDir) * 6.2831 / 2.2));
float chkB = sign(sin(dot(wuv, uMowDir) * 6.2831 / 2.2));
float chkSheen = chkA * dot(toCam, uMowDir) * 0.06 + chkB * dot(toCam, uStripeDir) * 0.06;
vec3 greenCol = mix(g3, turf, 0.6) * vec3(0.92, 1.10, 0.62) * (1.0 + chkSheen + 0.02 * (chkA + chkB)) * (0.97 + 0.06 * nB.g);
float gcore = smoothstep(0.55, 0.97, green);
vec3 greenMixed = mix(fairCol * 0.96, greenCol, gcore);
// SAND: raked bunker with a shaded lip on the side facing away from the sun. The mask edge is a
// single texel wide, so the sand weight is smoothed over five taps before it is used for the
// blend and the lip, otherwise the texel grid shows as steps along the edge.
vec3 sandCol = texture2D(tSand, wuv / 2.6).rgb * (0.92 + 0.16 * nB.g) * (0.97 + 0.06 * nB.a);
float rim = smoothstep(0.03, 0.4, sand) * (1.0 - smoothstep(0.4, 0.95, sand));
#ifdef TERRAIN_LITE
sandCol *= 1.0 - 0.28 * rim;
#else
float px = 1.1 / uSize;
float sL = texture2D(tMask, muv - vec2(px, 0.0)).b, sR = texture2D(tMask, muv + vec2(px, 0.0)).b;
float sD = texture2D(tMask, muv - vec2(0.0, px)).b, sU = texture2D(tMask, muv + vec2(0.0, px)).b;
sand = (sand * 2.0 + sL + sR + sD + sU) / 6.0;
rough = clamp(1.0 - fairway - green - sand - water, 0.0, 1.0);
vec2 sg = vec2(sR - sL, sU - sD); // points into the bunker
rim = smoothstep(0.03, 0.4, sand) * (1.0 - smoothstep(0.4, 0.95, sand));
float lipShade = rim * clamp(-dot(normalize(sg + 1e-5), uSunXZ), 0.0, 1.0);
sandCol *= 1.0 - 0.5 * lipShade - 0.16 * rim;
#endif
// WATER BED: dark silt, darker toward the middle of the pond
vec3 mud = vec3(0.20, 0.17, 0.11) * (0.8 + 0.4 * nB.r) * (1.0 - 0.5 * smoothstep(0.4, 1.0, water));
float gsum = max(1e-4, rough + fairway + green);
vec3 grass = (roughCol * rough + fairMixed * fairway + greenMixed * green) / gsum;
grass *= 1.0 - 0.2 * rim; // grass overhanging the bunker lip
#ifdef TERRAIN_SPACE
grass *= vec3(0.88, 1.0, 1.04);            // a cooler, alien turf
sandCol *= vec3(0.74, 0.74, 0.78);         // moon-dust craters
mud = vec3(0.003, 0.004, 0.008);           // the void floor, as good as black
#endif
vec3 splat = grass * (1.0 - sand - water) + sandCol * sand + mud * water;
#ifdef TERRAIN_SPACE
// sheer island sides: rock where the ground is steep, fading to black with depth
float steep = smoothstep(0.3, 0.7, 1.0 - vWNormal.y);
// sample the rock noise by height as well as position, otherwise it streaks down the walls
vec2 ruv = vec2((vWorldPos.x + vWorldPos.z) * 0.55 + vWorldPos.x * 0.2, vWorldPos.y);
vec4 rA = texture2D(tNoise, ruv / 21.0), rB = texture2D(tNoise, ruv / 5.3 + 0.4);
vec3 rock = vec3(0.21, 0.185, 0.165) * (0.5 + 0.8 * rB.g) * (0.6 + 0.6 * rA.r) * (0.85 + 0.3 * rB.a);
rock *= 1.0 - 0.35 * smoothstep(0.55, 0.9, rA.b); // dark strata
rock *= smoothstep(-34.0, 0.5, vWorldPos.y);
splat = mix(splat, rock, steep);
#else
// baked canopy shadow / grounding under the trees, plus a little extra darkening deep in the woods
float ao = texture2D(tAO, muv).r;
splat *= 1.0 - 0.52 * ao;
#endif
diffuseColor.rgb *= splat;
terrainRim = rim; terrainSand = sand; terrainWater = water; terrainFair = fairway; terrainGreen = green; terrainDist = camDist;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
float roughW = clamp(1.0 - terrainFair - terrainGreen - terrainSand - terrainWater, 0.0, 1.0);
roughnessFactor = 0.96 * roughW + 0.78 * terrainFair + 0.70 * terrainGreen + 0.86 * terrainSand + 0.55 * terrainWater;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = normalize(mix(normal, nonPerturbedNormal, smoothstep(6.0, 45.0, terrainDist) * 0.92 + terrainSand * 0.6 + terrainGreen * 0.5));`);
  };
  mat.defines = {};
  if (lite) mat.defines.TERRAIN_LITE = '';
  if (space) mat.defines.TERRAIN_SPACE = '';
  mat.customProgramCacheKey = () => 'terrain-splat-v2' + (lite ? '-lite' : '') + (space ? '-space' : '');
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true; mesh.castShadow = false;
  mesh.name = 'terrain';
  return { mesh, uniforms, maskTex };
}

export function buildWater(course, tex, envMap) {
  if (!course.ponds || !course.ponds.length) return null;
  const group = new THREE.Group();
  for (const { pond: p, level } of course.ponds) {
    const r = Math.max(p.rx, p.rz) * 1.45;
    const geo = new THREE.CircleGeometry(r, 64);
    geo.rotateX(-Math.PI / 2);
    tex.waterNormal.repeat.set(r / 5, r / 5);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x1b434c, roughness: 0.16, metalness: 0.0, transparent: true, opacity: 0.94,
      normalMap: tex.waterNormal, normalScale: new THREE.Vector2(0.22, 0.22), envMap, envMapIntensity: 1.25,
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
    mesh.position.set(p.x, level, p.z);
    mesh.receiveShadow = true;
    mesh.renderOrder = 2;
    group.add(mesh);
  }
  return group;
}

/** Big, cheap hills ringing the course so the horizon isn't empty. */
export function buildFarHills(course) {
  const R = 2600, N = 220;
  const geo = new THREE.PlaneGeometry(R * 2, R * 2, N, N);
  geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z);
    const half = course.size / 2;
    const rise = Math.min(1, Math.max(0, (r - (half + 10)) / 500));
    let h = (fbm(x / 600 + 9 + course.layout.seed, z / 600 + 2, 4) * 0.5 + 0.5) * 150 * rise + fbm(x / 150, z / 150, 3) * 22 * rise + fbm(x / 48, z / 48, 2) * 6 * rise;
    if (r < half + 20) {
      // sit well under the real terrain (bunkers/pond are dug out), rising to meet it at the edge
      const c = half - 5;
      const edge = course.heightAt(Math.max(-c, Math.min(c, x)), Math.max(-c, Math.min(c, z)));
      const k = Math.min(1, Math.max(0, (r - (half - 20)) / 40));
      h = edge - 5 * (1 - k) - 0.3;
    }
    p.setY(i, h);
    const n = fbm(x / 90, z / 90, 3) * 0.5 + 0.5;
    const wood = fbm(x / 260 + 3, z / 260 - 1, 3) * 0.5 + 0.5; // darker wooded slopes vs pasture
    const clump = Math.max(0, fbm(x / 42 + 7, z / 42 - 2, 3) * 0.5 + 0.5 - 0.5) * 2; // copses and hedgerows
    const t = Math.min(1, h / 120);
    // base: pasture and woodland, then aerial perspective pulls the far ridges toward the sky colour
    let cr = 0.13 + n * 0.07 + t * 0.03 - wood * 0.04, cg = 0.23 + n * 0.09 - t * 0.03 - wood * 0.06, cb = 0.09 + n * 0.04 + t * 0.05 - wood * 0.02;
    const dk = 1 - 0.4 * clump * (0.4 + wood * 0.6);
    cr *= dk; cg *= dk; cb *= dk;
    const dist = Math.min(1, Math.max(0, (r - 500) / 2100));
    const haze = dist * dist * 0.62;
    cr = cr + (HORIZON.r - cr) * haze; cg = cg + (HORIZON.g - cg) * haze; cb = cb + (HORIZON.b - cb) * haze;
    col[i * 3] = cr; col[i * 3 + 1] = cg; col[i * 3 + 2] = cb;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -0.2;
  mesh.receiveShadow = true;
  return mesh;
}

/** Horizon colour shared by the sky dome and the scene fog, so the far ground melts into the sky. */
export const HORIZON = new THREE.Color(0.64, 0.72, 0.82);

/**
 * Sky dome: a three-stop gradient (deep blue zenith, mid blue, pale haze at the horizon) with a
 * warm glow around the sun and a soft sun disc. Drawn at the far plane and tone-mapped with the
 * rest of the scene. Also baked into the environment map for reflections and ambient colour.
 */
export function buildSky(renderer, scene) {
  const elevation = 29, azimuth = 210; // mid-morning sun, behind and right of the tee: long shadows, warm light
  const phi = THREE.MathUtils.degToRad(90 - elevation), theta = THREE.MathUtils.degToRad(azimuth);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uSun: { value: sunDir.clone() },
      uSpace: { value: 0 },
      uZenith: { value: new THREE.Color(0.09, 0.22, 0.58) },
      uMid: { value: new THREE.Color(0.30, 0.50, 0.86) },
      uHorizon: { value: HORIZON.clone() },
      uWarm: { value: new THREE.Color(0.98, 0.86, 0.66) },
      uSunCol: { value: new THREE.Color(1.0, 0.95, 0.85) },
    },
    vertexShader: `varying vec3 vDir;
      void main() { vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 uSun, uZenith, uMid, uHorizon, uWarm, uSunCol; uniform float uSpace; varying vec3 vDir;
      vec3 hash3(vec3 p) { p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453); }
      // one layer of jittered point stars on a cubic grid over the direction sphere
      vec3 stars(vec3 d, float cells, float size, float gain) {
        vec3 sp = d * cells; vec3 cell = floor(sp); vec3 h = hash3(cell);
        vec3 star = cell + 0.22 + h * 0.56;
        float br = pow(fract(h.x * 57.3 + h.y * 13.7), 5.0);
        float pt = smoothstep(size * (0.5 + br), 0.0, length(sp - star));
        return pt * gain * (0.35 + 2.4 * br) * mix(vec3(1.0, 0.95, 0.88), vec3(0.78, 0.86, 1.0), h.z);
      }
      vec3 spaceSky(vec3 d) {
        vec3 col = vec3(0.003, 0.004, 0.010);
        vec3 bandN = normalize(vec3(0.35, 0.75, -0.55));
        float band = exp(-pow(dot(d, bandN), 2.0) * 16.0);
        float wisps = 0.55 + 0.45 * sin(d.x * 11.0 + d.z * 7.0 + sin(d.y * 9.0) * 2.0);
        col += band * wisps * vec3(0.05, 0.06, 0.11);
        col += stars(d, 90.0, 0.22, 1.0);
        col += stars(d + 3.1, 170.0, 0.2, 0.55 + band * 1.2);
        // a ringed blue world low in the sky opposite the sun
        vec3 pdir = normalize(vec3(-uSun.x, 0.24, -uSun.z));
        float pd = dot(d, pdir);
        float R = 0.0949; // sin of the disc's angular radius
        vec3 t2 = (d - pdir * pd) / R;
        float t2l = dot(t2, t2);
        if (pd > 0.0 && t2l < 1.0) {
          vec3 nrm = normalize(t2 + pdir * sqrt(1.0 - t2l));
          float lit = max(0.0, dot(nrm, uSun));
          float bands = 0.5 + 0.5 * sin(nrm.y * 22.0 + sin(nrm.x * 9.0));
          vec3 pcol = mix(vec3(0.10, 0.24, 0.50), vec3(0.55, 0.72, 0.88), bands * 0.6);
          col = pcol * (0.06 + 1.1 * lit) + vec3(0.25, 0.45, 0.9) * pow(1.0 - sqrt(1.0 - t2l), 2.0) * 0.5;
        } else if (pd > 0.0) {
          col += vec3(0.25, 0.45, 0.9) * exp(-(sqrt(t2l) - 1.0) * 14.0) * 0.35;
        }
        float sd = max(0.0, dot(d, uSun));
        col += vec3(1.0, 0.98, 0.94) * (pow(sd, 1400.0) * 9.0 + pow(sd, 90.0) * 0.4);
        return col;
      }
      void main() {
        vec3 d = normalize(vDir);
        if (uSpace > 0.5) { gl_FragColor = vec4(spaceSky(d), 1.0); }
        else {
          float y = d.y;
          float h = pow(clamp(y, 0.0, 1.0), 0.5);
          vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.42, h));
          col = mix(col, uZenith, smoothstep(0.35, 1.0, h));
          float sd = max(0.0, dot(d, uSun));
          // warm haze toward the sun, strongest low in the sky
          col = mix(col, uWarm, pow(sd, 3.0) * 0.4 * (1.0 - h * 0.7));
          col += uSunCol * (pow(sd, 900.0) * 6.0 + pow(sd, 40.0) * 0.5 + pow(sd, 6.0) * 0.12);
          // below the horizon: a slightly darker haze so the sky never shows through gaps
          col = mix(col, uHorizon * 0.9, smoothstep(0.0, -0.08, y));
          gl_FragColor = vec4(col, 1.0);
        }
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(5000, 48, 24), mat);
  sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky);
  const skyScene = new THREE.Scene(); skyScene.add(new THREE.Mesh(sky.geometry, mat));
  const bake = () => { const pmrem = new THREE.PMREMGenerator(renderer); const env = pmrem.fromScene(skyScene, 0.04).texture; pmrem.dispose(); return env; };
  let envMap = bake();
  scene.environment = envMap;
  scene.environmentIntensity = 0.42;
  /** Switch between the daytime dome and deep space; re-bakes the environment map and returns it. */
  const setSpace = (on) => {
    mat.uniforms.uSpace.value = on ? 1 : 0;
    if (envMap) envMap.dispose();
    envMap = bake(); scene.environment = envMap;
    return envMap;
  };
  return { sky, sunDir, envMap, setSpace };
}

export function buildClouds(tex) {
  const group = new THREE.Group();
  const mat = new THREE.SpriteMaterial({ map: tex.cloud, color: 0xfff7ee, transparent: true, depthWrite: false, opacity: 0.68, fog: true });
  const sprites = [];
  for (let i = 0; i < 16; i++) {
    const s = new THREE.Sprite(mat);
    const a = (i / 16) * Math.PI * 2 + Math.sin(i * 7.3) * 0.5, r = 700 + (Math.sin(i * 3.1) * 0.5 + 0.5) * 1700;
    s.position.set(Math.cos(a) * r, 340 + (Math.sin(i * 1.9) * 0.5 + 0.5) * 300, Math.sin(a) * r);
    const w = 520 + (Math.sin(i * 5.7) * 0.5 + 0.5) * 760;
    s.scale.set(w, w * 0.4, 1);
    s.userData.drift = 1.5 + Math.sin(i) * 0.5;
    group.add(s); sprites.push(s);
  }
  group.userData.update = (dt) => { for (const s of sprites) { s.position.x += s.userData.drift * dt; if (s.position.x > 2200) s.position.x = -2200; } };
  return group;
}

/** Cup (cut into the terrain with the depth trick), flagstick and a waving flag. */
export function buildHole(course, tex) {
  const g = new THREE.Group();
  const { x, z } = course.layout.pin;
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
  const fmat = new THREE.MeshStandardMaterial({ map: T.makeTex(T.flagTexture(course.layout.number), { repeat: false }), side: THREE.DoubleSide, roughness: 0.8 });
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
  const t = course.layout.tee;
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
