import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:8099';
const OUT = process.env.TMPOUT || 'build/test/refute';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1200);

// ---- A. raw IndexedDB semantics: does put({...r, id: undefined}) throw? -----
const raw = await page.evaluate(async () => {
  const out = {};
  await new Promise((res) => { const d = indexedDB.deleteDatabase('probe17'); d.onsuccess = d.onerror = d.onblocked = res; });
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open('probe17', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tryPut = (v) => new Promise((res) => {
    let t;
    try { t = db.transaction('reviews', 'readwrite'); } catch (e) { return res('TXFAIL ' + e.name); }
    const st = t.objectStore('reviews');
    let sync = null;
    try { st.put(v); } catch (e) { sync = `SYNC ${e.name}: ${e.message}`; }
    t.oncomplete = () => res(sync || 'ok');
    t.onerror = () => res(sync || `TXERR ${t.error?.name}: ${t.error?.message}`);
    t.onabort = () => res(sync || `ABORT ${t.error?.name}: ${t.error?.message}`);
  });
  out.spreadUndefined = await tryPut({ ...{ id: 7, key: 'a' }, id: undefined });
  out.deleteId = await tryPut((() => { const q = { id: 7, key: 'b' }; delete q.id; return q; })());
  out.rows = await new Promise((res) => { const r = db.transaction('reviews').objectStore('reviews').getAll(); r.onsuccess = () => res(r.result); });
  db.close();
  return out;
});
console.log('A. raw IDB probe:', JSON.stringify(raw, null, 1));

// ---- B. store.js round trip: seed -> export -> wipe -> importAll ------------
const rt = await page.evaluate(async () => {
  const store = await import('/js/store.js');
  await store.open();
  await store.put('cards', { key: 'w:犬', deck: 'N5', due: Date.now(), state: 'review', lastReview: Date.now() });
  await store.put('saved', { key: '犬', added: Date.now() });
  for (let i = 0; i < 3; i++) await store.put('reviews', { key: 'w:犬', at: Date.now() + i, rating: 3 });
  const dump = await store.exportAll();
  const roundTripped = JSON.parse(JSON.stringify(dump)); // exactly what a file gives back
  // wipe everything, as a fresh reinstall would be
  await new Promise((res) => {
    const db = indexedDB.open('nihongo');
    db.onsuccess = () => {
      const d = db.result;
      const t = d.transaction(['cards', 'reviews', 'saved', 'progress'], 'readwrite');
      ['cards', 'reviews', 'saved', 'progress'].forEach((s) => t.objectStore(s).clear());
      t.oncomplete = () => { d.close(); res(); };
    };
  });
  const before = { cards: await store.count('cards'), reviews: await store.count('reviews'), saved: await store.count('saved') };
  let restore = 'ok';
  const timeout = new Promise((r) => setTimeout(() => r('HUNG >8s'), 8000));
  restore = await Promise.race([
    store.importAll(roundTripped, 'merge').then(() => 'ok', (e) => `THREW ${e.name}: ${e.message}`),
    timeout,
  ]);
  const after = { cards: await store.count('cards'), reviews: await store.count('reviews'), saved: await store.count('saved') };
  return { exportedReviewIds: dump.reviews.map((r) => r.id), before, restore, after };
});
console.log('B. store.js round trip:', JSON.stringify(rt, null, 1));

// ---- C. the real UI: Settings -> Restore from a backup ---------------------
const dumpJson = await page.evaluate(async () => {
  const store = await import('/js/store.js');
  await store.put('reviews', { key: 'w:猫', at: Date.now(), rating: 3 });
  await store.put('cards', { key: 'w:猫', deck: 'N5', due: Date.now(), state: 'new' });
  return JSON.stringify(await store.exportAll());
});
const file = path.join(OUT, 'backup17.json');
fs.writeFileSync(file, dumpJson);
console.log('C. backup file reviews:', JSON.parse(dumpJson).reviews.length);

await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
await page.waitForTimeout(1000);
await page.locator('#file').setInputFiles(file);
await page.waitForTimeout(2500);
const toast = await page.locator('.toast, #toast, [class*=toast]').allInnerTexts().catch(() => []);
console.log('C. toast text:', JSON.stringify(toast));
await page.screenshot({ path: path.join(OUT, 'refute17-settings.png') });

const finalCounts = await page.evaluate(async () => {
  const store = await import('/js/store.js');
  return { cards: await store.count('cards'), reviews: await store.count('reviews'), saved: await store.count('saved') };
});
console.log('C. counts after UI restore:', JSON.stringify(finalCounts));

await browser.close();
