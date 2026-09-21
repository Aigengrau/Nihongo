import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('pageerror', e.message));

// Is Saved a bottom tab?
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
console.log('tabs:', await page.$$eval('#tabbar a, .tabbar a', els => els.map(e=>e.getAttribute('href')+':'+e.innerText.replace(/\s+/g,' ').trim())));

// visit saved 3 times to arm 3 listeners
for (let i=0;i<3;i++){ await page.evaluate(()=>{location.hash='/saved'}); await page.waitForTimeout(700); await page.evaluate(()=>{location.hash='/today'}); await page.waitForTimeout(700); }
await page.evaluate(() => { location.hash = '/read/s/paste'; });
await page.waitForTimeout(1200);
await page.fill('#src', '毎朝六時に起きて、コーヒーを飲みます。');
await page.evaluate(() => document.getElementById('go').click());
await page.waitForTimeout(1200);
console.log('chips:', await page.locator('.wchip').count());
for (let n=1;n<=3;n++){
  const has = await page.locator('.wchip').count();
  if (!has) { console.log(`save #${n}: reader already clobbered (chips=0) -> cannot continue`); break; }
  await page.evaluate((i) => document.querySelectorAll('.wchip')[i].click(), n-1);
  await page.waitForTimeout(900);
  await page.evaluate(() => document.getElementById('sheetSave')?.click());
  await page.waitForTimeout(1200);
  console.log(`after save #${n}: hash=${await page.evaluate(()=>location.hash)} chips=${await page.locator('.wchip').count()} body="${(await page.locator('#view').innerText()).slice(0,40).replace(/\s+/g,' ')}"`);
  if (await page.locator('.wchip').count()===0){
    // go back to reader and redo to see if it clobbers again (second armed listener)
    await page.evaluate(() => { location.hash = '/read/s/paste'; });
    await page.waitForTimeout(1000);
    await page.fill('#src', '毎朝六時に起きて、コーヒーを飲みます。');
    await page.evaluate(() => document.getElementById('go').click());
    await page.waitForTimeout(1200);
  }
}
await browser.close();
