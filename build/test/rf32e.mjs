import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
let block=true, log=[];
await ctx.route('**/data/dict/common.json', async r=>{
  log.push((r.request().serviceWorker()?'sw':'page')+(block?':ABORT':':ok'));
  if(block) await r.abort('failed'); else await r.continue();
});
// launch with the dictionary unreachable; SW installs & claims (self-reload happens here)
await p.goto(`${BASE}/#/today`,{waitUntil:'load'}); await p.waitForTimeout(5000);
console.log('controller:', await p.evaluate(()=>!!navigator.serviceWorker.controller), '| reqs:', log.join(','));
console.log('story while offline: wchip =', await (async()=>{await p.goto(`${BASE}/#/read/s/n5-white-cat`,{waitUntil:'load'});await p.waitForTimeout(2000);return p.locator('.wchip').count();})());
// >>> network comes back, user keeps using the app (no reload)
block=false; const before=log.length;
p.on('console',m=>{ if(/dict|offline/i.test(m.text())) console.log('   console:',m.text().slice(0,90)); });
await p.evaluate(()=>window.dispatchEvent(new Event('online')));
await p.waitForTimeout(1500);
await p.goto(`${BASE}/#/read/s/n5-nine-hundred-yen`,{waitUntil:'load'}); await p.waitForTimeout(2500);
console.log('AFTER network restored, story2: wchip =', await p.locator('.wchip').count());
console.log('   hint still shown:', /Tap any word/.test(await p.locator('#view').innerText()));
await p.goto(`${BASE}/#/read/s/n5-white-cat`,{waitUntil:'load'}); await p.waitForTimeout(2500);
console.log('AFTER restored, story1 again: wchip =', await p.locator('.wchip').count());
console.log('new dict requests since restore:', log.length-before, '| all:', log.join(','));
// tap a word to see what the user gets
await p.locator('.jp-md').first().click({position:{x:12,y:12}}).catch(()=>{});
await p.waitForTimeout(800);
console.log('sheet open after tap:', await p.locator('.sheet, #sheet, dialog[open]').count());
// finally a manual restart
await p.reload({waitUntil:'load'}); await p.waitForTimeout(3000);
console.log('after manual reload: wchip =', await p.locator('.wchip').count());
await b.close();
