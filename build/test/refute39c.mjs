import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const browser=await chromium.launch();
const c=await browser.newContext({...devices['Pixel 7'],hasTouch:true,isMobile:true});
const p=await c.newPage();
await p.goto(`${BASE}/#/today`,{waitUntil:'load'}); await p.waitForTimeout(3000);
if(await p.locator('#start').count()){await p.evaluate(()=>document.getElementById('start').click());await p.waitForTimeout(2000);}
await p.goto(`${BASE}/#/learn/N5`,{waitUntil:'load'}); await p.waitForTimeout(3000);
// force the same-tick double dispatch
await p.evaluate(()=>{const b=document.getElementById('next');b.click();b.click();});
await p.waitForTimeout(1500);
console.log('header after same-tick double:', (await p.locator('.review-top').innerText()).replace(/\s+/g,' '));
const st=await p.evaluate(async()=>{const s=await import('./js/store.js');const cards=await s.all('cards');
  return cards.filter(c=>c.vocabId<=3).map(c=>({key:c.key,state:c.state,reps:c.reps,due:c.due}));});
console.log('card states after:', JSON.stringify(st,null,0));
await p.goto(`${BASE}/#/today`,{waitUntil:"load"}); await p.waitForTimeout(1500);
await p.goto(`${BASE}/#/learn/N5`,{waitUntil:'load'}); await p.waitForTimeout(3000);
const body=(await p.locator('#view').innerText()).slice(0,120).replace(/\s+/g,' ');
console.log('re-entering Learn shows:', body);
await browser.close();
