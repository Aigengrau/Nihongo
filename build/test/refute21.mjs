// Refute/confirm finding 21: streak credited only on finishing the whole queue.
import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  pageerror:', e.message));
const run = (fn, arg) => page.evaluate(fn, arg);
const J = (l, o) => console.log(l, JSON.stringify(o));

await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

const wipe = async () => run(async () => {
  const store = await import('/js/store.js');
  for (const s of ['cards', 'progress', 'saved', 'settings']) for (const r of await store.all(s)) await store.del(s, r.key);
  const db = await store.open();
  await new Promise((res) => { const t = db.transaction('reviews', 'readwrite'); t.objectStore('reviews').clear(); t.oncomplete = res; });
  return 'wiped';
});

const snap = () => run(async () => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  return {
    streak: await prog.streak(),
    today: await prog.today(),
    reviewRows: (await store.all('reviews')).length,
    due: (await prog.inventory()).due,
  };
});

// ------------------------------------------------ Part A: partial review session
console.log('=== A: seed 6 due review cards, grade 3 through the UI, reload ===');
console.log(await wipe());
J('seeded:', await run(async () => {
  const store = await import('/js/store.js');
  const { newCard, review, RATING, STATE } = await import('/js/srs.js');
  const data = await import('/js/data.js');
  const list = (await data.vocab('N5')).slice(0, 6);
  const now = Date.now();
  for (const w of list) {
    let c = newCard(`vocab:${w.id}:rec`, 'level:N5', { word: w.w, reading: w.r, vocabId: w.id, ord: w.ord, lv: 'N5' });
    const r = review(c, RATING.GOOD, { now: now - 5 * 86400000 });
    c = r.card;
    c.due = now - 3600000; // due an hour ago
    await store.put('cards', c);
  }
  return { cards: (await store.all('cards')).length, due: (await (await import('/js/progress.js')).inventory()).due };
}));

J('before:', await snap());

await page.goto(`${BASE}/#/review`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
console.log('queue header:', (await page.locator('.review-top').innerText().catch(() => '?')).replace(/\s+/g, ' '));

for (let n = 0; n < 3; n++) {
  await page.click('#reveal');
  await page.waitForTimeout(250);
  await page.click('.grade[data-g="3"]');
  await page.waitForTimeout(350);
}
J('after grading 3 (in page):', await snap());

// hard reload, as if the learner closed the app
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(900);
J('after reload:', await snap());
console.log('Today screen shows:', (await page.locator('#view').innerText()).split('\n').slice(0, 8).join(' | '));

// ------------------------------------------------ Part B: finish the queue
console.log('\n=== B: now finish the remaining 3 ===');
await page.goto(`${BASE}/#/review`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
for (let n = 0; n < 10; n++) {
  if (!(await page.locator('#reveal').count())) break;
  await page.click('#reveal');
  await page.waitForTimeout(200);
  await page.click('.grade[data-g="3"]');
  await page.waitForTimeout(300);
}
await page.waitForTimeout(500);
J('after finishing:', await snap());

// ------------------------------------------------ Part C: open Learn and leave immediately
console.log('\n=== C: wipe, open #/learn/N5, leave without grading anything ===');
console.log(await wipe());
await page.goto(`${BASE}/#/learn/N5`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
console.log('learn screen first line:', (await page.locator('#view').innerText()).split('\n').slice(0, 3).join(' | '));
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(800);
J('streak after merely opening Learn:', await snap());

await browser.close();
