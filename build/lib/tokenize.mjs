// Segmenting unsegmented Japanese.
//
// Greedy longest-match is the obvious approach and it is wrong often enough to
// matter: 天気がいいので becomes 天気 / がい(害) / いの / で, because がい happens to
// be a dictionary word. Instead this scores every possible segmentation and
// takes the cheapest one overall (a shortest-path over the string), so a
// locally attractive long match loses when it forces nonsense afterwards.
import { deinflect } from './deinflect.mjs';

const KANJI = /[一-鿿㐀-䶿々〆ヶ]/;
const HIRA = /[぀-ゟ]/;
const KATA = /[゠-ヿー]/;
const LATIN = /[A-Za-z0-9]/;
const PUNCT = /[\s、。「」『』（）()！？!?・…―ー〜~,.:;"'”“]/;

// Function words. Seeing one of these is unremarkable, so they cost little.
const PARTICLES = new Set([
  'は', 'が', 'を', 'に', 'へ', 'と', 'で', 'も', 'の', 'や', 'か', 'ね', 'よ', 'な', 'さ',
  'から', 'まで', 'より', 'など', 'ほど', 'だけ', 'しか', 'でも', 'ので', 'のに', 'ため',
  'けど', 'けれど', 'たら', 'ば', 'し', 'ても', 'では', 'には', 'とは', 'って', 'という',
  'です', 'ます', 'だ', 'である', 'でしょう', 'ください',
]);

const charClass = (c) =>
  KANJI.test(c) ? 'kanji' : HIRA.test(c) ? 'hira' : KATA.test(c) ? 'kata'
  : LATIN.test(c) ? 'latin' : PUNCT.test(c) ? 'punct' : 'other';

// JMdict marks a sense "uk" when it is normally written in kana. The two
// directions need different tests:
//   kana surface  — fine if ANY sense is usually-kana (なかなか, 中々)
//   kanji surface — suspicious only if EVERY sense is usually-kana (今日は)
const anyUk = (e) =>
  !!e && Array.isArray(e.senses) && e.senses.some((s) => (s.misc || []).includes('uk'));
const allUk = (e) =>
  !!e && Array.isArray(e.senses) && e.senses.length > 0 && e.senses.every((s) => (s.misc || []).includes('uk'));
const hasKanjiForm = (e) => !!e && Array.isArray(e.kanji) && e.kanji.length > 0;

/**
 * What it costs to accept `surface` as one token. Lower is better.
 * The weights are ordinary heuristics, tuned against the sentences in
 * build/test/tok.mjs; they only ever compete against each other.
 */
function cost(surface, cand) {
  if (!cand) {
    // Unknown text. Expensive, and worse the longer it runs, so the search
    // only falls back to it when nothing else fits.
    return 12 + surface.length * 2;
  }
  const { entry, chain } = cand;
  let c = 1;

  if (PARTICLES.has(surface)) c = 0.4;

  // Prefer longer words, mildly — enough to beat two short ones, not enough
  // to justify an implausible match.
  c -= Math.min(surface.length - 1, 4) * 0.28;

  // Every inflection step is an assumption; simpler analyses win ties.
  c += (chain?.length || 0) * 0.18;

  const kanaSurface = !KANJI.test(surface);

  // A word that HAS kanji and is not normally written in kana, appearing here
  // in bare kana, is usually a coincidence: がい matching 害 inside 〜がいい,
  // から matching 空. Distrust it.
  if (kanaSurface && hasKanjiForm(entry) && !anyUk(entry) && !PARTICLES.has(surface)) c += 2.6;

  // The mirror case: an entry normally written in kana (こんにちは) matched
  // against a kanji surface (今日は) is usually really two words.
  if (!kanaSurface && allUk(entry)) c += 2.6;

  if (entry && entry.common === false) c += 0.9;

  // A lone kana that is not a particle is nearly always a fragment.
  if (surface.length === 1 && kanaSurface && !PARTICLES.has(surface)) c += 1.6;

  return c;
}

/**
 * @param {string} text
 * @param {(s:string)=>any} lookup dictionary lookup, returns an entry or null
 * @param {number} maxLen longest candidate substring to consider
 * @returns {{s:string, i:number, kind:string, base?:string, chain?:string[], entry?:any}[]}
 */
// Deinflection dominates the cost and the same substrings recur constantly
// across a page of subtitles, so cache across calls. Bounded so a long reading
// session cannot grow it without limit.
const memo = new Map();
const MEMO_MAX = 20000;
function analyse(sub, lookup) {
  const hit = memo.get(sub);
  if (hit !== undefined) return hit;
  const r = deinflect(sub, lookup)[0] || null;
  if (memo.size >= MEMO_MAX) memo.clear();
  memo.set(sub, r);
  return r;
}

/** Drop the cache if the dictionary is swapped for a different one. */
export const resetTokenizerCache = () => memo.clear();

export function tokenize(text, lookup, maxLen = 12) {
  const n = text.length;
  if (!n) return [];

  // best[i] = cheapest cost to cover text[0..i)
  const best = new Float64Array(n + 1).fill(Infinity);
  const from = new Int32Array(n + 1).fill(-1);
  const pick = new Array(n + 1).fill(null);
  best[0] = 0;

  for (let i = 0; i < n; i++) {
    if (best[i] === Infinity) continue;
    const cls = charClass(text[i]);

    // Punctuation and latin/number runs are their own tokens, always.
    if (cls === 'punct') {
      const c = best[i] + 0.2;
      if (c < best[i + 1]) { best[i + 1] = c; from[i + 1] = i; pick[i + 1] = { kind: 'punct' }; }
      continue;
    }
    if (cls === 'latin') {
      let j = i;
      while (j < n && charClass(text[j]) === 'latin') j++;
      const c = best[i] + 1;
      if (c < best[j]) { best[j] = c; from[j] = i; pick[j] = { kind: 'latin' }; }
      continue;
    }

    const limit = Math.min(maxLen, n - i);
    for (let len = 1; len <= limit; len++) {
      const end = i + len;
      const sub = text.slice(i, end);
      if (PUNCT.test(sub)) break;         // never span a punctuation boundary
      const cand = analyse(sub, lookup);
      // Unknown runs are only worth considering one character at a time, plus
      // whole katakana runs (names, loanwords the dictionary will not have).
      if (!cand && len > 1) {
        const isKataRun = cls === 'kata' && charClass(text[end - 1]) === 'kata';
        if (!isKataRun) continue;
      }
      const c = best[i] + cost(sub, cand);
      if (c < best[end]) {
        best[end] = c;
        from[end] = i;
        pick[end] = cand
          ? { kind: PARTICLES.has(sub) && sub.length <= 2 ? 'particle' : 'word', cand }
          : { kind: 'unknown' };
      }
    }
  }

  // Walk the cheapest path back.
  const out = [];
  let i = n;
  while (i > 0) {
    const j = from[i];
    if (j < 0) { // no path (should not happen) — emit the rest as unknown
      out.push({ s: text.slice(0, i), i: 0, kind: 'unknown' });
      break;
    }
    const p = pick[i];
    const s = text.slice(j, i);
    out.push(
      p?.cand
        ? { s, i: j, kind: p.kind, base: p.cand.form, chain: p.cand.chain, entry: p.cand.entry }
        : { s, i: j, kind: p?.kind || 'unknown' }
    );
    i = j;
  }
  return out.reverse();
}
