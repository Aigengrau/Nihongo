import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const N = 3;
for (let i=0;i<N;i++){
  await page.click('a[href="#/saved"]'); await page.waitForTimeout(900);
  await page.click('a[href="#/today"]'); await page.waitForTimeout(900);
}
console.log('armed', N, 'visits to #/saved');
const texts = ['毎朝六時に起きます。','公園まで歩いて行きました。','日本語の勉強は楽しいです。','図書館で本を読みました。'];
for (let n=0;n<4;n++){
  await page.evaluate(() => { location.hash = '/read/s/paste'; });
  await page.waitForTimeout(1500);
  await page.fill('#src', texts[n]);
  await page.click('#go'); await page.waitForTimeout(1800);
  const c = await page.locator('.wchip').count();
  // find a chip that yields a save button
  let ok=false;
  for (let i=0;i<c;i++){
    await page.locator('.wchip').nth(i).click(); await page.waitForTimeout(800);
    if (await page.locator('#sheetSave').count()) { ok=true; break; }
    await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  }
  if(!ok){ console.log(`round ${n+1}: no savable chip`); continue; }
  await page.click('#sheetSave'); await page.waitForTimeout(1600);
  console.log(`round ${n+1}: chipsBefore=${c} -> hash=${await page.evaluate(()=>location.hash)} title="${await page.locator('#appbarTitle').innerText()}" chipsAfter=${await page.locator('.wchip').count()} body="${(await page.locator('#view').innerText()).slice(0,45).replace(/\s+/g,' ')}"`);
}
await browser.close();
