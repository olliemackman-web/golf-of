import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Course, holeFor, COURSES, HOLE_COUNT, SURF, SURF_NAME, splineDist, splinePoint, splineLength, courseYards } from './courseData.js';
import { Ball, BALL_R, CLUBS, shotParams, simulateShot } from './physics.js';
import { buildTextures, buildTerrain, buildWater, buildFarHills, buildSky, buildClouds, buildHole, HORIZON, CONDITIONS } from './terrain.js';
import { buildFurniture } from './furniture.js';
import { buildVegetation, setWindTime, TreeField, GrassPatch } from './vegetation.js';
import { buildAsteroids } from './space.js';
import { Golfer } from './golfer.js';
import { Hud, yards } from './hud.js';
import { GameAudio } from './audio.js';
import { Effects } from './effects.js';
import { GreenRead } from './greenread.js';
import { ProfileStore, coinsFor, UPGRADES } from './profile.js';
import { Menus, shortSpin } from './menus.js';
import { mulberry32, clamp, smoothstep, lerp } from './noise.js';

const UP = new THREE.Vector3(0, 1, 0);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const T_METER = 1.15, T_METER_PUTT = 1.9, T_DOWN = 0.32, T_DOWN_PUTT = 0.36, T_ACC = 0.75, T_ACC_PUTT = 0.9;
const TEE_H = 0.028; // how far a teed ball sits above the turf
const ZOOM_MAX = 5, ZOOM_STEPS = [1, 1.6, 2.5, 4];
import { ACC_BANDS, accBand } from './hud.js';

/** A screen-space-width line over a fixed buffer of `maxPts` points; fill it with writeFatLine. */
function fatLine(maxPts, opts, geo = null) {
  if (!geo) { geo = new LineGeometry(); geo.setPositions(new Float32Array(maxPts * 3)); geo.instanceCount = 0; }
  const line = new Line2(geo, new LineMaterial(opts)); line.frustumCulled = false; line.visible = false;
  return line;
}
/** Write n points into a fatLine's buffer; get(i, out) fills out[0..2] with point i. */
const _fp = [0, 0, 0];
function writeFatLine(geo, n, get) {
  const data = geo.attributes.instanceStart.data, arr = data.array;
  for (let i = 0; i < n; i++) {
    get(i, _fp);
    if (i < n - 1) { arr[i * 6] = _fp[0]; arr[i * 6 + 1] = _fp[1]; arr[i * 6 + 2] = _fp[2]; }
    if (i > 0) { arr[i * 6 - 3] = _fp[0]; arr[i * 6 - 2] = _fp[1]; arr[i * 6 - 1] = _fp[2]; }
  }
  geo.instanceCount = Math.max(0, n - 1); data.needsUpdate = true;
}

class Game {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.overlay = document.getElementById('overlay');
    this.panel = document.getElementById('panel');
    this.state = 'loading';
    this.clock = new THREE.Clock();
    this.time = 0;
    this.tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3(), q: new THREE.Quaternion() };
    this.keys = {};
    this.rnd = mulberry32(Date.now() & 0xffff);
    this.aimZoom = 1; // 1..ZOOM_MAX, narrows the aim camera; drag and key aiming get finer to match
  }

  async init() {
    const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const small = Math.min(window.innerWidth, window.innerHeight) < 600 || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    this.isMobile = coarse || small;
    this.quality = this.isMobile
      ? { dpr: Math.min(window.devicePixelRatio, 1.5), shadow: 2048, shadowRange: 70, bloom: false, msaa: 0, veg: { cardsBroad: 44, cardsConifer: 44, tufts: 18000, reeds: 3500, aa: true } }
      : { dpr: Math.min(window.devicePixelRatio, 1.75), shadow: 4096, shadowRange: 95, bloom: true, msaa: 4, veg: { aa: true } };
    // antialias on for both tiers: on phones the default framebuffer MSAA is nearly free and it is what
    // stops the foliage and grass edges shimmering; alpha-to-coverage rides on it.
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(this.quality.dpr);
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.12;
    const scene = this.scene = new THREE.Scene();
    // fog colour matches the sky dome at the horizon so distant trees and hills melt into it
    scene.fog = new THREE.FogExp2(HORIZON.clone(), 0.0008);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 6000);
    this.lookDir = new THREE.Vector3(0, 0, 1);

    await this.frame(); document.getElementById('loading').textContent = 'PAINTING TEXTURES…'; await this.frame();
    this.tex = buildTextures();
    this.skyCtl = buildSky(r, scene);
    this.sunDir = this.skyCtl.sunDir; this.envMap = this.skyCtl.envMap; this.spaceMode = false;
    this.clouds = buildClouds(this.tex); scene.add(this.clouds);
    this.conditions = 'morning'; try { const k = localStorage.getItem('riverbend-conditions'); if (CONDITIONS[k]) this.conditions = k; } catch (e) { /* private mode */ }
    this.envMap = this.skyCtl.setConditions(CONDITIONS[this.conditions]); this.appliedConditions = this.conditions; // before the first hole is built: its haze and sun come from this
    this.holeGroup = null; this.scores = []; this.holeIndex = 0; this.courseIndex = 0;
    await this.buildHoleScene(0, (t) => { document.getElementById('loading').textContent = t; });

    // lights: a warm key from the sun, cool fill from the sky, so shadows go blue rather than grey
    const sun = this.sun = new THREE.DirectionalLight(0xffe7c4, 3.1);
    sun.castShadow = true; sun.shadow.mapSize.set(this.quality.shadow, this.quality.shadow);
    const sr = this.quality.shadowRange;
    const sc = sun.shadow.camera; sc.near = 1; sc.far = 700; sc.left = -sr; sc.right = sr; sc.top = sr; sc.bottom = -sr;
    sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.5; sun.shadow.radius = 2;
    scene.add(sun); scene.add(sun.target);
    this.hemi = new THREE.HemisphereLight(0x8fb2e6, 0x46552c, 0.62); scene.add(this.hemi);
    // rain: slanted streaks in a box that travels with the camera
    {
      const N = 2200, W = 26, H = 16, p = new Float32Array(N * 6), e = new Float32Array(N * 2);
      for (let i = 0; i < N; i++) { const x = Math.random() * W, y = Math.random() * H, z = Math.random() * W; p.set([x, y, z, x, y, z], i * 6); e[i * 2] = 0; e[i * 2 + 1] = 1; }
      const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(p, 3)); rg.setAttribute('aEnd', new THREE.BufferAttribute(e, 1));
      this.rainMat = new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2() } },
        vertexShader: `attribute float aEnd; uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; varying float vA;
          void main() { vec3 p = position; float sp = 13.0 + fract(p.x * 7.31 + p.z * 3.17) * 5.0;
            p.y = mod(p.y - uTime * sp, ${H.toFixed(1)});
            p.xz += uWind * (${H.toFixed(1)} - p.y) * -0.07;
            p.xz = uCam.xz + mod(p.xz - uCam.xz, ${W.toFixed(1)}) - ${(W / 2).toFixed(1)};
            p.y += uCam.y - ${(H * 0.4).toFixed(1)};
            p += vec3(uWind.x * 0.07, 1.0, uWind.y * 0.07) * aEnd * 0.55;
            vA = 0.1 + 0.25 * aEnd; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }`,
        fragmentShader: 'varying float vA; void main() { gl_FragColor = vec4(vec3(0.82, 0.86, 0.92), vA); }',
        transparent: true, depthWrite: false,
      });
      this.rain = new THREE.LineSegments(rg, this.rainMat); this.rain.frustumCulled = false; this.rain.visible = false; this.rain.renderOrder = 7; scene.add(this.rain);
    }


    // ball
    const bmat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.2, bumpMap: this.tex.ballBump, bumpScale: 0.0008 });
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 40, 28), bmat); this.ballMesh.castShadow = true; scene.add(this.ballMesh);
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.renderOrder = 3; scene.add(this.blob);
    this.ball = new Ball(this.course); this.ball.trees = this.trees; this.ball.hole = this.course.layout.pin;
    // shot tracer: a glowing tail behind the ball that fades out along its length
    this.trailN = 150; this.trailPts = [];
    this.trail = fatLine(this.trailN, { color: 0xfff1d0, linewidth: 3.5, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const tc = new Float32Array(this.trailN * 3); for (let i = 0; i < this.trailN; i++) { const a = Math.pow(i / (this.trailN - 1), 1.6); tc[i * 3] = tc[i * 3 + 1] = tc[i * 3 + 2] = a; }
    this.trail.geometry.setColors(tc);
    scene.add(this.trail);

    // aim preview: a white arc with a soft dark edge so it reads against both sky and turf
    this.previewLine = fatLine(900, { color: 0xffffff, linewidth: 2.6, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false });
    this.previewLine.renderOrder = 20; scene.add(this.previewLine);
    this.previewEdge = fatLine(900, { color: 0x06120c, linewidth: 5.5, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false }, this.previewLine.geometry);
    this.previewEdge.renderOrder = 19; scene.add(this.previewEdge);
    // Putting: a dashed glowing ribbon laid on the green, green when the putt drops.
    const rgeo = new THREE.BufferGeometry();
    rgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(900 * 2 * 3), 3));
    rgeo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(900 * 2 * 2), 2));
    const ridx = []; for (let i = 0; i < 899; i++) { const a = i * 2; ridx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    rgeo.setIndex(ridx);
    this.ribbonMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffffff) }, uTime: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
        void main(){ float d = fract(vUv.x / 0.55 - uTime * 0.6); float dash = smoothstep(0.02, 0.1, d) * (1.0 - smoothstep(0.55, 0.63, d));
        float edge = 1.0 - smoothstep(0.55, 1.0, abs(vUv.y - 0.5) * 2.0);
        float a = dash * edge; if (a < 0.02) discard; gl_FragColor = vec4(uColor * (1.0 + 0.6 * edge), a * 0.95); }`,
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
    });
    this.puttRibbon = new THREE.Mesh(rgeo, this.ribbonMat); this.puttRibbon.renderOrder = 21; this.puttRibbon.frustumCulled = false; this.puttRibbon.visible = false; scene.add(this.puttRibbon);
    this.landRing = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.0, 40), new THREE.MeshBasicMaterial({ color: 0xc9ff5b, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide }));
    this.landRing.rotation.x = -Math.PI / 2; this.landRing.renderOrder = 21; scene.add(this.landRing);

    this.golfer = new Golfer(); this.golfer.group.visible = false; scene.add(this.golfer.group);
    // tee peg under the ball for the first shot of each hole
    const pegMat = new THREE.MeshStandardMaterial({ color: 0xf2ead6, roughness: 0.6 });
    this.peg = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0034, 0.0014, 0.05, 8), pegMat); stem.position.y = -0.025; this.peg.add(stem);
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0034, 0.007, 10), pegMat); cup.position.y = -0.0035; this.peg.add(cup);
    this.peg.visible = false; scene.add(this.peg);
    this.fx = new Effects(scene); this.fx.ground = (x, z) => this.groundY(x, z);
    this.greenRead = new GreenRead(); scene.add(this.greenRead.points);
    this.grass = new GrassPatch(this.isMobile ? 6000 : 16000, 3.6, this.tex.grass.image); scene.add(this.grass.mesh);

    // post
    if (this.quality.bloom) {
      const rt = new THREE.WebGLRenderTarget(window.innerWidth, window.innerHeight, { samples: this.quality.msaa, type: THREE.HalfFloatType });
      this.composer = new EffectComposer(r, rt);
      this.composer.addPass(new RenderPass(scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.14, 0.6, 0.86);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      // final grade: a touch more saturation and contrast, and a soft vignette to frame the view
      this.composer.addPass(new ShaderPass({
        uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.3 }, uSat: { value: 1.03 }, uContrast: { value: 1.05 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette, uSat, uContrast; varying vec2 vUv;
          void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
          c.rgb = mix(vec3(l), c.rgb, uSat); c.rgb = (c.rgb - 0.5) * uContrast + 0.5;
          vec2 d = vUv - 0.5; c.rgb *= 1.0 - uVignette * smoothstep(0.3, 1.0, dot(d, d) * 2.2); gl_FragColor = c; }`,
      }));
    } else {
      // mobile: plain forward render, no post chain
      this.composer = { render: () => r.render(scene, this.camera), setSize: () => {} };
      this.bloom = { setSize: () => {} };
    }

    this.hud = new Hud(this.course);
    this.audio = new GameAudio();
    this.applyAtmosphere(this.spaceMode);
    this.aimView = 'behind'; this.planPower = 1; this.spinSel = { x: 0, y: 0 };
    this.store = new ProfileStore(); this.menus = new Menus(this); this.profile = null;
    this.hud.bindControls({
      shop: () => this.openShop(),
      spin: () => this.openSpin(),
      swing: () => { this.audio.ensure(); this.action(); },
      view: () => this.cycleView(),
      cam: () => this.toggleCam(),
      zoom: () => { const next = ZOOM_STEPS.find((z) => z > this.aimZoom + 0.05); this.setAimZoom(next || 1); },
      prev: () => this.changeClub(-1),
      next: () => this.changeClub(1),
      target: (p) => { this.planPower = clamp(p, 0.08, 1); this.previewDirty = true; },
    });
    this.hud.setHole(this.course);
    this.setupInput();
    this.newHole();
    window.addEventListener('resize', () => this.resize());
    this.showTitle();
    this.clock.start();
    this.loop();
  }

  frame() { return new Promise((res) => setTimeout(res, 30)); }

  /** Generate hole `n` and (re)build every scene object that belongs to it. */
  async buildHoleScene(n, progress = () => {}) {
    const scene = this.scene;
    if (this.holeGroup) {
      const shared = new Set(Object.values(this.tex));
      this.holeGroup.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.geometry) o.geometry.dispose(); if (o.material) { for (const m of Array.isArray(o.material) ? o.material : [o.material]) { if (m.map && !shared.has(m.map)) m.map.dispose(); m.dispose(); } if (o.customDepthMaterial) o.customDepthMaterial.dispose(); } });
      scene.remove(this.holeGroup);
      if (this.terrain) { this.terrain.maskTex.dispose(); this.terrain.zoneTex.dispose(); if (this.terrain.uniforms.tAO.value) this.terrain.uniforms.tAO.value.dispose(); }
    }
    progress('SHAPING THE LAND…'); await this.frame();
    this.holeIndex = n;
    this.course = new Course(holeFor(this.courseIndex, n));
    const space = !!this.L.space;
    if (this.sun && (space !== this.spaceMode || (space ? 'space' : this.conditions) !== this.appliedConditions)) { this.spaceMode = space; this.applyAtmosphere(space); }
    this.spaceMode = space;
    const g = this.holeGroup = new THREE.Group(); scene.add(g);
    progress(space ? 'RAISING THE ISLANDS…' : 'LAYING THE TURF…'); await this.frame();
    this.furniture = buildFurniture(this.course, { space, birds: !(CONDITIONS[this.conditions] || {}).rain }); g.add(this.furniture); // first: it marks ground the fescue and trees must leave clear
    const terr = buildTerrain(this.course, this.tex, this.sunDir, { lite: this.isMobile, space }); this.terrain = terr; g.add(terr.mesh);
    this.water = buildWater(this.course, this.tex, this.envMap); if (this.water) g.add(this.water);
    this.asteroids = null;
    if (space) { this.asteroids = buildAsteroids(this.course, n); g.add(this.asteroids); } else g.add(buildFarHills(this.course));
    this.holeObj = buildHole(this.course, this.tex); g.add(this.holeObj);
    if (space) { this.trees = new TreeField(); }
    else {
      progress('PLANTING TREES…'); await this.frame();
      const veg = buildVegetation(this.course, this.tex, this.quality.veg); g.add(veg.group); this.trees = veg.field;
      if (veg.ao) terr.uniforms.tAO.value = veg.ao;
    }
    if (this.ball) { this.ball.course = this.course; this.ball.trees = this.trees; this.ball.hole = this.course.layout.pin; }
    if (this.hud) this.hud.setHole(this.course);
    if (this.greenRead) this.greenRead.hide();
    if (this.grass) this.grass.mesh.visible = false; // laid out again when the first shot is lined up
  }

  get L() { return this.course.layout; }

  /** Ground height for cameras and markers: never below the water or void level. */
  groundY(x, z) { return Math.max(this.course.heightAt(x, z), this.course.waterLevel); }

  /** Day on the parkland courses, deep space on Starfall: sky, fog, fill light and clouds. */
  applyAtmosphere(space) {
    const c = CONDITIONS[this.conditions] || CONDITIONS.morning;
    this.envMap = space ? this.skyCtl.setSpace(true) : this.skyCtl.setConditions(c);
    this.scene.fog.color.set(space ? 0x000000 : HORIZON);
    this.scene.fog.density = space ? 0.0011 : c.fog;
    this.hemi.color.set(space ? 0x2c3d6b : c.sky); this.hemi.groundColor.set(space ? 0x06070b : c.ground); this.hemi.intensity = space ? 0.6 : c.hemiI;
    this.sun.color.set(space ? 0xfff6ea : c.sun); this.sun.intensity = space ? 3.4 : c.sunI;
    this.renderer.toneMappingExposure = space ? 1.12 : c.exposure;
    if (this.clouds) { this.clouds.visible = !space && c.clouds > 0; this.clouds.children[0].material.opacity = c.clouds; }
    this.rain.visible = !space && !!c.rain; this.audio.setRain(!space && !!c.rain);
    this.appliedConditions = space ? 'space' : this.conditions;
  }
  /** Choose the time of day / weather for the round (a CONDITIONS key); remembered between visits. */
  setConditions(key) {
    if (!CONDITIONS[key]) return;
    this.conditions = key; try { localStorage.setItem('riverbend-conditions', key); } catch (e) { /* private mode */ }
  }

  /** Everything the profile's upgrades and the chosen spin change about a shot. */
  mods() {
    const u = (this.profile && this.profile.upgrades) || {};
    const f = u.forgive || 0, pt = u.putting || 0;
    return {
      woodSpeed: 1 + 0.10 * (u.power || 0), ironSpeed: 1 + 0.10 * (u.irons || 0),
      sideMul: 1 - 0.1 * f, accScale: 1 / (1 + 0.2 * f),
      captureBonus: 0.15 * pt, puttErr: 1 - 0.1 * pt,
      spinPower: 0.4 + 0.12 * (u.spin || 0), spin: this.spinSel,
    };
  }
  openShop() {
    if (!this.profile || (this.state !== 'aim' && this.state !== 'holed')) return;
    this.menus.shop(this.store, this.profile, () => { this.hud.setCoins(this.profile.coins); if (this.state === 'aim') { this.solvePlan(); this.previewDirty = true; this.updateLieHud(); } });
  }
  openSpin() {
    if (this.state !== 'aim' || this.club.putter) return;
    this.menus.spinPad(this.spinSel, () => { this.previewDirty = true; this.hud.setSpinLabel(shortSpin(this.spinSel)); });
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h); this.composer.setSize(w, h);
  }

  // ---------- setup / flow ----------
  newHole() {
    this.strokes = 1; this.penalties = 0; this.endShown = false;
    this.ball.place(this.L.tee.x, this.L.tee.z);
    this.teed = true; this.peg.visible = true; this.peg.rotation.set(0, 0, 0); this.pegFly = null; this.hud.banner(''); this.hud.setFlight(null);
    this.trail.visible = false; this.blob.visible = false; this.trailPts.length = 0;
    this.aimView = 'behind'; this.previewEnd = null; this.previewPath = null; this.landingCam = null; this.puttCam = null;
    this.spinSel.x = 0; this.spinSel.y = 0; this.hud.setSpinLabel('SPIN'); this.aimZoom = 1; this.hud.setZoomLabel(1);
    this.holeLock = false; this.lockShot = null; this.hud.setLock(false);
    this.hud.setCamTag('');
    this.lastPos = { x: this.ball.pos.x, z: this.ball.pos.z };
    const wa = this.rnd() * Math.PI * 2, ws = 0.8 + this.rnd() * 4.5;
    this.windBase = { x: Math.cos(wa) * ws, z: Math.sin(wa) * ws, speed: ws, angle: wa }; this.audio.setWind(ws);
    this.aimYaw = this.defaultAimYaw();
    this.autoClub(); this.solvePlan();
    this.camMode = 'pov';
    this.syncBallMesh();
    this.hud.setStroke(1); this.updateLieHud(); this.updateRoundHud();
  }

  /** Round score to par over the holes finished so far, shown in the hole card. */
  updateRoundHud() {
    const played = this.scores.filter(Boolean);
    this.hud.setRound(played.reduce((a, s) => a + s.strokes - s.par, 0), played.length);
  }

  showTitle() {
    this.state = 'title';
    this.overlay.classList.remove('hidden');
    this.hud.setSwingLabel(''); this.hud.setAimControls(false);
    this.menus.profilePicker(this.panel, this.store, (p) => {
      this.profile = this.store.select(p.name);
      this.hud.setCoins(this.profile.coins);
      this.menus.coursePicker(this.panel, COURSES.map((c, i) => ({ ...c, yards: courseYards(i) })), this.profile, (idx) => {
        this.hud.message(`Welcome, ${this.profile.name}`, 2500, 'good');
        this.audio.ensure();
        if (idx === this.courseIndex && this.holeIndex === 0 && this.scores.length === 0 && this.appliedConditions === (this.spaceMode ? 'space' : this.conditions)) this.startPlay();
        else { this.courseIndex = idx; this.scores = []; this.goToHole(0); }
      }, this.store); // the store lets the picker rank every saved player per course
    });
  }

  holeBlurb(L) {
    if (L.blurb) return `Hole ${L.number}${L.name ? ' · ' + L.name : ''} · Par ${L.par} · ${L.yards} yds. ${L.blurb}`;
    if (L.space) {
      const k = L.space.islands.length;
      const isl = k === 0 ? 'Nothing between the tee and the green but void' : k === 1 ? 'One island to carry to, then the green' : `${k} islands to pick a route through`;
      return `Hole ${L.number} · ${L.name} · Par ${L.par} · ${L.yards} yds. ${isl}${L.bunkers.length ? `, ${L.bunkers.length} crater${L.bunkers.length === 1 ? '' : 's'}` : ''}. Miss an island and the ball is gone.`;
    }
    const bend = L.bendAngle === 0 ? '' : Math.abs(L.bendAngle) < 0.15 ? 'A gentle ' + (L.bendAngle > 0 ? 'left' : 'right') + ' turn' : 'Dogleg ' + (L.bendAngle > 0 ? 'left' : 'right');
    const water = L.pond ? (L.par === 3 ? 'water beside the green' : 'water ' + (L.bendAngle > 0 ? 'right' : 'left') + ' of the fairway') : 'no water';
    const w2 = L.carry ? 'a carry over water' : water;
    return `Hole ${L.number}${L.name ? ' · ' + L.name : ''} · Par ${L.par} · ${L.yards} yds. ${bend ? bend + ', ' : L.par === 3 ? 'A one-shotter, ' : ''}${w2}, ${L.bunkers.length} bunker${L.bunkers.length === 1 ? '' : 's'}.`;
  }

  startPlay() {
    this.audio.ensure();
    this.overlay.classList.add('hidden');
    this.beginFlyover();
  }

  beginFlyover() {
    this.state = 'flyover'; this.flyT = 0;
    const L = this.L, sp = L.spline, n = sp.length, pin = new THREE.Vector3(L.pin.x, this.groundY(L.pin.x, L.pin.z), L.pin.z);
    const de = new THREE.Vector3(sp[n - 1][0] - sp[n - 3][0], 0, sp[n - 1][1] - sp[n - 3][1]).normalize();
    const m1 = sp[Math.round((n - 1) * 0.55)], m2 = sp[Math.round((n - 1) * 0.25)];
    const mid = new THREE.Vector3(m1[0], Math.max(this.groundY(m1[0], m1[1]), 0), m1[1]);
    const mid2 = new THREE.Vector3(m2[0], Math.max(this.groundY(m2[0], m2[1]), 0), m2[1]);
    const aim = this.aimPose();
    const A = pin.clone().addScaledVector(de, 55).add(new THREE.Vector3(0, 34, 0));
    const B = mid.clone().add(new THREE.Vector3(-45, 42, 0));
    const C = mid2.clone().add(new THREE.Vector3(-25, 26, -20));
    this.flyPath = new THREE.CatmullRomCurve3([A, B, C, aim.pos.clone().add(new THREE.Vector3(0, 6, -8)), aim.pos.clone()], false, 'centripetal');
    const tee = new THREE.Vector3(L.tee.x, this.groundY(L.tee.x, L.tee.z), L.tee.z);
    this.flyLook = new THREE.CatmullRomCurve3([pin.clone(), pin.clone(), mid.clone(), mid2.clone().add(new THREE.Vector3(0, 0, -20)), tee.clone().add(new THREE.Vector3(0, 0, 40)), aim.look.clone()], false, 'centripetal');
    this.flyDur = L.par === 3 ? 6 : 8;
    this.hud.message(`Hole ${L.number}${L.name ? ' · ' + L.name : ''} · Par ${L.par} · ${L.yards} yds`, 3500, 'good');
    this.hud.setHint('<b>SPACE</b> skip');
    this.hud.setCamTag('COURSE FLYOVER'); this.hud.setSwingLabel('SKIP'); this.hud.setAimControls(false);
  }

  aimBaseFov() { return this.club.putter ? 70 : 62; }
  /** Zoom only applies in the landing view; everywhere else the aim camera is at its normal width. */
  zoomActive() { return this.state === 'aim' && this.aimView === 'landing' && !this.club.putter; }
  effectiveZoom() { return this.zoomActive() ? this.aimZoom : 1; }
  applyAimFov() {
    this.camera.fov = this.aimBaseFov() / this.effectiveZoom(); this.camera.updateProjectionMatrix();
    this.hud.setZoomVisible(this.zoomActive());
    this.hud.setAimTick(this.state === 'aim' && !this.club.putter && this.aimView !== 'landing');
  }
  /** Zoom the landing view in or out (1× to ZOOM_MAX). Kept between shots, reset on a new hole. */
  setAimZoom(z) {
    if (!this.zoomActive()) return;
    this.aimZoom = clamp(z, 1, ZOOM_MAX);
    this.hud.setZoomLabel(this.aimZoom);
    this.applyAimFov();
  }

  enterAim() {
    this.state = 'aim';
    this.grass.place(this.course, this.ball.pos.x, this.ball.pos.z);
    this.golfer.group.visible = false;
    this.applyAimFov();
    if (this.club.putter) this.placePutterRig();
    this.hud.showMeter(false); this.hud.showAccuracy(false);
    this.hud.setCamTag('');
    this.updateLieHud();
    this.previewDirty = true;
    this.setAimHint();
    this.hud.setSwingLabel(this.club.putter ? 'PUTT' : 'ADDRESS'); this.hud.setAimControls(true);
  }

  /** Keyboard hints for the aim view in use; the green-reading dots come and go with the putter. */
  setAimHint() {
    if (this.club.putter && this.state === 'aim') this.greenRead.build(this.course, this.ball.pos, this.L.pin); else this.greenRead.hide();
    if (this.club.putter) this.hud.setHint('<b>DRAG</b> back for pace, sideways for line <b>W / S</b> fine pace <b>SPACE</b> putt');
    else this.hud.setHint(this.aimView === 'landing' ? '<b>DRAG</b> aim <b>WHEEL</b> zoom <b>V</b> view <b>Q / E</b> club <b>W / S</b> power <b>SPACE</b> address' : '<b>DRAG</b> aim <b>V</b> view <b>Q / E</b> club <b>W / S</b> power <b>B</b> spin <b>SPACE</b> address');
  }

  /** Putting aim shows the arms and putter behind the ball, following the line as it is aimed. */
  placePutterRig() {
    const bp = new THREE.Vector3(this.ball.pos.x, this.ball.pos.y, this.ball.pos.z);
    this.golfer.setup(bp, this.aimDir(), this.club);
    this.golfer.setBodyVisible(false);
    this.golfer.group.visible = true;
  }

  /** PUTT pressed: go straight to the accuracy bar with the pace and line set while aiming. */
  commitPutt() {
    if (this.state !== 'aim' || !this.club.putter) return;
    this.placePutterRig();
    this.previewLine.visible = this.previewEdge.visible = false; this.landRing.visible = false;
    this.hud.setAimControls(false); this.hud.setCamTag('');
    const to = this.addressCamPose({ pos: new THREE.Vector3(), look: new THREE.Vector3() });
    this.camera.position.copy(to.pos); this.lookDir.subVectors(to.look, to.pos).normalize(); this.setLook();
    this.armSwing(true);
  }

  cycleView() {
    if (this.state !== 'aim') return;
    const order = ['behind', 'high', 'landing'];
    this.aimView = order[(order.indexOf(this.aimView) + 1) % order.length];
    this.hud.setCamTag(this.aimView === 'behind' ? '' : this.aimView === 'high' ? 'OVERHEAD VIEW' : 'LANDING VIEW');
    this.applyAimFov(); this.setAimHint();
    this.audio.click();
  }
  toggleCam() { this.camMode = this.camMode === 'pov' ? 'chase' : 'pov'; this.hud.message(this.camMode === 'pov' ? 'First-person camera' : 'Ball camera', 1200); }

  enterAddress() {
    if (this.club.putter) { this.commitPutt(); return; }
    const dir = this.aimDir();
    const bp = new THREE.Vector3(this.ball.pos.x, this.ball.pos.y, this.ball.pos.z);
    this.golfer.setup(bp, dir, this.club);
    this.golfer.group.visible = true;
    this.golfer.setBodyVisible(!this.club.putter);
    this.state = 'toAddress'; this.transT = 0; this.fovFrom = this.camera.fov;
    this.transFrom = { pos: this.camera.position.clone(), look: this.lookDir.clone() };
    this.hud.setHint('<b>ESC</b> back to aim');
    this.hud.setSwingLabel(''); this.hud.setAimControls(false); this.hud.setCamTag('');
  }

  armSwing(quick = false) {
    this.state = 'address';
    this.swing = { phase: 'ready', t: 0, power: 0, acc: null, launched: false, impactT: 0, quick };
    if (quick) { this.hud.showMeter(true); this.swingPress(); return; }
    this.hud.showMeter(true);
    this.hud.meter({ label: 'POWER', fill: 0, marker: null, set: this.planPower < 1 ? this.planPower : null });
    this.hud.setHint('<b>SPACE</b> start swing <b>ESC</b> back');
    this.hud.setSwingLabel('SWING');
  }

  // ---------- helpers ----------
  aimDir() { return new THREE.Vector3(Math.sin(this.aimYaw), 0, Math.cos(this.aimYaw)); }
  defaultAimYaw() {
    const b = this.ball.pos, pin = this.L.pin;
    const dPin = Math.hypot(pin.x - b.x, pin.z - b.z);
    let tx = pin.x, tz = pin.z;
    if (dPin > 215) {
      // aim down the fairway ~200m ahead along the centre line
      const { t } = splineDist(this.L, b.x, b.z);
      const p = splinePoint(this.L, t * splineLength(this.L) + 205);
      tx = p.x; tz = p.z;
    }
    return Math.atan2(tx - b.x, tz - b.z);
  }
  lieId() { return this.course.surfaceAt(this.ball.pos.x, this.ball.pos.z).id; }
  distToPin() { return Math.hypot(this.L.pin.x - this.ball.pos.x, this.L.pin.z - this.ball.pos.z); }
  autoClub() {
    const lie = this.lieId(), d = this.distToPin();
    if (lie === SURF.GREEN) { this.clubIndex = CLUBS.length - 1; return; }
    if (lie === SURF.SAND && d < 110) { this.clubIndex = CLUBS.findIndex((c) => c.sand); return; }
    let best = 0, bestErr = Infinity;
    for (let i = 0; i < CLUBS.length - 1; i++) {
      const c = CLUBS[i];
      if (lie === SURF.SAND && c.wood) continue;
      const carry = this.carryEstimate(c);
      const err = carry >= d - 3 ? carry - d : (d - carry) * 3;
      if (err < bestErr) { bestErr = err; best = i; }
    }
    this.clubIndex = best;
  }
  /** Pick a target power so the predicted shot finishes at the pin (bisection over the real simulation). */
  solvePlan() {
    const dir = this.aimDir(), lie = this.lieId();
    const from = { x: this.ball.pos.x, y: this.ball.pos.y, z: this.ball.pos.z };
    const want = this.distToPin() + (this.club.putter ? 0.4 : 0);
    let wet = false;
    const endDist = (pw) => {
      const r = simulateShot(this.course, from, { x: dir.x, z: dir.z }, shotParams(this.club, pw, 0, lie, this.mods()), { wind: this.windBase, trees: this.trees, maxT: 30 });
      wet = r.mode === 'water';
      return Math.hypot(r.end.x - from.x, r.end.z - from.z);
    };
    const pick = () => {
      if (endDist(1) <= want) return 1;
      let lo = this.club.putter ? 0.08 : 0.3, hi = 1;
      if (endDist(lo) >= want) return lo;
      for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; if (endDist(mid) < want) lo = mid; else hi = mid; }
      return Math.round(((lo + hi) / 2) * 100) / 100;
    };
    let pw = pick();
    // if that finishes in the water, lay up: back the power off until the ball stays dry
    if (!this.club.putter) { endDist(pw); if (wet) for (let p = pw - 0.03; p >= 0.3; p -= 0.03) { endDist(p); if (!wet) { pw = Math.round(p * 100) / 100; break; } } }
    this.planPower = pw;
  }
  carryEstimate(c) {
    const base = { DR: 210, '3W': 197, '4H': 180, '5I': 170, '7I': 152, '9I': 128, PW: 112, SW: 81, PT: 0 }[c.id];
    const m = this.mods(); const k = c.putter ? 1 : c.wood ? m.woodSpeed : m.ironSpeed;
    return base * Math.pow(k, 1.5);
  }
  get club() { return CLUBS[this.clubIndex]; }
  changeClub(delta) {
    if (this.state !== 'aim') return;
    this.clubIndex = (this.clubIndex + delta + CLUBS.length) % CLUBS.length;
    this.solvePlan(); this.setAimHint();
    this.previewDirty = true; this.audio.click();
  }
  updateLieHud() {
    const lie = this.lieId();
    this.hud.setLie(`Lie · ${SURF_NAME[lie]}`);
    this.hud.setToPin(this.distToPin());
    this.hud.setClub(this.club, this.carryEstimate(this.club));
    this.hud.setStroke(this.strokes);
  }
  wind(t) {
    const g = 1 + 0.22 * Math.sin(t * 0.31) + 0.12 * Math.sin(t * 0.93 + 1) + 0.06 * Math.sin(t * 2.1);
    return { x: this.windBase.x * g, z: this.windBase.z * g, speed: this.windBase.speed * g };
  }
  /** Low camera behind the ball looking down the putt line (used for putting aim and address). */
  puttPose(ballV, dir) {
    const right = new THREE.Vector3().crossVectors(dir, UP);
    const pos = ballV.clone().addScaledVector(dir, -1.7).addScaledVector(right, 0.15);
    pos.y = Math.max(ballV.y + 1.2, this.course.heightAt(pos.x, pos.z) + 1.0);
    const look = ballV.clone().addScaledVector(dir, 4.5); look.y = this.course.heightAt(look.x, look.z) + 0.05;
    return { pos, look };
  }
  aimPose() {
    const dir = this.aimDir();
    const b = this.ball.pos;
    if (this.club.putter) return this.puttPose(new THREE.Vector3(b.x, b.y, b.z), dir);
    const right = new THREE.Vector3().crossVectors(dir, UP);
    // The camera stands a little to the right of the line but looks PARALLEL to it (the look point
    // carries the same sideways offset), so the aim line converges on the centre of the screen and a
    // target lined up with the centre tick is exactly where the shot is aimed.
    if (this.aimView === 'high') {
      const pos = new THREE.Vector3(b.x, 0, b.z).addScaledVector(dir, -14).addScaledVector(right, 2);
      pos.y = Math.max(b.y + 11, this.course.heightAt(pos.x, pos.z) + 6);
      const look = new THREE.Vector3(b.x, b.y, b.z).addScaledVector(dir, 55).addScaledVector(right, 2);
      return { pos, look };
    }
    if (this.aimView === 'landing' && this.previewEnd) {
      const e = this.previewEnd; const ey = this.groundY(e.x, e.z);
      const dist = Math.hypot(e.x - b.x, e.z - b.z);
      const back = clamp(dist * 0.35, 6, 26), up = clamp(dist * 0.3, 5, 24);
      const pos = new THREE.Vector3(e.x, 0, e.z).addScaledVector(dir, -back).addScaledVector(right, back * 0.35);
      pos.y = Math.max(ey + up, this.groundY(pos.x, pos.z) + 2.5);
      const look = new THREE.Vector3(e.x, ey, e.z).addScaledVector(dir, 3);
      return { pos, look };
    }
    const pos = new THREE.Vector3(b.x, 0, b.z).addScaledVector(dir, -2.7).addScaledVector(right, 0.5);
    pos.y = Math.max(b.y + 1.5, this.course.heightAt(pos.x, pos.z) + 1.55);
    const look = new THREE.Vector3(b.x, b.y, b.z).addScaledVector(dir, 28).addScaledVector(right, 0.5).add(new THREE.Vector3(0, 0.6, 0));
    return { pos, look };
  }
  syncBallMesh() {
    const p = this.ball.pos, t = this.L.tee;
    if (this.teed && Math.hypot(p.x - t.x, p.z - t.z) > 0.5) { this.teed = false; this.peg.visible = false; } // moved off the tee by hand
    this.ballMesh.position.set(p.x, p.y + (this.teed ? TEE_H : 0), p.z);
    if (this.teed) this.peg.position.set(p.x, p.y - BALL_R + TEE_H, p.z);
  }

  updatePreview() {
    const dir = this.aimDir();
    const lie = this.lieId();
    const params = shotParams(this.club, this.planPower, 0, lie, this.mods());
    const from = { x: this.ball.pos.x, y: this.ball.pos.y, z: this.ball.pos.z };
    const res = simulateShot(this.course, from, { x: dir.x, z: dir.z }, params, { wind: this.windBase, trees: this.trees, hole: this.L.pin, maxT: 30 });
    const pts = res.path; const n = Math.min(pts.length, 900);
    writeFatLine(this.previewLine.geometry, n, (i, o) => { const p = pts[i]; o[0] = p.x; o[1] = Math.max(p.y, this.course.heightAt(p.x, p.z)) + 0.06; o[2] = p.z; });
    const e = res.end; this.landRing.position.set(e.x, this.groundY(e.x, e.z) + 0.05, e.z);
    const scale = this.club.putter ? 0.25 : 1; this.landRing.scale.set(scale, scale, 1);
    if (this.club.putter) {
      this.previewLine.visible = this.previewEdge.visible = false;
      this.buildRibbon(pts);
      const holed = res.mode === 'holed';
      this.ribbonMat.uniforms.uColor.value.set(holed ? 0x7dff4a : 0xffffff);
      this.puttRibbon.visible = true; this.landRing.visible = !holed;
      this.puttHoled = holed;
    } else { this.previewLine.visible = this.previewEdge.visible = true; this.puttRibbon.visible = false; this.landRing.visible = true; }
    this.previewPath = pts; this.previewEnd = e;
    const carry = Math.hypot(e.x - from.x, e.z - from.z);
    this.hud.setTarget(this.planPower, carry, this.club.putter);
    this.previewDirty = false;
  }

  /** Lay a flat ribbon along the path points, 9cm wide, hugging the ground. */
  buildRibbon(pts) {
    const g = this.puttRibbon.geometry, P = g.attributes.position.array, U = g.attributes.uv.array;
    const n = Math.min(pts.length, 900); let dist = 0;
    for (let i = 0; i < n; i++) {
      const p = pts[i], q = pts[Math.min(n - 1, i + 1)], o = pts[Math.max(0, i - 1)];
      let dx = q.x - o.x, dz = q.z - o.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      if (i > 0) dist += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z);
      const rx = -dz * 0.045, rz = dx * 0.045;
      const y = this.course.heightAt(p.x, p.z) + 0.02;
      P[(i * 2) * 3] = p.x + rx; P[(i * 2) * 3 + 1] = y; P[(i * 2) * 3 + 2] = p.z + rz;
      P[(i * 2 + 1) * 3] = p.x - rx; P[(i * 2 + 1) * 3 + 1] = y; P[(i * 2 + 1) * 3 + 2] = p.z - rz;
      U[(i * 2) * 2] = dist; U[(i * 2) * 2 + 1] = 0; U[(i * 2 + 1) * 2] = dist; U[(i * 2 + 1) * 2 + 1] = 1;
    }
    g.setDrawRange(0, Math.max(0, (n - 1) * 6)); g.attributes.position.needsUpdate = true; g.attributes.uv.needsUpdate = true;
  }

  // ---------- input ----------
  setupInput() {
    let dragging = false, lx = 0, drag = null;
    // every finger currently on the canvas; two of them make a pinch that zooms the aim view
    const pointers = new Map(); let pinch = null;
    const pinchDist = () => { const [a, b] = [...pointers.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.state === 'title' || (this.menus && this.menus.open)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try { this.canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
      if (pointers.size >= 2) { pinch = { d0: pinchDist(), z0: this.aimZoom }; dragging = false; drag = null; return; }
      dragging = true; lx = e.clientX;
      drag = { sx: e.clientX, sy: e.clientY, yaw: this.aimYaw, power: this.planPower, putt: this.state === 'aim' && this.club.putter };
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size >= 2) { this.setAimZoom(pinch.z0 * pinchDist() / Math.max(1, pinch.d0)); return; }
      if (!dragging || this.state !== 'aim') return;
      const dx = e.clientX - lx; lx = e.clientX;
      const fine = 1 / this.effectiveZoom(); // zoomed in (landing view), the same finger travel turns the aim less
      if (drag && drag.putt) {
        // pull back for pace, slide sideways for the line; each drag adjusts from where the last one left off
        const pull = e.clientY - drag.sy, side = e.clientX - drag.sx;
        this.planPower = clamp(drag.power + pull / (window.innerHeight * 0.45), 0.08, 1);
        this.aimYaw = drag.yaw - side * (this.isMobile ? 0.0022 : 0.0016) * fine;
        this.previewDirty = true; this.placePutterRig();
      } else { this.aimYaw -= dx * 0.0032 * fine; this.previewDirty = true; }
    });
    // Lifting the finger keeps the pace and line; the PUTT button (or Space) commits the putt.
    const release = (e) => {
      pointers.delete(e.pointerId);
      if (pinch) { if (pointers.size < 2) pinch = null; return; } // the finger left after a pinch does not aim
      dragging = false; drag = null; if (this.state === 'aim' && this.previewDirty) this.updatePreview();
    };
    this.canvas.addEventListener('pointerup', release);
    this.canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); pinch = null; dragging = false; drag = null; });
    window.addEventListener('blur', () => { this.keys = {}; dragging = false; pointers.clear(); pinch = null; });
    // wheel zooms the landing view; elsewhere (or with shift) it changes club as before
    let wheelAcc = 0;
    this.canvas.addEventListener('wheel', (e) => {
      if (this.zoomActive() && !e.shiftKey) { this.setAimZoom(this.aimZoom * Math.exp(-e.deltaY * 0.0022)); return; }
      wheelAcc += e.deltaY; if (Math.abs(wheelAcc) >= 60) { this.changeClub(wheelAcc > 0 ? 1 : -1); wheelAcc = 0; }
    }, { passive: true });
    window.addEventListener('keydown', (e) => {
      if (this.menus && this.menus.open) { if (e.code === 'Escape') this.menus.close(); return; }
      if (e.repeat) { this.keys[e.code] = true; return; }
      this.keys[e.code] = true;
      switch (e.code) {
        case 'KeyB': this.openSpin(); break;
        case 'KeyU': this.openShop(); break;
        case 'Space': case 'Enter': e.preventDefault(); this.action(); break;
        case 'KeyQ': case 'ArrowUp': this.changeClub(-1); break;
        case 'KeyE': case 'ArrowDown': this.changeClub(1); break;
        case 'KeyC': this.toggleCam(); break;
        case 'KeyV': this.cycleView(); break;
        case 'KeyZ': this.setAimZoom(this.aimZoom * 1.25); break;
        case 'KeyX': this.setAimZoom(this.aimZoom / 1.25); break;
        case 'KeyW': if (this.state === 'aim') { this.planPower = clamp(this.planPower + 0.05, 0.08, 1); this.previewDirty = true; } break;
        case 'KeyS': if (this.state === 'aim') { this.planPower = clamp(this.planPower - 0.05, 0.08, 1); this.previewDirty = true; } break;
        case 'KeyR': this.restart(); break;
        case 'Escape': if (this.state === 'toAddress' || this.state === 'address') this.enterAim(); break;
        case 'KeyM': if (this.audio.master) { this.audio.master.gain.value = this.audio.master.gain.value > 0 ? 0 : 0.8; } break;
      }
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    this.canvas.addEventListener('click', () => { if (this.state === 'flyover') this.enterAim(); });
  }

  action() {
    if (this.menus && this.menus.open) return;
    switch (this.state) {
      case 'title': this.startPlay(); break;
      case 'flyover': this.enterAim(); break;
      case 'aim': this.enterAddress(); break;
      case 'toAddress': break;
      case 'address': this.swingPress(); break;
      case 'swing': this.swingPress(); break;
      case 'holed': { const b = document.getElementById('nextBtn'); if (this.endShown && b) b.click(); break; }
    }
  }

  /** Codes the pro shop passes on when the player store does not know them. Returns {msg, close} or null. */
  redeemCode(code) {
    code = String(code).trim();
    if (code === '1111') {
      // lock on: the next shot struck flies (or rolls) straight into the cup, wherever it was aimed
      if (this.state !== 'aim') return { msg: 'Redeem this while aiming a shot.' };
      this.holeLock = true; this.hud.setLock(true);
      this.hud.message('Locked on to the hole · your next shot goes in', 2600, 'good');
      return { msg: 'Locked on.', close: true };
    }
    if (code !== '2430') return null;
    if (this.state !== 'aim' && this.state !== 'holed') return { msg: 'Finish the shot first, then redeem.' };
    this.redoHole();
    return { msg: 'Hole restarted.', close: true };
  }
  /** Play the current hole again from the tee; the rest of the round's card is kept. */
  redoHole() {
    if (this.state === 'holed') {
      this.scores[this.holeIndex] = undefined; // this hole's score comes off the card
      if (this.profile && this.holeCoins) { this.profile.coins -= this.holeCoins; this.profile.totalCoins -= this.holeCoins; this.profile.holes -= 1; this.store.save(); this.hud.setCoins(this.profile.coins); this.holeCoins = 0; }
    }
    this.restart();
    this.hud.message('Hole restarted · round score kept', 2200);
  }

  restart() {
    if (this.state === 'loading' || this.state === 'title') return;
    this.overlay.classList.add('hidden');
    this.newHole(); this.hud.message('New ball on the tee', 1500);
    this.enterAim();
    const p = this.aimPose(); this.camera.position.copy(p.pos); this.lookDir.subVectors(p.look, p.pos).normalize();
  }

  swingPress() {
    const s = this.swing;
    if (s.phase === 'ready') {
      s.phase = 'back'; s.t = 0; this.state = 'swing';
      this.golfer.beginBackswing();
      if (s.quick) { // putting: power was set by the pull-back, go straight to the accuracy bar
        s.power = this.planPower; this.golfer.setBackswing(s.power);
        this.hud.meter({ label: 'POWER', fill: s.power, marker: null, set: null, pct: s.power });
        this.startAccuracy(); return;
      }
      this.hud.meter({ label: 'POWER', fill: 0, marker: null, set: this.planPower < 1 ? this.planPower : null });
      this.hud.setHint('<b>SPACE</b> set power'); this.hud.setSwingLabel('POWER');
    } else if (s.phase === 'back') {
      s.power = clamp(s.t / this.meterTime(), 0.03, 1);
      this.startAccuracy();
    } else if (s.phase === 'acc') {
      this.strike();
    }
  }

  meterTime() { return this.club.putter ? T_METER_PUTT : T_METER; }
  accTime() { return this.club.putter ? T_ACC_PUTT : T_ACC; }

  /** Club pauses at the top; the accuracy marker ping-pongs for as long as it takes the player to strike. */
  startAccuracy() {
    const s = this.swing;
    s.phase = 'acc'; s.t = 0; s.pos = 0; s.dir = 1; s.sweeps = 0;
    this.golfer.holdTop();
    this.hud.meter({ label: 'POWER', fill: s.power, marker: null, set: null, pct: s.power });
    this.hud.showAccuracy(true); this.hud.accuracy({ pos: 0, hit: null });
    this.hud.setHint('<b>SPACE</b> strike when the marker is in the gold'); this.hud.setSwingLabel('STRIKE');
  }

  strike() {
    const s = this.swing;
    if (s.phase !== 'acc') return;
    s.acc = (s.pos - 0.5) * 2; // -1 left .. +1 right of centre
    this.hud.accuracy({ pos: s.pos, hit: s.pos });
    const band = accBand(s.acc).name, right = s.acc > 0;
    this.hud.callout(band === 'gold' ? 'Perfect!' : band === 'green' ? 'Good' : this.club.putter ? (right ? 'Pushed' : 'Pulled') : band === 'amber' ? (right ? 'Pushed' : 'Pulled') : (right ? 'Slice!' : 'Hook!'), band);
    s.phase = 'down'; s.t = 0;
    this.golfer.beginDownswing(this.club.putter ? T_DOWN_PUTT : T_DOWN, () => this.impact());
    if (!this.club.putter) this.audio.whoosh(s.power, T_DOWN);
    this.hud.setSwingLabel('');
  }

  /**
   * Miss size from where the marker was stopped, -1..1. Gold is flush; green is a whisper off line;
   * amber is a visible push or pull with some curve; red is a proper hook or slice. Forgiveness
   * upgrades soften it; putts are gentler.
   */
  accuracyValue() {
    const s = this.swing;
    if (s.acc == null) return 0;
    const a = Math.abs(s.acc), sign = Math.sign(s.acc);
    const B = ACC_BANDS;
    let m;
    if (a <= B.gold) m = 0;
    else if (a <= B.green) m = lerp(0.03, 0.15, (a - B.gold) / (B.green - B.gold));
    else if (a <= B.amber) m = lerp(0.15, 0.5, (a - B.green) / (B.amber - B.green));
    else m = lerp(0.5, 1.0, (a - B.amber) / (1 - B.amber));
    return clamp(sign * m * this.mods().accScale, -1, 1) * (this.club.putter ? 0.6 : 1);
  }

  impact() {
    const s = this.swing;
    if (s.launched) return;
    s.launched = true; s.impactT = s.t;
    const acc = this.accuracyValue();
    const lie = this.lieId(), wasTeedSound = this.teed;
    const params = shotParams(this.club, s.power, acc, lie, this.mods());
    this.ball.captureBonus = this.mods().captureBonus;
    // a little natural dispersion on imperfect strikes only: a gold strike flies exactly the previewed line
    const jitter = (this.rnd() - 0.5) * (this.club.putter ? 0.4 : 1.2) * Math.min(1, Math.abs(acc) / 0.15);
    const yaw = this.aimYaw - (params.dirErr + jitter) * Math.PI / 180; // + = right of the line
    const dir = { x: Math.sin(yaw), z: Math.cos(yaw) };
    // the ball flies in the same steady wind the aim preview was computed with (the gusts are only for the flag)
    this.ball.wind.x = this.windBase.x; this.ball.wind.z = this.windBase.z;
    this.ball.launch(dir, params.speed, params.loft, params.back, params.side, params.land || 0);
    this.shotLie = lie; this.shotClub = this.club; this.shotStart = { x: this.ball.pos.x, z: this.ball.pos.z }; this.shotAim = this.aimDir();
    // off the peg or through the turf: the ball leaves its tee, an iron takes a divot, a bunker shot throws sand
    const wasTeed = this.teed; this.teed = false;
    this.shake = { t: 0, dur: this.club.putter ? 0 : 0.28, amp: 0.012 + 0.03 * s.power * (this.club.wood ? 1 : 0.7) };
    this.firstLand = false; this.flightMax = 0;
    if (!this.club.putter) {
      const bp = this.ball.pos, fxp = { x: bp.x, y: bp.y - BALL_R, z: bp.z };
      this.fx.flash({ x: bp.x, y: bp.y + (wasTeed ? TEE_H : 0), z: bp.z }, dir, s.power);
      // a driver sends the peg cartwheeling
      if (wasTeed && this.club.wood) this.pegFly = { vx: dir.x * 2.2 + (this.rnd() - 0.5), vy: 2.6 + this.rnd(), vz: dir.z * 2.2 + (this.rnd() - 0.5), spin: 14 + this.rnd() * 10 };
      if (lie === SURF.SAND) this.fx.sand(fxp, dir, s.power);
      else if (!wasTeed || !this.club.wood) this.fx.turf(fxp, dir, s.power * (wasTeed ? 0.5 : 1));
    }
    this.greenRead.hide();
    this.lockShot = null;
    if (this.holeLock) {
      // code 1111: replace the physics with a guided path from here to the cup
      const b = this.ball.pos, pin = this.L.pin, dist = Math.hypot(pin.x - b.x, pin.z - b.z), putt = !!this.club.putter;
      this.lockShot = { t: 0, x0: b.x, y0: b.y, z0: b.z, putt, dur: putt ? clamp(dist / 2.5, 0.8, 3.5) : clamp(dist / 36, 1.4, 6.5), apex: putt ? 0 : clamp(dist * 0.2, 1.5, 45) };
      this.holeLock = false; this.hud.setLock(false);
    }
    this.audio.hit(s.power, this.club, lie === SURF.SAND ? 'sand' : lie === SURF.ROUGH ? 'rough' : wasTeedSound ? 'tee' : 'turf');
    this.state = 'flight'; this.flightT = 0; this.landingCam = null; this.trackFov = 62;
    // every full shot is followed on the ball cam; C flips back to the eyes mid-flight. Putts stay at eye level.
    // …after a beat at the golfer's eyes, so the follow-through is seen before the cut to the ball
    this.chaseAt = null; if (!this.club.putter) { this.camMode = 'pov'; this.chaseAt = 0.4; }
    this.previewLine.visible = this.previewEdge.visible = false; this.landRing.visible = false; this.puttRibbon.visible = false;
    this.hud.setSwingLabel('');
    this.hud.setHint(this.camMode === 'pov' ? '<b>C</b> ball camera' : '<b>C</b> first-person');
    this.hud.setCamTag('');
  }

  // ---------- per-frame updates ----------
  update(dt) {
    this.time += dt;
    setWindTime(this.time);
    this.clouds.userData.update(dt);
    if (this.asteroids) this.asteroids.userData.update(dt);
    if (this.furniture) this.furniture.userData.update && this.furniture.userData.update(this.time);
    const w = this.wind(this.time); // gusting: drives the flag's flutter, not the ball
    // the flag streams downwind: its cloth runs along local +x, and rotation.y = r maps +x to (cos r, -sin r)
    this.holeObj.userData.update(this.time, Math.atan2(w.x, w.z) - Math.PI / 2);
    if (this.water) for (const m of this.water.children) { const sh = m.material.userData.shader; if (sh) sh.uniforms.tMask.value = this.terrain.maskTex; }
    this.tex.waterNormal.offset.set(this.time * 0.012, this.time * 0.007);
    this.ribbonMat.uniforms.uTime.value = this.time;
    this.fx.update(dt, this.camera, this.renderer.domElement.height);
    if (this.pegFly) this.updatePegFly(dt);
    this.greenRead.update(this.time, this.camera, this.renderer.domElement.height);
    if (this.rain.visible) { const u = this.rainMat.uniforms; u.uTime.value = this.time; u.uCam.value.copy(this.camera.position); u.uWind.value.set(this.windBase.x, this.windBase.z); }
    const aimDir = this.aimDir();
    // dial: wind relative to the aim line, + = blowing toward the player's right
    { const wb = this.windBase; const along = wb.x * aimDir.x + wb.z * aimDir.z, lateral = -wb.x * aimDir.z + wb.z * aimDir.x; this.hud.setWind(wb.speed, Math.atan2(lateral, along)); }

    switch (this.state) {
      case 'flyover': this.updateFlyover(dt); break;
      case 'aim': this.updateAim(dt); break;
      case 'toAddress': this.updateToAddress(dt); break;
      case 'address': this.updateAddressCam(dt); this.golfer.update(dt); break;
      case 'swing': this.updateSwing(dt); break;
      case 'flight': this.updateFlight(dt); break;
      case 'settle': this.updateSettle(dt); break;
      case 'walk': this.updateWalk(dt); break;
      case 'holed': this.updateHoled(dt); break;
    }
    // the strike jolts the view for a moment
    if (this.shake && this.shake.t < this.shake.dur) {
      const k = this.shake; k.t += dt; const a = k.amp * Math.pow(1 - Math.min(1, k.t / k.dur), 2);
      this.camera.position.x += (Math.random() - 0.5) * a; this.camera.position.y += (Math.random() - 0.5) * a; this.camera.position.z += (Math.random() - 0.5) * a;
    }
    this.updateSun();
    this.hud.drawMinimap(this.ball.pos, aimDir, this.state === 'aim' ? this.previewPath : null);
  }

  setLook() { const t = this.tmp.a.copy(this.camera.position).add(this.lookDir); this.camera.lookAt(t); }

  updateFlyover(dt) {
    this.flyT += dt; const u = Math.min(1, this.flyT / this.flyDur);
    const e = u * u * (3 - 2 * u);
    this.camera.position.copy(this.flyPath.getPointAt(e));
    const look = this.flyLook.getPointAt(e);
    this.lookDir.subVectors(look, this.camera.position).normalize(); this.setLook();
    if (u >= 1) this.enterAim();
  }

  updateAim(dt) {
    const rot = (this.keys.ArrowLeft || this.keys.KeyA ? 1 : 0) - (this.keys.ArrowRight || this.keys.KeyD ? 1 : 0);
    if (rot) { this.aimYaw += rot * dt * 0.55 / this.effectiveZoom(); this.previewDirty = true; if (this.club.putter) this.placePutterRig(); }
    if (this.previewDirty) { this.previewNext = (this.previewNext || 0); if (this.time >= this.previewNext) { this.updatePreview(); this.previewNext = this.time + 0.06; } }
    const p = this.aimPose();
    this.camera.position.lerp(p.pos, 1 - Math.exp(-dt * 10));
    const want = this.tmp.b.subVectors(p.look, this.camera.position).normalize();
    this.lookDir.lerp(want, 1 - Math.exp(-dt * 10)).normalize(); this.setLook();
    this.updateLieHud();
  }

  addressCamPose(out) {
    const eye = this.golfer.eyeWorld(this.tmp.a);
    const ball = this.golfer.ballWorld(this.tmp.b);
    const dir = this.golfer.dir;
    const ho = this.golfer.headOffset({});
    if (this.club && this.club.putter) {
      const pp = this.puttPose(ball.clone(), dir);
      out.pos.copy(pp.pos); out.look.copy(pp.look);
      this.puttCam = pp.pos.clone();
      return out;
    }
    eye.y += ho.dip;
    // Eyes on the ball, but pitched so the ball sits in the lower third and a slice of horizon shows.
    const dh = Math.hypot(ball.x - eye.x, ball.z - eye.z);
    const pitch = (this.club && this.club.putter ? 50 : 45) * Math.PI / 180;
    const drop = Math.tan(pitch) * dh;
    const look = this.tmp.c.copy(ball).addScaledVector(dir, 0.3 + ho.pitch * 8);
    look.y = eye.y - drop + ho.pitch * 0.6;
    out.pos.copy(eye); out.look.copy(look);
    return out;
  }
  updateToAddress(dt) {
    this.transT += dt; const u = Math.min(1, this.transT / 0.85), e = u * u * (3 - 2 * u);
    const to = this.addressCamPose({ pos: new THREE.Vector3(), look: new THREE.Vector3() });
    this.camera.position.lerpVectors(this.transFrom.pos, to.pos, e);
    this.camera.fov = lerp(this.fovFrom, 70, e); this.camera.updateProjectionMatrix();
    const toDir = to.look.clone().sub(to.pos).normalize();
    this.lookDir.copy(this.transFrom.look).lerp(toDir, e).normalize(); this.setLook();
    this.golfer.update(dt);
    if (u >= 1) this.armSwing();
  }
  updateAddressCam(dt) {
    const to = this.addressCamPose({ pos: new THREE.Vector3(), look: new THREE.Vector3() });
    this.camera.position.lerp(to.pos, 1 - Math.exp(-dt * 12));
    const toDir = to.look.sub(to.pos).normalize();
    this.lookDir.lerp(toDir, 1 - Math.exp(-dt * 12)).normalize(); this.setLook();
  }

  updateSwing(dt) {
    const s = this.swing; s.t += dt;
    if (s.phase === 'back') {
      const fill = Math.min(1, s.t / this.meterTime());
      this.golfer.setBackswing(fill);
      this.hud.meter({ label: 'POWER', fill, marker: null, set: this.planPower < 1 ? this.planPower : null, pct: fill });
      if (s.t >= this.meterTime() + 0.25) { s.power = 1; this.startAccuracy(); }
    } else if (s.phase === 'acc') {
      s.pos += s.dir * dt / this.accTime();
      if (s.pos >= 1) { s.pos = 1; s.dir = -1; s.sweeps++; } else if (s.pos <= 0) { s.pos = 0; s.dir = 1; s.sweeps++; }
      this.hud.accuracy({ pos: s.pos, hit: null }); // no timeout: it keeps going until STRIKE is pressed
    }
    this.golfer.update(dt);
    this.updateAddressCam(dt);
  }

  updateFlight(dt) {
    this.flightT += dt;
    if (this.chaseAt != null && this.flightT >= this.chaseAt) { this.chaseAt = null; this.camMode = 'chase'; this.chaseDir = null; }
    if (this.lockShot) this.stepLockShot(dt);
    else this.ball.step(Math.min(dt, 0.05)); // steady wind set at launch: the flight matches the preview
    for (const ev of this.ball.events) {
      if (ev.type === 'bounce') { if (!this.firstLand && !this.shotClub.putter) { this.firstLand = true; this.fx.landMark({ x: this.ball.pos.x, y: this.ball.pos.y - BALL_R, z: this.ball.pos.z }); } this.audio.bounce(ev.speed, ev.surface === SURF.SAND ? 'sand' : ev.surface === SURF.GREEN ? 'green' : ev.surface === SURF.ROUGH ? 'rough' : 'turf'); this.fx.puff({ x: this.ball.pos.x, y: this.ball.pos.y - BALL_R, z: this.ball.pos.z }, ev.surface === SURF.SAND ? 'sand' : 'turf', ev.surface === SURF.GREEN ? ev.speed * 0.35 : ev.speed); }
      else if (ev.type === 'tree') { this.audio.tree(ev.kind); this.fx.leaves(this.ball.pos); this.hud.message('Off the trees!', 1600, 'bad'); }
      else if (ev.type === 'lipout') { this.audio.groan(); this.hud.message('Lip out!', 1500, 'bad'); }
    }
    this.ball.events.length = 0;
    this.syncBallMesh();
    // ball spin visual
    const sp = this.ball.spin, v = this.ball.vel;
    if (this.ball.mode === 'roll') {
      const n = this.course.normalAt(this.ball.pos.x, this.ball.pos.z);
      const axis = this.tmp.a.set(n.x, n.y, n.z).cross(this.tmp.b.set(v.x, v.y, v.z));
      const sp2 = axis.length(); if (sp2 > 1e-4) this.ballMesh.rotateOnWorldAxis(axis.normalize(), sp2 / BALL_R * dt);
    } else {
      const wl = Math.hypot(sp.x, sp.y, sp.z); if (wl > 1e-3) this.ballMesh.rotateOnWorldAxis(this.tmp.a.set(sp.x, sp.y, sp.z).normalize(), wl * dt);
    }
    // trail
    if (this.ball.mode === 'fly') {
      this.trailPts.push(new THREE.Vector3(this.ball.pos.x, this.ball.pos.y, this.ball.pos.z)); if (this.trailPts.length > this.trailN) this.trailPts.shift();
      const n = this.trailPts.length, N = this.trailN, tp = this.trailPts;
      writeFatLine(this.trail.geometry, N, (i, o) => { const p = tp[Math.max(0, i - (N - n))]; o[0] = p.x; o[1] = p.y; o[2] = p.z; });
      this.trail.visible = n > 2;
    } else { this.trail.visible = false; this.trailPts.length = 0; }
    // shadow blob
    const gh = this.course.heightAt(this.ball.pos.x, this.ball.pos.z), hgt = this.ball.pos.y - gh;
    this.blob.visible = this.ball.mode === 'fly' && hgt > 0.05;
    this.blob.position.set(this.ball.pos.x, gh + 0.03, this.ball.pos.z); const bs = 0.04 + hgt * 0.02; this.blob.scale.set(bs, bs, 1); this.blob.material.opacity = 0.45 / (1 + hgt * 0.12);

    if (this.flightT > 0.7) { this.hud.showMeter(false); this.hud.showAccuracy(false); } // the swing gauges have done their job
    // live carry and height while the ball is in the air
    if (!this.shotClub.putter && !this.firstLand && this.ball.mode === 'fly') {
      this.flightMax = Math.max(this.flightMax, hgt);
      this.hud.setFlight(Math.hypot(this.ball.pos.x - this.shotStart.x, this.ball.pos.z - this.shotStart.z), this.flightMax);
    }
    this.golfer.update(dt);
    this.updateFlightCamera(dt);

    if (this.ball.mode === 'rest' || this.ball.mode === 'water' || this.ball.mode === 'oob' || this.ball.mode === 'holed') this.onShotEnd();
  }

  /** The tee peg, knocked out by a driver: it tumbles forward and comes to rest on its side. */
  updatePegFly(dt) {
    const f = this.pegFly, p = this.peg.position;
    f.vy -= 9.8 * dt; p.x += f.vx * dt; p.y += f.vy * dt; p.z += f.vz * dt;
    this.peg.rotation.x += f.spin * dt; this.peg.rotation.z += f.spin * 0.6 * dt;
    const g = this.groundY(p.x, p.z) + 0.006;
    if (p.y <= g && f.vy < 0) { p.y = g; this.peg.rotation.set(Math.PI / 2, 0, this.peg.rotation.z); this.pegFly = null; }
  }

  /** Code 1111: carry the ball along an arc (a roll, for a putt) that ends in the cup. */
  stepLockShot(dt) {
    const k = this.lockShot, b = this.ball, pin = this.L.pin, px = b.pos.x, py = b.pos.y, pz = b.pos.z;
    k.t = Math.min(1, k.t + dt / k.dur);
    const u = k.putt ? 1 - (1 - k.t) * (1 - k.t) : k.t; // a putt slows as it reaches the cup
    b.pos.x = lerp(k.x0, pin.x, u); b.pos.z = lerp(k.z0, pin.z, u);
    const ground = this.course.heightAt(b.pos.x, b.pos.z) + BALL_R;
    b.pos.y = k.putt ? ground : Math.max(ground, lerp(k.y0, this.course.heightAt(pin.x, pin.z) + BALL_R, u) + k.apex * 4 * u * (1 - u));
    if (dt > 0) { b.vel.x = (b.pos.x - px) / dt; b.vel.y = (b.pos.y - py) / dt; b.vel.z = (b.pos.z - pz) / dt; }
    b.mode = k.putt ? 'roll' : 'fly';
    if (k.t >= 1) { b.pos.x = pin.x; b.pos.z = pin.z; b.vel.x = b.vel.y = b.vel.z = 0; b.mode = 'holed'; this.lockShot = null; }
  }

  updateFlightCamera(dt) {
    const b = this.ball.pos, bp = this.tmp.c.set(b.x, b.y, b.z);
    const eye = this.golfer.eyeWorld(this.tmp.a);
    const distFromEye = eye.distanceTo(bp);
    const tag = this.camMode === 'chase' ? 'BALL CAM' : (this.landingCam ? 'LANDING CAM' : '');
    this.hud.setCamTag(tag);
    if (this.camMode === 'chase' && this.ball.mode !== 'rest') {
      const v = this.ball.vel; const vh = this.tmp.b.set(v.x, 0, v.z); const vs = vh.length();
      if (vs > 0.5) this.chaseDir = vh.normalize().clone(); else if (!this.chaseDir) this.chaseDir = this.aimDir();
      const want = bp.clone().addScaledVector(this.chaseDir, -7).add(new THREE.Vector3(0, 2.6, 0));
      want.y = Math.max(want.y, Math.max(this.course.heightAt(want.x, want.z), this.course.waterLevel) + 1.2);
      this.camera.position.lerp(want, 1 - Math.exp(-dt * 4));
      this.lookDir.subVectors(bp, this.camera.position).normalize(); this.setLook();
      this.camera.fov = 55; this.camera.updateProjectionMatrix();
      return;
    }
    // landing cam: set up once the ball is coming down far from the player
    if (!this.landingCam && this.ball.mode === 'fly' && this.ball.vel.y < 0 && (b.y - this.course.heightAt(b.x, b.z)) < 14 && distFromEye > 55) {
      const v = this.ball.vel; const vh = new THREE.Vector3(v.x, 0, v.z).normalize();
      const right = new THREE.Vector3().crossVectors(vh, UP);
      const pos = bp.clone().addScaledVector(vh, 9).addScaledVector(right, 8);
      pos.y = Math.max(this.course.heightAt(pos.x, pos.z), this.course.waterLevel) + 2.4;
      this.landingCam = { pos };
    }
    if (this.landingCam) {
      this.camera.position.lerp(this.landingCam.pos, 1 - Math.exp(-dt * 6));
      const want = this.tmp.b.subVectors(bp, this.camera.position).normalize();
      this.lookDir.lerp(want, 1 - Math.exp(-dt * 8)).normalize(); this.setLook();
      const d = this.camera.position.distanceTo(bp);
      const fov = clamp(60 - 30 * smoothstep(8, 40, d), 30, 60);
      this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 5)); this.camera.updateProjectionMatrix();
      return;
    }
    // POV: head stays put, eyes track the ball with a little lag, zooming as it goes
    const ho = this.golfer.headOffset({});
    eye.y += ho.dip;
    if (this.shotClub && this.shotClub.putter && this.puttCam) eye.copy(this.puttCam);
    this.camera.position.lerp(eye, 1 - Math.exp(-dt * 8));
    const want = this.tmp.b.subVectors(bp, this.camera.position).normalize();
    const lag = this.flightT < 0.25 ? 3 : 7;
    this.lookDir.lerp(want, 1 - Math.exp(-dt * lag)).normalize(); this.setLook();
    const fov = clamp(66 - 40 * smoothstep(12, 140, distFromEye), 26, 70);
    this.camera.fov += (fov - this.camera.fov) * (1 - Math.exp(-dt * 3)); this.camera.updateProjectionMatrix();
  }

  onShotEnd() {
    const b = this.ball;
    this.blob.visible = false; this.hud.showMeter(false); this.hud.showAccuracy(false); this.hud.setFlight(null);
    if (b.mode === 'holed') {
      this.audio.cup(); this.state = 'holed'; this.holedT = 0;
      const total = this.strokes;
      const diff = total - this.L.par;
      const name = total === 1 ? 'HOLE IN ONE!' : diff <= -2 ? 'EAGLE!' : diff === -1 ? 'BIRDIE!' : diff === 0 ? 'PAR' : diff === 1 ? 'BOGEY' : diff === 2 ? 'DOUBLE BOGEY' : `+${diff}`;
      this.finalName = name; this.finalTotal = total; this.hud.setSwingLabel(''); this.hud.clearMessage(); this.hud.setHint(''); this.hud.setCamTag('');
      // the celebration scales with the result: nothing over par, a chime for par, confetti and applause under it
      const tier = this.holeTier = total === 1 || diff <= -2 ? 3 : diff === -1 ? 2 : diff === 0 ? 1 : 0;
      const pin = this.L.pin, py = this.groundY(pin.x, pin.z);
      this.hud.banner(name, `HOLE ${this.L.number} · ${total} STROKE${total === 1 ? '' : 'S'}`, total === 1 ? 'ace' : diff < 0 ? 'under' : diff === 0 ? 'par' : 'over');
      this.fx.celebrate({ x: pin.x, y: py, z: pin.z }, tier); this.audio.celebrate(tier); this.celebrateT = 0.55;
      this.golfer.group.visible = false; this.trail.visible = false;
      this.orbit0 = Math.atan2(this.camera.position.z - pin.z, this.camera.position.x - pin.x);
      this.scores[this.holeIndex] = { strokes: total, par: this.L.par, penalties: this.penalties }; this.updateRoundHud();
      this.holeCoins = coinsFor(total, this.L.par);
      if (this.profile) { this.store.addCoins(this.profile, this.holeCoins); this.hud.setCoins(this.profile.coins); }
      return;
    }
    this.state = 'settle'; this.settleT = 0;
    const dist = Math.hypot(b.pos.x - this.shotStart.x, b.pos.z - this.shotStart.z);
    if (b.mode === 'water' && this.course.voidLevel != null) { this.hud.message('Lost in the void — one-stroke penalty', 2600, 'bad'); this.penalty = 'water'; }
    else if (b.mode === 'water') { this.audio.splash(); this.fx.splash(b.pos, this.course.waterLevelAt(b.pos.x, b.pos.z)); this.hud.message('Splash! One-stroke penalty', 2600, 'bad'); this.penalty = 'water'; }
    else if (b.mode === 'oob') { this.hud.message('Out of bounds — penalty, replay', 2600, 'bad'); this.penalty = 'oob'; }
    else {
      this.penalty = null;
      const lie = this.lieId();
      const where = SURF_NAME[lie];
      const dPin = this.distToPin();
      // how far the ball finished from the line it was aimed on (+ = right), so the aim can be trusted or not
      const a = this.shotAim || this.aimDir(); const lat = -(b.pos.x - this.shotStart.x) * a.z + (b.pos.z - this.shotStart.z) * a.x;
      const lineTxt = Math.abs(lat) < 0.5 ? 'on the line' : `${Math.abs(lat).toFixed(1)} m ${lat > 0 ? 'right' : 'left'} of the line`;
      const txt = this.shotClub.putter ? (dPin < 1.5 ? 'Tap-in' : `Rolled ${(dist * 3.28).toFixed(0)} ft · ${(dPin * 3.28).toFixed(0)} ft left`) : `${yards(dist)} yds · ${where} · ${lineTxt}${dPin < 25 ? ` · ${(dPin * 3.28).toFixed(0)} ft to the pin` : ''}`;
      this.hud.message(txt, 2800, lie === SURF.SAND || lie === SURF.ROUGH ? '' : 'good');
    }
  }

  updateSettle(dt) {
    this.settleT += dt; this.golfer.update(dt);
    if (this.camMode === 'chase' || this.landingCam) { /* hold */ } else { this.updateFlightCamera(dt); }
    if (this.settleT < 1.4) return;
    // next lie
    if (this.penalty) {
      this.strokes += 1; this.penalties += 1;
      this.ball.place(this.lastPos.x, this.lastPos.z);
    } else { this.ball.mode = 'rest'; this.ball.pos.y = this.course.heightAt(this.ball.pos.x, this.ball.pos.z) + BALL_R; }
    this.strokes += 1; this.peg.visible = false;
    this.lastPos = { x: this.ball.pos.x, z: this.ball.pos.z };
    this.syncBallMesh();
    this.spinSel.x = 0; this.spinSel.y = 0; this.hud.setSpinLabel('SPIN');
    this.aimYaw = this.defaultAimYaw(); this.autoClub(); this.solvePlan();
    const to = this.aimPose();
    this.walk = { t: 0, from: this.camera.position.clone(), fromLook: this.lookDir.clone(), to: to.pos, toLook: to.look.clone().sub(to.pos).normalize(), fovFrom: this.camera.fov };
    const d = this.walk.from.distanceTo(this.walk.to);
    this.walk.dur = clamp(0.9 + d / 80, 1.0, 3.2); this.walk.arc = Math.min(22, d * 0.14);
    this.state = 'walk'; this.golfer.group.visible = false;
    this.hud.setCamTag(''); this.hud.setStroke(this.strokes);
  }

  updateWalk(dt) {
    const w = this.walk; w.t += dt; const u = Math.min(1, w.t / w.dur), e = u * u * (3 - 2 * u);
    this.camera.position.lerpVectors(w.from, w.to, e); this.camera.position.y += Math.sin(Math.PI * e) * w.arc;
    this.lookDir.copy(w.fromLook).lerp(w.toLook, e).normalize(); this.setLook();
    this.camera.fov = lerp(w.fovFrom, 62, e); this.camera.updateProjectionMatrix();
    if (u >= 1) this.enterAim();
  }

  updateHoled(dt) {
    this.holedT += dt; this.golfer.update(dt);
    // ball drops out of sight
    this.ballMesh.position.y = this.ball.pos.y - Math.min(0.1, this.holedT * 0.4);
    // the camera swings in and circles the cup while the result is up
    const pin = this.L.pin, py = this.groundY(pin.x, pin.z), ang = this.orbit0 + this.holedT * 0.42;
    const want = this.tmp.a.set(pin.x + Math.cos(ang) * 3.3, py + 1.15, pin.z + Math.sin(ang) * 3.3);
    want.y = Math.max(want.y, this.groundY(want.x, want.z) + 0.5);
    this.camera.position.lerp(want, 1 - Math.exp(-dt * 2.4));
    const look = this.tmp.b.set(pin.x, py + 0.45, pin.z).sub(this.camera.position).normalize();
    this.lookDir.lerp(look, 1 - Math.exp(-dt * 5)).normalize(); this.setLook();
    this.camera.fov += (50 - this.camera.fov) * (1 - Math.exp(-dt * 3)); this.camera.updateProjectionMatrix();
    // an eagle or an ace keeps the confetti coming for a moment
    if (this.holeTier >= 3 && this.holedT < 2.2) { this.celebrateT -= dt; if (this.celebrateT <= 0) { this.celebrateT = 0.55; this.fx.celebrate({ x: pin.x, y: py, z: pin.z }, 2); } }
    if (this.holedT > (this.holeTier >= 2 ? 3.2 : 2.3) && !this.endShown) {
      this.endShown = true;
      this.hud.clearMessage(); this.hud.banner('');
      const played = this.scores.filter(Boolean);
      const toPar = played.reduce((a, s) => a + s.strokes - s.par, 0);
      const toParTxt = toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`;
      const last = this.holeIndex >= HOLE_COUNT - 1;
      const pars = Array.from({ length: HOLE_COUNT }, (_, i) => (this.scores[i] ? this.scores[i].par : holeFor(this.courseIndex, i).par));
      const mark = (sc) => { if (!sc) return '<span class="mk todo">·</span>'; const d = sc.strokes - sc.par; return `<span class="mk ${d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 1 ? 'bogey' : d >= 2 ? 'double' : ''}">${sc.strokes}</span>`; };
      const half = (from, label) => {
        const idx = Array.from({ length: 9 }, (_, k) => from + k), done = idx.map((i) => this.scores[i]).filter(Boolean);
        const cur = (i) => (i === this.holeIndex ? ' class="cur"' : '');
        return `<div class="sc-row head${from ? ' gap' : ''}"><span>HOLE</span>${idx.map((i) => `<span${cur(i)}>${i + 1}</span>`).join('')}<span>${label}</span></div>`
          + `<div class="sc-row parrow"><span>PAR</span>${idx.map((i) => `<span${cur(i)}>${pars[i]}</span>`).join('')}<span>${idx.reduce((a, i) => a + pars[i], 0)}</span></div>`
          + `<div class="sc-row"><span>SCORE</span>${idx.map((i) => `<span${cur(i)}>${mark(this.scores[i])}</span>`).join('')}<span>${done.length ? done.reduce((a, s) => a + s.strokes, 0) : '–'}</span></div>`;
      };
      const card = `<div class="scorecard">${half(0, 'OUT')}${half(9, 'IN')}</div>`;
      const roundTotal = played.reduce((a, s) => a + s.strokes, 0);
      let bestTxt = '';
      if (last && this.profile) { const cid = this.L.courseId; const prev = this.profile.best && this.profile.best[cid] ? this.profile.best[cid].strokes : null; this.store.finishRound(this.profile, cid, roundTotal, toPar); bestTxt = prev == null || roundTotal < prev ? ' · <b class="coin">new best!</b>' : ` · best ${prev}`; }
      const diff = this.finalTotal - this.L.par;
      const stats = `<div class="rstats"><div><b>${this.finalTotal}</b><i>stroke${this.finalTotal === 1 ? '' : 's'}${this.penalties ? ` · ${this.penalties} pen` : ''}</i></div><div><b>${toParTxt}</b><i>round · thru ${played.length}</i></div>${this.profile ? `<div><b class="coin">+${this.holeCoins}</b><i>coins · ${this.profile.coins} banked</i></div>` : ''}</div>`;
      this.panel.innerHTML = `<div class="sub">${esc(this.L.courseName).toUpperCase()} · HOLE ${this.L.number} · PAR ${this.L.par}</div><div class="score ${diff > 0 ? 'over' : diff === 0 ? 'par' : ''}">${this.finalName}</div>${stats}${card}${last ? `<p><b>Round complete: ${roundTotal} (${toParTxt})</b>${bestTxt}</p>` : ''}<div class="pbtns"><button class="btn ghost" id="shopBtn">PRO SHOP</button>${last ? `<button class="btn ghost" id="profBtn">PLAYERS</button>` : ''}<button class="btn" id="nextBtn">${last ? 'PLAY AGAIN' : 'NEXT HOLE →'}</button></div>`;
      this.overlay.classList.remove('hidden');
      document.getElementById('nextBtn').onclick = () => { if (last) { this.scores = []; this.goToHole(0); } else this.goToHole(this.holeIndex + 1); };
      document.getElementById('shopBtn').onclick = () => this.openShop();
      const pb = document.getElementById('profBtn'); if (pb) pb.onclick = () => { this.scores = []; this.showTitle(); };
    }
  }

  /** Rebuild the scene for hole n and tee off (with the flyover). */
  async goToHole(n) {
    if (this.loadingHole) return;
    this.loadingHole = true; this.state = 'loading'; this.endShown = false;
    this.golfer.group.visible = false; this.previewLine.visible = this.previewEdge.visible = false; this.landRing.visible = false; this.trail.visible = false; this.puttRibbon.visible = false;
    const L = holeFor(this.courseIndex, n);
    this.panel.innerHTML = `<div class="sub">${esc(L.courseName).toUpperCase()} · WALKING TO THE NEXT TEE</div><div class="holenum">${L.number}</div>${L.name ? `<h1 class="plain">${esc(L.name)}</h1>` : ''}<div class="hstats"><span>PAR <b>${L.par}</b></span><span><b>${L.yards}</b> YDS</span></div><p>${this.holeBlurb(L).replace(/^.*? yds\. /, '')}</p><div id="loading">…</div>`;
    this.overlay.classList.remove('hidden');
    try {
      await this.buildHoleScene(n, (t) => { const el = document.getElementById('loading'); if (el) el.textContent = t; });
      this.newHole();
    } catch (e) {
      console.error(e);
      this.panel.innerHTML += `<p style="color:var(--coral)">Could not build the hole: ${esc(e.message)}</p><button class="btn" id="retryBtn">RETRY</button>`;
      document.getElementById('retryBtn').onclick = () => { this.loadingHole = false; this.goToHole(n); };
      return;
    }
    this.overlay.classList.add('hidden');
    this.loadingHole = false;
    this.beginFlyover();
  }

  updateSun() {
    const f = this.tmp.a.copy(this.camera.position);
    const fwd = this.tmp.b.copy(this.lookDir); fwd.y = 0; fwd.normalize();
    f.addScaledVector(fwd, 45);
    this.sun.target.position.copy(f); this.sun.position.copy(f).addScaledVector(this.sunDir, 320);
    this.sun.target.updateMatrixWorld();
  }

  /** Debug: advance the simulation by `sec` at 60Hz and render one frame. */
  step(sec = 1) {
    const n = Math.round(sec * 60); for (let i = 0; i < n; i++) this.update(1 / 60);
    if (this.debugCam) { this.camera.position.copy(this.debugCam.pos); this.camera.lookAt(this.debugCam.look); this.camera.fov = 50; this.camera.updateProjectionMatrix(); }
    this.composer.render(); return this.state;
  }

  loop() {
    requestAnimationFrame(() => this.loop());
    const dt = Math.min(0.05, this.clock.getDelta());
    const w = window.innerWidth, h = window.innerHeight;
    if (w === 0 || h === 0) return;
    if (this.canvas.width !== Math.floor(w * this.renderer.getPixelRatio()) || this.canvas.height !== Math.floor(h * this.renderer.getPixelRatio())) this.resize();
    if (this.paused) { if (this.debugCam) { this.camera.position.copy(this.debugCam.pos); this.camera.lookAt(this.debugCam.look); } this.composer.render(); return; }
    if (this.state !== 'loading' && this.state !== 'title') this.update(dt);
    else { this.time += dt; setWindTime(this.time); if (this.state === 'title') { const p = this.aimPose(); this.camera.position.copy(p.pos); this.lookDir.subVectors(p.look, p.pos).normalize(); this.setLook(); this.updateSun(); } }
    this.composer.render();
  }
}

const game = new Game();
window.__game = game;
game.init().catch((e) => { console.error(e); const el = document.getElementById('loading') || document.getElementById('panel'); if (el) el.textContent = 'ERROR: ' + e.message; });
