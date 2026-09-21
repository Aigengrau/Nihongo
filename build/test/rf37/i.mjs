import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('pageerror', e.message));
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.click('a[href="#/saved"]'); await page.waitForTimeout(1200);

// real end-to-end on a business module (the other dispatch site)
await page.evaluate(()=>{location.hash='/business'}); await page.waitForTimeout(1800);
const mod = await page.evaluate(()=>document.querySelector('a[href^="#/business/"]')?.getAttribute('href'));
console.log('module:', mod);
await page.evaluate(h=>{location.hash=h.slice(1)}, mod); await page.waitForTimeout(2200);
console.log('module title:', await page.locator('#appbarTitle').innerText());
console.log('module body:', (await page.locator('#view').innerText()).slice(0,70).replace(/\s+/g,' '));
const savers = await page.$$('[data-save], .save, button');
const btn = await page.evaluate(()=>{
  const b=[...document.querySelectorAll('button')].find(x=>/save|★|☆/i.test(x.textContent));
  if(b){b.click();return b.textContent.trim().slice(0,30);} return null;
});
console.log('clicked in-module save button:', btn);
await page.waitForTimeout(1600);
console.log('AFTER: hash=', await page.evaluate(()=>location.hash), 'title=', await page.locator('#appbarTitle').innerText());
console.log('  body:', (await page.locator('#view').innerText()).slice(0,70).replace(/\s+/g,' '));
await page.screenshot({path:'build/test/rf37/business.png'});
await browser.close();
