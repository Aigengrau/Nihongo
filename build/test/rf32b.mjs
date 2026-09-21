import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();

// A: healthy baseline, SW blocked
{
  const ctx=await b.newContext({...devices['Pixel 7'],serviceWorkers:'block'});
  const p=await ctx.newPage();
  await p.goto(`${BASE}/#/read/s/n5-white-cat`,{waitUntil:'load'}); await p.waitForTimeout(2500);
  console.log('A healthy: wchip =', await p.locator('.wchip').count());
  await ctx.close();
}
// B: abort first, then FULL reload (not hash nav) — does it recover?
{
  const ctx=await b.newContext({...devices['Pixel 7'],serviceWorkers:'block'});
  let n=0; await ctx.route('**/data/dict/common.json', async r=>{ n++; if(n===1) await r.abort('failed'); else await r.continue(); });
  const p=await ctx.newPage();
  await p.goto(`${BASE}/#/read/s/n5-white-cat`,{waitUntil:'load'}); await p.waitForTimeout(2200);
  console.log('B after fail: wchip =', await p.locator('.wchip').count(), 'req', n);
  // tap-word simulation: click a line
  await p.reload({waitUntil:'load'}); await p.waitForTimeout(2500);
  console.log('B after reload: wchip =', await p.locator('.wchip').count(), 'req', n);
  await ctx.close();
}
// C: with SERVICE WORKER active (realistic). abort first dict req only.
{
  const ctx=await b.newContext({...devices['Pixel 7']});
  let n=0,ab=0; await ctx.route('**/data/dict/common.json', async r=>{ n++; if(n===1){ab++;await r.abort('failed');} else await r.continue(); });
  const p=await ctx.newPage();
  await p.goto(`${BASE}/#/today`,{waitUntil:'load'}); await p.waitForTimeout(3000);
  await p.goto(`${BASE}/#/read/s/n5-white-cat`,{waitUntil:'load'}); await p.waitForTimeout(2500);
  console.log('C sw-on after 1 abort: wchip =', await p.locator('.wchip').count(), 'reqs', n, 'aborted', ab);
  await p.goto(`${BASE}/#/read/s/n5-nine-hundred-yen`,{waitUntil:'load'}); await p.waitForTimeout(2500);
  console.log('C sw-on 2nd story: wchip =', await p.locator('.wchip').count(), 'reqs', n);
  await ctx.close();
}
await b.close();
