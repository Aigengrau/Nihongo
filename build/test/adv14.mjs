import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));

console.log('K. word sheet save/unsave in one sitting');
await page.goto(`${BASE}/#/read/s/paste`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
await page.fill('#src', '今日は天気がいいので、公園まで歩いて行きました。');
await page.evaluate(()=>document.getElementById('go').click());
await page.waitForTimeout(1200);
await page.evaluate(()=>document.querySelector('.wchip').click());
await page.waitForTimeout(1000);
const btn = page.locator('#sheetSave');
console.log('   button:', (await btn.innerText()).trim());
await page.evaluate(()=>document.getElementById('sheetSave').click());
await page.waitForTimeout(700);
console.log('   after 1st tap:', (await btn.innerText()).trim());
const n1 = await page.evaluate(async()=>{const s=await import('./js/store.js');return (await s.all('saved')).length;});
await page.evaluate(()=>document.getElementById('sheetSave').click());   // "remove"
await page.waitForTimeout(900);
console.log('   after tapping "★ Saved — remove":', (await btn.innerText()).trim());
const n2 = await page.evaluate(async()=>{const s=await import('./js/store.js');return (await s.all('saved')).map(x=>x.key);});
console.log(`   saved rows: ${n1} -> ${JSON.stringify(n2)} (expected the word to be removed)`);
console.log('   errors:', errs.length?errs:'none');
await browser.close();
