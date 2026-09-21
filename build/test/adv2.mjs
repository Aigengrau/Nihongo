import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

// ---- B: kana "mark known" breaks after switching script
await page.goto(`${BASE}/#/kana`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
const cell = () => page.locator('.kana-cell[data-id]').first();
console.log('B. kana screen');
console.log('   counter before      :', (await page.locator('#view p.small').first().innerText()).trim());
await cell().click(); await page.waitForTimeout(300);
console.log('   after 1 tap (fresh) :', (await page.locator('#view p.small').first().innerText()).trim(), '| data-known=', await cell().getAttribute('data-known'));
await cell().click(); await page.waitForTimeout(300);          // untap to reset
await page.click('[data-s="kata"]'); await page.waitForTimeout(500);
await cell().click(); await page.waitForTimeout(400);
console.log('   after switching to カタカナ then 1 tap:', '| data-known=', await cell().getAttribute('data-known'));
const stored = await page.evaluate(() => new Promise(res => {
  const r = indexedDB.open('nihongo');
  r.onsuccess = () => { const g = r.result.transaction('progress').objectStore('progress').get('kana'); g.onsuccess = () => res(g.result?.known ?? null); };
}));
console.log('   persisted kana.known =', JSON.stringify(stored));
await page.click('[data-s="hira"]'); await page.waitForTimeout(400);
await page.click('[data-s="kata"]'); await page.waitForTimeout(400);
await cell().click(); await page.waitForTimeout(500);
console.log('   after 3 switches, 1 tap -> data-known=', await cell().getAttribute('data-known'));
const stored2 = await page.evaluate(() => new Promise(res => {
  const r = indexedDB.open('nihongo');
  r.onsuccess = () => { const g = r.result.transaction('progress').objectStore('progress').get('kana'); g.onsuccess = () => res(g.result?.known ?? null); };
}));
console.log('   persisted kana.known =', JSON.stringify(stored2));
console.log('   errors:', errs.length ? errs.slice(0,2) : 'none');
await browser.close();
