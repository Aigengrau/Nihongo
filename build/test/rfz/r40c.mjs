import { chromium, devices } from 'playwright';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
await page.goto('http://localhost:8099/#/today', { waitUntil: 'load' }); await page.waitForTimeout(1500);
const r = await page.evaluate(async () => {
  await new Promise((res) => { const rq = indexedDB.open('__abort40', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('r', { keyPath: 'id' });
    rq.onsuccess = () => { window.__a = rq.result; res(); }; });
  const t = window.__a.transaction('r', 'readwrite');
  t.objectStore('r').add({ id: 1 });
  t.objectStore('r').add({ id: 1 }); // ConstraintError -> aborts the transaction
  const waited = await Promise.race([
    new Promise((res) => { t.oncomplete = () => res('oncomplete fired'); }),
    new Promise((res) => setTimeout(() => res('HUNG: oncomplete never fired after 3s (abort=' + (t.error?.name||'?') + ')'), 3000)),
  ]);
  return waited;
});
console.log('abort-wait pattern ->', r);
await browser.close();
