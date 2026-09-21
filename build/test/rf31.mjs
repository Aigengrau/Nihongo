import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

const cdp = await ctx.newCDPSession(page);
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const origin = new URL(BASE).origin;
// Real quota exhaustion: 1 MB quota for the origin. App data (JSON) is cached
// by SW but IDB writes of ~700 cards should blow past a tiny quota.
await cdp.send('Storage.overrideQuotaForOrigin', { origin, quotaSize: 1 });
console.log('quota overridden to 1 byte');
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
console.log('estimate after override:', JSON.stringify(await page.evaluate(() => navigator.storage.estimate())));

logs.length = 0;
const start = page.locator('#start');
console.log('start button present:', await start.count());
await start.click();
await page.waitForTimeout(3000);

const toast = await page.locator('.toast, #toast').allInnerTexts().catch(() => []);
console.log('TOASTS:', JSON.stringify(toast));
console.log('BODY:', (await page.locator('#view').innerText()).slice(0, 400).replace(/\s+/g, ' '));
console.log('LOGS:', JSON.stringify(logs.slice(0, 12), null, 1));

// What actually landed in IDB?
const cnt = await page.evaluate(async () => {
  const d = await new Promise((res, rej) => { const r = indexedDB.open('nihongo', 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const c = await new Promise((res) => { const r = d.transaction('cards').objectStore('cards').count(); r.onsuccess = () => res(r.result); r.onerror = () => res('ERR'); });
  return c;
});
console.log('cards actually in IDB:', cnt);
await page.screenshot({ path: 'build/test/shots/rf31-quota.png' });
await browser.close();
