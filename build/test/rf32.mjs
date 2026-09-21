import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
const page = await ctx.newPage();
let n = 0, aborted = 0;
await ctx.route('**/data/dict/common.json', async (route) => {
  n++;
  if (n === 1) { aborted++; await route.abort('failed'); }
  else await route.continue();
});
const logs = [];
page.on('console', m => logs.push(`${m.type()}: ${m.text()}`));

const go = async (hash) => {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(1800);
  const chips = await page.locator('.wchip').count();
  const txt = (await page.locator('#view').innerText().catch(()=>'')).replace(/\s+/g,' ').slice(0,180);
  console.log(`${hash}  dictReq=${n} (aborted=${aborted}) wchip=${chips}`);
  console.log(`   body: ${txt}`);
};
await go('/today');
await go('/read/s/n5-white-cat');
await go('/read/s/n5-nine-hundred-yen');
await go('/watch/N5');
// in-page check of module state
const st = await page.evaluate(async () => {
  const d = await import('./js/dict.js');
  return { isLoaded: d.isLoaded(), ready: await d.ready() };
});
console.log('module state after navs:', JSON.stringify(st), 'dictReq now', n);
console.log('--- console logs ---'); logs.slice(0,12).forEach(l=>console.log('  '+l));
await browser.close();
