import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
for(const h of ['/grammar/N5/91','/grammar/N5/92','/grammar/N5/95']){
  await p.goto(`${BASE}/#${h}`,{waitUntil:'load'});
  await p.waitForTimeout(900);
  const t=(await p.locator('#view').innerText()).replace(/\n+/g,' | ');
  console.log('\n=== '+h+'\n'+t.slice(0,600));
}
await b.close();
