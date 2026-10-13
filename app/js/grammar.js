// Grammar as a syllabus, not a reference list.
//
// The level files are a reference: every point the JLPT lists, in whatever
// order the sources happened to supply. To teach grammar the way the app
// teaches words and kanji — a few new points a day, each explained, practised,
// then scheduled — two things are needed that the data does not give:
//
//   1. an order that runs genuinely easy to hard
//   2. questions
//
// Both are derived here. No DOM, no storage, so it can be tested in node:
//   node build/test/grammar.mjs

const JA_RUN = /[ぁ-ゟ゠-ヿ々-〇一-鿿]+/g;

// A one-character answer is only fair when the character is a particle: that is
// the classic "which particle goes here" question. 毎 or な on their own are not.
const SINGLE_OK = new Set(['は', 'が', 'を', 'に', 'で', 'と', 'へ', 'も', 'や', 'の', 'か', 'ね', 'よ']);

/** Strip everything that is a placeholder rather than Japanese the learner types. */
const strip = (pattern) => String(pattern || '')
  .replace(/[（(][^）)]*[）)]/g, ' ')        // （but）, (に) — glosses and optional tails
  .replace(/[A-Za-z0-9'’‐-―-]+/g, ' ');  // X, Y, Noun, V, i-adjective

/**
 * The literal Japanese in a pattern, longest first — what a learner has to
 * supply. "Verb-て + ください" gives ['ください', 'て'].
 */
export function coreForms(pattern) {
  const runs = strip(pattern).match(JA_RUN) || [];
  return [...new Set(runs)].sort((a, b) => b.length - a.length);
}

/**
 * The pattern's Japanese reduced to one string, so the same point written two
 * ways collapses: "Verb-て + ください" and "〜てください" both give てください.
 */
export const signature = (pattern) => (strip(pattern).match(JA_RUN) || []).join('');

/** Forms that make an honest cloze answer. */
const answerable = (pattern) => coreForms(pattern).filter((f) => f.length >= 2 || SINGLE_OK.has(f));

/**
 * One level's points in teaching order.
 *
 * The curated set (gid `desu-polite-copula`, …) is already written in teaching
 * order — copula, polite verb endings, particles, demonstratives, existence,
 * て-form, adjectives, then counters and causes. The OpenJLPT fill-ins (gid
 * `oj-…`) are alphabetical and much thinner, so they follow, and one that
 * teaches a form the curated set already covers is dropped: being taught
 * 〜てください twice, the second time with no explanation, teaches nothing.
 *
 * Browsing still lists the whole file — nothing is hidden, only unscheduled.
 */
export function syllabus(list) {
  const curated = [];
  const extra = [];
  for (const g of list || []) (String(g.gid).startsWith('oj-') ? extra : curated).push(g);

  const taught = new Set(curated.map((g) => signature(g.pattern)).filter(Boolean));
  const kept = extra.filter((g) => {
    const sig = signature(g.pattern);
    if (!sig || taught.has(sig)) return false;
    taught.add(sig);
    return true;
  });

  return [...curated, ...kept].map((g, i) => ({ ...g, ord: i }));
}

/** Across levels the order is simply N5 → N1: that is what "harder" means here. */
export const LEVEL_ORDER = ['N5', 'N4', 'N3', 'N2', 'N1'];

// ---------------------------------------------------------------- questions

const shuffled = (a, rnd) => {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
};
const pick = (a, n, rnd) => shuffled(a, rnd).slice(0, n);

function occurrences(hay, needle) {
  let n = 0;
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) n++;
  return n;
}

/** Every form the other points at this level teach — the distractor supply. */
function formPool(pool, self) {
  const out = new Set();
  for (const p of pool) {
    if (p.gid === self.gid) continue;
    for (const f of answerable(p.pattern)) out.add(f);
  }
  return [...out];
}

/**
 * Wrong answers have to be plausible, which means the same shape as the right
 * one. A three-character answer among three one-character options is not a
 * question, it is a giveaway — so options are matched for length, and anything
 * already visible in the sentence is excluded.
 */
function distractors(target, sentence, pool, n, rnd) {
  const usable = pool.filter((f) =>
    f !== target && !sentence.includes(f) && !f.includes(target) && !target.includes(f));
  const bands = target.length === 1
    ? [(f) => f.length === 1, (f) => f.length <= 2, () => true]
    : [(f) => f.length >= 2 && Math.abs(f.length - target.length) <= 2,
       (f) => f.length >= 2 && Math.abs(f.length - target.length) <= 4,
       (f) => f.length >= 2];

  const chosen = [];
  for (const band of bands) {
    for (const f of pick(usable.filter(band), n * 3, rnd)) {
      if (chosen.length >= n) break;
      if (!chosen.includes(f)) chosen.push(f);
    }
    if (chosen.length >= n) break;
  }
  return chosen.slice(0, n);
}

/**
 * Practice for one point, built from its own example sentences.
 *
 * `cloze`   the pattern is taken out of a real sentence and rebuilt
 * `meaning` the pattern is shown and the meaning chosen
 * `pick`    the English is shown and the sentence chosen — only used when
 *           nothing in the pattern can be blanked (これ/それ/あれ, counters)
 *
 * @param {object} g     the point being taught
 * @param {object[]} pool other points at the same level, for wrong answers
 */
export function questions(g, pool = [], rnd = Math.random) {
  const out = [];
  const cores = answerable(g.pattern);
  const examples = (g.x || []).filter(([ja]) => ja);
  const forms = formPool(pool, g);

  for (const [ja, en] of examples) {
    if (out.length >= 2) break;
    // Exactly once, or blanking the first one leaves the answer in plain sight.
    const target = cores.find((f) => occurrences(ja, f) === 1);
    if (!target) continue;
    const wrong = distractors(target, ja, forms, 3, rnd);
    if (wrong.length < 3) continue;
    const at = ja.indexOf(target);
    out.push({
      kind: 'cloze',
      before: ja.slice(0, at),
      after: ja.slice(at + target.length),
      full: ja,
      en,
      answer: target,
      options: shuffled([target, ...wrong], rnd),
    });
  }

  const meanings = [...new Set(pool.map((p) => p.meaning).filter((m) => m && m !== g.meaning))];
  if (g.meaning && meanings.length >= 3) {
    out.push({
      kind: 'meaning',
      pattern: g.pattern,
      answer: g.meaning,
      options: shuffled([g.meaning, ...pick(meanings, 3, rnd)], rnd),
    });
  }

  if (!out.some((q) => q.kind === 'cloze') && examples.length) {
    const [ja, en] = examples[0];
    const others = [...new Set(pool.flatMap((p) => (p.x || []).map(([j]) => j)).filter((j) => j && j !== ja))];
    if (others.length >= 3) {
      out.push({ kind: 'pick', en, answer: ja, options: shuffled([ja, ...pick(others, 3, rnd)], rnd) });
    }
  }

  return out;
}

// ---------------------------------------------------------------- SRS glue
export const cardKey = (gid) => `grammar:${gid}:rec`;
export const deckOf = (lv) => `grammar:${lv}`;
