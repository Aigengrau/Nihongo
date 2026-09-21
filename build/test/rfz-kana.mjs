import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

const readDB = () => page.evaluate(() => new Promise(res => {
  const r = indexedDB.open('nihongo');
  r.onsuccess = () => { const g = r.result.transaction('progress').objectStore('progress').get('kana'); g.onsuccess = () => res(g.result?.known ?? null); };
}));
const counter = async () => (await page.locator('#view p.small').first().innerText()).trim();
const cell = () => page.locator('.kana-cell[data-id]').first();
const nHandlers = () => page.evaluate(() => {
  // count listeners is not directly possible; instead instrument via a probe
  return null;
});

await page.goto(`${BASE}/#/kana`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
console.log('fresh counter:', await counter());
await cell().click(); await page.waitForTimeout(400);
console.log('tap1 (no switch): data-known=', await cell().getAttribute('data-known'), '| counter=', await counter(), '| db=', JSON.stringify(await readDB()));

// now switch to katakana ONCE
await page.click('[data-s="kata"]'); await page.waitForTimeout(600);
console.log('after switch counter:', await counter());
const before = JSON.stringify(await readDB());
await cell().click(); await page.waitForTimeout(600);
console.log('tap2 (after 1 switch): data-known=', await cell().getAttribute('data-known'), '| db before=', before, 'after=', JSON.stringify(await readDB()));

// tap a DIFFERENT cell, fresh one
const c2 = page.locator('.kana-cell[data-id]').nth(3);
await c2.click(); await page.waitForTimeout(600);
console.log('tap on cell#3 after 1 switch: data-known=', await c2.getAttribute('data-known'), '| db=', JSON.stringify(await readDB()));

// switch again (2 switches -> 3 handlers)
await page.click('[data-s="hira"]'); await page.waitForTimeout(600);
const c4 = page.locator('.kana-cell[data-id]').nth(5);
await c4.click(); await page.waitForTimeout(600);
console.log('tap on cell#5 after 2 switches: data-known=', await c4.getAttribute('data-known'), '| db=', JSON.stringify(await readDB()));
console.log('counter now:', await counter());

// reload -> does the counter reflect anything?
await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(2000);
console.log('after reload counter:', await counter(), '| db=', JSON.stringify(await readDB()));
console.log('errors:', errs.length ? errs.slice(0,3) : 'none');
await browser.close();
