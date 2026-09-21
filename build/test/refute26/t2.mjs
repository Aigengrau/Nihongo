import { chromium, devices } from 'playwright';
const B = 'http://localhost:8125';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'allow' });
const page = await ctx.newPage();

await page.goto(`${B}/#/levels`, { waitUntil: 'load' });
await page.waitForTimeout(4000);
console.log('caches:', JSON.stringify(await page.evaluate(async () => {
  const o = {}; for (const k of await caches.keys()) o[k] = (await (await caches.open(k)).keys()).length; return o; })));

// Flip server into hang mode (control endpoint still answers)
await fetch(`${B}/__hang`).then(r => r.text()).then(t => console.log('server mode:', t));

// stamp marker
await page.evaluate(() => { window.__AUDIT_DOC = 'stamp-' + Math.random(); });
const before = await page.evaluate(() => window.__AUDIT_DOC);

// REAL cross-document navigation: reload
const t0 = Date.now();
let navErr = null;
await page.reload({ waitUntil: 'commit', timeout: 70000 }).catch(e => { navErr = e.message.split('\n')[0]; });
const tCommit = Date.now() - t0;
console.log(`reload commit after ${tCommit}ms`, navErr ? ('ERR: ' + navErr) : '');

// poll marker for up to 60s
let gone = null;
for (let i = 0; i < 60; i++) {
  const v = await page.evaluate(() => window.__AUDIT_DOC ?? null).catch(() => 'EVALERR');
  if (v !== before) { gone = { i, v, ms: Date.now() - t0 }; break; }
  await new Promise(r => setTimeout(r, 1000));
}
console.log('marker change:', JSON.stringify(gone));

// Did the app actually render from cache?
const title = await page.locator('#appbarTitle').textContent({ timeout: 65000 }).catch(e => 'TIMEOUT:' + e.message.split('\n')[0]);
const bodyLen = await page.evaluate(() => document.body.innerText.length).catch(() => -1);
console.log('total elapsed', Date.now() - t0, 'ms; appbarTitle =', JSON.stringify(title), '; body chars =', bodyLen);
await page.screenshot({ path: 'build/test/refute26/t2.png' });
await browser.close();
