import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`PAGEERROR: ${e.message}`));

// Faithful QuotaExceededError simulation: the put request fires a bubbling
// 'error' event (reaching the transaction, as a real quota error does) and the
// transaction is then aborted so nothing is committed. Reads keep working,
// which is exactly the quota-exhausted / evicted-origin situation.
await page.addInitScript(() => {
  window.__failWrites = false;
  window.__abortedTx = 0;
  const realPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...a) {
    const req = realPut.apply(this, a);
    if (window.__failWrites && this.transaction.mode === 'readwrite' && this.name !== 'settings') {
      const t = this.transaction;
      setTimeout(() => {
        try { req.dispatchEvent(new Event('error', { bubbles: true, cancelable: true })); } catch {}
        try { t.abort(); window.__abortedTx++; } catch {}
      }, 0);
    }
    return req;
  };
});

await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__failWrites = true; });

logs.length = 0;
const t0 = Date.now();
await page.locator('#start').click();
await page.waitForTimeout(4000);
console.log('--- after "Start learning" click (', Date.now() - t0, 'ms )');
console.log('TOAST:', JSON.stringify(await page.locator('.toast, #toast').allInnerTexts().catch(() => [])));
console.log('aborted txs:', await page.evaluate(() => window.__abortedTx));
console.log('console/page logs:', JSON.stringify(logs.slice(0, 8)));
console.log('VIEW:', (await page.locator('#view').innerText()).slice(0, 220).replace(/\s+/g, ' '));

const cnt = await page.evaluate(async () => {
  const d = await new Promise((r) => { const q = indexedDB.open('nihongo', 1); q.onsuccess = () => r(q.result); });
  return await new Promise((r) => { const q = d.transaction('cards').objectStore('cards').count(); q.onsuccess = () => r(q.result); q.onerror = () => r('ERR'); });
});
console.log('>>> cards actually persisted:', cnt);

// reload: does the user's "673 words ready" survive?
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
console.log('VIEW after reload:', (await page.locator('#view').innerText()).slice(0, 200).replace(/\s+/g, ' '));
await page.screenshot({ path: 'build/test/shots/rf31-enroll-fail.png' });
await browser.close();
