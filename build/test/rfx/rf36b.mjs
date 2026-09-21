import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await p.goto(`${BASE}/#/business/email`,{waitUntil:'load'});
await p.waitForSelector('[data-slot="0"]');
const inst = async () => p.evaluate(()=>{window.__r=0;const v=document.getElementById('view');
 if(window.__mo)window.__mo.disconnect();
 window.__mo=new MutationObserver(ms=>{for(const m of ms) if(m.target===v&&m.type==='childList')window.__r++;});window.__mo.observe(v,{childList:true});});
await inst();
for(let i=1;i<=6;i++) await p.locator(`[data-slot="0"][data-opt="${i%2}"]`).click();
console.log('after 6 taps, mutations on 6th:', await p.evaluate(()=>window.__r));
// navigate away and back
await p.evaluate(()=>{location.hash='#/today';});
await p.waitForTimeout(600);
await p.evaluate(()=>{location.hash='#/business/email';});
await p.waitForSelector('[data-slot="0"]');
await inst();
const t0=Date.now();
await p.locator('[data-slot="0"][data-opt="1"]').click();
console.log(`first tap AFTER re-entering screen: ${Date.now()-t0} ms, mutations = ${await p.evaluate(()=>window.__r)}`);
// does a stale handler fire on an unrelated screen? go to #/today and click around
await p.evaluate(()=>{location.hash='#/today';});
await p.waitForTimeout(600);
await inst();
await p.mouse.click(180,400);
await p.waitForTimeout(400);
console.log('mutations from a stray tap on #/today:', await p.evaluate(()=>window.__r), 'hash now', await p.evaluate(()=>location.hash));
// CPU throttle x4 to approximate a phone
await p.evaluate(()=>{location.hash='#/business/email';});
await p.waitForSelector('[data-slot="0"]');
await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
for(let i=1;i<=13;i++){const t=Date.now();await p.locator(`[data-slot="0"][data-opt="${i%2}"]`).click({timeout:180000});console.log(`throttled4x tap ${i}: ${Date.now()-t} ms`);}
await b.close();
