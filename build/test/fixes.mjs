import { chromium, devices } from 'playwright';
const BASE = process.env.NIHONGO_BASE || 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

// Record every rate the app asks for, so "global speed" is measurable.
await page.addInitScript(() => {
  window.__rates = [];
  const voices = [{ lang: 'ja-JP', name: 'Stub', default: true }];
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    get: () => ({
      getVoices: () => voices,
      speak(u) { window.__rates.push(u.rate); setTimeout(() => u.onend && u.onend(), 80); },
      cancel() {}, addEventListener() {}, removeEventListener() {},
    }),
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true, value: function (t) { this.text = t; },
  });
});

// ---------- 1. speed is global and reaches 2x ----------
await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
await page.waitForTimeout(1800);
const rates = await page.locator('#rate option').allTextContents();
check('speed options include 2x', rates.some((r) => r.startsWith('2')), rates.join(' '));
await page.selectOption('#rate', '2');
await page.waitForTimeout(700);
check('changing it speaks at 2x', (await page.evaluate(() => window.__rates)).includes(2),
  JSON.stringify(await page.evaluate(() => window.__rates)));

await page.goto(`${BASE}/#/listen/s/n5-white-cat`, { waitUntil: 'load' });
await page.waitForTimeout(2400);
check('listen shows the shared rate', (await page.locator('#rate').innerText()).includes('2'),
  await page.locator('#rate').innerText());
await page.evaluate(() => { window.__rates = []; });
await page.click('#play');
await page.waitForTimeout(900);
const lr = await page.evaluate(() => window.__rates);
check('listen speaks at 2x', lr.length > 0 && lr.every((r) => r === 2), JSON.stringify(lr.slice(0, 4)));

await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
await page.waitForTimeout(1700);
check('speed persists across reloads', (await page.locator('#rate').inputValue()) === '2');
await page.selectOption('#rate', '1');
await page.waitForTimeout(400);

// ---------- 2. new words / kanji gating ----------
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1600);
if (await page.locator('#start').count()) { await page.locator('#start').click(); await page.waitForTimeout(2000); }

// Pretend today's ten WORDS are done, with zero reviews due.
await page.evaluate(async () => {
  const s = await import('./js/store.js');
  const d = new Date();
  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await s.put('progress', { key: `day:${k}`, day: k, new: 10, newKanji: 0, reviews: 0, correct: 0, minutes: 0 });
});
// Reload rather than goto: the hash is already #/today, so a goto would not
// fire hashchange and the screen would never re-render with the new counters.
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2200);
const today = (await page.locator('#view').innerText()).replace(/\s+/g, ' ');
check('words read as done, not blocked', /words done/i.test(today),
  (today.match(/Today's \w+ done[^·]*·[^|]{0,34}/) || ['-'])[0]);
check('kanji still offered after words are done', /Learn \d+ new kanji/.test(today),
  (today.match(/Learn \d+ new kanji/) || ['NOT OFFERED'])[0]);

await page.goto(`${BASE}/#/learn/N5/kanji`, { waitUntil: 'load' });
await page.waitForTimeout(2400);
const kb = (await page.locator('#view').innerText()).replace(/\s+/g, ' ');
check('kanji learning is not blocked by the word count', !/paused/i.test(kb), kb.slice(0, 56));

await page.goto(`${BASE}/#/learn/N5`, { waitUntil: 'load' });
await page.waitForTimeout(2200);
const wb = (await page.locator('#view').innerText()).replace(/\s+/g, ' ');
check('message does not blame 0 reviews', !/0 reviews? waiting/.test(wb), wb.slice(0, 90));
check('offers to carry on anyway', /more anyway/i.test(wb));
if (/more anyway/i.test(wb)) {
  await page.locator('a', { hasText: 'more anyway' }).first().click();
  await page.waitForTimeout(2400);
  check('carrying on shows cards', (await page.locator('#view').innerText()).includes('1 /'),
    (await page.locator('#view').innerText()).replace(/\s+/g, ' ').slice(0, 40));
}

// ---------- 3. no flash of the previous screen ----------
await page.goto(`${BASE}/#/levels`, { waitUntil: 'load' });
await page.waitForTimeout(1800);
const flashed = await page.evaluate(async () => {
  const view = document.getElementById('view');
  const before = view.innerText.slice(0, 40);
  let sawOld = false;
  const obs = new MutationObserver(() => {
    if (location.hash.includes('/level/') && view.innerText.slice(0, 40) === before) sawOld = true;
  });
  obs.observe(view, { childList: true, subtree: true, characterData: true });
  location.hash = '/level/N4';
  await new Promise((r) => setTimeout(r, 1000));
  obs.disconnect();
  return sawOld;
});
check('no flash of the previous screen on navigation', !flashed);

// ---------- 4. register marks ----------
await page.goto(`${BASE}/#/read/s/paste`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.fill('#src', 'ほんまに食べてるで。そやな。わかんない。');
await page.click('#go');
await page.waitForTimeout(1600);
const marks = await page.locator('.wchip[data-reg]').count();
check('casual and dialect forms are badged in text', marks > 0, `${marks} marked words`);
if (marks) {
  const tag = await page.locator('.wchip[data-reg]').first().getAttribute('data-reg');
  await page.locator('.wchip[data-reg]').first().click();
  await page.waitForTimeout(1000);
  const sheet = (await page.locator('#sheetBody').innerText()).replace(/\s+/g, ' ');
  check('the word sheet explains the marking',
    /Casual|Kansai|Tohoku|Hakata|Nagoya|Hiroshima|Okinawa|Hokkaido/.test(sheet),
    `${tag}: ${sheet.slice(0, 66)}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
}
await page.goto(`${BASE}/#/marked`, { waitUntil: 'load' });
await page.waitForTimeout(1800);
check('marked-forms browser lists them', (await page.locator('.wrow').count()) > 20,
  `${await page.locator('.wrow').count()} forms`);
await page.screenshot({ path: 'build/test/shots/marked.png' });

await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
await page.waitForTimeout(1800);
for (const cb of await page.locator('input[data-reg]').all()) { if (await cb.isChecked()) await cb.uncheck(); }
await page.waitForTimeout(800);
await page.goto(`${BASE}/#/read/s/paste`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
check('turning marking off removes the badges', (await page.locator('.wchip[data-reg]').count()) === 0);

// ---------- 5. tapping the tab you are already on refreshes it ----------
{
  const page2 = await ctx.newPage();
  await page2.goto(`${BASE}/#/today`, { waitUntil: 'load' });
  await page2.waitForTimeout(1800);
  const before = (await page2.locator('#view').innerText()).slice(0, 60);
  await page2.evaluate(async () => {
    const s = await import('./js/store.js');
    const d = new Date();
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    await s.put('progress', { key: 'streak', current: 7, best: 9, last: k, freezes: 2 });
  });
  await page2.click('[data-tab="today"]');
  await page2.waitForTimeout(1300);
  const after = (await page2.locator('#view').innerText()).slice(0, 60);
  check('tapping the current tab re-renders it', after !== before && /7/.test(after),
    `"${before.split('\n')[0]}" -> "${after.split('\n')[0]}"`);
  await page2.close();
}

console.log(`\nerrors: ${errs.length ? [...new Set(errs)].join(' | ') : 'none'}`);
console.log(`\n=== fixes ${fail === 0 && errs.length === 0 ? 'PASS' : `FAIL (${fail})`} ===`);
await browser.close();
