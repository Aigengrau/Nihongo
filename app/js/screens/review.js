// The study loop: Learn (first exposure) and Review (SRS flashcards).
import * as data from '../data.js';
import * as store from '../store.js';
import { esc, ruby, toast, buzz, speak, canSpeak, openWordSheet } from '../ui.js';
import { review as schedule, preview, RATING, STATE, newCard } from '../srs.js';
import { session, bumpToday, touchStreak, enrollLevel, newAllowance, inventory, today as todayCounts } from '../progress.js';

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
export async function learn({ params, view, setChrome, go }) {
  const lv = params[0];
  setChrome({ title: `Learn · ${lv}`, back: true });

  const [list, inv, counts] = await Promise.all([data.vocab(lv), inventory(), todayCounts()]);
  const base = await store.setting('newPerDay', 10);

  // Enrol only what today's session can actually use. Enrolling a whole level
  // up front put 3,267 N1 words into a beginner's new-card queue after a single
  // curious tap; the rest are added as they are needed.
  const alreadyNew = (await store.all('cards'))
    .filter((c) => c.state === STATE.NEW && (c.lv === lv || c.deck === `level:${lv}`)).length;
  if (alreadyNew < base * 3) await enrollLevel(lv, list, alreadyNew + base * 3);

  const allowance = newAllowance(inv.due, base) - counts.new;
  if (allowance <= 0) {
    view.innerHTML = `<div class="empty"><div class="empty-mark">休</div>
      <p><b>New words are paused.</b></p>
      <p class="small" style="margin-top:6px">You have ${inv.due} reviews waiting. Clearing them is worth more than new words right now.</p>
      <a class="btn btn-primary" style="margin-top:16px" href="#/review">Do reviews</a></div>`;
    return;
  }

  const cards = (await store.all('cards'))
    .filter((c) => c.state === STATE.NEW && (c.lv === lv || c.deck === `level:${lv}`))
    .sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0))
    .slice(0, allowance);

  if (!cards.length) {
    view.innerHTML = `<div class="empty"><div class="empty-mark">完</div>
      <p>You have met every ${lv} word.</p>
      <a class="btn btn-primary" style="margin-top:16px" href="#/review">Review them</a></div>`;
    return;
  }

  const byId = new Map(list.map((w) => [w.id, w]));
  let i = 0;

  const draw = () => {
    if (i >= cards.length) {
      view.innerHTML = `<div class="empty"><div class="empty-mark">✓</div>
        <p><b>${cards.length} new words learned.</b></p>
        <p class="small" style="margin-top:6px">They will come back for review shortly — that is when they stick.</p>
        <a class="btn btn-primary btn-block" style="margin-top:18px" href="#/review">Start reviewing</a>
        <a class="btn btn-block btn-ghost" style="margin-top:8px" href="#/today">Done for now</a></div>`;
      return;
    }
    const card = cards[i];
    const w = byId.get(card.vocabId);
    if (!w) { i++; return draw(); }
    const ex = w.x?.[0];

    view.innerHTML = `
      <div class="review-top">
        <span>${i + 1} / ${cards.length}</span>
        <span class="bar" style="flex:1"><i style="width:${(i / cards.length) * 100}%"></i></span>
      </div>
      <div class="card" style="margin-top:12px;text-align:center;padding:26px 16px">
        ${wordFace(w)}
        <div class="jp-md muted" lang="ja" style="margin-top:2px">${esc(w.r)}</div>
        <div style="font-size:18px;font-weight:600;margin-top:14px">${esc(w.m.slice(0, 3).join(', '))}</div>
        <div style="margin-top:10px">
          <span class="lv-chip lv-${w.lv}">${w.lv}</span>
          ${w.cls ? `<span class="pos-tag">${esc(w.cls)}</span>` : ''}
          ${w.fq ? `<span class="pos-tag">#${w.fq} common</span>` : ''}
        </div>
        ${canSpeak() ? `<button class="btn btn-sm" id="say" style="margin-top:14px">🔊 Hear it</button>` : ''}
      </div>

      ${ex ? `<div class="card" style="margin-top:10px">
        <div class="small faint" style="margin-bottom:6px">In a sentence</div>
        <div class="jp-md" lang="ja">${esc(ex[0])}</div>
        <div class="ex-en">${esc(ex[1])}</div>
      </div>` : ''}

      <div class="row" style="margin-top:14px;gap:8px">
        <button class="btn btn-block" id="know">I knew this</button>
        <button class="btn btn-block btn-primary" id="next">Got it</button>
      </div>
      <button class="btn btn-block btn-ghost" style="margin-top:8px" id="detail">Full details</button>
    `;

    view.querySelector('#say')?.addEventListener('click', () => speak(w.r || w.w));
    view.querySelector('#detail').addEventListener('click', () => openWordSheet(w.w));

    const advance = async (rating) => {
      const { card: next, log } = schedule(card, rating);
      await store.put('cards', next);
      await store.put('reviews', log);
      await bumpToday({ new: 1 });
      buzz();
      i++;
      draw();
    };
    view.querySelector('#next').addEventListener('click', () => advance(RATING.GOOD));
    view.querySelector('#know').addEventListener('click', () => advance(RATING.EASY));

    if (w.r) speak(w.r);
  };

  await touchStreak();
  draw();
}

// ---------------------------------------------------------------- Review
export async function review({ params, view, setChrome, go }) {
  const deck = params[0] || null;
  setChrome({ title: deck ? `Review · ${deck.replace('level:', '')}` : 'Review', back: true });

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

  let i = 0, shown = false, right = 0;
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
    const savedRow = savedRows.get(card.word);

    const front = w ? w.w : (card.word || '?');
    const reading = w?.r || card.reading || savedRow?.reading || '';
    const meaning = w ? w.m.slice(0, 3).join(', ') : (savedRow?.meaning || '');
    const segs = w?.f;
    const showFuri = furiSetting === 'always';
    const ex = w?.x?.[0];
    const iv = preview(card);

    view.innerHTML = `
      <div class="review-wrap">
        <div class="review-top">
          <span>${i + 1} / ${queue.length}</span>
          <span class="bar" style="flex:1"><i style="width:${(i / queue.length) * 100}%"></i></span>
          ${w ? `<span class="lv-chip lv-${w.lv}">${w.lv}</span>` : ''}
        </div>

        <div class="review-card" id="face">
          <div class="${showFuri ? '' : 'no-furi'}" id="jp">
            <div class="jp-lg" lang="ja">${segs ? ruby(segs, front) : esc(front)}</div>
          </div>
          ${shown ? `
            <div class="jp-md muted" lang="ja">${esc(reading)}</div>
            <div style="font-size:19px;font-weight:650">${esc(meaning)}</div>
            ${ex ? `<div style="margin-top:8px;border-top:1px solid var(--line);padding-top:10px">
                <div class="jp-sm" lang="ja">${esc(ex[0])}</div>
                <div class="ex-en">${esc(ex[1])}</div></div>` : ''}
          ` : `<div class="small faint">tap to reveal</div>`}
        </div>

        ${shown ? `
          <div class="review-grade">
            ${GRADES.map((g) => `<button class="grade" data-g="${g.g}">
              ${g.label}<small>${esc(iv[Object.keys(RATING).find((k) => RATING[k] === g.g)])}</small>
            </button>`).join('')}
          </div>
        ` : `<button class="btn btn-primary btn-block reveal-btn" id="reveal">Show answer</button>`}
      </div>
    `;

    const reveal = () => { if (!shown) { shown = true; draw(); if (reading) speak(reading); } };
    view.querySelector('#reveal')?.addEventListener('click', reveal);
    view.querySelector('#face').addEventListener('click', (e) => {
      if (shown) { if (w) openWordSheet(w.w); return; }
      reveal();
    });

    view.querySelectorAll('.grade').forEach((b) => b.addEventListener('click', async () => {
      const g = +b.dataset.g;
      const wasNew = card.state === STATE.NEW;
      const { card: next, log } = schedule(card, g);
      await store.put('cards', next);
      await store.put('reviews', log);
      // A new card met here still counts against the daily new-card allowance,
      // otherwise tapping "Keep going" walks straight past the throttle.
      await bumpToday({ reviews: 1, correct: g > 1 ? 1 : 0, ...(wasNew ? { new: 1 } : {}) });
      await credit();
      if (g > 1) right++;
      buzz(g === 1 ? 20 : 8);
      i++; shown = false;
      draw();
    }));

    // Swipe: right = Good, left = Again. Vertical drags still scroll.
    let x0 = null, y0 = null;
    const face = view.querySelector('#face');
    face.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    face.addEventListener('touchend', (e) => {
      if (x0 === null || !shown) { x0 = null; return; }
      const dx = e.changedTouches[0].clientX - x0;
      const dy = Math.abs(e.changedTouches[0].clientY - y0);
      x0 = null;
      if (Math.abs(dx) < 70 || dy > 50) return;
      view.querySelector(`.grade[data-g="${dx > 0 ? RATING.GOOD : RATING.AGAIN}"]`)?.click();
    }, { passive: true });
  };

  draw();
}
