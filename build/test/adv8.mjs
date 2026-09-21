import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message));
// block the YouTube iframe API, as a phone with no connection (or a blocked
// network) would
await ctx.route('**youtube.com/**', r => r.abort());

const id = await (await fetch('http://localhost:8099/data/videos/index.json')).json().then(a=>a[0].id);
console.log('E. /watch/v/' + id + ' with youtube.com unreachable');
await page.goto(`${BASE}/#/watch/v/${id}`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
console.log('   appbar:', await page.locator('#appbarTitle').innerText());
console.log('   view  :', (await page.locator('#view').innerText()).slice(0,180).replace(/\s+/g,' '));
console.log('   errors:', errs.length?errs:'none');
await page.screenshot({path:'build/test/shots/adv-watch-offline.png'});
await browser.close();
