import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  pageerror:', e.message));
const J = (o) => console.log(JSON.stringify(o, null, 1));
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(800);

console.log('\n=== Q1  why saved words never surface ===');
J(await page.evaluate(async () => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  const data = await import('/js/data.js');
  const { newCard, buildQueue } = await import('/js/srs.js');
  for (const s of ['cards', 'progress']) for (const r of await store.all(s)) await store.del(s, r.key);
  await store.setSetting('newPerDay', 10);
  const list = await data.vocab('N5');
  await prog.enrollLevel('N5', list);
  const saved = [];
  for (let i = 0; i < 20; i++) saved.push(newCard(`saved:w${i}:rec`, 'saved', { word: 'w' + i, ord: Date.now() + i }));
  await store.putMany('cards', saved);
  const cards = await store.all('cards');
  const out = {};
  out.levelOrdRange = [Math.min(...cards.filter(c => c.deck !== 'saved').map(c => c.ord)),
                       Math.max(...cards.filter(c => c.deck !== 'saved').map(c => c.ord))];
  out.savedOrd = cards.find(c => c.deck === 'saved').ord;
  const q = buildQueue(cards, { newPerDay: 10 });
  out.queueDecks = q.map(c => c.deck);
  // flip the ord and see it work
  await store.putMany('cards', saved.map((c, i) => ({ ...c, ord: -1000 + i })));
  const q2 = buildQueue(await store.all('cards'), { newPerDay: 10 });
  out.queueDecksWithSmallOrd = q2.map(c => c.deck);
  return out;
}));

console.log('\n=== Q2  does the Review screen respect the daily new-card cap? ===');
await page.evaluate(async () => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  const data = await import('/js/data.js');
  for (const s of ['cards', 'progress']) for (const r of await store.all(s)) await store.del(s, r.key);
  await store.setSetting('newPerDay', 5);
  await prog.enrollLevel('N5', (await data.vocab('N5')).slice(0, 60));
});
for (let round = 1; round <= 3; round++) {
  await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
  await page.waitForTimeout(400);
  await page.goto(`${BASE}/#/review`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  const bodyTxt = (await page.locator('#view').innerText()).slice(0,70).replace(/\s+/g,' ');
  const head = (await page.locator('.review-top span').first().innerText().catch(() => '?'));
  let graded = 0;
  for (let i = 0; i < 8; i++) {
    const has = await page.locator('#reveal').count();
    if (!has) break;
    await page.locator('#reveal').click();
    await page.waitForTimeout(160);
    await page.locator('.grade[data-g="3"]').click();
    await page.waitForTimeout(240);
    graded++;
  }
  const st = await page.evaluate(async () => {
    const prog = await import('/js/progress.js');
    const inv = await prog.inventory();
    return { today: await prog.today(), stillNew: inv.fresh, learning: inv.learning };
  });
  console.log(` round ${round}: view="${bodyTxt}" queue said "${head}", graded ${graded} cards -> today.new=${st.today.new} today.reviews=${st.today.reviews} cardsStillNew=${st.stillNew} inLearning=${st.learning}`);
}
console.log(' (newPerDay is 5; a correct cap would introduce 5 new cards per day in total)');

console.log('\n=== Q3  Learn screen vs Review screen counters ===');
J(await page.evaluate(async () => {
  const prog = await import('/js/progress.js');
  return { today: await prog.today() };
}));

await browser.close();
