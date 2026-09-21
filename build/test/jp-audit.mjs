import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
const errs=[];p.on('pageerror',e=>errs.push('pageerror '+e.message));

async function go(hash){ await p.goto(`${BASE}/#${hash}`,{waitUntil:'load'}); await p.waitForTimeout(3000); }

// Story with katakana long vowels
await go('/read/s/n3-message-unread');
const lines = await p.evaluate(()=>{
  const out=[];
  document.querySelectorAll('.wtext').forEach(w=>{
    const chips=[...w.querySelectorAll('.wchip')].map(c=>c.textContent);
    out.push({text:w.innerText.replace(/\s+/g,''), n:chips.length, first:chips[0]||null});
  });
  return out;
});
console.log('--- n3-message-unread rendered lines ---');
lines.slice(0,14).forEach(l=>console.log(`  chips=${String(l.n).padStart(2)}  ${l.text.slice(0,40)}`));
const blob = lines.filter(l=>l.n===1 && l.text.length>6);
console.log('LINES RENDERED AS A SINGLE CHIP:', blob.length);
blob.forEach(l=>console.log('   !! '+l.first));

// tap one of those blobs
if(blob.length){
  await p.evaluate(()=>{ const w=[...document.querySelectorAll('.wtext')].find(x=>x.querySelectorAll('.wchip').length===1 && x.innerText.length>6); w.querySelector('.wchip').click(); });
  await p.waitForTimeout(1200);
  const sheet=await p.locator('#sheetBody').innerText().catch(()=>'(no sheet)');
  console.log('--- word sheet after tapping the blob ---');
  console.log('  '+sheet.replace(/\s+/g,' ').slice(0,220));
  await p.screenshot({path:'build/test/shots/jp-blob-sheet.png'});
}
console.log('errors:',[...new Set(errs)].join(' | ')||'none');
await b.close();
