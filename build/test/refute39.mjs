import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const browser=await chromium.launch();
const ctx=await browser.newContext({...devices['Pixel 7'], hasTouch:true, isMobile:true});
const page=await ctx.newPage();
await page.goto(`${BASE}/#/today`,{waitUntil:'load'}); await page.waitForTimeout(3000);
if(await page.locator('#start').count()){await page.evaluate(()=>document.getElementById('start').click());await page.waitForTimeout(1500);}

// 1) measure the async window: time from click dispatch to DOM swap
await page.goto(`${BASE}/#/learn/N5`,{waitUntil:'load'}); await page.waitForTimeout(2500);
const win = await page.evaluate(() => new Promise(res => {
  const b=document.getElementById('next');
  const t0=performance.now();
  const mo=new MutationObserver(()=>{ mo.disconnect(); res(performance.now()-t0); });
  mo.observe(document.getElementById('view'),{childList:true,subtree:true});
  b.click();
}));
console.log('async window (click -> DOM redraw):', win.toFixed(1),'ms');

// 2) realistic taps at various gaps, fresh DB each time
for (const gap of [0,16,33,50,80,120,200]) {
  const c2=await browser.newContext({...devices['Pixel 7'],hasTouch:true,isMobile:true});
  const p=await c2.newPage();
  await p.goto(`${BASE}/#/today`,{waitUntil:'load'}); await p.waitForTimeout(2500);
  if(await p.locator('#start').count()){await p.evaluate(()=>document.getElementById('start').click());await p.waitForTimeout(1500);}
  await p.goto(`${BASE}/#/learn/N5`,{waitUntil:'load'}); await p.waitForTimeout(2500);
  const box = await p.locator('#next').boundingBox();
  const x=box.x+box.width/2, y=box.y+box.height/2;
  await p.touchscreen.tap(x,y);
  if(gap) await p.waitForTimeout(gap);
  await p.touchscreen.tap(x,y);
  await p.waitForTimeout(1500);
  const hdr=(await p.locator('.review-top').innerText().catch(()=>'(gone)')).replace(/\s+/g,' ');
  const logs=await p.evaluate(async()=>{const s=await import('./js/store.js');return (await s.all('reviews')).map(x=>x.key);});
  console.log(`gap ${String(gap).padStart(3)}ms -> header "${hdr}" logs=${JSON.stringify(logs)}`);
  await c2.close();
}
await browser.close();
