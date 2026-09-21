import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'allow' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

console.log('1. first load (online), let the service worker install + precache…');
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.goto(`${BASE}/#/level/N5`, { waitUntil: 'load' });
await page.waitForTimeout(1000);
await page.goto(`${BASE}/#/words/N5`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

const swState = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return { has: !!r, active: !!r?.active, controller: !!navigator.serviceWorker.controller };
});
console.log('   service worker:', JSON.stringify(swState));

const caches0 = await page.evaluate(async () => {
  const names = await caches.keys();
  const out = {};
  for (const n of names) out[n] = (await (await caches.open(n)).keys()).length;
  return out;
});
console.log('   caches:', JSON.stringify(caches0));

console.log('\n2. going offline and reloading…');
await ctx.setOffline(true);
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(2000);
const t1 = await page.locator('#appbarTitle').textContent().catch(() => '(none)');
const b1 = (await page.locator('#view').innerText().catch(() => '')).slice(0, 90).replace(/\s+/g, ' ');
console.log(`   Today offline -> title="${t1}"  ${b1}`);

await page.goto(`${BASE}/#/words/N5`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
const b2 = (await page.locator('#view').innerText().catch(() => '')).slice(0, 90).replace(/\s+/g, ' ');
const rows = await page.locator('.wrow').count();
console.log(`   Words offline -> ${rows} rows  ${b2}`);

await page.goto(`${BASE}/#/read/s/paste`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.fill('#src', '今日は天気がいいので、公園まで歩いて行きました。');
await page.click('#go');
await page.waitForTimeout(1200);
const chips = await page.locator('.wchip').count();
console.log(`   Tap-a-word offline -> ${chips} tappable words`);
if (chips) {
  await page.locator('.wchip').first().click();
  await page.waitForTimeout(800);
  const sheet = (await page.locator('#sheetBody').innerText().catch(() => '')).slice(0, 90).replace(/\s+/g, ' ');
  console.log(`   Word sheet offline -> ${sheet}`);
}
await page.screenshot({ path: 'build/test/shots/offline-words.png' });

console.log(`\nerrors: ${errs.length ? errs.join(' | ') : 'none'}`);
const pass = swState.active && rows > 0 && chips > 0;
console.log(`\n=== OFFLINE ${pass ? 'PASS' : 'FAIL'} ===`);
await browser.close();
