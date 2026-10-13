// Grammar, taught rather than listed.
//
// This used to be one long reference list with a "practise" button that blanked
// a word out of the first example. It now works the way words and kanji do: the
// level hands you the next few points in teaching order, each one is explained
// before you are asked anything, you practise it in real sentences, and it then
// enters the same SRS deck as everything else.
//
// The ordering and the question generation live in js/grammar.js, which has no
// DOM so it can be tested directly.
import * as data from '../data.js';
import * as store from '../store.js';
import { esc, toast, buzz, speak, canSpeak, openSheet, tappable, bindWordTaps } from '../ui.js';
import { syllabus, questions, cardKey, deckOf } from '../grammar.js';
import { review as schedule, RATING, STATE, newCard } from '../srs.js';
import { bumpToday, touchStreak, remainingNew, stage } from '../progress.js';
import { swipeable, swipeHint } from '../swipe.js';

const CHEV = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** The level's points in teaching order, plus the card each one has (if any). */
async function load(lv) {
  const [list, cards] = await Promise.all([data.grammar(lv), store.all('cards')]);
  const byKey = new Map(cards.map((c) => [c.key, c]));
  const syl = syllabus(list).map((g) => ({ ...g, card: byKey.get(cardKey(g.gid)) || null }));
  return { list, syl };
}

const dueNow = (g) => g.card && g.card.state !== STATE.NEW && g.card.due <= Date.now();

// ---------------------------------------------------------------- hub
export async function hub({ params, view, setChrome }) {
  const lv = params[0];
  setChrome({ title: `${lv} grammar`, back: true });

  const [{ list, syl }, rem] = await Promise.all([load(lv), remainingNew('grammar')]);
  const met = syl.filter((g) => g.card);
  const due = syl.filter(dueNow);
  const next = syl.filter((g) => !g.card).slice(0, 3);
  const pct = syl.length ? Math.round((met.length / syl.length) * 100) : 0;

  view.innerHTML = `
    <div class="card lv-${lv}" style="border-left:4px solid var(--lv)">
      <div class="spread">
        <div>
          <div style="font-weight:700">${met.length} of ${syl.length} points met</div>
          <div class="small muted">${esc(lv)} grammar, easiest first</div>
        </div>
        <div class="ring lv-${lv}" style="--p:${pct}"><span>${pct}%</span></div>
      </div>
      <div class="bar" style="margin-top:12px"><i style="width:${pct}%"></i></div>
    </div>

    ${due.length ? `<a class="cta" href="#/review/${deckOf(lv)}" style="margin-top:12px">
      <span class="cta-n">${due.length}</span>
      <span><span class="cta-t">Grammar due</span><br>
      <span class="cta-s">Points you have met, ready to come back</span></span></a>` : ''}

    <div class="tiles" style="margin-top:10px">
      ${rem.left > 0 && next.length ? `<a class="tile" href="#/learn/${lv}/grammar">
        <span class="tile-ico">文</span>
        <span class="tile-main"><span class="tile-title">Learn ${Math.min(rem.left, next.length)} new point${Math.min(rem.left, next.length) === 1 ? '' : 's'}</span>
          <span class="tile-sub">Next up: ${esc(next[0].pattern)}</span></span>
        <span class="tile-end">${CHEV}</span></a>`
      : `<div class="tile" style="opacity:.6">
        <span class="tile-ico">文</span>
        <span class="tile-main"><span class="tile-title">${next.length ? `Today's grammar done ✓` : 'Every point met'}</span>
          <span class="tile-sub">${next.length
            ? `${rem.doneToday} of ${rem.cap} today · <a href="#/learn/${lv}/grammar">carry on anyway</a>`
            : `All ${syl.length} ${lv} points are in your reviews`}</span></span></div>`}

      <a class="tile" href="#/grammar/${lv}/all">
        <span class="tile-ico">覧</span>
        <span class="tile-main"><span class="tile-title">Browse all ${list.length}</span>
          <span class="tile-sub">Look anything up, in teaching order</span></span>
        <span class="tile-end">${CHEV}</span></a>
    </div>

    ${next.length ? `<h2 class="section-title">Coming next</h2>
      <div class="list">
        ${next.map((g) => `<a class="wrow" href="#/grammar/${lv}/${g.id}">
          <span class="wrow-main"><span class="wrow-jp" lang="ja" style="font-size:16px">${esc(g.pattern)}</span>
          <span class="wrow-en">${esc(g.meaning)}</span></span>
          <span class="tile-end">${CHEV}</span></a>`).join('')}
      </div>` : ''}

    ${met.length ? `<h2 class="section-title">Learned</h2>
      <div class="list">
        ${met.slice(-8).reverse().map((g) => `<a class="wrow" href="#/grammar/${lv}/${g.id}">
          <span class="wrow-main"><span class="wrow-jp" lang="ja" style="font-size:16px">${esc(g.pattern)}</span>
          <span class="wrow-en">${esc(g.meaning)}</span></span>
          <span class="tile-end small"><span class="pos-tag">${stage(g.card)}</span></span></a>`).join('')}
      </div>` : ''}`;
}

// ---------------------------------------------------------------- browse
export async function all({ params, view, setChrome }) {
  const lv = params[0];
  setChrome({ title: `All ${lv} grammar`, back: true });
  const { list, syl } = await load(lv);
  const scheduled = new Map(syl.map((g) => [g.gid, g]));

  view.innerHTML = `
    <p class="small faint" style="margin:0 2px 12px">${list.length} points, in teaching order.</p>
    <div class="list">
      ${list.map((g) => {
        const s = scheduled.get(g.gid);
        return `<a class="wrow" href="#/grammar/${lv}/${g.id}">
          <span class="wrow-main">
            <span class="wrow-jp" lang="ja" style="font-size:17px">${esc(g.pattern)}</span>
            <span class="wrow-en">${esc(g.meaning)}</span>
          </span>
          <span class="tile-end small">${s?.card ? `<span class="pos-tag">${stage(s.card)}</span>` : ''}${CHEV}</span>
        </a>`;
      }).join('')}
    </div>`;
}

// ---------------------------------------------------------------- one point
/** The explanation, as markup, shared by the learn screen and the review sheet. */
export function explain(g, { heading = true } = {}) {
  return `
    ${heading ? `<h2 class="jp-md" lang="ja" style="font-weight:700">${esc(g.pattern)}</h2>
      <p style="font-size:17px;margin-top:4px">${esc(g.meaning)}</p>
      <div style="margin-top:10px">
        <span class="lv-chip lv-${g.lv}">${g.lv}</span>
        ${g.formality ? `<span class="pos-tag">${esc(g.formality)}</span>` : ''}
      </div>` : ''}

    ${g.formation ? `<h3 class="section-title">How to build it</h3>
      <div class="card jp-sm" lang="ja">${esc(g.formation)}</div>` : ''}

    ${g.detail ? `<h3 class="section-title">What it means</h3><p class="muted">${esc(g.detail)}</p>` : ''}

    ${g.notes?.length ? `<h3 class="section-title">Watch out</h3>
      <ul class="muted small" style="margin:0;padding-left:18px;display:grid;gap:6px">
        ${g.notes.map((n) => `<li>${esc(n)}</li>`).join('')}
      </ul>` : ''}

    ${g.x?.length ? `<h3 class="section-title">Examples</h3>
      <div class="stack" id="gx">
        ${g.x.map(([ja, en]) => `<div class="card">
          <div class="jp-md" lang="ja">${tappable(ja)}</div>
          <div class="ex-en">${esc(en)}</div>
          ${canSpeak() ? `<button class="btn btn-sm" data-say="${esc(ja)}" style="margin-top:8px">🔊</button>` : ''}
        </div>`).join('')}
      </div>` : ''}`;
}

/** Wire the speak buttons and word taps that `explain()` renders. */
function bindExplain(root) {
  const ex = root.querySelector('#gx');
  if (!ex) return;
  bindWordTaps(ex);
  ex.addEventListener('click', (e) => {
    const say = e.target.closest('[data-say]');
    if (say) speak(say.dataset.say);
  });
}

export function openGrammarSheet(g) {
  const body = openSheet(`${explain(g)}
    <button class="btn btn-block btn-ghost" style="margin-top:16px" data-close>Close</button>`);
  bindExplain(body);
  return body;
}

export async function point({ params, view, setChrome, signal }) {
  const [lv, idStr] = params;
  const { list, syl } = await load(lv);
  const g = list.find((x) => x.id === +idStr);
  if (!g) { view.innerHTML = `<div class="empty"><p>Not found.</p></div>`; return; }
  setChrome({ title: `${lv} grammar`, back: true });

  const related = (g.related || []).map((rid) => list.find((x) => x.gid === rid)).filter(Boolean);
  const card = syl.find((x) => x.gid === g.gid)?.card || null;

  view.innerHTML = `
    ${explain(g)}

    ${related.length ? `<h3 class="section-title">Compare with</h3>
      <div class="list">${related.map((r) => `<a class="wrow" href="#/grammar/${r.lv}/${r.id}">
        <span class="wrow-main"><span class="wrow-jp" lang="ja" style="font-size:16px">${esc(r.pattern)}</span>
        <span class="wrow-en">${esc(r.meaning)}</span></span><span class="tile-end">${CHEV}</span></a>`).join('')}</div>` : ''}

    <button class="btn btn-primary btn-block" id="practise" style="margin-top:18px">Practise this point</button>
    <p class="small faint center" style="margin-top:10px">
      ${card ? `In your reviews · ${stage(card)}` : 'Not in your reviews yet'}</p>
    ${g.draft ? `<p class="small faint center" style="margin-top:10px">
      This explanation is community-curated and not yet native-reviewed.</p>` : ''}`;

  bindExplain(view);
  view.querySelector('#practise').addEventListener('click', () => {
    const qs = questions(g, syl);
    if (!qs.length) return toast('No practice for this point yet');
    const body = openSheet(`<div id="qbox"></div>
      <button class="btn btn-block btn-ghost" style="margin-top:12px" data-close>Close</button>`);
    const box = body.querySelector('#qbox');
    runQuestions(box, g, qs, {
      signal,
      // Practice reached from the reference page is no-stakes, like the word
      // drills: it does not touch this point's schedule.
      onDone: (wrong) => {
        box.innerHTML = `<div class="empty" style="padding:24px 8px">
          <div class="empty-mark">${wrong ? '△' : '✓'}</div>
          <p><b>${qs.length - wrong} of ${qs.length} right.</b></p>
          <p class="small" style="margin-top:6px">Practice here is free — your review schedule is untouched.</p></div>`;
      },
    });
  }, { signal });
}

// ---------------------------------------------------------------- learn
/**
 * Teach the next few points: explain, practise, schedule. One point at a time,
 * and how the practice goes is the grade — a point you rebuilt in every
 * sentence without a stumble is not one you need to see again tomorrow.
 */
export async function learn({ params, query, view, setChrome, signal }) {
  const lv = params[0];
  setChrome({ title: `Learn grammar · ${lv}`, back: true });

  const { syl } = await load(lv);
  const base = await store.setting('newPerDay', 10);
  const rem = await remainingNew('grammar');
  const more = query?.get('more') === '1';
  const allowance = more ? base : rem.left;
  const fresh = syl.filter((g) => !g.card);

  if (!fresh.length) {
    view.innerHTML = `<div class="empty"><div class="empty-mark">完</div>
      <p><b>You have met every ${lv} grammar point.</b></p>
      <a class="btn btn-primary" style="margin-top:16px" href="#/review/${deckOf(lv)}">Review them</a>
      <a class="btn btn-block btn-ghost" style="margin-top:8px" href="#/grammar/${lv}/all">Browse all</a></div>`;
    return;
  }

  if (allowance <= 0) {
    const backlog = rem.reason === 'backlog';
    view.innerHTML = `<div class="empty"><div class="empty-mark">${backlog ? '休' : '✓'}</div>
      <p><b>${backlog ? 'New grammar is paused.' : `That is today's grammar done — ${rem.doneToday} of ${rem.cap}.`}</b></p>
      <p class="small" style="margin-top:6px">${backlog
        ? `You have ${rem.due} review${rem.due === 1 ? '' : 's'} waiting. Grammar sticks far better once those are clear.`
        : 'A grammar point needs a few days of reviews before the next one lands on solid ground.'}</p>
      ${backlog
        ? `<a class="btn btn-primary" style="margin-top:16px" href="#/review">Do reviews</a>`
        : `<a class="btn btn-primary" style="margin-top:16px" href="#/learn/${lv}/grammar?more=1">Learn ${base} more anyway</a>`}
      <a class="btn btn-block btn-ghost" style="margin-top:8px" href="#/grammar/${lv}">Back to grammar</a></div>`;
    return;
  }

  const points = fresh.slice(0, allowance);
  let i = 0;
  let learned = 0;

  const finish = () => {
    view.innerHTML = `<div class="empty"><div class="empty-mark">✓</div>
      <p><b>${learned} grammar point${learned === 1 ? '' : 's'} learned.</b></p>
      <p class="small" style="margin-top:6px">They are in your reviews now — that is where grammar turns into something you use without thinking.</p>
      <a class="btn btn-primary btn-block" style="margin-top:18px" href="#/review">Start reviewing</a>
      <a class="btn btn-block btn-ghost" style="margin-top:8px" href="#/grammar/${lv}">Back to grammar</a></div>`;
  };

  /** Put the point into the SRS at the grade the practice earned. */
  const record = async (g, rating) => {
    const card = newCard(cardKey(g.gid), deckOf(lv), {
      word: g.pattern, gid: g.gid, pattern: g.pattern, meaning: g.meaning, lv, ord: g.ord,
    });
    const { card: next, log } = schedule(card, rating);
    await store.put('cards', next);
    await store.put('reviews', log);
    await bumpToday({ newGrammar: 1 });
    learned++;
    window.dispatchEvent(new CustomEvent('nihongo:progress'));
  };

  const teach = () => {
    if (signal?.aborted) return;
    if (i >= points.length) return finish();
    const g = points[i];
    const qs = questions(g, syl);

    view.innerHTML = `
      <div class="review-top">
        <span>${i + 1} / ${points.length}</span>
        <span class="bar" style="flex:1"><i style="width:${(i / points.length) * 100}%"></i></span>
        <span class="lv-chip lv-${g.lv}">${g.lv}</span>
      </div>

      <div class="card" id="face" style="margin-top:12px">
        <div class="jp-md" lang="ja" style="font-weight:700">${esc(g.pattern)}</div>
        <p style="font-size:17px;margin-top:6px">${esc(g.meaning)}</p>
        ${g.formality ? `<div style="margin-top:8px"><span class="pos-tag">${esc(g.formality)}</span></div>` : ''}
        ${g.formation ? `<div class="card jp-sm" lang="ja" style="margin-top:10px;background:var(--bg-soft)">${esc(g.formation)}</div>` : ''}
      </div>

      <div class="act-bar">
        <button class="btn" id="know">I know this</button>
        <button class="btn btn-block btn-primary" id="go">${qs.length ? `Practise · ${qs.length}` : 'Got it'}</button>
      </div>
      ${i < 2 ? swipeHint('I know this', 'go back') : ''}

      ${g.detail ? `<h3 class="section-title">What it means</h3><p class="muted">${esc(g.detail)}</p>` : ''}
      ${g.notes?.length ? `<h3 class="section-title">Watch out</h3>
        <ul class="muted small" style="margin:0;padding-left:18px;display:grid;gap:6px">
          ${g.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${g.x?.length ? `<h3 class="section-title">Examples</h3>
        <div class="stack" id="gx">
          ${g.x.map(([ja, en]) => `<div class="card">
            <div class="jp-md" lang="ja">${tappable(ja)}</div>
            <div class="ex-en">${esc(en)}</div>
            ${canSpeak() ? `<button class="btn btn-sm" data-say="${esc(ja)}" style="margin-top:8px">🔊</button>` : ''}
          </div>`).join('')}
        </div>` : ''}`;

    bindExplain(view);

    const knew = async () => { await record(g, RATING.EASY); i++; teach(); };
    const practise = async () => {
      if (!qs.length) { await record(g, RATING.GOOD); i++; teach(); return; }
      runQuestions(view, g, qs, {
        signal,
        progress: `${i + 1} / ${points.length}`,
        onDone: async (wrong) => {
          let rating = RATING.GOOD;
          if (wrong === 1) rating = RATING.HARD;
          else if (wrong > 1) rating = RATING.AGAIN;
          await record(g, rating);
          i++;
          teach();
        },
        onBack: () => teach(),
      });
    };
    // You only ever reach point i by having recorded the ones before it, so
    // stepping back means taking the previous point out of the deck again —
    // otherwise practising it a second time would reset its schedule and count
    // it twice towards the day.
    const back = async () => {
      if (i === 0) return toast('This is the first point');
      i--;
      const key = cardKey(points[i].gid);
      await store.del('cards', key);
      await store.delLastReview(key);
      await bumpToday({ newGrammar: -1 });
      learned = Math.max(0, learned - 1);
      teach();
    };

    view.querySelector('#know').addEventListener('click', knew, { signal });
    view.querySelector('#go').addEventListener('click', practise, { signal });
    swipeable(view.querySelector('#face'), {
      onForward: knew, onBack: back, forwardLabel: 'I know this', backLabel: 'back', signal,
    });
  };

  await touchStreak();
  teach();
}

// ---------------------------------------------------------------- practice
const BLANK = `<span class="blank" aria-label="blank"></span>`;

/**
 * Run a point's questions in `root`, then hand back how many were missed.
 * Used by the learn flow (in the view) and by "practise this point" (in a sheet).
 */
function runQuestions(root, g, qs, { signal, onDone, onBack, progress = '' } = {}) {
  let qi = 0, wrong = 0, answered = false;

  const ask = () => {
    if (signal?.aborted) return;
    if (qi >= qs.length) { onDone?.(wrong); return; }
    const q = qs[qi];
    answered = false;

    const prompt = {
      cloze: 'Fill the blank',
      meaning: 'What does this pattern mean?',
      pick: 'Which one says this?',
    }[q.kind];

    let face = `<div style="font-size:18px;font-weight:650">${esc(q.en)}</div>`;
    if (q.kind === 'cloze') {
      face = `<div class="jp-md" lang="ja">${esc(q.before)}${BLANK}${esc(q.after)}</div>
        <div class="ex-en">${esc(q.en)}</div>`;
    } else if (q.kind === 'meaning') {
      face = `<div class="jp-md" lang="ja">${esc(q.pattern)}</div>`;
    }

    const ja = q.kind !== 'meaning';

    root.innerHTML = `
      <div class="review-top">
        <span>${progress ? `${esc(progress)} · ` : ''}q${qi + 1}/${qs.length}</span>
        <span class="bar" style="flex:1"><i style="width:${(qi / qs.length) * 100}%"></i></span>
        <span class="jp-sm" lang="ja" style="font-size:13px">${esc(g.pattern.slice(0, 18))}</span>
      </div>

      <div class="review-card" style="margin-top:10px;min-height:auto;padding:22px 16px">
        <div class="small faint">${prompt}</div>
        ${face}
      </div>

      <div class="stack" style="margin-top:12px" id="opts">
        ${q.options.map((o) => `<button class="btn btn-block${ja ? ' jp-sm' : ''}" ${ja ? 'lang="ja"' : ''}
          data-o="${esc(o)}" style="min-height:54px;white-space:normal;line-height:1.35">${esc(o)}</button>`).join('')}
      </div>
      <p class="small center" id="fb" style="margin-top:12px;min-height:22px"></p>
      <button class="btn btn-block btn-ghost" id="skip" style="margin-top:4px">Explain it again</button>`;

    root.querySelector('#opts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-o]');
      if (!b || answered) return;
      answered = true;
      const ok = b.dataset.o === q.answer;
      if (!ok) wrong++;
      b.style.borderColor = ok ? 'var(--green)' : 'var(--accent)';
      if (!ok) {
        const right = root.querySelector(`[data-o="${CSS.escape(q.answer)}"]`);
        if (right) right.style.borderColor = 'var(--green)';
      }
      root.querySelector('#fb').innerHTML = ok
        ? `<span style="color:var(--green)">Right.</span> ${q.full ? `<span lang="ja">${esc(q.full)}</span>` : ''}`
        : `<span style="color:var(--accent)">Not that one.</span> ${q.kind === 'cloze'
            ? `<span lang="ja">${esc(q.full)}</span>`
            : `<b>${esc(q.answer)}</b>`}`;
      buzz(ok ? 8 : 20);
      if (q.full) speak(q.full);
      else if (q.kind === 'pick') speak(q.answer);
      setTimeout(() => { if (!signal?.aborted) { qi++; ask(); } }, ok ? 900 : 2200);
    }, { signal });

    root.querySelector('#skip').addEventListener('click', () => {
      if (onBack) onBack();
      else openGrammarSheet(g);
    }, { signal });
  };

  ask();
}
