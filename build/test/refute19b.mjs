// Repro v2: use the real "Keep going" link the finish screen offers.
import { chromium, devices } from 'playwright';

const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('!! pageerror', e.message));

await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
await page.waitForTimeout(900);
await page.selectOption('#npd', '5').catch(() => {});
await page.waitForTimeout(400);
await page.goto(`${BASE}/#/learn/N5`, { waitUntil: 'load' });
await page.waitForTimeout(1800);

const snap = async (label) => {
  const s = await page.evaluate(async () => {
    const store = await import('/js/store.js');
    const prog = await import('/js/progress.js');
    const { STATE } = await import('/js/srs.js');
    const cards = await store.all('cards');
    const t = await prog.today();
    return {
      newPerDay: await store.setting('newPerDay', 10),
      todayNew: t.new, todayReviews: t.reviews,
      stillNew: cards.filter((c) => c.state === STATE.NEW).length,
      learning: cards.filter((c) => c.state === STATE.LEARNING).length,
      introducedToday: cards.filter((c) => c.state !== STATE.NEW).length,
    };
  });
  console.log(label, JSON.stringify(s));
  return s;
};
await snap('after enroll  ');

const gradeAll = async () => {
  let graded = 0;
  for (let step = 0; step < 60; step++) {
    if (await page.locator('#reveal').count()) {
      await page.locator('#reveal').click();
      await page.waitForTimeout(180);
    }
    const good = page.locator('.grade[data-g="3"]');
    if (!(await good.count())) break;
    await good.click();
    graded++;
    await page.waitForTimeout(200);
  }
  return graded;
};

// round 1: arrive at #/review via a hash change
await page.goto(`${BASE}/#/review`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
console.log(`round 1: graded ${await gradeAll()}`);
await snap('  after r1    ');

// rounds 2..4: press the "Keep going" link on the finish screen, exactly as a user would
for (let r = 2; r <= 4; r++) {
  const keep = page.locator('a:has-text("Keep going")');
  const n = await keep.count();
  if (!n) { console.log(`round ${r}: no "Keep going" link on screen`); break; }
  await keep.click();
  await page.waitForTimeout(1200);
  console.log(`round ${r}: graded ${await gradeAll()}`);
  await snap(`  after r${r}    `);
}

await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
console.log('\nToday:', (await page.locator('#view').innerText()).replace(/\s+/g, ' ').slice(0, 300));
await browser.close();
