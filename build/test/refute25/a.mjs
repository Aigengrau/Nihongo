import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();

async function probe(name, ctxOpts, hash) {
  const ctx = await browser.newContext(ctxOpts);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  const r = await page.evaluate(() => {
    const de = document.documentElement;
    const body = document.body;
    const out = {
      bodyW: Math.round(body.getBoundingClientRect().width),
      bodyClientW: body.clientWidth,
      docScrollW: de.scrollWidth,
      innerW: window.innerWidth,
      rows: document.querySelectorAll('.wrow').length,
    };
    const list = document.querySelector('.list');
    if (list) {
      const lr = list.getBoundingClientRect();
      out.list = { w: Math.round(lr.width), sw: list.scrollWidth, cs: getComputedStyle(list).gridTemplateColumns };
    }
    let worst = null;
    for (const el of document.querySelectorAll('body *')) {
      const b = el.getBoundingClientRect();
      if (b.width === 0) continue;
      if (!worst || b.right > worst.right) worst = { tag: el.tagName + '.' + (el.className || ''), w: Math.round(b.width), left: Math.round(b.left), right: Math.round(b.right) };
    }
    out.worst = worst;
    const w0 = document.querySelector('.wrow');
    if (w0) { const b = w0.getBoundingClientRect(); out.firstRow = { w: Math.round(b.width), left: Math.round(b.left), right: Math.round(b.right), txt: w0.innerText.replace(/\s+/g,' ').slice(0,50) }; }
    const tb = document.querySelector('.tabbar');
    if (tb) out.tabbar = Math.round(tb.getBoundingClientRect().width);
    return out;
  });
  console.log(name, hash, JSON.stringify(r, null, 1));
  await page.screenshot({ path: `build/test/refute25/${name}-${hash.replace(/\//g,'_')}.png` });
  await ctx.close();
}

await probe('pixel7', { ...devices['Pixel 7'] }, '/words/N5');
await probe('w320', { viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: devices['Pixel 7'].userAgent }, '/words/N5');
await probe('w393', { viewport: { width: 393, height: 780 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, userAgent: devices['Pixel 7'].userAgent }, '/words/N5');
await probe('pixel7', { ...devices['Pixel 7'] }, '/grammar/N5');
await probe('pixel7', { ...devices['Pixel 7'] }, '/kana');
await browser.close();
