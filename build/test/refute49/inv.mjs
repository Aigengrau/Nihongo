import { chromium, devices } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage(); page.setDefaultTimeout(12000);
const log = (...a) => console.log(...a);
const B = 'http://localhost:8099';

await page.goto(B + '/#/today', { waitUntil: 'load' }); await page.waitForTimeout(1500);
// onboarding
if (await page.locator('#start').count()) { await page.click('#start'); await page.waitForTimeout(3000); }

// ---- 1. LEARN screen
await page.goto(B + '/#/learn/N5', { waitUntil: 'load' }); await page.waitForTimeout(2500);
log('--- LEARN buttons:', await page.locator('#view button').allInnerTexts());
log('    text inputs on learn:', await page.locator('#view input, #view textarea').count());
// advance a few so review has cards
for (let i = 0; i < 6; i++) { if (await page.locator('#next').count()) { await page.click('#next'); await page.waitForTimeout(350); } }

// force cards due
await page.evaluate(async () => {
  const store = await import('./js/store.js');
  const cards = await store.all('cards');
  let n = 0;
  for (const c of cards) { if (c.state !== 0) { c.due = Date.now() - 1000; await store.put('cards', c); n++; } }
  return n;
});

// ---- 2. REVIEW screen: what is on the front?
await page.goto(B + '/#/review', { waitUntil: 'load' }); await page.waitForTimeout(2500);
const front = await page.locator('#face').innerText().catch(() => '(no face)');
log('--- REVIEW front:', JSON.stringify(front));
log('    inputs:', await page.locator('#view input, #view textarea').count());
await page.locator('#face').click(); await page.waitForTimeout(500);
log('--- REVIEW after reveal:', JSON.stringify(await page.locator('#face').innerText()));
log('    grade buttons:', await page.locator('.grade').allInnerTexts());

// ---- 3. CONJUGATION drill
await page.goto(B + '/#/conjugate/N5', { waitUntil: 'load' }); await page.waitForTimeout(2500);
log('--- CONJ prompt:', JSON.stringify(await page.locator('.review-card').innerText()));
log('    options:', await page.locator('#opts button').allInnerTexts());
log('    inputs:', await page.locator('#view input, #view textarea').count());

// ---- 4. KEIGO drill
await page.goto(B + '/#/business/keigo-irregulars', { waitUntil: 'load' }); await page.waitForTimeout(2000);
await page.locator('[data-m="drill"]').click(); await page.waitForTimeout(800);
log('--- KEIGO prompt:', JSON.stringify(await page.locator('.review-card').innerText()));
log('    options:', await page.locator('#opts button').allInnerTexts());

// ---- 5. EMAIL builder (template kind)
await page.goto(B + '/#/business/email', { waitUntil: 'load' }); await page.waitForTimeout(2000);
log('--- EMAIL headings:', await page.locator('#view h2, #view h3').allInnerTexts());
const slots = await page.locator('[data-slot]').count();
log('    slot option buttons:', slots);
log('    assembled output (first 200):', (await page.locator('#out').innerText().catch(()=>'(none)')).slice(0, 200));
// click a different option and see output change
const before = await page.locator('#out').innerText().catch(()=>'');
await page.locator('[data-slot="0"][data-opt="1"]').click().catch(()=>{});
await page.waitForTimeout(400);
const after = await page.locator('#out').innerText().catch(()=>'');
log('    output changes on slot choice:', before !== after);
log('    email page buttons:', (await page.locator('#view button').allInnerTexts()).slice(-6));

// ---- 6. global scan for any typing/free-production affordance
await b.close(); process.exit(0);
