import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));

// Build some real history: enroll N5 and do a couple of reviews
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
if (await page.locator('#start').count()) { await page.evaluate(()=>document.getElementById('start').click()); await page.waitForTimeout(1500); }
await page.evaluate(() => { location.hash = '/learn/N5'; });
await page.waitForTimeout(2500);
for (let i=0;i<3;i++){ await page.evaluate(()=>document.getElementById('next')?.click()); await page.waitForTimeout(500); }
const dump = await page.evaluate(async () => { const s = await import('./js/store.js'); return await s.exportAll(); });
console.log('H. exported backup counts:', JSON.stringify(dump.counts), 'reviews sample id:', dump.reviews[0]?.id);

// Now restore it, exactly as the Settings screen does
const res = await page.evaluate(async (d) => {
  const s = await import('./js/store.js');
  try { await s.importAll(d, 'merge'); return 'ok'; } catch (e) { return 'THREW ' + e.name + ': ' + e.message; }
}, dump);
console.log('   importAll(merge) ->', res);
const after = await page.evaluate(async () => { const s = await import('./js/store.js'); return (await s.exportAll()).counts; });
console.log('   counts after restore:', JSON.stringify(after));

const res2 = await page.evaluate(async (d) => {
  const s = await import('./js/store.js');
  try { await s.importAll(d, 'replace'); return 'ok'; } catch (e) { return 'THREW ' + e.name + ': ' + e.message; }
}, dump);
console.log('   importAll(replace) ->', res2);
const after2 = await page.evaluate(async () => { const s = await import('./js/store.js'); return (await s.exportAll()).counts; });
console.log('   counts after replace:', JSON.stringify(after2));
console.log('   errors:', errs.length?errs:'none');
await browser.close();
