// Verify the browser dict module works against the real packed file, using a fetch shim.
import fs from 'node:fs';
globalThis.fetch = async (u) => ({ ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync('./app/data/dict/common.json', 'utf8')) });
const dict = await import('../../app/js/dict.js');
const { tokenize } = await import('../../app/js/tokenize.js');
await dict.load();
console.log('loaded:', dict.isLoaded());

const s = '来週の会議までにこの資料を準備しておいてください。';
const t0 = process.hrtime.bigint();
const toks = tokenize(s, dict.lookup);
console.log('\n' + s);
console.log(toks.map(t => t.kind === 'punct' ? t.s : `[${t.s}]`).join(''));

for (const w of ['準備しておいて', 'いただけますでしょうか', '面白くなかった', '見せてもらえますか']) {
  const e = dict.explain(w);
  if (!e) { console.log(`\n${w} -> no explanation`); continue; }
  console.log(`\n${w}  ->  ${e.base}   ${e.inflection.length ? '[' + e.inflection.join(' <- ') + ']' : '(dictionary form)'}`);
  const en = e.entries[0];
  if (en) {
    console.log(`   ${en.kanji.join(', ') || en.kana.join(', ')}  (${en.kana.join(', ')})${en.common ? '  ·common' : ''}`);
    en.senses.slice(0, 3).forEach((sn, i) => console.log(`   ${i + 1}. [${sn.posLabels.join(', ')}]${sn.miscLabels.length ? ' {' + sn.miscLabels.join(', ') + '}' : ''} ${sn.gloss}`));
  }
}
console.log(`\nelapsed ${(Number(process.hrtime.bigint() - t0) / 1e6).toFixed(1)}ms`);
