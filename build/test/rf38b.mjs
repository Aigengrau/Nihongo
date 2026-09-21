import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();

// real user gesture: tap the bottom tab bar instead of setting location.hash
await page.goto(`${BASE}/#/conjugate/N5`, { waitUntil: 'load' });
await page.waitForSelector('#opts .btn', { timeout: 15000 });
await page.locator('#opts .btn').first().tap();
await page.locator('[data-tab="stats"]').tap();          // real tap on tab bar
await page.waitForTimeout(2500);
console.log('title=', await page.locator('#appbarTitle').textContent());
console.log('hash=', await page.evaluate(() => location.hash));
console.log('view:', (await page.locator('#view').innerText()).slice(0,90).replace(/\s+/g,' '));
// the ghost drill is still interactive on Stats:
await page.locator('#view #opts .btn').first().tap();
await page.waitForTimeout(1800);
console.log('after tapping the ghost drill while on Stats, hash=', await page.evaluate(()=>location.hash));
console.log('view:', (await page.locator('#view').innerText()).slice(0,90).replace(/\s+/g,' '));

// kana: can you still scroll Today after the quiz timer re-locks it?
await page.goto(`${BASE}/#/kana`, { waitUntil: 'load' });
await page.waitForSelector('#quiz');
await page.locator('#quiz').tap();
await page.waitForSelector('#sheetBody #opts .btn');
await page.locator('#sheetBody #opts .btn').first().click({force:true});
await page.locator('[data-tab="today"]').tap();
await page.waitForTimeout(1500);
console.log('\nsheet visible over Today:', await page.locator('#sheet').isVisible(),
  ' overflow=', JSON.stringify(await page.evaluate(()=>document.body.style.overflow)));
// dismiss it, then see whether another orphan timer exists
await page.locator('#sheetBody [data-close]').click({force:true});
await page.waitForTimeout(300);
console.log('after Stop: sheet visible=', await page.locator('#sheet').isVisible(),
  ' overflow=', JSON.stringify(await page.evaluate(()=>document.body.style.overflow)));
await browser.close();
