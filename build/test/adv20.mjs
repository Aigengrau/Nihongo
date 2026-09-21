import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const browser=await chromium.launch(); const ctx=await browser.newContext({...devices['Pixel 7']}); const page=await ctx.newPage();
await page.goto(`${BASE}/#/kanji/N5`,{waitUntil:'load'}); await page.waitForTimeout(3000);
await page.evaluate(()=>{ window.__m=0; new MutationObserver(ms=>{for(const m of ms) if(m.type==='childList') window.__m++;}).observe(document.getElementById('sheetBody'),{childList:true}); });
for (const n of [1,2,3,4]) {
  await page.evaluate(()=>{window.__m=0;});
  await page.evaluate(()=>document.querySelector('.kana-cell[data-c]').click());
  await page.waitForTimeout(400);
  console.log(`   visit ${n}: sheet rebuilt ${await page.evaluate(()=>window.__m)} time(s) per tap`);
  await page.evaluate(()=>{location.hash='/today';}); await page.waitForTimeout(500);
  await page.evaluate(()=>{location.hash='/kanji/N5';}); await page.waitForTimeout(1200);
}
// heap growth
const h = await page.evaluate(()=>performance.memory ? Math.round(performance.memory.usedJSHeapSize/1048576) : -1);
console.log('   heap MB after 4 visits:', h);
await browser.close();
