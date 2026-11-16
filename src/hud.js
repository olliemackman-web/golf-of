// DOM overlay: hole card, wind, minimap, club, swing meter, messages. Styled by styles.css.
import { COURSE_NAME } from './courseData.js';
const COURSE_TITLE = COURSE_NAME;

const YD = 1.09361;
export const yards = (m) => Math.round(m * YD);

/** Accuracy bands as a fraction of half the bar: gold is flush (100%), green 90-99, amber, red. */
export const ACC_BANDS = { gold: 0.12, green: 0.3, amber: 0.6 };
export function accBand(a) {
  a = Math.abs(a);
  const B = ACC_BANDS;
  if (a <= B.gold) return { name: 'gold', pct: 100 };
  if (a <= B.green) return { name: 'green', pct: Math.round(99 - 9 * (a - B.gold) / (B.green - B.gold)) };
  if (a <= B.amber) return { name: 'amber', pct: Math.round(89 - 19 * (a - B.green) / (B.amber - B.green)) };
  return { name: 'red', pct: Math.round(69 - 69 * (a - B.amber) / (1 - B.amber)) };
}

const ic = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
const ICON = {
  shop: ic('<path d="M5 8h14l-1.2 11.2a1 1 0 0 1-1 .8H7.200a1 1 0 0 1-1-.8z"/><path d="M9 8V6.500a3 3 0 0 1 6 0V8"/>'),
  spin: ic('<circle cx="12" cy="12" r="3.200"/><path d="M19.500 9.500A8 8 0 0 0 5.300 7.600"/><path d="M5 4.200v3.600h3.600"/><path d="M4.500 14.500a8 8 0 0 0 14.200 1.900"/><path d="M19 19.800v-3.600h-3.600"/>'),
  view: ic('<path d="M2.500 12S6 5.500 12 5.500 21.500 12 21.500 12 18 18.500 12 18.500 2.500 12 2.500 12z"/><circle cx="12" cy="12" r="2.800"/>'),
  zoom: ic('<circle cx="10.500" cy="10.500" r="6"/><path d="M15 15l5.500 5.500"/><path d="M10.500 8v5M8 10.500h5"/>'),
  cam: ic('<rect x="2.500" y="6.500" width="13" height="11" rx="2.200"/><path d="M15.500 10.500l6-3v9l-6-3z"/>'),
  prev: ic('<path d="M14.500 5.500L8 12l6.500 6.500"/>', ' stroke-width="2.400"'),
  next: ic('<path d="M9.500 5.500L16 12l-6.500 6.500"/>', ' stroke-width="2.400"'),
  flag: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.500v13" stroke="currentColor" stroke-width="1.600" stroke-linecap="round" fill="none"/><path d="M4.800 2l8.200 3.200-8.200 3.200z" fill="currentColor"/></svg>',
  // points right at zero rotation: the wind dial rotates it so that "up" is downrange
  arrow: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M27 16L10 8.500l3.800 7.500L10 23.500z" fill="currentColor"/><path d="M5 16h7" stroke="currentColor" stroke-width="2.400" stroke-linecap="round"/></svg>',
  dial: '<svg viewBox="0 0 54 54" fill="none" aria-hidden="true"><circle cx="27" cy="27" r="25.500" stroke="currentColor" stroke-width="1"/><path d="M27 2v5M27 47v5M2 27h5M47 27h5" stroke="currentColor" stroke-width="1.500" stroke-linecap="round"/><path d="M27 1.500l-2.600 4.200h5.200z" fill="#f3eedc"/></svg>',
};
/** Small gold coin followed by an amount, used wherever coins are shown. */
export const coinHtml = (n) => `<i class="coin-ic"></i>${n}`;

const MW = 340, MH = 460; // minimap backing store, twice its CSS size

export class Hud {
  constructor(course) {
    this.course = course; this.layout = course.layout;
    this.root = document.getElementById('hud');
    this.root.innerHTML = `
      <div class="tl">
        <div class="holecard glass">
          <div class="hc-flag"><small>HOLE</small><b id="hnum">1</b></div>
          <div class="hc-main">
            <div class="hc-name" id="hname">${COURSE_NAME.toUpperCase()}</div>
            <div class="hc-stats">
              <span><i>Par</i><b id="hpar">4</b></span>
              <span><i>Yards</i><b id="hyds">—</b></span>
              <span><i>Stroke</i><b id="stroke">1</b></span>
              <span class="hc-round"><i id="hthru">Round</i><b id="hround" class="level">E</b></span>
            </div>
          </div>
        </div>
        <div class="chips">
          <div class="chip pin">${ICON.flag}<b id="topin">—</b><i>to pin</i></div>
          <div class="chip lie" id="lie"><i class="swatch"></i><span id="lietxt"></span></div>
          <div class="chip coins" id="coins">${coinHtml(0)}</div>
        </div>
      </div>
      <div class="tr">
        <div class="windcard glass">
          <div class="wdial">${ICON.dial}<div class="warrow" id="warrow">${ICON.arrow}</div></div>
          <div><div class="wlabel">WIND</div><div class="wspeed"><b id="wspeed">0</b>mph</div><div class="wtag" id="wtag"></div></div>
        </div>
        <canvas id="minimap" width="${MW}" height="${MH}"></canvas>
      </div>
      <div class="tc"><div class="camtag" id="camtag"></div><div class="flight" id="flight"><span><i>CARRY</i><b id="fcarry">0</b><u>yds</u></span><span><i>HEIGHT</i><b id="fheight">0</b><u>ft</u></span></div><div class="hint" id="hint"></div></div>
      <div class="callout" id="callout"></div>
      <div class="banner" id="banner"><div class="bn-sub" id="bnsub"></div><div class="bn-title" id="bntitle"></div></div>
      <div class="meter" id="meter"><div class="mlabel" id="mlabel">POWER</div><div class="mwrap"><div class="mbar"><div class="mzone"></div><div class="mfill" id="mfill"></div><div class="mticks"></div><div class="mmark" id="mmark"></div></div><div class="mset" id="mset"></div></div><div class="mpct" id="mpct"></div></div>
      <div class="aimtick" id="aimtick"></div>
      <div class="bottom">
        <div class="msg" id="msg"></div>
        <div class="abar" id="abar"><div class="atri" id="atri"></div><div class="atrack"><div class="aticks"></div><div class="azone"></div><div class="amark" id="amark"></div></div><div class="alabel">ACCURACY <b id="apct">0%</b></div></div>
        <div class="clubcard glass">
          <button class="nav" id="btnPrev" title="Previous club (Q)" aria-label="Previous club">${ICON.prev}</button>
          <div class="cc-main"><div class="cc-label">CLUB</div><div class="cname" id="cname">Driver</div><div class="cdist" id="cdist">— yds</div></div>
          <button class="nav" id="btnNext" title="Next club (E)" aria-label="Next club">${ICON.next}</button>
        </div>
        <div class="tools" id="controls">
          <button class="cbtn" id="btnShop" title="Pro shop (U)">${ICON.shop}<span>SHOP</span></button>
          <button class="cbtn" id="btnSpin" title="Ball spin (B)">${ICON.spin}<span>SPIN</span></button>
          <button class="cbtn" id="btnView" title="Aim view (V)">${ICON.view}<span>VIEW</span></button>
          <button class="cbtn" id="btnZoom" title="Zoom the aim view (wheel, pinch, Z / X)">${ICON.zoom}<span>1×</span></button>
          <button class="cbtn" id="btnCam" title="Ball camera (C)">${ICON.cam}<span>CAM</span></button>
        </div>
        <button class="primary" id="btnSwing">SWING</button>
        <div class="target glass" id="target"><div class="tlabel">TARGET <b id="tval">100%</b><span id="tcarry"></span></div><input type="range" id="tpow" min="8" max="100" value="100" aria-label="Target power"></div>
      </div>`;
    this.el = {};
    for (const id of ['lietxt', 'coins', 'btnShop', 'btnSpin', 'abar', 'apct', 'atri', 'amark', 'hname', 'hnum', 'hpar', 'hyds', 'hround', 'hthru', 'stroke', 'topin', 'lie', 'warrow', 'wspeed', 'minimap', 'meter', 'mlabel', 'mfill', 'mmark', 'mset', 'mpct', 'cname', 'cdist', 'msg', 'hint', 'camtag', 'target', 'tval', 'tcarry', 'tpow', 'btnView', 'btnZoom', 'btnCam', 'btnPrev', 'btnNext', 'btnSwing', 'aimtick', 'wtag', 'flight', 'fcarry', 'fheight', 'callout', 'banner', 'bnsub', 'bntitle']) this.el[id] = document.getElementById(id);
    this.msgTimer = null;
    this.buildMinimap();
  }

  /** Switch to a new hole: re-fit the minimap and update the card. */
  setHole(course) {
    this.course = course; this.layout = course.layout;
    const L = this.layout;
    this.el.hnum.textContent = L.number;
    this.el.hname.textContent = `${(L.courseName || COURSE_TITLE).toUpperCase()}${L.name ? ' · ' + L.name.toUpperCase() : ''}`;
    this.el.hpar.textContent = L.par;
    this.el.hyds.textContent = L.yards;
    this.buildMinimap();
  }

  buildMinimap() {
    const c = this.course, M = c.maskRes, half = c.size / 2, L = this.layout;
    // region of the course the minimap shows: fit everything on the hole with a margin
    const xs = [], zs = [];
    const add = (x, z, m = 0) => { xs.push(x - m, x + m); zs.push(z - m, z + m); };
    for (const p of L.spline) add(p[0], p[1], L.halfWidth + 20);
    add(L.tee.x, L.tee.z, 20); add(L.green.x, L.green.z, 40);
    for (const b of L.bunkers) add(b.x, b.z, 12);
    for (const q of L.ponds || (L.pond ? [L.pond] : [])) add(q.x, q.z, Math.min(70, Math.max(q.rx, q.rz)) + 10);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    // keep the map's aspect
    const aspect = MW / MH; let w = x1 - x0, h = z1 - z0;
    if (w / h < aspect) { const nw = h * aspect; x0 -= (nw - w) / 2; x1 += (nw - w) / 2; } else { const nh = w / aspect; z0 -= (nh - h) / 2; z1 += (nh - h) / 2; }
    this.mm = { x0, x1, z0, z1 };
    const off = document.createElement('canvas'); off.width = MW; off.height = MH;
    const ctx = off.getContext('2d'), img = ctx.createImageData(MW, MH), d = img.data;
    const space = !!L.space;
    // rough, fairway, green, sand, water/void
    const P = space
      ? [[26, 30, 34], [70, 150, 124], [140, 226, 180], [176, 170, 166], [5, 6, 12]]
      : [[30, 62, 40], [84, 148, 66], [156, 216, 104], [232, 214, 160], [58, 128, 190]];
    const m = c.mask, w4 = [0, 0, 0, 0];
    for (let py = 0; py < MH; py++) for (let px = 0; px < MW; px++) {
      const x = this.mm.x1 - ((px + 0.5) / MW) * (this.mm.x1 - this.mm.x0);
      const z = this.mm.z1 - ((py + 0.5) / MH) * (this.mm.z1 - this.mm.z0);
      // bilinear tap of the surface mask so the shapes have smooth edges at this size
      const fi = Math.min(M - 1.001, Math.max(0, (x + half) / c.size * M - 0.5)), fj = Math.min(M - 1.001, Math.max(0, (z + half) / c.size * M - 0.5));
      const i = fi | 0, j = fj | 0, u = fi - i, v = fj - j, k = (j * M + i) * 4, k2 = k + M * 4;
      for (let ch = 0; ch < 4; ch++) w4[ch] = ((m[k + ch] * (1 - u) + m[k + 4 + ch] * u) * (1 - v) + (m[k2 + ch] * (1 - u) + m[k2 + 4 + ch] * u) * v) / 255;
      // sharpen the soft mask edges a little so fairway and green read as shapes
      const st = (t) => { t = Math.min(1, Math.max(0, (t - 0.3) / 0.4)); return t * t * (3 - 2 * t); };
      const f = st(w4[0]), g = st(w4[1]), s = st(w4[2]), wt = st(w4[3]);
      const tot = Math.max(1, f + g + s + wt), r = 1 - Math.min(1, f + g + s + wt);
      // faint mowing stripes on the fairway, a soft vignette toward the edge of the map
      const stripe = f > 0.5 && !space ? (((px + py) >> 3) & 1 ? 1.045 : 0.965) : 1;
      const dx = px / MW - 0.5, dy = py / MH - 0.5, vig = 1 - 0.55 * Math.min(1, (dx * dx + dy * dy) * 2.1);
      const o = (py * MW + px) * 4;
      for (let ch = 0; ch < 3; ch++) d[o + ch] = (r * P[0][ch] * vig + (f * P[1][ch] * stripe + g * P[2][ch] + s * P[3][ch] + wt * P[4][ch]) / tot * (1 - r));
      d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    this.mmBase = off;
  }
  mmPoint(x, z) { return [((this.mm.x1 - x) / (this.mm.x1 - this.mm.x0)) * MW, ((this.mm.z1 - z) / (this.mm.z1 - this.mm.z0)) * MH]; }
  drawMinimap(ball, aimDir, preview) {
    const ctx = this.el.minimap.getContext('2d');
    ctx.clearRect(0, 0, MW, MH); ctx.drawImage(this.mmBase, 0, 0);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const [tx, ty] = this.mmPoint(this.layout.tee.x, this.layout.tee.z);
    ctx.fillStyle = 'rgba(243,238,220,0.85)'; ctx.fillRect(tx - 7, ty - 2, 14, 4);
    if (preview && preview.length > 1) {
      ctx.beginPath(); preview.forEach((p, i) => { const [px, py] = this.mmPoint(p.x, p.z); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6; ctx.setLineDash([7, 7]); ctx.stroke(); ctx.setLineDash([]);
      const e = preview[preview.length - 1]; const [ex, ey] = this.mmPoint(e.x, e.z);
      ctx.strokeStyle = '#c9ff5b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(ex, ey, 8, 0, Math.PI * 2); ctx.stroke();
    }
    const [fx, fy] = this.mmPoint(this.layout.pin.x, this.layout.pin.z);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath(); ctx.ellipse(fx, fy, 5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - 22); ctx.stroke();
    ctx.fillStyle = '#ff5a43'; ctx.beginPath(); ctx.moveTo(fx + 1, fy - 23); ctx.lineTo(fx + 17, fy - 17); ctx.lineTo(fx + 1, fy - 11); ctx.fill();
    if (ball) {
      const [bx, by] = this.mmPoint(ball.x, ball.z);
      ctx.fillStyle = 'rgba(255,255,255,0.28)'; ctx.beginPath(); ctx.arc(bx, by, 11, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, 5.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    }
  }

  /** Wire the on-screen controls. handlers: {swing, view, cam, prev, next, target(pct)} */
  bindControls(h) {
    const tap = (el, fn) => { el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); }); el.addEventListener('click', (e) => { e.preventDefault(); fn(); }); };
    tap(this.el.btnSwing, h.swing); tap(this.el.btnView, h.view); tap(this.el.btnShop, h.shop); tap(this.el.btnSpin, h.spin); tap(this.el.btnCam, h.cam); tap(this.el.btnPrev, h.prev); tap(this.el.btnNext, h.next); tap(this.el.btnZoom, h.zoom);
    this.el.tpow.addEventListener('input', () => { const v = parseInt(this.el.tpow.value, 10); this.el.tpow.style.setProperty('--fill', `${((v - 8) / 92 * 100).toFixed(1)}%`); h.target(v / 100); });
    this.el.tpow.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  setSwingLabel(text) { this.el.btnSwing.textContent = text; this.el.btnSwing.style.visibility = text ? 'visible' : 'hidden'; }
  /** Round score so far: strokes to par over the holes finished. */
  setRound(toPar, thru) { const e = this.el.hround; e.textContent = thru ? (toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : `${toPar}`) : 'E'; e.className = !thru || toPar === 0 ? 'level' : toPar > 0 ? 'over' : ''; this.el.hthru.textContent = thru ? `Thru ${thru}` : 'Round'; }
  setCoins(n) { this.el.coins.innerHTML = coinHtml(n); }
  setSpinLabel(t) { this.el.btnSpin.lastElementChild.textContent = t; this.el.btnSpin.classList.toggle('active', t !== 'SPIN'); }
  setAimControls(show) { for (const k of ['btnShop', 'btnSpin', 'btnView', 'btnPrev', 'btnNext', 'target']) this.el[k].style.display = show ? '' : 'none'; if (!show) { this.el.btnZoom.style.display = 'none'; this.el.aimtick.style.display = 'none'; } }
  setZoomVisible(v) { this.el.btnZoom.style.display = v ? '' : 'none'; }
  /** Thin centre tick shown while aiming: the aim line converges on it, so line your target up with it. */
  setAimTick(v) { this.el.aimtick.style.display = v ? '' : 'none'; }
  setZoomLabel(z) { this.el.btnZoom.lastElementChild.textContent = `${z >= 10 ? Math.round(z) : +z.toFixed(1)}×`; this.el.btnZoom.classList.toggle('active', z > 1.01); }
  setTarget(pct, carryM, putter) { this.el.tval.textContent = `${Math.round(pct * 100)}%`; this.el.tcarry.textContent = putter ? `${(carryM * 3.28084).toFixed(0)} ft` : `${yards(carryM)} yds`; if (parseInt(this.el.tpow.value, 10) !== Math.round(pct * 100)) this.el.tpow.value = Math.round(pct * 100); this.el.tpow.style.setProperty('--fill', `${((Math.round(pct * 100) - 8) / 92 * 100).toFixed(1)}%`); }
  setHoleYards(m) { this.el.hyds.textContent = yards(m); }
  setStroke(n) { this.el.stroke.textContent = n; }
  setToPin(m) { this.el.topin.textContent = m < 30 ? `${(m * 3.28084).toFixed(0)} ft` : `${yards(m)} yds`; }
  setLie(text) { const name = text.replace(/^Lie · /, ''); this.el.lietxt.textContent = name; this.el.lie.className = 'chip lie lie-' + name.toLowerCase(); }
  /** phi = wind direction relative to the aim line (0 = straight downrange, + = toward the player's right). */
  setWind(speedMs, phi) {
    this.el.wspeed.textContent = (speedMs * 2.237).toFixed(0);
    // the glyph points right; on the dial "up" is downrange
    this.el.warrow.style.transform = `rotate(${phi - Math.PI / 2}rad)`;
    const calm = speedMs < 0.3; this.el.warrow.style.opacity = calm ? 0.3 : 1;
    const a = Math.abs(phi);
    this.el.wtag.textContent = calm ? 'CALM' : a < Math.PI / 4 ? 'TAIL' : a > 3 * Math.PI / 4 ? 'HEAD' : phi > 0 ? 'L → R' : 'R → L';
  }
  setClub(club, carryM) { this.el.cname.textContent = club.name; this.el.cdist.textContent = club.putter ? 'on the green' : `${yards(carryM)} yds carry`; }
  setHint(html) { this.el.hint.innerHTML = html; }
  setCamTag(t) { this.el.camtag.textContent = t; }
  message(text, ms = 3000, cls = '') {
    const m = this.el.msg; m.textContent = text; m.className = 'msg show ' + cls;
    clearTimeout(this.msgTimer); if (ms > 0) this.msgTimer = setTimeout(() => { m.className = 'msg'; }, ms);
  }
  /** Code 1111 armed: the pin chip lights up until the shot is struck. */
  setLock(on) { const chip = this.el.topin.parentElement; chip.classList.toggle('locked', on); chip.lastElementChild.textContent = on ? 'locked on' : 'to pin'; }
  /** Strike quality, popped up for a moment as the club comes down. cls: gold | green | amber | red. */
  callout(text, cls = '') {
    const c = this.el.callout; c.textContent = text; c.className = 'callout'; void c.offsetWidth; c.className = 'callout show ' + cls;
    clearTimeout(this.calloutTimer); this.calloutTimer = setTimeout(() => { c.className = 'callout'; }, 1300);
  }
  /** Live read-out while the ball is in the air; pass null to put it away. */
  setFlight(carryM, heightM) {
    const f = this.el.flight;
    if (carryM == null) { f.classList.remove('show'); return; }
    f.classList.add('show'); this.el.fcarry.textContent = yards(carryM); this.el.fheight.textContent = Math.round(heightM * 3.28084);
  }
  /** The big result when the ball drops: BIRDIE!, PAR... cls: ace | under | par | over. Empty title hides it. */
  banner(title, sub = '', cls = '') {
    const b = this.el.banner;
    if (!title) { b.className = 'banner'; return; }
    this.el.bntitle.innerHTML = [...title].map((ch, i) => `<span style="animation-delay:${(i * 0.035).toFixed(3)}s">${ch === ' ' ? '&nbsp;' : ch}</span>`).join('');
    this.el.bnsub.textContent = sub; b.className = 'banner'; void b.offsetWidth; b.className = 'banner show ' + cls;
  }
  clearMessage() { clearTimeout(this.msgTimer); this.el.msg.className = 'msg'; }
  showMeter(show) { this.el.meter.style.opacity = show ? 1 : 0; }
  showAccuracy(show) { this.el.abar.style.opacity = show ? 1 : 0; }
  /** pos 0..1 across the bar (0.5 = centre); hit = where it was stopped (null while moving). */
  accuracy({ pos, hit }) {
    const v = hit == null ? pos : hit;
    const pct = `${(v * 100).toFixed(1)}%`;
    this.el.amark.style.left = pct; this.el.atri.style.left = pct;
    const band = accBand((v - 0.5) * 2);
    this.el.apct.textContent = `${band.name.toUpperCase()} · ${band.pct}%`;
    this.el.abar.className = 'abar band-' + band.name + (hit == null ? '' : ' hit');
  }
  /** power 0..1 fill, marker 0..1 position (null hides), set = chosen power line. */
  meter({ label, fill, marker, set, pct }) {
    this.el.mlabel.textContent = label;
    this.el.mfill.style.height = `${(fill * 100).toFixed(1)}%`;
    if (marker == null) this.el.mmark.style.display = 'none'; else { this.el.mmark.style.display = 'block'; this.el.mmark.style.bottom = `${(marker * 100).toFixed(1)}%`; }
    if (set == null) this.el.mset.style.display = 'none'; else { this.el.mset.style.display = 'block'; this.el.mset.style.bottom = `${(set * 100).toFixed(1)}%`; }
    this.el.mpct.textContent = pct != null ? `${Math.round(pct * 100)}%` : '';
  }
}
