// Independent check of the "reviewCap setting is never read" finding.
// Changes the cap through the REAL settings UI, then measures the real review queue.
import { chromium, devices } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.setDefaultTimeout(15000);
const say = (s) => process.stdout.write(s + '\n');

await page.goto('http://localhost:8099/#/today', { waitUntil: 'load' });
await page.waitForTimeout(1500);

// Seed 300 overdue review cards directly (no onboarding dependency).
const seeded = await page.evaluate(async () => {
  const store = await import('/js/store.js');
  const { newCard } = await import('/js/srs.js');
  for (const s of ['cards', 'progress']) for (const r of await store.all(s)) await store.del(s, r.key);
  const now = Date.now();
  await store.putMany('cards', Array.from({ length: 300 }, (_, i) => ({
    ...newCard(`vocab:${i}:rec`, 'level:N5', { word: 'w' + i, reading: 'w', vocabId: i, ord: i, lv: 'N5' }),
    state: 2, S: 5, D: 5, reps: 3, lapses: 0, last: now - 6 * 864e5, due: now - 1000 - i,
  })));
  return (await store.all('cards')).length;
});
say('seeded cards: ' + seeded);

// Change the cap the way a user would: open Settings, pick 400 in the <select>.
await page.goto('http://localhost:8099/#/settings', { waitUntil: 'load' });
await page.waitForSelector('#cap');
await page.selectOption('#cap', '400');
await page.waitForTimeout(400);
say('stored setting after UI change: ' + await page.evaluate(async () =>
  (await (await import('/js/store.js')).setting('reviewCap'))));

// Reload settings page to confirm it persisted and renders back.
await page.goto('http://localhost:8099/#/settings', { waitUntil: 'load' });
await page.waitForSelector('#cap');
say('settings <select> shows: ' + await page.locator('#cap').inputValue());

// Now the actual review screen.
await page.goto('http://localhost:8099/#/review', { waitUntil: 'load' });
await page.waitForSelector('.review-top');
say('REVIEW SCREEN counter with cap=400, 300 due -> ' + (await page.locator('.review-top span').first().innerText()));

// And progress.session() directly, at 400 / 60 / 200.
const direct = await page.evaluate(async () => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  const out = {};
  for (const n of [400, 60, 200]) {
    await store.setSetting('reviewCap', n);
    out['cap=' + n] = (await prog.session({ deck: null })).queue.length;
  }
  out.newAllowance_at_300_due = prog.newAllowance(300, 10);
  out.newAllowance_at_250_due = prog.newAllowance(250, 10);
  return out;
});
say('session() queue length by setting: ' + JSON.stringify(direct));

// Home tile copy when new words are throttled off.
await page.goto('http://localhost:8099/#/today', { waitUntil: 'load' });
await page.waitForTimeout(1500);
const txt = await page.locator('#view').innerText();
say('home mentions "New words paused": ' + txt.includes('New words paused'));
const line = txt.split('\n').find((l) => /paused|Catch up/i.test(l));
say('paused copy: ' + (line || 'n/a'));

await b.close();
process.exit(0);
