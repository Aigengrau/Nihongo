import fs from 'node:fs';
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync('app/data/dict/common.json', 'utf8')) });
const dict = await import('../../app/js/dict.js');
const { tokenize } = await import('../../app/js/tokenize.js');
await dict.load();
const cases = [
  '今日は天気がいいので、公園まで歩いて行きました。',
  '私は毎朝七時に起きて、朝ご飯を食べます。',
  'お忙しいところ恐れ入りますが、ご確認いただけますでしょうか。',
  '日本語を勉強していますが、漢字が難しくてなかなか覚えられません。',
  '昨日友達と映画を見に行きましたが、あまり面白くなかったです。',
  '来週の会議までにこの資料を準備しておいてください。',
  '事があるので、ある日また来ます。',
];
const t0 = process.hrtime.bigint();
for (const s of cases) {
  const toks = tokenize(s, dict.lookup);
  console.log('\n' + s);
  console.log('  ' + toks.map((t) => t.kind === 'punct' ? t.s : `[${t.s}${t.chain?.length ? '=' + t.base : ''}]`).join(''));
  const unk = toks.filter((t) => t.kind === 'unknown');
  if (unk.length) console.log('  UNKNOWN: ' + unk.map((t) => t.s).join(' '));
}
console.log(`\n${(Number(process.hrtime.bigint() - t0) / 1e6 / cases.length).toFixed(1)}ms per sentence`);
