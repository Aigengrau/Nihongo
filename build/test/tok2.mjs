import fs from 'node:fs';
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync('app/data/dict/common.json', 'utf8')) });
const dict = await import('../../app/js/dict.js');
const { tokenize } = await import('../../app/js/tokenize.js');
await dict.load();
const cases = [
  'コーヒーを飲みながらニュースを見ました。',
  'スーパーでケーキとコーヒーを買った。',
  'エレベーターは五階まで行きます。',
  'テーブルの上にコンピューターがあります。',
  'マイケル・ジャクソンのレコードを聞いた。',
  'サッカーとバスケットボールとテニスが好きです。',
  '今日は天気がいいので、公園まで歩いて行きました。',
  'お忙しいところ恐れ入りますが、ご確認いただけますでしょうか。',
];
for (const s of cases) {
  const t = tokenize(s, dict.lookup);
  const dead = t.filter((x) => x.kind === 'unknown');
  console.log('\n' + s);
  console.log('  ' + t.map((x) => x.kind === 'punct' ? x.s : `[${x.s}${x.kind === 'unknown' ? '?' : ''}]`).join(''));
  console.log(`  tokens=${t.length} unknown=${dead.length}`);
}
