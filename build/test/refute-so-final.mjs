import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();

// 1. ONLINE control: does the same screen work when YouTube is reachable?
{
  const ctx=await b.newContext({...devices['Pixel 7']});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(BASE+'/#/watch/v/G-ArHStBCN8',{waitUntil:'load'});
  await p.waitForTimeout(9000);
  console.log('[online] text=',(await p.locator('#view').innerText()).replace(/\s+/g,' ').slice(0,120));
  console.log('[online] iframe count=',await p.locator('#pbox iframe').count(),'errs=',errs.join('|'));
  await ctx.close();
}

// 2. OFFLINE: is the app still usable after the crash? can we navigate away?
{
  const ctx=await b.newContext({...devices['Pixel 7']});
  await ctx.route('**://*.youtube.com/**', r=>r.abort());
  const p=await ctx.newPage();
  await p.goto(BASE+'/#/watch/v/G-ArHStBCN8',{waitUntil:'load'});
  await p.waitForTimeout(10000);
  console.log('[offline] crash text=',(await p.locator('#view').innerText()).replace(/\s+/g,' ').slice(0,120));
  await p.goto(BASE+'/#/home',{waitUntil:'load'});
  await p.waitForTimeout(1500);
  console.log('[offline] after nav to home=',(await p.locator('#view').innerText()).replace(/\s+/g,' ').slice(0,80));
  // second visit to watch
  await p.evaluate(()=>{location.hash='#/watch/v/G-ArHStBCN8'});
  await p.waitForTimeout(10000);
  console.log('[offline] 2nd visit=',(await p.locator('#view').innerText()).replace(/\s+/g,' ').slice(0,120));
  await ctx.close();
}

// 3. SLOW/HANGING youtube (not aborted, just never responds) -> 8s timeout path
{
  const ctx=await b.newContext({...devices['Pixel 7']});
  await ctx.route('**://*.youtube.com/**', async r=>{ await new Promise(s=>setTimeout(s,60000)); r.abort(); });
  const p=await ctx.newPage();
  await p.goto(BASE+'/#/watch/v/G-ArHStBCN8',{waitUntil:'load'});
  await p.waitForTimeout(13000);
  console.log('[hang] text=',(await p.locator('#view').innerText()).replace(/\s+/g,' ').slice(0,120));
  await ctx.close();
}
await b.close();
