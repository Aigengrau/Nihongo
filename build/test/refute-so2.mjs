import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const BASE='http://localhost:8099';
const ID='TESTVID001';
const cues=Array.from({length:20},(_,i)=>({t:i*3,d:3,x:'私は毎朝七時に起きます。',en:'line '+i}));
// log what the catch actually swallowed, and neutralise the undeclared assignment
let src=fs.readFileSync('app/js/screens/watch.js','utf8');
src=src.replace("  } catch {\n    scriptOnly = true;","  } catch (e) {\n    console.log('CAUGHT:'+(e&&e.message));");
if(!src.includes('CAUGHT:')) throw new Error('patch failed');
const browser=await chromium.launch();
for(const [label,blockYT,fixture] of [['A-real-blocked',true,false],['B-real-online',false,false],['D-fixture-online',false,true]]){
  const ctx=await browser.newContext({...devices['Pixel 7']});
  const page=await ctx.newPage();
  page.on('console',m=>{ if(m.text().startsWith('CAUGHT')) console.log(`   [${label}] ${m.text()}`); });
  page.on('pageerror',e=>console.log(`   [${label}] pageerror: ${e.message}`));
  await ctx.route('**/js/screens/watch.js',r=>r.fulfill({contentType:'text/javascript',body:src}));
  if(blockYT) await ctx.route('**youtube.com/**',r=>r.abort());
  if(fixture){
    await ctx.route('**/data/videos/index.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify([{id:ID,title:'Baked test',channel:'ch',lv:'N5',durationSec:60,jaTrack:'manual',enTrack:true,cues:cues.length,subs:true}])}));
    await ctx.route(`**/data/videos/${ID}.json`,r=>r.fulfill({contentType:'application/json',body:JSON.stringify({id:ID,title:'Baked test',channel:'ch',lv:'N5',jaTrack:'manual',cues})}));
  }
  const vid=fixture?ID:(await (await fetch(BASE+'/data/videos/index.json')).json())[0].id;
  await page.goto(`${BASE}/#/watch/v/${vid}`,{waitUntil:'load'});
  await page.waitForTimeout(11000);
  console.log(`   [${label}] sublines=${await page.locator('.subline').count()} chips=${await page.locator('.wchip').count()} view="${(await page.locator('#view').innerText()).slice(0,100).replace(/\s+/g,' ')}"`);
  await ctx.close();
}
await browser.close();
