// Consequence check: a long streak really can be lost by studying without finishing the queue.
import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
console.log(JSON.stringify(await page.evaluate(async () => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  const DAY = 86400000;
  const out = {};
  // Learner on a 30-day streak, last credited yesterday, no freezes left.
  await store.put('progress', { key: 'streak', current: 30, best: 30, last: prog.dayKey(Date.now() - DAY), freezes: 0 });
  // Today: studies 60 reviews but never finishes the queue -> touchStreak never runs.
  // Tomorrow: finishes a session -> touchStreak runs one day late.
  const s = await store.get('progress', 'streak');
  const t = prog.dayKey(Date.now() + DAY);          // "tomorrow"
  const yest = prog.dayKey(Date.now() + DAY - DAY); // = today
  const missed = Math.round((new Date(t) - new Date(s.last)) / DAY) - 1;
  out.simulated = { last: s.last, tomorrow: t, missed, freezes: s.freezes,
    result: (s.last === yest) ? 'continues' : (missed > 0 && s.freezes >= missed ? 'freeze burned' : 'RESET to 1') };
  return out;
}), null, 1));
await browser.close();
