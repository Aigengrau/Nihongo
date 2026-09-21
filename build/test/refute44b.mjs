import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('pageerror',e.message));

await p.goto(`${BASE}/#/words/N5`,{waitUntil:'load'});
await p.waitForTimeout(1500);
const s=p.locator('input').first();
await s.fill('これ'); await p.waitForTimeout(800);
// open the word detail
const row=p.locator('#view').locator('text=これ').first();
await row.click(); await p.waitForTimeout(1200);
console.log('=== これ DETAIL ===');
console.log((await p.locator('body').innerText()).slice(0,1200));
await p.screenshot({path:'build/test/shots/refute44-kore.png',fullPage:true});
await b.close();
