// Deinflection: map a conjugated Japanese surface form back to dictionary forms.
// 食べさせられなかった -> 食べる.  Rules are applied repeatedly (breadth-first),
// so stacked auxiliaries unwind one layer at a time.
//
// A rule is {f: from-suffix, t: to-suffix, label}. We do not filter by class on the
// way down (we cannot know the class until we reach a real dictionary entry); instead
// every candidate is looked up and only real entries survive.

const POLITE_GODAN = (tail, to, label) => {
  const rows = [['い', 'う'], ['き', 'く'], ['ぎ', 'ぐ'], ['し', 'す'], ['ち', 'つ'],
                ['に', 'ぬ'], ['び', 'ぶ'], ['み', 'む'], ['り', 'る']];
  return rows.map(([a, b]) => ({ f: a + tail, t: b + to, label }));
};

const RAW = [
  // --- polite (ichidan / kuru / suru handled by their own rules) ---
  { f: 'ませんでした', t: 'る', label: 'polite negative past' },
  { f: 'ません', t: 'る', label: 'polite negative' },
  { f: 'ましょう', t: 'る', label: 'polite volitional' },
  { f: 'ました', t: 'る', label: 'polite past' },
  { f: 'まして', t: 'る', label: 'polite te' },
  { f: 'ます', t: 'る', label: 'polite' },
  ...POLITE_GODAN('ませんでした', '', 'polite negative past'),
  ...POLITE_GODAN('ません', '', 'polite negative'),
  ...POLITE_GODAN('ましょう', '', 'polite volitional'),
  ...POLITE_GODAN('ました', '', 'polite past'),
  ...POLITE_GODAN('ます', '', 'polite'),
  ...POLITE_GODAN('たい', '', 'desire'),
  ...POLITE_GODAN('たがる', '', 'desire (3rd person)'),
  ...POLITE_GODAN('ながら', '', 'while'),
  ...POLITE_GODAN('やすい', '', 'easy to'),
  ...POLITE_GODAN('にくい', '', 'hard to'),
  ...POLITE_GODAN('そう', '', 'looks like'),
  ...POLITE_GODAN('すぎる', '', 'too much'),
  ...POLITE_GODAN('なさい', '', 'command'),

  // --- ichidan ---
  { f: 'させられる', t: 'る', label: 'causative passive' },
  { f: 'られる', t: 'る', label: 'potential/passive' },
  { f: 'させる', t: 'る', label: 'causative' },
  { f: 'なかった', t: 'る', label: 'negative past' },
  { f: 'なくて', t: 'る', label: 'negative te' },
  { f: 'なければ', t: 'る', label: 'negative conditional' },
  { f: 'ない', t: 'る', label: 'negative' },
  { f: 'れば', t: 'る', label: 'conditional' },
  { f: 'よう', t: 'る', label: 'volitional' },
  { f: 'たら', t: 'る', label: 'conditional (tara)' },
  { f: 'たり', t: 'る', label: 'listing' },
  { f: 'たい', t: 'る', label: 'desire' },
  { f: 'ろ', t: 'る', label: 'imperative' },
  { f: 'て', t: 'る', label: 'te-form' },
  { f: 'た', t: 'る', label: 'past' },
  { f: 'ず', t: 'る', label: 'negative (literary)' },

  // --- i-adjectives ---
  { f: 'くなかった', t: 'い', label: 'negative past' },
  { f: 'くありません', t: 'い', label: 'polite negative' },
  { f: 'くない', t: 'い', label: 'negative' },
  { f: 'かった', t: 'い', label: 'past' },
  { f: 'くて', t: 'い', label: 'te-form' },
  { f: 'ければ', t: 'い', label: 'conditional' },
  { f: 'すぎる', t: 'い', label: 'too much' },
  { f: 'そう', t: 'い', label: 'looks like' },
  { f: 'さ', t: 'い', label: 'nominalised' },
  { f: 'く', t: 'い', label: 'adverbial' },

  // --- suru ---
  { f: 'しませんでした', t: 'する', label: 'polite negative past' },
  { f: 'させられる', t: 'する', label: 'causative passive' },
  { f: 'しています', t: 'する', label: 'progressive polite' },
  { f: 'しません', t: 'する', label: 'polite negative' },
  { f: 'しなかった', t: 'する', label: 'negative past' },
  { f: 'しました', t: 'する', label: 'polite past' },
  { f: 'している', t: 'する', label: 'progressive' },
  { f: 'しましょう', t: 'する', label: 'polite volitional' },
  { f: 'すれば', t: 'する', label: 'conditional' },
  { f: 'しよう', t: 'する', label: 'volitional' },
  { f: 'したら', t: 'する', label: 'conditional (tara)' },
  { f: 'したい', t: 'する', label: 'desire' },
  { f: 'しない', t: 'する', label: 'negative' },
  { f: 'される', t: 'する', label: 'passive' },
  { f: 'させる', t: 'する', label: 'causative' },
  { f: 'します', t: 'する', label: 'polite' },
  { f: 'して', t: 'する', label: 'te-form' },
  { f: 'した', t: 'する', label: 'past' },

  // --- kuru (both kana and kanji spellings) ---
  { f: 'きませんでした', t: 'くる', label: 'polite negative past' },
  { f: 'こなかった', t: 'くる', label: 'negative past' },
  { f: 'きました', t: 'くる', label: 'polite past' },
  { f: 'きません', t: 'くる', label: 'polite negative' },
  { f: 'こられる', t: 'くる', label: 'potential/passive' },
  { f: 'こない', t: 'くる', label: 'negative' },
  { f: 'きます', t: 'くる', label: 'polite' },
  { f: 'きて', t: 'くる', label: 'te-form' },
  { f: 'きた', t: 'くる', label: 'past' },
  { f: '来ませんでした', t: '来る', label: 'polite negative past' },
  { f: '来なかった', t: '来る', label: 'negative past' },
  { f: '来ました', t: '来る', label: 'polite past' },
  { f: '来ません', t: '来る', label: 'polite negative' },
  { f: '来ない', t: '来る', label: 'negative' },
  { f: '来ます', t: '来る', label: 'polite' },
  { f: '来て', t: '来る', label: 'te-form' },
  { f: '来た', t: '来る', label: 'past' },

  // --- godan te/ta (音便, irregular by consonant row) ---
  { f: 'いて', t: 'く', label: 'te-form' }, { f: 'いた', t: 'く', label: 'past' },
  { f: 'いで', t: 'ぐ', label: 'te-form' }, { f: 'いだ', t: 'ぐ', label: 'past' },
  { f: 'して', t: 'す', label: 'te-form' }, { f: 'した', t: 'す', label: 'past' },
  { f: 'って', t: 'う', label: 'te-form' }, { f: 'った', t: 'う', label: 'past' },
  { f: 'って', t: 'つ', label: 'te-form' }, { f: 'った', t: 'つ', label: 'past' },
  { f: 'って', t: 'る', label: 'te-form' }, { f: 'った', t: 'る', label: 'past' },
  { f: 'んで', t: 'ぬ', label: 'te-form' }, { f: 'んだ', t: 'ぬ', label: 'past' },
  { f: 'んで', t: 'ぶ', label: 'te-form' }, { f: 'んだ', t: 'ぶ', label: 'past' },
  { f: 'んで', t: 'む', label: 'te-form' }, { f: 'んだ', t: 'む', label: 'past' },
  { f: '行って', t: '行く', label: 'te-form' }, { f: '行った', t: '行く', label: 'past' },
  { f: 'いって', t: 'いく', label: 'te-form' }, { f: 'いった', t: 'いく', label: 'past' },

  // --- irregular keigo verbs ---
  // These are 五段 with an irregular い-stem: おっしゃる → おっしゃいます, not
  // おっしゃります. Without them the generic godan rules never reach the verb,
  // and おります resolves to おりる ("to get off") — the wrong verb in every
  // sentence this app teaches.
  { f: 'なさいませんでした', t: 'なさる', label: 'polite negative past (respectful)' },
  { f: 'いらっしゃいませんでした', t: 'いらっしゃる', label: 'polite negative past (respectful)' },
  { f: 'いらっしゃいました', t: 'いらっしゃる', label: 'polite past (respectful)' },
  { f: 'いらっしゃいません', t: 'いらっしゃる', label: 'polite negative (respectful)' },
  { f: 'いらっしゃいます', t: 'いらっしゃる', label: 'polite (respectful)' },
  { f: 'いらっしゃって', t: 'いらっしゃる', label: 'te-form (respectful)' },
  { f: 'いらっしゃい', t: 'いらっしゃる', label: 'welcome / come' },
  { f: 'おっしゃいました', t: 'おっしゃる', label: 'polite past (respectful)' },
  { f: 'おっしゃいません', t: 'おっしゃる', label: 'polite negative (respectful)' },
  { f: 'おっしゃいます', t: 'おっしゃる', label: 'polite (respectful)' },
  { f: 'くださいました', t: 'くださる', label: 'polite past (respectful)' },
  { f: 'くださいません', t: 'くださる', label: 'polite negative (respectful)' },
  { f: 'くださいます', t: 'くださる', label: 'polite (respectful)' },
  { f: 'くださいませ', t: 'くださる', label: 'polite request' },
  { f: 'なさいました', t: 'なさる', label: 'polite past (respectful)' },
  { f: 'なさいません', t: 'なさる', label: 'polite negative (respectful)' },
  { f: 'なさいます', t: 'なさる', label: 'polite (respectful)' },
  { f: 'ございませんでした', t: 'ございます', label: 'polite negative past' },
  { f: 'ございません', t: 'ございます', label: 'polite negative' },
  { f: 'ございました', t: 'ございます', label: 'polite past' },
  { f: 'おりませんでした', t: 'おる', label: 'polite negative past (humble)' },
  { f: 'おりました', t: 'おる', label: 'polite past (humble)' },
  { f: 'おりません', t: 'おる', label: 'polite negative (humble)' },
  { f: 'おります', t: 'おる', label: 'polite (humble)' },
  { f: 'おりまして', t: 'おる', label: 'polite te (humble)' },
];

// Godan stem changes: one entry per (form, consonant row).
const GODAN_STEM = [
  ['わない', 'う'], ['かない', 'く'], ['がない', 'ぐ'], ['さない', 'す'], ['たない', 'つ'],
  ['なない', 'ぬ'], ['ばない', 'ぶ'], ['まない', 'む'], ['らない', 'る'],
].map(([f, t]) => ({ f, t, label: 'negative' }))
  .concat([
    ['わなかった', 'う'], ['かなかった', 'く'], ['がなかった', 'ぐ'], ['さなかった', 'す'],
    ['たなかった', 'つ'], ['ななかった', 'ぬ'], ['ばなかった', 'ぶ'], ['まなかった', 'む'], ['らなかった', 'る'],
  ].map(([f, t]) => ({ f, t, label: 'negative past' })))
  .concat([
    ['える', 'う'], ['ける', 'く'], ['げる', 'ぐ'], ['せる', 'す'], ['てる', 'つ'],
    ['ねる', 'ぬ'], ['べる', 'ぶ'], ['める', 'む'], ['れる', 'る'],
  ].map(([f, t]) => ({ f, t, label: 'potential' })))
  .concat([
    ['われる', 'う'], ['かれる', 'く'], ['がれる', 'ぐ'], ['される', 'す'], ['たれる', 'つ'],
    ['なれる', 'ぬ'], ['ばれる', 'ぶ'], ['まれる', 'む'], ['られる', 'る'],
  ].map(([f, t]) => ({ f, t, label: 'passive' })))
  .concat([
    ['わせる', 'う'], ['かせる', 'く'], ['がせる', 'ぐ'], ['させる', 'す'], ['たせる', 'つ'],
    ['なせる', 'ぬ'], ['ばせる', 'ぶ'], ['ませる', 'む'], ['らせる', 'る'],
  ].map(([f, t]) => ({ f, t, label: 'causative' })))
  .concat([
    ['えば', 'う'], ['けば', 'く'], ['げば', 'ぐ'], ['せば', 'す'], ['てば', 'つ'],
    ['ねば', 'ぬ'], ['べば', 'ぶ'], ['めば', 'む'], ['れば', 'る'],
  ].map(([f, t]) => ({ f, t, label: 'conditional' })))
  .concat([
    ['おう', 'う'], ['こう', 'く'], ['ごう', 'ぐ'], ['そう', 'す'], ['とう', 'つ'],
    ['のう', 'ぬ'], ['ぼう', 'ぶ'], ['もう', 'む'], ['ろう', 'る'],
  ].map(([f, t]) => ({ f, t, label: 'volitional' })))
  .concat([
    ['え', 'う'], ['け', 'く'], ['げ', 'ぐ'], ['せ', 'す'], ['て', 'つ'],
    ['ね', 'ぬ'], ['べ', 'ぶ'], ['め', 'む'], ['れ', 'る'],
  ].map(([f, t]) => ({ f, t, label: 'imperative' })));

// Auxiliary chains: strip a layer and keep deinflecting what is left.
const AUX = [
  { f: 'ていません', t: 'ている', label: 'polite negative' },
  { f: 'ていました', t: 'ている', label: 'polite past' },
  { f: 'ています', t: 'ている', label: 'polite' },
  { f: 'ていた', t: 'ている', label: 'past progressive' },
  { f: 'ている', t: 'て', label: 'progressive' },
  { f: 'てない', t: 'て', label: 'progressive negative' },
  { f: 'てる', t: 'て', label: 'progressive (casual)' },
  { f: 'てた', t: 'て', label: 'past progressive (casual)' },
  { f: 'てしまった', t: 'て', label: 'completive past' },
  { f: 'てしまう', t: 'て', label: 'completive' },
  { f: 'ちゃった', t: 'て', label: 'completive past (casual)' },
  { f: 'ちゃう', t: 'て', label: 'completive (casual)' },
  { f: 'じゃった', t: 'で', label: 'completive past (casual)' },
  { f: 'てください', t: 'て', label: 'request' },
  { f: 'てもいい', t: 'て', label: 'permission' },
  { f: 'てはいけない', t: 'て', label: 'prohibition' },
  { f: 'ておく', t: 'て', label: 'preparatory' },
  { f: 'とく', t: 'て', label: 'preparatory (casual)' },
  { f: 'ていく', t: 'て', label: 'going on' },
  { f: 'てくる', t: 'て', label: 'coming to' },
  { f: 'てあげる', t: 'て', label: 'do for (out)' },
  { f: 'てくれる', t: 'て', label: 'do for (in)' },
  { f: 'てもらう', t: 'て', label: 'receive favour' },
  { f: 'なければならない', t: 'ない', label: 'must' },
  { f: 'なくてはいけない', t: 'ない', label: 'must' },
  { f: 'なきゃ', t: 'ない', label: 'must (casual)' },
  { f: 'ながら', t: '', label: 'while' },
];

// Every て-auxiliary has a voiced で twin (飲んでいる, 遊んでおく, 読んでもらう...).
const VOICED = AUX
  .filter((r) => r.f.startsWith('て') && r.t.startsWith('て'))
  .map((r) => ({ f: 'で' + r.f.slice(1), t: 'で' + r.t.slice(1), label: r.label }));
const VOICED_TAIL = AUX
  .filter((r) => r.f.startsWith('て') && r.t === 'て')
  .map((r) => ({ f: 'で' + r.f.slice(1), t: 'で', label: r.label }));

// A する-noun (勉強する) is stored in the dictionary as the bare noun, so
// once we reach X+する also offer X on its own.
const SURU_NOUN = [{ f: 'する', t: '', label: 'suru-verb' }];

export const RULES = [...RAW, ...GODAN_STEM, ...AUX, ...VOICED, ...VOICED_TAIL, ...SURU_NOUN]
  .sort((a, b) => b.f.length - a.f.length);

// Scanning all ~340 rules per candidate is the hot loop. Nearly every rule ends
// in a distinct character, so bucket by last char and scan only the live bucket.
const BY_LAST = new Map();
for (const r of RULES) {
  const k = r.f.slice(-1);
  if (!BY_LAST.has(k)) BY_LAST.set(k, []);
  BY_LAST.get(k).push(r);
}
const applicable = (s) => BY_LAST.get(s.slice(-1)) || [];

// Sentence-final particles carry no inflection. Strip at most ONE, and never
// so much that nothing meaningful is left - a greedy class match would eat
// 難しくてなかなか down to 難しく.
const FINAL_PARTICLES = ['でしょうか', 'ですか', 'ますか', 'かな', 'よね', 'か', 'ね', 'よ', 'ぞ', 'ぜ', 'わ'];

// The 連用形 (masu-stem) appears bare before に行く, ながら, compound verbs:
// 見に行く, 遊びに行く. Recover the dictionary form from the stem.
const MASU_STEM = [
  { f: '', t: 'る', label: 'masu-stem' }, // ichidan: 見 -> 見る
  ...[['い', 'う'], ['き', 'く'], ['ぎ', 'ぐ'], ['し', 'す'], ['ち', 'つ'],
      ['に', 'ぬ'], ['び', 'ぶ'], ['み', 'む'], ['り', 'る']]
    .map(([f, t]) => ({ f, t, label: 'masu-stem' })),
];

// 御-prefixes attach to nouns: お名前, ご確認. Offer the bare noun too.
const HONORIFIC = /^[おごオゴ御]/;

// Auxiliaries that attach to a て-form, as their own dictionary verbs. Splitting
// at て/で and deinflecting the auxiliary separately handles arbitrary stacking
// (見せてもらえますか -> 見せて + もらえます -> 見せる).
const TE_AUX = ['いる', 'ある', 'おく', 'いく', 'くる', 'しまう', 'みる',
                'あげる', 'くれる', 'もらう', 'ほしい', 'ください', 'いい', 'よい'];

/**
 * Deinflect a surface form into candidate dictionary forms.
 * @param {string} word              the conjugated surface form
 * @param {(s:string)=>any} lookup   returns a truthy dictionary entry, or null
 * @param {number} maxDepth          max stacked inflections to unwind
 * @returns {{form:string, chain:string[], entry:any}[]} best (shortest chain) first
 */
export function deinflect(word, lookup, maxDepth = 6) {
  const out = [];
  const seen = new Set();
  const queue = [{ s: word, chain: [] }];

  const push = (s, chain) => {
    if (s && s !== word && !seen.has(s) && chain.length <= maxDepth) queue.push({ s, chain });
  };

  // Drop one trailing sentence-final particle (…ますか, …ですね).
  for (const p of FINAL_PARTICLES) {
    if (word.length > p.length + 1 && word.endsWith(p)) {
      queue.push({ s: word.slice(0, word.length - p.length), chain: ['sentence particle'] });
      break;
    }
  }
  // お名前 / ご確認: also consider the word without its honorific prefix.
  if (word.length > 2 && HONORIFIC.test(word)) {
    queue.push({ s: word.slice(1), chain: ['honorific prefix'] });
  }

  while (queue.length) {
    const { s, chain } = queue.shift();
    if (!s || seen.has(s)) continue;
    seen.add(s);

    const entry = lookup(s);
    if (entry) out.push({ form: s, chain, entry });
    if (chain.length >= maxDepth) continue;

    for (const r of applicable(s)) {
      if (!s.endsWith(r.f)) continue; // bucketing only matches the last char
      const stem = s.slice(0, s.length - r.f.length);
      if (!stem && !r.t) continue;
      push(stem + r.t, [...chain, r.label]);
    }
    // The masu-stem rules include an empty suffix (見 -> 見る), which matches
    // everything. Apply them only to the original short token, never chained,
    // or a whole clause would "deinflect" to する.
    if (chain.length === 0 && s.length <= 4) {
      for (const r of MASU_STEM) {
        if (r.f && !s.endsWith(r.f)) continue;
        const stem = s.slice(0, s.length - r.f.length);
        if (!stem) continue;
        push(stem + r.t, [r.label]);
      }
    }

    // Split at a て/で boundary and let the auxiliary deinflect on its own.
    for (let i = 1; i < s.length; i++) {
      const c = s[i];
      if (c !== 'て' && c !== 'で') continue;
      const head = s.slice(0, i + 1);        // 見せて
      const tail = s.slice(i + 1);           // もらえます
      if (!tail) continue;
      const auxHit = deinflectAux(tail, lookup);
      if (!auxHit) continue;
      push(head, [...chain, auxHit]);
    }
  }
  // Shortest inflection chain wins. Among equals prefer a named irregular
  // (おります -> おる) over the generic godan reading (-> おりる), then the longer stem.
  const irregular = (r) => (r.chain.some((c) => /humble|respectful/.test(c)) ? 0 : 1);
  return out.sort((a, b) =>
    a.chain.length - b.chain.length || irregular(a) - irregular(b) || b.form.length - a.form.length);
}

// Is `tail` a (possibly conjugated) form of a known て-auxiliary? Return its label.
function deinflectAux(tail, lookup) {
  const seen = new Set();
  const q = [tail];
  while (q.length) {
    const s = q.shift();
    if (!s || seen.has(s) || seen.size > 60) continue;
    seen.add(s);
    if (TE_AUX.includes(s)) return s;
    for (const r of applicable(s)) {
      if (r.f === 'する' || !s.endsWith(r.f)) continue;
      const next = s.slice(0, s.length - r.f.length) + r.t;
      if (next && next !== s && !seen.has(next)) q.push(next);
    }
  }
  return null;
}
