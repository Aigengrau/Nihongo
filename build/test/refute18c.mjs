import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch(); const c=await b.newContext({...devices['Pixel 7']}); const p=await c.newPage();
p.on('pageerror',e=>console.log('PAGEERROR',e.message));
await p.goto(`${BASE}/#/read/s/n5-white-cat`,{waitUntil:'load'}); await p.waitForTimeout(1800);
// save 3 words via real UI
for (let k=0;k<3;k++){
  const w=p.locator('.tok, [data-w], .word').nth(k+1);
  await w.click(); await p.waitForTimeout(700);
  const sb=p.locator('#sheetSave');
  if(await sb.count()){const t=await sb.innerText(); if(t.includes('Save to')){await sb.click(); await p.waitForTimeout(400);}}
  await p.locator('[data-close]').last().click({force:true}).catch(()=>{}); await p.waitForTimeout(300);
}
const r = await p.evaluate(async () => {
  const store=await import('/js/store.js'); const prog=await import('/js/progress.js');
  const rows=await store.all('saved');
  const cards=(await store.all('cards')).filter(x=>x.deck==='saved');
  return {
    savedRows: rows.map(s=>({key:s.key, vocabId:s.vocabId, lv:s.lv, meaning:s.meaning})),
    cardFields: cards.map(x=>({key:x.key, vocabId:x.vocabId??'ABSENT', ord:x.ord})),
    todayNew:(await prog.today()).new,
    savedDeckFreshDay:(await prog.session({deck:'saved'})).queue.map(x=>x.key),
  };
});
console.log(JSON.stringify(r,null,2));
await p.goto(`${BASE}/#/review/saved`,{waitUntil:'load'}); await p.waitForTimeout(1500);
console.log('fresh-day review/saved:', (await p.locator('#view').innerText()).replace(/\s+/g,' ').slice(0,140));
await p.locator('#reveal').click().catch(()=>{}); await p.waitForTimeout(700);
console.log('revealed:', (await p.locator('#view').innerText()).replace(/\s+/g,' ').slice(0,220));
await p.screenshot({path:'build/test/shots/r18-freshday.png'});
await b.close();
