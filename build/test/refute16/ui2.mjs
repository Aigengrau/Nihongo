import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const p=await (await b.newContext({...devices['Pixel 7']})).newPage();
await p.goto(`${BASE}/#/business/jikoshoukai`,{waitUntil:'load'});
await p.waitForTimeout(1500);
const tok = p.locator('#view [data-w="おります"], #view .tok', {hasText:'おります'}).first();
const cands = await p.locator('#view *').evaluateAll(els=>{
  const out=[];
  for(const e of els){ if(e.children.length===0 && e.textContent.trim()==='おります') out.push(e.tagName+'.'+e.className+' attrs='+[...e.attributes].map(a=>a.name+'='+a.value).join(',')); }
  return out.slice(0,5);
});
console.log('tappable おります nodes:', JSON.stringify(cands,null,1));
if(cands.length){
  await p.locator('#view *').filter({hasText:/^おります$/}).last().click();
  await p.waitForTimeout(1200);
  const sheet = await p.locator('.sheet, #sheet, [class*=sheet]').first().innerText().catch(()=>'(no sheet)');
  console.log('--- WORD SHEET ---\n'+sheet.slice(0,600));
  await p.screenshot({path:'build/test/refute16/orimasu.png'});
}
await b.close();
