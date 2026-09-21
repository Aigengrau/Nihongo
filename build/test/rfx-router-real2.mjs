import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
const page = await ctx.newPage();
let t0 = Date.now();
page.on('request', r => { if(/\.json/.test(r.url())) console.log('   REQ +'+(Date.now()-t0)+'ms '+r.url().split('/data/')[1]); });
page.on('response', r => { if(/\.json/.test(r.url())) console.log('   RES +'+(Date.now()-t0)+'ms '+r.url().split('/data/')[1]); });
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline:false, latency:150, downloadThroughput:1500*1024/8, uploadThroughput:750*1024/8 });
await page.goto(`${BASE}/#/words/N5`, { waitUntil: 'load' });
await page.waitForSelector('#q', { timeout: 60000 });
await page.waitForTimeout(3000);
console.log('--- primed; now N1 words then saved ---');
t0 = Date.now();
await page.evaluate(() => { location.hash = '/words/N1'; });
await page.waitForTimeout(500);
await page.evaluate(() => { location.hash = '/saved'; });
for (const w of [800, 3000, 5000, 10000]) {
  await page.waitForTimeout(w===800?800:w-0);
  console.log(`  +${Date.now()-t0}ms hash=`+await page.evaluate(()=>location.hash)+' appbar="'+await page.locator('#appbarTitle').innerText()+'" #q='+await page.locator('#q').count()+' body='+(await page.locator('#view').innerText()).slice(0,30).replace(/\s+/g,' '));
}
await browser.close();
