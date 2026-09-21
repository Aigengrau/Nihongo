// Align a surface form to its kana reading -> ruby segments.
// 食べる + たべる  ->  [["食","た"],["べる",null]]
// お茶    + おちゃ  ->  [["お",null],["茶","ちゃ"]]
const isKanji = (c) => /[\u4e00-\u9fff\u3400-\u4dbf々〆ヶ]/.test(c);
const isKana  = (c) => /[\u3040-\u309f\u30a0-\u30ff\u30fc]/.test(c);

export const kataToHira = (s) =>
  s.replace(/[\u30a1-\u30f6]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

// Split a surface into runs of kanji vs kana/other.
function runs(surface) {
  const out = [];
  for (const ch of surface) {
    const k = isKanji(ch) ? 'k' : 'o';
    const last = out[out.length - 1];
    if (last && last.k === k) last.s += ch;
    else out.push({ k, s: ch });
  }
  return out;
}

export function furigana(surface, reading) {
  if (!surface) return [];
  if (!reading) return [[surface, null]];
  const r = kataToHira(reading);
  const s = surface;
  if (kataToHira(s) === r || ![...s].some(isKanji)) return [[s, null]];

  const parts = runs(s);
  // Walk the reading, anchoring on each literal kana run.
  const seg = [];
  let ri = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.k === 'o') {
      const lit = kataToHira(p.s);
      const at = r.indexOf(lit, ri);
      if (at < 0) return [[s, r]]; // can't align - fall back to whole-word ruby
      if (at > ri) {
        // reading consumed by the preceding kanji run
        const prev = seg[seg.length - 1];
        if (prev && prev[1] === '') prev[1] = r.slice(ri, at);
        else return [[s, r]];
      }
      seg.push([p.s, null]);
      ri = at + lit.length;
    } else {
      const next = parts[i + 1];
      if (!next) { seg.push([p.s, r.slice(ri)]); ri = r.length; }
      else seg.push([p.s, '']); // filled when the next kana run anchors
    }
  }
  if (ri < r.length) {
    const last = seg[seg.length - 1];
    if (last && last[1] === '') last[1] = r.slice(ri);
    else if (last && last[1] === null) return [[s, r]];
  }
  if (seg.some((x) => x[1] === '')) return [[s, r]];
  return seg;
}

// Render as HTML <ruby>
export function ruby(surface, reading) {
  return furigana(surface, reading)
    .map(([t, f]) => (f ? `<ruby>${t}<rt>${f}</rt></ruby>` : t))
    .join('');
}
