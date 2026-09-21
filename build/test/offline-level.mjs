import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'allow' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('!! pageerror', e.message));

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(2500);                      // let the SW install + warm core data
await page.goto(`${BASE}/#/level/N3`, { waitUntil: 'load' });
await page.waitForTimeout(1200);

console.log('clicking "Download N3 for offline"…');
await page.click('#dl');
await page.waitForTimeout(6000);
console.log('button now says:', await page.locator('#dl').textContent());

const caches0 = await page.evaluate(async () => {
  // the data cache is versioned with the build, so enumerate rather than guess
  const out = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith('data-')) continue;
    for (const r of await (await caches.open(name)).keys()) out.push(new URL(r.url).pathname);
  }
  return out.filter((p) => p.includes('n3') || p.includes('sentences') || p.includes('conjug'));
});
console.log('n3/shared entries cached:', caches0.length);
caches0.slice(0, 8).forEach((p) => console.log('   ', p));

console.log('\ngoing offline, opening N3 words + an N3 story…');
await ctx.setOffline(true);
await page.goto(`${BASE}/#/words/N3`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
console.log('   N3 words rows:', await page.locator('.wrow').count());
await page.goto(`${BASE}/#/read/s/n3-old-notebook`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
const chips = await page.locator('.wchip').count();
console.log('   N3 story tappable words:', chips);
await page.goto(`${BASE}/#/conjugate/N3`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
const hasDrill = await page.locator('.review-card').count();
console.log('   N3 conjugation drill rendered:', hasDrill > 0);
console.log(`\n=== ${caches0.length > 3 && chips > 0 && hasDrill > 0 ? 'PASS' : 'FAIL'} ===`);
await browser.close();
