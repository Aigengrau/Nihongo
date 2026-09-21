import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
let fails = 0;

for (const width of [360, 320]) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width, height: 760 } });
  const page = await ctx.newPage();
  console.log(`\n=== ${width}px ===`);
  for (const hash of ['/words/N5', '/grammar/N5', '/kana', '/saved', '/levels', '/level/N5', '/watch/N5', '/read/s/n5-white-cat', '/business/keigo-irregulars']) {
    await page.goto(`${BASE}/#${hash}`, { waitUntil: 'load' });
    await page.waitForTimeout(900);
    const m = await page.evaluate(() => {
      const bar = document.getElementById('tabbar').getBoundingClientRect();
      const rows = [...document.querySelectorAll('.wrow, .kana-cell')].slice(0, 40);
      const offscreen = rows.filter((r) => { const b = r.getBoundingClientRect(); return b.right > innerWidth + 1 || b.left < -1; }).length;
      const firstText = (document.querySelector('.wrow-jp, .kana-cell .k')?.textContent || '').trim();
      return { doc: document.documentElement.scrollWidth, vw: innerWidth, barW: Math.round(bar.width), barR: Math.round(bar.right), rows: rows.length, offscreen, firstText };
    });
    const ok = m.doc <= m.vw + 1 && m.barW <= m.vw + 1 && m.offscreen === 0;
    if (!ok) fails++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${hash.padEnd(28)} doc=${m.doc} vw=${m.vw} tabbar=${m.barW} rows=${m.rows} offscreen=${m.offscreen} first="${m.firstText.slice(0, 18)}"`);
  }
  // the grade buttons must be above the tab bar on the first review card
  await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const start = page.locator('#start');
  if (await start.count()) { await start.click(); await page.waitForTimeout(1200); }
  await page.goto(`${BASE}/#/learn/N5`, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const fold = await page.evaluate(() => {
    const btn = document.querySelector('#next, #reveal, .grade');
    if (!btn) return null;
    const b = btn.getBoundingClientRect();
    const bar = document.getElementById('tabbar').getBoundingClientRect();
    return { btnBottom: Math.round(b.bottom), barTop: Math.round(bar.top), vh: innerHeight };
  });
  if (fold) {
    const ok = fold.btnBottom <= fold.barTop;
    if (!ok) fails++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} primary action above tab bar   btnBottom=${fold.btnBottom} barTop=${fold.barTop}`);
  }
  await ctx.close();
}
console.log(`\n=== layout ${fails === 0 ? 'PASS' : `FAIL (${fails})`} ===`);
await browser.close();
