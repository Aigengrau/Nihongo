import fs from 'node:fs';
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(fs.readFileSync('app/data/dict/common.json', 'utf8')) });
const dict = await import('../../app/js/dict.js');
const { tokenize } = await import('../../app/js/tokenize.js');
await dict.load();

const t = (label, s, note='') => {
  const t0 = process.hrtime.bigint();
  let out, err = null;
  try { out = tokenize(s, dict.lookup); } catch (e) { err = e; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (err) { console.log(`${label}: THREW ${err.constructor.name}: ${err.message} (${ms.toFixed(1)}ms)`); return; }
  const joined = out.map(x=>x.s).join('');
  console.log(`${label}: len=${s.length} tokens=${out.length} ${ms.toFixed(1)}ms roundtrip=${joined===s} ${note}`);
  if (joined !== s) console.log(`   !! LOSSY: in=${JSON.stringify(s.slice(0,60))} out=${JSON.stringify(joined.slice(0,60))}`);
};

t('empty', '');
t('one space', ' ');
t('pure punct', '。。。、、、！？！？「」『』（）…—～');
t('emoji', '😀😀😀🇯🇵👨‍👩‍👧‍👦');
t('lone surrogate hi', '\ud83d');
t('lone surrogate lo', '\udca9');
t('surrogate mid text', '今日\ud83dは天気');
t('RTL mixed', 'مرحبا 今日は שלום こんにちは');
t('NUL + controls', 'a\u0000b\u0007c今日');
t('combining', 'か\u3099き\u309a');
t('latin only', 'Hello World 12345');
t('newlines', '今日は\n\n天気が\tいい');
t('zero width', '今\u200b日\ufeffは');
t('1k kanji', '漢'.repeat(1000));
t('5k mixed', '今日は天気がいいので公園まで歩いて行きました'.repeat(220).slice(0,5000));
t('10k mixed', '今日は天気がいいので公園まで歩いて行きました'.repeat(500).slice(0,10000));
t('10k unique-ish kana', Array.from({length:10000},(_,i)=>String.fromCharCode(0x3041 + (i*7)%80)).join(''));
t('10k latin', 'a'.repeat(10000));
t('10k punct', '。'.repeat(10000));
