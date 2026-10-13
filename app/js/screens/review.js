// The study loop: Learn (first exposure) and Review (SRS flashcards).
import * as data from '../data.js';
import * as store from '../store.js';
import { esc, ruby, toast, buzz, speak, canSpeak, openWordSheet } from '../ui.js';
import { review as schedule, preview, RATING, STATE, newCard } from '../srs.js';
import { session, bumpToday, touchStreak, enrollLevel, enrollKanji, remainingNew, inventory, today as todayCounts } from '../progress.js';
import { swipeable, swipeHint } from '../swipe.js';
import { openGrammarSheet } from './grammar.js';

const GRADES = [
  { g: RATING.AGAIN, label: 'Again' },
  { g: RATING.HARD, label: 'Hard' },
  { g: RATING.GOOD, label: 'Good' },
  { g: RATING.EASY, label: 'Easy' },
];

function wordFace(w, { furigana = true } = {}) {
  return `<div class="jp-lg ${furigana ? '' : 'no-furi'}" lang="ja">${w.f ? ruby(w.f, w.w) : esc(w.w)}</div>`;
}

// ---------------------------------------------------------------- Learn
/** First exposure: see the word, hear it, read it in a sentence, then it enters the SRS. */
export async function learn({ params, query, view, setChrome, go, signal }) {
  const lv = params[0];
  const kind = params[1] === 'kanji' ? 'kanji' : 'vocab';
  const isKanji = kind === 'kanji';
  setChrome({ title: `Learn ${isKanji ? 'kanji' : ''} · ${lv}`.replace('  ', ' '), back: true });

  const list = isKanji ? await data.kanji(lv) : await data.vocab(lv);
  const base = await store.setting('newPerDay', 10);
  const deck = isKanji ? `kanji:${lv}` : `level:${lv}`;

  // Enrol only what today's session can actually use. Enrolling a whole level
  // up front put 3,267 N1 words into a beginner's new-card queue after a single
  // curious tap; the rest are added as they are needed.
  const alreadyNew = (await store.all('cards'))
    .filter((c) => c.state === STATE.NEW && c.deck === deck).length;
  if (alreadyNew < base * 3) {
    if (isKanji) await enrollKanji(lv, list, alreadyNew + base * 3);
    else await enrollLevel(lv, list, alreadyNew + base * 3);
  }

  const noun = isKanji ? 'kanji' : 'words';
  const r = await remainingNew(kind);
  const more = query?.get('more') === '1';
  let allowance = more ? base : r.left;

  if (allowance <= 0) {
    // Say the true reason. This used to blame reviews even when none were due.
    const backlog = r.reason === 'backlog';
    view.innerHTML = `<div class="empty"><div class="empty-mark">${backlog ? '休' : '✓'}</div>
      <p><b>${backlog
        ? `New ${noun} are paused.`
        : `That is today's ${noun} done — ${r.doneToday} of ${r.cap}.`}</b></p>
      <p class="small" style="margin-top:6px">${backlog
        ? `You have ${r.due} review${r.due === 1 ? '' : 's'} waiting. Clearing those is worth more than new ${noun} right now.`
        : `The daily cap keeps tomorrow's review load sane. You can carry on if you want to — it just means more to review later.`}</p>
      ${backlog
        ? `<a class="btn btn-primary" style="margin-top:16px" href="#/review">Do reviews</a>`
        : `<a class="btn btn-primary" style="margin-top:16px" href="#/learn/${lv}${isKanji ? '/kanji' : ''}?more=1">Learn ${base} more anyway</a>`}
      <a class="btn btn-block btn-ghost" style="margin-top:8px" href="#/today">Back to Today</a></div>`;
    return;
  }

  const cards = (await store.all('cards'))
    .filter((c) => c.state === STATE.NEW && c.deck === deck)
    .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))
    .slice(0, allowance);

  if (!cards.length) {
    view.innerHTML = `<div class="empty"><div class="empty-mark">完</div>
      <p>You have met every ${lv} ${isKanji ? 'kanji' : 'word'}.</p>
      <a class="btn btn-primary" style="margin-top:16px" href="#/review">Review them</a></div>`;
    return;
  }

  const byId = new Map(list.map((w) => [isKanji ? w.c : w.id, w]));
  // Kanji cards show real words that use the character, so the learner meets it
  // in context rather than as an isolated glyph.
  const vocabById = isKanji
    ? new Map((await data.vocab(lv)).map((v) => [v.id, v]))
    : new Map();
  let i = 0;

  const draw = () => {
    if (i >= cards.length) {
      view.innerHTML = `<div class="empty"><div class="empty-mark">✓</div>
        <p><b>${cards.length} new ${isKanji ? 'kanji' : 'words'} learned.</b></p>
        <p class="small" style="margin-top:6px">They will come back for review shortly — that is when they stick.</p>
        <a class="btn btn-primary btn-block" style="margin-top:18px" href="#/review">Start reviewing</a>
        <a class="btn btn-block btn-ghost" style="margin-top:8px" href="#/today">Done for now</a></div>`;
      return;
    }
    const card = cards[i];
    const w = byId.get(isKanji ? card.kanji : card.vocabId);
    if (!w) { i++; return draw(); }
    const ex = isKanji ? null : w.x?.[0];
    const kanjiWords = isKanji ? (w.v || []).map((id) => vocabById.get(id)).filter(Boolean).slice(0, 4) : [];
    const sayText = isKanji ? (kanjiWords[0]?.r || (w.kun || [])[0] || (w.on || [])[0] || w.c).replace(/[-.]/g, '') : (w.r || w.w);

    view.innerHTML = `
      <div class="review-top">
        <span>${i + 1} / ${cards.length}</span>
        <span class="bar" style="flex:1"><i style="width:${(i / cards.length) * 100}%"></i></span>
      </div>
      <div class="card" id="face" style="margin-top:12px;text-align:center;padding:26px 16px">
        ${isKanji ? `
          <div class="jp-lg" lang="ja" style="font-size:78px;line-height:1.1">${esc(w.c)}</div>
          <div style="font-size:18px;font-weight:600;margin-top:12px">${esc((w.m || []).slice(0, 3).join(', '))}</div>
          <div class="card" style="margin-top:14px;text-align:left">
            <div class="spread" style="padding:4px 0"><span class="small muted">On'yomi</span>
              <span class="jp-sm" lang="ja">${esc((w.on || []).join('、') || '—')}</span></div>
            <div class="spread" style="padding:4px 0;border-top:1px solid var(--line)"><span class="small muted">Kun'yomi</span>
              <span class="jp-sm" lang="ja">${esc((w.kun || []).join('、') || '—')}</span></div>
          </div>
          <div style="margin-top:10px">
            <span class="lv-chip lv-${w.lv}">${w.lv}</span>
            ${w.s ? `<span class="pos-tag">${w.s} strokes</span>` : ''}
            ${w.fq ? `<span class="pos-tag">#${w.fq} most used</span>` : ''}
          </div>
          ${w.comp?.length ? `<div style="margin-top:10px">
            <div class="small faint" style="margin-bottom:5px">Built from</div>
            ${w.comp.map((c) => `<span class="pos-tag" lang="ja" style="font-size:14px">${esc(c.r)}${c.m ? ` <span class="faint">${esc(c.m)}</span>` : ''}</span>`).join('')}
          </div>` : ''}
        ` : `
          ${wordFace(w)}
          <div class="jp-md muted" lang="ja" style="margin-top:2px">${esc(w.r)}</div>
          <div style="font-size:18px;font-weight:600;margin-top:14px">${esc(w.m.slice(0, 3).join(', '))}</div>
          <div style="margin-top:10px">
            <span class="lv-chip lv-${w.lv}">${w.lv}</span>
            ${w.cls ? `<span class="pos-tag">${esc(w.cls)}</span>` : ''}
            ${w.fq ? `<span class="pos-tag">#${w.fq} common</span>` : ''}
          </div>
        `}
        ${canSpeak() ? `<button class="btn btn-sm" id="say" style="margin-top:14px">🔊 Hear it</button>` : ''}
      </div>

      <!-- The two buttons that move the session on sit directly under the card
           and stay stuck to the bottom of the screen. They used to be below the
           example sentence and the words-that-use-it list, which on a kanji
           card meant scrolling before every single tap. -->
      <div class="act-bar">
        <button class="btn" id="know">I knew this</button>
        <button class="btn btn-block btn-primary" id="next">Got it</button>
      </div>
      ${i < 2 ? swipeHint('got it', 'go back') : ''}

      ${ex ? `<div class="card" style="margin-top:10px">
        <div class="small faint" style="margin-bottom:6px">In a sentence</div>
        <div class="jp-md" lang="ja">${esc(ex[0])}</div>
        <div class="ex-en">${esc(ex[1])}</div>
      </div>` : ''}
      ${isKanji && kanjiWords.length ? `<div class="card" style="margin-top:10px">
        <div class="small faint" style="margin-bottom:6px">Words that use it</div>
        ${kanjiWords.map((v) => `<div class="spread" style="padding:5px 0">
          <span class="jp-sm" lang="ja">${esc(v.w)}<span class="faint" style="font-size:12px"> ${esc(v.r)}</span></span>
          <span class="small muted">${esc((v.m || [])[0] || '')}</span></div>`).join('')}
      </div>` : ''}

      <button class="btn btn-block btn-ghost" style="margin-top:10px" id="detail">Full details</button>
    `;

    view.querySelector('#say')?.addEventListener('click', () => speak(sayText));
    view.querySelector('#detail').addEventListener('click', () => openWordSheet(isKanji ? (kanjiWords[0]?.w || w.c) : w.w));

    const advance = async (rating) => {
      const { card: next, log } = schedule(card, rating);
      await store.put('cards', next);
      await store.put('reviews', log);
      await bumpToday(isKanji ? { newKanji: 1 } : { new: 1 });
      buzz();
      i++;
      draw();
    };

    // Going back has to undo, not just re-display: the card was scheduled and
    // the day's counter bumped the moment you moved on. `cards[i]` is still the
    // untouched snapshot, so putting it back is the whole reversal.
    const back = async () => {
      if (i === 0) return toast('This is the first card');
      i--;
      const prev = cards[i];
      await store.put('cards', prev);
      await store.delLastReview(prev.key);
      await bumpToday(isKanji ? { newKanji: -1 } : { new: -1 });
      draw();
    };

    view.querySelector('#next').addEventListener('click', () => advance(RATING.GOOD));
    view.querySelector('#know').addEventListener('click', () => advance(RATING.EASY));
    swipeable(view.querySelector('#face'), {
      onForward: () => advance(RATING.GOOD),
      onBack: back,
      forwardLabel: 'got it',
      signal,
    });

    if (sayText) speak(sayText);
  };

  await touchStreak();
  draw();
}

// ---------------------------------------------------------------- Review
export async function review({ params, view, setChrome, go, signal }) {
  const deck = params[0] || null;
  const deckLabel = deck ? deck.replace('level:', '').replace('grammar:', 'grammar · ') : null;
  setChrome({ title: deckLabel ? `Review · ${deckLabel}` : 'Review', back: true });

  const { queue, buried } = await session({ deck });
  if (!queue.length) {
    const inv = await inventory();
    view.innerHTML = `<div class="empty"><div class="empty-mark">✓</div>
      <p><b>Nothing due right now.</b></p>
      <p class="small" style="margin-top:6px">${inv.fresh} new words waiting · ${buried.length ? `${buried.length} held back to avoid repeats` : 'come back later today'}</p>
      <a class="btn btn-primary" style="margin-top:16px" href="#/today">Back to Today</a></div>`;
    return;
  }

  const { byId } = await data.allVocab();
  const savedRows = new Map((await store.all('saved')).map((s) => [s.key, s]));
  const furiSetting = await store.setting('furigana', 'auto');
  const grammarByGid = await loadGrammar(queue);

  let i = 0, shown = false, right = 0;
  const graded = [];   // the rating each card was given, so going back can undo it
  const started = Date.now();
  let credited = false;

  // Credit the session as soon as the learner actually reviews something —
  // abandoning a 120-card queue after 40 cards is still a day studied.
  const credit = async () => {
    if (credited) return;
    credited = true;
    await touchStreak();
    window.dispatchEvent(new CustomEvent('nihongo:progress'));
  };

  const finish = async () => {
    const mins = Math.round((Date.now() - started) / 60000);
    await bumpToday({ minutes: mins });
    await credit();
    view.innerHTML = `<div class="empty"><div class="empty-mark">✓</div>
      <p><b>${queue.length} reviewed.</b></p>
      <p class="small" style="margin-top:6px">${right}/${queue.length} recalled · ${mins} min${buried.length ? ` · ${buried.length} related card${buried.length === 1 ? '' : 's'} held back so you would not see the same word twice` : ''}</p>
      <a class="btn btn-primary btn-block" style="margin-top:18px" href="#/today">Back to Today</a>
      <a class="btn btn-block btn-ghost" style="margin-top:8px" href="#/review">Keep going</a></div>`;
  };

  const draw = () => {
    if (i >= queue.length) return finish();
    const card = queue[i];
    const w = card.vocabId != null ? byId.get(card.vocabId) : null;
    const g = card.gid ? grammarByGid.get(card.gid) : null;
    const savedRow = savedRows.get(card.word);

    const front = w ? w.w : (card.word || '?');
    const reading = w?.r || card.reading || savedRow?.reading || '';
    const meaning = w ? w.m.slice(0, 3).join(', ') : (savedRow?.meaning || '');
    const segs = w?.f;
    const showFuri = furiSetting === 'always';
    const ex = g ? (g.x || [])[0] : w?.x?.[0];
    const iv = preview(card);
    const lv = w?.lv || card.lv;
    const say = g ? (ex?.[0] || '') : reading;

    // A grammar point is a pattern, not a word: it gets its own face, because
    // 46px of "V plain / i-adj / na-adj な / noun の + とき(に)" fits nothing.
    const faceHTML = g || card.gid ? `
        <div class="jp-md" lang="ja" style="font-weight:650">${esc(g?.pattern || card.pattern || front)}</div>
        ${shown ? `
          <div style="font-size:17px;font-weight:650">${esc(g?.meaning || card.meaning || '')}</div>
          ${g?.formation ? `<div class="jp-sm" lang="ja" style="color:var(--text-dim)">${esc(g.formation)}</div>` : ''}
          ${ex ? `<div style="margin-top:8px;border-top:1px solid var(--line);padding-top:10px">
              <div class="jp-sm" lang="ja">${esc(ex[0])}</div>
              <div class="ex-en">${esc(ex[1])}</div></div>` : ''}
        ` : `<div class="small faint">what does this pattern do?</div>`}`
      : `
        <div class="${showFuri ? '' : 'no-furi'}" id="jp">
          <div class="jp-lg" lang="ja">${segs ? ruby(segs, front) : esc(front)}</div>
        </div>
        ${shown ? `
          <div class="jp-md muted" lang="ja">${esc(reading)}</div>
          <div style="font-size:19px;font-weight:650">${esc(meaning)}</div>
          ${ex ? `<div style="margin-top:8px;border-top:1px solid var(--line);padding-top:10px">
              <div class="jp-sm" lang="ja">${esc(ex[0])}</div>
              <div class="ex-en">${esc(ex[1])}</div></div>` : ''}
        ` : `<div class="small faint">tap to reveal</div>`}`;

    view.innerHTML = `
      <div class="review-wrap">
        <div class="review-top">
          <span>${i + 1} / ${queue.length}</span>
          <span class="bar" style="flex:1"><i style="width:${(i / queue.length) * 100}%"></i></span>
          ${card.gid ? '<span class="pos-tag" style="margin:0">文</span>' : ''}
          ${lv ? `<span class="lv-chip lv-${lv}">${esc(lv)}</span>` : ''}
        </div>

        <div class="review-card" id="face">${faceHTML}</div>

        ${shown ? `
          <div class="review-grade">
            ${GRADES.map((gr) => `<button class="grade" data-g="${gr.g}">
              ${gr.label}<small>${esc(iv[Object.keys(RATING).find((k) => RATING[k] === gr.g)])}</small>
            </button>`).join('')}
          </div>
        ` : `<button class="btn btn-primary btn-block reveal-btn" id="reveal">Show answer</button>`}
        ${i < 2 ? swipeHint('skip (got it)', 'go back') : ''}
      </div>
    `;

    const reveal = () => { if (!shown) { shown = true; draw(); if (say) speak(say); } };
    view.querySelector('#reveal')?.addEventListener('click', reveal);
    view.querySelector('#face').addEventListener('click', () => {
      if (!shown) return reveal();
      if (g) openGrammarSheet(g);
      else if (w) openWordSheet(w.w);
    });

    const grade = async (rating) => {
      const wasNew = card.state === STATE.NEW;
      const { card: next, log } = schedule(card, rating);
      await store.put('cards', next);
      await store.put('reviews', log);
      // A new card met here still counts against the daily new-card allowance,
      // otherwise tapping "Keep going" walks straight past the throttle.
      await bumpToday({ reviews: 1, correct: rating > 1 ? 1 : 0, ...(wasNew ? { new: 1 } : {}) });
      await credit();
      graded[i] = rating;
      if (rating > 1) right++;
      buzz(rating === 1 ? 20 : 8);
      i++; shown = false;
      draw();
    };

    // Back undoes the grade: `queue[i]` is the snapshot taken before it was
    // scheduled, so writing it back restores the real due date, and the day's
    // counters are rolled back with it.
    const back = async () => {
      if (i === 0) return toast('This is the first card');
      i--;
      const prev = queue[i];
      const rating = graded[i];
      await store.put('cards', prev);
      await store.delLastReview(prev.key);
      await bumpToday({
        reviews: -1,
        correct: rating > 1 ? -1 : 0,
        ...(prev.state === STATE.NEW ? { new: -1 } : {}),
      });
      if (rating > 1) right--;
      graded[i] = null;
      shown = true;        // you came back to re-grade it, so the answer stays up
      draw();
    };

    view.querySelectorAll('.grade').forEach((b) =>
      b.addEventListener('click', () => grade(+b.dataset.g)));

    // One gesture language with the rest of the app: left skips the card and
    // counts it as known, right steps back. This replaced "right = Good,
    // left = Again", which meant the same flick did different things depending
    // on whether the answer happened to be showing.
    swipeable(view.querySelector('#face'), {
      onForward: () => grade(RATING.GOOD),
      onBack: back,
      forwardLabel: 'got it',
      signal,
    });
  };

  draw();
}

/** The grammar points behind any grammar cards in this queue. */
async function loadGrammar(queue) {
  const byGid = new Map();
  const levels = [...new Set(queue.filter((c) => c.gid).map((c) => c.lv))].filter(Boolean);
  for (const lv of levels) {
    try {
      for (const g of await data.grammar(lv)) byGid.set(g.gid, g);
    } catch {
      // Not downloaded: the card carries its own pattern and meaning, which is
      // enough to review it. Only the full explanation is missing.
    }
  }
  return byGid;
}
