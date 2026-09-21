import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const browser=await chromium.launch();
async function trial(gap, cpu){
  const c=await browser.newContext({...devices['Pixel 7'],hasTouch:true,isMobile:true});
  const p=await c.newPage();
  await p.goto(`${BASE}/#/today`,{waitUntil:'load'}); await p.waitForTimeout(3000);
  if(await p.locator('#start').count()){await p.evaluate(()=>document.getElementById('start').click());await p.waitForTimeout(2000);}
  await p.goto(`${BASE}/#/learn/N5`,{waitUntil:'load'}); await p.waitForTimeout(3000);
  const cdp = await c.newCDPSession(p);
  if(cpu>1) await cdp.send('Emulation.setCPUThrottlingRate',{rate:cpu});
  const box=await p.locator('#next').boundingBox();
  const x=box.x+box.width/2,y=box.y+box.height/2;
  // measure window under throttle
  await p.touchscreen.tap(x,y);
  if(gap) await p.waitForTimeout(gap);
  await p.touchscreen.tap(x,y);
  await p.waitForTimeout(2500);
  if(cpu>1) await cdp.send('Emulation.setCPUThrottlingRate',{rate:1});
  const hdr=(await p.locator('.review-top').innerText().catch(()=>'(gone)')).replace(/\s+/g,' ');
  const logs=await p.evaluate(async()=>{const s=await import('./js/store.js');return (await s.all('reviews')).map(x=>x.key);});
  const dup = new Set(logs).size!==logs.length;
  console.log(`cpu ${cpu}x gap ${String(gap).padStart(3)}ms -> "${hdr}" logs=${JSON.stringify(logs)} ${dup?'<<< DUPLICATE':''}`);
  await c.close();
}
for(const cpu of [1,6,20]) for(const gap of [8,12,20,40,70,100]) await trial(gap,cpu);
await browser.close();
