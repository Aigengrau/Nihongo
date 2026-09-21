// Refutation attempt for finding 23: burySiblings misses saved-vs-level duplicate.
import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  pageerror:', e.message));
const J = (o) => console.log(JSON.stringify(o, null, 1));
const run = (fn, a) => page.evaluate(fn, a);

await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
await page.waitForLoadState('networkidle').catch(()=>{});

// ---------------------------------------------------------- A: unit level
console.log('\n=== A  burySiblings unit behaviour ===');
J(await run(async () => {
  const { burySiblings, newCard } = await import('/js/srs.js');
  const a = newCard('vocab:3:rec', 'level:N5', { word: '本当', vocabId: 3 });
  const b = newCard('saved:本当:rec', 'saved', { word: '本当' });
  const r = burySiblings([a, b]);
  return { queue: r.queue.map((c) => c.key), buried: r.buried.map((c) => c.key) };
}));

// ---------------------------------------------------------- B: through the real UI
console.log('\n=== B  real UI: open N5 word list, tap a word, Save, then #/review ===');

// wipe
await run(async () => {
  const store = await import('/js/store.js');
  for (const s of ['cards', 'progress', 'saved', 'settings']) for (const r of await store.all(s)) await store.del(s, r.key);
  const db = await store.open();
  await new Promise((res) => { const t = db.transaction('reviews', 'readwrite'); t.objectStore('reviews').clear(); t.oncomplete = res; });
});

// enrol N5 the way the app does when you open the level
const enrolled = await run(async () => {
  const data = await import('/js/data.js');
  const { enrollLevel } = await import('/js/progress.js');
  const list = await data.vocab('N5');
  return { added: await enrollLevel('N5', list), first: list.slice(0, 3).map((w) => ({ id: w.id, w: w.w, ord: w.ord })) };
});
J(enrolled);

// now actually tap the first N5 word in the words screen and press Save
await page.goto(`${BASE}/#/words/N5`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const firstRow = page.locator('#list [data-id]').first();
await firstRow.click().catch(() => {});
await page.waitForTimeout(900);
const sheetTitle = await page.locator('#sheetBody h2').first().innerText().catch(() => '(no sheet)');
console.log('word sheet headword:', JSON.stringify(sheetTitle));
await page.locator('#sheetSave').dispatchEvent('click').catch((e) => console.log('save click failed', e.message));
await page.waitForTimeout(700);

J(await run(async () => {
  const store = await import('/js/store.js');
  const cards = await store.all('cards');
  const saved = await store.all('saved');
  const savedCards = cards.filter((c) => c.key.startsWith('saved:'));
  return {
    savedRows: saved.map((s) => ({ key: s.key, vocabId: s.vocabId, lv: s.lv })),
    savedCards: savedCards.map((c) => ({ key: c.key, word: c.word, vocabId: c.vocabId, deck: c.deck, ord: c.ord })),
    matchingVocabCards: cards.filter((c) => savedCards.some((s) => s.word === c.word) && c.key.startsWith('vocab:'))
      .map((c) => ({ key: c.key, word: c.word, vocabId: c.vocabId, ord: c.ord, state: c.state })),
  };
}));

// ---------------------------------------------------------- C: does the dup actually reach one queue?
console.log('\n=== C  is the duplicate reachable in a real session()? ===');

// C1: straight out of the box, both cards NEW
J(await run(async () => {
  const { session } = await import('/js/progress.js');
  const { queue, buried } = await session({});
  const words = queue.map((c) => c.word);
  const dupWords = [...new Set(words.filter((w, i) => words.indexOf(w) !== i))];
  return { n: queue.length, savedInQueue: queue.filter((c) => c.key.startsWith('saved:')).map((c) => c.key), dupWords, buried: buried.map((c) => c.key) };
}));

// C2: realistic day-2 state -- both cards have been studied and are now due
J(await run(async () => {
  const store = await import('/js/store.js');
  const { session } = await import('/js/progress.js');
  const { STATE } = await import('/js/srs.js');
  const cards = await store.all('cards');
  const savedCard = cards.find((c) => c.key.startsWith('saved:'));
  const twin = cards.find((c) => c.key.startsWith('vocab:') && c.word === savedCard.word);
  const now = Date.now();
  for (const c of [savedCard, twin]) {
    await store.put('cards', { ...c, state: STATE.REVIEW, due: now - 3600e3, S: 2, D: 5, reps: 3, lapses: 0, last: now - 86400e3 });
  }
  const { queue, buried } = await session({});
  const words = queue.map((c) => c.word);
  const dupWords = [...new Set(words.filter((w, i) => words.indexOf(w) !== i))];
  return {
    word: savedCard.word,
    queueKeysForThatWord: queue.filter((c) => c.word === savedCard.word).map((c) => c.key),
    buried: buried.map((c) => c.key),
    dupWords,
  };
}));

// C3: same-day learning steps -- user learns the level card, then saves the word
//     from the sheet mid-session; both land in the same queue as due/learning cards.
J(await run(async () => {
  const store = await import('/js/store.js');
  const { session } = await import('/js/progress.js');
  const { review, RATING, newCard } = await import('/js/srs.js');
  const cards = await store.all('cards');
  const savedCard = cards.find((c) => c.key.startsWith('saved:'));
  const twin = cards.find((c) => c.key.startsWith('vocab:') && c.word === savedCard.word);
  // grade both "Again" like a normal learner does -> learning state, due in minutes
  const now = Date.now() - 30 * 60e3;
  for (const c of [savedCard, twin]) {
    const r = review({ ...c, state: 0, due: now, S: 0, D: 0, reps: 0, lapses: 0, last: null }, RATING.AGAIN, { now });
    await store.put('cards', r.card);
  }
  const { queue, buried } = await session({});
  return {
    states: (await store.all('cards')).filter((c) => c.word === savedCard.word).map((c) => ({ key: c.key, state: c.state, dueInMin: Math.round((c.due - Date.now()) / 60000) })),
    queueKeysForThatWord: queue.filter((c) => c.word === savedCard.word).map((c) => c.key),
    buried: buried.map((c) => c.key),
  };
}));

// ---------------------------------------------------------- D: what the learner actually sees
console.log('\n=== D  the review screen, rendered ===');
await page.goto(`${BASE}/#/review`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const seen = [];
for (let i = 0; i < 6; i++) {
  const face = await page.locator('.jp-lg').first().innerText().catch(() => '');
  if (!face) break;
  seen.push(face.replace(/\s+/g, ''));
  await page.locator('#show, .btn-primary').first().click().catch(() => {});
  await page.waitForTimeout(350);
  const good = page.locator('button', { hasText: /^Good$/ }).first();
  if (await good.count()) { await good.click(); } else break;
  await page.waitForTimeout(450);
}
console.log('card faces in order:', JSON.stringify(seen));
const dup = seen.filter((w, i) => seen.indexOf(w) !== i);
console.log('REPEATED IN ONE SESSION:', JSON.stringify([...new Set(dup)]));

// ---------------------------------------------------------- E: stats double count
console.log('\n=== E  does it double-count anywhere? ===');
J(await run(async () => {
  const { inventory } = await import('/js/progress.js');
  const store = await import('/js/store.js');
  const inv = await inventory();
  const cards = await store.all('cards');
  const savedCard = cards.find((c) => c.key.startsWith('saved:'));
  return { total: inv.cards?.length ?? inv.total, savedWord: savedCard?.word, cardsForThatWord: cards.filter((c) => c.word === savedCard?.word).length };
}));

await browser.close();
