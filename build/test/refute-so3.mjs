import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const BASE='http://localhost:8099';
const browser=await chromium.launch();

// ---- 1. genuine PWA offline (service worker), unpatched app
{
  const ctx=await browser.newContext({...devices['Pixel 7']});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await page.goto(BASE+'/#/watch/N5',{waitUntil:'load'});
  await page.waitForTimeout(2500);                     // let the SW install + cache
  const id=(await (await fetch(BASE+'/data/videos/index.json')).json())[0].id;
  await ctx.setOffline(true);
  await page.goto(`${BASE}/#/watch/v/${id}`,{waitUntil:'load'}).catch(e=>console.log('nav:',e.message.slice(0,60)));
  await page.waitForTimeout(12000);
  console.log('1. true offline (SW-served), unpatched:');
  console.log('   view:',(await page.locator('#view').innerText()).slice(0,110).replace(/\s+/g,' '));
  await ctx.setOffline(false); await ctx.close();
}
// ---- 2. scriptOnly patched out, YT hangs 8s, user navigates away -> #pbox gone?
{
  const src=fs.readFileSync('app/js/screens/watch.js','utf8').replace('scriptOnly = true;','/*patched*/');
  const ctx=await browser.newContext({...devices['Pixel 7']});
  const page=await ctx.newPage();
  const errs=[]; page.on('pageerror',e=>errs.push(e.message));
  await ctx.route('**/js/screens/watch.js',r=>r.fulfill({contentType:'text/javascript',body:src}));
  await ctx.route('**youtube.com/**',()=>{});          // hang forever -> 8s timeout path
  const id=(await (await fetch(BASE+'/data/videos/index.json')).json())[0].id;
  await page.goto(`${BASE}/#/watch/v/${id}`,{waitUntil:'load'});
  await page.waitForTimeout(2000);
  await page.evaluate(()=>{location.hash='/today';});  // leave before the 8s timeout fires
  await page.waitForTimeout(9000);
  console.log('2. patched, YT times out after user left:');
  console.log('   view:',(await page.locator('#view').innerText()).slice(0,80).replace(/\s+/g,' '));
  console.log('   pageerrors:',errs.length?errs:'none');
  await ctx.close();
}
await browser.close();
