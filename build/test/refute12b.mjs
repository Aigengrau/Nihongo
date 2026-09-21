import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('ERR',e.message));
await p.goto(`${BASE}/#/words/N5`,{waitUntil:'load'});
await p.waitForTimeout(1200);
await p.fill('#q','為る'); await p.waitForTimeout(500);
await p.locator('.wrow').first().click(); await p.waitForTimeout(800);
const save=p.getByText(/Save to my words/);
await save.click(); await p.waitForTimeout(600);
console.log('saved');
// close sheet
await p.getByRole('button',{name:/Close/}).first().click().catch(()=>{});
await p.waitForTimeout(400);
for (const h of ['/review','/review/saved','/saved','/me']) {
  await p.goto(`${BASE}/#${h}`,{waitUntil:'load'}); await p.waitForTimeout(1000);
  const t=(await p.locator('#view').innerText()).replace(/\s+/g,' ').slice(0,200);
  console.log('\n'+h+' => '+t);
}
await p.screenshot({path:'build/test/shots/refute12-card.png'});
await b.close();
