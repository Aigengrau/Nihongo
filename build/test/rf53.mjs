import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const browser=await chromium.launch();
const ctx=await browser.newContext({...devices['Pixel 7']});
const page=await ctx.newPage();
await page.goto(`${BASE}/#/conjugate/N5`,{waitUntil:'load'});
await page.waitForTimeout(1200);

// sample 60 prompts by clicking through
const seen={};
let outOfLevel=0, total=0;
for(let i=0;i<60;i++){
  const label=await page.locator('.review-card div').last().textContent().catch(()=>null);
  if(!label) break;
  const f=label.replace('→','').trim();
  seen[f]=(seen[f]||0)+1; total++;
  const btns=page.locator('#opts button');
  const n=await btns.count();
  if(!n) break;
  await btns.nth(0).click();
  await page.waitForTimeout(1600);
}
console.log('=== form distribution over',total,'live prompts at N5 ===');
for(const [k,v] of Object.entries(seen).sort((a,b)=>b[1]-a[1])) console.log(String(v).padStart(3),k);
const N4PLUS=['potential','passive','causative','volitional','conditional (ば)'];
const bad=Object.entries(seen).filter(([k])=>N4PLUS.some(x=>k.includes(x))).reduce((s,[,v])=>s+v,0);
console.log(`\nOUT-OF-LEVEL (N4+) prompts: ${bad}/${total} = ${(100*bad/total).toFixed(0)}%`);

// furigana on options?
const optHTML=await page.locator('#opts').innerHTML();
console.log('\noptions contain <ruby>?', /<ruby/i.test(optHTML));
console.log('sample option HTML:', optHTML.slice(0,240).replace(/\s+/g,' '));

// persistence: note score, navigate away and back
const top=await page.locator('.review-top').innerText();
console.log('\nscore before navigate:', top.replace(/\s+/g,' '));
await page.goto(`${BASE}/#/level/N5`,{waitUntil:'load'}); await page.waitForTimeout(700);
await page.goto(`${BASE}/#/conjugate/N5`,{waitUntil:'load'}); await page.waitForTimeout(1200);
console.log('score after return:  ', (await page.locator('.review-top').innerText()).replace(/\s+/g,' '));

// any SRS cards created with a conj key?
const ls=await page.evaluate(()=>{const o={};for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);o[k]=(localStorage.getItem(k)||'').length;}return o;});
console.log('\nlocalStorage keys:',JSON.stringify(ls));
const conjKeys=await page.evaluate(()=>{const out=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);const v=localStorage.getItem(k)||'';if(v.includes('conj'))out.push(k);}return out;});
console.log('storage values mentioning "conj":',conjKeys.length?conjKeys:'(none)');
await browser.close();
