// Browsing surfaces: word list, kanji, grammar, kana, conjugation drill.
import * as data from '../data.js';
import * as store from '../store.js';
import { esc, ruby, toast, buzz, speak, canSpeak, openWordSheet, openSheet } from '../ui.js';
import { stage } from '../progress.js';
import { runDrill, modeBar } from './drill.js';

const CHEV = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------------------------------------------------------------- words
export async function words({ params, view, setChrome, signal }) {
  const lv = params[0];
  const mode = params[1] || 'list';
  setChrome({ title: `${lv} words`, back: true });
  const [list, cards] = await Promise.all([data.vocab(lv), store.all('cards')]);
  const byVocab = new Map(cards.filter((c) => c.vocabId != null).map((c) => [c.vocabId, c]));

  if (mode !== 'list') {
    return runDrill({ mode, kind: 'vocab', items: list, view, signal, lv, base: `/words/${lv}` });
  }

  let q = '';
  const PAGE = 60;
  let shown = PAGE;

  const render = () => {
    const filtered = q
      ? list.filter((w) => w.w.includes(q) || w.r.includes(q) || w.m.some((m) => m.toLowerCase().includes(q.toLowerCase())))
      : list;
    const slice = filtered.slice(0, shown);
    view.querySelector('#list').innerHTML = slice.map((w) => {
      const st = stage(byVocab.get(w.id));
      return `<button class="wrow" data-id="${w.id}">
        <span class="wrow-main">
          <span class="wrow-jp" lang="ja">${w.f ? ruby(w.f, w.w) : esc(w.w)}</span>
          <span class="wrow-en">${esc(w.m.slice(0, 3).join(', '))}</span>
        </span>
        <span class="tile-end small">${st === 'new' ? '' : `<span class="pos-tag">${st}</span>`}</span>
      </button>`;
    }).join('') || `<p class="muted center" style="padding:30px">No matches.</p>`;
    view.querySelector('#more').hidden = filtered.length <= shown;
    view.querySelector('#count').textContent = `${filtered.length} words`;
  };

  view.innerHTML = `
    ${modeBar('list', `/words/${lv}`)}
    <input class="search" id="q" type="search" placeholder="Search Japanese or English"
      autocomplete="off" style="margin-top:12px">
    <p class="small faint" style="margin:10px 2px" id="count"></p>
    <div class="list" id="list"></div>
    <button class="btn btn-block btn-ghost" id="more" style="margin-top:12px">Show more</button>
  `;

  view.querySelector('#q').addEventListener('input', (e) => { q = e.target.value.trim(); shown = PAGE; render(); });
  view.querySelector('#more').addEventListener('click', () => { shown += PAGE; render(); });
  view.querySelector('#list').addEventListener('click', (e) => {
    const row = e.target.closest('[data-id]');
    if (!row) return;
    const w = list.find((x) => x.id === +row.dataset.id);
    if (w) openWordSheet(w.w);
  });
  render();
}

// ---------------------------------------------------------------- kanji
export async function kanjiList({ params, view, setChrome, signal }) {
  const lv = params[0];
  const mode = params[1] || 'list';
  setChrome({ title: `${lv} kanji`, back: true });
  const [list, vocabList] = await Promise.all([data.kanji(lv), data.vocab(lv)]);
  const byId = new Map(vocabList.map((w) => [w.id, w]));

  if (mode !== 'list') {
    return runDrill({ mode, kind: 'kanji', items: list, view, signal, lv, base: `/kanji/${lv}` });
  }

  view.innerHTML = `
    ${modeBar('list', `/kanji/${lv}`)}
    <p class="small faint" style="margin:12px 2px">${list.length} characters, most common first.</p>
    <div class="kana-grid" style="grid-template-columns:repeat(4,minmax(0,1fr))">
      ${list.map((k) => `<button class="kana-cell" data-c="${esc(k.c)}">
        <span class="k" lang="ja" style="font-size:28px">${esc(k.c)}</span>
        <span class="r">${esc((k.m[0] || '').slice(0, 10))}</span>
      </button>`).join('')}
    </div>`;

  view.addEventListener('click', (e) => {
    const cell = e.target.closest('[data-c]');
    if (!cell) return;
    const k = list.find((x) => x.c === cell.dataset.c);
    if (!k) return;
    const examples = (k.v || []).map((id) => byId.get(id)).filter(Boolean).slice(0, 8);
    openSheet(`
      <div class="center">
        <div class="jp-lg" lang="ja" style="font-size:72px">${esc(k.c)}</div>
        <div class="muted">${esc(k.m.join(', '))}</div>
      </div>
      <div class="row" style="justify-content:center;gap:8px;margin:12px 0">
        <span class="lv-chip lv-${k.lv}">${k.lv}</span>
        ${k.s ? `<span class="pos-tag">${k.s} strokes</span>` : ''}
        ${k.g ? `<span class="pos-tag">grade ${k.g}</span>` : ''}
        ${k.fq ? `<span class="pos-tag">#${k.fq}</span>` : ''}
      </div>
      <div class="card">
        <div class="spread" style="padding:5px 0"><span class="small muted">On'yomi</span>
          <span class="jp-sm" lang="ja">${esc(k.on.join('、') || '—')}</span></div>
        <div class="spread" style="padding:5px 0;border-top:1px solid var(--line)"><span class="small muted">Kun'yomi</span>
          <span class="jp-sm" lang="ja">${esc(k.kun.join('、') || '—')}</span></div>
      </div>
      ${k.comp?.length ? `<h3 class="section-title">Built from</h3>
        <div class="row" style="flex-wrap:wrap;gap:6px">
          ${k.comp.map((c) => `<span class="pos-tag" lang="ja" style="font-size:14px">${esc(c.r)}${c.m ? ` <span class="faint">${esc(c.m)}</span>` : ''}</span>`).join('')}
        </div>` : ''}
      ${examples.length ? `<h3 class="section-title">Words using it</h3>
        <div class="list">
          ${examples.map((w) => `<button class="wrow" data-word="${esc(w.w)}">
            <span class="wrow-main"><span class="wrow-jp" lang="ja">${w.f ? ruby(w.f, w.w) : esc(w.w)}</span>
            <span class="wrow-en">${esc(w.m.slice(0, 2).join(', '))}</span></span></button>`).join('')}
        </div>` : ''}
      <button class="btn btn-block btn-ghost" style="margin-top:14px" data-close>Close</button>
    `).addEventListener('click', (ev) => {
      const w = ev.target.closest('[data-word]');
      if (w) openWordSheet(w.dataset.word);
    });
  });
}

// ---------------------------------------------------------------- grammar
export async function grammarList({ params, view, setChrome, signal }) {
  const lv = params[0];
  setChrome({ title: `${lv} grammar`, back: true });
  const list = await data.grammar(lv);
  view.innerHTML = `
    <p class="small faint" style="margin:0 2px 12px">${list.length} points, in teaching order.</p>
    <div class="list">
      ${list.map((g) => `<a class="wrow" href="#/grammar/${lv}/${g.id}">
        <span class="wrow-main">
          <span class="wrow-jp" lang="ja" style="font-size:17px">${esc(g.pattern)}</span>
          <span class="wrow-en">${esc(g.meaning)}</span>
        </span>
        <span class="tile-end">${CHEV}</span>
      </a>`).join('')}
    </div>`;
}

export async function grammarPoint({ params, view, setChrome, signal }) {
  const [lv, idStr] = params;
  const list = await data.grammar(lv);
  const g = list.find((x) => x.id === +idStr);
  if (!g) { view.innerHTML = `<div class="empty"><p>Not found.</p></div>`; return; }
  setChrome({ title: lv + ' grammar', back: true });

  const related = (g.related || [])
    .map((rid) => list.find((x) => x.gid === rid))
    .filter(Boolean);

  view.innerHTML = `
    <h2 class="jp-md" lang="ja" style="font-weight:700">${esc(g.pattern)}</h2>
    <p style="font-size:17px;margin-top:4px">${esc(g.meaning)}</p>
    <div style="margin-top:10px">
      <span class="lv-chip lv-${g.lv}">${g.lv}</span>
      ${g.formality ? `<span class="pos-tag">${esc(g.formality)}</span>` : ''}
    </div>

    ${g.formation ? `<h3 class="section-title">How to build it</h3>
      <div class="card jp-sm" lang="ja">${esc(g.formation)}</div>` : ''}

    ${g.detail ? `<h3 class="section-title">What it means</h3><p class="muted">${esc(g.detail)}</p>` : ''}

    ${g.notes?.length ? `<h3 class="section-title">Watch out</h3>
      <ul class="muted small" style="margin:0;padding-left:18px;display:grid;gap:6px">
        ${g.notes.map((n) => `<li>${esc(n)}</li>`).join('')}
      </ul>` : ''}

    ${g.x?.length ? `<h3 class="section-title">Examples</h3>
      <div class="stack">
        ${g.x.map(([ja, en]) => `<div class="card">
          <div class="jp-md" lang="ja">${esc(ja)}</div>
          <div class="ex-en">${esc(en)}</div>
        </div>`).join('')}
      </div>` : ''}

    ${related.length ? `<h3 class="section-title">Compare with</h3>
      <div class="list">${related.map((r) => `<a class="wrow" href="#/grammar/${r.lv}/${r.id}">
        <span class="wrow-main"><span class="wrow-jp" lang="ja" style="font-size:16px">${esc(r.pattern)}</span>
        <span class="wrow-en">${esc(r.meaning)}</span></span><span class="tile-end">${CHEV}</span></a>`).join('')}</div>` : ''}

    <button class="btn btn-primary btn-block" id="practice" style="margin-top:18px">Practise this point</button>
    ${g.draft ? `<p class="small faint center" style="margin-top:14px">
      This explanation is community-curated and not yet native-reviewed.</p>` : ''}
  `;

  view.querySelector('#practice').addEventListener('click', () => cloze(g));
}

/** Cloze drill: blank the pattern out of a real example and rebuild it. */
function cloze(g) {
  const ex = (g.x || [])[0];
  if (!ex) return toast('No example to practise with');
  // Blank the longest literal Japanese run of the pattern that appears in the sentence.
  const bits = (g.pattern.match(/[぀-ヿ一-鿿]+/g) || []).sort((a, b) => b.length - a.length);
  const target = bits.find((b) => ex[0].includes(b));
  const blanked = target ? ex[0].replace(target, '［　　］') : ex[0];

  const distractors = ['ので', 'のに', 'から', 'ため', 'けど', 'まで', 'だけ', 'しか']
    .filter((d) => d !== target).sort(() => 0.5 - Math.random()).slice(0, 3);
  const options = [target || g.pattern, ...distractors].sort(() => 0.5 - Math.random());

  const body = openSheet(`
    <h3 style="margin-bottom:10px">Fill the blank</h3>
    <div class="card"><div class="jp-md" lang="ja">${esc(blanked)}</div>
      <div class="ex-en">${esc(ex[1])}</div></div>
    <div class="stack" style="margin-top:14px" id="opts">
      ${options.map((o) => `<button class="btn btn-block" data-o="${esc(o)}" lang="ja">${esc(o)}</button>`).join('')}
    </div>
    <p class="small faint center" style="margin-top:12px" id="fb"></p>
    <button class="btn btn-block btn-ghost" style="margin-top:8px" data-close>Close</button>
  `);

  body.querySelector('#opts').addEventListener('click', (e) => {
    const b = e.target.closest('[data-o]');
    if (!b) return;
    const ok = b.dataset.o === (target || g.pattern);
    b.classList.add(ok ? 'btn-primary' : '');
    b.style.borderColor = ok ? 'var(--green)' : 'var(--accent)';
    body.querySelector('#fb').innerHTML = ok
      ? `<span style="color:var(--green)">Correct.</span> ${esc(ex[0])}`
      : `<span style="color:var(--accent)">Not quite.</span> The answer is <b lang="ja">${esc(target || g.pattern)}</b>`;
    buzz(ok ? 8 : 20);
  });
}

// ---------------------------------------------------------------- kana
export async function kana({ view, setChrome, signal }) {
  setChrome({ title: 'Kana', back: true });
  const k = await data.kana();
  const progress = (await store.get('progress', 'kana')) || { key: 'kana', known: [] };
  const known = new Set(progress.known);
  let script = await store.setting('kanaScript', 'hira');

  const render = () => {
    view.innerHTML = `
      <div class="seg" role="group" aria-label="Script">
        <button data-s="hira" aria-pressed="${script === 'hira'}">ひらがな</button>
        <button data-s="kata" aria-pressed="${script === 'kata'}">カタカナ</button>
      </div>
      <p class="small faint" style="margin:12px 2px">
        ${known.size} of ${k.flat.length} learned. Tap a character to hear it and mark it known.
      </p>
      <div id="kanaRows">
      ${k.rows.map((row) => `
        <div class="kana-grid" style="margin-bottom:6px">
          ${row.cells.map((c) => c
            ? `<button class="kana-cell" data-id="${c.id}" data-known="${known.has(c.id) ? 1 : 0}">
                 <span class="k" lang="ja">${esc(script === 'hira' ? c.hira : c.kata)}</span>
                 <span class="r">${esc(c.romaji)}</span>
               </button>`
            : `<span class="kana-cell empty"></span>`).join('')}
        </div>`).join('')}
      </div>
      <button class="btn btn-primary btn-block" id="quiz" style="margin-top:14px">Quiz me</button>
    `;
    view.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', async () => {
      script = b.dataset.s; await store.setSetting('kanaScript', script); render();
    }));
    view.querySelector('#kanaRows')?.addEventListener('click', async (e) => {
      const cell = e.target.closest('[data-id]');
      if (!cell) return;
      const c = k.flat.find((x) => x.id === +cell.dataset.id);
      speak(script === 'hira' ? c.hira : c.kata);
      if (known.has(c.id)) known.delete(c.id); else known.add(c.id);
      cell.dataset.known = known.has(c.id) ? 1 : 0;
      await store.put('progress', { key: 'kana', known: [...known] });
    });
    view.querySelector('#quiz').addEventListener('click', () => kanaQuiz(k, script, signal), { signal });
  };
  render();
}

async function kanaQuiz(k, script, signal) {
  const pool = k.flat.filter((c) => c.kind === 'base');
  let score = 0, n = 0;
  // The quiz used to write nothing, so "learned" only ever reflected what the
  // user had tapped on the chart by hand. Two correct answers in a row marks a
  // character known; a wrong answer takes the mark back off.
  const prog = (await store.get('progress', 'kana')) || { key: 'kana', known: [] };
  const known = new Set(prog.known);
  const streaks = new Map();
  const persist = () => store.put('progress', { key: 'kana', known: [...known] });
  const ask = () => {
    if (signal?.aborted) return;
    const c = pool[Math.floor(Math.random() * pool.length)];
    const wrong = (script === 'hira' ? c.confuseH : c.confuseK)
      .map((ch) => k.flat.find((x) => (script === 'hira' ? x.hira : x.kata) === ch))
      .filter(Boolean);
    while (wrong.length < 3) {
      const r = pool[Math.floor(Math.random() * pool.length)];
      if (r.id !== c.id && !wrong.includes(r)) wrong.push(r);
    }
    const opts = [c, ...wrong.slice(0, 3)].sort(() => 0.5 - Math.random());
    const body = openSheet(`
      <p class="small faint center">${n} asked · ${score} right · ${known.size}/${k.flat.length} learned</p>
      <div class="center" style="padding:20px 0">
        <span class="jp-lg" lang="ja" style="font-size:84px">${esc(script === 'hira' ? c.hira : c.kata)}</span>
      </div>
      <div class="kana-grid" style="grid-template-columns:repeat(2,1fr)" id="opts">
        ${opts.map((o) => `<button class="btn" data-r="${esc(o.romaji)}" style="min-height:56px">${esc(o.romaji)}</button>`).join('')}
      </div>
      <button class="btn btn-block btn-ghost" style="margin-top:12px" data-close>Stop</button>
    `);
    body.querySelector('#opts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      n++;
      const ok = b.dataset.r === c.romaji;
      if (ok) score++;
      const run = ok ? (streaks.get(c.id) || 0) + 1 : 0;
      streaks.set(c.id, run);
      if (ok && run >= 2) known.add(c.id); else if (!ok) known.delete(c.id);
      persist();
      b.style.borderColor = ok ? 'var(--green)' : 'var(--accent)';
      buzz(ok ? 8 : 20);
      speak(script === 'hira' ? c.hira : c.kata);
      setTimeout(() => { if (!signal?.aborted) ask(); }, 420);
    }, { once: true, signal });
  };
  ask();
}

// ---------------------------------------------------------------- conjugation drill
export async function conjugate({ params, view, setChrome, signal }) {
  const lv = params[0];
  setChrome({ title: `${lv} conjugation`, back: true });
  const [list, table] = await Promise.all([data.vocab(lv), data.conjugations()]);
  const drillable = list.filter((w) => table[w.id]);

  if (!drillable.length) {
    view.innerHTML = `<div class="empty"><div class="empty-mark">活</div><p>No conjugation tables at this level.</p></div>`;
    return;
  }

  // Only drill forms the learner has actually met at this level. Asking an N5
  // beginner for the causative is not a hard question, it is an unfair one.
  const BY_LEVEL = {
    N5: [['polite_nonpast', 'polite (ます)'], ['polite_past', 'polite past (ました)'],
         ['nai_form', 'negative (ない)'], ['ta_form', 'past (た)'], ['te_form', 'て-form']],
    N4: [['potential', 'potential'], ['volitional', 'volitional'],
         ['conditional_ba', 'conditional (ば)'], ['nakatta_form', 'past negative (なかった)']],
    N3: [['passive', 'passive'], ['causative', 'causative']],
    N2: [['conditional_tara', 'conditional (たら)']],
    N1: [],
  };
  const order = ['N5', 'N4', 'N3', 'N2', 'N1'];
  const FORMS = order.slice(0, order.indexOf(lv) + 1).flatMap((l) => BY_LEVEL[l]);
  let asked = 0, right = 0;

  const ask = () => {
    const w = drillable[Math.floor(Math.random() * drillable.length)];
    const t = table[w.id];
    const avail = FORMS.filter(([k]) => t.forms[k]);
    if (!avail.length) return ask();
    const [key, label] = avail[Math.floor(Math.random() * avail.length)];
    const answer = t.forms[key];

    const wrong = new Set();
    while (wrong.size < 3) {
      const o = drillable[Math.floor(Math.random() * drillable.length)];
      const v = table[o.id]?.forms[key];
      if (v && v !== answer) wrong.add(v);
      if (wrong.size < 3) {
        const other = avail[Math.floor(Math.random() * avail.length)][0];
        if (t.forms[other] && t.forms[other] !== answer) wrong.add(t.forms[other]);
      }
    }
    const opts = [answer, ...wrong].sort(() => 0.5 - Math.random());

    view.innerHTML = `
      <div class="review-top"><span>${asked} asked</span>
        <span class="bar" style="flex:1"><i style="width:${asked ? (right / asked) * 100 : 0}%"></i></span>
        <span>${right} right</span></div>
      <div class="review-card" style="margin-top:12px">
        <div class="jp-lg" lang="ja">${w.f ? ruby(w.f, w.w) : esc(w.w)}</div>
        <div class="muted">${esc(w.m[0] || '')} · <b>${esc(t.cls)}</b></div>
        <div style="font-size:17px;font-weight:650;margin-top:8px">→ ${esc(label)}</div>
      </div>
      <div class="stack" style="margin-top:12px" id="opts">
        ${opts.map((o) => `<button class="btn btn-block jp-sm" lang="ja" data-a="${esc(o)}" style="min-height:54px">${esc(o)}</button>`).join('')}
      </div>`;

    view.querySelector('#opts').addEventListener('click', (e) => {
      const b = e.target.closest('[data-a]');
      if (!b) return;
      asked++;
      const ok = b.dataset.a === answer;
      if (ok) right++;
      b.style.borderColor = ok ? 'var(--green)' : 'var(--accent)';
      if (!ok) view.querySelector(`[data-a="${CSS.escape(answer)}"]`).style.borderColor = 'var(--green)';
      buzz(ok ? 8 : 20);
      speak(t.kana?.[key] || answer);
      setTimeout(() => { if (!signal?.aborted) ask(); }, ok ? 500 : 1400);
    }, { once: true, signal });
  };
  ask();
}
