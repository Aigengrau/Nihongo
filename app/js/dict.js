// Runtime dictionary: loads the packed index built by build/build-data.mjs and
// answers "what is this word?" for tapped subtitle/story words.
//
// Packed shape (see build-data.mjs packDict):
//   { v, pos:[string], e:[[kanjiJoined, kanaJoined, senses, common]], i:{surface:[entryIdx]} }
//   senses: [[posCodes[], "gloss; gloss", miscCodes[]]]

import { deinflect } from './deinflect.js';

let data = null;
let loading = null;

const POS_LABEL = {
  'n': 'noun', 'pn': 'pronoun', 'adj-i': 'い-adjective', 'adj-na': 'な-adjective',
  'adj-no': 'の-adjective', 'adj-pn': 'pre-noun adjectival', 'adv': 'adverb',
  'v1': 'ichidan verb', 'v5u': 'godan verb (う)', 'v5k': 'godan verb (く)',
  'v5g': 'godan verb (ぐ)', 'v5s': 'godan verb (す)', 'v5t': 'godan verb (つ)',
  'v5n': 'godan verb (ぬ)', 'v5b': 'godan verb (ぶ)', 'v5m': 'godan verb (む)',
  'v5r': 'godan verb (る)', 'v5k-s': 'godan verb (行く)', 'v5aru': 'godan verb (ある)',
  'vk': 'kuru verb', 'vs': 'suru verb', 'vs-i': 'suru verb', 'vs-s': 'suru verb',
  'vt': 'transitive', 'vi': 'intransitive', 'prt': 'particle', 'conj': 'conjunction',
  'int': 'interjection', 'exp': 'expression', 'pref': 'prefix', 'suf': 'suffix',
  'ctr': 'counter', 'num': 'numeric', 'aux-v': 'auxiliary verb', 'cop': 'copula',
};
const MISC_LABEL = {
  'uk': 'usually kana', 'col': 'colloquial', 'hon': 'honorific (尊敬語)',
  'hum': 'humble (謙譲語)', 'pol': 'polite (丁寧語)', 'sl': 'slang',
  'arch': 'archaic', 'obs': 'obsolete', 'rare': 'rare', 'derog': 'derogatory',
  'on-mim': 'onomatopoeia', 'yoji': 'four-character idiom', 'id': 'idiom',
  'vulg': 'vulgar', 'fam': 'familiar', 'abbr': 'abbreviation',
};

export async function load(url = './data/dict/common.json') {
  if (data) return data;
  if (loading) return loading;
  loading = fetch(url)
    .then((r) => { if (!r.ok) throw new Error(`dictionary ${r.status}`); return r.json(); })
    .then((j) => { data = j; loading = null; return j; })
    // Clear the latch on failure, or every later ready() re-awaits the same
    // dead promise and tap-a-word stays off for the whole session.
    .catch((e) => { loading = null; throw e; });
  return loading;
}

export const isLoaded = () => !!data;

/**
 * Resolve once the dictionary is usable. Screens that render tappable Japanese
 * MUST await this — otherwise a cold deep link (a PWA shortcut, a refresh on
 * /watch or /read) paints a whole screen of dead, untappable text with nothing
 * to trigger a re-render. Resolves false if the dictionary cannot be loaded, so
 * callers can render plain text and say why rather than hang.
 */
export async function ready() {
  if (data) return true;
  try { await load(); return true; } catch { return false; }
}

function hydrate(idx) {
  const [kanji, kana, senses, common] = data.e[idx];
  return {
    idx,
    kanji: kanji ? kanji.split('|') : [],
    kana: kana ? kana.split('|') : [],
    common: !!common,
    senses: senses.map(([pos, gloss, misc]) => ({
      pos: pos.map((c) => data.pos[c]),
      posLabels: pos.map((c) => POS_LABEL[data.pos[c]] || data.pos[c]),
      misc: misc.map((c) => data.pos[c]),
      miscLabels: misc.map((c) => MISC_LABEL[data.pos[c]]).filter(Boolean),
      gloss,
    })),
    get glosses() { return senses.flatMap(([, g]) => g.split('; ')); },
  };
}

/** All dictionary entries for an exact surface form, best first. */
export function lookupExact(surface) {
  if (!data) return [];
  const hits = data.i[surface];
  return hits ? hits.map(hydrate) : [];
}

/** Single best entry, or null. Used as the tokenizer's lookup function. */
export function lookup(surface) {
  const l = lookupExact(surface);
  return l.length ? l[0] : null;
}

/**
 * Full explanation for a tapped word: the dictionary form we reached, how it was
 * inflected to get there, and every sense.
 */
export function explain(surface) {
  if (!data) return null;
  const cands = deinflect(surface, lookup);
  if (!cands.length) return null;
  const best = cands[0];
  return {
    surface,
    base: best.form,
    inflection: best.chain,
    entries: lookupExact(best.form),
    alternatives: cands.slice(1, 4).map((c) => ({ base: c.form, chain: c.chain })),
  };
}

/** Reading for a surface form, for furigana over arbitrary text. */
export function readingOf(surface) {
  const e = lookup(surface);
  if (!e) return null;
  if (e.kanji.includes(surface)) return e.kana[0] || null;
  return null;
}

export { POS_LABEL, MISC_LABEL };
