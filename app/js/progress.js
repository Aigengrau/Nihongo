// Daily counters, streak, and the card inventory that drives Today.
import * as store from './store.js';
import { STATE, buildQueue, burySiblings, newCard } from './srs.js';

const DAY = 86400000;
export const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function today() {
  const k = dayKey();
  const row = (await store.get('progress', `day:${k}`))
    || { key: `day:${k}`, day: k, new: 0, reviews: 0, correct: 0, minutes: 0 };
  row.newKanji = row.newKanji || 0;
  return row;
}

export async function bumpToday(patch) {
  const t = await today();
  for (const [k, v] of Object.entries(patch)) t[k] = (t[k] || 0) + v;
  await store.put('progress', t);
  return t;
}

export async function streak() {
  const s = (await store.get('progress', 'streak')) || { key: 'streak', current: 0, best: 0, last: null, freezes: 2 };
  return s;
}

/**
 * Record that the user studied today. A streak survives one missed day per
 * available freeze — the point is to protect a habit, not to punish a bad week.
 */
export async function touchStreak() {
  const s = await streak();
  const t = dayKey();
  if (s.last === t) return s;

  const yesterday = dayKey(Date.now() - DAY);
  if (s.last === yesterday || s.last === null) {
    s.current += 1;
  } else {
    const missed = s.last ? Math.round((new Date(t) - new Date(s.last)) / DAY) - 1 : 0;
    if (missed > 0 && s.freezes >= missed) {
      s.freezes -= missed;
      s.current += 1;
    } else {
      s.current = 1;
    }
  }
  s.last = t;
  s.best = Math.max(s.best, s.current);
  // Earn a freeze back every 7 days studied, capped at 3.
  if (s.current % 7 === 0) s.freezes = Math.min(3, s.freezes + 1);
  await store.put('progress', s);
  return s;
}

/**
 * The adaptive new-card cap. A big review backlog means the last thing the
 * learner needs is more new words — this is the throttle that stops the
 * "400 reviews due" death spiral that makes people quit SRS.
 */
export function newAllowance(dueCount, base = 10) {
  return Math.max(0, Math.min(base, base - Math.floor(dueCount / 25)));
}

/**
 * How many new items of one kind are still on offer today, and why not more.
 * Words and kanji have SEPARATE daily counts: learning ten words used to zero
 * the kanji allowance too, which read as "reviews are blocking me" when no
 * reviews were due at all.
 */
export async function remainingNew(kind = 'vocab') {
  const [inv, t] = await Promise.all([inventory(), today()]);
  const base = await store.setting('newPerDay', 10);
  const cap = newAllowance(inv.due, base);
  const doneToday = kind === 'kanji' ? t.newKanji : t.new;
  const left = Math.max(0, cap - doneToday);
  let reason = null;
  if (left === 0) reason = cap === 0 ? 'backlog' : 'daily-goal';
  return { left, cap, base, doneToday, due: inv.due, reason };
}

export async function inventory() {
  const cards = await store.all('cards');
  const now = Date.now();
  const live = cards.filter((c) => !c.suspended);
  return {
    total: live.length,
    due: live.filter((c) => c.state !== STATE.NEW && c.due <= now).length,
    fresh: live.filter((c) => c.state === STATE.NEW).length,
    learning: live.filter((c) => c.state === STATE.LEARNING || c.state === STATE.RELEARNING).length,
    review: live.filter((c) => c.state === STATE.REVIEW).length,
    cards: live,
  };
}

/** WaniKani-style human labels on top of FSRS stability, so progress is visible. */
export function stage(card) {
  if (!card || card.state === STATE.NEW) return 'new';
  if (card.S < 1) return 'apprentice';
  if (card.S < 14) return 'guru';
  if (card.S < 60) return 'master';
  if (card.S < 180) return 'enlightened';
  return 'burned';
}
export const STAGES = ['new', 'apprentice', 'guru', 'master', 'enlightened', 'burned'];

export async function session({ deck = null, newPerDay = null, reviewCap = null } = {}) {
  const inv = await inventory();
  const t = await today();
  const base = newPerDay ?? (await store.setting('newPerDay', 10));
  const cap = reviewCap ?? (await store.setting('reviewCap', 120));

  let pool = inv.cards;
  if (deck) pool = pool.filter((c) => c.deck === deck || c.deck?.startsWith(`${deck}:`));

  // The new-card throttle exists to stop a review backlog spiralling, so base
  // it on the backlog in the deck being studied. Asking for your own saved
  // words is not the death spiral the throttle guards against, so that deck is
  // exempt from it.
  const deckDue = deck ? pool.filter((c) => c.state !== 0 && c.due <= Date.now()).length : inv.due;
  const allowance = deck === 'saved' ? base : newAllowance(deckDue, base);

  const q = buildQueue(pool, { newPerDay: allowance, reviewCap: cap, newToday: deck === 'saved' ? 0 : t.new });
  return burySiblings(q);
}

/** Add a level's vocabulary to the study pool the first time it is opened. */
export async function enrollLevel(level, vocabList, limit = Infinity) {
  const existing = new Set((await store.all('cards')).map((c) => c.key));
  const add = [];
  for (const w of vocabList.slice(0, limit)) {
    const key = `vocab:${w.id}:rec`;
    if (existing.has(key)) continue;
    add.push(newCard(key, `level:${level}`, { word: w.w, reading: w.r, vocabId: w.id, ord: w.ord, lv: level }));
  }
  if (add.length) await store.putMany('cards', add);
  return add.length;
}

/**
 * Add a level's kanji to the study pool. Kanji cards live alongside vocabulary
 * in the same deck and the same scheduler, keyed by the character so a kanji
 * can never be enrolled twice under two levels.
 */
export async function enrollKanji(level, kanjiList, limit = Infinity) {
  const existing = new Set((await store.all('cards')).map((c) => c.key));
  const add = [];
  for (const k of kanjiList.slice(0, limit)) {
    const key = `kanji:${k.c}:rec`;
    if (existing.has(key)) continue;
    add.push(newCard(key, `kanji:${level}`, {
      word: k.c, kanji: k.c, kanjiId: k.id, lv: level, ord: k.id,
      reading: [...(k.on || []), ...(k.kun || [])].slice(0, 3).join('・'),
    }));
  }
  if (add.length) await store.putMany('cards', add);
  return add.length;
}

/** Review counts per day for the heatmap. */
export async function history(days = 119) {
  const rows = await store.all('reviews');
  const counts = new Map();
  for (const r of rows) {
    const k = dayKey(r.at);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const out = [];
  for (let i = days; i >= 0; i--) {
    const k = dayKey(Date.now() - i * DAY);
    out.push({ day: k, n: counts.get(k) || 0 });
  }
  return out;
}
