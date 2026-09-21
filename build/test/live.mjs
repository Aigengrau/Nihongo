import { chromium, devices } from 'playwright';
const BASE = process.argv[2] || 'https://aigengrau.github.io/Nihongo/app';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'allow' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('requestfailed', (r) => { if (r.url().includes('Nihongo')) errs.push(`FAILED ${r.url().split('/Nihongo')[1]}`); });
page.on('response', (r) => { if (r.status() >= 400 && r.url().includes('Nihongo')) errs.push(`${r.status()} ${r.url().split('/Nihongo')[1]}`); });

console.log('testing', BASE);
await page.goto(BASE + '/', { waitUntil: 'load' });
await page.waitForTimeout(4000);
console.log('title bar :', await page.locator('#appbarTitle').textContent().catch(() => '(none)'));
console.log('body      :', (await page.locator('#view').innerText().catch(() => '')).slice(0, 80).replace(/\s+/g, ' '));

const sw = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return { registered: !!r, scope: r?.scope || null, active: !!r?.active };
});
console.log('service worker:', JSON.stringify(sw));

const man = await page.evaluate(async () => {
  const l = document.querySelector('link[rel=manifest]');
  const r = await fetch(l.href);
  const j = await r.json();
  return { ok: r.ok, id: j.id, start: j.start_url, scope: j.scope, resolvedStart: new URL(j.start_url, l.href).href };
});
console.log('manifest:', JSON.stringify(man));

// navigate a couple of real screens
for (const h of ['/levels', '/words/N5', '/read/s/n5-white-cat']) {
  await page.goto(`${BASE}/#${h}`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  const rows = await page.locator('.wrow, .level-card, .wchip').count();
  console.log(`  ${h.padEnd(24)} elements=${rows}`);
}
await page.screenshot({ path: 'build/test/shots/live.png' });
console.log('\nerrors:', errs.length ? [...new Set(errs)].slice(0, 6).join(' | ') : 'none');
await browser.close();
