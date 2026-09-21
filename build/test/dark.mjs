import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], colorScheme: 'dark' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
for (const [name, hash] of [
  ['dark-today', '/today'], ['dark-watch', '/watch/N5'], ['dark-keigo', '/business/keigo-irregulars'],
  ['dark-grammar', '/grammar/N5/0'], ['dark-kana', '/kana'], ['dark-words', '/words/N5'],
]) {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(1100);
  await page.screenshot({ path: `build/test/shots/${name}.png` });
  console.log(name, 'ok');
}
console.log('errors:', errs.length ? errs.join(' | ') : 'none');
await browser.close();
