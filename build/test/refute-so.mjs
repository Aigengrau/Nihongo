import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const ID='TESTVID001';
const LINES=['今日は天気がいいので、公園まで歩いて行きました。','私は毎朝七時に起きて、朝ご飯を食べます。'];
const cues=Array.from({length:60},(_,i)=>({t:i*3,d:3,x:LINES[i%2],en:'English line '+i}));
const browser=await chromium.launch();

async function run(label,{blockYT,fixture}){
  const ctx=await browser.newContext({...devices['Pixel 7']});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  if(blockYT) await ctx.route('**youtube.com/**',r=>r.abort());
  if(fixture){
    await ctx.route('**/data/videos/index.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify([{id:ID,title:'Baked test',channel:'ch',lv:'N5',durationSec:180,jaTrack:'manual',enTrack:true,cues:cues.length,subs:true}])}));
    await ctx.route(`**/data/videos/${ID}.json`,r=>r.fulfill({contentType:'application/json',body:JSON.stringify({id:ID,title:'Baked test',channel:'ch',lv:'N5',jaTrack:'manual',cues})}));
  }
  const vid = fixture?ID:(await (await fetch(BASE+'/data/videos/index.json')).json())[0].id;
  const t0=Date.now();
  await page.goto(`${BASE}/#/watch/v/${vid}`,{waitUntil:'load'});
  await page.waitForTimeout(1000);
  const early=await page.locator('.subline').count();
  await page.waitForFunction(()=>document.querySelector('#view')?.innerText.includes('Something went wrong'),null,{timeout:15000}).then(()=>console.log(`   [${label}] CRASHED after ${Date.now()-t0}ms`)).catch(()=>console.log(`   [${label}] no crash within 15s`));
  console.log(`   [${label}] sublines @1s=${early} now=${await page.locator('.subline').count()} view="${(await page.locator('#view').innerText()).slice(0,90).replace(/\s+/g,' ')}"`);
  console.log(`   [${label}] pageerrors:`,errs.length?errs:'none');
  await ctx.close();
}
console.log('A. real catalogue video, youtube blocked');      await run('A',{blockYT:true,fixture:false});
console.log('B. real catalogue video, youtube reachable');    await run('B',{blockYT:false,fixture:false});
console.log('C. baked-subs fixture, youtube blocked');        await run('C',{blockYT:true,fixture:true});
console.log('D. baked-subs fixture, youtube reachable');      await run('D',{blockYT:false,fixture:true});
await browser.close();
