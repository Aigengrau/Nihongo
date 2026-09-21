import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`PAGEERROR: ${e.message}`));
// UA-initiated abort (eviction / storage pressure): tx aborts, NO error event.
await page.addInitScript(() => {
  window.__fail = false;
  const realTx = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...a) {
    const t = realTx.apply(this, a);
    if (window.__fail && t.mode === 'readwrite') setTimeout(() => { try { t.abort(); } catch {} }, 0);
    return t;
  };
});
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.evaluate(() => { window.__fail = true; });
const t0 = Date.now();
await page.locator('#start').click();
await page.waitForTimeout(6000);
console.log('A) UA abort, no error event — toast after 6s:',
  JSON.stringify(await page.locator('.toast,#toast').allInnerTexts().catch(() => [])),
  '| elapsed', Date.now() - t0);
console.log('   view:', (await page.locator('#view').innerText()).slice(0, 120).replace(/\s+/g, ' '));
console.log('   logs:', JSON.stringify([...new Set(logs)].slice(0, 5)));

// B) save-a-word path with request-error-style failure
const page2 = await ctx.newPage();
const logs2 = [];
page2.on('console', (m) => logs2.push(`${m.type()}: ${m.text()}`));
await page2.addInitScript(() => {
  window.__fail = false;
  const realPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...a) {
    const req = realPut.apply(this, a);
    if (window.__fail && this.transaction.mode === 'readwrite') {
      const t = this.transaction;
      setTimeout(() => { try { req.dispatchEvent(new Event('error', { bubbles: true })); } catch {} try { t.abort(); } catch {} }, 0);
    }
    return req;
  };
});
await page2.goto(`${BASE}/#/read/s/n5-white-cat`, { waitUntil: 'load' });
await page2.waitForTimeout(2000);
await page2.evaluate(() => { window.__fail = true; });
const tok = page2.locator('#view .tok, #view [data-w], #view ruby').first();
await tok.click().catch(() => {});
await page2.waitForTimeout(900);
const saveBtn = page2.locator('#sheetSave');
console.log('B) word sheet open:', await saveBtn.count());
if (await saveBtn.count()) {
  await saveBtn.click();
  await page2.waitForTimeout(1500);
  console.log('   toast:', JSON.stringify(await page2.locator('.toast,#toast').allInnerTexts().catch(() => [])));
  console.log('   button label now:', await saveBtn.innerText().catch(() => '?'));
  const savedCount = await page2.evaluate(async () => {
    const d = await new Promise((r) => { const q = indexedDB.open('nihongo', 1); q.onsuccess = () => r(q.result); });
    return await new Promise((r) => { const q = d.transaction('saved').objectStore('saved').count(); q.onsuccess = () => r(q.result); });
  });
  console.log('   rows in "saved" store:', savedCount);
  await page2.goto(`${BASE}/#/saved`, { waitUntil: 'load' });
  await page2.waitForTimeout(1500);
  console.log('   /saved screen:', (await page2.locator('#view').innerText()).slice(0, 160).replace(/\s+/g, ' '));
}
console.log('   logs2:', JSON.stringify([...new Set(logs2)].slice(0, 5)));
await browser.close();
