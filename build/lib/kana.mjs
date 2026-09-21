// Hiragana + katakana tables. Everything before N5 - the first two days of study.
// Grouped into teaching rows so the app can gate them 5 characters at a time.

const BASE = [
  ['a',  ['あ', 'ア', 'a'], ['い', 'イ', 'i'], ['う', 'ウ', 'u'], ['え', 'エ', 'e'], ['お', 'オ', 'o']],
  ['k',  ['か', 'カ', 'ka'], ['き', 'キ', 'ki'], ['く', 'ク', 'ku'], ['け', 'ケ', 'ke'], ['こ', 'コ', 'ko']],
  ['s',  ['さ', 'サ', 'sa'], ['し', 'シ', 'shi'], ['す', 'ス', 'su'], ['せ', 'セ', 'se'], ['そ', 'ソ', 'so']],
  ['t',  ['た', 'タ', 'ta'], ['ち', 'チ', 'chi'], ['つ', 'ツ', 'tsu'], ['て', 'テ', 'te'], ['と', 'ト', 'to']],
  ['n',  ['な', 'ナ', 'na'], ['に', 'ニ', 'ni'], ['ぬ', 'ヌ', 'nu'], ['ね', 'ネ', 'ne'], ['の', 'ノ', 'no']],
  ['h',  ['は', 'ハ', 'ha'], ['ひ', 'ヒ', 'hi'], ['ふ', 'フ', 'fu'], ['へ', 'ヘ', 'he'], ['ほ', 'ホ', 'ho']],
  ['m',  ['ま', 'マ', 'ma'], ['み', 'ミ', 'mi'], ['む', 'ム', 'mu'], ['め', 'メ', 'me'], ['も', 'モ', 'mo']],
  ['y',  ['や', 'ヤ', 'ya'], null, ['ゆ', 'ユ', 'yu'], null, ['よ', 'ヨ', 'yo']],
  ['r',  ['ら', 'ラ', 'ra'], ['り', 'リ', 'ri'], ['る', 'ル', 'ru'], ['れ', 'レ', 're'], ['ろ', 'ロ', 'ro']],
  ['w',  ['わ', 'ワ', 'wa'], null, null, null, ['を', 'ヲ', 'wo']],
  ['n2', ['ん', 'ン', 'n'], null, null, null, null],
];

const DAKUTEN = [
  ['g', ['が', 'ガ', 'ga'], ['ぎ', 'ギ', 'gi'], ['ぐ', 'グ', 'gu'], ['げ', 'ゲ', 'ge'], ['ご', 'ゴ', 'go']],
  ['z', ['ざ', 'ザ', 'za'], ['じ', 'ジ', 'ji'], ['ず', 'ズ', 'zu'], ['ぜ', 'ゼ', 'ze'], ['ぞ', 'ゾ', 'zo']],
  ['d', ['だ', 'ダ', 'da'], ['ぢ', 'ヂ', 'ji'], ['づ', 'ヅ', 'zu'], ['で', 'デ', 'de'], ['ど', 'ド', 'do']],
  ['b', ['ば', 'バ', 'ba'], ['び', 'ビ', 'bi'], ['ぶ', 'ブ', 'bu'], ['べ', 'ベ', 'be'], ['ぼ', 'ボ', 'bo']],
  ['p', ['ぱ', 'パ', 'pa'], ['ぴ', 'ピ', 'pi'], ['ぷ', 'プ', 'pu'], ['ぺ', 'ペ', 'pe'], ['ぽ', 'ポ', 'po']],
];

const YOON = [
  ['ky', ['きゃ', 'キャ', 'kya'], ['きゅ', 'キュ', 'kyu'], ['きょ', 'キョ', 'kyo']],
  ['sh', ['しゃ', 'シャ', 'sha'], ['しゅ', 'シュ', 'shu'], ['しょ', 'ショ', 'sho']],
  ['ch', ['ちゃ', 'チャ', 'cha'], ['ちゅ', 'チュ', 'chu'], ['ちょ', 'チョ', 'cho']],
  ['ny', ['にゃ', 'ニャ', 'nya'], ['にゅ', 'ニュ', 'nyu'], ['にょ', 'ニョ', 'nyo']],
  ['hy', ['ひゃ', 'ヒャ', 'hya'], ['ひゅ', 'ヒュ', 'hyu'], ['ひょ', 'ヒョ', 'hyo']],
  ['my', ['みゃ', 'ミャ', 'mya'], ['みゅ', 'ミュ', 'myu'], ['みょ', 'ミョ', 'myo']],
  ['ry', ['りゃ', 'リャ', 'rya'], ['りゅ', 'リュ', 'ryu'], ['りょ', 'リョ', 'ryo']],
  ['gy', ['ぎゃ', 'ギャ', 'gya'], ['ぎゅ', 'ギュ', 'gyu'], ['ぎょ', 'ギョ', 'gyo']],
  ['j',  ['じゃ', 'ジャ', 'ja'], ['じゅ', 'ジュ', 'ju'], ['じょ', 'ジョ', 'jo']],
  ['by', ['びゃ', 'ビャ', 'bya'], ['びゅ', 'ビュ', 'byu'], ['びょ', 'ビョ', 'byo']],
  ['py', ['ぴゃ', 'ピャ', 'pya'], ['ぴゅ', 'ピュ', 'pyu'], ['ぴょ', 'ピョ', 'pyo']],
];

// Look-alikes learners reliably confuse - the app warns on these.
const CONFUSE = {
  'あ': ['お'], 'お': ['あ'], 'い': ['り'], 'り': ['い'], 'き': ['さ'], 'さ': ['き'],
  'ぬ': ['め', 'ね'], 'め': ['ぬ'], 'ね': ['れ', 'わ', 'ぬ'], 'れ': ['ね', 'わ'], 'わ': ['ね', 'れ'],
  'る': ['ろ'], 'ろ': ['る'], 'は': ['ほ'], 'ほ': ['は'], 'ま': ['も'], 'も': ['ま'],
  'シ': ['ツ'], 'ツ': ['シ'], 'ソ': ['ン'], 'ン': ['ソ'], 'ク': ['ワ', 'タ'], 'ワ': ['ク'],
  'ス': ['ヌ'], 'ヌ': ['ス'], 'チ': ['テ'], 'テ': ['チ'], 'コ': ['ユ'], 'ノ': ['メ'],
};

export function buildKana() {
  const rows = [];
  let id = 0;
  const add = (group, kind, cells) => {
    const row = { group, kind, cells: [] };
    for (const c of cells) {
      if (!c) { row.cells.push(null); continue; }
      const [hira, kata, romaji] = c;
      row.cells.push({
        id: id++, hira, kata, romaji,
        confuseH: CONFUSE[hira] || [],
        confuseK: CONFUSE[kata] || [],
      });
    }
    rows.push(row);
  };
  for (const [g, ...cells] of BASE) add(g, 'base', cells);
  for (const [g, ...cells] of DAKUTEN) add(g, 'dakuten', cells);
  for (const [g, ...cells] of YOON) add(g, 'yoon', cells);

  const flat = rows.flatMap((r) => r.cells.filter(Boolean).map((c) => ({ ...c, group: r.group, kind: r.kind })));

  // Teaching lessons: 5 characters at a time, base rows first.
  const lessons = [];
  for (const kind of ['base', 'dakuten', 'yoon']) {
    const pool = flat.filter((c) => c.kind === kind);
    for (let i = 0; i < pool.length; i += 5) {
      lessons.push({ n: lessons.length + 1, kind, chars: pool.slice(i, i + 5).map((c) => c.id) });
    }
  }
  return { rows, flat, lessons, counts: { total: flat.length, base: flat.filter(c => c.kind === 'base').length } };
}

// Romaji -> kana, so the app can accept typed answers.
export function romajiToKana(input, katakana = false) {
  const { flat } = buildKana();
  const map = new Map();
  for (const c of flat) map.set(c.romaji, katakana ? c.kata : c.hira);
  // longest romaji first (kyo before ko)
  const keys = [...map.keys()].sort((a, b) => b.length - a.length);
  let out = '', i = 0;
  const s = input.toLowerCase();
  outer: while (i < s.length) {
    // small tsu: doubled consonant
    if (i + 1 < s.length && s[i] === s[i + 1] && /[bcdfghjklmpqrstvwxyz]/.test(s[i])) {
      out += katakana ? 'ッ' : 'っ'; i++; continue;
    }
    if (s[i] === 'n' && (i + 1 >= s.length || !/[aiueoy]/.test(s[i + 1]))) {
      out += katakana ? 'ン' : 'ん'; i++; continue;
    }
    for (const k of keys) {
      if (s.startsWith(k, i)) { out += map.get(k); i += k.length; continue outer; }
    }
    out += s[i]; i++;
  }
  return out;
}
