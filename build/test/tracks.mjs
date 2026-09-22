import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

const idx = await (await fetch(`${BASE}/data/tracks/index.json`)).json();
check('six tracks in the index', idx.length === 6, idx.map((t) => t.id).join(', '));

for (const t of idx) {
  await page.goto(`${BASE}/#/track/${t.id}`, { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  const tiles = await page.locator('.tile').count();
  check(`${t.icon} ${t.id.padEnd(10)} lists modules`, tiles === t.modules, `${tiles} of ${t.modules}`);

  // open every module in the track and confirm it renders something real
  const full = await (await fetch(`${BASE}/data/tracks/${t.id}.json`)).json();
  let empty = 0, kinds = new Set();
  for (const m of full.modules) {
    await page.goto(`${BASE}/#/track/${t.id}/${m.id}`, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    const txt = (await page.locator('#view').innerText()).replace(/\s+/g, ' ');
    const hasJa = /[\u3040-\u30ff\u4e00-\u9fff]/.test(txt);
    if (txt.length < 60 || !hasJa) { empty++; console.log(`     empty module: ${m.id} (${m.kind}) "${txt.slice(0, 40)}"`); }
    kinds.add(m.kind);
  }
  check(`${' '.repeat(2)}${t.id.padEnd(10)} all modules render`, empty === 0, `${full.modules.length} modules, kinds: ${[...kinds].join('/')}`);
}

// the generalised transform drill must work on non-keigo columns
await page.goto(`${BASE}/#/track/dialects`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const first = await page.locator('.tile').first().getAttribute('href');
await page.goto(`${BASE}${''}/#${first.slice(1)}`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
if (await page.locator('[data-m="drill"]').count()) {
  await page.click('[data-m="drill"]');
  await page.waitForTimeout(1000);
  const opts = await page.locator('#opts [data-a]').count();
  check('dialect drill generates options', opts === 4, `${opts} options`);
  if (opts) {
    await page.locator('#opts [data-a]').first().click();
    await page.waitForTimeout(1600);
    check('dialect drill scores', /\d+\/\d+/.test(await page.locator('.review-top').innerText()));
  }
} else console.log('     (first dialect module is not a transform — skipped drill check)');

await page.goto(`${BASE}/#/track/travel`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
await page.screenshot({ path: 'build/test/shots/track-travel.png' });

console.log(`\nerrors: ${errs.length ? [...new Set(errs)].join(' | ') : 'none'}`);
console.log(`\n=== tracks ${fail === 0 && errs.length === 0 ? 'PASS' : `FAIL (${fail})`} ===`);
await browser.close();
