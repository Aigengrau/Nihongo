// The two things this change promised about cards: the buttons are always
// reachable without scrolling, and a swipe moves the card.
import { chromium, devices } from 'playwright';
const BASE = process.env.NIHONGO_BASE || 'http://localhost:8099';
const browser = await chromium.launch();
let fail = 0;
const errs = [];
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

// A small phone is the hard case: the kanji card alone is taller than the fold.
const small = { viewport: { width: 360, height: 640 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2,
  userAgent: devices['Pixel 7'].userAgent };

for (const [name, ctxOpts] of [['iPhone SE-ish 360×640', small], ['Pixel 7', { ...devices['Pixel 7'], hasTouch: true, isMobile: true }]]) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errs.push(e.message));

  for (const [label, hash] of [['kanji', '/learn/N5/kanji'], ['words', '/learn/N5'], ['grammar', '/learn/N5/grammar']]) {
    await page.goto(`${BASE}/#${hash}`, { waitUntil: 'load' });
    await page.waitForTimeout(2200);
    const bar = await page.locator('.act-bar').boundingBox();
    const vh = page.viewportSize().height;
    check(`${name} · ${label}: the buttons are on screen`,
      !!bar && bar.y >= 0 && bar.y + bar.height <= vh + 1,
      bar ? `bar ${Math.round(bar.y)}–${Math.round(bar.y + bar.height)} of ${vh}` : 'no bar');
  }
  await ctx.close();
}

// --- the gesture itself -------------------------------------------------
const ctx = await browser.newContext({ ...devices['Pixel 7'], hasTouch: true, isMobile: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push(e.message));

const swipe = async (dx) => {
  const b = await page.locator('#face').boundingBox();
  const y = b.y + Math.min(b.height / 2, 120);
  const x = b.x + b.width / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let s = 1; s <= 6; s++) await page.mouse.move(x + (dx * s) / 6, y, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(600);
};

await page.goto(`${BASE}/#/learn/N5`, { waitUntil: 'load' });
await page.waitForTimeout(2200);
const first = await page.locator('#face').innerText();
await swipe(-150);
const second = await page.locator('#face').innerText();
check('swiping left moves to the next card', first !== second, `${first.split('\n')[0]} → ${second.split('\n')[0]}`);
check('the counter advanced', (await page.locator('.review-top').innerText()).startsWith('2 /'));

await swipe(150);
const backTo = await page.locator('#face').innerText();
check('swiping right comes back', backTo === first, `${backTo.split('\n')[0]}`);
check('the counter went back', (await page.locator('.review-top').innerText()).startsWith('1 /'));

// Going back must undo the schedule, not just the display.
const state = await page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('nihongo', 1); r.onsuccess = () => res(r.result); });
  const get = (s) => new Promise((res) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); });
  const [cards, reviews, progress] = await Promise.all([get('cards'), get('reviews'), get('progress')]);
  const day = progress.find((p) => p.key.startsWith('day:'));
  return { touched: cards.filter((c) => c.reps > 0).length, reviews: reviews.length, newToday: day?.new ?? 0 };
});
check('back undid the card', state.touched === 0, `${state.touched} card(s) still scheduled`);
check('back undid the review log', state.reviews === 0, `${state.reviews} log row(s)`);
check("back undid today's count", state.newToday === 0, `new today: ${state.newToday}`);

// A plain tap must still work — the swipe handler must not swallow clicks.
await page.goto(`${BASE}/#/words/N5/cards`, { waitUntil: 'load' });
await page.waitForTimeout(1800);
const beforeTap = await page.locator('#face').innerText();
await page.locator('#face').click();
await page.waitForTimeout(400);
check('tapping still flips a flashcard', (await page.locator('#face').innerText()) !== beforeTap);

console.log(`\nerrors: ${errs.length ? [...new Set(errs)].join(' | ') : 'none'}`);
console.log(`\n=== swipe ${fail === 0 && errs.length === 0 ? 'PASS' : `FAIL (${fail})`} ===`);
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
