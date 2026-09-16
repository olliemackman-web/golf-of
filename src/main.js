import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Course, holeFor, COURSES, HOLE_COUNT, SURF, SURF_NAME, splineDist, splinePoint, splineLength, courseYards } from './courseData.js';
import { Ball, BALL_R, CLUBS, shotParams, simulateShot } from './physics.js';
import { buildTextures, buildTerrain, buildWater, buildFarHills, buildSky, buildClouds, buildHole, buildTeeMarkers, HORIZON } from './terrain.js';
import { buildVegetation, setWindTime, TreeField } from './vegetation.js';
import { buildAsteroids } from './space.js';
import { Golfer } from './golfer.js';
import { Hud, yards } from './hud.js';
import { GameAudio } from './audio.js';
import { ProfileStore, coinsFor, UPGRADES } from './profile.js';
import { Menus, shortSpin } from './menus.js';
import { mulberry32, clamp, smoothstep, lerp } from './noise.js';

const UP = new THREE.Vector3(0, 1, 0);
const T_METER = 1.15, T_METER_PUTT = 1.9, T_DOWN = 0.32, T_DOWN_PUTT = 0.36, T_ACC = 0.75, T_ACC_PUTT = 0.9;
const ZOOM_MAX = 5, ZOOM_STEPS = [1, 1.6, 2.5, 4];
import { ACC_BANDS } from './hud.js';

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
      ? { dpr: Math.min(window.devicePixelRatio, 1.5), shadow: 2048, shadowRange: 70, bloom: false, msaa: 0, veg: { cardsBroad: 34, cardsConifer: 44, tufts: 18000, reeds: 3500, aa: true } }
      : { dpr: Math.min(window.devicePixelRatio, 1.75), shadow: 4096, shadowRange: 95, bloom: true, msaa: 4, veg: { aa: true } };
    // antialias on for both tiers: on phones the default framebuffer MSAA is nearly free and it is what
    // stops the foliage and grass edges shimmering; alpha-to-coverage rides on it.
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(this.quality.dpr);
    r.setSize(window.innerWidth, window.innerHeight);
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    const scene = this.scene = new THREE.Scene();
    // fog colour matches the sky dome at the horizon so distant trees and hills melt into it
    scene.fog = new THREE.FogExp2(HORIZON.clone(), 0.00054);
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 6000);
    this.lookDir = new THREE.Vector3(0, 0, 1);

    await this.frame(); document.getElementById('loading').textContent = 'PAINTING TEXTURES…'; await this.frame();
    this.tex = buildTextures();
    this.skyCtl = buildSky(r, scene);
    this.sunDir = this.skyCtl.sunDir; this.envMap = this.skyCtl.envMap; this.spaceMode = false;
    this.clouds = buildClouds(this.tex); scene.add(this.clouds);
    this.holeGroup = null; this.scores = []; this.holeIndex = 0; this.courseIndex = 0;
    await this.buildHoleScene(0, (t) => { document.getElementById('loading').textContent = t; });

    // lights: a warm key from the sun, cool fill from the sky, so shadows go blue rather than grey
    const sun = this.sun = new THREE.DirectionalLight(0xffe7c4, 3.1);
    sun.castShadow = true; sun.shadow.mapSize.set(this.quality.shadow, this.quality.shadow);
    const sr = this.quality.shadowRange;
    const sc = sun.shadow.camera; sc.near = 1; sc.far = 700; sc.left = -sr; sc.right = sr; sc.top = sr; sc.bottom = -sr;
    sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.5; sun.shadow.radius = 2;
    scene.add(sun); scene.add(sun.target);
    this.hemi = new THREE.HemisphereLight(0x8fb2e6, 0x46552c, 0.5); scene.add(this.hemi);
    if (this.spaceMode) this.applyAtmosphere(true); // the first hole may already be a Starfall hole

    // ball
    const bmat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.32, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.2, bumpMap: this.tex.ballBump, bumpScale: 0.0008 });
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 40, 28), bmat); this.ballMesh.castShadow = true; scene.add(this.ballMesh);
    this.blob = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
    this.blob.rotation.x = -Math.PI / 2; this.blob.renderOrder = 3; scene.add(this.blob);
    this.ball = new Ball(this.course); this.ball.trees = this.trees; this.ball.hole = this.course.layout.pin;
    // faint trail so the ball reads against a bright sky
    this.trailN = 40; this.trailPts = [];
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.trailN * 3), 3));
    const tc = new Float32Array(this.trailN * 3); for (let i = 0; i < this.trailN; i++) { const a = i / this.trailN; tc[i * 3] = tc[i * 3 + 1] = tc[i * 3 + 2] = a; }
    tg.setAttribute('color', new THREE.BufferAttribute(tc, 3));
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.8, depthTest: true }));
    this.trail.frustumCulled = false; this.trail.visible = false; scene.add(this.trail);

    // preview
    this.previewLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(new Array(900).fill(0).map(() => new THREE.Vector3())), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthTest: false }));
    this.previewLine.renderOrder = 20; this.previewLine.frustumCulled = false; scene.add(this.previewLine);
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
        uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.3 }, uSat: { value: 1.08 }, uContrast: { value: 1.05 } },
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
      this.holeGroup.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.geometry) o.geometry.dispose(); if (o.material) { const m = o.material; if (m.map && !shared.has(m.map)) m.map.dispose(); if (m.dispose) m.dispose(); if (o.customDepthMaterial) o.customDepthMaterial.dispose(); } });
      scene.remove(this.holeGroup);
      if (this.terrain) { this.terrain.maskTex.dispose(); if (this.terrain.uniforms.tAO.value) this.terrain.uniforms.tAO.value.dispose(); }
    }
    progress('SHAPING THE LAND…'); await this.frame();
    this.holeIndex = n;
    this.course = new Course(holeFor(this.courseIndex, n));
    const space = !!this.L.space;
    if (space !== this.spaceMode) { this.spaceMode = space; if (this.sun) this.applyAtmosphere(space); }
    const g = this.holeGroup = new THREE.Group(); scene.add(g);
    progress(space ? 'RAISING THE ISLANDS…' : 'LAYING THE TURF…'); await this.frame();
    const terr = buildTerrain(this.course, this.tex, this.sunDir, { lite: this.isMobile, space }); this.terrain = terr; g.add(terr.mesh);
    this.water = buildWater(this.course, this.tex, this.envMap); if (this.water) g.add(this.water);
    this.asteroids = null;
    if (space) { this.asteroids = buildAsteroids(this.course, n); g.add(this.asteroids); } else g.add(buildFarHills(this.course));
    this.holeObj = buildHole(this.course, this.tex); g.add(this.holeObj);
    g.add(buildTeeMarkers(this.course));
    if (space) { this.trees = new TreeField(); }
    else {
      progress('PLANTING TREES…'); await this.frame();
      const veg = buildVegetation(this.course, this.tex, this.quality.veg); g.add(veg.group); this.trees = veg.field;
      if (veg.ao) terr.uniforms.tAO.value = veg.ao;
    }
    if (this.ball) { this.ball.course = this.course; this.ball.trees = this.trees; this.ball.hole = this.course.layout.pin; }
    if (this.hud) this.hud.setHole(this.course);
  }

  get L() { return this.course.layout; }

  /** Ground height for cameras and markers: never below the water or void level. */
  groundY(x, z) { return Math.max(this.course.heightAt(x, z), this.course.waterLevel); }

  /** Day on the parkland courses, deep space on Starfall: sky, fog, fill light and clouds. */
  applyAtmosphere(space) {
    this.envMap = this.skyCtl.setSpace(space);
    this.scene.fog.color.set(space ? 0x000000 : HORIZON);
    this.scene.fog.density = space ? 0.0011 : 0.00054;
    this.hemi.color.set(space ? 0x2c3d6b : 0x8fb2e6); this.hemi.groundColor.set(space ? 0x06070b : 0x46552c); this.hemi.intensity = space ? 0.6 : 0.5;
    this.sun.color.set(space ? 0xfff6ea : 0xffe7c4); this.sun.intensity = space ? 3.4 : 3.1;
    if (this.clouds) this.clouds.visible = !space;
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
    this.trail.visible = false; this.blob.visible = false; this.trailPts.length = 0;
    this.aimView = 'behind'; this.previewEnd = null; this.previewPath = null; this.landingCam = null; this.puttCam = null;
    this.spinSel.x = 0; this.spinSel.y = 0; this.hud.setSpinLabel('SPIN'); this.setAimZoom(1);
    this.hud.setCamTag('');
    this.lastPos = { x: this.ball.pos.x, z: this.ball.pos.z };
    const wa = this.rnd() * Math.PI * 2, ws = 0.8 + this.rnd() * 4.5;
    this.windBase = { x: Math.cos(wa) * ws, z: Math.sin(wa) * ws, speed: ws, angle: wa };
    this.aimYaw = this.defaultAimYaw();
    this.autoClub(); this.solvePlan();
    this.camMode = 'pov';
    this.syncBallMesh();
    this.hud.setStroke(1); this.updateLieHud();
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
        if (idx === this.courseIndex && this.holeIndex === 0 && this.scores.length === 0) this.startPlay();
        else { this.courseIndex = idx; this.scores = []; this.goToHole(0); }
      }, this.store); // the store lets the picker rank every saved player per course
    });
  }

  holeBlurb(L) {
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
  /** Zoom the aim view in or out (1× to ZOOM_MAX). Kept between shots, reset on a new hole. */
  setAimZoom(z) {
    this.aimZoom = clamp(z, 1, ZOOM_MAX);
    this.hud.setZoomLabel(this.aimZoom);
    if (this.state === 'aim') { this.camera.fov = this.aimBaseFov() / this.aimZoom; this.camera.updateProjectionMatrix(); }
  }

  enterAim() {
    this.state = 'aim';
    this.golfer.group.visible = false;
    this.camera.fov = this.aimBaseFov() / this.aimZoom; this.camera.updateProjectionMatrix();
    if (this.club.putter) this.placePutterRig();
    this.hud.showMeter(false); this.hud.showAccuracy(false);
    this.hud.setCamTag('');
    this.updateLieHud();
    this.previewDirty = true;
    if (this.club.putter) this.hud.setHint('<b>DRAG BACK</b> for pace, <b>LEFT / RIGHT</b> for line &nbsp; <b>W / S</b> fine-tune pace &nbsp; <b>SPACE</b> putt when ready');
    else this.hud.setHint('<b>DRAG / ← →</b> aim &nbsp; <b>WHEEL / Z X</b> zoom &nbsp; <b>V</b> view &nbsp; <b>Q / E</b> club &nbsp; <b>W / S</b> target power &nbsp; <b>SPACE</b> address the ball');
    this.hud.setSwingLabel(this.club.putter ? 'PUTT' : 'ADDRESS'); this.hud.setAimControls(true);
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
    this.previewLine.visible = false; this.landRing.visible = false;
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
    this.hud.setHint('<b>SPACE</b> start swing &nbsp;·&nbsp; <b>ESC</b> back');
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
    const endDist = (pw) => {
      const r = simulateShot(this.course, from, { x: dir.x, z: dir.z }, shotParams(this.club, pw, 0, lie, this.mods()), { wind: this.windBase, trees: this.trees, maxT: 30 });
      return Math.hypot(r.end.x - from.x, r.end.z - from.z);
    };
    if (endDist(1) <= want) { this.planPower = 1; return; }
    let lo = this.club.putter ? 0.08 : 0.3, hi = 1;
    if (endDist(lo) >= want) { this.planPower = lo; return; }
    for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; if (endDist(mid) < want) lo = mid; else hi = mid; }
    this.planPower = Math.round(((lo + hi) / 2) * 100) / 100;
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
    this.solvePlan();
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
    if (this.aimView === 'high') {
      const pos = new THREE.Vector3(b.x, 0, b.z).addScaledVector(dir, -14).addScaledVector(right, 2);
      pos.y = Math.max(b.y + 11, this.course.heightAt(pos.x, pos.z) + 6);
      const look = new THREE.Vector3(b.x, b.y, b.z).addScaledVector(dir, 55);
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
    const look = new THREE.Vector3(b.x, b.y, b.z).addScaledVector(dir, 28).add(new THREE.Vector3(0, 0.6, 0));
    return { pos, look };
  }
  syncBallMesh() { this.ballMesh.position.set(this.ball.pos.x, this.ball.pos.y, this.ball.pos.z); }

  updatePreview() {
    const dir = this.aimDir();
    const lie = this.lieId();
    const params = shotParams(this.club, this.planPower, 0, lie, this.mods());
    const from = { x: this.ball.pos.x, y: this.ball.pos.y, z: this.ball.pos.z };
    const res = simulateShot(this.course, from, { x: dir.x, z: dir.z }, params, { wind: this.windBase, trees: this.trees, hole: this.L.pin, maxT: 30 });
    const pts = res.path; const g = this.previewLine.geometry; const arr = g.attributes.position.array;
    const n = Math.min(pts.length, 900);
    for (let i = 0; i < n; i++) { arr[i * 3] = pts[i].x; arr[i * 3 + 1] = Math.max(pts[i].y, this.course.heightAt(pts[i].x, pts[i].z)) + 0.06; arr[i * 3 + 2] = pts[i].z; }
    g.setDrawRange(0, n); g.attributes.position.needsUpdate = true;
    const e = res.end; this.landRing.position.set(e.x, this.groundY(e.x, e.z) + 0.05, e.z);
    const scale = this.club.putter ? 0.25 : 1; this.landRing.scale.set(scale, scale, 1);
    if (this.club.putter) {
      this.previewLine.visible = false;
      this.buildRibbon(pts);
      const holed = res.mode === 'holed';
      this.ribbonMat.uniforms.uColor.value.set(holed ? 0x7dff4a : 0xffffff);
      this.puttRibbon.visible = true; this.landRing.visible = !holed;
      this.puttHoled = holed;
    } else { this.previewLine.visible = true; this.puttRibbon.visible = false; this.landRing.visible = true; }
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
      if (pinch && pointers.size >= 2) { if (this.state === 'aim') this.setAimZoom(pinch.z0 * pinchDist() / Math.max(1, pinch.d0)); return; }
      if (!dragging || this.state !== 'aim') return;
      const dx = e.clientX - lx; lx = e.clientX;
      const fine = 1 / this.aimZoom; // zoomed in, the same finger travel turns the aim less
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
    // wheel zooms the aim view; with shift (or outside aiming) it changes club as before
    let wheelAcc = 0;
    this.canvas.addEventListener('wheel', (e) => {
      if (this.state === 'aim' && !e.shiftKey) { this.setAimZoom(this.aimZoom * Math.exp(-e.deltaY * 0.0022)); return; }
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
        case 'KeyZ': if (this.state === 'aim') this.setAimZoom(this.aimZoom * 1.25); break;
        case 'KeyX': if (this.state === 'aim') this.setAimZoom(this.aimZoom / 1.25); break;
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
    this.hud.setHint('<b>SPACE</b> when the marker is in the green'); this.hud.setSwingLabel('STRIKE');
  }

  strike() {
    const s = this.swing;
    if (s.phase !== 'acc') return;
    s.acc = (s.pos - 0.5) * 2; // -1 left .. +1 right of centre
    this.hud.accuracy({ pos: s.pos, hit: s.pos });
    s.phase = 'down'; s.t = 0;
    this.golfer.beginDownswing(this.club.putter ? T_DOWN_PUTT : T_DOWN, () => this.impact());
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
    const lie = this.lieId();
    const params = shotParams(this.club, s.power, acc, lie, this.mods());
    this.ball.captureBonus = this.mods().captureBonus;
    // tiny natural dispersion
    const jitter = (this.rnd() - 0.5) * (this.club.putter ? 0.4 : 1.2);
    const yaw = this.aimYaw - (params.dirErr + jitter) * Math.PI / 180; // + = right of the line
    const dir = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const w = this.wind(this.time); this.ball.wind.x = w.x; this.ball.wind.z = w.z;
    this.ball.launch(dir, params.speed, params.loft, params.back, params.side, params.land || 0);
    this.shotLie = lie; this.shotClub = this.club; this.shotStart = { x: this.ball.pos.x, z: this.ball.pos.z };
    this.audio.hit(s.power, this.club);
    this.state = 'flight'; this.flightT = 0; this.landingCam = null; this.trackFov = 62;
    // every full shot is followed on the ball cam; C flips back to the eyes mid-flight. Putts stay at eye level.
    if (!this.club.putter) { this.camMode = 'chase'; this.chaseDir = null; }
    this.previewLine.visible = false; this.landRing.visible = false; this.puttRibbon.visible = false;
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
    const w = this.wind(this.time);
    this.holeObj.userData.update(this.time, Math.atan2(w.x, w.z) + Math.PI);
    if (this.water) for (const m of this.water.children) { const sh = m.material.userData.shader; if (sh) sh.uniforms.tMask.value = this.terrain.maskTex; }
    this.tex.waterNormal.offset.set(this.time * 0.012, this.time * 0.007);
    this.ribbonMat.uniforms.uTime.value = this.time;
    const aimDir = this.aimDir();
    this.hud.setWind(w.speed, Math.atan2(w.x, w.z) - this.aimYaw + Math.PI);

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
    if (rot) { this.aimYaw += rot * dt * 0.55 / this.aimZoom; this.previewDirty = true; if (this.club.putter) this.placePutterRig(); }
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
    const w = this.wind(this.time); this.ball.wind.x = w.x; this.ball.wind.z = w.z;
    this.ball.step(Math.min(dt, 0.05));
    for (const ev of this.ball.events) {
      if (ev.type === 'bounce') { this.audio.bounce(ev.speed); }
      else if (ev.type === 'tree') { this.audio.tree(); this.hud.message('Off the trees!', 1600, 'bad'); }
      else if (ev.type === 'lipout') { this.hud.message('Lip out!', 1500, 'bad'); }
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
      const ta = this.trail.geometry.attributes.position.array; const n = this.trailPts.length;
      for (let i = 0; i < this.trailN; i++) { const p = this.trailPts[Math.max(0, i - (this.trailN - n))]; ta[i * 3] = p.x; ta[i * 3 + 1] = p.y; ta[i * 3 + 2] = p.z; }
      this.trail.geometry.attributes.position.needsUpdate = true; this.trail.visible = n > 2;
    } else { this.trail.visible = false; this.trailPts.length = 0; }
    // shadow blob
    const gh = this.course.heightAt(this.ball.pos.x, this.ball.pos.z), hgt = this.ball.pos.y - gh;
    this.blob.visible = this.ball.mode === 'fly' && hgt > 0.05;
    this.blob.position.set(this.ball.pos.x, gh + 0.03, this.ball.pos.z); const bs = 0.04 + hgt * 0.02; this.blob.scale.set(bs, bs, 1); this.blob.material.opacity = 0.45 / (1 + hgt * 0.12);

    this.golfer.update(dt);
    this.updateFlightCamera(dt);

    if (this.ball.mode === 'rest' || this.ball.mode === 'water' || this.ball.mode === 'oob' || this.ball.mode === 'holed') this.onShotEnd();
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
    this.blob.visible = false; this.hud.showMeter(false); this.hud.showAccuracy(false);
    if (b.mode === 'holed') {
      this.audio.cup(); this.state = 'holed'; this.holedT = 0;
      const total = this.strokes;
      const diff = total - this.L.par;
      const name = total === 1 ? 'HOLE IN ONE!' : diff <= -2 ? 'EAGLE!' : diff === -1 ? 'BIRDIE!' : diff === 0 ? 'PAR' : diff === 1 ? 'BOGEY' : diff === 2 ? 'DOUBLE BOGEY' : `+${diff}`;
      this.hud.message(name, 0, 'good'); this.finalName = name; this.finalTotal = total; this.hud.setSwingLabel('');
      this.scores[this.holeIndex] = { strokes: total, par: this.L.par, penalties: this.penalties };
      this.holeCoins = coinsFor(total, this.L.par);
      if (this.profile) { this.store.addCoins(this.profile, this.holeCoins); this.hud.setCoins(this.profile.coins); }
      return;
    }
    this.state = 'settle'; this.settleT = 0;
    const dist = Math.hypot(b.pos.x - this.shotStart.x, b.pos.z - this.shotStart.z);
    if (b.mode === 'water' && this.course.voidLevel != null) { this.hud.message('Lost in the void — one-stroke penalty', 2600, 'bad'); this.penalty = 'water'; }
    else if (b.mode === 'water') { this.audio.splash(); this.hud.message('Splash! One-stroke penalty', 2600, 'bad'); this.penalty = 'water'; }
    else if (b.mode === 'oob') { this.hud.message('Out of bounds — penalty, replay', 2600, 'bad'); this.penalty = 'oob'; }
    else {
      this.penalty = null;
      const lie = this.lieId();
      const where = SURF_NAME[lie];
      const dPin = this.distToPin();
      const txt = this.shotClub.putter ? (dPin < 1.5 ? 'Tap-in' : `Rolled ${(dist * 3.28).toFixed(0)} ft · ${(dPin * 3.28).toFixed(0)} ft left`) : `${yards(dist)} yds · ${where}${dPin < 25 ? ` · ${(dPin * 3.28).toFixed(0)} ft to the pin` : ''}`;
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
    this.strokes += 1;
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
    if (this.holedT > 2.0 && !this.endShown) {
      this.endShown = true;
      const played = this.scores.filter(Boolean);
      const toPar = played.reduce((a, s) => a + s.strokes - s.par, 0);
      const toParTxt = toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`;
      const last = this.holeIndex >= HOLE_COUNT - 1;
      const card = `<div class="scorecard">${Array.from({ length: HOLE_COUNT }, (_, i) => this.scores[i]).map((sc, i) => `<span class="${sc ? (sc.strokes < sc.par ? 'under' : sc.strokes > sc.par ? 'over' : '') : 'todo'}"><small>${i + 1}</small>${sc ? sc.strokes : '·'}</span>`).join('')}</div>`;
      const roundTotal = played.reduce((a, s) => a + s.strokes, 0);
      let bestTxt = '';
      if (last && this.profile) { const cid = this.L.courseId; const prev = this.profile.best && this.profile.best[cid] ? this.profile.best[cid].strokes : null; this.store.finishRound(this.profile, cid, roundTotal, toPar); bestTxt = prev == null || roundTotal < prev ? ' · <b class="coin">new best!</b>' : ` · best ${prev}`; }
      const coinsTxt = this.profile ? `<p><b class="coin">+${this.holeCoins} coins</b> · balance ◎ ${this.profile.coins}</p>` : '';
      this.panel.innerHTML = `<div class="sub">HOLE ${this.L.number} · PAR ${this.L.par}</div><div class="score">${this.finalName}</div><p>${this.finalTotal} stroke${this.finalTotal === 1 ? '' : 's'}${this.penalties ? ` · ${this.penalties} penalt${this.penalties === 1 ? 'y' : 'ies'}` : ''} &nbsp;·&nbsp; round <b>${toParTxt}</b> through ${played.length}</p>${coinsTxt}${card}${last ? `<p><b>Round complete: ${roundTotal} (${toParTxt})</b>${bestTxt}</p>` : ''}<div class="mfoot" style="justify-content:center;gap:10px"><button class="btn small" id="shopBtn">PRO SHOP</button>${last ? `<button class="btn small" id="profBtn">PLAYERS</button>` : ''}<button class="btn" id="nextBtn">${last ? 'PLAY AGAIN' : 'NEXT HOLE →'}</button></div>`;
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
    this.golfer.group.visible = false; this.previewLine.visible = false; this.landRing.visible = false; this.trail.visible = false; this.puttRibbon.visible = false;
    const L = holeFor(this.courseIndex, n);
    this.panel.innerHTML = `<div class="sub">${L.courseName.toUpperCase()} · WALKING TO THE NEXT TEE</div><h1>${L.name ? L.name.toUpperCase() : 'HOLE ' + L.number}</h1><div class="sub">PAR ${L.par} · ${L.yards} YDS</div><p>${this.holeBlurb(L)}</p><div id="loading">…</div>`;
    this.overlay.classList.remove('hidden');
    try {
      await this.buildHoleScene(n, (t) => { const el = document.getElementById('loading'); if (el) el.textContent = t; });
      this.newHole();
    } catch (e) {
      console.error(e);
      this.panel.innerHTML += `<p style="color:#ff8a7a">Could not build the hole: ${e.message}</p><button class="btn" id="retryBtn">RETRY</button>`;
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
