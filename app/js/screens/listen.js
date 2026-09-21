// Listen mode: Japanese audio with big dual-language subtitles.
//
// This exists because no open video API carries Japanese-audio material with
// both Japanese and English subtitles (TED is English audio; Commons has none;
// archive.org has ~198 items, almost all English ASR). YouTube has it and will
// not let us fetch the caption tracks.
//
// So the app speaks the material itself. Because we drive the speech, the
// subtitles are perfectly synced by construction rather than by matching
// timestamps, pausing is instant, and it all works offline at every level.
import * as data from '../data.js';
import * as store from '../store.js';
import * as dict from '../dict.js';
import { esc, tappable, bindWordTaps, toast, speak, canSpeak, loadFurigana, knownWords } from '../ui.js';

const CHEV = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------------------------------------------------------------- list
export async function list({ params, view, setChrome }) {
  const lv = params[0] || (await store.setting('level', 'N5'));
  setChrome({ title: 'Listen', back: true });
  const stories = (await data.storyIndex()).filter((s) => s.lv === lv);

  view.innerHTML = `
    <div class="seg" role="group" aria-label="Level">
      ${data.LEVELS.map((l) => `<button data-lv="${l}" aria-pressed="${l === lv}">${l}</button>`).join('')}
    </div>

    ${canSpeak() ? '' : `<div class="card" style="margin-top:12px;border-color:var(--amber)">
      <div style="font-weight:700">No Japanese voice on this device</div>
      <p class="small muted" style="margin-top:6px">Listen mode needs a Japanese text-to-speech voice.
      On Android install <b>Google Text-to-speech</b> and add Japanese under
      Settings → System → Languages → Text-to-speech. iPhones have one built in.
      The subtitles and word lookup still work without it.</p></div>`}

    <p class="small muted" style="margin:12px 2px">
      Listen to a story with big Japanese and English subtitles. Tap any word to look it up —
      it pauses while you read.
    </p>

    <a class="tile" href="#/listen/s/i1-${lv}">
      <span class="tile-ico">∞</span>
      <span class="tile-main"><span class="tile-title">Sentence practice</span>
        <span class="tile-sub">Short real sentences, one at a time</span></span>
      <span class="tile-end">${CHEV}</span>
    </a>

    <h2 class="section-title">Stories</h2>
    ${stories.length ? `<div class="stack">${stories.map((s) => `
      <a class="tile" href="#/listen/s/${esc(s.id)}">
        <span class="tile-ico">聴</span>
        <span class="tile-main"><span class="tile-title">${esc(s.title)}</span>
          <span class="tile-sub">${s.lines ?? ''} lines${s.topic ? ` · ${esc(s.topic)}` : ''}</span></span>
        <span class="tile-end">${CHEV}</span></a>`).join('')}</div>`
      : `<p class="muted small" style="padding:0 2px">No stories at ${esc(lv)} yet.</p>`}
  `;

  view.querySelectorAll('[data-lv]').forEach((b) =>
    b.addEventListener('click', () => { location.hash = `/listen/${b.dataset.lv}`; }));
}

// ---------------------------------------------------------------- player
export async function player({ params, view, setChrome, signal }) {
  const id = params[0];
  setChrome({ title: 'Listen', back: true });

  await Promise.all([dict.ready(), loadFurigana()]);
  const known = await knownWords();

  let doc;
  if (id.startsWith('i1-')) doc = await buildSentences(id.slice(3));
  else {
    try { doc = await data.story(id); } catch {
      view.innerHTML = `<div class="empty"><p>Not found.</p></div>`;
      return;
    }
  }
  if (!doc.lines?.length) {
    view.innerHTML = `<div class="empty"><div class="empty-mark">聴</div><p>Nothing to listen to here.</p></div>`;
    return;
  }

  let idx = 0;
  let playing = false;
  let rate = Number(await store.setting('listenRate', 0.85)) || 0.85;
  let showEn = true;
  let wakeLock = null;

  const stop = () => {
    playing = false;
    try { speechSynthesis.cancel(); } catch { /* unsupported */ }
  };
  // Leaving the screen must silence it — speech survives navigation otherwise.
  signal?.addEventListener('abort', () => {
    stop();
    try { wakeLock?.release?.(); } catch { /* ignore */ }
  });

  const keepAwake = async () => {
    try { wakeLock = wakeLock || await navigator.wakeLock?.request('screen'); } catch { /* unsupported */ }
  };

  /** Speak one line, then advance. Chained from a user gesture so iOS allows it. */
  const say = (n) => {
    if (signal?.aborted || !canSpeak()) return;
    const line = doc.lines[n];
    if (!line) { playing = false; paint(); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(line.ja);
      u.lang = 'ja-JP';
      const v = speechSynthesis.getVoices().find((x) => x.lang?.toLowerCase().startsWith('ja'));
      if (v) u.voice = v;
      u.rate = rate;
      u.onend = () => {
        if (!playing || signal?.aborted) return;
        if (n + 1 < doc.lines.length) { idx = n + 1; paint(); say(idx); }
        else { playing = false; paint(); }
      };
      u.onerror = () => { playing = false; paint(); };
      speechSynthesis.speak(u);
    } catch { playing = false; }
  };

  const play = () => { playing = true; keepAwake(); paint(); say(idx); };
  const pause = () => { stop(); paint(); };

  const paint = () => {
    if (signal?.aborted) return;
    const line = doc.lines[idx];
    view.innerHTML = `
      <div class="spread">
        <div style="min-width:0">
          <h2 style="font-size:16px">${esc(doc.title)}</h2>
          <p class="small faint">${idx + 1} of ${doc.lines.length}${doc.subtitle ? ` · ${esc(doc.subtitle)}` : ''}</p>
        </div>
        <button class="btn btn-sm" id="toggleEn" aria-pressed="${showEn}">${showEn ? 'EN on' : 'EN off'}</button>
      </div>

      <div class="bar" style="margin-top:10px"><i style="width:${((idx + 1) / doc.lines.length) * 100}%"></i></div>

      <div class="card listen-stage" id="stage">
        <div class="listen-ja" lang="ja" id="ja">${tappable(line.ja, { knownMap: known, furigana: true })}</div>
        ${showEn && line.en ? `<div class="listen-en">${esc(line.en)}</div>` : ''}
      </div>

      <div class="listen-bar">
        <button class="vbar-btn" id="prev" aria-label="Previous line" ${idx === 0 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
        <button class="vbar-btn" id="repeat" aria-label="Say this line again">
          <svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/></svg></button>
        <button class="vbar-btn listen-play" id="play" aria-label="${playing ? 'Pause' : 'Play'}">
          ${playing ? '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>'
                    : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>'}</button>
        <button class="vbar-btn" id="next" aria-label="Next line" ${idx >= doc.lines.length - 1 ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24"><path d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg></button>
        <button class="btn btn-sm" id="rate" aria-label="Speed">${rate.toFixed(2).replace(/0$/, '')}×</button>
      </div>

      ${canSpeak() ? '' : `<p class="small faint center" style="margin-top:10px">
        No Japanese voice available — use the arrows to step through and tap words to read.</p>`}

      <h3 class="section-title">Whole text</h3>
      <div class="stack" id="all">
        ${doc.lines.map((l, n) => `<button class="subline" data-n="${n}" data-active="${n === idx}">
          <span class="ja" lang="ja">${esc(l.ja)}</span>
          ${l.en ? `<span class="en">${esc(l.en)}</span>` : ''}
        </button>`).join('')}
      </div>`;

    // Tapping a word pauses so the learner can read without the audio running on.
    const stage = view.querySelector('#stage');
    bindWordTaps(stage, () => { if (playing) pause(); });

    view.querySelector('#play').addEventListener('click', () => (playing ? pause() : play()), { signal });
    view.querySelector('#prev').addEventListener('click', () => { idx = Math.max(0, idx - 1); paint(); if (playing) say(idx); }, { signal });
    view.querySelector('#next').addEventListener('click', () => { idx = Math.min(doc.lines.length - 1, idx + 1); paint(); if (playing) say(idx); }, { signal });
    view.querySelector('#repeat').addEventListener('click', () => { playing = true; paint(); say(idx); }, { signal });
    view.querySelector('#toggleEn').addEventListener('click', () => { showEn = !showEn; paint(); }, { signal });
    view.querySelector('#rate').addEventListener('click', async () => {
      const steps = [0.6, 0.75, 0.85, 1, 1.15];
      rate = steps[(steps.indexOf(rate) + 1) % steps.length] ?? 0.85;
      await store.setSetting('listenRate', rate);
      paint();
      if (playing) say(idx);
    }, { signal });
    view.querySelector('#all').addEventListener('click', (e) => {
      const b = e.target.closest('[data-n]');
      if (!b) return;
      idx = +b.dataset.n;
      paint();
      if (playing) say(idx);
    }, { signal });

    view.querySelector(`#all [data-n="${idx}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  paint();
}

/** Short real sentences for the level, reused from the reading index. */
async function buildSentences(lv) {
  const [vocabList, i1, sents] = await Promise.all([data.vocab(lv), data.i1(), data.sentences()]);
  const lines = [];
  const seen = new Set();
  for (const w of vocabList) {
    const ids = i1[w.id];
    if (!ids) continue;
    for (const sid of ids) {
      if (seen.has(sid)) continue;
      seen.add(sid);
      const s = sents[sid];
      if (!s || s[0].length > 34) continue;
      lines.push({ ja: s[0], en: s[1] });
      break;
    }
    if (lines.length >= 25) break;
  }
  return { title: `${lv} sentence practice`, subtitle: 'short sentences', lines };
}
