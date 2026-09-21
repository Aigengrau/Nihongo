import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`PAGEERROR: ${e.message}`));
await page.addInitScript(() => {
  window.__failWrites = false; window.__aborted = 0;
  const realPut = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...a) {
    const req = realPut.apply(this, a);
    if (window.__failWrites && this.transaction.mode === 'readwrite') {
      const t = this.transaction;
      setTimeout(() => {
        try { req.dispatchEvent(new Event('error', { bubbles: true, cancelable: true })); } catch {}
        try { t.abort(); window.__aborted++; } catch {}
      }, 0);
    }
    return req;
  };
});
// 1. enroll normally (writes work)
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.locator('#start').click();
await page.waitForTimeout(1500);
const before = await page.evaluate(async () => {
  const d = await new Promise((r) => { const q = indexedDB.open('nihongo', 1); q.onsuccess = () => r(q.result); });
  const c = (s) => new Promise((r) => { const q = d.transaction(s).objectStore(s).count(); q.onsuccess = () => r(q.result); });
  return { cards: await c('cards'), reviews: await c('reviews') };
});
console.log('after enroll:', JSON.stringify(before));

// 2. now writes start failing (phone storage full mid-session)
await page.evaluate(() => { window.__failWrites = true; });
logs.length = 0;
await page.goto(`${BASE}/#/learn/N5`, { waitUntil: 'load' }).catch(() => {});
await page.waitForTimeout(1200);
console.log('learn view:', (await page.locator('#view').innerText()).slice(0, 160).replace(/\s+/g, ' '));
// drive whatever grading buttons exist
for (let i = 0; i < 25; i++) {
  const btns = page.locator('#view button:visible, .btn:visible');
  const n = await btns.count();
  let clicked = false;
  for (let j = 0; j < n; j++) {
    const txt = ((await btns.nth(j).innerText().catch(() => '')) || '').trim();
    if (/Good|Easy|Show answer|Got it|Again|Hard|Next|Continue|Start/i.test(txt)) { await btns.nth(j).click().catch(() => {}); clicked = true; break; }
  }
  if (!clicked) break;
  await page.waitForTimeout(160);
}
await page.waitForTimeout(1200);
console.log('aborted txs during session:', await page.evaluate(() => window.__aborted));
console.log('toasts:', JSON.stringify(await page.locator('.toast,#toast').allInnerTexts().catch(() => [])));
console.log('view now:', (await page.locator('#view').innerText()).slice(0, 260).replace(/\s+/g, ' '));
console.log('logs (unique):', JSON.stringify([...new Set(logs)].slice(0, 6)));
const after = await page.evaluate(async () => {
  const d = await new Promise((r) => { const q = indexedDB.open('nihongo', 1); q.onsuccess = () => r(q.result); });
  const c = (s) => new Promise((r) => { const q = d.transaction(s).objectStore(s).count(); q.onsuccess = () => r(q.result); });
  return { cards: await c('cards'), reviews: await c('reviews') };
});
console.log('after grading session:', JSON.stringify(after));
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
console.log('TODAY after:', (await page.locator('#view').innerText()).slice(0, 220).replace(/\s+/g, ' '));
await page.screenshot({ path: 'build/test/shots/rf31-review-fail.png' });
await browser.close();
