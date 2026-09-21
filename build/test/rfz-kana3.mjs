import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const readDB = () => page.evaluate(() => new Promise(res => {
  const r = indexedDB.open('nihongo');
  r.onsuccess = () => { const g = r.result.transaction('progress').objectStore('progress').get('kana'); g.onsuccess = () => res(g.result?.known ?? null); };
}));
const cell = (n=0) => page.locator('.kana-cell[data-id]').nth(n);

await page.goto(`${BASE}/#/kana`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
await cell(0).click(); await page.waitForTimeout(400);
console.log('visit1 tap cell0 -> db=', JSON.stringify(await readDB()));
// navigate away and back (no script switch at all)
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' }).catch(()=>{});
await page.evaluate(() => location.hash = '#/today'); await page.waitForTimeout(900);
await page.evaluate(() => location.hash = '#/kana'); await page.waitForTimeout(1500);
console.log('visit2 counter:', (await page.locator('#view p.small').first().innerText()).trim());
await cell(1).click(); await page.waitForTimeout(600);
console.log('visit2 tap cell1 -> data-known=', await cell(1).getAttribute('data-known'), 'db=', JSON.stringify(await readDB()));
await page.evaluate(() => location.hash = '#/today'); await page.waitForTimeout(900);
await page.evaluate(() => location.hash = '#/kana'); await page.waitForTimeout(1500);
await cell(2).click(); await page.waitForTimeout(600);
console.log('visit3 tap cell2 -> data-known=', await cell(2).getAttribute('data-known'), 'db=', JSON.stringify(await readDB()));
await browser.close();
