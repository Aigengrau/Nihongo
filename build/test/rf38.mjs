import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });

// ---------------- A: conjugation drill
console.log('=== A: conjugate N5 -> answer -> nav to /stats ===');
await page.goto(`${BASE}/#/conjugate/N5`, { waitUntil: 'load' });
await page.waitForSelector('#opts .btn', { timeout: 15000 });
console.log('drill mounted, title=', await page.locator('#appbarTitle').textContent());
await page.locator('#opts .btn').first().click();
await page.evaluate(() => { location.hash = '/stats'; });
await page.waitForTimeout(300);
console.log('immediately after nav: title=', await page.locator('#appbarTitle').textContent(),
  '| #opts count=', await page.locator('#view #opts .btn').count());
await page.waitForTimeout(2500);
console.log('2.5s later: title=', await page.locator('#appbarTitle').textContent());
console.log('  view text:', (await page.locator('#view').innerText()).slice(0, 120).replace(/\s+/g, ' '));
console.log('  #opts buttons on screen:', await page.locator('#view #opts .btn').count());
console.log('  errors:', errors.length ? errors : 'none');

// ---------------- B: kana quiz
errors.length = 0;
console.log('\n=== B: kana quiz -> answer -> nav to /today ===');
await page.goto(`${BASE}/#/kana`, { waitUntil: 'load' });
await page.waitForSelector('#quiz', { timeout: 15000 });
await page.locator('#quiz').click({ force: true });
await page.waitForSelector('#sheetBody #opts .btn', { timeout: 15000 });
console.log('quiz sheet open');
await page.locator('#sheetBody #opts .btn').first().click({ force: true });
await page.evaluate(() => { location.hash = '/today'; });
await page.waitForTimeout(250);
console.log('after nav, sheet hidden?', await page.locator('#sheet').isHidden(),
  '| overflow=', JSON.stringify(await page.evaluate(() => document.body.style.overflow)));
await page.waitForTimeout(1200);
console.log('1.2s later: title=', await page.locator('#appbarTitle').textContent());
console.log('  sheet visible?', await page.locator('#sheet').isVisible());
console.log('  body.style.overflow=', JSON.stringify(await page.evaluate(() => document.body.style.overflow)));
console.log('  sheet text:', (await page.locator('#sheetBody').innerText().catch(() => '')).slice(0, 80).replace(/\s+/g, ' '));
console.log('  errors:', errors.length ? errors : 'none');

// ---------------- C: business keigo drill
errors.length = 0;
console.log('\n=== C: business keigo-irregulars drill -> answer -> nav to /today ===');
await page.goto(`${BASE}/#/business/keigo-irregulars`, { waitUntil: 'load' });
await page.waitForSelector('[data-m="drill"]', { timeout: 15000 });
await page.locator('[data-m="drill"]').click();
await page.waitForSelector('#pane #opts .btn', { timeout: 15000 });
console.log('drill mounted');
await page.locator('#pane #opts .btn').first().click();
await page.evaluate(() => { location.hash = '/today'; });
await page.waitForTimeout(2500);
console.log('2.5s later: title=', await page.locator('#appbarTitle').textContent());
console.log('  view text:', (await page.locator('#view').innerText()).slice(0, 120).replace(/\s+/g, ' '));
console.log('  errors:', errors.length ? errors : 'none');

await browser.close();
