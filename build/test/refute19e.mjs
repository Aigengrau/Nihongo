// Real user loop: Levels -> N5 -> "Flashcards" tile, repeated. Clicks only.
import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();

await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
await page.waitForTimeout(1600);
await page.selectOption('#npd', '5').catch(() => {});
await page.waitForTimeout(400);
// enroll N5 the way a user does: open the level's Learn screen once (do not grade)
await page.goto(`${BASE}/#/learn/N5`, { waitUntil: 'load' });
await page.waitForTimeout(1800);

const snap = async () => page.evaluate(async () => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  const { STATE } = await import('/js/srs.js');
  const cards = await store.all('cards');
  const t = await prog.today();
  return { todayNew: t.new, reviews: t.reviews,
           introducedToday: cards.filter((c) => c.state !== STATE.NEW).length };
});
const gradeAll = async () => {
  let g = 0;
  for (let s = 0; s < 60; s++) {
    if (await page.locator('#reveal').count()) { await page.locator('#reveal').click(); await page.waitForTimeout(170); }
    const b = page.locator('.grade[data-g="3"]');
    if (!(await b.count())) break;
    await b.click(); g++; await page.waitForTimeout(190);
  }
  return g;
};

for (let loop = 1; loop <= 5; loop++) {
  // Levels tab -> N5 -> Flashcards tile : all real taps
  await page.locator('#tabbar a[href="#/levels"]').click();
  await page.waitForTimeout(1000);
  await page.locator('#view a[href="#/level/N5"]').first().click();
  await page.waitForTimeout(1300);
  const tile = page.locator('#view a[href="#/review/level:N5"]').first();
  if (!(await tile.count())) { console.log('no Flashcards tile'); break; }
  console.log(`loop ${loop}: tile says "${(await tile.innerText()).replace(/\s+/g, ' ').trim()}"`);
  await tile.click();
  await page.waitForTimeout(1400);
  const g = await gradeAll();
  console.log(`         graded ${g} ->`, JSON.stringify(await snap()));
}
await browser.close();
