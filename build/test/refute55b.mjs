import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
for (const dev of ['Pixel 7','iPhone SE','iPhone 12']){
  const ctx=await b.newContext({...devices[dev]});
  const p=await ctx.newPage();
  await p.goto(`${BASE}/#/levels`,{waitUntil:'load'}); await p.waitForTimeout(1100);
  const r=await p.evaluate(()=>{const a=document.querySelector('a.tile[href="#/business"]');const q=a.getBoundingClientRect();
    return {top:Math.round(q.top),bottom:Math.round(q.bottom),vh:innerHeight,fullyVisibleNoScroll:q.bottom<=innerHeight&&q.top>=0};});
  console.log(dev.padEnd(10), JSON.stringify(r));
  if(dev==='Pixel 7') await p.screenshot({path:'build/test/shots/refute55-levels-top.png'});
  await ctx.close();
}
await b.close();
