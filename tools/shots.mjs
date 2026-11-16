// Renders the game from a set of fixed viewpoints in headless Chromium: `npm run shots [outDir]`.
// COURSE=1 picks Gosfield, HOLE=n adds a tee shot of hole n, ONLY=01,06 limits which views render.
/* global window, document */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || path.join(root, 'shots');
fs.mkdirSync(out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, url === '/' ? 'index.html' : url);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
await page.goto(base + '/');
await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 180000 });
await page.fill('#panel input', 'shots'); await page.evaluate(() => document.querySelector('#panel .pnew .btn').click());
await page.waitForFunction(() => !document.querySelector('#panel input'));
const course = parseInt(process.env.COURSE || '0', 10);
// click from inside the page: under the software renderer a frame can outlast Playwright's click timeout
await page.evaluate((c) => document.querySelectorAll('#panel .btn')[c].click(), course);
await page.waitForFunction(() => ['flyover', 'aim'].includes(window.__game.state), null, { timeout: 180000 });
await page.evaluate(() => { window.__game.paused = true; document.getElementById('hud').style.display = 'none'; document.getElementById('overlay').style.display = 'none'; });
const only = (process.env.ONLY || '').split(',').filter(Boolean);

const shot = async (name, fn) => {
  const t0 = Date.now();
  await page.evaluate(fn);
  if (only.length && !only.some((o) => name.includes(o))) return;
  await page.evaluate(() => window.__game.step(0.05));
  await page.screenshot({ path: path.join(out, name + '.png'), timeout: 900000 });
  console.log(`${name} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
};
const settle = () => { const g = window.__game; for (let i = 0; i < 90; i++) g.update(1 / 60); };

await shot('01-tee-aim', () => { const g = window.__game; g.enterAim(); const p = g.aimPose(); g.camera.position.copy(p.pos); g.lookDir.subVectors(p.look, p.pos).normalize(); g.setLook(); });
await shot('02-overhead', () => { const g = window.__game; g.cycleView(); for (let i = 0; i < 120; i++) g.update(1 / 60); });
await shot('03-landing', () => { const g = window.__game; g.cycleView(); for (let i = 0; i < 120; i++) g.update(1 / 60); });
await shot('04-address', () => { const g = window.__game; g.cycleView(); g.enterAddress(); for (let i = 0; i < 80; i++) g.update(1 / 60); });
await shot('05-top-of-swing', () => { const g = window.__game; g.action(); for (let i = 0; i < 50; i++) g.update(1 / 60); g.action(); for (let i = 0; i < 5; i++) g.update(1 / 60); });
await shot('06-green', () => { const g = window.__game; const pin = g.L.pin; g.newHole(); g.ball.place(pin.x + 4, pin.z + 6); g.autoClub(); g.solvePlan(); g.enterAim(); const p = g.aimPose(); g.camera.position.copy(p.pos); g.lookDir.subVectors(p.look, p.pos).normalize(); g.setLook(); for (let i = 0; i < 40; i++) g.update(1 / 60); });
await shot('07-approach', () => { const g = window.__game; const pin = g.L.pin; g.newHole(); const sp = g.L.spline; const m = sp[Math.round((sp.length - 1) * 0.72)]; g.ball.place(m[0], m[1]); g.autoClub(); g.solvePlan(); g.enterAim(); const p = g.aimPose(); g.camera.position.copy(p.pos); g.lookDir.subVectors(p.look, p.pos).normalize(); g.setLook(); for (let i = 0; i < 40; i++) g.update(1 / 60); void pin; });
// ball effects: an iron through the turf just after impact, and a splash in the pond
await shot('09-divot', () => { const g = window.__game; g.newHole(); const sp = g.L.spline; const m = sp[Math.round((sp.length - 1) * 0.6)]; g.ball.place(m[0], m[1]); g.autoClub(); g.solvePlan(); g.enterAim(); g.enterAddress(); for (let i = 0; i < 75; i++) g.update(1 / 60); g.armSwing(); const s = g.swing; s.phase = 'acc'; s.pos = 0.5; s.power = 0.95; g.state = 'swing'; g.strike(); g.camMode = 'pov'; for (let i = 0; i < 60 && g.state !== 'flight'; i++) g.update(1 / 60); g.camMode = 'pov'; for (let i = 0; i < 9; i++) g.update(1 / 60); });
await shot('10-splash', () => { const g = window.__game; g.newHole(); const q = g.L.pond; if (!q) return; const lvl = g.course.waterLevelAt(q.x, q.z); g.fx.splash({ x: q.x, y: lvl, z: q.z }, lvl); const v = g.camera.position.clone(); g.debugCam = { pos: v.clone().set(q.x + 7, lvl + 2.2, q.z - 9), look: v.clone().set(q.x, lvl + 0.6, q.z) }; g.state = 'title'; for (let i = 0; i < 26; i++) g.fx.update(1 / 60, g.camera, 540); });
await page.evaluate(() => { const g = window.__game; g.debugCam = null; g.state = 'aim'; });
// close-up ground: the ball in the rough beside the fairway, a bunker from its edge, and the cup as a birdie drops
await shot('11-rough', () => { const g = window.__game; g.newHole(); const sp = g.L.spline, k = Math.round((sp.length - 1) * 0.5), a = sp[k], b = sp[k + 1]; const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), off = g.L.halfWidth + 5; g.ball.place(a[0] - dz / l * off, a[1] + dx / l * off); g.autoClub(); g.solvePlan(); g.enterAim(); g.enterAddress(); for (let i = 0; i < 80; i++) g.update(1 / 60); });
await shot('12-bunker', () => { const g = window.__game; g.newHole(); g.enterAim(); const b = g.L.bunkers[0]; if (!b) return; const v = g.camera.position.clone(), y = g.course.heightAt(b.x, b.z); g.debugCam = { pos: v.clone().set(b.x + b.rx + 5, y + 2.6, b.z + b.rz + 4), look: v.clone().set(b.x, y, b.z) }; });
await page.evaluate(() => { window.__game.debugCam = null; });
await shot('13-holed', () => { const g = window.__game, pin = g.L.pin; g.newHole(); g.ball.place(pin.x + 2.5, pin.z + 1.5); g.autoClub(); g.solvePlan(); g.enterAim(); const p = g.aimPose(); g.camera.position.copy(p.pos); g.lookDir.subVectors(p.look, p.pos).normalize(); g.setLook(); g.shotClub = g.club; g.strokes = g.L.par - 1; g.ball.pos.x = pin.x; g.ball.pos.z = pin.z; g.ball.mode = 'holed'; g.onShotEnd(); for (let i = 0; i < 55; i++) g.update(1 / 60); });
// the clubhouse behind the first tee, then the same tee shot in each of the other conditions
await shot('14-clubhouse', () => { const g = window.__game; g.newHole(); g.enterAim(); const k = (g.L.clear || [])[0]; if (!k) return; const t = g.L.tee, v = g.camera.position.clone(), y = g.course.heightAt(t.x, t.z); g.debugCam = { pos: v.clone().set(t.x + (t.x - k.x) * 0.25, y + 2.2, t.z + (t.z - k.z) * 0.25), look: v.clone().set(k.x, y + 2.5, k.z) }; });
await page.evaluate(() => { window.__game.debugCam = null; });
for (const [name, key] of [['15-golden', 'golden'], ['16-overcast', 'overcast'], ['17-rain', 'rain']]) {
  if (only.length && !only.some((o) => name.includes(o))) continue;
  await page.evaluate(async (key) => { const g = window.__game; g.paused = false; g.setConditions(key); await g.goToHole(0); }, key);
  await page.waitForFunction(() => window.__game.state !== 'loading', null, { timeout: 600000 });
  await page.evaluate(() => { const g = window.__game; g.paused = true; g.overlay.classList.add('hidden'); document.getElementById('overlay').style.display = 'none'; });
  await shot(name, () => { const g = window.__game; g.enterAim(); const p = g.aimPose(); g.camera.position.copy(p.pos); g.lookDir.subVectors(p.look, p.pos).normalize(); g.setLook(); for (let i = 0; i < 40; i++) g.update(1 / 60); });
}
await page.evaluate(() => { try { localStorage.removeItem('riverbend-conditions'); } catch (e) { /* ignore */ } });
// HOLE=3 or HOLE=3,7,11: each of those holes from its tee and from overhead
for (const hn of (process.env.HOLE || '').split(',').filter(Boolean)) {
  const n = parseInt(hn, 10) - 1;
  await page.evaluate(async (n) => { const g = window.__game; g.paused = false; await g.goToHole(n); }, n);
  await page.waitForFunction(() => window.__game.state !== 'loading', null, { timeout: 600000 });
  await page.evaluate(() => { const g = window.__game; g.paused = true; g.overlay.classList.add('hidden'); document.getElementById('overlay').style.display = 'none'; });
  await shot(`08-hole${n + 1}-tee`, () => { const g = window.__game; g.enterAim(); const p = g.aimPose(); g.camera.position.copy(p.pos); g.lookDir.subVectors(p.look, p.pos).normalize(); g.setLook(); for (let i = 0; i < 40; i++) g.update(1 / 60); });
  await shot(`08-hole${n + 1}-high`, () => { const g = window.__game; g.cycleView(); for (let i = 0; i < 140; i++) g.update(1 / 60); });
  await shot(`08-hole${n + 1}-green`, () => { const g = window.__game, L = g.L, v = g.camera.position.clone(), y = g.course.heightAt(L.green.x, L.green.z); const a = L.spline[L.spline.length - 3], dx = L.green.x - a[0], dz = L.green.z - a[1], l = Math.hypot(dx, dz); g.debugCam = { pos: v.clone().set(L.green.x - dx / l * 46 + dz / l * 14, y + 13, L.green.z - dz / l * 46 - dx / l * 14), look: v.clone().set(L.green.x, y, L.green.z) }; });
  await page.evaluate(() => { window.__game.debugCam = null; });
}
void settle;
await browser.close(); server.close();
