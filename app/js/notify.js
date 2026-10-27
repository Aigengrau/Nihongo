// Daily reminders, and the word / kanji / grammar of the day.
//
// There is no server behind this app, so there is nothing to push from: every
// notification is scheduled and delivered by the phone itself.
//
// The page bakes a fortnight of FULLY WRITTEN notifications into IndexedDB —
// title, body, and the link to tap — and whoever wakes up first delivers them:
// the service worker on a periodic background sync, or the page's own timers
// while the app is still in memory. That split is the whole design. A service
// worker cannot load the dictionary, pick a word or render a reading, and one
// that tried would be a second copy of half this app, drifting out of step
// with the first. By the time a row reaches the queue it is only text.
//
// What the browser will actually do, which Settings says plainly rather than
// promising more:
//   installed on Android / desktop Chromium → real background delivery
//   everywhere else, iOS included           → delivered while the app is
//                                             running or recently backgrounded
//
// Nothing here ever shows a notification to someone who is looking at the app.

import * as store from './store.js';
import * as data from './data.js';
import { dayKey } from './progress.js';

const PREFIX = 'notif:';
const STAMP = 'notifBaked';
const HORIZON_DAYS = 14;
const ARM_WINDOW = 6 * 3600e3;   // page timers only ever cover the next few hours
const GRACE = 2 * 3600e3;        // later than this and the moment has passed
const KEEP_PAST = 3 * 86400e3;   // how long a consumed row lingers before cleanup
export const SYNC_TAG = 'nihongo-notify';

/**
 * The kinds of notification, in the order Settings lists them. `time` and `on`
 * are only the defaults — every one of them is the learner's to change.
 */
export const KINDS = [
  { id: 'reminder', mark: '今', name: 'Daily target',
    hint: 'Reviews and new words still waiting', time: '19:30', on: true },
  { id: 'word', mark: '語', name: 'Word of the day',
    hint: 'One word from your level, with its reading', time: '08:00', on: true },
  { id: 'kanji', mark: '漢', name: 'Kanji of the day',
    hint: 'One character and its readings', time: '12:30', on: true },
  { id: 'grammar', mark: '文', name: 'Grammar of the day',
    hint: 'One pattern, tap it for the explanation', time: '17:00', on: false },
  { id: 'phrase', mark: '例', name: 'Phrase of the day',
    hint: 'A real sentence, both languages', time: '07:30', on: false },
  { id: 'streak', mark: '火', name: 'Streak rescue',
    hint: 'Only if you have not studied yet', time: '21:30', on: true },
];

export const DEFAULTS = {
  enabled: false,
  days: [0, 1, 2, 3, 4, 5, 6],
  quietWhenDone: true,
  ...Object.fromEntries(KINDS.map((k) => [k.id, { on: k.on, time: k.time }])),
};

// ---------------------------------------------------------------- settings
export async function getSettings() {
  const saved = await store.setting('notify', null);
  const s = { ...DEFAULTS, ...(saved || {}) };
  for (const k of KINDS) s[k.id] = { ...DEFAULTS[k.id], ...(saved?.[k.id] || {}) };
  // An empty day list would silently mean "never", which nobody ever means.
  s.days = Array.isArray(s.days) && s.days.length ? [...s.days].sort() : [...DEFAULTS.days];
  return s;
}

export async function setSettings(patch) {
  const next = { ...(await getSettings()), ...patch };
  await store.setSetting('notify', next);
  await refresh({ force: true });
  return next;
}

/** Change one kind without disturbing the others. */
export async function setKind(id, patch) {
  const cur = await getSettings();
  return setSettings({ [id]: { ...cur[id], ...patch } });
}

// ---------------------------------------------------------------- support
export const supported = () =>
  typeof Notification !== 'undefined' &&
  typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

export const permission = () => (supported() ? Notification.permission : 'unsupported');

const registration = async () => {
  if (!supported()) return null;
  try { return (await navigator.serviceWorker.getRegistration()) || null; } catch { return null; }
};

async function isOn() {
  if (!supported() || permission() !== 'granted') return false;
  return (await getSettings()).enabled === true;
}

/**
 * Which delivery the browser is actually offering. Settings prints this rather
 * than claiming reminders work everywhere, because on iOS they do not, and
 * finding that out by missing a week of them is worse than being told.
 * @returns {Promise<'unsupported'|'no-worker'|'foreground'|'background'>}
 */
export async function deliveryMode() {
  if (!supported()) return 'unsupported';
  const reg = await registration();
  if (!reg) return 'no-worker';
  if (!('periodicSync' in reg)) return 'foreground';
  try {
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state !== 'granted') return 'foreground';
    const tags = await reg.periodicSync.getTags();
    return tags.includes(SYNC_TAG) ? 'background' : 'foreground';
  } catch { return 'foreground'; }
}

/**
 * Ask the browser to wake the worker up on its own. Chromium only, and only
 * for an installed app it considers you to actually use — it may simply
 * decline, which is why nothing downstream depends on this having worked.
 */
async function wakeups() {
  const reg = await registration();
  if (!reg) return false;
  try { await reg.sync?.register(SYNC_TAG); } catch { /* one-off sync is a bonus */ }
  if (!('periodicSync' in reg)) return false;
  try {
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state !== 'granted') return false;
    await reg.periodicSync.register(SYNC_TAG, { minInterval: 3600e3 });
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------- planning
/** Days since the epoch in LOCAL time — the seed for "today's" word. */
export const dayNumber = (ts = Date.now()) => {
  const d = new Date(ts);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
};

/** A "HH:MM" wall-clock time on a given local day. Survives DST either way. */
export function slotAt(day, hhmm) {
  const [h, m] = String(hhmm || '00:00').split(':').map(Number);
  const d = new Date(day);
  d.setHours(Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0, 0, 0);
  return d.getTime();
}

/**
 * Every notification that should fire between now and the horizon. Pure, so
 * the schedule can be tested without a browser.
 * @returns {{kind:string, at:number, day:number}[]} soonest first
 */
export function plan(settings, { now = Date.now(), days = HORIZON_DAYS } = {}) {
  const out = [];
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const day = new Date(start);
    day.setDate(day.getDate() + i);
    if (!settings.days.includes(day.getDay())) continue;
    for (const k of KINDS) {
      if (!settings[k.id]?.on) continue;
      const at = slotAt(day, settings[k.id].time);
      if (at <= now) continue;
      out.push({ kind: k.id, at, day: dayNumber(at) });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

const hash = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

/**
 * Pick one item for a given day.
 *
 * Walking the list with a stride coprime to its length visits every item
 * exactly once before anything repeats — so a year of "word of the day" is a
 * year of different words, not a dice roll that offers 水 three times in a
 * week and never gets to 曜日 at all.
 */
export function cyclePick(list, day, salt) {
  const n = list?.length || 0;
  if (!n) return null;
  const h = hash(salt);
  const span = Math.max(1, n - 1);
  let stride = 1 + (h % span);
  for (let i = 0; i < n && gcd(stride, n) !== 1; i++) stride = 1 + (stride % span);
  return list[(((h % n) + day * stride) % n + n) % n];
}

// ---------------------------------------------------------------- content
async function studyContext() {
  const level = (await store.setting('level', 'N5')) || 'N5';
  const [vocab, kanji, grammar] = await Promise.all([
    data.vocab(level).catch(() => []),
    data.kanji(level).catch(() => []),
    data.grammar(level).catch(() => []),
  ]);
  return { level, vocab, kanji, grammar };
}

const trim = (s, n) => (String(s ?? '').length > n ? `${String(s).slice(0, n - 1)}…` : String(s ?? ''));

/**
 * Write one notification. Returns null when there is nothing to say — an empty
 * level, data not downloaded yet — and the slot is then skipped, rather than
 * firing a notification with a blank body.
 */
export function compose(kind, day, ctx) {
  const level = ctx.level;

  if (kind === 'reminder') {
    return {
      title: '今 Time for today’s Japanese',
      body: 'Your due reviews and today’s new words are waiting. Even five minutes counts.',
      url: '#/today',
      skipIfStudied: true,
    };
  }

  if (kind === 'streak') {
    return {
      title: '火 Your streak is still open',
      body: 'Nothing studied today yet — a handful of cards is enough to keep it.',
      url: '#/review',
      skipIfStudied: true,
    };
  }

  if (kind === 'word') {
    const w = cyclePick(ctx.vocab, day, `word:${level}`);
    if (!w) return null;
    const reading = w.r && w.r !== w.w ? ` ・ ${w.r}` : '';
    return {
      title: `語 ${w.w}${reading}`,
      body: trim((w.m || []).slice(0, 3).join(', ') || 'Word of the day', 120),
      url: `#/words/${level}?w=${encodeURIComponent(w.w)}`,
    };
  }

  if (kind === 'kanji') {
    const k = cyclePick(ctx.kanji, day, `kanji:${level}`);
    if (!k) return null;
    const readings = [
      (k.on || []).length ? `音 ${k.on.slice(0, 3).join('・')}` : '',
      (k.kun || []).length ? `訓 ${k.kun.slice(0, 3).join('・')}` : '',
    ].filter(Boolean).join('   ');
    return {
      title: `漢 ${k.c}`,
      body: trim([(k.m || []).slice(0, 3).join(', '), readings].filter(Boolean).join('\n'), 140),
      url: `#/kanji/${level}?k=${encodeURIComponent(k.c)}`,
    };
  }

  if (kind === 'grammar') {
    const g = cyclePick(ctx.grammar, day, `grammar:${level}`);
    if (!g) return null;
    return {
      title: `文 ${trim(g.pattern, 60)}`,
      body: trim(g.meaning, 140),
      url: `#/grammar/${g.lv || level}/${g.id}`,
    };
  }

  if (kind === 'phrase') {
    // Example sentences ride along with the vocabulary, so this costs no extra
    // download — and every one of them is built on a word from your level.
    const withExamples = (ctx.vocab || []).filter((w) => w.x?.length);
    const w = cyclePick(withExamples, day, `phrase:${level}`);
    const ex = w?.x?.[((day % w.x.length) + w.x.length) % w.x.length];
    if (!ex) return null;
    return {
      title: `例 ${trim(ex[0], 70)}`,
      body: trim(ex[1], 140),
      url: `#/words/${level}?w=${encodeURIComponent(w.w)}`,
    };
  }

  return null;
}

// ---------------------------------------------------------------- the queue
// Rows live in the `progress` store under a `notif:` prefix. Their own object
// store would mean a database version bump, and an upgrade a page still open
// on the old version cannot follow; a key prefix costs nothing and rides along
// in the backup file like everything else.
const rowKey = (at, kind) => `${PREFIX}${at}:${kind}`;

async function queueRows() {
  const rows = await store.all('progress');
  return rows.filter((r) => typeof r?.key === 'string' && r.key.startsWith(PREFIX));
}

async function clearQueue() {
  for (const r of await queueRows()) await store.del('progress', r.key);
  await store.del('progress', STAMP);
}

/** Re-bake the whole upcoming queue. Cheap enough to do once a day. */
export async function rebuild({ now = Date.now() } = {}) {
  for (const r of await queueRows()) {
    if (r.at > now || r.at < now - KEEP_PAST) await store.del('progress', r.key);
  }
  if (!(await isOn())) { await store.del('progress', STAMP); return 0; }

  const [settings, ctx] = await Promise.all([getSettings(), studyContext()]);
  const rows = [];
  for (const slot of plan(settings, { now })) {
    const body = compose(slot.kind, slot.day, ctx);
    if (!body) continue;
    rows.push({
      key: rowKey(slot.at, slot.kind),
      at: slot.at,
      kind: slot.kind,
      tag: `nihongo-${slot.kind}`,
      shown: false,
      ...body,
      // "Don't nag me if I already did it" is a setting; the streak rescue
      // ignores it, because a streak already kept has nothing left to say.
      skipIfStudied: !!body.skipIfStudied && (slot.kind === 'streak' || settings.quietWhenDone),
    });
  }
  await store.putMany('progress', rows);
  // The level is stamped alongside the day: moving from N5 to N4 has to change
  // tomorrow's word, and nothing else in the app would think to say so.
  await store.put('progress', {
    key: STAMP, day: dayKey(now), level: ctx.level, at: now, count: rows.length,
  });
  return rows.length;
}

async function studiedToday() {
  const row = await store.get('progress', `day:${dayKey()}`);
  if (!row) return false;
  return ((row.reviews || 0) + (row.new || 0) + (row.newKanji || 0) + (row.newGrammar || 0)) > 0;
}

/** The soonest notification still to come, for the Settings screen. */
export async function nextUp({ now = Date.now() } = {}) {
  const rows = (await queueRows())
    .filter((r) => !r.shown && r.at > now)
    .sort((a, b) => a.at - b.at);
  return rows[0] || null;
}

// ---------------------------------------------------------------- delivery
async function show(row) {
  if (permission() !== 'granted') return false;
  const reg = await registration();
  if (!reg) return false;
  try {
    await reg.showNotification(row.title, {
      body: row.body,
      tag: row.tag || `nihongo-${row.kind}`,
      renotify: true,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      lang: 'ja',
      data: { url: row.url || '#/today', kind: row.kind },
    });
    return true;
  } catch (e) {
    console.warn('could not show a notification', e);
    return false;
  }
}

/**
 * Consume one queued row. Marking it shown comes FIRST, and happens whether or
 * not anything is displayed, so a row can never fire twice — once from a page
 * timer and again from the worker a minute later.
 */
async function deliver(row) {
  const fresh = await store.get('progress', row.key);
  if (fresh?.shown) return false;
  await store.put('progress', { ...(fresh || row), shown: true });
  if (document.visibilityState === 'visible') return false;   // they are already here
  if (Date.now() > row.at + GRACE) return false;
  if (row.skipIfStudied && (await studiedToday())) return false;
  return show(row);
}

/**
 * Deliver whatever came due while the page was in the background.
 *
 * A background timer is throttled, not guaranteed — the browser is entitled to
 * run a setTimeout minutes late, or not until the tab is touched again.
 * Without this, a reminder whose timer slipped past its moment would sit in
 * the queue unshown until the app was next opened, and then be swept away as
 * old news. The learner would simply never have heard from it.
 */
async function catchUp({ now = Date.now() } = {}) {
  const due = (await queueRows())
    .filter((r) => !r.shown && r.at <= now)
    .sort((a, b) => a.at - b.at);
  if (!due.length) return 0;

  // The same rule the worker follows: show the most recent couple, and consume
  // the rest in silence. A phone that spent the day in a bag must not empty
  // its backlog onto the lock screen all at once.
  const recent = due.filter((r) => r.at > now - GRACE).slice(-2);
  for (const r of due) {
    if (recent.includes(r)) continue;
    await store.put('progress', { ...r, shown: true });
  }
  let n = 0;
  for (const r of recent) if (await deliver(r)) n++;
  return n;
}

let timers = [];
/** Arm page timers for the next few hours. Cleared and reset on every refresh. */
async function arm({ now = Date.now() } = {}) {
  timers.forEach(clearTimeout);
  timers = [];
  if (!(await isOn())) return 0;
  const soon = (await queueRows())
    .filter((r) => !r.shown && r.at > now && r.at < now + ARM_WINDOW)
    .sort((a, b) => a.at - b.at)
    .slice(0, 12);
  for (const r of soon) timers.push(setTimeout(() => { deliver(r).catch(() => {}); }, r.at - now));
  return soon.length;
}

/**
 * Everything that came due while the app was shut is consumed silently. The
 * learner is opening the app right now — a lock-screen pile-up of reminders to
 * do the thing they are already doing is the fastest way to get notifications
 * switched off for good.
 *
 * `consume` is off when the app is in the background, where a row that just
 * came due still belongs to its own timer. Sweeping there would quietly eat a
 * reminder in the second it was about to fire.
 */
async function sweep({ now = Date.now(), consume = true } = {}) {
  for (const r of await queueRows()) {
    if (r.at < now - KEEP_PAST) { await store.del('progress', r.key); continue; }
    if (consume && r.at <= now && !r.shown) await store.put('progress', { ...r, shown: true });
  }
}

/** Sweep, re-bake if the day has turned, re-arm. Safe to call often. */
export async function refresh({ force = false, now = Date.now() } = {}) {
  if (!supported()) return;
  if (!(await isOn())) {
    timers.forEach(clearTimeout);
    timers = [];
    await clearQueue();
    return;
  }
  const here = document.visibilityState === 'visible';
  await sweep({ now, consume: here });
  if (!here) await catchUp({ now });
  const [stamp, level] = await Promise.all([
    store.get('progress', STAMP),
    store.setting('level', 'N5'),
  ]);
  if (force || stamp?.day !== dayKey(now) || stamp?.level !== level) await rebuild({ now });
  await arm({ now });
}

// ---------------------------------------------------------------- controls
/**
 * Turn reminders on, asking for permission if it has not been asked for yet.
 * @returns {Promise<'granted'|'denied'|'default'|'unsupported'>}
 */
export async function enable() {
  if (!supported()) return 'unsupported';
  let p = permission();
  if (p === 'default') {
    try { p = await Notification.requestPermission(); } catch { p = 'denied'; }
  }
  if (p !== 'granted') {
    await store.setSetting('notify', { ...(await getSettings()), enabled: false });
    return p;
  }
  await wakeups();
  await setSettings({ enabled: true });
  return 'granted';
}

export async function disable() {
  await setSettings({ enabled: false });
  const reg = await registration();
  try { await reg?.periodicSync?.unregister(SYNC_TAG); } catch { /* nothing registered */ }
  try { (await reg?.getNotifications?.())?.forEach((n) => n.close()); } catch { /* none open */ }
}

/** Show one right now, so Settings can prove to the learner that it works. */
export async function test(kind = 'word') {
  if (permission() !== 'granted') return false;
  const ctx = await studyContext();
  const body = compose(kind, dayNumber(), ctx) || compose('reminder', dayNumber(), ctx);
  return show({ ...body, kind, tag: 'nihongo-test' });
}

// ---------------------------------------------------------------- lifecycle
export async function start() {
  if (!supported()) return;
  const s = await getSettings();
  if (!s.enabled) return;
  // Permission can be revoked from the browser's own settings at any time, and
  // an app that still believed reminders were on would quietly never send one.
  if (permission() !== 'granted') {
    await store.setSetting('notify', { ...s, enabled: false });
    return;
  }
  await wakeups();
  await refresh();

  // Going away is when the page timers start to matter; coming back is when
  // the day may have turned over underneath them.
  document.addEventListener('visibilitychange', () => { refresh().catch(() => {}); });
  // Timers only reach a few hours ahead, so an app left open all day would
  // otherwise go quiet after the last one it armed at breakfast.
  setInterval(() => { refresh().catch(() => {}); }, 3600e3);
}
