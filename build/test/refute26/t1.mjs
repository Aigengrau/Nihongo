import { chromium, devices } from 'playwright';
const B = 'http://localhost:8125';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'allow' });
const page = await ctx.newPage();

await page.goto(`${B}/#/levels`, { waitUntil: 'load' });
await page.waitForTimeout(4000);
const caches1 = await page.evaluate(async () => {
  const o = {}; for (const k of await caches.keys()) o[k] = (await (await caches.open(k)).keys()).length; return o;
});
console.log('caches after warm:', JSON.stringify(caches1));
const swOk = await page.evaluate(() => !!navigator.serviceWorker.controller);
console.log('controlled by SW:', swOk);

// --- CONTROL: reviewer's exact repro but with the server still HEALTHY ---
await page.evaluate(() => { window.__AUDIT_DOC = 'ctrl-' + Math.random(); });
const before = await page.evaluate(() => window.__AUDIT_DOC);
await page.goto(`${B}/#/today`, { waitUntil: 'load' }).catch(e => console.log('goto err', e.message));
await page.waitForTimeout(1500);
const after = await page.evaluate(() => window.__AUDIT_DOC ?? null);
console.log('CONTROL (healthy server) hash goto: before=', before, ' after=', after,
  after === before ? ' -> SAME DOCUMENT (no commit) even though network is FINE' : ' -> document reloaded');
await browser.close();
