import { chromium, devices } from 'playwright';

const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('requestfailed', (r) => {
  const u = r.url();
  if (u.startsWith(BASE)) errors.push(`404/failed: ${u.replace(BASE, '')} (${r.failure()?.errorText})`);
});

const shot = async (name) => page.screenshot({ path: `build/test/shots/${name}.png`, fullPage: false });
const step = async (name, hash, action) => {
  errors.length = 0;
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  if (action) { await action(); await page.waitForTimeout(700); }
  const title = await page.locator('#appbarTitle').textContent().catch(() => '?');
  const body = (await page.locator('#view').innerText().catch(() => '')).slice(0, 110).replace(/\s+/g, ' ');
  const errs = [...new Set(errors)];
  console.log(`\n### ${name}  [${hash}]  title="${title}"`);
  console.log(`    ${body}`);
  if (errs.length) errs.forEach((e) => console.log(`    !! ${e}`));
  await shot(name);
  return errs.length;
};

let bad = 0;
bad += await step('01-today', '/today');
bad += await step('02-levels', '/levels');
bad += await step('03-level-n5', '/level/N5');
bad += await step('04-words', '/words/N5');
bad += await step('05-kanji', '/kanji/N5');
bad += await step('06-grammar', '/grammar/N5');
bad += await step('07-grammar-point', '/grammar/N5/0');
bad += await step('08-kana', '/kana');
bad += await step('09-conjugate', '/conjugate/N5');
bad += await step('10-read', '/read/N5');
bad += await step('11-i1', '/read/s/i1-N5');
bad += await step('12-watch', '/watch/N5');
bad += await step('10b-story', '/read/s/n5-white-cat');
bad += await step('10c-story-n2', '/read/s/n2-the-extra-zero');
bad += await step('12b-watch-video', '/watch/v/SvzCKlfD5mw');
bad += await step('12c-paste', '/read/s/paste', async () => {
  await page.fill('#src', '毎朝六時に起きて、コーヒーを飲みながら新聞を読んでいます。今日は会議があるので、少し早く家を出ました。');
  await page.click('#go');
});
bad += await step('13-saved', '/saved');
bad += await step('14-stats', '/stats');
bad += await step('15-settings', '/settings');
bad += await step('16-credits', '/credits');
bad += await step('17-tracks', '/levels');
bad += await step('17b-track-travel', '/track/travel');
bad += await step('17c-track-dialects', '/track/dialects');
bad += await step('17d-track-casual', '/track/casual');
bad += await step('17e-track-expressive', '/track/expressive');
bad += await step('17f-track-academic', '/track/academic');
bad += await step('17g-track-business', '/track/business');
bad += await step('17h-travel-module', '/track/travel/airport');
bad += await step('17i-dialect-drill', '/track/dialects/kansai-verbs');
bad += await step('17-business-legacy', '/business');
bad += await step('18-biz-keigo', '/track/business/keigo-irregulars');
bad += await step('19-biz-email', '/track/business/email');

// Interactive: enroll N5, then learn + review
bad += await step('20-enroll', '/today', async () => {
  const b = page.locator('#start');
  if (await b.count()) await b.click();
});
bad += await step('21-learn', '/learn/N5');
bad += await step('22-review', '/review');

// Tap a word in the i+1 reader to open the word sheet
errors.length = 0;
await page.goto(`${BASE}/#/read/s/i1-N5`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
const chip = page.locator('.wchip').first();
const chipCount = await page.locator('.wchip').count();
if (chipCount) {
  await chip.click();
  await page.waitForTimeout(900);
  const open = await page.locator('#sheet').isVisible();
  const sheetText = (await page.locator('#sheetBody').innerText().catch(() => '')).slice(0, 160).replace(/\s+/g, ' ');
  console.log(`\n### 23-word-tap  chips=${chipCount} sheetVisible=${open}`);
  console.log(`    ${sheetText}`);
  await shot('23-word-sheet');
  if (!open) { console.log('    !! word sheet did not open'); bad++; }
} else { console.log('\n### 23-word-tap  !! no tappable chips rendered'); bad++; }
[...new Set(errors)].forEach((e) => { console.log(`    !! ${e}`); bad++; });

console.log(`\n=== total error lines: ${bad} ===`);
await browser.close();
