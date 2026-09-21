import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));

// Serve watch.js with the `scriptOnly is not defined` crash patched out, so the
// rest of the subtitle path can be exercised at all.
const src = fs.readFileSync('app/js/screens/watch.js','utf8').replace('scriptOnly = true;','/*patched*/');
await ctx.route('**/js/screens/watch.js', r => r.fulfill({ contentType:'text/javascript', body: src }));

const ID='TESTVID001';
const LINES=['今日は天気がいいので、公園まで歩いて行きました。','私は毎朝七時に起きて、朝ご飯を食べます。','日本語を勉強していますが、漢字が難しいです。','来週の会議までにこの資料を準備しておいてください。'];
const N=400;
const cues=Array.from({length:N},(_,i)=>({t:i*3,d:3,x:LINES[i%4],en:'English subtitle line '+i}));
await ctx.route('**/data/videos/index.json', r=>r.fulfill({contentType:'application/json',body:JSON.stringify([{id:ID,title:'Baked subtitle test',channel:'ch',lv:'N5',durationSec:N*3,jaTrack:'manual',enTrack:true,cues:N,subs:true}])}));
await ctx.route(`**/data/videos/${ID}.json`, r=>r.fulfill({contentType:'application/json',body:JSON.stringify({id:ID,title:'Baked subtitle test',channel:'ch',lv:'N5',jaTrack:'manual',cues})}));

const t0=Date.now();
await page.goto(`${BASE}/#/watch/v/${ID}`,{waitUntil:'load'});
await page.waitForSelector('.subline',{timeout:120000}).catch(e=>console.log('   no sublines:',e.message.slice(0,60)));
console.log('   first subtitle painted after', Date.now()-t0,'ms  (400 cues)');
await page.waitForTimeout(2500);
console.log('   sublines:',await page.locator('.subline').count(),' chips:',await page.locator('.wchip').count());
console.log('   view:',(await page.locator('#view').innerText()).slice(0,120).replace(/\s+/g,' '));
// tap a word
if (await page.locator('.wchip').count()) {
  await page.evaluate(()=>document.querySelector('.wchip').click());
  await page.waitForTimeout(1200);
  console.log('   word sheet:',await page.locator('#sheet').isVisible(),(await page.locator('#sheetBody').innerText()).slice(0,60).replace(/\s+/g,' '));
}
console.log('   errors:',errs.length?errs:'none');
await page.screenshot({path:'build/test/shots/adv-subs.png'});
await browser.close();
