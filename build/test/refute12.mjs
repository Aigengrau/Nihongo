import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
await p.goto(`${BASE}/#/words/N5`,{waitUntil:'load'});
await p.waitForTimeout(1200);
// 1. what does the raw list look like at the top?
const first12=await p.locator('.wrow').evaluateAll(n=>n.slice(0,12).map(x=>x.innerText.replace(/\s+/g,' ')));
console.log('FIRST ROWS:',JSON.stringify(first12,null,0));
for(const q of ['する','ここ','いる']){
  await p.fill('#q',q); await p.waitForTimeout(500);
  const rows=await p.locator('.wrow').evaluateAll(n=>n.slice(0,4).map(x=>({text:x.innerText.replace(/\s+/g,' '),html:x.querySelector('.wrow-jp').innerHTML})));
  console.log('\nSEARCH',q,JSON.stringify(rows,null,1));
}
// open 為る sheet
await p.fill('#q','為る'); await p.waitForTimeout(500);
await p.locator('.wrow').first().click(); await p.waitForTimeout(900);
const sheet=await p.locator('.sheet, #sheet, dialog').first().innerText().catch(()=> 'NO SHEET');
console.log('\nSHEET:\n'+sheet.slice(0,600));
await p.screenshot({path:'build/test/shots/refute12-suru-sheet.png'});
await b.close();
