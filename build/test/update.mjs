// Updating an installed app without reinstalling it.
//
// Serves app/ from this process so the deployed build can be changed mid-test:
// install v1, "deploy" v2, and check that the running app notices, offers the
// update, applies it on a tap, and still has the learner's data afterwards.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');
const PORT = 8123;
const BASE = `http://localhost:${PORT}`;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

let deployed = 1;   // flipped to 2 to simulate a new release
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('no');
  }
  let body = fs.readFileSync(file);
  // Build 2 is a real release: a new BUILD constant, so it gets its own shell
  // and data caches — which is the case where downloaded levels can be lost.
  if (p.endsWith('/sw.js') && deployed === 2) {
    body = Buffer.from(String(body).replace(/const BUILD = '[^']+'/, "const BUILD = 'v0.0.0-next'"));
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'allow' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

// --- install build 1 and save something ---------------------------------
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const controlled = await page.evaluate(() => !!navigator.serviceWorker.controller);
check('build 1 installs and controls the page', controlled);

await page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('nihongo', 1); r.onsuccess = () => res(r.result); });
  db.transaction('saved', 'readwrite').objectStore('saved')
    .put({ key: '猫', word: '猫', reading: 'ねこ', meaning: 'cat', added: Date.now() });
});
check('the update bar is hidden while up to date', await page.locator('#updateBar').isHidden());

// Stand in for "Download this level for offline": a heavy file in the data
// cache that is not part of the core set and would not come back on its own.
await page.evaluate(async () => {
  const c = await caches.open((await caches.keys()).find((k) => k.startsWith('data-')));
  await c.put('./data/levels/n3/vocab.json', new Response('[{"offline":"marker"}]'));
});

const vBefore = await page.evaluate(async () => {
  const m = await import('./js/main.js');
  return m.appVersion();
});
check('settings can read the running build', /^v\d/.test(vBefore || ''), String(vBefore));

const found0 = await page.evaluate(async () => (await import('./js/main.js')).checkForUpdate({ force: true }));
check('checking when there is nothing finds nothing', found0 === false);

// --- deploy build 2 ------------------------------------------------------
deployed = 2;
const found = await page.evaluate(async () => (await import('./js/main.js')).checkForUpdate({ force: true }));
await page.waitForTimeout(800);
check('the app finds the new version by itself', found === true);
check('and only then shows the bar', await page.locator('#updateBar').isVisible());
await page.screenshot({ path: 'build/test/shots/zz-update-bar.png' });

// --- "Later" leaves it alone --------------------------------------------
await page.click('#updateLater');
check('Later dismisses it', await page.locator('#updateBar').isHidden());

await page.evaluate(async () => (await import('./js/main.js')).checkForUpdate({ force: true }));
await page.waitForTimeout(400);
check('a declined update is offered again', await page.locator('#updateBar').isVisible());

// --- apply ---------------------------------------------------------------
const reloaded = page.waitForNavigation({ timeout: 15000 }).catch(() => null);
await page.click('#updateBtn');
await reloaded;
await page.waitForTimeout(2500);

const after = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const db = await new Promise((res) => { const r = indexedDB.open('nihongo', 1); r.onsuccess = () => res(r.result); });
  const saved = await new Promise((res) => {
    const q = db.transaction('saved').objectStore('saved').getAll(); q.onsuccess = () => res(q.result);
  });
  const names = await caches.keys();
  const hit = await caches.match('./data/levels/n3/vocab.json');
  return {
    waiting: !!reg?.waiting, saved: saved.length, caches: names,
    offlineLevel: hit ? await hit.text() : null,
  };
});
check('the new worker took over', after.waiting === false, `caches: ${after.caches.join(', ')}`);
check('the update bar is gone', await page.locator('#updateBar').isHidden());
check('saved words survived the update', after.saved === 1, `${after.saved} saved`);
check('it is a genuinely new build', after.caches.includes('data-v0.0.0-next'), after.caches.join(', '));
check('a downloaded level survived the update', after.offlineLevel === '[{"offline":"marker"}]', String(after.offlineLevel).slice(0, 40));
check('only one shell and one data cache are kept', after.caches.filter((c) => c.startsWith('shell-')).length === 1
  && after.caches.filter((c) => c.startsWith('data-')).length === 1);
check('the app still works', (await page.locator('#view').innerText()).length > 20);

console.log(`\nerrors: ${errs.length ? [...new Set(errs)].join(' | ') : 'none'}`);
console.log(`\n=== update ${fail === 0 && errs.length === 0 ? 'PASS' : `FAIL (${fail})`} ===`);
await browser.close();
server.close();
process.exit(fail || errs.length ? 1 : 0);
