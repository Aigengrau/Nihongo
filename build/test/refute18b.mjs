import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1200);

// clean slate
await page.evaluate(async () => {
  const store = await import('/js/store.js');
  for (const s of ['cards','saved','progress','reviews'])
    for (const row of await store.all(s)) await store.del(s, row.key ?? row.id);
});

// 1. Real UI: learn N5 -> enrolls 673 + does 10 new cards
await page.goto(`${BASE}/#/learn/N5`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
for (let i=0;i<10;i++) {
  const btn = page.locator('#next');
  if (!(await btn.count())) break;
  await btn.click(); await page.waitForTimeout(220);
}
console.log('after learn:', (await page.locator('#view').innerText()).replace(/\s+/g,' ').slice(0,90));

// 2. Save 3 words via the REAL word sheet UI (tap a word in a story)
await page.goto(`${BASE}/#/read/s/n5-white-cat`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
let savedCount = 0;
for (let k=0;k<3;k++) {
  const w = page.locator('.tok, [data-w], .word').nth(k+1);
  if (!(await w.count())) break;
  await w.click(); await page.waitForTimeout(700);
  const b = page.locator('#sheetSave');
  if (await b.count()) { const t = await b.innerText(); if (t.includes('Save to')) { await b.click(); await page.waitForTimeout(400); savedCount++; } }
  await page.locator('[data-close]').last().click({force:true}).catch(()=>{});
  await page.waitForTimeout(300);
}
console.log('savedViaUI:', savedCount);

const state = await page.evaluate(async () => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  return {
    savedRows: (await store.all('saved')).map(s=>s.key),
    savedCards: (await store.all('cards')).filter(c=>c.deck==='saved').map(c=>({key:c.key, ord:c.ord, vocabId:c.vocabId??null, state:c.state, dueInMs:c.due-Date.now()})),
    todayNew: (await prog.today()).new,
  };
});
console.log(JSON.stringify(state,null,2));

// 3. My words screen
await page.goto(`${BASE}/#/saved`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const ctaText = await page.locator('a.cta').first().innerText().catch(()=> 'NO CTA');
console.log('CTA:', ctaText.replace(/\s+/g,' '));
await page.screenshot({path:'build/test/shots/r18-saved.png'});

if (await page.locator('a.cta').count()) {
  await page.locator('a.cta').first().click();
  await page.waitForTimeout(1500);
  console.log('after CTA click, url=', page.url().split('#')[1]);
  console.log('screen:', (await page.locator('#view').innerText()).replace(/\s+/g,' ').slice(0,180));
  await page.screenshot({path:'build/test/shots/r18-reviewsaved.png'});
}

// 4. global review screen - do saved cards ever appear?
await page.goto(`${BASE}/#/review`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
console.log('global review:', (await page.locator('#view').innerText()).replace(/\s+/g,' ').slice(0,180));
await browser.close();
