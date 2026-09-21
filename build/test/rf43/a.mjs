import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));

await page.goto(`${BASE}/#/read/s/paste`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
await page.fill('#src', '今日は天気がいいので、公園まで歩いて行きました。');
await page.evaluate(()=>document.getElementById('go').click());
await page.waitForTimeout(1200);
await page.evaluate(()=>document.querySelector('.wchip').click());
await page.waitForTimeout(1200);
const btn = page.locator('#sheetSave');
console.log('label before      :', (await btn.innerText()).trim());
await page.evaluate(()=>document.getElementById('sheetSave').click());
await page.waitForTimeout(800);
console.log('label after tap 1 :', (await btn.innerText()).trim());
const dump = async () => page.evaluate(async()=>{
  const s = await import('./js/store.js');
  const saved = (await s.all('saved')).map(x=>x.key);
  const cards = (await s.all('cards')).filter(c=>c.deck==='saved').map(c=>({key:c.key,state:c.state,S:c.S,reps:c.reps,lapses:c.lapses,due:c.due}));
  return {saved, cards};
});
console.log('store after tap 1 :', JSON.stringify(await dump()));

// simulate the user having reviewed that card several times
const key = (await dump()).cards[0].key;
await page.evaluate(async (k)=>{
  const s = await import('./js/store.js');
  const c = await s.get('cards', k);
  c.state = 2; c.S = 21.5; c.D = 5.1; c.reps = 7; c.lapses = 1;
  c.due = Date.now() + 14*86400000; c.lastReview = Date.now();
  await s.put('cards', c);
}, key);
console.log('store after review:', JSON.stringify(await dump()));

await page.evaluate(()=>document.getElementById('sheetSave').click());
await page.waitForTimeout(900);
console.log('label after tap 2 :', (await btn.innerText()).trim());
console.log('store after tap 2 :', JSON.stringify(await dump()));

await page.evaluate(()=>document.getElementById('sheetSave').click());
await page.waitForTimeout(900);
console.log('label after tap 3 :', (await btn.innerText()).trim());
console.log('store after tap 3 :', JSON.stringify(await dump()));

// now close and reopen the sheet -> can we remove?
await page.evaluate(()=>document.querySelector('#sheet [data-close]').click());
await page.waitForTimeout(400);
await page.evaluate(()=>document.querySelector('.wchip').click());
await page.waitForTimeout(1200);
console.log('label on reopen   :', (await page.locator('#sheetSave').innerText()).trim());
await page.evaluate(()=>document.getElementById('sheetSave').click());
await page.waitForTimeout(800);
console.log('after reopen+tap  :', (await page.locator('#sheetSave').innerText()).trim(), JSON.stringify(await dump()));
console.log('errors:', errs.length?errs:'none');
await browser.close();
