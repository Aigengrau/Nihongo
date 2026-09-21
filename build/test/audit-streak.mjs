// Streak arithmetic under multi-day gaps, month/year boundaries and DST.
import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();

async function withTz(tz, fn) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], timezoneId: tz });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('  pageerror:', e.message));
  await page.addInitScript(() => {
    window.__t = Date.now();
    const real = Date.now;
    Date.now = () => window.__t;
  });
  await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
  await page.waitForTimeout(600);
  const out = await fn(page);
  await ctx.close();
  return out;
}

// days: list of ISO-ish local datetimes to "study" at (epoch ms computed in node with the same tz)
const at = (tz, s) => new Date(new Date(s + 'Z').getTime() -
  (new Date(s + 'Z').getTime() - new Date(new Date(s + 'Z').toLocaleString('en-US', { timeZone: 'UTC' })).getTime())).getTime();

async function simulate(page, stamps) {
  return page.evaluate(async (list) => {
    const store = await import('/js/store.js');
    const prog = await import('/js/progress.js');
    for (const r of await store.all('progress')) await store.del('progress', r.key);
    const rows = [];
    for (const t of list) {
      window.__t = t;
      const s = await prog.touchStreak();
      rows.push({ localDay: prog.dayKey(t), localTime: new Date(t).toString().slice(0, 33),
                  current: s.current, best: s.best, freezes: s.freezes, last: s.last });
    }
    return rows;
  }, stamps);
}

const D = 86400000;
const show = (title, rows) => {
  console.log('\n' + title);
  for (const r of rows) console.log(`  ${r.localTime}  day=${r.localDay}  streak=${r.current} best=${r.best} freezes=${r.freezes}`);
};

// ---- 1. plain consecutive days, across a month boundary
await withTz('UTC', async (page) => {
  const base = Date.UTC(2026, 6, 28, 9, 0);          // 28 Jul .. 3 Aug
  show('1) consecutive days across a month boundary (UTC)',
    await simulate(page, Array.from({ length: 7 }, (_, i) => base + i * D)));
});

// ---- 2. a gap of 1, 2, 3 days -> freeze arithmetic
await withTz('UTC', async (page) => {
  const b = Date.UTC(2026, 6, 1, 9, 0);
  const stamps = [b, b + D, b + 2 * D, b + 4 * D /*1 missed*/, b + 7 * D /*2 missed*/, b + 11 * D /*3 missed*/];
  show('2) gaps of 1, 2 then 3 days (freezes start at 2)', await simulate(page, stamps));
});

// ---- 3. a long gap, then study: can freezes go negative / streak go wrong?
await withTz('UTC', async (page) => {
  const b = Date.UTC(2026, 6, 1, 9, 0);
  show('3) a 60-day gap', await simulate(page, [b, b + D, b + 61 * D, b + 62 * D]));
});

// ---- 4. clock moved backwards (user fixes a wrong date, or travels east->west)
await withTz('UTC', async (page) => {
  const b = Date.UTC(2026, 6, 10, 9, 0);
  show('4) device clock jumps BACK 5 days after a study session',
    await simulate(page, [b, b + D, b - 4 * D, b - 3 * D]));
});

// ---- 5. DST spring forward, studying just after local midnight
await withTz('America/New_York', async (page) => {
  // 2026-03-08 is the US spring-forward day.
  const stamps = [
    Date.UTC(2026, 2, 6, 5, 30),   // Mar 6 00:30 EST
    Date.UTC(2026, 2, 7, 5, 30),   // Mar 7 00:30 EST
    Date.UTC(2026, 2, 8, 5, 30),   // Mar 8 00:30 EST  (clocks go forward at 02:00)
    Date.UTC(2026, 2, 9, 4, 30),   // Mar 9 00:30 EDT  <- 24h earlier lands on Mar 7
    Date.UTC(2026, 2, 10, 4, 30),  // Mar 10 00:30 EDT
  ];
  show('5) DST spring forward, studying at 00:30 local each night (America/New_York)',
    await simulate(page, stamps));
});

// ---- 6. DST fall back
await withTz('America/New_York', async (page) => {
  const stamps = [
    Date.UTC(2026, 9, 31, 4, 30),   // Oct 31 00:30 EDT
    Date.UTC(2026, 10, 1, 4, 30),   // Nov 1 00:30 EDT (clocks go back at 02:00)
    Date.UTC(2026, 10, 2, 5, 30),   // Nov 2 00:30 EST
    Date.UTC(2026, 10, 3, 5, 30),   // Nov 3 00:30 EST
  ];
  show('6) DST fall back, studying at 00:30 local each night', await simulate(page, stamps));
});

// ---- 7. 30 consecutive days: freeze regain rule
await withTz('UTC', async (page) => {
  const b = Date.UTC(2026, 0, 1, 9, 0);
  const rows = await simulate(page, Array.from({ length: 30 }, (_, i) => b + i * D));
  console.log('\n7) 30 consecutive days — freezes over time:',
    rows.map((r) => `${r.current}:${r.freezes}`).join(' '));
});

// ---- 8. adversarial: alternate study/skip forever, exploiting freezes
await withTz('UTC', async (page) => {
  const b = Date.UTC(2026, 0, 1, 9, 0);
  const rows = await simulate(page, Array.from({ length: 24 }, (_, i) => b + i * 2 * D));
  console.log('\n8) studying every OTHER day for 24 sessions:',
    rows.map((r) => `${r.current}/${r.freezes}`).join(' '));
});

await browser.close();
