import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const N = 3;
for (let i=0;i<N;i++){ await page.click('a[href="#/saved"]'); await page.waitForTimeout(900); await page.click('a[href="#/today"]'); await page.waitForTimeout(900); }
console.log('armed by', N, 'visits to #/saved');
const texts = ['毎朝六時に起きます。','公園まで歩いて行きました。','日本語の勉強は楽しいです。','図書館で本を読みました。'];
for (let n=0;n<4;n++){
  await page.evaluate(() => { location.hash = '/today'; }); await page.waitForTimeout(900);
  await page.evaluate(() => { location.hash = '/read/s/paste'; }); await page.waitForTimeout(1500);
  await page.fill('#src', texts[n]);
  await page.click('#go'); await page.waitForTimeout(1800);
  const c = await page.locator('.wchip').count();
  let ok=false;
  for (let i=0;i<c;i++){
    await page.locator('.wchip').nth(i).click(); await page.waitForTimeout(700);
    if (await page.locator('#sheetSave').count()) { ok=true; break; }
    await page.evaluate(()=>document.querySelector('#sheet [data-close], #sheetClose')?.click());
    await page.waitForTimeout(300);
  }
  if(!ok){ console.log(`round ${n+1}: no savable chip`); continue; }
  await page.click('#sheetSave'); await page.waitForTimeout(1600);
  console.log(`round ${n+1}: chipsBefore=${c} chipsAfter=${await page.locator('.wchip').count()} clobbered=${(await page.locator('#view').innerText()).includes('saved')}`);
}
await browser.close();
