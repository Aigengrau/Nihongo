// FSRS-5 (Free Spaced Repetition Scheduler), the open-source algorithm Anki now
// ships as its default. It models memory as two variables per card:
//   stability  S - days until recall probability falls to 90%
//   difficulty D - 1..10, how hard this item is for this learner
// and schedules the next review at the point where predicted recall hits the
// target retention. It beats SM-2 mainly because it uses *when you actually
// forgot*, not just a fixed multiplier.
//
// Reference: github.com/open-spaced-repetition/fsrs4anki (MIT). Weights below
// are the published FSRS-5 defaults, used until a learner has enough history
// to justify optimised ones.

export const DEFAULT_W = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621,
];

const DECAY = -0.5;
const FACTOR = 19 / 81; // = 0.9^(1/DECAY) - 1

export const RATING = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };
export const STATE = { NEW: 0, LEARNING: 1, REVIEW: 2, RELEARNING: 3 };

const DAY = 86400000;
const clampD = (d) => Math.min(Math.max(d, 1), 10);

/** Probability of recalling a card whose stability is S after t days. */
export function retrievability(t, S) {
  if (S <= 0) return 0;
  return Math.pow(1 + FACTOR * (t / S), DECAY);
}

/** Days until retrievability falls to `request`. */
function interval(S, request) {
  return (S / FACTOR) * (Math.pow(request, 1 / DECAY) - 1);
}

const initStability = (w, g) => Math.max(w[g - 1], 0.1);
const initDifficulty = (w, g) => clampD(w[4] - Math.exp(w[5] * (g - 1)) + 1);

function nextDifficulty(w, D, g) {
  const delta = -w[6] * (g - 3);
  const damped = D + delta * ((10 - D) / 9);          // linear damping
  return clampD(w[7] * initDifficulty(w, RATING.EASY) + (1 - w[7]) * damped); // mean reversion
}

function stabilityOnRecall(w, D, S, R, g) {
  const hard = g === RATING.HARD ? w[15] : 1;
  const easy = g === RATING.EASY ? w[16] : 1;
  const inc =
    Math.exp(w[8]) * (11 - D) * Math.pow(S, -w[9]) *
    (Math.exp(w[10] * (1 - R)) - 1) * hard * easy;
  return S * (1 + inc);
}

function stabilityOnLapse(w, D, S, R) {
  const long = w[11] * Math.pow(D, -w[12]) * (Math.pow(S + 1, w[13]) - 1) * Math.exp(w[14] * (1 - R));
  // FSRS-5 caps post-lapse stability at the pre-lapse value.
  return Math.min(long, S);
}

// Same-day repeats move stability far less than a real inter-day review.
// Hard (g=2) gives a factor below 1, so repeated same-day Hards decay stability.
// That is intended for a rep or two, but left unbounded it drives S toward zero,
// so floor it: a card you are actively looking at is not less than a day's worth
// of memory.
const SHORT_TERM_FLOOR = 0.5;
const shortTermStability = (w, S, g) =>
  Math.max(SHORT_TERM_FLOOR, S * Math.exp(w[17] * (g - 3 + w[18])));

// A card that never leaves the learning steps is a trap: Hard repeats the same
// step, so a learner who keeps pressing Hard sees the same card every 10 minutes
// forever. Graduate it after this many non-Again attempts and let the real
// scheduler take over — it will come back soon enough if it is genuinely hard.
const MAX_LEARNING_REPS = 4;

/**
 * @typedef {object} Card
 * @property {string} key      unique id, e.g. "vocab:1234:recognition"
 * @property {string} deck     which deck it belongs to
 * @property {number} state    STATE.*
 * @property {number} S        stability (days)
 * @property {number} D        difficulty (1..10)
 * @property {number} due      epoch ms
 * @property {number} lastReview epoch ms, 0 if never
 * @property {number} reps
 * @property {number} lapses
 */

export function newCard(key, deck, extra = {}) {
  return {
    key, deck,
    state: STATE.NEW,
    S: 0, D: 0,
    due: Date.now(),
    lastReview: 0,
    reps: 0,
    lapses: 0,
    learnReps: 0,
    suspended: false,
    ...extra,
  };
}

/**
 * Schedule a card after a review.
 * @param {Card} card
 * @param {number} rating RATING.AGAIN..EASY
 * @param {object} opts {now, w, retention, learningSteps (minutes), relearningSteps, maximumInterval}
 * @returns {{card: Card, log: object}}
 */
export function review(card, rating, opts = {}) {
  const {
    now = Date.now(),
    w = DEFAULT_W,
    retention = 0.9,
    learningSteps = [1, 10],
    relearningSteps = [10],
    maximumInterval = 36500,
  } = opts;

  const elapsedDays = card.lastReview ? Math.max(0, (now - card.lastReview) / DAY) : 0;
  const next = { ...card };
  next.reps = card.reps + 1;
  next.lastReview = now;

  if (card.state === STATE.NEW) {
    next.D = initDifficulty(w, rating);
    next.S = initStability(w, rating);
    next.state = rating === RATING.EASY ? STATE.REVIEW : STATE.LEARNING;
    next.step = rating === RATING.EASY ? 0 : (rating === RATING.AGAIN ? 0 : 1);
    next.learnReps = rating === RATING.EASY ? 0 : 1;
  } else {
    const R = retrievability(elapsedDays, card.S);
    next.D = nextDifficulty(w, card.D, rating);

    const sameDay = elapsedDays < 1;
    if (rating === RATING.AGAIN) {
      next.lapses = card.lapses + 1;
      next.S = sameDay ? shortTermStability(w, card.S, rating) : stabilityOnLapse(w, card.D, card.S, R);
      next.state = card.state === STATE.REVIEW ? STATE.RELEARNING : card.state;
      next.step = 0;
      next.learnReps = 0;
    } else {
      next.S = sameDay ? shortTermStability(w, card.S, rating) : stabilityOnRecall(w, card.D, card.S, R, rating);
      if (card.state === STATE.LEARNING || card.state === STATE.RELEARNING) {
        const steps = card.state === STATE.LEARNING ? learningSteps : relearningSteps;
        // Hard repeats the current step, as in Anki — but count the attempt so
        // it cannot repeat indefinitely.
        const step = (card.step ?? 0) + (rating === RATING.HARD ? 0 : 1);
        const learnReps = (card.learnReps ?? 0) + 1;
        if (rating === RATING.EASY || step >= steps.length || learnReps >= MAX_LEARNING_REPS) {
          next.state = STATE.REVIEW;
          next.step = 0;
          next.learnReps = 0;
        } else {
          next.step = step;
          next.learnReps = learnReps;
        }
      } else {
        next.state = STATE.REVIEW;
      }
    }
  }

  // Due date: graduated cards get an interval in days, learning cards in minutes.
  if (next.state === STATE.LEARNING || next.state === STATE.RELEARNING) {
    const steps = next.state === STATE.LEARNING ? learningSteps : relearningSteps;
    const mins = steps[Math.min(next.step ?? 0, steps.length - 1)] ?? 10;
    next.due = now + mins * 60000;
    next.scheduledDays = 0;
  } else {
    const days = Math.min(Math.max(Math.round(interval(next.S, retention)), 1), maximumInterval);
    next.scheduledDays = days;
    next.due = now + days * DAY;
  }

  const log = {
    key: card.key, rating, at: now,
    elapsedDays: +elapsedDays.toFixed(4),
    stateBefore: card.state,
    S: +next.S.toFixed(4), D: +next.D.toFixed(4),
    scheduledDays: next.scheduledDays ?? 0,
  };
  return { card: next, log };
}

/** What each button would schedule - shown on the buttons so the user can see ahead. */
export function preview(card, opts = {}) {
  const out = {};
  for (const [name, r] of Object.entries(RATING)) {
    const { card: c } = review(card, r, opts);
    out[name] = c.state === STATE.LEARNING || c.state === STATE.RELEARNING
      ? `${Math.round((c.due - (opts.now ?? Date.now())) / 60000)}m`
      : humanInterval(c.scheduledDays);
  }
  return out;
}

export function humanInterval(days) {
  if (days < 1) return '<1d';
  if (days < 30) return `${Math.round(days)}d`;
  if (days < 365) return `${(days / 30.4).toFixed(days < 60 ? 1 : 0)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

/**
 * Build a study queue: due reviews first (oldest first), then new cards up to
 * the daily limit, interleaved so a session never becomes all-new or all-review.
 */
export function buildQueue(cards, { now = Date.now(), newPerDay = 10, reviewCap = 120, newToday = 0 } = {}) {
  const live = cards.filter((c) => !c.suspended);
  const dueCards = live
    .filter((c) => c.state !== STATE.NEW && c.due <= now)
    .sort((a, b) => a.due - b.due)
    .slice(0, reviewCap);
  const fresh = live
    .filter((c) => c.state === STATE.NEW)
    .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))
    .slice(0, Math.max(0, newPerDay - newToday));

  // Interleave: roughly one new card per `spacing` reviews.
  if (!dueCards.length) return fresh;
  if (!fresh.length) return dueCards;
  const out = [];
  const spacing = Math.max(1, Math.floor(dueCards.length / fresh.length));
  let fi = 0;
  dueCards.forEach((c, i) => {
    out.push(c);
    if ((i + 1) % spacing === 0 && fi < fresh.length) out.push(fresh[fi++]);
  });
  while (fi < fresh.length) out.push(fresh[fi++]);
  return out;
}

/**
 * Sibling burying: never show two cards for the same word in one session
 * (seeing 食べる→to eat right before to eat→食べる teaches nothing).
 */
export function burySiblings(queue) {
  const seen = new Set();
  const kept = [];
  const buried = [];
  for (const c of queue) {
    // A word can have both a level card (vocab:123:rec) and a saved card
    // (saved:食べる:rec). Key the sibling group on the underlying word where we
    // know it, so the same word cannot appear twice in one session.
    const root = c.vocabId != null
      ? `w:${c.vocabId}`
      : c.word ? `w:${c.word}` : c.key.split(':').slice(0, 2).join(':');
    if (seen.has(root)) { buried.push(c); continue; }
    seen.add(root);
    kept.push(c);
  }
  return { queue: kept, buried };
}

/** Cards failed repeatedly are leeches - they need a different approach, not more reps. */
export const isLeech = (card, threshold = 8) => card.lapses >= threshold;
