// Independent repro of finding 19: does the Review screen enforce the daily new cap?
import { chromium, devices } from 'playwright';

const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('!! pageerror', e.message));

// 1. Boot app, set newPerDay = 5, enroll N5 by visiting the Learn screen once
//    (enrollLevel runs there) but WITHOUT learning anything.
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1200);

const evalApp = (fn, arg) => page.evaluate(fn, arg);

// set newPerDay
await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
await page.waitForTimeout(900);
await page.selectOption('#npd', '5').catch(() => {});
await page.waitForTimeout(400);

// enroll level N5 (visiting /learn/N5 calls enrollLevel)
await page.goto(`${BASE}/#/learn/N5`, { waitUntil: 'load' });
await page.waitForTimeout(1800);

const snap = async (label) => {
  const s = await page.evaluate(async () => {
    const store = await import('/js/store.js');
    const prog = await import('/js/progress.js');
    const { STATE } = await import('/js/srs.js');
    const cards = await store.all('cards');
    const t = await prog.today();
    const npd = await store.setting('newPerDay', 10);
    return {
      newPerDay: npd,
      todayNew: t.new, todayReviews: t.reviews,
      total: cards.length,
      stillNew: cards.filter((c) => c.state === STATE.NEW).length,
      learning: cards.filter((c) => c.state === STATE.LEARNING).length,
      review: cards.filter((c) => c.state === STATE.REVIEW).length,
    };
  });
  console.log(label, JSON.stringify(s));
  return s;
};

await snap('after enroll      ');

// 2. Now do three separate visits to #/review, grading everything it hands out.
for (let round = 1; round <= 3; round++) {
  await page.goto(`${BASE}/#/review`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  // force a fresh route run (hash unchanged between rounds otherwise)
  let graded = 0;
  for (let step = 0; step < 40; step++) {
    const reveal = page.locator('#reveal');
    if (await reveal.count()) {
      await reveal.click();
      await page.waitForTimeout(200);
    }
    const good = page.locator('.grade[data-g="3"]');
    if (!(await good.count())) break;
    await good.click();
    graded++;
    await page.waitForTimeout(220);
  }
  const s = await snap(`round ${round} (graded ${String(graded).padStart(2)})`);
  console.log(`   -> cap is ${s.newPerDay}/day; brand-new words introduced so far = ${s.total - s.stillNew}`);
}

// 3. What does the Today screen report?
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const todayText = (await page.locator('#view').innerText()).replace(/\s+/g, ' ').slice(0, 400);
console.log('\nToday screen text:', todayText);

await browser.close();
