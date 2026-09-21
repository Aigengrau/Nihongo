import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const texts = ['毎朝六時に起きます。','公園まで歩いて行きました。','日本語の勉強は楽しいです。'];
async function closeSheet(){ await page.evaluate(()=>document.querySelector('#sheet [data-close]')?.click()); await page.waitForTimeout(500); }
for (let n=0;n<3;n++){
  await closeSheet();
  await page.click('a[href="#/saved"]'); await page.waitForTimeout(1200);
  await page.evaluate(() => { location.hash = '/read/s/paste'; }); await page.waitForTimeout(1500);
  await page.fill('#src', texts[n]); await page.click('#go'); await page.waitForTimeout(1800);
  const c = await page.locator('.wchip').count();
  let ok=false;
  for (let i=0;i<c;i++){
    await page.locator('.wchip').nth(i).click(); await page.waitForTimeout(700);
    if (await page.locator('#sheetSave').count()) { const t=await page.locator('#sheetSave').innerText(); if(t.includes('Save to')){ok=true;break;} }
    await closeSheet();
  }
  if(!ok){ console.log(`cycle ${n+1}: no savable chip`); continue; }
  await page.click('#sheetSave'); await page.waitForTimeout(1600);
  console.log(`cycle ${n+1}: chipsBefore=${c} chipsAfter=${await page.locator('.wchip').count()} CLOBBERED=${await page.locator('.wchip').count()===0}`);
}
await browser.close();
