import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
// "Slow 4G"-ish: 400 kbps down, 400ms latency
await cdp.send('Network.emulateNetworkConditions', {
  offline: false, latency: 300, downloadThroughput: 400*1024/8, uploadThroughput: 400*1024/8,
});
await page.goto(`${BASE}/#/stats`, { waitUntil: 'load' });
await page.waitForTimeout(6000);
console.log('start hash', await page.evaluate(()=>location.hash));
await page.evaluate(() => { location.hash = '/words/N1'; });
await page.waitForTimeout(400);
await page.evaluate(() => { location.hash = '/saved'; });
await page.waitForTimeout(800);
const snap = async (tag) => console.log(`  ${tag}: hash=`+await page.evaluate(()=>location.hash)+' appbar="'+await page.locator('#appbarTitle').innerText()+'" body='+(await page.locator('#view').innerText()).slice(0,45).replace(/\s+/g,' ')+' #q='+await page.locator('#q').count());
await snap('t+0.8s');
await page.waitForTimeout(20000);
await snap('t+21s');
console.log('  tabbar:', await page.evaluate(()=>[...document.querySelectorAll('#tabbar [data-tab]')].map(a=>a.dataset.tab+'='+a.getAttribute('aria-current')).join(' ')));
console.log('  errors:', errs.length?errs:'none');
await browser.close();
