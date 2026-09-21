import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099', origin = BASE;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(600);
await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: 1024 });
const out = await page.evaluate(async () => {
  const d = await new Promise((res, rej) => { const q = indexedDB.open('qtest2', 1); q.onupgradeneeded = () => q.result.createObjectStore('s'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const big = new Uint8Array(4 * 1024 * 1024);
  for (let i = 0; i < 12; i++) {
    try {
      await new Promise((res, rej) => { const t = d.transaction('s', 'readwrite'); t.objectStore('s').put(big, 'k' + i); t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort')); });
    } catch (e) { return `failed at iter ${i}: ${e.name}: ${e.message}`; }
  }
  return 'wrote 48MB with 1KB quota — not enforced';
});
console.log(out);
await browser.close();
