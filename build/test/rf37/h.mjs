import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

// ---- Scenario A: mid-review session ----
await page.click('a[href="#/saved"]'); await page.waitForTimeout(1200);
await page.evaluate(()=>{location.hash='/learn/N5'}); await page.waitForTimeout(2500);
console.log('learn screen title:', await page.locator('#appbarTitle').innerText(), '| body:', (await page.locator('#view').innerText()).slice(0,60).replace(/\s+/g,' '));
// save something from the sheet if a word is tappable; else just dispatch the event the same way ui.js does
await page.evaluate(()=>window.dispatchEvent(new CustomEvent('nihongo:saved-changed')));
await page.waitForTimeout(1500);
console.log('AFTER a save elsewhere: hash=', await page.evaluate(()=>location.hash), 'title=', await page.locator('#appbarTitle').innerText());
console.log('  body:', (await page.locator('#view').innerText()).slice(0,70).replace(/\s+/g,' '));

// ---- Scenario B: watch player ----
await page.click('a[href="#/saved"]'); await page.waitForTimeout(1200);
await page.evaluate(()=>{location.hash='/watch'}); await page.waitForTimeout(2000);
const first = await page.evaluate(()=>document.querySelector('a[href^="#/watch/v/"]')?.getAttribute('href'));
console.log('first video link:', first);
if (first){ await page.evaluate(h=>{location.hash=h.slice(1)}, first); await page.waitForTimeout(2500); }
console.log('player title:', await page.locator('#appbarTitle').innerText(), '| iframe:', await page.locator('iframe').count());
await page.evaluate(()=>window.dispatchEvent(new CustomEvent('nihongo:saved-changed')));
await page.waitForTimeout(1500);
console.log('AFTER save on player: hash=', await page.evaluate(()=>location.hash), 'title=', await page.locator('#appbarTitle').innerText(), 'iframe=', await page.locator('iframe').count());
console.log('  body:', (await page.locator('#view').innerText()).slice(0,70).replace(/\s+/g,' '));
await browser.close();
