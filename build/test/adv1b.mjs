import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
await page.goto(`${BASE}/#/business/email`, { waitUntil: 'load' });
await page.waitForTimeout(3000);
for (let i = 1; i <= 15; i++) {
  const t0 = Date.now();
  await page.locator('[data-slot="0"]').nth(i % 2).click({ timeout: 60000 });
  console.log(`   click ${i}: ${Date.now() - t0} ms`);
}
await browser.close();
