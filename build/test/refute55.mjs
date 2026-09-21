import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));

// FRESH profile, zero progress: can a day-one user reach the whole business track?
await p.goto(`${BASE}/#/business`,{waitUntil:'load'}); await p.waitForTimeout(1200);
const tiles=await p.$$eval('a.tile[href^="#/business/"]',as=>as.map(a=>({href:a.getAttribute('href'),t:a.querySelector('.tile-title')?.textContent.trim(),locked:a.className.includes('lock')||a.hasAttribute('aria-disabled')||getComputedStyle(a).pointerEvents==='none'})));
console.log('cards on #/business with ZERO progress:',tiles.length);
console.log(tiles.map(t=>`  ${t.href}  locked=${t.locked}  ${t.t}`).join('\n'));

// actually open every module on a fresh profile and confirm real content renders
let opened=0, empty=0;
for(const t of tiles){
  await p.goto(`${BASE}/${t.href}`,{waitUntil:'load'}); await p.waitForTimeout(700);
  const txt=(await p.locator('#view').innerText()).trim();
  const bad=/Not found|locked|Unlock|after N|complete N/i.test(txt.slice(0,300));
  if(txt.length<80||bad){empty++;console.log('  !! GATED/EMPTY',t.href,txt.slice(0,120));}
  else opened++;
}
console.log(`modules opened with full content on a day-one profile: ${opened}/${tiles.length}  (blocked: ${empty})`);

// where does the Business entry sit on the Levels tab?
await p.goto(`${BASE}/#/levels`,{waitUntil:'load'}); await p.waitForTimeout(1000);
const geo=await p.evaluate(()=>{
  const a=document.querySelector('a.tile[href="#/business"]');
  const sc=document.scrollingElement;
  return {y:Math.round(a.getBoundingClientRect().top), vh:innerHeight, pageH:Math.round(sc.scrollHeight), scrollable:sc.scrollHeight-innerHeight};
});
console.log('Levels tab:',JSON.stringify(geo));

// is it visible after ONE swipe / is the page even more than one screen?
await p.evaluate(()=>document.scrollingElement.scrollTo(0,99999)); await p.waitForTimeout(400);
const vis=await p.evaluate(()=>{const a=document.querySelector('a.tile[href="#/business"]');const r=a.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0;});
console.log('business tile visible after one scroll-to-bottom:',vis);
await p.screenshot({path:'build/test/shots/refute55-levels-bottom.png'});

// Does the Today screen offer any business entry point?
await p.goto(`${BASE}/#/today`,{waitUntil:'load'}); await p.waitForTimeout(900);
console.log('business links on Today:',await p.$$eval('a[href^="#/business"]',a=>a.length));

// Does anything in the app point at the new-words-per-day setting?
await p.goto(`${BASE}/#/settings`,{waitUntil:'load'}); await p.waitForTimeout(900);
const opts=await p.$eval('#npd',s=>({value:s.value,options:[...s.options].map(o=>o.text)})).catch(e=>String(e));
console.log('newPerDay control on Settings:',JSON.stringify(opts));
console.log('pageerrors:',errs);
await b.close();
