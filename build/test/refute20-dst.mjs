// Independent repro: streak across US spring-forward, studying at 00:30 local.
import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'America/New_York' });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', e.message));
await page.addInitScript(() => { window.__t = Date.now(); Date.now = () => window.__t; });
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(700);

// 00:30 America/New_York. EST(UTC-5) through Mar 8 01:59, EDT(UTC-4) from Mar 8 03:00.
const stamps = [
  Date.UTC(2026, 2,  6, 5, 30),  // Fri Mar 6 00:30 EST
  Date.UTC(2026, 2,  7, 5, 30),  // Sat Mar 7 00:30 EST
  Date.UTC(2026, 2,  8, 5, 30),  // Sun Mar 8 00:30 EST  <- DST changes later this day
  Date.UTC(2026, 2,  9, 4, 30),  // Mon Mar 9 00:30 EDT
  Date.UTC(2026, 2, 10, 4, 30),  // Tue Mar 10 00:30 EDT
];

const rows = await page.evaluate(async (list) => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  for (const r of await store.all('progress')) await store.del('progress', r.key);
  const out = [];
  for (const t of list) {
    window.__t = t;
    const before = JSON.parse(JSON.stringify(await prog.streak()));
    const s = await prog.touchStreak();
    out.push({
      local: new Date(t).toString().slice(0, 33),
      today: prog.dayKey(t),
      yesterdayKey: prog.dayKey(t - 86400000),
      lastBefore: before.last,
      current: s.current, best: s.best, freezes: s.freezes,
    });
  }
  return out;
}, stamps);

for (const r of rows) {
  console.log(`${r.local}\n   today=${r.today} dayKey(now-24h)=${r.yesterdayKey} last(before)=${r.lastBefore} => streak=${r.current} best=${r.best} freezes=${r.freezes}`);
}

// Control: same 5 calendar days, same clock time, in a no-DST zone.
const ctx2 = await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'Asia/Tokyo' });
const p2 = await ctx2.newPage();
await p2.addInitScript(() => { window.__t = Date.now(); Date.now = () => window.__t; });
await p2.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await p2.waitForTimeout(700);
const ctrl = await p2.evaluate(async (list) => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  for (const r of await store.all('progress')) await store.del('progress', r.key);
  const out = [];
  for (const t of list) { window.__t = t; const s = await prog.touchStreak(); out.push(`${prog.dayKey(t)}:${s.current}`); }
  return out;
}, [0,1,2,3,4].map(i => Date.UTC(2026,2,5+i,15,30))); // 00:30 JST next day, consecutive
console.log('\ncontrol Asia/Tokyo 00:30 local x5:', ctrl.join(' '));

// Also: afternoon study on the same NY dates (should be unaffected).
const ctx3 = await browser.newContext({ ...devices['Pixel 7'], timezoneId: 'America/New_York' });
const p3 = await ctx3.newPage();
await p3.addInitScript(() => { window.__t = Date.now(); Date.now = () => window.__t; });
await p3.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await p3.waitForTimeout(700);
const pm = await p3.evaluate(async (list) => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  for (const r of await store.all('progress')) await store.del('progress', r.key);
  const out = [];
  for (const t of list) { window.__t = t; const s = await prog.touchStreak(); out.push(`${prog.dayKey(t)}:${s.current}`); }
  return out;
}, [Date.UTC(2026,2,6,17,0), Date.UTC(2026,2,7,17,0), Date.UTC(2026,2,8,16,0), Date.UTC(2026,2,9,16,0), Date.UTC(2026,2,10,16,0)]);
console.log('NY 12:00 local x5 (spans same DST change):', pm.join(' '));

await browser.close();
