import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(1500);

// Seed three recognition cards that are mature enough to unlock production.
const seeded = await page.evaluate(async () => {
  const s = await import('./js/store.js');
  const d = await import('./js/data.js');
  const v = await d.vocab('N5');
  const picks = v.filter((w) => w.r && w.r.length >= 2 && w.r.length <= 5).slice(0, 3);
  for (const w of picks) {
    await s.put('cards', {
      key: `vocab:${w.id}:rec`, deck: 'level:N5', state: 2, S: 40, D: 5,
      due: Date.now() + 86400000, lastReview: Date.now() - 86400000,
      reps: 8, lapses: 0, learnReps: 0, suspended: false,
      word: w.w, reading: w.r, vocabId: w.id, ord: w.ord, lv: 'N5',
    });
  }
  return picks.map((w) => `${w.w}(${w.r})`);
});
console.log('seeded mature words:', seeded.join(', '));

await page.goto(`${BASE}/#/produce`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
const head = (await page.locator('#view').innerText()).replace(/\s+/g, ' ').slice(0, 110);
console.log('screen:', head);

const tiles = await page.locator('#tiles .kana-cell').count();
console.log('kana tiles offered:', tiles);

// Build the correct answer by reading the prompt's target from the card store.
const answer = await page.evaluate(async () => {
  const s = await import('./js/store.js');
  const cards = (await s.all('cards')).filter((c) => c.key.endsWith(':prod'));
  return cards[0]?.reading || null;
});
console.log('expected reading:', answer);

let built = '';
for (const ch of [...(answer || '')]) {
  const tile = page.locator(`#tiles .kana-cell:not([disabled]):has-text("${ch}")`).first();
  if (!(await tile.count())) { console.log('  tile missing for', ch); break; }
  await tile.click();
  built += ch;
  await page.waitForTimeout(120);
}
console.log('built:', built);
await page.click('#check');
await page.waitForTimeout(900);
const result = (await page.locator('#view').innerText()).replace(/\s+/g, ' ').slice(0, 90);
console.log('result:', result);
await page.screenshot({ path: 'build/test/shots/produce.png' });

const ok = tiles > 0 && result.includes('Correct') && errs.length === 0;
console.log(`\nerrors: ${errs.length ? errs.join(' | ') : 'none'}`);
console.log(`=== production practice ${ok ? 'PASS' : 'FAIL'} ===`);
await browser.close();
