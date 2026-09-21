import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8080';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

// headless Chromium has no TTS voice; stub one so the chain is exercised
await page.addInitScript(() => {
  const spoken = [];
  window.__spoken = spoken;
  const voices = [{ lang: 'ja-JP', name: 'Stub Japanese', default: true }];
  // window.speechSynthesis is non-writable in Chromium; plain assignment is a
  // silent no-op, so define over it.
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    get: () => ({
      getVoices: () => voices,
      speak(u) { spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 120); },
      cancel() {}, addEventListener() {}, removeEventListener() {},
    }),
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    value: function (t) { this.text = t; },
  });
});

await page.goto(`${BASE}/#/listen/N5`, { waitUntil: 'load' });
await page.waitForTimeout(1800);
check('listen list renders', (await page.locator('.tile').count()) > 0, `${await page.locator('.tile').count()} tiles`);

await page.goto(`${BASE}/#/listen/s/n5-white-cat`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const ja = await page.locator('#ja').innerText();
check('big Japanese line shown', ja.length > 3, ja.slice(0, 30).replace(/\s+/g, ' '));
check('English subtitle shown', (await page.locator('.listen-en').count()) > 0,
  (await page.locator('.listen-en').innerText().catch(() => '')).slice(0, 40));
const size = await page.evaluate(() => parseFloat(getComputedStyle(document.getElementById('ja')).fontSize));
check('subtitle is big', size >= 26, `${size}px`);
check('every word tappable', (await page.locator('#ja .wchip').count()) > 0, `${await page.locator('#ja .wchip').count()} chips`);

// play advances through lines
await page.click('#play');
await page.waitForTimeout(1400);
const spoken = await page.evaluate(() => window.__spoken.length);
const pos = await page.locator('.small.faint').first().innerText();
check('play speaks and advances', spoken >= 2, `${spoken} lines spoken, now at "${pos.split('·')[0].trim()}"`);

// tapping a word pauses
await page.locator('#ja .wchip').first().click();
await page.waitForTimeout(700);
check('word tap opens the sheet', await page.locator('#sheet').isVisible());
await page.keyboard.press('Escape');
await page.waitForTimeout(400);
const paused = await page.locator('#play').getAttribute('aria-label');
check('word tap paused playback', paused === 'Play', `button says "${paused}"`);

// speed control
await page.click('#rate');
await page.waitForTimeout(500);
check('speed control works', (await page.locator('#rate').innerText()).includes('×'), await page.locator('#rate').innerText());

// leaving the screen must silence it
const beforeNav = await page.evaluate(() => window.__spoken.length);
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
const afterNav = await page.evaluate(() => window.__spoken.length);
check('audio stops when you leave', afterNav === beforeNav, `${beforeNav} -> ${afterNav}`);

await page.goto(`${BASE}/#/listen/s/n5-white-cat`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.screenshot({ path: 'build/test/shots/listen.png' });
console.log(`\nerrors: ${errs.length ? [...new Set(errs)].join(' | ') : 'none'}`);
console.log(`\n=== listen mode ${fail === 0 && errs.length === 0 ? 'PASS' : `FAIL (${fail})`} ===`);
await browser.close();
