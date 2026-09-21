import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const src = fs.readFileSync('app/js/screens/watch.js','utf8').replace('scriptOnly = true;','/*patched*/');

const ID='BAKED001';
const cues=Array.from({length:12},(_,i)=>({t:i*3,d:3,x:'私は毎朝七時に起きて、朝ご飯を食べます。',en:'English line '+i}));

async function run(label, {patch, baked}) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  if (patch) await ctx.route('**/js/screens/watch.js', r => r.fulfill({contentType:'text/javascript', body: src}));
  if (baked) {
    await ctx.route('**/data/videos/index.json', r=>r.fulfill({contentType:'application/json',body:JSON.stringify([{id:ID,title:'Baked',channel:'ch',lv:'N5',durationSec:36,jaTrack:'manual',enTrack:true,cues:cues.length,subs:true}])}));
    await ctx.route(`**/data/videos/${ID}.json`, r=>r.fulfill({contentType:'application/json',body:JSON.stringify({id:ID,title:'Baked',channel:'ch',lv:'N5',jaTrack:'manual',cues})}));
  }
  await ctx.route('**://*.youtube.com/**', r => r.abort());
  const id = baked ? ID : 'SvzCKlfD5mw';
  await page.goto(BASE + '/#/watch/v/' + id, { waitUntil: 'load' });
  await page.waitForTimeout(10500);
  console.log('\n=== ' + label + ' ===');
  console.log('  #view   :', (await page.locator('#view').innerText().catch(()=>'(none)')).replace(/\s+/g,' ').slice(0,200));
  console.log('  sublines:', await page.locator('.subline').count().catch(()=>-1), ' wchips:', await page.locator('.wchip').count().catch(()=>-1));
  await page.screenshot({ path: `build/test/shots/refute24-${label}.png` });
  await ctx.close();
}
await run('C-patched-nocues',  {patch:true,  baked:false});
await run('D-patched-baked',   {patch:true,  baked:true});
await run('E-unpatched-baked', {patch:false, baked:true});
await browser.close();
