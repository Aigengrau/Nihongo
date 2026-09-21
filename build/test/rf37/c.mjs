import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

// arm N listeners by tapping the Saved tab N times
const N = 3;
for (let i=0;i<N;i++){
  await page.click('a[href="#/saved"]'); await page.waitForTimeout(800);
  await page.click('a[href="#/today"]'); await page.waitForTimeout(800);
}
async function openReader(){
  await page.evaluate(() => { location.hash = '/read/s/paste'; });
  await page.waitForTimeout(1500);
  await page.fill('#src', '毎朝六時に起きて、コーヒーを飲みます。');
  await page.click('#go');
  await page.waitForTimeout(1800);
  return page.locator('.wchip').count();
}
for (let n=1;n<=N;n++){
  const c = await openReader();
  await page.locator('.wchip').nth(n-1).click();
  await page.waitForTimeout(1000);
  const vis = await page.locator('#sheet').isVisible();
  await page.click('#sheetSave');
  await page.waitForTimeout(1500);
  console.log(`round ${n}: chipsBefore=${c} sheet=${vis} -> hash=${await page.evaluate(()=>location.hash)} chipsAfter=${await page.locator('.wchip').count()} body="${(await page.locator('#view').innerText()).slice(0,50).replace(/\s+/g,' ')}"`);
}
// 4th: all listeners should be consumed now
const c = await openReader();
await page.locator('.wchip').nth(0).click(); await page.waitForTimeout(1000);
await page.click('#sheetSave'); await page.waitForTimeout(1500);
console.log(`round 4 (no listeners left): chipsBefore=${c} chipsAfter=${await page.locator('.wchip').count()} body="${(await page.locator('#view').innerText()).slice(0,50).replace(/\s+/g,' ')}"`);
await browser.close();
