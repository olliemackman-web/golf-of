// Boots the real game in headless Chromium and fails on any page error.
// `npm run test:browser`. Needs `npx playwright install chromium` once on a machine
// that has not got a Playwright browser already. Set SMOKE_SHOT=out.png to save a screenshot.
/* global window, document */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);
  let file = path.join(root, url === '/' ? 'index.html' : url);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error('playwright is not installed: run `npm install` (and `npx playwright install chromium` once).'); server.close(); process.exit(2); }

const mobile = process.argv.includes('--mobile');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext(mobile
  ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' }
  : { viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
page.on('requestfailed', (r) => errors.push('request failed: ' + r.url()));

let ok = false;
try {
  const t0 = Date.now();
  await page.goto(base + '/', { waitUntil: 'load' });
  // The start screen replaces the "PREPARING THE COURSE" text with the player picker once the
  // first hole has been built. Give the software renderer generous time.
  await page.waitForFunction(() => window.__game && window.__game.state === 'title', null, { timeout: 120000 });
  const loading = await page.locator('#loading').count();
  const panelText = await page.locator('#panel').innerText();
  if (panelText.startsWith('ERROR')) errors.push(panelText);
  console.log(`start screen reached in ${((Date.now() - t0) / 1000).toFixed(1)}s (${mobile ? 'phone' : 'desktop'} profile, loading label ${loading ? 'still present' : 'replaced'})`);
  // Pick a player and a course, then let the sim run a few seconds to make sure the play loop does not throw.
  await page.fill('#panel input', 'smoke');
  await page.click('#panel .pnew .btn');
  await page.waitForFunction(() => document.querySelector('#panel .btn') && !document.querySelector('#panel input'), null, { timeout: 10000 });
  await page.locator('#panel .btn').first().click();
  await page.waitForFunction(() => window.__game.state !== 'title', null, { timeout: 10000 });
  const state = await page.evaluate(() => { window.__game.paused = true; return window.__game.step(8); });
  console.log(`played 8 simulated seconds, game state now "${state}"`);
  if (process.env.SMOKE_SHOT) { await page.screenshot({ path: process.env.SMOKE_SHOT, timeout: 180000 }); console.log('screenshot ' + process.env.SMOKE_SHOT); }
  ok = errors.length === 0;
} catch (e) {
  errors.push(e.message);
} finally {
  await browser.close(); server.close();
}
if (!ok) { console.error('browser smoke test FAILED:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('browser smoke test passed');
