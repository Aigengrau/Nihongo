import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.argv[2];
const BASE = 'http://localhost:8138';
const P = (r) => path.join(ROOT, r);

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('console', m => { if (m.type()==='error') console.log('  console.err:', m.text().slice(0,120)); });

const caches = () => page.evaluate(() => window.caches.keys());
const getIdx = () => page.evaluate(async () => {
  const r = await fetch('./data/index.json', { cache: 'no-store' });
  const j = await r.json();
  return j.levels[0];
});
const cssMarker = () => page.evaluate(async () => {
  const r = await fetch('./css/app.css', { cache: 'no-store' });
  const t = await r.text();
  const m = /RF27MARKER:(\w+)/.exec(t);
  return m ? m[1] : 'none';
});
const levelsText = async () => (await page.locator('#view').innerText()).replace(/\s+/g,' ').slice(0,160);

console.log('--- PHASE 1: first install ---');
await page.goto(`${BASE}/#/levels`, { waitUntil: 'load' });
await page.waitForTimeout(5000);
console.log('caches:', await caches());
console.log('sw controller:', await page.evaluate(() => !!navigator.serviceWorker.controller));
console.log('index.json levels[0]:', JSON.stringify(await getIdx()));
console.log('css marker:', await cssMarker());
console.log('levels screen:', await levelsText());

console.log('\n--- PHASE 2: ship a new deploy on disk ---');
const idx = JSON.parse(fs.readFileSync(P('data/index.json'), 'utf8'));
idx.levels[0].vocab = 99999;
fs.writeFileSync(P('data/index.json'), JSON.stringify(idx));
fs.appendFileSync(P('css/app.css'), '\n/* RF27MARKER:V2 */\n');
const sw = fs.readFileSync(P('sw.js'), 'utf8').replace("const BUILD = 'v1.0.1'", "const BUILD = 'v2.0.0'");
fs.writeFileSync(P('sw.js'), sw);
console.log('disk: vocab=99999, css RF27MARKER:V2, BUILD=v2.0.0');
console.log('server sees vocab =', JSON.parse(fs.readFileSync(P('data/index.json'),'utf8')).levels[0].vocab);

console.log('\n--- PHASE 3: user reloads ---');
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(4000);
const barVisible = await page.locator('#updateBar').isVisible().catch(()=>false);
console.log('update bar visible:', barVisible);
console.log('reg.waiting:', await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!r?.waiting; }));
console.log('caches:', await caches());

if (barVisible) {
  console.log('\n--- PHASE 4: tap Restart ---');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'load', timeout: 15000 }).catch(()=>console.log('  (no nav event)')),
    page.click('#updateBtn'),
  ]);
  await page.waitForTimeout(4000);
}
console.log('caches:', await caches());
console.log('active sw script BUILD:', await page.evaluate(async () => {
  const r = await fetch('./sw.js', { cache:'no-store' }); const t = await r.text();
  return /const BUILD = '([^']+)'/.exec(t)?.[1];
}));
console.log('css marker (via SW):', await cssMarker());
console.log('index.json levels[0] (via SW):', JSON.stringify(await getIdx()));
await page.goto(`${BASE}/#/levels`, { waitUntil:'load' }); await page.waitForTimeout(2500);
console.log('levels screen:', await levelsText());

console.log('\n--- PHASE 5: hard check, is the stale bytes in the data cache? ---');
console.log(await page.evaluate(async () => {
  const c = await window.caches.open('data-v1');
  const hit = await c.match('./data/index.json', {ignoreSearch:true});
  if (!hit) return 'no data-v1 entry for index.json';
  const j = await hit.json();
  return 'data-v1 cached index.json levels[0].vocab = ' + j.levels[0].vocab;
}));

await browser.close();
