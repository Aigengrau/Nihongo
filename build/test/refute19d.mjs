// Final: pure-click loop. finish -> "Back to Today" -> tap the Today review CTA. No scripted goto.
import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();

await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
await page.selectOption('#npd', '5').catch(() => {});
await page.waitForTimeout(400);
await page.goto(`${BASE}/#/learn/N5`, { waitUntil: 'load' });
await page.waitForTimeout(1800);
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1200);

const snap = async () => page.evaluate(async () => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  const { STATE } = await import('/js/srs.js');
  const cards = await store.all('cards');
  const t = await prog.today();
  return { todayNew: t.new, reviews: t.reviews,
           introduced: cards.filter((c) => c.state !== STATE.NEW).length };
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
console.log('Today CTAs:', await page.locator('#view a').evaluateAll((as) => as.map((a) => `${a.getAttribute('href')}="${a.innerText.replace(/\s+/g,' ').trim().slice(0,30)}"`)));

for (let loop = 1; loop <= 4; loop++) {
  const cta = page.locator('#view a[href="#/review"]').first();
  if (!(await cta.count())) { console.log(`loop ${loop}: no review CTA on Today`); break; }
  await cta.click();
  await page.waitForTimeout(1300);
  const g = await gradeAll();
  console.log(`loop ${loop}: graded ${g} ->`, JSON.stringify(await snap()));
  const back = page.locator('a:has-text("Back to Today")').first();
  if (!(await back.count())) break;
  await back.click();
  await page.waitForTimeout(1200);
}
console.log('\nToday now:', (await page.locator('#view').innerText()).replace(/\s+/g, ' ').slice(0, 220));
await browser.close();
