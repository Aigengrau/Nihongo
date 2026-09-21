import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const origin = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(800);
console.log('before:', JSON.stringify(await cdp.send('Storage.getUsageAndQuota', { origin })).slice(0,200));
try { await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: 2 * 1024 * 1024 }); } catch (e) { console.log('override err', e.message); }
const after = await cdp.send('Storage.getUsageAndQuota', { origin });
console.log('after: quota=', after.quota, 'usage=', after.usage, 'overridden=', after.overrideActive);
// try writing a big blob into IDB directly to see if quota bites
const r = await page.evaluate(async () => {
  const d = await new Promise((res, rej) => { const q = indexedDB.open('qtest', 1); q.onupgradeneeded = () => q.result.createObjectStore('s'); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  const big = new Uint8Array(8 * 1024 * 1024);
  try {
    await new Promise((res, rej) => { const t = d.transaction('s', 'readwrite'); t.objectStore('s').put(big, 'k'); t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('abort-no-error')); });
    return 'wrote 8MB OK';
  } catch (e) { return 'FAILED: ' + (e && e.name) + ' ' + (e && e.message); }
});
console.log('big write:', r);
await browser.close();
