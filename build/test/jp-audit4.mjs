import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('pageerror',e.message));
await p.goto(`${BASE}/#/words/N5`,{waitUntil:'load'});
await p.waitForTimeout(2500);
for(const q of ['為る','居る','此処','私','コーヒー']){
  await p.fill('#q', q);
  await p.waitForTimeout(500);
  const t=(await p.locator('#list').innerText()).replace(/\n/g,' | ').slice(0,140);
  console.log(`search "${q}" -> ${t}`);
}
await p.fill('#q','為る'); await p.waitForTimeout(400);
await p.locator('.wrow').first().click(); await p.waitForTimeout(1200);
console.log('SHEET:', (await p.locator('#sheetBody').innerText()).replace(/\s+/g,' ').slice(0,200));
await p.screenshot({path:'build/test/shots/jp-suru-sheet.png'});
await b.close();
