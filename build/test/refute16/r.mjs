import * as dict from '../../../app/js/dict.js';
import { deinflect } from '../../../app/js/deinflect.js';
import { tokenize } from '../../../app/js/tokenize.js';

await dict.load('http://localhost:8099/data/dict/common.json');

const forms = ['おります','おりません','おりました','なさいます','ください','くださいませ','読まされた','待たされた','しなければ','食べたがっている','いらっしゃいます','おっしゃいました','立たされました','存じております'];
for (const f of forms) {
  const e = dict.explain(f);
  if (!e) { console.log(f, '-> NULL'); continue; }
  const glosses = (e.entries[0]?.senses||[]).slice(0,2).map(s=>s.gloss).join(' / ');
  console.log(f, '-> base', e.base, '| chain', JSON.stringify(e.chain), '| alts', JSON.stringify(e.alternatives.map(a=>a.base)), '|', glosses.slice(0,70));
}
console.log('---- tokenize ----');
for (const s of ['弊社の田中は席を外しております。','存じ上げておりません。','営業部で働いております。','先生に立たされました。']) {
  console.log(s, '=>', tokenize(s, dict.lookup).map(t=>t.surface ?? t.text ?? JSON.stringify(t)).join('|'));
}
