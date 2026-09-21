import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], permissions: ['clipboard-read','clipboard-write'] });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(String(e)));
await page.goto(`${BASE}/#/business/email`, { waitUntil: 'load' });
await page.waitForSelector('[data-slot="0"]');
// count innerHTML replacements of #view via MutationObserver, and count clipboard writes
await page.evaluate(() => {
  window.__renders = 0;
  const v = document.getElementById('view');
  new MutationObserver(ms => { for (const m of ms) if (m.target === v && m.type === 'childList') window.__renders++; }).observe(v, { childList: true });
  window.__clip = 0;
  const orig = navigator.clipboard.writeText.bind(navigator.clipboard);
  navigator.clipboard.writeText = (t) => { window.__clip++; return orig(t); };
});
for (let i = 1; i <= 14; i++) {
  await page.evaluate(() => { window.__renders = 0; });
  const t0 = Date.now();
  await page.locator(`[data-slot="0"][data-opt="${i % 2}"]`).click({ timeout: 120000 });
  const ms = Date.now() - t0;
  const r = await page.evaluate(() => window.__renders);
  console.log(`click ${i}: ${ms} ms, view childList mutations = ${r}`);
}
await page.locator('#copy').click();
await page.waitForTimeout(300);
console.log('clipboard writeText calls on one Copy tap:', await page.evaluate(() => window.__clip));
console.log('pageerrors:', errs);
await browser.close();
