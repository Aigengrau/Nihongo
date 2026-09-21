import { chromium, devices } from 'playwright';
const B = 'http://localhost:8125';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'allow' });
const page = await ctx.newPage();
await page.goto(`${B}/#/levels`, { waitUntil: 'load' });
await page.waitForTimeout(4000);
console.log('caches:', JSON.stringify(await page.evaluate(async () => {
  const o = {}; for (const k of await caches.keys()) o[k] = (await (await caches.open(k)).keys()).length; return o; })));
console.log('mode:', await (await fetch(`${B}/__404`)).text());
const r = await page.reload({ waitUntil: 'load', timeout: 20000 }).catch(e => null);
console.log('HTTP status seen by page:', r && r.status());
console.log('body:', JSON.stringify((await page.evaluate(() => document.body.innerText)).slice(0,120)));
await browser.close();
