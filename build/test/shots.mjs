// Screenshots of the screens this change touches, on a small phone, so the
// layout can be looked at rather than guessed about.
//   node build/test/shots.mjs
import { chromium, devices } from 'playwright';
const BASE = process.env.NIHONGO_BASE || 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], hasTouch: true, isMobile: true });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(`${e.message}`));

const shot = async (hash, name, { wait = 1500, before } = {}) => {
  await page.goto(`${BASE}/#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(wait);
  if (before) await before();
  await page.screenshot({ path: `build/test/shots/${name}.png` });
  console.log(`  ${name.padEnd(22)} ${(await page.locator('#view').innerText()).split('\n').slice(0, 2).join(' / ').slice(0, 72)}`);
};

await shot('/today', 'zz-today');
await shot('/grammar/N5', 'zz-grammar-hub');
await shot('/learn/N5/grammar', 'zz-grammar-learn');
await shot('/learn/N5/grammar', 'zz-grammar-practice', {
  before: async () => { await page.click('#go'); await page.waitForTimeout(500); },
});
await shot('/track/dialects/kansai-swaps', 'zz-kansai', { wait: 1800 });
await shot('/track/dialects/tour', 'zz-kansai-tour', { wait: 1800 });
await shot('/track/business/keigo-core', 'zz-keigo', { wait: 1800 });
await shot('/learn/N5/kanji', 'zz-learn-kanji', { wait: 2200 });
await shot('/learn/N5', 'zz-learn-word', { wait: 2200 });

console.log(`errors: ${errs.length ? [...new Set(errs)].join(' | ') : 'none'}`);
await browser.close();
