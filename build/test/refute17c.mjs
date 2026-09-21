import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch(); const c=await b.newContext({...devices['Pixel 7']}); const p=await c.newPage();
await p.goto(`${BASE}/#/today`,{waitUntil:'load'}); await p.waitForTimeout(1200);
const r=await p.evaluate(async()=>{
  const s=await import('/js/store.js'); await s.open();
  for(let i=0;i<3;i++) await s.put('reviews',{key:'w:x',at:Date.now()+i,rating:3});
  const dump=JSON.parse(JSON.stringify(await s.exportAll()));
  await new Promise(res=>{const o=indexedDB.open('nihongo');o.onsuccess=()=>{const d=o.result;const t=d.transaction('reviews','readwrite');t.objectStore('reviews').clear();t.oncomplete=()=>{d.close();res();};};});
  // the proposed fix, applied to the same data
  const err=await new Promise(res=>{const o=indexedDB.open('nihongo');o.onsuccess=()=>{const d=o.result;const t=d.transaction('reviews','readwrite');const st=t.objectStore('reviews');
    try{dump.reviews.forEach(rv=>{const q={...rv};delete q.id;st.put(q);});}catch(e){return res('SYNC '+e.message);} t.oncomplete=()=>{d.close();res(null);};t.onerror=()=>res('TX '+t.error?.message);};});
  return {exported:dump.reviews.length, err, restored: await s.count('reviews')};
});
console.log(JSON.stringify(r));
await b.close();
