import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));

// 1. Visit Saved tab (arms the one-shot listener)
await page.goto(`${BASE}/#/saved`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
console.log('saved screen text:', (await page.locator('#view').innerText()).slice(0,60).replace(/\s+/g,' '));

// 2. Navigate elsewhere - use the story reader instead of paste, to vary from reviewer repro
await page.evaluate(() => { location.hash = '/read/s/paste'; });
await page.waitForTimeout(1500);
await page.fill('#src', '今日は天気がいいので、公園まで歩いて行きました。');
await page.evaluate(() => document.getElementById('go').click());
await page.waitForTimeout(1500);
const chips = await page.locator('.wchip').count();
console.log('reader chips:', chips);
const beforeTitle = await page.locator('#appbarTitle').innerText();
const beforeBody = (await page.locator('#view').innerText()).slice(0,60).replace(/\s+/g,' ');
console.log('BEFORE save: hash=', await page.evaluate(()=>location.hash), 'title=', beforeTitle, '| body=', beforeBody);

await page.evaluate(() => document.querySelector('.wchip').click());
await page.waitForTimeout(1200);
console.log('sheet visible:', await page.locator('#sheet').isVisible());
await page.evaluate(() => document.getElementById('sheetSave').click());
await page.waitForTimeout(2000);
console.log('AFTER save: hash=', await page.evaluate(()=>location.hash),
            'title=', await page.locator('#appbarTitle').innerText());
console.log('AFTER body:', (await page.locator('#view').innerText()).slice(0,100).replace(/\s+/g,' '));
console.log('#src count:', await page.locator('#src').count(), ' .wchip count:', await page.locator('.wchip').count());
console.log('errors:', errs.length?errs:'none');
await page.screenshot({path:'build/test/rf37/a.png', fullPage:false});
await browser.close();
