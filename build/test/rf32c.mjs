import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
let pageAborted=0, log=[];
await ctx.route('**/data/dict/common.json', async r=>{
  const fromSW = !!r.request().serviceWorker();
  log.push(fromSW?'sw':'page');
  if(!fromSW && pageAborted===0){ pageAborted++; await r.abort('failed'); }
  else await r.continue();
});
const p=await ctx.newPage();
await p.goto(`${BASE}/#/today`,{waitUntil:'load'}); await p.waitForTimeout(3500);
console.log('requests so far:', log.join(','));
await p.goto(`${BASE}/#/read/s/n5-white-cat`,{waitUntil:'load'}); await p.waitForTimeout(2500);
console.log('SW ON, page fetch aborted once -> story wchip =', await p.locator('.wchip').count(), '| reqs:', log.join(','));
const has = await p.locator('#view').innerText();
console.log('   shows hint:', /Tap any word/.test(has));
// is common.json in the SW data cache? i.e. it would work if only it retried
const cached = await p.evaluate(async()=>{ const c=await caches.open('data-v1'); return !!(await c.match('./data/dict/common.json')); });
console.log('   common.json present in SW data-v1 cache:', cached);
const st = await p.evaluate(async()=>{ const d=await import('./js/dict.js'); return {isLoaded:d.isLoaded(), ready:await d.ready()}; });
console.log('   dict module:', JSON.stringify(st), '| reqs after ready():', log.join(','));
await b.close();
