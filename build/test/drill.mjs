import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

// give the drills a Japanese voice so the listen mode is exercised
await page.addInitScript(() => {
  const voices = [{ lang: 'ja-JP', name: 'Stub', default: true }];
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    get: () => ({ getVoices: () => voices, speak() {}, cancel() {}, addEventListener() {}, removeEventListener() {} }),
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: function (t) { this.text = t; } });
});

for (const kind of ['words', 'kanji']) {
  console.log(`\n--- ${kind} ---`);
  await page.goto(`${BASE}/#/${kind}/N5`, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  check(`${kind}: mode bar present`, (await page.locator('.modebar a').count()) === 5,
    `${await page.locator('.modebar a').count()} modes`);

  // flashcards: flip and advance
  await page.goto(`${BASE}/#/${kind}/N5/cards`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const front = await page.locator('#face').innerText();
  await page.click('#face');
  await page.waitForTimeout(400);
  const back = await page.locator('#face').innerText();
  check(`${kind}: flashcard flips`, back.length > front.length, `"${front.split('\n')[0]}" -> +${back.length - front.length} chars`);
  await page.click('#next');
  await page.waitForTimeout(400);
  check(`${kind}: flashcard advances`, (await page.locator('.review-top').innerText()).includes('2 /'));

  // quiz: answer one
  await page.goto(`${BASE}/#/${kind}/N5/quiz`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  const opts = await page.locator('#opts [data-k]').count();
  check(`${kind}: quiz offers 4 options`, opts === 4, `${opts}`);
  await page.locator('#opts [data-k]').first().click();
  await page.waitForTimeout(1800);
  check(`${kind}: quiz scores and continues`, /\d+\/\d+/.test(await page.locator('.review-top').innerText()),
    (await page.locator('.review-top').innerText()).split('\n')[0]);

  // match
  await page.goto(`${BASE}/#/${kind}/N5/match`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  check(`${kind}: match deals 10 cells`, (await page.locator('.match-cell').count()) === 10,
    `${await page.locator('.match-cell').count()}`);

  // listen
  await page.goto(`${BASE}/#/${kind}/N5/listen`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  check(`${kind}: listen drill renders`, (await page.locator('#opts [data-k]').count()) === 4,
    `${await page.locator('#opts [data-k]').count()} options`);
}

// ---- kanji learning from Today ----
console.log('\n--- kanji learning ---');
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
if (await page.locator('#start').count()) { await page.locator('#start').click(); await page.waitForTimeout(1800); }
const todayText = await page.locator('#view').innerText();
check('Today offers "Learn N new kanji"', /Learn \d+ new kanji/.test(todayText),
  (todayText.match(/Learn \d+ new kanji[^\n]*/) || ['not found'])[0]);

await page.goto(`${BASE}/#/learn/N5/kanji`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const body = (await page.locator('#view').innerText()).replace(/\s+/g, ' ');
check('kanji learn card shows the character', /日|一|人|大|年|国/.test(body), body.slice(0, 70));
check('kanji learn card shows readings', /On'yomi|Kun'yomi/.test(body));
check('kanji learn card shows words using it', /Words that use it/.test(body));
await page.click('#next');
await page.waitForTimeout(700);
check('kanji learn advances', (await page.locator('.review-top').innerText()).includes('2 /'));

const enrolled = await page.evaluate(async () => {
  const s = await import('./js/store.js');
  return (await s.all('cards')).filter((c) => c.key.startsWith('kanji:')).length;
});
check('kanji cards enrolled into the SRS', enrolled > 0, `${enrolled} kanji cards`);
await page.screenshot({ path: 'build/test/shots/kanji-learn.png' });

console.log(`\nerrors: ${errs.length ? [...new Set(errs)].join(' | ') : 'none'}`);
console.log(`\n=== drills & kanji ${fail === 0 && errs.length === 0 ? 'PASS' : `FAIL (${fail})`} ===`);
await browser.close();
