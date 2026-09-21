import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('pageerror',e.message));
await p.goto(`${BASE}/#/learn/N5`,{waitUntil:'load'});
await p.waitForTimeout(2000);
for (let n=0;n<10;n++){
  const t=(await p.locator('#view').innerText()).split('\n').slice(0,5).join(' | ');
  console.log('LEARN card',n+1,':',t);
  const next=p.locator('button',{hasText:/Got it|Next|Continue|I knew/i}).first();
  if (await next.count()===0) break;
  await next.click(); await p.waitForTimeout(600);
}
await p.goto(`${BASE}/#/review`,{waitUntil:'load'}); await p.waitForTimeout(1800);
console.log('--- REVIEW ---');
for (let n=0;n<4;n++){
  await p.locator('#face').click().catch(()=>{}); await p.waitForTimeout(600);
  console.log('REVIEW card',n+1,':',(await p.locator('#view').innerText()).replace(/\n/g,' | ').slice(0,200));
  const g=p.locator('button',{hasText:/Good|Easy/i}).first();
  if (await g.count()===0) break;
  await g.click(); await p.waitForTimeout(700);
}
await b.close();
