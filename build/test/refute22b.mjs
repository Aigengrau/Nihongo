import { chromium, devices } from 'playwright';

const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });

// Make indexedDB.open throw, exactly like a locked-down / private context.
const _skip = (x)=>x; // disabled
await _skip(() => {
  try {
    Object.defineProperty(window, 'indexedDB', {
      configurable: true,
      get() { return { open() { throw new DOMException('blocked', 'SecurityError'); } }; },
    });
  } catch (e) { /* ignore */ }
});

const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(800);

const out = await page.evaluate(async () => {
  const store = await import('/js/store.js');
  const srs = await import('/js/srs.js');
  const prog = await import('/js/progress.js');

  // sanity: are we really in memory-fallback mode?
  const dbHandle = await store.open();
  const inFallback = dbHandle === null;

  // two cards, reviewed a few times each
  let a = srs.newCard ? srs.newCard('w:A', 'N5') : null;
  let b = srs.newCard ? srs.newCard('w:B', 'N5') : null;
  const exportsList = Object.keys(srs);
  if (!a) return { inFallback, exportsList, err: 'no newCard export' };

  const ratings = [3, 3, 1, 3, 3];
  let n = 0;
  for (const r of ratings) {
    const target = n % 2 === 0 ? 'a' : 'b';
    const cur = target === 'a' ? a : b;
    const { card, log } = srs.review(cur, r);
    if (target === 'a') a = card; else b = card;
    await store.put('cards', card);
    await store.put('reviews', log);
    n++;
  }

  const reviewsStored = (await store.all('reviews')).length;
  const cardsStored = (await store.all('cards')).length;
  const hist = await prog.history(3);
  const historyTotal = hist.reduce((s, d) => s + d.n, 0);
  const exp = await store.exportAll();

  // import path in fallback
  let importResult = 'n/a';
  let reviewsAfterImport = null;
  try {
    const fake = {
      app: 'nihongo', version: 1, cards: [], saved: [], progress: [], settings: [],
      reviews: [{ key: 'w:C', rating: 3, at: Date.now() }],
    };
    importResult = String(await store.importAll(fake, 'merge'));
    reviewsAfterImport = (await store.all('reviews')).length;
  } catch (e) { importResult = 'threw: ' + e.message; }

  return {
    inFallback, reviewsWritten: ratings.length, reviewsStored, cardsStored,
    historyTotal, exportCountsReviews: exp.counts.reviews,
    importResult, reviewsAfterImport,
    rawReviewRows: (await store.all('reviews')).map((r) => `${r.key}@${r.rating}`),
  };
});

console.log(JSON.stringify(out, null, 2));
console.log('--- console ---');
logs.slice(0, 6).forEach((l) => console.log(l));
await browser.close();
