// Ranked JMdict index. A surface key can hit several entries (この -> 此の and 九),
// so keep them all and rank, instead of letting whichever loaded first win.
import fs from 'node:fs';

export function loadDict(file) {
  const jm = JSON.parse(fs.readFileSync(file, 'utf8'));
  const idx = new Map();

  for (const w of jm.words) {
    const kanji = w.kanji.filter((k) => !k.tags.includes('sK'));
    const kana = w.kana.filter((k) => !k.tags.includes('sk'));
    if (!kana.length) continue;
    const kanjiT = kanji.map((k) => k.text);
    const kanaT = kana.map((k) => k.text);
    const pos = [...new Set(w.sense.flatMap((s) => s.partOfSpeech))];
    const misc = [...new Set(w.sense.flatMap((s) => s.misc || []))];
    const rec = {
      id: w.id,
      kanji: kanjiT,
      kana: kanaT,
      pos,
      misc,
      senses: w.sense.map((s) => ({
        pos: s.partOfSpeech,
        misc: s.misc || [],
        gloss: s.gloss.map((g) => g.text),
      })),
      glosses: w.sense.flatMap((s) => s.gloss.map((g) => g.text)),
      common: kanji.some((k) => k.common) || kana.some((k) => k.common),
      usuallyKana: misc.includes('uk'),
    };
    for (const t of new Set([...kanjiT, ...kanaT])) {
      if (!idx.has(t)) idx.set(t, []);
      idx.get(t).push(rec);
    }
  }

  // Rank each bucket once, so lookup is a plain map read.
  for (const [key, list] of idx) {
    if (list.length > 1) list.sort((a, b) => score(b, key) - score(a, key));
  }

  const get = (k) => {
    const l = idx.get(k);
    return l ? l[0] : null;
  };
  const getAll = (k) => idx.get(k) || [];
  return { get, getAll, size: idx.size, entries: idx };
}

function score(e, key) {
  let s = 0;
  if (e.common) s += 100;
  // The primary written form matching beats a secondary/variant spelling.
  if (e.kanji[0] === key || e.kana[0] === key) s += 60;
  if (e.kanji.includes(key)) s += 20;
  // A kana key on a kanji-less (or usually-kana) entry is the real word,
  // not an alternate reading of some unrelated kanji.
  if (e.kana.includes(key) && (!e.kanji.length || e.usuallyKana)) s += 40;
  // Prefer function words for short kana keys: particles, prefixes, pronouns.
  if (key.length <= 2 && e.pos.some((p) => ['prt', 'pref', 'pn', 'adj-pn', 'conj', 'int', 'cop'].includes(p))) s += 50;
  if (e.misc.includes('arch') || e.misc.includes('obs') || e.misc.includes('rare')) s -= 80;
  return s;
}
