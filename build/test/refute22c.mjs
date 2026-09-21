// Realistic round-trip: export a real backup, then restore it. Normal IndexedDB.
import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(700);

const out = await page.evaluate(async () => {
  const store = await import('/js/store.js');
  const srs = await import('/js/srs.js');
  let c = srs.newCard('w:RT', 'N5');
  for (const r of [3, 3, 1]) {
    const { card, log } = srs.review(c, r);
    c = card;
    await store.put('cards', card);
    await store.put('reviews', log);
  }
  const backup = await store.exportAll();
  const sampleRow = backup.reviews[0];
  let restore, after;
  try {
    restore = String(await store.importAll(JSON.parse(JSON.stringify(backup)), 'merge'));
  } catch (e) { restore = 'THREW: ' + e.message; }
  after = (await store.all('reviews')).length;
  return { exportedReviews: backup.reviews.length, sampleRowKeys: Object.keys(sampleRow), restore, reviewsAfter: after };
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
