import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const page=await (await b.newContext({...devices['Pixel 7']})).newPage();
const dump=async()=>page.evaluate(async()=>{
  const dbs=await indexedDB.databases();
  const out={};
  for(const {name} of dbs){
    const db=await new Promise(r=>{const q=indexedDB.open(name);q.onsuccess=()=>r(q.result);});
    for(const s of [...db.objectStoreNames]){
      const n=await new Promise(r=>{const q=db.transaction(s).objectStore(s).count();q.onsuccess=()=>r(q.result);});
      out[`${name}/${s}`]=n;
    }
    db.close();
  }
  return out;
});
await page.goto(`${BASE}/#/conjugate/N5`,{waitUntil:'load'}); await page.waitForTimeout(1500);
console.log('IDB before drill:',JSON.stringify(await dump()));
for(let i=0;i<12;i++){ const btn=page.locator('#opts button').first(); if(!await btn.count())break; await btn.click(); await page.waitForTimeout(1500); }
console.log('asked:',(await page.locator('.review-top').innerText()).replace(/\s+/g,' '));
console.log('IDB after 12 drill answers:',JSON.stringify(await dump()));
await b.close();
