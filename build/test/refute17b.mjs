// Clean version of the UI test: real Review screen -> real backup -> wipe -> real Restore button.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://localhost:8099';
const OUT = 'build/test/refute';
fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1200);

// 1. Do three REAL reviews through the Review screen (no synthetic rows).
await page.goto(`${BASE}/#/learn/N5`, { waitUntil: "load" });
await page.waitForTimeout(1500);
for (let i = 0; i < 3; i++) {
  const btn = page.locator('#next');
  if (await btn.count()) { await btn.click(); await page.waitForTimeout(500); }
}
const seeded = await page.evaluate(async () => {
  const s = await import('/js/store.js');
  return { reviews: await s.count('reviews'), cards: await s.count('cards') };
});
console.log('1. after real reviews:', JSON.stringify(seeded));

// 2. Capture the exact bytes the "Download a backup" button would write.
const json = await page.evaluate(async () => {
  const s = await import('/js/store.js');
  return JSON.stringify(await s.exportAll(), null, 1);
});
const file = path.join(OUT, 'real-backup.json');
fs.writeFileSync(file, json);
const parsed = JSON.parse(json);
console.log('2. backup counts:', JSON.stringify(parsed.counts), 'review ids:', JSON.stringify(parsed.reviews.map((r) => r.id)));

// 3. Wipe every store (a reinstall / iOS eviction).
await page.evaluate(() => new Promise((res) => {
  const r = indexedDB.open('nihongo');
  r.onsuccess = () => {
    const d = r.result;
    const t = d.transaction(['cards', 'reviews', 'saved', 'progress', 'settings'], 'readwrite');
    ['cards', 'reviews', 'saved', 'progress', 'settings'].forEach((s) => t.objectStore(s).clear());
    t.oncomplete = () => { d.close(); res(); };
  };
}));

// 4. Restore through the real Settings UI.
await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const wiped = await page.evaluate(async () => {
  const s = await import('/js/store.js');
  return { cards: await s.count('cards'), reviews: await s.count('reviews'), saved: await s.count('saved'), progress: await s.count('progress') };
});
console.log('3. after wipe:', JSON.stringify(wiped));
await page.locator('#file').setInputFiles(file);
await page.waitForTimeout(2500);
console.log('4. toast:', JSON.stringify(await page.locator('[class*=toast]').allInnerTexts().catch(() => [])));
const after = await page.evaluate(async () => {
  const s = await import('/js/store.js');
  return { cards: await s.count('cards'), reviews: await s.count('reviews'), saved: await s.count('saved'), progress: await s.count('progress') };
});
console.log('5. after restore:', JSON.stringify(after));

// 6. Does the all-time stat the app shows survive? (progress.js history() reads 'reviews')
await page.goto(`${BASE}/#/stats`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const statsTxt = (await page.locator('#view').innerText()).replace(/\s+/g, ' ').slice(0, 300);
console.log('6. stats screen:', statsTxt);
await page.screenshot({ path: path.join(OUT, 'refute17b-stats.png') });
await browser.close();
