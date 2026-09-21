// Assembles the app's study data from the cached upstream corpora.
//
// The spine is Jonathan Waller's JLPT classification (via jkindrix/japanese-language-data),
// which gives every item a level AND a JMdict sequence id. Everything else -
// meanings, readings, furigana segmentation, frequency, example sentences,
// conjugations, kanji components - joins onto that id, so a word, the sentences
// that use it, the kanji inside it and its conjugation table all agree.
import fs from 'node:fs';
import path from 'node:path';

const LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'];
const read = (dir, f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));

export function loadCorpus(jkDir, jmdictFile) {
  const cls = read(jkDir, 'enrichment-jlpt-classifications.json').classifications;
  const furi = read(jkDir, 'enrichment-furigana.json').entries;
  const freqSub = read(jkDir, 'enrichment-frequency-subtitles.json').entries;
  const freqCor = read(jkDir, 'enrichment-frequency-corpus.json').entries;
  const sentences = read(jkDir, 'corpus-sentences.json').sentences;
  const w2s = read(jkDir, 'cross-refs-word-to-sentences.json').mapping;
  const k2w = read(jkDir, 'cross-refs-kanji-to-words.json').mapping;
  const conj = read(jkDir, 'grammar-conjugations.json').entries;
  const grammar = read(jkDir, 'grammar-grammar.json').grammar_points;
  const radicals = read(jkDir, 'core-radicals.json');
  const strokes = read(jkDir, 'enrichment-stroke-order-index.json').characters;

  // JMdict by sequence id - the join key for everything above.
  const jm = JSON.parse(fs.readFileSync(jmdictFile, 'utf8'));
  const bySeq = new Map();
  for (const w of jm.words) bySeq.set(w.id, w);

  // Spoken-media frequency first (this learner wants to understand people),
  // corpus frequency as a tiebreaker below it.
  const freq = new Map();
  for (const e of freqSub) if (!freq.has(e.text)) freq.set(e.text, e.rank);
  for (const e of freqCor) if (!freq.has(e.text)) freq.set(e.text, 10000 + e.rank);

  const furiBy = new Map();
  for (const e of furi) furiBy.set(`${e.text}\u0000${e.reading}`, e.segments);

  const sentBy = new Map();
  for (const s of sentences) sentBy.set(s.id, s);

  return { cls, freq, furiBy, sentBy, w2s, k2w, conj, grammar, radicals, strokes, bySeq, sentences };
}

const PRIMARY = (arr) => (arr && arr.length ? arr[0].text : '');

// Words where the upstream JLPT list picks a form or reading a learner should
// not be shown. Each was checked by hand.
//   - 私 is わたし in every ordinary context; わたくし is formal and rare.
//   - the kosoado set resolves to rare interjection homographs (これ "hey, oi")
//     unless the JMdict sequence is pinned to the pronoun.
const PINNED = new Map(Object.entries({
  '私':   { reading: 'わたし' },
  // kosoado — ids verified against JMdict, each the pn/adj-pn sense
  'これ': { seq: '1628530' }, 'それ': { seq: '1006970' },
  'あれ': { seq: '1000580' }, 'どれ': { seq: '1009290' },
  'この': { seq: '1582920' }, 'その': { seq: '1006830' },
  'あの': { seq: '1000420' }, 'どの': { seq: '1920240' },
  'ここ': { seq: '1288810' }, 'そこ': { seq: '1006670' },
  'あそこ': { seq: '1000320' }, 'どこ': { seq: '1577140' },
}));

// Core words the upstream JLPT list simply omits. Verified absent from
// enrichment-jlpt-classifications.json; その and そこ complete the kosoado
// sets whose other three members are all listed at N5.
const EXTRA = [
  { text: 'その', reading: 'その', kind: 'vocab', level: 'N5', jmdict_seq: '1006830', meaning_en: 'that' },
  { text: 'そこ', reading: 'そこ', kind: 'vocab', level: 'N5', jmdict_seq: '1006670', meaning_en: 'there' },
];

// JMdict marks a sense "uk" when the word is normally written in kana. When
// EVERY sense says so, the kanji spelling is not what anyone writes — 為る for
// する, 此処 for ここ — and showing it as the headword teaches a form the learner
// will never meet. Keep it, but as a secondary spelling.
const allSensesUk = (entry) =>
  !!entry && entry.sense.length > 0 && entry.sense.every((s) => (s.misc || []).includes('uk'));

// JMdict tags a sense's part of speech; collapse to the class our drills need.
function wordClass(pos = []) {
  if (pos.some((p) => p === 'v1' || p === 'v1-s')) return 'ichidan';
  if (pos.some((p) => /^v5/.test(p))) return 'godan';
  if (pos.some((p) => /^vs/.test(p))) return 'suru';
  if (pos.includes('vk')) return 'kuru';
  if (pos.includes('adj-i') || pos.includes('adj-ix')) return 'i-adj';
  if (pos.includes('adj-na')) return 'na-adj';
  // Pronouns and pre-noun adjectivals first: これ is tagged pn+adv and どれ is
  // pn+int, and calling them "adverb" / "interjection" mislabels the single
  // most fundamental word set a beginner meets.
  if (pos.includes('pn')) return 'pronoun';
  if (pos.includes('adj-pn')) return 'adj-pn';
  if (pos.includes('adv')) return 'adverb';
  if (pos.includes('prt')) return 'particle';
  if (pos.includes('exp')) return 'expression';
  if (pos.includes('int')) return 'interjection';
  if (pos.includes('conj')) return 'conjunction';
  if (pos.includes('ctr')) return 'counter';
  if (pos.some((p) => /^n/.test(p)) || pos.includes('adj-no')) return 'noun';
  return pos[0] || null;
}

/**
 * Build the per-level vocabulary.
 * @param fallbackExamples Map<headword, [[ja,en],...]> from OpenJLPT, used when
 *   a word has no Tatoeba sentence of its own.
 */
export function buildVocab(C, fallbackExamples = new Map(), furiganaFn) {
  const out = Object.fromEntries(LEVELS.map((l) => [l, []]));
  const seen = new Set();
  const stats = { noSeq: 0, noJmdict: 0, realFurigana: 0, guessedFurigana: 0, tatoeba: 0, fallback: 0, noExample: 0 };

  for (const item of [...C.cls, ...EXTRA]) {
    if (item.kind !== 'vocab') continue;
    if (seen.has(item.text)) continue;
    seen.add(item.text);

    const pin = PINNED.get(item.text);
    const seq = pin?.seq || item.jmdict_seq;
    const entry = seq ? C.bySeq.get(seq) : null;
    if (!seq) stats.noSeq++;
    if (seq && !entry) stats.noJmdict++;

    const kanjiForms = entry ? entry.kanji.filter((k) => !k.tags.includes('sK')).map((k) => k.text) : [];
    const kanaForms = entry ? entry.kana.filter((k) => !k.tags.includes('sk')).map((k) => k.text) : [];
    // A kana-only word list entry keeps its own text; otherwise prefer the kana
    // spelling when the dictionary says the kanji is not used in practice.
    const kanaOnlyWord = allSensesUk(entry) && kanaForms.length ? kanaForms[0] : null;
    const word = kanaOnlyWord && /[一-鿿]/.test(item.text) ? kanaOnlyWord : item.text;
    if (kanaOnlyWord && word !== item.text) stats.kanaHeadword = (stats.kanaHeadword || 0) + 1;
    const reading = pin?.reading || item.reading || kanaForms[0] || (kanjiForms.length ? '' : word);

    const pos = entry ? [...new Set(entry.sense.flatMap((s) => s.partOfSpeech))] : [];
    const misc = entry ? [...new Set(entry.sense.flatMap((s) => s.misc || []))] : [];
    const senses = entry
      ? entry.sense.map((s) => ({ pos: s.partOfSpeech, misc: s.misc || [], gloss: s.gloss.map((g) => g.text) }))
      : [{ pos: [], misc: [], gloss: [item.meaning_en].filter(Boolean) }];

    // Real ruby segmentation from JmdictFurigana, with our aligner as a fallback.
    let segs = C.furiBy.get(`${word}\u0000${reading}`);
    if (segs) { segs = segs.map((s) => [s.ruby, s.rt || null]); stats.realFurigana++; }
    else { segs = furiganaFn(word, reading); stats.guessedFurigana++; }

    // Example sentences: prefer real Tatoeba pairs linked to this exact word.
    let examples = [];
    const sids = seq ? C.w2s[seq] : null;
    if (sids?.length) {
      examples = sids.slice(0, 4)
        .map((id) => C.sentBy.get(id))
        .filter(Boolean)
        .map((s) => [s.japanese, s.english, s.id]);
    }
    if (examples.length) stats.tatoeba++;
    else if (fallbackExamples.has(word)) { examples = fallbackExamples.get(word).map(([a, b]) => [a, b, null]); stats.fallback++; }
    else stats.noExample++;

    out[item.level].push({
      seq: seq || null,
      w: word,
      r: reading,
      k: kanjiForms.filter((f) => f !== word),
      m: senses.flatMap((s) => s.gloss).slice(0, 6),
      senses: senses.slice(0, 4).map((s) => ({ p: s.pos, x: s.misc, g: s.gloss.join('; ') })),
      pos,
      misc,
      cls: wordClass(pos),
      f: segs,
      x: examples,
      fq: C.freq.get(word) ?? C.freq.get(reading) ?? null,
      lv: item.level,
    });
  }

  let id = 0;
  for (const l of LEVELS) {
    out[l].sort((a, b) => (a.fq ?? 9e9) - (b.fq ?? 9e9) || a.w.localeCompare(b.w, 'ja'));
    out[l].forEach((w, i) => { w.id = id++; w.ord = i; });
  }
  return { vocab: out, stats };
}

export function buildKanji(C, vocabByLevel, kanjiSource) {
  const out = Object.fromEntries(LEVELS.map((l) => [l, []]));
  const bySeqToWord = new Map();
  for (const l of LEVELS) for (const w of vocabByLevel[l]) if (w.seq) bySeqToWord.set(w.seq, w);

  const radOf = C.radicals.kanji_to_radicals || {};
  const radMeta = new Map((C.radicals.radicals || []).map((r) => [r.radical, r]));

  for (const item of C.cls) {
    if (item.kind !== 'kanji') continue;
    const ch = item.text;
    const src = kanjiSource.get(ch) || {};
    const comps = (radOf[ch] || []).map((r) => ({ r, m: (radMeta.get(r)?.meanings || [])[0] || null }));
    const words = (C.k2w[ch] || [])
      .map((seq) => bySeqToWord.get(seq))
      .filter(Boolean)
      .sort((a, b) => (a.fq ?? 9e9) - (b.fq ?? 9e9))
      .slice(0, 12)
      .map((w) => w.id);
    out[item.level].push({
      c: ch,
      lv: item.level,
      s: src.strokes ?? C.strokes[ch]?.stroke_count ?? null,
      g: src.grade ?? null,
      fq: src.freq ?? null,
      on: src.onyomi || [],
      kun: src.kunyomi || [],
      m: src.meanings || [item.meaning_en].filter(Boolean),
      comp: comps,
      v: words,
      svg: C.strokes[ch]?.svg || null,
    });
  }
  for (const l of LEVELS) {
    out[l].sort((a, b) => (a.fq ?? 9e9) - (b.fq ?? 9e9));
    out[l].forEach((k, i) => { k.id = i; });
  }
  return out;
}

export function buildGrammar(C, curatedExtra = {}) {
  const out = Object.fromEntries(LEVELS.map((l) => [l, []]));
  for (const g of C.grammar) {
    if (!out[g.level]) continue;
    out[g.level].push({
      gid: g.id,
      pattern: g.pattern,
      meaning: g.meaning_en || '',
      detail: g.meaning_detailed || '',
      formation: g.formation || '',
      notes: g.formation_notes || [],
      formality: g.formality || null,
      related: g.related || [],
      x: (g.examples || []).map((e) => [e.japanese, e.english]),
      lv: g.level,
      draft: g.review_status === 'draft',
    });
  }
  // OpenJLPT's hand-written points fill any gap the curated set misses.
  for (const [lv, list] of Object.entries(curatedExtra)) {
    const have = new Set(out[lv].map((g) => g.pattern.replace(/\s+/g, '')));
    for (const g of list) {
      const key = (g.pattern || '').replace(/\s+/g, '');
      if (!key || have.has(key)) continue;
      out[lv].push({
        gid: `oj-${key}`,
        pattern: g.pattern,
        meaning: g.meaning || '',
        detail: '',
        formation: g.formation || '',
        notes: [],
        formality: null,
        related: [],
        x: (g.examples || []).map((e) => [e.ja, e.en]),
        lv,
        draft: false,
      });
      have.add(key);
    }
  }
  for (const l of LEVELS) out[l].forEach((g, i) => { g.id = i; });
  return out;
}

/** Conjugation tables, keyed by the vocab id that owns them. */
export function buildConjugations(C, vocabByLevel) {
  const bySeq = new Map();
  for (const l of LEVELS) for (const w of vocabByLevel[l]) if (w.seq) bySeq.set(w.seq, w);
  const out = {};
  for (const e of C.conj) {
    const w = bySeq.get(e.id);
    if (!w) continue;
    out[w.id] = { cls: e.class, forms: e.display_forms || e.forms, kana: e.forms };
  }
  return out;
}

/**
 * i+1 sentences: for each word, the example sentences ordered by how few OTHER
 * hard words they contain. Computed here so the phone never has to.
 */
export function buildSentenceIndex(C, vocabByLevel) {
  const levelOf = new Map();
  for (const l of LEVELS) for (const w of vocabByLevel[l]) if (w.seq) levelOf.set(w.seq, LEVELS.indexOf(l));
  const s2w = C.w2s;
  const sentenceWords = C.sentenceToWords;

  const out = {};
  for (const l of LEVELS) {
    for (const w of vocabByLevel[l]) {
      if (!w.seq) continue;
      const sids = s2w[w.seq];
      if (!sids?.length) continue;
      const scored = sids
        .map((sid) => {
          const others = (sentenceWords[sid] || []).filter((x) => x !== w.seq);
          // A word is "hard" if it is from a later level than this one, or unknown.
          const hard = others.filter((x) => !levelOf.has(x) || levelOf.get(x) > LEVELS.indexOf(l)).length;
          const s = C.sentBy.get(sid);
          return s ? { sid, hard, len: s.japanese.length } : null;
        })
        .filter(Boolean)
        .sort((a, b) => a.hard - b.hard || a.len - b.len)
        .slice(0, 3);
      if (scored.length) out[w.id] = scored.map((s) => s.sid);
    }
  }
  return out;
}

export { LEVELS };
