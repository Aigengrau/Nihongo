import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
// 1. warm install
await p.goto(`${BASE}/#/today`,{waitUntil:'load'}); await p.waitForTimeout(4000);
console.log('installed. controller:', await p.evaluate(()=>!!navigator.serviceWorker.controller));
// 2. evict the dictionary from the SW data cache (simulates a failed/partial warm or eviction)
console.log('evicted:', await p.evaluate(async()=>{const c=await caches.open('data-v1');return c.delete('./data/dict/common.json',{ignoreSearch:true});}));
// 3. network for the dictionary fails on the FIRST attempt only, then is fine
let n=0; const log=[];
await ctx.route('**/data/dict/common.json', async r=>{ n++; log.push(n===1?'ABORT':'ok'); if(n===1) await r.abort('failed'); else await r.continue(); });
// 4. steady-state relaunch (SW already controlling -> NO controllerchange reload)
await p.goto(`${BASE}/#/today`,{waitUntil:'load'}); await p.waitForTimeout(3000);
console.log('relaunch reqs:', log.join(','), '| reloaded?');
await p.goto(`${BASE}/#/read/s/n5-white-cat`,{waitUntil:'load'}); await p.waitForTimeout(2500);
console.log('story1 wchip =', await p.locator('.wchip').count(), '| reqs:', log.join(','));
console.log('   hint shown:', /Tap any word/.test(await p.locator('#view').innerText()));
await p.goto(`${BASE}/#/read/s/n5-nine-hundred-yen`,{waitUntil:'load'}); await p.waitForTimeout(2500);
console.log('story2 wchip =', await p.locator('.wchip').count(), '| reqs:', log.join(','));
await p.goto(`${BASE}/#/business/keigo-irregulars`,{waitUntil:'load'}); await p.waitForTimeout(2500);
console.log('business wchip =', await p.locator('.wchip').count(), '| reqs:', log.join(','));
console.log('dict module:', JSON.stringify(await p.evaluate(async()=>{const d=await import('./js/dict.js');return {isLoaded:d.isLoaded(),ready:await d.ready()};})));
console.log('final reqs:', log.join(','));
await b.close();
