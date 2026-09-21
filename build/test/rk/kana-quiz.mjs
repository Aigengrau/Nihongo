import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('pageerror:', e.message));

await page.goto(`${BASE}/#/kana`, { waitUntil: 'load' });
await page.waitForTimeout(1200);

const cells = await page.locator('.kana-cell:not(.empty)').count();
const grids = await page.locator('.kana-grid').count();
const header = (await page.locator('#view p').first().innerText()).trim();
console.log('cells rendered at once:', cells, ' grids:', grids);
console.log('header:', JSON.stringify(header));
const heads = await page.locator('#view h2, #view h3, #view .seg button').allInnerTexts();
console.log('headings/segments:', JSON.stringify(heads));

// read progress before
const readProgress = () => page.evaluate(() => new Promise((res, rej) => {
  const r = indexedDB.open('nihongo');
  r.onsuccess = () => { const db = r.result;
    const names = [...db.objectStoreNames];
    const tx = db.transaction(names, 'readonly');
    const out = {};
    let left = names.length;
    if (!left) return res({names, out});
    names.forEach(n => { const q = tx.objectStore(n).getAll(); q.onsuccess = () => { out[n] = q.result; if(!--left) res({names, out}); }; });
  };
  r.onerror = () => rej(r.error);
}));

const before = await readProgress();
console.log('stores:', before.names.join(','));
console.log('progress before:', JSON.stringify(before.out.progress || null));
console.log('cards before:', (before.out.cards || []).length, 'kana-ish:', (before.out.cards||[]).filter(c=>String(c.id||c.key||'').includes('kana')).length);

// Run the quiz: answer 12 questions
await page.locator('#quiz').evaluate(el => el.click());
await page.waitForTimeout(600);
for (let i = 0; i < 12; i++) {
  const btns = page.locator('#opts [data-r]');
  const n = await btns.count();
  if (!n) { console.log('no options at iter', i); break; }
  const label = await page.locator('.sheet p.small, #view p.small').first().innerText().catch(()=> '');
  await btns.nth(0).click();
  await page.waitForTimeout(600);
}
const counterLine = await page.locator('p.small.faint.center').first().innerText().catch(()=>'(none)');
console.log('quiz counter line after 12 answers:', JSON.stringify(counterLine));

// close sheet
await page.locator('[data-close]').last().click().catch(()=>{});
await page.waitForTimeout(500);

const after = await readProgress();
console.log('progress after:', JSON.stringify(after.out.progress || null));
console.log('cards after:', (after.out.cards || []).length);
const diff = JSON.stringify(before.out) === JSON.stringify(after.out);
console.log('ALL STORES UNCHANGED BY QUIZ:', diff);

// reload and read header counter
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1000);
console.log('header after reload:', JSON.stringify((await page.locator('#view p').first().innerText()).trim()));

await browser.close();
