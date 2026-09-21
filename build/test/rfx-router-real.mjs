import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'block' });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
const cdp = await ctx.newCDPSession(page);
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline:false, latency:150, downloadThroughput:1500*1024/8, uploadThroughput:750*1024/8 });

const snap = async (tag) => console.log(`  ${tag}: hash=`+await page.evaluate(()=>location.hash)+' | appbar="'+await page.locator('#appbarTitle').innerText()+'" | body='+(await page.locator('#view').innerText()).slice(0,40).replace(/\s+/g,' ')+' | #q='+await page.locator('#q').count()+' | tab='+await page.evaluate(()=>[...document.querySelectorAll('#tabbar [data-tab]')].map(a=>a.dataset.tab+'='+a.getAttribute('aria-current')).filter(s=>/page/.test(s)).join(',')));

// 1. cold load, browse N5 words so browse.js module is cached
await page.goto(`${BASE}/#/words/N5`, { waitUntil: 'load' });
await page.waitForSelector('#q', { timeout: 60000 });
await page.waitForTimeout(2000);
console.log('primed browse.js with N5');
// 2. now tap N1 words, and 500ms later change your mind and tap the Saved tab
await page.evaluate(() => { location.hash = '/words/N1'; });
await page.waitForTimeout(500);
await page.evaluate(() => { location.hash = '/saved'; });
await page.waitForTimeout(800);  await snap('t+0.8s');
await page.waitForTimeout(15000); await snap('t+16s');
console.log('  errors:', errs.length?errs:'none');
await browser.close();
