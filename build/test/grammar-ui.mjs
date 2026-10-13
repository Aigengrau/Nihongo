// The grammar screens, in a phone-sized browser: hub, learn, practice, review.
import { chromium, devices } from 'playwright';
const BASE = process.env.NIHONGO_BASE || 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };
const text = () => page.locator('#view').innerText();

// --- hub ---------------------------------------------------------------
await page.goto(`${BASE}/#/grammar/N5`, { waitUntil: 'load' });
await page.waitForTimeout(1600);
const hub = await text();
check('hub counts the level', /of \d+ points met/.test(hub), hub.split('\n').slice(0, 3).join(' / '));
check('hub offers new points', /Learn \d+ new point/.test(hub));
check('hub offers the full list', /Browse all \d+/.test(hub));

// --- learn: explanation first -----------------------------------------
await page.goto(`${BASE}/#/learn/N5/grammar`, { waitUntil: 'load' });
await page.waitForTimeout(1600);
const teach = await text();
check('explains before asking', /How to build it|What it means|Examples/.test(teach) || /です/.test(teach),
  teach.slice(0, 60).replace(/\n/g, ' '));
check('the two buttons are above the fold', await page.locator('#go').isVisible() && await page.locator('#know').isVisible());

const box = await page.locator('#go').boundingBox();
const vh = page.viewportSize().height;
check('practise button needs no scrolling', box && box.y + box.height <= vh, `button bottom ${Math.round(box?.y + box?.height)} of ${vh}`);

// --- practice ----------------------------------------------------------
await page.click('#go');
await page.waitForTimeout(600);
check('practice asks a question', await page.locator('#opts [data-o]').count() === 4,
  `${await page.locator('#opts [data-o]').count()} options`);
const q1 = await text();
check('the blank is drawn, not typed', (await page.locator('.blank').count()) > 0 || /What does this pattern mean|Which one says this/.test(q1));

// answer everything, right or wrong, until the point is scheduled
for (let n = 0; n < 8; n++) {
  if (!(await page.locator('#opts [data-o]').count())) break;
  await page.locator('#opts [data-o]').first().click();
  await page.waitForTimeout(2400);
}
await page.waitForTimeout(400);
const after = await text();
check('practice ends on the next point or a finish screen',
  /Practise|I know this|grammar point/.test(after), after.slice(0, 70).replace(/\n/g, ' '));

const cards = await page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('nihongo', 1); r.onsuccess = () => res(r.result); });
  return new Promise((res) => {
    const req = db.transaction('cards').objectStore('cards').getAll();
    req.onsuccess = () => res(req.result.filter((c) => c.gid));
  });
});
check('the point entered the SRS', cards.length >= 1, `${cards.length} grammar card(s), deck ${cards[0]?.deck}`);
check('the card can be reviewed offline', !!(cards[0]?.pattern && cards[0]?.meaning));
check('a scheduled card is no longer new', cards.every((c) => c.state !== 0));

// --- going back takes the point out of the deck again --------------------
const swipeRight = async () => {
  const b = await page.locator('#face').boundingBox();
  const y = b.y + Math.min(b.height / 2, 100);
  await page.mouse.move(b.x + 40, y);
  await page.mouse.down();
  for (let s = 1; s <= 6; s++) await page.mouse.move(b.x + 40 + (150 * s) / 6, y, { steps: 2 });
  await page.mouse.up();
  await page.waitForTimeout(700);
};
const at = await page.locator('.review-top').innerText();
await swipeRight();
check('swiping right returns to the previous point',
  (await page.locator('.review-top').innerText()) !== at,
  `${at.split('\n')[0]} → ${(await page.locator('.review-top').innerText()).split('\n')[0]}`);

const undone = await page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('nihongo', 1); r.onsuccess = () => res(r.result); });
  const get = (s) => new Promise((res) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); });
  const [cs, progress] = await Promise.all([get('cards'), get('progress')]);
  return { grammar: cs.filter((c) => c.gid).length, newGrammar: progress.find((p) => p.key.startsWith('day:'))?.newGrammar ?? 0 };
});
check('going back un-schedules the point', undone.grammar === 0, `${undone.grammar} left`);
check("going back rolls today's count back", undone.newGrammar === 0, `newGrammar: ${undone.newGrammar}`);

// put it back so the review check below has something to review
await page.click('#know');
await page.waitForTimeout(700);

// --- review renders a grammar card -------------------------------------
await page.evaluate(async () => {
  const db = await new Promise((res) => { const r = indexedDB.open('nihongo', 1); r.onsuccess = () => res(r.result); });
  const s = db.transaction('cards', 'readwrite').objectStore('cards');
  const all = await new Promise((res) => { const q = s.getAll(); q.onsuccess = () => res(q.result); });
  for (const c of all.filter((x) => x.gid)) s.put({ ...c, due: Date.now() - 1000, state: 2, S: 3, D: 5 });
});
await page.goto(`${BASE}/#/review/grammar:N5`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const rev = await text();
check('a grammar card reviews as a pattern', /pattern/.test(rev), rev.split('\n').slice(0, 3).join(' / '));
await page.click('#reveal');
await page.waitForTimeout(500);
check('revealing shows the meaning', (await page.locator('.grade').count()) === 4);
await page.screenshot({ path: 'build/test/shots/grammar-review.png' });

await page.goto(`${BASE}/#/grammar/N5/all`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
check('browse still lists every point', (await page.locator('.wrow').count()) > 80, `${await page.locator('.wrow').count()} rows`);

console.log(`\nerrors: ${errs.length ? [...new Set(errs)].join(' | ') : 'none'}`);
console.log(`\n=== grammar-ui ${fail === 0 && errs.length === 0 ? 'PASS' : `FAIL (${fail})`} ===`);
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
