// Shared UI: escaping, ruby rendering, tappable Japanese, the word sheet, toasts.
import * as store from './store.js';
import * as dict from './dict.js';
import { tokenize } from './tokenize.js';
import { furigana as furiganaSegs } from './furigana.js';
import * as data from './data.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const el = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

/** Render pre-computed furigana segments as ruby. */
export function ruby(segs, fallback = '') {
  if (!segs?.length) return esc(fallback);
  return segs.map(([text, rt]) =>
    rt ? `<ruby>${esc(text)}<rt>${esc(rt)}</rt></ruby>` : esc(text)
  ).join('');
}

// ---------- toast ----------
let toastTimer;
export function toast(msg, ms = 2000) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

// Haptics are Chromium-only; Safari has never shipped the Vibration API,
// so this is decoration and nothing may depend on it.
export const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* ignore */ } };

// ---------- audio ----------
let voices = null;
function jaVoice() {
  if (voices === null) voices = speechSynthesis?.getVoices?.() || [];
  return voices.find((v) => v.lang?.toLowerCase().startsWith('ja')) || null;
}
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.addEventListener?.('voiceschanged', () => { voices = speechSynthesis.getVoices(); });
  voices = speechSynthesis.getVoices();
  if (!voices.length) voices = null;
}

/** Speak Japanese. Must be called inside the tap handler or iOS ignores it. */
export function speak(text) {
  try {
    if (!window.speechSynthesis) return false;
    const v = jaVoice();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP';
    if (v) u.voice = v;
    u.rate = 0.9;
    speechSynthesis.cancel();
    speechSynthesis.speak(u);
    return true;
  } catch { return false; }
}
export const canSpeak = () => typeof speechSynthesis !== 'undefined';

// ---------- tappable Japanese text ----------
/**
 * Turn a Japanese string into tappable word chips.
 * Tokens can be supplied (baked at build time) or computed here — the runtime
 * tokenizer costs about 4ms a sentence, which is fine for a subtitle line.
 */
// Verified furigana for the JLPT vocabulary, filled in once the level data is
// loaded. Until then furigana falls back to the cautious dictionary path.
let furiVocab = null;
export async function loadFurigana() {
  if (furiVocab) return furiVocab;
  try {
    const { byWord } = await data.allVocab();
    furiVocab = byWord;
  } catch { furiVocab = new Map(); }
  return furiVocab;
}

/**
 * Map of surface form -> 'known' | 'learning' | 'new', so reading text can show
 * at a glance what you already have. Underlining only the words you have not
 * learned is the single clearest progress signal a reader can give.
 */
export async function knownWords() {
  try {
    const [{ byId }, cards] = await Promise.all([data.allVocab(), store.all('cards')]);
    const m = new Map();
    for (const c of cards) {
      if (c.vocabId == null) continue;
      const w = byId.get(c.vocabId);
      if (!w) continue;
      // Stable for more than two weeks counts as known; anything in the deck
      // but not yet stable is "learning".
      const state = c.state === 2 && c.S > 14 ? 'known' : c.state === 0 ? 'new' : 'learning';
      m.set(w.w, state);
      if (w.r) m.set(w.r, state);
    }
    for (const s of await store.all('saved')) if (!m.has(s.word)) m.set(s.word, 'learning');
    return m;
  } catch { return new Map(); }
}

export function tappable(text, { tokens = null, knownMap = null, furigana = false } = {}) {
  const toks = tokens || (dict.isLoaded() ? tokenize(text, dict.lookup) : null);
  if (!toks) return `<span class="wtext">${esc(text)}</span>`;

  const chip = (t) => {
    const state = knownMap?.get(t.base || t.s) || 'new';
    let inner = esc(t.s);
    if (furigana && HAS_KANJI.test(t.s)) {
      // Prefer the JLPT entry's segmentation: those readings are verified and
      // come pre-aligned from JmdictFurigana. Falling back to "first kana form
      // in the dictionary" guesses badly on names — 中山 is なかやま, not ちゅうやま —
      // so only do that for a common, single-reading entry.
      const known = furiVocab?.get(t.s);
      if (known?.f) inner = ruby(known.f, t.s);
      else if (!t.chain?.length && t.entry?.common && t.entry.kana?.length === 1 && t.entry.kanji?.includes(t.s)) {
        inner = ruby(furiganaSegs(t.s, t.entry.kana[0]), t.s);
      }
    }
    return `<button class="wchip" data-w="${esc(t.base || t.s)}" data-s="${esc(t.s)}" data-known="${state}">${inner}</button>`;
  };

  // Japanese must not start a line with 。、」 and friends. Each token is its own
  // inline element, which hands the browser a break opportunity right before
  // them, so bind trailing punctuation to the word it follows.
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.kind === 'punct') { out.push(`<span class="wpunct">${esc(t.s)}</span>`); continue; }
    let html = chip(t);
    while (i + 1 < toks.length && toks[i + 1].kind === 'punct' && NO_LINE_START.test(toks[i + 1].s)) {
      html += `<span class="wpunct">${esc(toks[i + 1].s)}</span>`;
      i++;
    }
    out.push(`<span class="wgroup">${html}</span>`);
  }
  return `<span class="wtext">${out.join('')}</span>`;
}

const HAS_KANJI = /[一-鿿㐀-䶿]/;
// Characters Japanese typography forbids at the start of a line (行頭禁則).
const NO_LINE_START = /^[。、，．,.！？!?」』）)\]｝}・…ー〜:;]+$/;

/** Delegate taps on .wchip inside a container to the word sheet. */
export function bindWordTaps(container, onOpen) {
  container.addEventListener('click', (e) => {
    const chip = e.target.closest('.wchip');
    if (!chip || !container.contains(chip)) return;
    e.preventDefault();
    e.stopPropagation();
    onOpen?.();
    buzz();
    openWordSheet(chip.dataset.s, chip.dataset.w);
  });
}

// ---------- bottom sheet ----------
const sheetEl = () => document.getElementById('sheet');
let sheetOnClose = null;

export function closeSheet() {
  const s = sheetEl();
  if (s.hidden) return;
  s.hidden = true;
  document.body.style.overflow = '';
  sheetOnClose?.();
  sheetOnClose = null;
}

export function openSheet(html, onClose) {
  const s = sheetEl();
  document.getElementById('sheetBody').innerHTML = html;
  s.hidden = false;
  document.body.style.overflow = 'hidden';
  sheetOnClose = onClose;
  return document.getElementById('sheetBody');
}

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-close]')) closeSheet();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheet(); });

const KEIGO = { hon: 'honorific 尊敬語', hum: 'humble 謙譲語', pol: 'polite 丁寧語' };

/**
 * The word detail sheet. Reachable from everywhere — subtitles, stories,
 * word lists, review — and never navigates, so reading position is kept.
 */
export async function openWordSheet(surface, base = null) {
  const body = openSheet(`<div class="center muted" style="padding:32px">…</div>`);

  const info = dict.explain(base || surface) || dict.explain(surface);
  const { byWord } = await data.allVocab().catch(() => ({ byWord: new Map() }));
  const known = byWord.get(info?.base || base || surface) || byWord.get(surface) || null;

  if (!info && !known) {
    body.innerHTML = `
      <h2 class="jp-lg" lang="ja">${esc(surface)}</h2>
      <p class="muted" style="margin-top:12px">No dictionary entry found for this.</p>
      <button class="btn btn-block" style="margin-top:16px" data-close>Close</button>`;
    return;
  }

  const entry = info?.entries?.[0];

  // The JLPT row and the JMdict entry are looked up separately, and for a kana
  // surface with kanji homophones they disagree: は would show the headword 歯
  // ("tooth") above the gloss "indicates sentence topic". Only trust the JLPT
  // row when it actually names the same word as the entry we are about to show.
  // Match on the WRITTEN form only. Matching on the reading is too loose: 歯
  // ("tooth") is an N5 word read は, so it would be accepted as the headword
  // for the particle は and the sheet would read "歯 — indicates sentence topic".
  const coherent = !entry || !known
    || entry.kanji?.includes(known.w) || entry.kana?.includes(known.w);
  const vocab = coherent ? known : null;

  const headword = vocab?.w || entry?.kanji?.[0] || entry?.kana?.[0] || surface;
  const reading = vocab?.r || entry?.kana?.[0] || '';
  const segs = vocab?.f || null;

  let isSaved = !!(await store.get('saved', headword));
  const inflected = info?.inflection?.length
    ? `<p class="small muted" style="margin-top:6px">${esc(surface)} → <b lang="ja">${esc(info.base)}</b> · ${info.inflection.map(esc).join(' ← ')}</p>`
    : '';

  const senses = (entry?.senses || (vocab ? vocab.senses.map((s) => ({
    gloss: s.g, posLabels: s.p, miscLabels: (s.x || []).map((m) => KEIGO[m]).filter(Boolean),
  })) : [])).slice(0, 5);

  const tags = [];
  if (vocab) tags.push(`<span class="lv-chip lv-${vocab.lv}">${vocab.lv}</span>`);
  if (vocab?.cls) tags.push(`<span class="pos-tag">${esc(vocab.cls)}</span>`);
  if (vocab?.fq) tags.push(`<span class="pos-tag">#${vocab.fq} common</span>`);
  for (const m of new Set((vocab?.misc || entry?.senses?.flatMap((s) => s.misc) || []))) {
    if (KEIGO[m]) tags.push(`<span class="pos-tag keigo">${KEIGO[m]}</span>`);
  }

  const examples = (vocab?.x || []).slice(0, 2);

  body.innerHTML = `
    <div class="spread" style="align-items:flex-start">
      <div style="min-width:0">
        <h2 class="jp-lg" lang="ja">${segs ? ruby(segs, headword) : esc(headword)}</h2>
        ${reading && !segs ? `<p class="muted jp-sm" lang="ja">${esc(reading)}</p>` : ''}
        ${inflected}
      </div>
      ${canSpeak() ? `<button class="appbar-icon" id="sheetSpeak" aria-label="Pronounce">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z"/></svg>
      </button>` : ''}
    </div>

    <div style="margin:10px 0 2px">${tags.join('')}</div>

    <div style="margin-top:8px">
      ${senses.map((s, i) => `
        <div class="sense">
          <span class="sense-n">${i + 1}</span>
          <div>
            <div>${esc(s.gloss)}</div>
            ${(s.posLabels || []).length ? `<div style="margin-top:4px">${s.posLabels.slice(0, 4).map((p) => `<span class="pos-tag">${esc(p)}</span>`).join('')}</div>` : ''}
            ${(s.miscLabels || []).length ? `<div>${s.miscLabels.map((p) => `<span class="pos-tag keigo">${esc(p)}</span>`).join('')}</div>` : ''}
          </div>
        </div>`).join('')}
    </div>

    ${examples.length ? `<h3 class="section-title">Examples</h3>
      ${examples.map(([ja, en]) => `<div class="ex">
        <div class="jp-sm" lang="ja">${esc(ja)}</div>
        <div class="ex-en">${esc(en)}</div>
      </div>`).join('')}` : ''}

    ${vocab?.cls && ['godan', 'ichidan', 'suru', 'kuru', 'i-adj', 'na-adj'].includes(vocab.cls)
      ? `<button class="btn btn-block btn-ghost" style="margin-top:12px" id="sheetConj">Conjugations</button>` : ''}

    <div class="row" style="margin-top:16px;gap:8px">
      <button class="btn btn-block ${isSaved ? '' : 'btn-primary'}" id="sheetSave">
        ${isSaved ? '★ Saved — remove' : '☆ Save to my words'}
      </button>
    </div>
    <button class="btn btn-block btn-ghost" style="margin-top:8px" data-close>Close</button>
  `;

  body.querySelector('#sheetSpeak')?.addEventListener('click', () => speak(reading || headword));

  body.querySelector('#sheetSave')?.addEventListener('click', async (ev) => {
    const btn = ev.currentTarget;
    btn.disabled = true;
    if (isSaved) {
      await store.del('saved', headword);
      await store.del('cards', `saved:${headword}:rec`);
      isSaved = false;
      toast('Removed from your words');
      btn.textContent = '☆ Save to my words';
      btn.classList.add('btn-primary');
    } else {
      await store.put('saved', {
        key: headword, word: headword, reading,
        meaning: senses[0]?.gloss || '', lv: vocab?.lv || null,
        vocabId: vocab?.id ?? null, added: Date.now(),
      });
      // If this word is already in a level deck, or was saved before, keep the
      // existing card — re-saving must never wipe its stability and due date.
      const key = `saved:${headword}:rec`;
      const existing = await store.get('cards', key);
      const levelCard = vocab ? await store.get('cards', `vocab:${vocab.id}:rec`) : null;
      if (levelCard) {
        // Already in a level deck: promote it rather than create a duplicate.
        // Saving a word is an explicit "teach me this", so it should not wait
        // behind several hundred words it happens to sit after in the list.
        if (levelCard.state === 0 && (levelCard.ord ?? 0) >= 0) {
          await store.put('cards', { ...levelCard, ord: -Date.now() });
        }
      } else if (!existing) {
        const { newCard } = await import('./srs.js');
        // Negative ord puts an explicitly saved word at the FRONT of the new
        // queue. A timestamp would have parked it behind all 8,050 level words.
        await store.put('cards', newCard(key, 'saved', {
          word: headword, reading, vocabId: vocab?.id ?? null, lv: vocab?.lv ?? null, ord: -Date.now(),
        }));
      }
      isSaved = true;
      toast(levelCard ? 'Saved — moved to the front of your reviews' : 'Saved — it is next up in your reviews');
      buzz(12);
      btn.textContent = '★ Saved — remove';
      btn.classList.remove('btn-primary');
    }
    btn.disabled = false;
    window.dispatchEvent(new CustomEvent('nihongo:saved-changed'));
  });

  body.querySelector('#sheetConj')?.addEventListener('click', async () => {
    const table = await data.conjugations();
    const rows = table[vocab.id];
    if (!rows) return toast('No conjugation table for this word');
    const labels = {
      dictionary: 'Dictionary', polite_nonpast: 'Polite', polite_past: 'Polite past',
      polite_negative: 'Polite neg.', polite_past_negative: 'Polite past neg.',
      te_form: 'て-form', ta_form: 'Past', nai_form: 'Negative', nakatta_form: 'Past negative',
      potential: 'Potential', passive: 'Passive', causative: 'Causative',
      imperative: 'Imperative', volitional: 'Volitional',
      conditional_ba: 'Conditional ば', conditional_tara: 'Conditional たら', attributive: 'Attributive',
    };
    openSheet(`
      <h2 style="margin-bottom:4px">${esc(headword)} <span class="muted small">${esc(rows.cls)}</span></h2>
      <div style="margin-top:10px">
        ${Object.entries(rows.forms).map(([k, v]) => `
          <div class="spread" style="padding:9px 0;border-top:1px solid var(--line)">
            <span class="small muted">${esc(labels[k] || k)}</span>
            <span class="jp-sm" lang="ja">${esc(v)}</span>
          </div>`).join('')}
      </div>
      <button class="btn btn-block btn-ghost" style="margin-top:14px" data-close>Close</button>`);
  });
}
