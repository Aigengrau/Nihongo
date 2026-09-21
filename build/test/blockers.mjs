import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let fail = 0;
const check = (name, ok, detail = '') => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? '  — ' + detail : ''}`); };

// 4: word sheet coherence for kana homophones
await page.goto(`${BASE}/#/read/s/paste`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.fill('#src', 'これは私の本です。それはあなたの傘ですか。');
await page.click('#go');
await page.waitForTimeout(1200);
for (const [want, notGloss] of [['は', 'tooth'], ['の', 'field'], ['私', 'わたくし']]) {
  const chip = page.locator(`.wchip[data-s="${want}"]`).first();
  if (!(await chip.count())) { check(`word sheet: ${want}`, false, 'chip not found'); continue; }
  await chip.click();
  await page.waitForTimeout(700);
  const txt = (await page.locator('#sheetBody').innerText()).replace(/\s+/g, ' ');
  check(`word sheet "${want}" is not the homophone`, !txt.toLowerCase().includes(notGloss.toLowerCase()), txt.slice(0, 70));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
}

// 7 + 13: a saved word reaches the general review queue even with a level enrolled
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(900);
if (await page.locator('#start').count()) { await page.locator('#start').click(); await page.waitForTimeout(1500); }
await page.goto(`${BASE}/#/read/s/paste`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.fill('#src', '医者に相談してください。');
await page.click('#go');
await page.waitForTimeout(1000);
await page.locator('.wchip').first().click();
await page.waitForTimeout(800);
await page.locator('#sheetSave').click();
await page.waitForTimeout(900);
const { savedWord, ord } = await page.evaluate(async () => {
  const db = await new Promise((r) => { const q = indexedDB.open('nihongo'); q.onsuccess = () => r(q.result); });
  const rows = await new Promise((r) => { const g = db.transaction('saved').objectStore('saved').getAll(); g.onsuccess = () => r(g.result || []); });
  const last = rows.sort((a, b) => b.added - a.added)[0];
  if (!last) return { savedWord: null, ord: null };
  const all = await new Promise((r) => { const g = db.transaction('cards').objectStore('cards').getAll(); g.onsuccess = () => r(g.result || []); });
  // Either a dedicated saved card, or the level card promoted to the front.
  const card = all.find((c) => c.key === `saved:${last.key}:rec`)
            || all.find((c) => c.word === last.key || c.vocabId === last.vocabId);
  return { savedWord: last.key, ord: card?.ord ?? null };
});
check(`saved "${savedWord}" sorts to the FRONT of the new queue`, ord !== null && ord < 0, `ord=${ord}`);

// 36: tapping "Saved — remove" actually removes and does not reset the card
await page.locator('#sheetSave').click();
await page.waitForTimeout(900);
const stillThere = await page.evaluate(async (w) => {
  const db = await new Promise((r) => { const q = indexedDB.open('nihongo'); q.onsuccess = () => r(q.result); });
  return new Promise((r) => { const g = db.transaction('saved').objectStore('saved').get(w); g.onsuccess = () => r(!!g.result); });
}, savedWord);
check('"Saved — remove" actually removes', !stillThere);

// 6: backup round-trip
const restore = await page.evaluate(async () => {
  const s = await import('./js/store.js');
  const dump = await s.exportAll();
  try { await s.importAll(dump, 'merge'); return { ok: true, cards: dump.counts.cards, reviews: dump.counts.reviews }; }
  catch (e) { return { ok: false, err: String(e) }; }
});
check('restore from backup succeeds', restore.ok, restore.ok ? `${restore.cards} cards, ${restore.reviews} reviews` : restore.err);

// 11: saving from a story must not repaint the Saved screen over it
await page.goto(`${BASE}/#/saved`, { waitUntil: 'load' });
await page.waitForTimeout(900);
await page.goto(`${BASE}/#/read/s/n5-white-cat`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.locator('.wchip').first().click();
await page.waitForTimeout(700);
await page.locator('#sheetSave').click();
await page.waitForTimeout(900);
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
const title = await page.locator('#appbarTitle').innerText();
check('saving does not hijack the screen', title === 'Read', `title="${title}"`);

// 10: email builder must not double its handlers
await page.goto(`${BASE}/#/business/email`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const t0 = Date.now();
for (let i = 0; i < 12; i++) {
  const opts = page.locator('[data-slot="1"]');
  await opts.nth(i % (await opts.count())).click();
  await page.waitForTimeout(60);
}
check('email builder stays responsive after 12 taps', Date.now() - t0 < 12000, `${Date.now() - t0}ms`);

// 8: watch player survives YouTube being unreachable
await ctx.route('**://*.youtube.com/**', (r) => r.abort());
await page.goto(`${BASE}/#/watch/v/SvzCKlfD5mw`, { waitUntil: 'load' });
await page.waitForTimeout(9000);
const body = (await page.locator('#view').innerText()).replace(/\s+/g, ' ');
check('watch page survives YouTube being blocked', !body.includes('Something went wrong'), body.slice(0, 80));

console.log(`\nuncaught page errors: ${errs.length ? [...new Set(errs)].join(' | ') : 'none'}`);
console.log(`\n=== blockers ${fail === 0 && errs.length === 0 ? 'PASS' : `FAIL (${fail})`} ===`);
await browser.close();
