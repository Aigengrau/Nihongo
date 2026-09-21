// Repro v3: check (a) what "Keep going" actually does, (b) the Today -> Review re-entry path.
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
      todayNew: t.new, todayReviews: t.reviews,
      stillNew: cards.filter((c) => c.state === STATE.NEW).length,
      learning: cards.filter((c) => c.state === STATE.LEARNING).length,
      introduced: cards.filter((c) => c.state !== STATE.NEW).length,
    };
  });
  console.log(label, JSON.stringify(s));
  return s;
};

const gradeAll = async () => {
  let graded = 0;
  for (let step = 0; step < 60; step++) {
    if (await page.locator('#reveal').count()) { await page.locator('#reveal').click(); await page.waitForTimeout(170); }
    const good = page.locator('.grade[data-g="3"]');
    if (!(await good.count())) break;
    await good.click(); graded++; await page.waitForTimeout(190);
  }
  return graded;
};

const screen = async () => (await page.locator('#view').innerText()).replace(/\s+/g, ' ').slice(0, 160);

await snap('enroll        ');
await page.goto(`${BASE}/#/review`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
console.log('round 1 graded', await gradeAll());
await snap('  after r1    ');
console.log('  screen:', await screen());
console.log('  hash:', await page.evaluate(() => location.hash));

// (a) tap "Keep going" and see if anything changes
await page.locator('a:has-text("Keep going")').click();
await page.waitForTimeout(1400);
console.log('\n[A] after tapping "Keep going": hash=', await page.evaluate(() => location.hash));
console.log('    screen:', await screen());
console.log('    graded', await gradeAll());
await snap('  after keep  ');

// (b) the normal path: Today -> Review again (real hash change each way)
for (let r = 2; r <= 4; r++) {
  await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  await page.goto(`${BASE}/#/review`, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  console.log(`\n[B] visit ${r}: screen:`, await screen());
  console.log(`    graded ${await gradeAll()}`);
  await snap(`    after v${r}  `);
}
await browser.close();
