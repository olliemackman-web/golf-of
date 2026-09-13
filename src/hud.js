// DOM overlay: hole card, wind, minimap, club, swing meter, messages.
import { COURSE_NAME } from './courseData.js';

const YD = 1.09361;
export const yards = (m) => Math.round(m * YD);

export class Hud {
  constructor(course) {
    this.course = course; this.layout = course.layout;
    this.root = document.getElementById('hud');
    this.root.innerHTML = `
      <div class="card hole"><div class="hname" id="hname">${COURSE_NAME.toUpperCase()} · HOLE 1</div><div class="hrow"><span id="hpar">PAR 4</span><span id="hyds">— YDS</span></div><div class="hrow strokes"><span>STROKE <b id="stroke">1</b></span><span>TO PIN <b id="topin">—</b></span></div><div class="lie" id="lie"></div></div>
      <div class="card wind"><div class="wlabel">WIND</div><div class="wdial"><div class="warrow" id="warrow">➤</div></div><div class="wspeed" id="wspeed">0 mph</div></div>
      <canvas id="minimap" width="170" height="230"></canvas>
      <div class="meter" id="meter"><div class="mlabel" id="mlabel">POWER</div><div class="mbar"><div class="mzone"></div><div class="mfill" id="mfill"></div><div class="mmark" id="mmark"></div><div class="mset" id="mset"></div></div><div class="mpct" id="mpct"></div></div>
      <div class="card club"><div class="cname" id="cname">Driver</div><div class="cdist" id="cdist">— yds</div><div class="chint">Q / E · change club</div></div>
      <div class="msg" id="msg"></div>
      <div class="hint" id="hint"></div>
      <div class="camtag" id="camtag"></div>
      <div class="abar" id="abar"><div class="alabel">ACCURACY <b id="apct">0%</b></div><div class="atrack"><div class="azone"></div><div class="afill" id="afill"></div><div class="amark" id="amark"></div></div></div>
      <div class="target" id="target"><div class="tlabel">TARGET <b id="tval">100%</b> <span id="tcarry"></span></div><input type="range" id="tpow" min="8" max="100" value="100"></div>
      <div class="controls" id="controls">
        <button class="cbtn" id="btnView" title="Aim view (V)">VIEW</button>
        <button class="cbtn" id="btnCam" title="Ball camera (C)">CAM</button>
        <button class="cbtn" id="btnPrev" title="Previous club (Q)">◀</button>
        <button class="cbtn" id="btnNext" title="Next club (E)">▶</button>
        <button class="cbtn big" id="btnSwing">SWING</button>
      </div>`;
    this.el = {};
    for (const id of ['abar', 'apct', 'afill', 'amark', 'hname', 'hpar', 'hyds', 'stroke', 'topin', 'lie', 'warrow', 'wspeed', 'minimap', 'meter', 'mlabel', 'mfill', 'mmark', 'mset', 'mpct', 'cname', 'cdist', 'msg', 'hint', 'camtag', 'target', 'tval', 'tcarry', 'tpow', 'btnView', 'btnCam', 'btnPrev', 'btnNext', 'btnSwing']) this.el[id] = document.getElementById(id);
    this.msgTimer = null;
    this.buildMinimap();
  }

  /** Switch to a new hole: re-fit the minimap and update the card. */
  setHole(course) {
    this.course = course; this.layout = course.layout;
    const L = this.layout;
    this.el.hname.textContent = `${COURSE_NAME.toUpperCase()} · HOLE ${L.number}`;
    this.el.hpar.textContent = `PAR ${L.par}`;
    this.el.hyds.textContent = `${L.yards} YDS`;
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
    if (L.pond) add(L.pond.x, L.pond.z, Math.max(L.pond.rx, L.pond.rz) + 10);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
    // keep the 170:230 aspect
    const aspect = 170 / 230; let w = x1 - x0, h = z1 - z0;
    if (w / h < aspect) { const nw = h * aspect; x0 -= (nw - w) / 2; x1 += (nw - w) / 2; } else { const nh = w / aspect; z0 -= (nh - h) / 2; z1 += (nh - h) / 2; }
    this.mm = { x0, x1, z0, z1 };
    const off = document.createElement('canvas'); off.width = 170; off.height = 230;
    const ctx = off.getContext('2d'), img = ctx.createImageData(170, 230), d = img.data;
    for (let py = 0; py < 230; py++) for (let px = 0; px < 170; px++) {
      const x = this.mm.x1 - (px / 170) * (this.mm.x1 - this.mm.x0);
      const z = this.mm.z1 - (py / 230) * (this.mm.z1 - this.mm.z0);
      const i = Math.min(M - 1, Math.max(0, ((x + half) / c.size * M) | 0)), j = Math.min(M - 1, Math.max(0, ((z + half) / c.size * M) | 0));
      const k = (j * M + i) * 4, m = c.mask;
      const f = m[k] / 255, g = m[k + 1] / 255, s = m[k + 2] / 255, w = m[k + 3] / 255, r = Math.max(0, 1 - f - g - s - w);
      const col = [r * 46 + f * 88 + g * 140 + s * 214 + w * 40, r * 82 + f * 150 + g * 205 + s * 196 + w * 95, r * 38 + f * 60 + g * 90 + s * 140 + w * 150];
      const o = (py * 170 + px) * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 235;
    }
    ctx.putImageData(img, 0, 0);
    this.mmBase = off;
  }
  mmPoint(x, z) { return [((this.mm.x1 - x) / (this.mm.x1 - this.mm.x0)) * 170, ((this.mm.z1 - z) / (this.mm.z1 - this.mm.z0)) * 230]; }
  drawMinimap(ball, aimDir, preview) {
    const ctx = this.el.minimap.getContext('2d');
    ctx.clearRect(0, 0, 170, 230); ctx.drawImage(this.mmBase, 0, 0);
    if (preview && preview.length > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
      ctx.beginPath(); preview.forEach((p, i) => { const [px, py] = this.mmPoint(p.x, p.z); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }); ctx.stroke(); ctx.setLineDash([]);
    }
    const [fx, fy] = this.mmPoint(this.layout.pin.x, this.layout.pin.z);
    ctx.fillStyle = '#ff3b3b'; ctx.fillRect(fx - 1, fy - 9, 2, 9); ctx.beginPath(); ctx.moveTo(fx + 1, fy - 9); ctx.lineTo(fx + 8, fy - 6.5); ctx.lineTo(fx + 1, fy - 4); ctx.fill();
    if (ball) { const [bx, by] = this.mmPoint(ball.x, ball.z); ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
  }

  /** Wire the on-screen controls. handlers: {swing, view, cam, prev, next, target(pct)} */
  bindControls(h) {
    const tap = (el, fn) => { el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); }); el.addEventListener('click', (e) => { e.preventDefault(); fn(); }); };
    tap(this.el.btnSwing, h.swing); tap(this.el.btnView, h.view); tap(this.el.btnCam, h.cam); tap(this.el.btnPrev, h.prev); tap(this.el.btnNext, h.next);
    this.el.tpow.addEventListener('input', () => h.target(parseInt(this.el.tpow.value, 10) / 100));
    this.el.tpow.addEventListener('pointerdown', (e) => e.stopPropagation());
  }
  setSwingLabel(text) { this.el.btnSwing.textContent = text; this.el.btnSwing.style.visibility = text ? 'visible' : 'hidden'; }
  setAimControls(show) { this.el.btnView.style.display = show ? '' : 'none'; this.el.btnPrev.style.display = show ? '' : 'none'; this.el.btnNext.style.display = show ? '' : 'none'; this.el.target.style.display = show ? '' : 'none'; }
  setTarget(pct, carryM, putter) { this.el.tval.textContent = `${Math.round(pct * 100)}%`; this.el.tcarry.textContent = putter ? `· ${(carryM * 3.28084).toFixed(0)} ft` : `· ${yards(carryM)} yds`; if (parseInt(this.el.tpow.value, 10) !== Math.round(pct * 100)) this.el.tpow.value = Math.round(pct * 100); }
  setHoleYards(m) { this.el.hyds.textContent = `${yards(m)} YDS`; }
  setStroke(n) { this.el.stroke.textContent = n; }
  setToPin(m) { this.el.topin.textContent = m < 30 ? `${(m * 3.28084).toFixed(0)} ft` : `${yards(m)} yds`; }
  setLie(text) { this.el.lie.textContent = text; }
  setWind(speedMs, relAngle) { this.el.wspeed.textContent = `${(speedMs * 2.237).toFixed(0)} mph`; this.el.warrow.style.transform = `rotate(${relAngle}rad)`; this.el.warrow.style.opacity = speedMs < 0.3 ? 0.3 : 1; }
  setClub(club, carryM) { this.el.cname.textContent = club.name; this.el.cdist.textContent = club.putter ? 'on the green' : `~${yards(carryM)} yds`; }
  setHint(html) { this.el.hint.innerHTML = html; }
  setCamTag(t) { this.el.camtag.textContent = t; }
  message(text, ms = 3000, cls = '') {
    const m = this.el.msg; m.textContent = text; m.className = 'msg show ' + cls;
    clearTimeout(this.msgTimer); if (ms > 0) this.msgTimer = setTimeout(() => { m.className = 'msg'; }, ms);
  }
  showMeter(show) { this.el.meter.style.opacity = show ? 1 : 0; }
  showAccuracy(show) { this.el.abar.style.opacity = show ? 1 : 0; }
  /** sweep 0..1 runs left→right; hit = where it was stopped (null while still running); good = within the zone. */
  accuracy({ sweep, hit, good }) {
    const v = hit == null ? sweep : hit;
    this.el.afill.style.width = `${(v * 100).toFixed(1)}%`;
    this.el.amark.style.left = `${(v * 100).toFixed(1)}%`;
    this.el.apct.textContent = `${Math.round(v * 100)}%`;
    this.el.abar.className = 'abar' + (hit == null ? '' : good ? ' good' : ' bad');
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
