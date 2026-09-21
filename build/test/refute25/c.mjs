import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch(); const ctx=await b.newContext({...devices['Pixel 7']}); const p=await ctx.newPage();
const routes=['/today','/levels','/level/N5','/words/N5','/words/N1','/kanji/N5','/grammar/N5','/grammar/N5/0','/kana','/conjugate/N5','/read/N5','/watch/N5','/saved','/stats','/settings','/business'];
for(const r of routes){
  await p.goto(`${BASE}/#${r}`,{waitUntil:'load'}); await p.waitForTimeout(900);
  const a=await p.evaluate(()=>({sw:document.documentElement.scrollWidth,cw:document.body.clientWidth}));
  const h=await p.addStyleTag({content:'.list{grid-template-columns:minmax(0,1fr)}'}); await p.waitForTimeout(250);
  const c=await p.evaluate(()=>document.documentElement.scrollWidth);
  await p.evaluate(e=>e.remove(),h);
  console.log(r.padEnd(18), 'body',a.cw, 'scrollW',a.sw, a.sw>a.cw+1?'OVERFLOW':'ok', '-> withFix',c, c>a.cw+1?'STILL':'ok');
}
await b.close();
