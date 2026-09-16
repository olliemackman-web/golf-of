// Boots the real game in headless Chromium and fails on any page error.
// `npm run test:browser`. Needs `npx playwright install chromium` once on a machine
// that has not got a Playwright browser already. Set SMOKE_SHOT=out.png to save a screenshot.
/* global window, document, WheelEvent */
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

  // Putting: a drag sets pace and line but does not commit; PUTT commits; the accuracy bar waits for the strike.
  await page.evaluate(() => { const g = window.__game, pin = g.L.pin; g.newHole(); g.ball.place(pin.x + 3, pin.z); g.autoClub(); g.solvePlan(); g.enterAim(); g.step(0.3); });
  const before = await page.evaluate(() => ({ state: window.__game.state, club: window.__game.club.id, power: window.__game.planPower }));
  if (before.club !== 'PT') errors.push(`expected the putter on the green, got ${before.club}`);
  const vp = page.viewportSize(); const cx = vp.width / 2, cy = vp.height / 2;
  await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx, cy + 120, { steps: 6 }); await page.mouse.up();
  const after = await page.evaluate(() => { const g = window.__game; g.step(0.2); return { state: g.state, power: g.planPower }; });
  if (after.state !== 'aim') errors.push(`releasing the putting drag committed the putt (state ${after.state})`);
  if (!(after.power > before.power)) errors.push(`pulling back did not raise the pace (${before.power} -> ${after.power})`);
  const acc = await page.evaluate(() => { const g = window.__game; g.action(); g.step(0.2); const a = { state: g.state, phase: g.swing.phase }; g.step(12); a.later = g.swing.phase; g.action(); g.step(2); a.final = g.state; return a; });
  if (acc.state !== 'swing' || acc.phase !== 'acc') errors.push(`PUTT did not open the accuracy bar (${acc.state}/${acc.phase})`);
  if (acc.later !== 'acc') errors.push(`accuracy bar did not wait for the strike (phase ${acc.later} after 12s)`);
  if (acc.final === 'swing' || acc.final === 'aim') errors.push(`strike did not send the putt (state ${acc.final})`);
  console.log(`putting: drag kept aim (pace ${before.power.toFixed(2)} -> ${after.power.toFixed(2)}), PUTT opened the accuracy bar, it waited 12s, strike -> "${acc.final}"`);

  // Aim zoom: the wheel narrows the field of view, the ZOOM button cycles presets, and a drag turns the aim less when zoomed.
  const zoom = await page.evaluate(() => {
    const g = window.__game; g.newHole(); g.enterAim(); g.step(0.2);
    const fov0 = g.camera.fov;
    g.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -400, bubbles: true }));
    const wheel = { zoom: g.aimZoom, fov: g.camera.fov };
    g.setAimZoom(1); document.getElementById('btnZoom').click(); const btn = { zoom: g.aimZoom, label: document.getElementById('btnZoom').textContent };
    return { fov0, wheel, btn };
  });
  if (!(zoom.wheel.zoom > 1.5 && Math.abs(zoom.wheel.fov - zoom.fov0 / zoom.wheel.zoom) < 0.01)) errors.push(`wheel zoom did not narrow the view: ${JSON.stringify(zoom)}`);
  if (!(zoom.btn.zoom > 1 && zoom.btn.label.endsWith('×'))) errors.push(`zoom button did not cycle: ${JSON.stringify(zoom.btn)}`);
  const turn = async () => { const y0 = await page.evaluate(() => window.__game.aimYaw); await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 120, cy, { steps: 4 }); await page.mouse.up(); return Math.abs(await page.evaluate(() => window.__game.aimYaw) - y0); };
  await page.evaluate(() => window.__game.setAimZoom(1)); const turn1 = await turn();
  await page.evaluate(() => window.__game.setAimZoom(4)); const turn4 = await turn();
  await page.evaluate(() => window.__game.setAimZoom(1));
  if (!(turn1 > 0 && turn4 < turn1 * 0.35)) errors.push(`aim drag did not get finer when zoomed (${turn1.toFixed(4)} vs ${turn4.toFixed(4)} rad)`);
  console.log(`aim zoom: wheel -> ${zoom.wheel.zoom.toFixed(2)}× (fov ${zoom.fov0} -> ${zoom.wheel.fov.toFixed(1)}), button -> ${zoom.btn.label}, drag turn ${turn1.toFixed(3)} rad at 1× vs ${turn4.toFixed(3)} at 4×`);

  // Full shot: ball cam takes over on launch, and the accuracy label reads as a band.
  const full = await page.evaluate(() => {
    const g = window.__game; g.newHole(); g.enterAim(); g.step(0.2); g.enterAddress(); g.step(1.2); g.action(); g.step(0.5); g.action(); g.step(0.3);
    const label = document.getElementById('apct').textContent; g.action(); g.step(1.0);
    return { label, cam: g.camMode, state: g.state, tag: document.getElementById('camtag').textContent };
  });
  if (!/^(GOLD|GREEN|AMBER|RED) · \d+%$/.test(full.label)) errors.push(`accuracy label is "${full.label}", expected a band`);
  if (full.cam !== 'chase' || full.tag !== 'BALL CAM') errors.push(`full shot did not switch to the ball cam (${full.cam}, tag "${full.tag}", state ${full.state})`);
  console.log(`full shot: accuracy "${full.label}", camera ${full.cam} (${full.tag})`);

  // Pro shop coupon 1210 maxes every upgrade; a player code round-trips through export/import.
  const shop = await page.evaluate(() => {
    const g = window.__game; g.newHole(); g.enterAim(); g.openShop();
    const input = document.getElementById('coupon'); input.value = '1210'; document.getElementById('redeem').click();
    const msg = document.getElementById('couponMsg').textContent; const ups = { ...g.profile.upgrades };
    g.menus.close();
    const code = g.store.exportCode(g.profile); g.store.remove(g.profile.name); const back = g.store.importCode(code);
    return { msg, ups, code: code.slice(0, 12), restored: back && back.name === g.profile.name && back.upgrades.power === 5 && back.coins === g.profile.coins };
  });
  if (!Object.values(shop.ups).every((v) => v === 5)) errors.push(`coupon did not max upgrades: ${JSON.stringify(shop.ups)} (${shop.msg})`);
  if (!shop.restored) errors.push('player code did not round-trip');
  console.log(`shop: "${shop.msg}", upgrades ${Object.values(shop.ups).join('')}, player code ${shop.code}… restored ${shop.restored}`);
  if (process.env.SMOKE_SHOT) { await page.screenshot({ path: process.env.SMOKE_SHOT, timeout: 180000 }); console.log('screenshot ' + process.env.SMOKE_SHOT); }
  ok = errors.length === 0;
} catch (e) {
  errors.push(e.message);
} finally {
  await browser.close(); server.close();
}
if (!ok) { console.error('browser smoke test FAILED:\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('browser smoke test passed');
