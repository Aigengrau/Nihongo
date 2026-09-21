import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
await page.goto(`${BASE}/#/kana`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const header = () => page.locator('#view p').first().innerText();
const prog = () => page.evaluate(() => new Promise(res => { const r = indexedDB.open('nihongo'); r.onsuccess = () => { const q = r.result.transaction('progress','readonly').objectStore('progress').getAll(); q.onsuccess = () => res(q.result); }; }));

// single tap on first cell
await page.locator('.kana-cell:not(.empty)').nth(0).evaluate(el => el.click());
await page.waitForTimeout(300);
console.log('after 1 tap:', (await header()).trim(), '| progress:', JSON.stringify(await prog()));

// switch script then tap another cell (tests duplicate delegated listener)
await page.locator('[data-s="kata"]').evaluate(el => el.click());
await page.waitForTimeout(400);
await page.locator('.kana-cell:not(.empty)').nth(1).evaluate(el => el.click());
await page.waitForTimeout(400);
console.log('after script switch + 1 tap:', (await header()).trim(), '| progress:', JSON.stringify(await prog()));
await page.locator('.kana-cell:not(.empty)').nth(2).evaluate(el => el.click());
await page.waitForTimeout(400);
console.log('after another tap:', (await header()).trim(), '| progress:', JSON.stringify(await prog()));
await browser.close();
