import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deinflect } from '../lib/deinflect.mjs';
import { loadDict } from '../lib/dict.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dir = path.join(ROOT, 'build', 'cache', 'raw', 'jmdict');
const file = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => /^jmdict-eng-common.*\.json$/.test(f));
if (!file) {
  console.log('skipped: run `npm run fetch` first (needs build/cache/raw/jmdict)');
  process.exit(0);
}
const jm = loadDict(path.join(dir, file));
const lookup = (s) => jm.get(s);

const cases = [
  ['食べさせられなかった', '食べる'],
  ['食べました', '食べる'],
  ['書かなければ', '書く'],
  ['飲んでいる', '飲む'],
  ['行ってください', '行く'],
  ['面白くなかった', '面白い'],
  ['勉強しています', '勉強'],
  ['来ませんでした', '来る'],
  ['買いたい', '買う'],
  ['読める', '読む'],
  ['話させる', '話す'],
  ['走った', '走る'],
  ['泳ぎましょう', '泳ぐ'],
  ['高くて', '高い'],
  ['できなかった', 'できる'],
  ['遊んじゃった', '遊ぶ'],
  ['わからない', 'わかる'],
  ['聞かれた', '聞く'],
  ['待たせておいて', '待つ'],
  ['忙しかった', '忙しい'],
  ['帰りたくない', '帰る'],
  ['見せてもらえますか', '見せる'],
  ['立ち上がった', '立ち上がる'],
  ['знаю', null],
];

let pass = 0, fail = [];
for (const [surface, want] of cases) {
  const r = deinflect(surface, lookup);
  const forms = r.map((x) => x.form);
  const hit = want === null ? r.length === 0 : forms.includes(want);
  if (hit) pass++; else fail.push([surface, want, forms.slice(0, 4)]);
  const top = r[0];
  console.log(
    (hit ? 'OK  ' : 'MISS') + ' ' + surface.padEnd(14) +
    (top ? `-> ${top.form}${top.chain.length ? '  [' + top.chain.join(' <- ') + ']' : '  (dictionary form)'}` : '-> no match') +
    (hit ? '' : `   WANT ${want}  GOT ${forms.slice(0, 4).join(', ') || '-'}`)
  );
}
console.log(`\n${pass}/${cases.length} passed`);
if (fail.length) { console.log('\nfailures:'); fail.forEach((f) => console.log(' ', JSON.stringify(f))); }

// keigo irregulars — the forms this app's own business module teaches
console.log('\n--- keigo ---');
let kpass = 0;
const keigo = [
  ['おります', 'おる'], ['おりません', 'おる'], ['なさいます', 'なさる'],
  ['くださいます', 'くださる'], ['いらっしゃいます', 'いらっしゃる'],
  ['おっしゃいました', 'おっしゃる'], ['ございます', 'ございます'],
  ['申し上げます', '申し上げる'], ['伺います', '伺う'], ['拝見しました', '拝見'],
];
for (const [surface, want] of keigo) {
  const forms = deinflect(surface, lookup).map((x) => x.form);
  const ok = forms.includes(want);
  if (ok) kpass++;
  console.log(`${ok ? 'OK  ' : 'MISS'} ${surface.padEnd(12)} -> ${forms.slice(0, 3).join(', ') || '(none)'}${ok ? '' : `   WANT ${want}`}`);
}
console.log(`${kpass}/${keigo.length} keigo passed`);
