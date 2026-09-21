import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));

await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
if (await page.locator('#start').count()) { await page.evaluate(()=>document.getElementById('start').click()); await page.waitForTimeout(1500); }

console.log('J. Learn screen: double-tap "Got it"');
await page.goto(`${BASE}/#/learn/N5`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
console.log('   header:', (await page.locator('.review-top').innerText()).replace(/\s+/g,' '));
await page.evaluate(() => { const b = document.getElementById('next'); b.click(); b.click(); });
await page.waitForTimeout(1200);
console.log('   after a double tap:', (await page.locator('.review-top').innerText().catch(()=>'(gone)')).replace(/\s+/g,' '));
const logs = await page.evaluate(async () => { const s = await import('./js/store.js'); const r = await s.all('reviews'); return r.map(x=>x.key); });
console.log('   review log entries:', JSON.stringify(logs));
const t = await page.evaluate(async () => { const p = await import('./js/progress.js'); return await p.today(); });
console.log('   today counter new =', t.new);
console.log('   errors:', errs.length?errs:'none'); errs.length=0;

console.log('\nJ2. Review screen: double-tap a grade');
await page.goto(`${BASE}/#/review`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const head = await page.locator('.review-top').innerText().catch(()=>'(none)');
console.log('   header:', head.replace(/\s+/g,' '));
if (await page.locator('#reveal').count()) { await page.evaluate(()=>document.getElementById('reveal').click()); await page.waitForTimeout(600); }
const before = await page.evaluate(async () => { const s = await import('./js/store.js'); return (await s.all('reviews')).length; });
await page.evaluate(() => { const b = document.querySelector('.grade'); b.click(); b.click(); });
await page.waitForTimeout(1200);
const after = await page.evaluate(async () => { const s = await import('./js/store.js'); return (await s.all('reviews')).length; });
console.log(`   review rows ${before} -> ${after} after ONE double-tap`);
console.log('   header now:', (await page.locator('.review-top').innerText().catch(()=>'(gone)')).replace(/\s+/g,' '));
console.log('   errors:', errs.length?errs:'none');
await browser.close();
