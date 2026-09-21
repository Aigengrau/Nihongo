// Adversarial audit of the learning engine, run against the real app in a real browser.
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  pageerror:', e.message));
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(800);
const run = (fn, arg) => page.evaluate(fn, arg);
const J = (o) => console.log(JSON.stringify(o, null, 1));

// ---------------------------------------------------------------- T3
console.log('\n=== T3  export / import round-trip ===');
J(await run(async () => {
  const store = await import('/js/store.js');
  const { newCard, review, RATING } = await import('/js/srs.js');
  for (const s of ['cards', 'progress', 'saved', 'settings']) for (const r of await store.all(s)) await store.del(s, r.key);
  const db = await store.open();
  const clear = () => new Promise((res) => { const t = db.transaction('reviews', 'readwrite'); t.objectStore('reviews').clear(); t.oncomplete = res; });
  await clear();

  let c = newCard('vocab:9:rec', 'level:N5', { word: '水', vocabId: 9, ord: 1 });
  for (let i = 0; i < 3; i++) {
    const r = review(c, RATING.GOOD, { now: Date.now() - (3 - i) * 86400000 });
    c = r.card; await store.put('cards', c); await store.put('reviews', r.log);
  }
  await store.put('saved', { key: '水', word: '水', meaning: 'water', added: Date.now() });
  await store.setSetting('newPerDay', 25);
  const dump = JSON.parse(JSON.stringify(await store.exportAll()));
  window.__dump = dump;
  const out = { exportedCounts: dump.counts, reviewRowsHaveIds: dump.reviews.map((r) => r.id) };

  // wipe, as after reinstalling the app / new phone
  for (const s of ['cards', 'progress', 'saved', 'settings']) for (const r of await store.all(s)) await store.del(s, r.key);
  await clear();
  try {
    await store.importAll(JSON.parse(JSON.stringify(dump)), 'merge');
    out.restore = 'ok';
  } catch (e) { out.restore = 'THREW: ' + e.name + ': ' + e.message; }
  out.afterRestore = {
    cards: (await store.all('cards')).length,
    reviews: (await store.all('reviews')).length,
    saved: (await store.all('saved')).length,
    newPerDay: await store.setting('newPerDay'),
  };
  out.cardByteIdentical = JSON.stringify((await store.all('cards'))[0]) === JSON.stringify(dump.cards[0]);

  // would deleting the id instead of setting it undefined work?
  try {
    await new Promise((res, rej) => {
      const t = db.transaction('reviews', 'readwrite');
      dump.reviews.forEach((r) => { const q = { ...r }; delete q.id; t.objectStore('reviews').put(q); });
      t.oncomplete = res; t.onerror = () => rej(t.error);
    });
    out.deleteIdInsteadWorks = true;
    out.reviewsAfterManualFix = (await store.all('reviews')).length;
  } catch (e) { out.deleteIdInsteadWorks = 'THREW: ' + e.message; }
  return out;
}));

// ---------------------------------------------------------------- T3b: through the real UI
console.log('\n=== T3b  Restore from a backup, through the UI ===');
{
  const dump = await run(() => window.__dump);
  const tmp = 'build/test/shots/_backup.json';
  fs.writeFileSync(tmp, JSON.stringify(dump));
  await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.locator('#file').setInputFiles(tmp);
  await page.waitForTimeout(1200);
  const toast = await page.locator('.toast, #toast').allInnerTexts().catch(() => []);
  console.log('toast after restore:', JSON.stringify(toast));
  fs.unlinkSync(tmp);
}

// ---------------------------------------------------------------- T3c merge semantics
console.log('\n=== T3c  merge semantics (double import, older backup) ===');
J(await run(async () => {
  const store = await import('/js/store.js');
  const out = {};
  const dump = window.__dump;
  const noReviews = { ...dump, reviews: [] };           // avoid the throw so we can see merge behaviour
  await store.importAll(JSON.parse(JSON.stringify(noReviews)), 'merge');
  out.cardsAfterFirst = (await store.all('cards')).length;
  await store.importAll(JSON.parse(JSON.stringify(noReviews)), 'merge');
  out.cardsAfterSecond = (await store.all('cards')).length;

  await store.put('progress', { key: 'streak', current: 87, best: 87, last: '2026-09-21', freezes: 3 });
  await store.put('progress', { key: 'day:2026-09-21', day: '2026-09-21', new: 10, reviews: 40, correct: 33, minutes: 12 });
  const older = JSON.parse(JSON.stringify(noReviews));
  older.progress = [
    { key: 'streak', current: 1, best: 1, last: '2020-01-01', freezes: 0 },
    { key: 'day:2026-09-21', day: '2026-09-21', new: 1, reviews: 2, correct: 1, minutes: 1 },
  ];
  await store.importAll(older, 'merge');
  out.streakAfterMergingOlderBackup = await store.get('progress', 'streak');
  out.todayAfterMergingOlderBackup = await store.get('progress', 'day:2026-09-21');

  // a card the backup has NOT seen but which the backup's copy is older than
  const live = (await store.all('cards'))[0];
  const stale = JSON.parse(JSON.stringify(noReviews));
  stale.cards = [{ ...live, S: 0.1, D: 10, reps: 1, lastReview: 0, due: Date.now() }];
  await store.put('cards', { ...live, S: 300, lastReview: Date.now() });
  await store.importAll(stale, 'merge');
  out.cardAfterStaleMerge = { key: live.key, S: (await store.get('cards', live.key)).S };
  return out;
}));

// ---------------------------------------------------------------- T4 corruption
console.log('\n=== T4  corrupting the backup file ===');
J(await run(async () => {
  const store = await import('/js/store.js');
  const out = {};
  const bad = [
    ['missing app tag', { version: 1, cards: [] }],
    ['cards not an array', { app: 'nihongo', cards: 'nope' }],
    ['card without a key', { app: 'nihongo', cards: [{ S: 1 }] }],
    ['card with junk fields', { app: 'nihongo', cards: [{ key: 'vocab:1:rec', S: null, D: 'x', due: 'soon', state: 2, deck: 'level:N5' }] }],
    ['null progress row', { app: 'nihongo', progress: [null] }],
    ['settings with no key', { app: 'nihongo', settings: [{ value: 3 }] }],
  ];
  for (const [name, d] of bad) {
    try { await store.importAll(d, 'merge'); out[name] = 'accepted'; }
    catch (e) { out[name] = 'rejected: ' + e.message; }
  }
  const prog = await import('/js/progress.js');
  const { review, RATING, preview } = await import('/js/srs.js');
  const g = (await store.all('cards')).find((c) => c.D === 'x');
  out.junkCardStored = !!g;
  if (g) {
    const r = review(g, RATING.GOOD);
    out.gradingJunkCard = { S: r.card.S, D: r.card.D, dueIsNaN: Number.isNaN(r.card.due), sched: r.card.scheduledDays };
    out.previewJunkCard = preview(g);
    try { const s = await prog.session({}); out.junkInQueue = s.queue.some((c) => c.key === g.key); }
    catch (e) { out.session = 'THREW ' + e.message; }
  }
  return out;
}));

// ---------------------------------------------------------------- T5 memory fallback
console.log('\n=== T5  memory fallback (IndexedDB unavailable) ===');
{
  const p2 = await ctx.newPage();
  await p2.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('blocked'); } }); });
  p2.on('pageerror', (e) => console.log('  pageerror:', e.message));
  await p2.goto(`${BASE}/#/today`, { waitUntil: 'load' });
  await p2.waitForTimeout(700);
  J(await p2.evaluate(async () => {
    const store = await import('/js/store.js');
    const { newCard, review, RATING } = await import('/js/srs.js');
    const out = {};
    let c = newCard('vocab:1:rec', 'level:N5', { word: '水', vocabId: 1, ord: 0 });
    for (let i = 0; i < 4; i++) {
      const r = review(c, RATING.GOOD, { now: Date.now() - (4 - i) * 86400000 });
      c = r.card; await store.put('cards', c); await store.put('reviews', r.log);
    }
    const r2 = review(newCard('vocab:2:rec', 'level:N5', { word: '火', vocabId: 2, ord: 1 }), RATING.GOOD);
    await store.put('cards', r2.card); await store.put('reviews', r2.log);
    out.reviewsLogged = 5;
    out.reviewsStored = (await store.all('reviews')).length;
    out.cards = (await store.all('cards')).length;
    const prog = await import('/js/progress.js');
    out.historyTotalLast3Days = (await prog.history(3)).reduce((a, b) => a + b.n, 0);
    out.exportCounts = (await store.exportAll()).counts;
    try { await store.importAll({ app: 'nihongo', cards: [], reviews: [{ key: 'x', at: 1 }] }, 'merge'); out.importInFallback = 'ok'; }
    catch (e) { out.importInFallback = 'THREW ' + e.message; }
    out.reviewsAfterImport = (await store.all('reviews')).length;
    return out;
  }));
  await p2.close();
}

// ---------------------------------------------------------------- T6 mid-session durability
console.log('\n=== T6  closing the app mid-session ===');
J(await run(async () => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  const data = await import('/js/data.js');
  for (const s of ['cards', 'progress']) for (const r of await store.all(s)) await store.del(s, r.key);
  const list = await data.vocab('N5');
  await prog.enrollLevel('N5', list.slice(0, 30));
  const cards = (await store.all('cards')).slice(0, 6).map((c) => ({
    ...c, state: 2, S: 4, D: 5, due: Date.now() - 1000, lastReview: Date.now() - 4 * 86400000, reps: 2,
  }));
  await store.putMany('cards', cards);
  return { due: (await prog.inventory()).due };
}));
await page.goto(`${BASE}/#/review`, { waitUntil: 'load' });
await page.waitForTimeout(900);
console.log('review screen:', (await page.locator('#view').innerText()).slice(0, 90).replace(/\s+/g, ' '));
for (let i = 0; i < 3; i++) {
  await page.locator('#reveal').click().catch(() => {});
  await page.waitForTimeout(220);
  await page.locator('.grade[data-g="3"]').click().catch(() => {});
  await page.waitForTimeout(320);
}
console.log('mid-session state (3 of 6 graded, app still open):');
J(await run(async () => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  return { due: (await prog.inventory()).due, reviewRows: (await store.all('reviews')).length,
           today: await prog.today(), streak: await prog.streak() };
}));
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(800);
console.log('after a hard reload (app killed mid-session):');
J(await run(async () => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  return { due: (await prog.inventory()).due, reviewRows: (await store.all('reviews')).length,
           today: await prog.today(), streak: await prog.streak() };
}));
console.log('now finishing the remaining cards to the end of the session:');
await page.goto(`${BASE}/#/review`, { waitUntil: 'load' });
await page.waitForTimeout(800);
for (let i = 0; i < 4; i++) {
  await page.locator('#reveal').click().catch(() => {});
  await page.waitForTimeout(220);
  await page.locator('.grade[data-g="3"]').click().catch(() => {});
  await page.waitForTimeout(320);
}
J(await run(async () => {
  const prog = await import('/js/progress.js');
  return { today: await prog.today(), streak: await prog.streak() };
}));

await browser.close();
