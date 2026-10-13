// The grammar syllabus and its generated questions, checked against the real
// level files. No browser: app/js/grammar.js is deliberately DOM-free.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syllabus, questions, coreForms, signature, LEVEL_ORDER } from '../../app/js/grammar.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (lv) => JSON.parse(fs.readFileSync(path.join(ROOT, 'app', 'data', 'levels', lv.toLowerCase(), 'grammar.json'), 'utf8'));

let fail = 0;
const check = (name, ok, detail = '') => {
  if (!ok) fail++;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? `  — ${detail}` : ''}`);
};

// --- the extraction a question depends on -------------------------------
check('core of "Verb-て + ください"', coreForms('Verb-て + ください').join(',') === 'ください,て');
check('signature collapses two spellings',
  signature('Verb-て + ください') === signature('〜てください'),
  `${signature('Verb-て + ください')} / ${signature('〜てください')}`);
check('parenthesised glosses are not forms', signature('〜が（but）') === 'が', signature('〜が（but）'));
check('optional tails are dropped', signature('noun の + とき(に)') === 'のとき', signature('noun の + とき(に)'));

// --- the syllabus ------------------------------------------------------
for (const lv of LEVEL_ORDER) {
  const list = read(lv);
  const syl = syllabus(list);
  const curatedSigs = new Set(syl.filter((g) => !g.gid.startsWith('oj-')).map((g) => signature(g.pattern)));
  // Two curated points may share a literal and still be different points — に
  // as a target vs the な-adjective adverb, から as "from" vs "because" — and
  // telling those apart is the whole job. What must not survive is a thin
  // OpenJLPT fill-in repeating a form the curated set already explains.
  const echoes = syl.filter((g) => g.gid.startsWith('oj-') && curatedSigs.has(signature(g.pattern)));

  check(`${lv} syllabus keeps every curated point`,
    syl.filter((g) => !g.gid.startsWith('oj-')).length === list.filter((g) => !g.gid.startsWith('oj-')).length);
  check(`${lv} drops the fill-ins that repeat a curated point`, echoes.length === 0,
    echoes.map((g) => g.pattern).join(', '));
  check(`${lv} order is stable and dense`, syl.every((g, i) => g.ord === i));
  check(`${lv} keeps most of the file`, syl.length >= list.length * 0.8,
    `${syl.length} of ${list.length} scheduled`);

  // --- questions ------------------------------------------------------
  let none = 0, cloze = 0, total = 0;
  const bad = [];
  for (const g of syl) {
    const qs = questions(g, syl);
    total += qs.length;
    if (!qs.length) { none++; continue; }
    if (qs.some((q) => q.kind === 'cloze')) cloze++;
    for (const q of qs) {
      if (q.options.length !== 4) bad.push(`${g.gid}: ${q.options.length} options`);
      if (new Set(q.options).size !== 4) bad.push(`${g.gid}: duplicate option`);
      if (!q.options.includes(q.answer)) bad.push(`${g.gid}: answer missing`);
      if (q.kind === 'cloze') {
        if (q.before + q.answer + q.after !== q.full) bad.push(`${g.gid}: blank does not rebuild`);
        if (q.options.some((o) => o !== q.answer && q.full.includes(o))) bad.push(`${g.gid}: wrong answer visible in the sentence`);
      }
    }
  }
  check(`${lv} every point has practice`, none === 0, `${none} without a single question`);
  check(`${lv} questions are well formed`, bad.length === 0, bad.slice(0, 4).join(' | '));
  check(`${lv} most points practise in a sentence`, cloze >= syl.length * 0.6,
    `${cloze}/${syl.length} cloze-able, ${(total / syl.length).toFixed(1)} questions per point`);
}

console.log(`\n=== grammar ${fail === 0 ? 'PASS' : `FAIL (${fail})`} ===`);
process.exit(fail ? 1 : 0);
