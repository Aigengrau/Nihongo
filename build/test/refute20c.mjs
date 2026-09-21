import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
async function run(tz, stamps, label) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], timezoneId: tz });
  const page = await ctx.newPage();
  await page.addInitScript(() => { window.__t = Date.now(); Date.now = () => window.__t; });
  await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  let rows;
  for (let i = 0; i < 3; i++) {
    try {
      rows = await page.evaluate(async (list) => {
        const store = await import('/js/store.js');
        const prog = await import('/js/progress.js');
        for (const r of await store.all('progress')) await store.del('progress', r.key);
        const out = [];
        for (const t of list) { window.__t = t; const s = await prog.touchStreak();
          out.push(`${new Date(t).toString().slice(0,24)} day=${prog.dayKey(t)} y=${prog.dayKey(t-86400000)} -> ${s.current}`); }
        return out;
      }, stamps);
      break;
    } catch (e) { console.log('  retry:', e.message.slice(0,60)); await page.waitForTimeout(1500); }
  }
  console.log(`\n== ${label} (${tz})`);
  (rows||[]).forEach(r => console.log('  ' + r));
  await ctx.close();
}
await run('America/New_York', [Date.UTC(2026,9,30,3,30), Date.UTC(2026,9,31,3,30), Date.UTC(2026,10,1,3,30), Date.UTC(2026,10,2,4,30), Date.UTC(2026,10,3,4,30)], 'fall-back Nov 1, 23:30 local');
await run('Australia/Lord_Howe', [Date.UTC(2026,9,2,13,45), Date.UTC(2026,9,3,13,45), Date.UTC(2026,9,4,13,15), Date.UTC(2026,9,5,13,15)], 'Lord Howe 30-min shift, 00:15 local');
await browser.close();
