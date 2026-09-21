import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const BASE='http://localhost:8099';
// 400 DISTINCT subtitle lines, built from the shipped Tatoeba corpus
const sents = Object.values(JSON.parse(fs.readFileSync('app/data/sentences.json','utf8'))).slice(0,400);
const cues = sents.map((s,i)=>({t:i*3,d:3,x:s[0],en:s[1]}));
console.log('M. 400 distinct real sentences as a subtitle track');
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
const src = fs.readFileSync('app/js/screens/watch.js','utf8').replace('scriptOnly = true;','/*patched*/');
await ctx.route('**/js/screens/watch.js', r=>r.fulfill({contentType:'text/javascript',body:src}));
const ID='TESTVID002';
await ctx.route('**/data/videos/index.json', r=>r.fulfill({contentType:'application/json',body:JSON.stringify([{id:ID,title:'T',channel:'c',lv:'N5',durationSec:1200,jaTrack:'manual',enTrack:true,cues:cues.length,subs:true}])}));
await ctx.route(`**/data/videos/${ID}.json`, r=>r.fulfill({contentType:'application/json',body:JSON.stringify({id:ID,title:'T',channel:'c',lv:'N5',jaTrack:'manual',cues})}));
// CPU throttle to a mid-range phone
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
const t0=Date.now();
await page.goto(`${BASE}/#/watch/v/${ID}`,{waitUntil:'load'});
await page.waitForSelector('.subline',{timeout:180000}).catch(e=>console.log('  none:',e.message.slice(0,50)));
console.log('   4x CPU throttle: subtitles on screen after', Date.now()-t0,'ms');
console.log('   sublines:',await page.locator('.subline').count(),'chips:',await page.locator('.wchip').count());
console.log('   errors:',errs.length?errs:'none');
await browser.close();
