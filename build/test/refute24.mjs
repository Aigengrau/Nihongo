import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const ID = 'SvzCKlfD5mw';
const browser = await chromium.launch();

async function run(label, setup) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  const pe = []; page.on('pageerror', e => pe.push(e.message));
  const ce = []; page.on('console', m => { if (m.type()==='error') ce.push(m.text()); });
  await page.goto(BASE + '/#/today', { waitUntil: 'load' });
  await page.waitForTimeout(1500);           // let SW + data warm
  await setup(ctx, page);
  await page.goto(BASE + '/#/watch/v/' + ID, { waitUntil: 'load' }).catch(e=>console.log('  goto err', e.message.slice(0,60)));
  await page.waitForTimeout(11000);
  const txt = (await page.locator('#view').innerText().catch(()=> '(none)')).replace(/\s+/g,' ').slice(0,220);
  const sublines = await page.locator('.subline').count().catch(()=>-1);
  const pbox = (await page.locator('#pbox').innerText().catch(()=> '(no #pbox)')).replace(/\s+/g,' ').slice(0,140);
  console.log('\n=== ' + label + ' ===');
  console.log('  #view    :', txt);
  console.log('  #pbox    :', pbox);
  console.log('  .subline :', sublines);
  console.log('  pageerror:', [...new Set(pe)].slice(0,4));
  console.log('  consoleer:', [...new Set(ce)].slice(0,4).map(s=>s.slice(0,120)));
  await page.screenshot({ path: `build/test/shots/refute24-${label}.png` });
  await ctx.close();
}

await run('A-youtube-blocked', async (ctx) => {
  await ctx.route('**://*.youtube.com/**', r => r.abort());
});
await run('B-fully-offline', async (ctx) => {
  await ctx.setOffline(true);
});
await browser.close();
