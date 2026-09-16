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
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };
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
await page.fill('#panel input', 'shots'); await page.click('#panel .pnew .btn');
await page.waitForFunction(() => !document.querySelector('#panel input'));
const course = parseInt(process.env.COURSE || '0', 10);
await page.locator('#panel .btn').nth(course).click();
await page.waitForFunction(() => ['flyover', 'aim'].includes(window.__game.state), null, { timeout: 180000 });
await page.evaluate(() => { window.__game.paused = true; document.getElementById('hud').style.display = 'none'; document.getElementById('overlay').style.display = 'none'; });
const only = (process.env.ONLY || '').split(',').filter(Boolean);

const shot = async (name, fn) => {
  const t0 = Date.now();
  await page.evaluate(fn);
  if (only.length && !only.some((o) => name.includes(o))) return;
  await page.evaluate(() => window.__game.step(0.05));
  await page.screenshot({ path: path.join(out, name + '.png'), timeout: 240000 });
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
if (process.env.HOLE) {
  const n = parseInt(process.env.HOLE, 10) - 1;
  await page.evaluate(async (n) => { await window.__game.goToHole(n); }, n);
  await page.waitForFunction(() => window.__game.state !== 'loading', null, { timeout: 180000 });
  await shot(`08-hole${n + 1}-tee`, () => { const g = window.__game; g.overlay.classList.add('hidden'); g.enterAim(); const p = g.aimPose(); g.camera.position.copy(p.pos); g.lookDir.subVectors(p.look, p.pos).normalize(); g.setLook(); for (let i = 0; i < 40; i++) g.update(1 / 60); });
}
void settle;
await browser.close(); server.close();
