import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
await page.addInitScript(() => { window.__xss = 0; });
const errs = []; page.on('pageerror', e => errs.push(e.message));

const PAY = `<img src=x onerror="window.__xss=1"><script>window.__xss=2<\/script>"><svg onload="window.__xss=3">今日は天気。`;
console.log('G1. paste reader with HTML payload');
await page.goto(`${BASE}/#/read/s/paste`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
await page.fill('#src', PAY);
await page.evaluate(() => document.getElementById('go').click());
await page.waitForTimeout(1500);
console.log('   __xss =', await page.evaluate(()=>window.__xss));
console.log('   injected <img>/<svg> nodes in #view:', await page.evaluate(()=>document.querySelectorAll('#view img,#view svg[onload]').length));
console.log('   rendered text:', (await page.locator('#view').innerText()).slice(0,120).replace(/\s+/g,' '));

console.log('\nG2. restore a malicious backup (settings screen file input)');
const backup = {
  app: 'nihongo', version: 1,
  saved: [{ key: 'x', word: '<img src=y onerror="window.__xss=10">', reading: '<b>r</b>', meaning: '<img src=z onerror="window.__xss=11">', added: Date.now() }],
  cards: [], progress: [], settings: [], reviews: [],
};
await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.setInputFiles('#file', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
await page.waitForTimeout(1200);
await page.evaluate(() => { location.hash = '/saved'; });
await page.waitForTimeout(1500);
console.log('   __xss =', await page.evaluate(()=>window.__xss));
console.log('   saved list text:', (await page.locator('#view').innerText()).slice(0,120).replace(/\s+/g,' '));
console.log('   img nodes:', await page.evaluate(()=>document.querySelectorAll('#view img').length));
console.log('   errors:', errs.length?errs:'none');
await browser.close();
