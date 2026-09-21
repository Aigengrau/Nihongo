import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('pageerror',e.message));
await p.goto(`${BASE}/#/words/N5`,{waitUntil:'load'});
await p.waitForTimeout(1500);
await p.locator('input').first().fill('これ'); await p.waitForTimeout(800);
await p.locator('#view').locator('text=これ').first().click(); await p.waitForTimeout(1000);
await p.locator('text=Save to my words').first().click(); await p.waitForTimeout(800);
await p.keyboard.press('Escape'); await p.waitForTimeout(400);
await p.goto(`${BASE}/#/saved`,{waitUntil:'load'}); await p.waitForTimeout(1500);
console.log('=== SAVED ===');
console.log((await p.locator('#view').innerText()).slice(0,500));
// try flashcard over saved
for (const h of ['/saved/flash','/flash/saved','/review/saved','/review']) {
  await p.goto(`${BASE}/#${h}`,{waitUntil:'load'}); await p.waitForTimeout(1400);
  const t=(await p.locator('#view').innerText()).slice(0,350);
  console.log('=== '+h+' ===\n'+t);
}
await p.screenshot({path:'build/test/shots/refute44-saved.png',fullPage:true});
await b.close();
