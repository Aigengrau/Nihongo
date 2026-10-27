// Reminders, end to end in a real browser.
//
// Notifications are the one feature nobody can test by using the app: you turn
// them on, and then you wait a day to find out they never arrived. So this
// grants the permission, drives the Settings screen, winds the clock forward
// by rewriting the baked queue, and checks that a notification is actually
// shown — and, just as importantly, that it is NOT shown twice, and not shown
// to someone who is sitting in the app.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'app');
const PORT = 8131;
const BASE = `http://localhost:${PORT}`;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); return res.end('no');
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
  });
  res.end(fs.readFileSync(file));
});
await new Promise((r) => server.listen(PORT, r));

// headless-shell has no notification platform at all and reports a flat
// 'denied'; the full browser in new-headless mode is the only one that can
// answer the question this test is asking.
const browser = await chromium.launch({ channel: 'chromium' });
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'allow', permissions: ['notifications'] });
await ctx.grantPermissions(['notifications'], { origin: BASE });
const page = await ctx.newPage();

const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push(`console: ${m.text()}`); });

let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

// Every notification the app shows, captured before it reaches the OS.
await page.addInitScript(() => {
  window.__shown = [];
  const grab = (reg) => {
    if (!reg || reg.__grabbed) return reg;
    reg.__grabbed = true;
    const real = reg.showNotification.bind(reg);
    reg.showNotification = (title, opts) => {
      window.__shown.push({ title, body: opts?.body, url: opts?.data?.url, tag: opts?.tag });
      return real(title, opts);
    };
    return reg;
  };
  const orig = navigator.serviceWorker.getRegistration.bind(navigator.serviceWorker);
  navigator.serviceWorker.getRegistration = (...a) => orig(...a).then(grab);
});

await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
await page.waitForTimeout(1500);

// ---------------------------------------------------------------- the screen
check('a Reminders section exists', await page.locator('#notifyCard').count() === 1);
check('it offers to turn reminders on', await page.locator('#notifyOn').count() === 1);
check('nothing is scheduled before you ask for it',
  await page.evaluate(async () => (await (await import('/js/notify.js')).getSettings()).enabled) === false);

await page.locator('#notifyOn').click();
await page.waitForTimeout(900);

check('turning it on reveals every kind',
  await page.locator('#notifyCard [data-kind]').count() === 6);
check('each kind has its own time', await page.locator('#notifyCard [data-time]').count() === 6);
check('all seven days are offered', await page.locator('#notifyDays [data-day]').count() === 7);
check('it says what is coming next',
  /Next up/.test(await page.locator('#notifyNext').innerText()));

// ---------------------------------------------------------------- settings stick
await page.locator('[data-time="word"]').fill('06:45');
await page.locator('[data-time="word"]').dispatchEvent('change');
await page.waitForTimeout(500);
await page.locator('[data-kind="grammar"]').click();
await page.waitForTimeout(500);
await page.locator('#notifyDays [data-day="0"]').click();   // drop Sunday
await page.waitForTimeout(600);

const saved = await page.evaluate(async () => (await import('/js/notify.js')).getSettings());
check('a new time is saved', saved.word.time === '06:45', saved.word.time);
check('switching a kind on is saved', saved.grammar.on === true);
check('dropping a day is saved', !saved.days.includes(0) && saved.days.length === 6, JSON.stringify(saved.days));

const queued = await page.evaluate(async () => {
  const s = await import('/js/store.js');
  return (await s.all('progress')).filter((r) => r.key.startsWith('notif:'));
});
check('a queue was baked', queued.length > 10, `${queued.length} rows`);
check('the queue honours the new time',
  queued.filter((r) => r.kind === 'word')
    .every((r) => new Date(r.at).toTimeString().slice(0, 5) === '06:45'));
check('the queue honours the dropped day',
  queued.every((r) => new Date(r.at).getDay() !== 0));
check('every row is ready to show, with nowhere left to think',
  queued.every((r) => r.title && r.body && r.url && r.shown === false));

// A reload must not lose any of it.
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(1500);
const after = await page.evaluate(async () => (await import('/js/notify.js')).getSettings());
check('settings survive a reload', after.word.time === '06:45' && after.grammar.on && after.enabled);

// ---------------------------------------------------------------- delivery
// Wind the clock: move the next row into the past, then let the page notice.
const fire = async () => page.evaluate(async () => {
  const s = await import('/js/store.js');
  const rows = (await s.all('progress'))
    .filter((r) => r.key.startsWith('notif:') && !r.shown)
    .sort((a, b) => a.at - b.at);
  if (!rows[0]) return null;
  // One second ago: due, but still well inside the grace window.
  await s.put('progress', { ...rows[0], at: Date.now() - 1000 });
  return rows[0].kind;
});

// While the app is open, a due reminder is swallowed, not shown.
await fire();
await page.evaluate(async () => (await import('/js/notify.js')).refresh());
await page.waitForTimeout(400);
check('nothing pops up while you are looking at the app',
  (await page.evaluate(() => window.__shown.length)) === 0);

// Backgrounded, the same row is delivered.
const kind = await fire();
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
});
await page.waitForTimeout(1200);
let shown = await page.evaluate(() => window.__shown);
check('backgrounded, a due reminder is shown', shown.length === 1, JSON.stringify(shown));
check('it carries a title, a body and a link',
  !!shown[0]?.title && !!shown[0]?.body && /^#\//.test(shown[0]?.url || ''), JSON.stringify(shown[0]));
check('it is tagged by kind, so it replaces itself rather than stacking',
  shown[0]?.tag === `nihongo-${kind}`);

// The same row must never fire twice, however many wake-ups follow.
await page.evaluate(async () => {
  const n = await import('/js/notify.js');
  await n.refresh(); await n.refresh(); await n.refresh();
});
await page.waitForTimeout(600);
shown = await page.evaluate(() => window.__shown);
check('a delivered reminder never fires again', shown.length === 1, `${shown.length} shown`);

// A phone left in a bag all day must not empty the queue onto the lock screen:
// eight reminders, every one of them hours past its moment.
await page.evaluate(async () => {
  const s = await import('/js/store.js');
  const rows = (await s.all('progress')).filter((r) => r.key.startsWith('notif:') && !r.shown);
  for (const r of rows.slice(0, 8)) await s.put('progress', { ...r, at: Date.now() - 5 * 3600000 });
});
await page.evaluate(async () => (await import('/js/notify.js')).refresh());
await page.waitForTimeout(800);
check('a backlog of stale reminders is dropped, not dumped',
  (await page.evaluate(() => window.__shown.length)) === 1);

// ---------------------------------------------------------------- the links
await page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true });
});
await page.goto(`${BASE}/#/words/N5?w=${encodeURIComponent('先生')}`, { waitUntil: 'load' });
await page.waitForTimeout(2200);
check('a word reminder opens that word', await page.locator('#sheet:not([hidden])').count() === 1,
  await page.locator('#sheetBody h2').innerText().catch(() => 'no sheet'));

await page.goto(`${BASE}/#/kanji/N5?k=${encodeURIComponent('日')}`, { waitUntil: 'load' });
await page.waitForTimeout(2000);
check('a kanji reminder opens that character',
  (await page.locator('#sheetBody').innerText().catch(() => '')).includes('Kun'));

await page.goto(`${BASE}/#/grammar/N5/0`, { waitUntil: 'load' });
await page.waitForTimeout(1500);
check('a grammar reminder opens that point',
  (await page.locator('#view').innerText()).length > 50 &&
  !(await page.locator('#view').innerText()).includes('Not found'));

// ---------------------------------------------------------------- the worker
// The half that runs with the app closed. Driven here by the message the page
// can send it, which is the same function a periodic sync calls.
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1800);

const fromWorker = await page.evaluate(async () => {
  const store = await import('/js/store.js');
  const notify = await import('/js/notify.js');
  await notify.rebuild();
  const reg = await navigator.serviceWorker.ready;
  for (const n of await reg.getNotifications()) n.close();

  const target = (await store.all('progress'))
    .filter((r) => r.key.startsWith('notif:') && !r.shown)
    .sort((a, b) => a.at - b.at)[0];
  if (!target) return { error: 'nothing queued' };
  await store.put('progress', { ...target, at: Date.now() - 1000 });
  reg.active.postMessage({ type: 'RUN_REMINDERS' });

  for (let i = 0; i < 80; i++) {
    const live = await reg.getNotifications();
    if (live.length) {
      return {
        got: live.map((n) => ({ title: n.title, body: n.body, url: n.data?.url, tag: n.tag })),
        consumed: !!(await store.get('progress', target.key))?.shown,
      };
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return { got: [], consumed: !!(await store.get('progress', target.key))?.shown };
});

check('the worker shows a due reminder on its own', fromWorker.got?.length === 1, JSON.stringify(fromWorker));
check('what the worker shows is complete',
  !!fromWorker.got?.[0]?.title && !!fromWorker.got?.[0]?.body && /^#\//.test(fromWorker.got?.[0]?.url || ''));
check('the worker consumes the row it showed', fromWorker.consumed === true);

// Tapping it: the worker focuses the window it finds and hands it the route,
// rather than navigating it and throwing away whatever was open.
const worker = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
await worker.evaluate(async () => {
  for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) {
    c.postMessage({ type: 'NAVIGATE', url: '#/stats' });
  }
});
await page.waitForTimeout(1000);
check('a tapped reminder routes the app that is already open',
  page.url().endsWith('#/stats'), page.url());

// ---------------------------------------------------------------- turning off
await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
await page.waitForTimeout(1600);
await page.locator('#notifyOff').click();
await page.waitForTimeout(900);
check('turning it off puts the invitation back', await page.locator('#notifyOn').count() === 1);
const left = await page.evaluate(async () => {
  const s = await import('/js/store.js');
  return (await s.all('progress')).filter((r) => r.key.startsWith('notif:')).length;
});
check('turning it off empties the queue', left === 0, `${left} rows left`);
check('and the rest of Settings still works',
  await page.locator('#export').count() === 1 && await page.locator('#theme').count() === 1);

check('no page errors', errs.length === 0, errs.slice(0, 4).join(' | '));

console.log(fail ? `\n${fail} FAILED` : '\nall good');
await browser.close();
server.close();
process.exit(fail ? 1 : 0);
