import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));

await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

// A. raw IndexedDB semantics, independent of the app: autoIncrement + keyPath 'id'
const raw = await page.evaluate(async () => {
  const out = {};
  await new Promise((res, rej) => {
    const rq = indexedDB.open('__probe40', 1);
    rq.onupgradeneeded = () => rq.result.createObjectStore('r', { keyPath: 'id', autoIncrement: true });
    rq.onsuccess = () => { window.__p = rq.result; res(); };
    rq.onerror = () => rej(rq.error);
  });
  const st = () => window.__p.transaction('r', 'readwrite').objectStore('r');
  try { st().put({ ...{ id: 7, a: 1 }, id: undefined }); out.spreadUndefined = 'no throw'; }
  catch (e) { out.spreadUndefined = e.name + ': ' + e.message; }
  try { const { id, ...rest } = { id: 7, a: 1 }; st().put(rest); out.stripped = 'no throw'; }
  catch (e) { out.stripped = e.name + ': ' + e.message; }
  out.hasOwn = Object.prototype.hasOwnProperty.call({ ...{id:7}, id: undefined }, 'id');
  return out;
});
console.log('A. raw IDB probe:', JSON.stringify(raw, null, 1));

// B. build real history
if (await page.locator('#start').count()) { await page.evaluate(()=>document.getElementById('start').click()); await page.waitForTimeout(1500); }
await page.evaluate(() => { location.hash = '/learn/N5'; });
await page.waitForTimeout(2500);
for (let i=0;i<3;i++){ await page.evaluate(()=>document.getElementById('next')?.click()); await page.waitForTimeout(500); }
const dump = await page.evaluate(async () => (await (await import('./js/store.js')).exportAll()));
console.log('B. exported counts:', JSON.stringify(dump.counts), 'first review id:', dump.reviews[0]?.id, 'keys:', Object.keys(dump.reviews[0]||{}).join(','));

// C. merge — the ONLY mode the Settings screen uses
const merge = await page.evaluate(async (d) => {
  const s = await import('./js/store.js');
  try { await s.importAll(d, 'merge'); return 'resolved true'; } catch (e) { return 'THREW ' + e.name + ': ' + e.message; }
}, dump);
const afterMerge = await page.evaluate(async () => (await (await import('./js/store.js')).exportAll()).counts);
console.log('C. importAll(merge) ->', merge, '| counts now', JSON.stringify(afterMerge));

// D. replace
const rep = await page.evaluate(async (d) => {
  const s = await import('./js/store.js');
  try { await s.importAll(d, 'replace'); return 'resolved true'; } catch (e) { return 'THREW ' + e.name + ': ' + e.message; }
}, dump);
const afterRep = await page.evaluate(async () => (await (await import('./js/store.js')).exportAll()).counts);
console.log('D. importAll(replace) ->', rep, '| counts now', JSON.stringify(afterRep));

// E. does the proposed fix work?
const fix = await page.evaluate(async (d) => {
  const s = await import('./js/store.js');
  // emulate fixed line directly against the real db
  return await new Promise((res) => {
    const rq = indexedDB.open('nihongo');
    rq.onsuccess = () => {
      const db = rq.result; const t = db.transaction('reviews','readwrite'); const st = t.objectStore('reviews');
      try { d.reviews.forEach(r => { const { id, ...rest } = r; st.put(rest); }); } catch (e) { return res('THREW ' + e.name); }
      t.oncomplete = () => { const t2 = db.transaction('reviews').objectStore('reviews').count(); t2.onsuccess = () => res('ok, reviews now ' + t2.result); };
      t.onerror = () => res('tx error ' + t.error?.name);
    };
  });
}, dump);
console.log('E. stripped-key variant ->', fix);
console.log('pageerrors:', errs.length ? errs : 'none');
await browser.close();
