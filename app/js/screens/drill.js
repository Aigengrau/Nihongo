// Quick drills over a whole level's words or kanji.
//
// Distinct from Review on purpose: Review is your SRS deck, scheduled and
// consequential. This is a no-stakes pass over the level — shuffle, quiz
// yourself, match pairs — without touching your scheduling. Getting something
// wrong here just offers to add it to your real deck.
import * as data from '../data.js';
import * as store from '../store.js';
import { esc, ruby, toast, buzz, speak, canSpeak, openWordSheet, cycleSpeechRate, rateLabel } from '../ui.js';
import { newCard } from '../srs.js';

export const MODES = [
  { id: 'list', label: 'List' },
  { id: 'cards', label: 'Flashcards' },
  { id: 'quiz', label: 'Quiz' },
  { id: 'match', label: 'Match' },
  { id: 'listen', label: 'Listen' },
];

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const sample = (a, n, not) => shuffle(a.filter((x) => x !== not)).slice(0, n);

/** Normalises a word or a kanji into the one shape every drill renders. */
function asCard(x, kind) {
  if (kind === 'kanji') {
    return {
      key: `kanji:${x.c}`,
      front: x.c,
      frontRuby: null,
      reading: [...(x.on || []), ...(x.kun || [])].slice(0, 4).join('・'),
      speak: (x.kun?.[0] || x.on?.[0] || x.c).replace(/[-.]/g, ''),
      meaning: (x.m || []).slice(0, 3).join(', '),
      sub: `${x.s ? `${x.s} strokes` : ''}`,
      raw: x,
    };
  }
  return {
    key: `vocab:${x.id}`,
    front: x.w,
    frontRuby: x.f,
    reading: x.r,
    speak: x.r || x.w,
    meaning: (x.m || []).slice(0, 3).join(', '),
    sub: x.cls || '',
    raw: x,
  };
}

export const modeBar = (mode, base) => `
  <div class="seg modebar" role="group" aria-label="Mode">
    ${MODES.map((m) => `<a href="#${base}/${m.id}" aria-pressed="${m.id === mode}">${m.label}</a>`).join('')}
  </div>`;

/**
 * @param opts.kind 'vocab' | 'kanji'
 * @param opts.items the level's raw list
 */
export function runDrill({ mode, kind, items, view, signal, lv, base }) {
  const cards = items.map((x) => asCard(x, kind));
  const bar = modeBar(mode, base);
  const openDetail = (c) => (kind === 'kanji' ? showKanji(c) : openWordSheet(c.front));

  if (mode === 'cards') return flashcards({ bar, cards, view, signal, openDetail, kind, lv });
  if (mode === 'quiz') return quiz({ bar, cards, view, signal, openDetail, kind, lv });
  if (mode === 'match') return match({ bar, cards, view, signal, kind });
  if (mode === 'listen') return listenDrill({ bar, cards, view, signal, openDetail, kind });
  return null;   // 'list' is rendered by the caller
}

function showKanji(c) {
  const k = c.raw;
  openWordSheetLike(`
    <div class="center">
      <div class="jp-lg" lang="ja" style="font-size:72px">${esc(k.c)}</div>
      <div class="muted">${esc((k.m || []).join(', '))}</div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="spread" style="padding:5px 0"><span class="small muted">On'yomi</span>
        <span class="jp-sm" lang="ja">${esc((k.on || []).join('、') || '—')}</span></div>
      <div class="spread" style="padding:5px 0;border-top:1px solid var(--line)"><span class="small muted">Kun'yomi</span>
        <span class="jp-sm" lang="ja">${esc((k.kun || []).join('、') || '—')}</span></div>
    </div>
    <button class="btn btn-block btn-ghost" style="margin-top:14px" data-close>Close</button>`);
}
// tiny local wrapper so drill.js does not need to import openSheet directly
function openWordSheetLike(html) {
  const s = document.getElementById('sheet');
  document.getElementById('sheetBody').innerHTML = html;
  s.hidden = false;
  document.body.style.overflow = 'hidden';
}

// ---------------------------------------------------------------- flashcards
function flashcards({ bar, cards, view, signal, openDetail, kind, lv }) {
  let deck = shuffle(cards);
  let i = 0, shown = false, seen = 0;

  const paint = () => {
    if (signal?.aborted) return;
    const c = deck[i];
    view.innerHTML = `${bar}
      <div class="review-top" style="margin-top:12px">
        <span>${i + 1} / ${deck.length}</span>
        <span class="bar" style="flex:1"><i style="width:${(i / deck.length) * 100}%"></i></span>
        <button class="btn btn-sm" id="reshuffle">Shuffle</button>
      </div>
      <button class="review-card" id="face" style="width:100%;margin-top:10px">
        <div class="jp-lg" lang="ja">${c.frontRuby && shown ? ruby(c.frontRuby, c.front) : esc(c.front)}</div>
        ${shown ? `
          <div class="jp-md muted" lang="ja">${esc(c.reading)}</div>
          <div style="font-size:18px;font-weight:650">${esc(c.meaning)}</div>
          ${c.sub ? `<div class="small faint">${esc(c.sub)}</div>` : ''}
        ` : '<div class="small faint">tap to flip</div>'}
      </button>
      <div class="row" style="margin-top:12px;gap:8px">
        <button class="btn" id="prev" ${i === 0 ? 'disabled' : ''}>←</button>
        ${canSpeak() ? '<button class="btn" id="say">🔊</button><button class="btn" id="rate">' + rateLabel() + '</button>' : ''}
        <button class="btn btn-block btn-primary" id="next">${i >= deck.length - 1 ? 'Start over' : 'Next'}</button>
      </div>
      <button class="btn btn-block btn-ghost" style="margin-top:8px" id="detail">Full details</button>
      <p class="small faint center" style="margin-top:10px">
        A no-pressure pass over ${esc(lv)}. Nothing here changes your review schedule.</p>`;

    view.querySelector('#face').addEventListener('click', () => {
      if (!shown) { shown = true; seen++; paint(); if (c.speak) speak(c.speak); }
      else openDetail(c);
    }, { signal });
    view.querySelector('#say')?.addEventListener('click', () => speak(c.speak), { signal });
    view.querySelector('#rate')?.addEventListener('click', (e) => { e.currentTarget.textContent = rateLabel(cycleSpeechRate()); speak(c.speak); }, { signal });
    view.querySelector('#detail').addEventListener('click', () => openDetail(c), { signal });
    view.querySelector('#prev').addEventListener('click', () => { i = Math.max(0, i - 1); shown = false; paint(); }, { signal });
    view.querySelector('#next').addEventListener('click', () => {
      if (i >= deck.length - 1) { deck = shuffle(cards); i = 0; } else i++;
      shown = false; paint();
    }, { signal });
    view.querySelector('#reshuffle').addEventListener('click', () => { deck = shuffle(cards); i = 0; shown = false; paint(); }, { signal });
  };
  paint();
}

// ---------------------------------------------------------------- quiz
function quiz({ bar, cards, view, signal, openDetail, kind, lv }) {
  let asked = 0, right = 0, streak = 0, best = 0;
  const missed = [];

  const ask = () => {
    if (signal?.aborted) return;
    const c = cards[Math.floor(Math.random() * cards.length)];
    // Alternate direction so it drills recognition AND recall.
    const toJa = Math.random() < 0.4;
    const others = sample(cards, 3, c);
    if (others.length < 3) { view.innerHTML = `${bar}<div class="empty"><p>Not enough items to quiz.</p></div>`; return; }
    const opts = shuffle([c, ...others]);

    view.innerHTML = `${bar}
      <div class="review-top" style="margin-top:12px">
        <span>${right}/${asked}</span>
        <span class="bar" style="flex:1"><i style="width:${asked ? (right / asked) * 100 : 0}%"></i></span>
        <span>streak ${streak}${best > streak ? ` · best ${best}` : ''}</span>
      </div>
      <div class="review-card" style="margin-top:10px">
        <div class="small faint">${toJa ? 'Which one means this?' : (kind === 'kanji' ? 'What does this kanji mean?' : 'What does this mean?')}</div>
        ${toJa
          ? `<div style="font-size:21px;font-weight:650">${esc(c.meaning)}</div>`
          : `<div class="jp-lg" lang="ja">${esc(c.front)}</div>`}
      </div>
      <div class="stack" style="margin-top:12px" id="opts">
        ${opts.map((o) => `<button class="btn btn-block ${toJa ? 'jp-sm' : ''}" ${toJa ? 'lang="ja"' : ''}
          data-k="${esc(o.key)}" style="min-height:54px">${toJa ? esc(o.front) : esc(o.meaning)}</button>`).join('')}
      </div>
      ${missed.length ? `<button class="btn btn-block btn-ghost" style="margin-top:12px" id="addMissed">
        Add the ${missed.length} I got wrong to my reviews</button>` : ''}`;

    view.querySelector('#opts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      asked++;
      const ok = b.dataset.k === c.key;
      if (ok) { right++; streak++; best = Math.max(best, streak); }
      else { streak = 0; if (!missed.some((m) => m.key === c.key)) missed.push(c); }
      b.style.borderColor = ok ? 'var(--green)' : 'var(--accent)';
      if (!ok) view.querySelector(`[data-k="${CSS.escape(c.key)}"]`).style.borderColor = 'var(--green)';
      buzz(ok ? 8 : 20);
      if (c.speak) speak(c.speak);
      setTimeout(() => { if (!signal?.aborted) ask(); }, ok ? 550 : 1500);
    }, { once: true, signal });

    view.querySelector('#addMissed')?.addEventListener('click', async () => {
      const n = await addToDeck(missed, kind, lv);
      toast(n ? `${n} added to your reviews` : 'Already in your reviews');
      missed.length = 0;
      ask();
    }, { signal });
  };
  ask();
}

// ---------------------------------------------------------------- match
function match({ bar, cards, view, signal, kind }) {
  const SIZE = 5;
  let round = 0, solved = 0;
  let pool = shuffle(cards);
  let picked = null;
  let done = new Set();
  let current = [];

  const deal = () => {
    current = pool.slice(round * SIZE, round * SIZE + SIZE);
    if (current.length < SIZE) { pool = shuffle(cards); round = 0; current = pool.slice(0, SIZE); }
    done = new Set();
    picked = null;
    paint();
  };

  const paint = () => {
    if (signal?.aborted) return;
    const left = current;
    const rightCol = shuffle(current);
    view.innerHTML = `${bar}
      <p class="small faint" style="margin:12px 2px">Tap a word, then its meaning. ${solved} pairs matched.</p>
      <div class="match-grid">
        <div class="stack">
          ${left.map((c) => `<button class="btn match-cell jp-sm" lang="ja" data-side="l" data-k="${esc(c.key)}"
            ${done.has(c.key) ? 'data-done="1"' : ''}>${esc(c.front)}</button>`).join('')}
        </div>
        <div class="stack">
          ${rightCol.map((c) => `<button class="btn match-cell" data-side="r" data-k="${esc(c.key)}"
            ${done.has(c.key) ? 'data-done="1"' : ''}>${esc(c.meaning.split(',')[0])}</button>`).join('')}
        </div>
      </div>
      ${done.size === current.length ? `<button class="btn btn-block btn-primary" style="margin-top:14px" id="more">Next five</button>` : ''}`;

    view.querySelectorAll('.match-cell').forEach((b) => b.addEventListener('click', () => {
      if (b.dataset.done) return;
      if (!picked) { picked = b; b.style.borderColor = 'var(--indigo)'; return; }
      if (picked === b) { picked.style.borderColor = ''; picked = null; return; }
      if (picked.dataset.side === b.dataset.side) { picked.style.borderColor = ''; picked = b; b.style.borderColor = 'var(--indigo)'; return; }
      const ok = picked.dataset.k === b.dataset.k;
      if (ok) {
        done.add(b.dataset.k); solved++;
        [picked, b].forEach((x) => { x.dataset.done = '1'; x.style.borderColor = 'var(--green)'; });
        buzz(8);
        const c = current.find((x) => x.key === b.dataset.k);
        if (c?.speak) speak(c.speak);
        picked = null;
        if (done.size === current.length) setTimeout(() => { if (!signal?.aborted) { round++; paint(); } }, 500);
      } else {
        b.style.borderColor = 'var(--accent)';
        const p = picked;
        buzz(20);
        setTimeout(() => { b.style.borderColor = ''; p.style.borderColor = ''; }, 500);
        picked = null;
      }
    }, { signal }));

    view.querySelector('#more')?.addEventListener('click', () => { round++; deal(); }, { signal });
  };
  deal();
}

// ---------------------------------------------------------------- listen
function listenDrill({ bar, cards, view, signal, openDetail, kind }) {
  if (!canSpeak()) {
    view.innerHTML = `${bar}<div class="empty"><div class="empty-mark">聴</div>
      <p><b>No Japanese voice on this device.</b></p>
      <p class="small" style="margin-top:8px">On Android install <b>Google Text-to-speech</b> and add
      Japanese under Settings → System → Languages → Text-to-speech. iPhones have one built in.</p></div>`;
    return;
  }
  let asked = 0, right = 0;
  const ask = () => {
    if (signal?.aborted) return;
    const c = cards[Math.floor(Math.random() * cards.length)];
    const opts = shuffle([c, ...sample(cards, 3, c)]);
    view.innerHTML = `${bar}
      <div class="review-top" style="margin-top:12px">
        <span>${right}/${asked}</span>
        <span class="bar" style="flex:1"><i style="width:${asked ? (right / asked) * 100 : 0}%"></i></span>
      </div>
      <div class="review-card" style="margin-top:10px">
        <div class="small faint">Listen and pick what you heard</div>
        <button class="vbar-btn listen-play" id="replay" aria-label="Play again" style="margin:6px auto">
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z"/></svg>
        </button>
      </div>
      <div class="stack" style="margin-top:12px" id="opts">
        ${opts.map((o) => `<button class="btn btn-block jp-sm" lang="ja" data-k="${esc(o.key)}"
          style="min-height:54px">${esc(o.front)}<span class="small faint" style="display:block;font-family:var(--ui)">${esc(o.meaning.split(',')[0])}</span></button>`).join('')}
      </div>`;
    speak(c.speak);
    view.querySelector('#replay').addEventListener('click', () => speak(c.speak), { signal });
    view.querySelector('#opts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      asked++;
      const ok = b.dataset.k === c.key;
      if (ok) right++;
      b.style.borderColor = ok ? 'var(--green)' : 'var(--accent)';
      if (!ok) view.querySelector(`[data-k="${CSS.escape(c.key)}"]`).style.borderColor = 'var(--green)';
      buzz(ok ? 8 : 20);
      setTimeout(() => { if (!signal?.aborted) ask(); }, ok ? 600 : 1600);
    }, { once: true, signal });
  };
  ask();
}

/** Put the things you got wrong into the real SRS deck. */
async function addToDeck(list, kind, lv) {
  const existing = new Set((await store.all('cards')).map((c) => c.key));
  const add = [];
  for (const c of list) {
    const key = kind === 'kanji' ? `kanji:${c.raw.c}:rec` : `vocab:${c.raw.id}:rec`;
    if (existing.has(key)) continue;
    add.push(kind === 'kanji'
      ? newCard(key, `kanji:${lv}`, { word: c.raw.c, reading: c.reading, kanji: c.raw.c, lv, ord: -Date.now() })
      : newCard(key, `level:${lv}`, { word: c.raw.w, reading: c.raw.r, vocabId: c.raw.id, lv, ord: -Date.now() }));
  }
  if (add.length) await store.putMany('cards', add);
  if (add.length) window.dispatchEvent(new CustomEvent('nihongo:progress'));
  return add.length;
}
