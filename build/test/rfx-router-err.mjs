import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
// N3 vocab: slow, then fails (flaky phone network)
await ctx.route('**/data/levels/n3/vocab.json', async r => { await new Promise(res=>setTimeout(res,2000)); await r.fulfill({ status: 500, body: 'nope' }); });
await page.goto(`${BASE}/#/stats`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
await page.evaluate(() => { location.hash = '/words/N3'; });
await page.waitForTimeout(300);
await page.evaluate(() => { location.hash = '/saved'; });
await page.waitForTimeout(600);
const snap = async t => console.log(`  ${t}: hash=`+await page.evaluate(()=>location.hash)+' appbar="'+await page.locator('#appbarTitle').innerText()+'" body='+(await page.locator('#view').innerText()).slice(0,70).replace(/\s+/g,' '));
await snap('t+0.6s');
await page.waitForTimeout(3500);
await snap('t+4.1s');
await browser.close();
