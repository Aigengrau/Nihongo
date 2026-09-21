import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
await page.goto(`${BASE}/#/words/N5`, { waitUntil: 'load' });
await page.waitForTimeout(1400);
const m = () => page.evaluate(() => ({ sw: document.documentElement.scrollWidth, row: Math.round((document.querySelector('.wrow')||{getBoundingClientRect:()=>({width:0})}).getBoundingClientRect().width) }));
console.log('baseline', await m());
const inject = async (css, label) => {
  const h = await page.addStyleTag({ content: css });
  await page.waitForTimeout(300);
  console.log(label, await m());
  await page.evaluate((el) => el.remove(), h);
  await page.waitForTimeout(200);
};
await inject('.wrow{width:100%}', 'wrow width:100%');
await inject('.wrow-en{white-space:normal}', 'wrow-en normal');
await inject('.list{grid-template-columns:minmax(0,1fr)}', 'PROPOSED FIX list minmax(0,1fr)');
// verify fix screenshot + ellipsis engaged
await page.addStyleTag({ content: '.list{grid-template-columns:minmax(0,1fr)}' });
await page.waitForTimeout(400);
console.log('after fix', await page.evaluate(() => {
  const w = document.querySelector('.wrow'); const en = w.querySelector('.wrow-en'); const jp = w.querySelector('.wrow-jp');
  return { sw: document.documentElement.scrollWidth, innerW: innerWidth, rowW: Math.round(w.getBoundingClientRect().width),
    jpRight: Math.round(jp.getBoundingClientRect().right), enClipped: en.scrollWidth > en.clientWidth,
    tabbar: Math.round(document.querySelector('.tabbar').getBoundingClientRect().width) };
}));
await page.screenshot({ path: 'build/test/refute25/fixed.png' });
// check other screens for same class of bug with fix applied globally? just report
await browser.close();
