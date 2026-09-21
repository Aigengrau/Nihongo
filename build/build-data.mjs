#!/usr/bin/env node
// Turns the cached upstream corpora into the app's data files.
//   node build/fetch-sources.mjs     # once, to populate build/cache/raw
//   node build/build-data.mjs        # rebuild app/data
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadDict } from './lib/dict.mjs';
import { furigana } from './lib/furigana.mjs';
import { buildKana } from './lib/kana.mjs';
import {
  loadCorpus, buildVocab, buildKanji, buildGrammar, buildConjugations, buildSentenceIndex, LEVELS,
} from './lib/corpus.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, 'build', 'cache', 'raw');
const OUT = path.join(ROOT, 'app', 'data');

let total = 0;
const write = (rel, obj) => {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const s = JSON.stringify(obj);
  fs.writeFileSync(file, s);
  total += s.length;
  const gz = zlib.gzipSync(s, { level: 9 }).length;
  console.log(`  ${rel.padEnd(32)} ${(s.length / 1024).toFixed(0).padStart(6)} KB  (${(gz / 1024).toFixed(0).padStart(5)} KB gz)`);
  return s.length;
};

const findCache = (dir, re) => {
  const d = path.join(CACHE, dir);
  if (!fs.existsSync(d)) return null;
  const f = fs.readdirSync(d).find((x) => re.test(x));
  return f ? path.join(d, f) : null;
};

const commonFile = findCache('jmdict', /^jmdict-eng-common.*\.json$/);
const fullFile = findCache('jmdict', /^jmdict-eng-3.*\.json$/);
if (!commonFile) throw new Error('missing jmdict-eng-common - run build/fetch-sources.mjs');

console.log('\n=== nihongo data build ===\n');

// --- runtime dictionary (tap-any-word) ----------------------------------
console.log('dictionary:');
const dict = loadDict(commonFile);
function packDict(entriesMap) {
  const pos = new Map();
  const code = (p) => { if (!pos.has(p)) pos.set(p, pos.size); return pos.get(p); };
  const seen = new Map();
  const e = [];
  const i = {};
  for (const [key, list] of entriesMap) {
    i[key] = list.map((rec) => {
      if (seen.has(rec)) return seen.get(rec);
      const idx = e.length;
      seen.set(rec, idx);
      e.push([rec.kanji.join('|'), rec.kana.join('|'),
        rec.senses.map((s) => [s.pos.map(code), s.gloss.join('; '), s.misc.map(code)]),
        rec.common ? 1 : 0]);
      return idx;
    });
  }
  return { v: 1, pos: [...pos.keys()], e, i };
}
write('dict/common.json', packDict(dict.entries));

// --- study corpus --------------------------------------------------------
console.log('\ncorpus:');
const jkDir = path.join(CACHE, 'jk');
const C = loadCorpus(jkDir, fullFile || commonFile);
C.sentenceToWords = JSON.parse(fs.readFileSync(path.join(jkDir, 'cross-refs-sentence-to-words.json'), 'utf8')).mapping;
console.log(`  jmdict entries indexed by seq: ${C.bySeq.size}`);
console.log(`  jlpt classifications: ${C.cls.length}  grammar points: ${C.grammar.length}  sentences: ${C.sentences.length}`);

// OpenJLPT's hand-written example pairs, used where Tatoeba has nothing.
const ojExamples = new Map();
const ojGrammar = {};
for (const n of [5, 4, 3, 2, 1]) {
  const vf = path.join(CACHE, 'openjlpt', `vocab-n${n}.json`);
  if (fs.existsSync(vf)) {
    for (const w of JSON.parse(fs.readFileSync(vf, 'utf8'))) {
      const head = w.word.split('/')[0].trim();
      if (w.examples?.length && !ojExamples.has(head)) ojExamples.set(head, w.examples.map((e) => [e.ja, e.en]));
    }
  }
  const gf = path.join(CACHE, 'openjlpt', `grammar-n${n}.json`);
  if (fs.existsSync(gf)) ojGrammar[`N${n}`] = JSON.parse(fs.readFileSync(gf, 'utf8'));
}

const { vocab, stats } = buildVocab(C, ojExamples, furigana);
console.log(`  vocab built: ${LEVELS.map((l) => `${l}=${vocab[l].length}`).join(' ')}`);
console.log(`  furigana: ${stats.realFurigana} from JmdictFurigana, ${stats.guessedFurigana} aligned by us`);
console.log(`  examples: ${stats.tatoeba} Tatoeba, ${stats.fallback} OpenJLPT fallback, ${stats.noExample} none`);
if (stats.noJmdict) console.log(`  warning: ${stats.noJmdict} items had a seq id not present in JMdict`);

// KANJIDIC-derived detail from OpenJLPT's kanji files.
const kanjiSource = new Map();
for (const n of [5, 4, 3, 2, 1]) {
  const f = path.join(CACHE, 'openjlpt', `kanji-n${n}.json`);
  if (!fs.existsSync(f)) continue;
  for (const k of JSON.parse(fs.readFileSync(f, 'utf8'))) kanjiSource.set(k.character, k);
}
const kanji = buildKanji(C, vocab, kanjiSource);
const grammar = buildGrammar(C, ojGrammar);
const conj = buildConjugations(C, vocab);
const i1 = buildSentenceIndex(C, vocab);
console.log(`  kanji: ${LEVELS.map((l) => `${l}=${kanji[l].length}`).join(' ')}`);
console.log(`  grammar: ${LEVELS.map((l) => `${l}=${grammar[l].length}`).join(' ')}`);
console.log(`  conjugation tables: ${Object.keys(conj).length}  i+1 indexed words: ${Object.keys(i1).length}`);

console.log('\nlevel files:');
const index = { generated: new Date().toISOString().slice(0, 10), levels: [] };
for (const l of LEVELS) {
  const n = l.toLowerCase();
  write(`levels/${n}/vocab.json`, vocab[l]);
  write(`levels/${n}/kanji.json`, kanji[l]);
  write(`levels/${n}/grammar.json`, grammar[l]);
  index.levels.push({ level: l, vocab: vocab[l].length, kanji: kanji[l].length, grammar: grammar[l].length });
}

console.log('\nshared:');
write('conjugations.json', conj);
write('sentences.json', Object.fromEntries(
  [...new Set(Object.values(i1).flat())].map((sid) => {
    const s = C.sentBy.get(sid);
    return [sid, [s.japanese, s.english]];
  })
));
write('i1.json', i1);

// Which of OUR vocab ids appear in each shipped sentence. This is what lets the
// reader filter to genuine i+1 sentences at runtime (every word known but one)
// instead of only guessing from JLPT level at build time.
{
  const seqToId = new Map();
  for (const l of LEVELS) for (const w of vocab[l]) if (w.seq) seqToId.set(w.seq, w.id);
  const shipped = new Set(Object.values(i1).flat());
  const sw = {};
  for (const sid of shipped) {
    const ids = (C.sentenceToWords[sid] || []).map((q) => seqToId.get(q)).filter((x) => x !== undefined);
    if (ids.length) sw[sid] = ids;
  }
  write('sentence-words.json', sw);
}
write('kana.json', buildKana());

// --- curated content -----------------------------------------------------
console.log('\ncontent:');
// The video catalogue ships even before captions are baked, so the Watch screen
// lists real, verified videos instead of an empty state. Each entry records
// whether its tappable subtitle track has been downloaded yet.
{
  const cat = path.join(ROOT, 'build', 'research', 'videos-verified.json');
  const baked = path.join(ROOT, 'build', 'content', 'videos');
  if (fs.existsSync(cat)) {
    const list = JSON.parse(fs.readFileSync(cat, 'utf8'));
    const have = fs.existsSync(baked)
      ? new Set(fs.readdirSync(baked).filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', '')))
      : new Set();
    const idx = list.map((v) => ({
      id: v.id, title: v.title, channel: v.channel, lv: v.level,
      durationSec: v.durationSec, topic: v.topic, why: v.why,
      jaTrack: v.jaTrack, enTrack: !!v.enTrack,
      cues: have.has(v.id) ? (v.cues ?? 0) : 0,
      subs: have.has(v.id),
    }));
    idx.sort((a, b) => LEVELS.indexOf(a.lv) - LEVELS.indexOf(b.lv)
      || (b.subs - a.subs) || (b.enTrack - a.enTrack) || (a.durationSec - b.durationSec));
    write('videos/index.json', idx);
    console.log(`  video catalogue: ${idx.length} (${idx.filter((v) => v.subs).length} with subtitles baked, ${idx.filter((v) => v.enTrack).length} bilingual)`);
  }
}

for (const kind of ['videos', 'stories']) {
  const dir = path.join(ROOT, 'build', 'content', kind);
  if (!fs.existsSync(dir)) { console.log(`  (no build/content/${kind} yet)`); continue; }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('videos-failed'));
  const idx = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    fs.mkdirSync(path.join(OUT, kind), { recursive: true });
    fs.writeFileSync(path.join(OUT, kind, f), JSON.stringify(j));
    total += JSON.stringify(j).length;
    idx.push({ id: j.id, title: j.title, lv: j.lv, ...(j.meta || {}) });
  }
  if (kind !== 'videos') {
    idx.sort((a, b) => LEVELS.indexOf(a.lv) - LEVELS.indexOf(b.lv) || (a.lines ?? 0) - (b.lines ?? 0));
    write(`${kind}/index.json`, idx);
  }
  console.log(`  ${files.length} ${kind}`);
}


// Authored business/professional track.
const bizSrc = path.join(ROOT, 'build', 'content', 'business.json');
if (fs.existsSync(bizSrc)) write('business.json', JSON.parse(fs.readFileSync(bizSrc, 'utf8')));

write('index.json', index);
console.log(`\ntotal app data: ${(total / 1048576).toFixed(2)} MB uncompressed\n`);
