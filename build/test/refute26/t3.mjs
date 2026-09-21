import { chromium, devices } from 'playwright';
const B = 'http://localhost:8125';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'allow' });
const page = await ctx.newPage();
await fetch(`${B}/__ok`);
await page.goto(`${B}/#/levels`, { waitUntil: 'load' });
await page.waitForTimeout(4000);
console.log('caches:', JSON.stringify(await page.evaluate(async () => {
  const o = {}; for (const k of await caches.keys()) o[k] = (await (await caches.open(k)).keys()).length; return o; })));
await ctx.setOffline(true);
const t0 = Date.now();
await page.reload({ waitUntil: 'commit', timeout: 30000 }).catch(e => console.log('ERR', e.message.split('\n')[0]));
console.log('HARD OFFLINE commit after', Date.now() - t0, 'ms');
const title = await page.locator('#appbarTitle').textContent({ timeout: 15000 }).catch(e => 'TIMEOUT');
console.log('title after hard-offline reload:', JSON.stringify(title), 'total', Date.now()-t0, 'ms');
await browser.close();
