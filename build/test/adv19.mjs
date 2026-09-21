import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const BASE='http://localhost:8099';
const browser=await chromium.launch(); const ctx=await browser.newContext({...devices['Pixel 7']}); const page=await ctx.newPage();
const errs=[]; page.on('pageerror',e=>errs.push(e.message));
await page.goto(`${BASE}/#/read/s/paste`,{waitUntil:'load'});
await page.waitForTimeout(3000);

console.log('N1. emoji / surrogate text in the reader');
await page.fill('#src','今日は😀天気がいいので🇯🇵、公園まで歩いて行きました。');
await page.evaluate(()=>document.getElementById('go').click());
await page.waitForTimeout(1500);
console.log('   chips:',await page.locator('.wchip').count(),' text ok:',(await page.locator('#lines').innerText()).slice(0,40).replace(/\s+/g,' '));
console.log('   chips whose label is a broken surrogate:', await page.evaluate(()=>[...document.querySelectorAll('.wchip')].filter(b=>/[\uD800-\uDFFF]/.test(b.textContent)||b.textContent==='\uFFFD').length));
console.log('   errors:',errs.length?errs:'none'); errs.length=0;

console.log('\nN2. paste a real article (11k chars) on a 4x-throttled phone');
const sents = Object.values(JSON.parse(fs.readFileSync('app/data/sentences.json','utf8'))).slice(500,900).map(s=>s[0]);
const article = sents.join('');
console.log('   pasted length:', article.length);
const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
await page.fill('#src', article);
const t0=Date.now();
await page.evaluate(()=>document.getElementById('go').click());
await page.waitForSelector('#lines .wchip',{timeout:240000}).catch(e=>console.log('   timed out:',e.message.slice(0,50)));
console.log('   time to render:',Date.now()-t0,'ms   chips:',await page.locator('.wchip').count());
console.log('   errors:',errs.length?errs:'none');
await browser.close();
