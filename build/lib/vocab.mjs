import fs from 'node:fs';
import path from 'node:path';
import { furigana, kataToHira } from './furigana.mjs';

const LEVELS = [5, 4, 3, 2, 1]; // easiest first - order matters for dedup
const KANA = /^[\u3040-\u309f\u30a0-\u30ff\u30fc\u30fb]+$/;
const HAS_KANJI = /[\u4e00-\u9fff\u3400-\u4dbf]/;

// OpenJLPT packs alternates into one field: "丸い/円い", "ラジカセ / ラジオカセット"
const splitForms = (s) => s.split(/[\/｜]/).map((x) => x.trim()).filter(Boolean);
const splitReadings = (s) => (s ? s.split(/[\/、,]/).map((x) => x.trim()).filter((x) => KANA.test(x)) : []);

export function loadJmdict(file) {
  const jm = JSON.parse(fs.readFileSync(file, 'utf8'));
  const idx = new Map();
  for (const w of jm.words) {
    const kanji = w.kanji.filter((k) => !k.tags.includes('sK')).map((k) => k.text);
    const kana = w.kana.filter((k) => !k.tags.includes('sk')).map((k) => k.text);
    const pos = [...new Set(w.sense.flatMap((s) => s.partOfSpeech))];
    const glosses = w.sense.flatMap((s) => s.gloss.map((g) => g.text));
    const common = w.kanji.some((k) => k.common) || w.kana.some((k) => k.common);
    const rec = { kanji, kana, pos, glosses, common };
    for (const t of [...kanji, ...kana]) if (!idx.has(t)) idx.set(t, rec);
  }
  return idx;
}

// JMdict POS -> the conjugation class our drills and deinflector need
function wordClass(pos = []) {
  if (pos.some((p) => p === 'v1' || p === 'v1-s')) return 'ichidan';
  if (pos.some((p) => /^v5/.test(p))) return 'godan';
  if (pos.includes('vs-i') || pos.includes('vs') || pos.includes('vs-s')) return 'suru';
  if (pos.includes('vk')) return 'kuru';
  if (pos.includes('adj-i')) return 'i-adj';
  if (pos.includes('adj-na')) return 'na-adj';
  if (pos.includes('adj-no')) return 'no-adj';
  if (pos.some((p) => /^n/.test(p))) return 'noun';
  if (pos.includes('adv')) return 'adverb';
  if (pos.includes('prt')) return 'particle';
  if (pos.includes('exp')) return 'expression';
  if (pos.includes('int')) return 'interjection';
  if (pos.includes('conj')) return 'conjunction';
  if (pos.includes('pn')) return 'pronoun';
  if (pos.includes('ctr')) return 'counter';
  return pos[0] || null;
}

export function buildVocab(rawDir, jmdict, freqMap = new Map()) {
  const seen = new Map();
  const repaired = { reading: 0, meaning: 0, pos: 0 };

  for (const n of LEVELS) {
    const arr = JSON.parse(fs.readFileSync(path.join(rawDir, `vocab-n${n}.json`), 'utf8'));
    for (const raw of arr) {
      const forms = splitForms(raw.word);
      const head = forms[0];
      if (!head) continue;
      if (seen.has(head)) continue; // easiest level wins - N3 duplicates are corrupted

      const jm = jmdict.get(head) || (forms[1] && jmdict.get(forms[1]));
      let readings = splitReadings(raw.reading);

      // OpenJLPT leaves reading empty for kana-only words, and a handful of N3 rows
      // carry junk like "（接。感）" instead of a reading. Repair both from JMdict.
      if (!readings.length) {
        if (!HAS_KANJI.head && KANA.test(head)) readings = [head];
        else if (KANA.test(head)) readings = [head];
        else if (jm?.kana.length) { readings = [jm.kana[0]]; repaired.reading++; }
      } else if (raw.reading && !readings.length) {
        if (jm?.kana.length) { readings = [jm.kana[0]]; repaired.reading++; }
      }
      if (!readings.length && jm?.kana.length) { readings = [jm.kana[0]]; repaired.reading++; }

      let meanings = (raw.meanings || []).flatMap((m) => m.split(/\s*;\s*/)).map((m) => m.trim()).filter(Boolean);
      if (!meanings.length && jm?.glosses.length) { meanings = jm.glosses.slice(0, 4); repaired.meaning++; }
      if (jm) repaired.pos++;

      seen.set(head, {
        w: head,
        alt: forms.slice(1),
        r: readings[0] || '',
        altR: readings.slice(1),
        m: meanings,
        pos: jm?.pos || [],
        cls: wordClass(jm?.pos),
        common: jm?.common ?? null,
        x: (raw.examples || []).slice(0, 3).map((e) => [e.ja, e.en]),
        lv: n,
      });
    }
  }

  const out = Object.fromEntries(LEVELS.map((n) => [n, []]));
  let id = 0;
  for (const w of seen.values()) {
    const fq = freqMap.get(w.w) ?? (w.r ? freqMap.get(w.r) : undefined) ?? null;
    out[w.lv].push({ id: id++, ...w, f: furigana(w.w, w.r), fq, lv: `N${w.lv}` });
  }
  // Most useful first: known frequency, then JMdict-common, then kana order.
  for (const n of LEVELS) {
    out[n].sort((a, b) =>
      (a.fq ?? 9e9) - (b.fq ?? 9e9) ||
      (b.common === true) - (a.common === true) ||
      kataToHira(a.r || a.w).localeCompare(kataToHira(b.r || b.w), 'ja')
    );
    out[n].forEach((w, i) => { w.ord = i; });
  }
  return { vocab: out, repaired };
}

export function buildKanji(rawDir, vocabByLevel) {
  const out = {};
  for (const n of LEVELS) {
    const arr = JSON.parse(fs.readFileSync(path.join(rawDir, `kanji-n${n}.json`), 'utf8'));
    const pool = LEVELS.filter((x) => x >= n).flatMap((m) => vocabByLevel[m] || []);
    out[n] = arr
      .map((k) => ({
        c: k.character,
        s: k.strokes ?? null,
        g: k.grade ?? null,
        fq: k.freq ?? null,
        on: k.onyomi || [],
        kun: k.kunyomi || [],
        m: k.meanings || [],
        lv: `N${n}`,
        v: pool.filter((w) => w.w.includes(k.character)).slice(0, 10).map((w) => w.id),
      }))
      .sort((a, b) => (a.fq ?? 9e9) - (b.fq ?? 9e9));
    out[n].forEach((k, i) => { k.id = i; });
  }
  return out;
}
