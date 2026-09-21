import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
await page.goto(`${BASE}/#/kana`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const prog = () => page.evaluate(() => new Promise(res => { const r = indexedDB.open('nihongo'); r.onsuccess = () => { const q = r.result.transaction('progress','readonly').objectStore('progress').getAll(); q.onsuccess = () => res(q.result); }; }));
const nListeners = () => page.evaluate(() => 'n/a');
for (const [i, sw] of [[0,0],[1,1],[2,2],[3,3]]) {
  // sw = number of script switches performed so far
  await page.locator('.kana-cell:not(.empty)').nth(i+5).evaluate(el => el.click());
  await page.waitForTimeout(350);
  console.log(`after ${sw} script switches, tap cell ${i+5}: progress=`, JSON.stringify(await prog()));
  await page.locator(`[data-s="${sw % 2 ? 'hira' : 'kata'}"]`).evaluate(el => el.click());
  await page.waitForTimeout(350);
}
await browser.close();
