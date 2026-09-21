// Reading: graded short stories, plus sentence practice generated from the
// i+1 index (sentences where you know everything except one word).
import * as data from '../data.js';
import * as store from '../store.js';
import { esc, tappable, bindWordTaps, toast, speak, canSpeak, loadFurigana, knownWords } from '../ui.js';
import * as dict from '../dict.js';

const CHEV = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export async function list({ params, view, setChrome }) {
  const lv = params[0] || (await store.setting('level', 'N5'));
  setChrome({ title: 'Read', back: true });
  const stories = (await data.storyIndex()).filter((s) => s.lv === lv);

  view.innerHTML = `
    <div class="seg" role="group" aria-label="Level">
      ${data.LEVELS.map((l) => `<button data-lv="${l}" aria-pressed="${l === lv}">${l}</button>`).join('')}
    </div>

    <a class="tile" href="#/read/s/i1-${lv}" style="margin-top:14px">
      <span class="tile-ico">∞</span>
      <span class="tile-main"><span class="tile-title">Sentence practice</span>
        <span class="tile-sub">Real sentences, ordered so the fewest words are new</span></span>
      <span class="tile-end">${CHEV}</span>
    </a>

    <a class="tile" href="#/read/s/paste" style="margin-top:9px">
      <span class="tile-ico">貼</span>
      <span class="tile-main"><span class="tile-title">Paste Japanese text</span>
        <span class="tile-sub">Anything at all — subtitles, an article, a message from work</span></span>
      <span class="tile-end">${CHEV}</span>
    </a>

    <h2 class="section-title">Short stories</h2>
    ${stories.length ? `<div class="stack">${stories.map((s) => `
      <a class="tile" href="#/read/s/${esc(s.id)}">
        <span class="tile-ico">読</span>
        <span class="tile-main"><span class="tile-title">${esc(s.title)}</span>
          <span class="tile-sub">${s.lines ?? ''} lines${s.topic ? ` · ${esc(s.topic)}` : ''}</span></span>
        <span class="tile-end">${CHEV}</span></a>`).join('')}</div>`
      : `<p class="muted small" style="padding:0 2px">No stories bundled for ${lv} yet — sentence practice above works now.</p>`}
  `;

  view.querySelectorAll('[data-lv]').forEach((b) =>
    b.addEventListener('click', () => { location.hash = `/read/${b.dataset.lv}`; }));
}

export async function reader({ params, view, setChrome }) {
  const id = params[0];
  setChrome({ title: 'Read', back: true });

  const [, , known] = await Promise.all([dict.ready(), loadFurigana(), knownWords()]);
  let doc;
  if (id === 'paste') return paste({ view, setChrome });
  if (id.startsWith('i1-')) doc = await buildI1(id.slice(3));
  else {
    try { doc = await data.story(id); }
    catch { view.innerHTML = `<div class="empty"><p>Story not found.</p></div>`; return; }
  }
  if (!doc.lines.length) {
    view.innerHTML = `<div class="empty"><div class="empty-mark">読</div>
      <p>Nothing to read here yet.</p></div>`;
    return;
  }

  let showEn = false;
  let showFuri = (await store.setting('furigana', 'auto')) !== 'never';
  const render = () => {
    view.innerHTML = `
      <div class="spread">
        <div><h2 style="font-size:17px">${esc(doc.title)}</h2>
          <p class="small faint">${esc(doc.subtitle || `${doc.lines.length} sentences`)}</p></div>
        <div class="row" style="gap:6px">
          <button class="btn btn-sm" id="toggleFuri" aria-pressed="${showFuri}" lang="ja">ふり</button>
          <button class="btn btn-sm" id="toggleEn" aria-pressed="${showEn}">${showEn ? 'Hide EN' : 'Show EN'}</button>
        </div>
      </div>
      <p class="small faint" style="margin:10px 2px">Tap any word to look it up and save it.
        ${known.size ? '<span style="border-bottom:2px solid color-mix(in srgb, var(--accent) 60%, transparent)">Underlined</span> words are ones you have not learned yet.' : ''}</p>
      <div class="stack" id="lines" style="margin-top:6px">
        ${doc.lines.map((l, n) => `
          <div class="card" data-n="${n}">
            <div class="jp-md" lang="ja">${tappable(l.ja, { furigana: showFuri, knownMap: known })}</div>
            <div class="ex-en" data-en style="${showEn ? '' : 'display:none'}">${esc(l.en || '')}</div>
            <div class="row" style="margin-top:8px;gap:6px">
              ${canSpeak() ? `<button class="btn btn-sm" data-say="${esc(l.ja)}">🔊</button>` : ''}
              ${l.en ? `<button class="btn btn-sm" data-peek="${n}">Translate</button>` : ''}
            </div>
          </div>`).join('')}
      </div>`;

    const lines = view.querySelector('#lines');
    bindWordTaps(lines);
    lines.addEventListener('click', (e) => {
      const say = e.target.closest('[data-say]');
      if (say) return speak(say.dataset.say);
      const peek = e.target.closest('[data-peek]');
      if (peek) {
        const en = lines.querySelector(`[data-n="${peek.dataset.peek}"] [data-en]`);
        en.style.display = en.style.display === 'none' ? '' : 'none';
      }
    });
    view.querySelector('#toggleEn').addEventListener('click', () => { showEn = !showEn; render(); });
    view.querySelector('#toggleFuri').addEventListener('click', () => { showFuri = !showFuri; render(); });
  };
  render();
}

/**
 * Paste anything Japanese and read it with the same tap-to-look-up machinery:
 * a subtitle file, a news article, a message from a colleague, song lyrics.
 * Works offline and covers every case the bundled content does not.
 */
async function paste({ view, setChrome }) {
  setChrome({ title: 'Paste Japanese', back: true });
  const [last, known] = await Promise.all([
    store.get('progress', 'pasted').then((r) => r?.text || ''),
    knownWords(),
  ]);

  const render = (text) => {
    // Split on sentence enders but keep them, then fall back to line breaks.
    const lines = text
      .split(/\n+/)
      .flatMap((para) => para.split(/(?<=[。！？!?])/))
      .map((s) => s.trim())
      .filter(Boolean);

    view.innerHTML = `
      <label class="small faint" for="src">Paste Japanese text — subtitles, an article, a message</label>
      <textarea id="src" class="search" rows="4" lang="ja"
        style="min-height:96px;padding:12px;margin-top:6px;line-height:1.6;font-family:var(--jp)"
        placeholder="ここに日本語を貼り付けてください。">${esc(text)}</textarea>
      <div class="row" style="margin-top:8px;gap:8px">
        <button class="btn btn-block btn-primary" id="go">Read it</button>
        ${text ? '<button class="btn btn-sm" id="clear">Clear</button>' : ''}
      </div>
      ${lines.length ? `
        <p class="small faint" style="margin:14px 2px">${lines.length} sentences · tap any word</p>
        <div class="stack" id="lines">
          ${lines.map((l, n) => `<div class="card" data-n="${n}">
            <div class="jp-md" lang="ja">${tappable(l, { knownMap: known })}</div>
            ${canSpeak() ? `<div class="row" style="margin-top:8px"><button class="btn btn-sm" data-say="${esc(l)}">🔊</button></div>` : ''}
          </div>`).join('')}
        </div>` : ''}
    `;

    const src = view.querySelector('#src');
    view.querySelector('#go').addEventListener('click', async () => {
      const t = src.value.trim();
      await store.put('progress', { key: 'pasted', text: t });
      render(t);
    });
    view.querySelector('#clear')?.addEventListener('click', async () => {
      await store.put('progress', { key: 'pasted', text: '' });
      render('');
    });
    const lineBox = view.querySelector('#lines');
    if (lineBox) {
      bindWordTaps(lineBox);
      lineBox.addEventListener('click', (e) => {
        const say = e.target.closest('[data-say]');
        if (say) speak(say.dataset.say);
      });
    }
  };
  render(last);
}

/**
 * Build a reading set from the i+1 index: sentences chosen because the learner
 * already knows every word in them except the one being practised.
 */
async function buildI1(lv) {
  const [vocabList, i1, sents, sentWords, cards] = await Promise.all([
    data.vocab(lv), data.i1(), data.sentences(), data.sentenceWords(), store.all('cards'),
  ]);
  // "Known" = reviewed and holding for more than a day. Anything else counts as
  // unknown, which is what makes the i+1 count honest.
  const known = new Set(
    cards.filter((c) => c.vocabId != null && c.state === 2 && c.S > 1).map((c) => c.vocabId)
  );
  const studying = new Set(cards.filter((c) => c.vocabId != null && c.state !== 0).map((c) => c.vocabId));

  // Score every candidate sentence by how many of its words the learner does
  // NOT know. One unknown word is the sweet spot; zero is revision; two or
  // more is a wall.
  const scored = [];
  const seen = new Set();
  for (const w of vocabList) {
    const sids = i1[w.id];
    if (!sids) continue;
    for (const sid of sids) {
      if (seen.has(sid)) continue;
      seen.add(sid);
      const s = sents[sid];
      if (!s) continue;
      const words = sentWords[sid] || [];
      const unknown = words.filter((id) => !known.has(id));
      scored.push({
        sid, ja: s[0], en: s[1], word: w.w,
        unknown: unknown.length,
        // prefer sentences built around something already in the deck
        relevant: studying.has(w.id) ? 0 : 1,
        len: s[0].length,
      });
      break;
    }
  }

  const ideal = scored.filter((c) => c.unknown === 1);
  const pool = ideal.length >= 8
    ? ideal
    : scored.filter((c) => c.unknown <= 2).length >= 8
      ? scored.filter((c) => c.unknown <= 2)
      : scored;

  const lines = pool
    .sort((a, b) => a.relevant - b.relevant || a.unknown - b.unknown || a.len - b.len)
    .slice(0, 20)
    .map(({ ja, en, word, unknown }) => ({ ja, en, word, unknown }));

  const exact = lines.filter((l) => l.unknown === 1).length;
  return {
    title: `${lv} sentence practice`,
    subtitle: known.size
      ? `${lines.length} sentences · ${exact} with exactly one word you have not learned yet`
      : `${lines.length} of the simplest ${lv} sentences — they get tailored as you learn`,
    lines,
  };
}
