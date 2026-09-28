import { chromium, devices } from 'playwright';
const BASE = process.argv[2] || process.env.NIHONGO_BASE || 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], hasTouch: true, isMobile: true });
const page = await ctx.newPage();
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

for (const hash of ['/words/N5', '/grammar/N5', '/read/s/n5-white-cat', '/kanji/N5', '/business/keigo-irregulars', '/stats']) {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(2200);

  const geom = await page.evaluate(() => {
    const g = (el) => { const s = getComputedStyle(el); return `${s.overflowX}/${s.overflowY}`; };
    return {
      html: g(document.documentElement), body: g(document.body),
      scroller: document.scrollingElement === document.documentElement ? 'html' : 'body',
      bodyIsScroller: document.body.scrollHeight > document.body.clientHeight,
      docScrollable: document.documentElement.scrollHeight > document.documentElement.clientHeight,
    };
  });

  // Actually drag with a finger and see whether the page moved.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => window.scrollY);
  // A real finger: touchStart, a series of touchMoves, touchEnd.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: 600 }] });
  for (let y = 600; y >= 150; y -= 50) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y }] });
    await page.waitForTimeout(20);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(800);
  const after = await page.evaluate(() => window.scrollY);
  await cdp.detach();

  const moved = after > before;
  const nested = geom.body.split('/')[1] !== 'visible' && geom.html.split('/')[1] !== 'visible';
  check(`${hash.padEnd(28)} scrolls`, !geom.docScrollable || moved,
    `html=${geom.html} body=${geom.body} scrollY ${before}->${after}${nested ? ' NESTED SCROLLERS' : ''}`);
}
console.log(`\n=== touch scroll ${fail === 0 ? 'PASS' : `FAIL (${fail})`} ===`);
await browser.close();
