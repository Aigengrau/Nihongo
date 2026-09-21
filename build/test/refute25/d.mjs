import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch(); const ctx=await b.newContext({...devices['Pixel 7']}); const p=await ctx.newPage();
for(const lv of ['N5','N4','N3','N2','N1']){
  await p.goto(`${BASE}/#/words/${lv}`,{waitUntil:'load'}); await p.waitForTimeout(2200);
  console.log(lv, await p.evaluate(()=>({rows:document.querySelectorAll('.wrow').length, sw:document.documentElement.scrollWidth, row:Math.round((document.querySelector('.wrow')?.getBoundingClientRect().width)||0)})));
}
await b.close();
