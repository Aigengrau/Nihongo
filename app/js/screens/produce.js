// Production practice: English in, Japanese out.
//
// Everything else in the app is recognition — you see 食べる and decide whether
// you know it. That builds a learner who can read and cannot speak. Production
// cards ask the other direction, and you build the answer from kana tiles
// rather than typing, because nobody wants to fight an IME on a phone.
//
// A word only becomes a production card once its recognition card is solid
// (stability past ~21 days), so this never front-loads the hard direction.
import * as data from '../data.js';
import * as store from '../store.js';
import { esc, ruby, toast, buzz, speak, canSpeak, openWordSheet } from '../ui.js';
import { review as schedule, RATING, STATE, newCard } from '../srs.js';
import { bumpToday, touchStreak } from '../progress.js';

const PROD_UNLOCK_STABILITY = 21;   // days
const isKana = (s) => /^[぀-ゟ゠-ヿー]+$/.test(s);

/** Words whose recognition card is solid enough to start producing. */
export async function eligible() {
  const [{ byId }, cards] = await Promise.all([data.allVocab(), store.all('cards')]);
  const prod = new Set(cards.filter((c) => c.key.endsWith(':prod')).map((c) => c.key));
  const out = [];
  for (const c of cards) {
    if (!c.key.endsWith(':rec') || c.vocabId == null) continue;
    if (c.state !== STATE.REVIEW || c.S < PROD_UNLOCK_STABILITY) continue;
    const w = byId.get(c.vocabId);
    if (!w || !w.r) continue;
    out.push({ word: w, existing: prod.has(`vocab:${w.id}:prod`) });
  }
  return out;
}

export async function produce({ view, setChrome, signal }) {
  setChrome({ title: 'Say it', back: true });

  const [pool, cards] = await Promise.all([eligible(), store.all('cards')]);
  if (!pool.length) {
    view.innerHTML = `<div class="empty"><div class="empty-mark">話</div>
      <p><b>Nothing ready to produce yet.</b></p>
      <p class="small" style="margin-top:8px">Production practice unlocks a word once you can
      reliably recognise it — about three weeks of successful reviews. Keep going and these
      will appear on their own.</p>
      <a class="btn btn-primary" style="margin-top:16px" href="#/review">Do reviews</a></div>`;
    return;
  }

  // Create the production siblings the first time they become eligible.
  const have = new Set(cards.map((c) => c.key));
  const fresh = pool
    .filter((p) => !have.has(`vocab:${p.word.id}:prod`))
    .map((p) => newCard(`vocab:${p.word.id}:prod`, `prod`, {
      word: p.word.w, reading: p.word.r, vocabId: p.word.id, lv: p.word.lv, ord: p.word.ord,
    }));
  if (fresh.length) await store.putMany('cards', fresh);

  const all = [...cards.filter((c) => c.key.endsWith(':prod')), ...fresh];
  const now = Date.now();
  const queue = all
    .filter((c) => !c.suspended && (c.state === STATE.NEW || c.due <= now))
    .sort((a, b) => a.due - b.due)
    .slice(0, 20);

  if (!queue.length) {
    view.innerHTML = `<div class="empty"><div class="empty-mark">✓</div>
      <p><b>No production cards due.</b></p>
      <p class="small" style="margin-top:6px">${all.length} words are in production practice.</p>
      <a class="btn btn-primary" style="margin-top:16px" href="#/today">Back to Today</a></div>`;
    return;
  }

  const { byId } = await data.allVocab();
  let i = 0, right = 0;

  const draw = () => {
    if (signal?.aborted) return;
    if (i >= queue.length) {
      view.innerHTML = `<div class="empty"><div class="empty-mark">✓</div>
        <p><b>${queue.length} produced.</b></p>
        <p class="small" style="margin-top:6px">${right}/${queue.length} built correctly</p>
        <a class="btn btn-primary btn-block" style="margin-top:18px" href="#/today">Back to Today</a></div>`;
      return;
    }
    const card = queue[i];
    const w = byId.get(card.vocabId);
    if (!w) { i++; return draw(); }

    const answer = w.r;                       // build the reading, in kana
    const target = [...answer];
    // Distractor tiles from other words' kana, so the answer is not the only
    // thing on screen.
    const noise = new Set();
    const alphabet = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだでどばびぶべぼぱぴぷぺぽっゃゅょー';
    while (noise.size < Math.min(6, Math.max(3, Math.round(target.length * 0.7)))) {
      const ch = alphabet[Math.floor(Math.random() * alphabet.length)];
      if (!target.includes(ch)) noise.add(ch);
    }
    const tiles = [...target, ...noise].sort(() => 0.5 - Math.random());
    let built = [];

    const ex = w.x?.[0];
    const prompt = ex ? ex[1] : w.m.slice(0, 2).join(', ');

    const paint = () => {
      view.innerHTML = `
        <div class="review-top">
          <span>${i + 1} / ${queue.length}</span>
          <span class="bar" style="flex:1"><i style="width:${(i / queue.length) * 100}%"></i></span>
          <span class="lv-chip lv-${w.lv}">${w.lv}</span>
        </div>

        <div class="card" style="margin-top:12px;text-align:center;padding:22px 16px">
          <div class="small faint">Say this in Japanese</div>
          <div style="font-size:19px;font-weight:650;margin-top:8px">${esc(w.m.slice(0, 2).join(', '))}</div>
          ${ex ? `<div class="small muted" style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">
            ${esc(prompt)}</div>` : ''}
        </div>

        <div class="card" style="margin-top:10px;min-height:66px;display:grid;place-items:center">
          <div class="jp-lg" lang="ja" id="built">${built.length ? esc(built.join('')) : '<span class="faint" style="font-size:16px">tap the kana in order</span>'}</div>
        </div>

        <div class="kana-grid" id="tiles" style="grid-template-columns:repeat(6,minmax(0,1fr));margin-top:10px">
          ${tiles.map((t, n) => `<button class="kana-cell" data-t="${n}" ${built.includes(n) ? 'disabled style="opacity:.3"' : ''}>
            <span class="k" lang="ja">${esc(t)}</span></button>`).join('')}
        </div>

        <div class="row" style="margin-top:12px;gap:8px">
          <button class="btn" id="back" ${built.length ? '' : 'disabled'}>⌫</button>
          <button class="btn btn-block btn-primary" id="check" ${built.length ? '' : 'disabled'}>Check</button>
          <button class="btn" id="skip">Show me</button>
        </div>`;

      view.querySelector('#tiles').addEventListener('click', (e) => {
        const b = e.target.closest('[data-t]');
        if (!b || b.disabled) return;
        built.push(+b.dataset.t);
        buzz(4);
        paint();
      }, { signal });
      view.querySelector('#back').addEventListener('click', () => { built.pop(); paint(); }, { signal });
      view.querySelector('#check').addEventListener('click', () => grade(built.map((n) => tiles[n]).join('')), { signal });
      view.querySelector('#skip').addEventListener('click', () => grade(null), { signal });
    };

    const grade = async (attempt) => {
      const ok = attempt === answer;
      if (ok) right++;
      buzz(ok ? 10 : 24);
      if (canSpeak()) speak(answer);

      view.innerHTML = `
        <div class="review-card" style="margin-top:14px">
          <div class="small faint">${ok ? 'Correct' : attempt === null ? 'The answer' : 'Not quite'}</div>
          <div class="jp-lg" lang="ja" style="color:${ok ? 'var(--green)' : 'var(--accent)'}">
            ${w.f ? ruby(w.f, w.w) : esc(w.w)}</div>
          <div class="jp-md muted" lang="ja">${esc(answer)}</div>
          ${attempt && !ok ? `<div class="small muted">you built <b lang="ja">${esc(attempt)}</b></div>` : ''}
          <div style="font-size:17px;font-weight:600;margin-top:8px">${esc(w.m.slice(0, 3).join(', '))}</div>
          ${ex ? `<div style="margin-top:10px;border-top:1px solid var(--line);padding-top:10px">
            <div class="jp-sm" lang="ja">${esc(ex[0])}</div><div class="ex-en">${esc(ex[1])}</div></div>` : ''}
        </div>
        <button class="btn btn-block btn-ghost" style="margin-top:10px" id="detail">Full details</button>
        <button class="btn btn-block btn-primary" style="margin-top:8px" id="next">Next</button>`;

      view.querySelector('#detail').addEventListener('click', () => openWordSheet(w.w), { signal });
      view.querySelector('#next').addEventListener('click', async () => {
        const rating = attempt === null ? RATING.AGAIN : ok ? RATING.GOOD : RATING.AGAIN;
        const { card: next, log } = schedule(card, rating);
        await store.put('cards', next);
        await store.put('reviews', { ...log, kind: 'prod' });
        await bumpToday({ reviews: 1, correct: ok ? 1 : 0 });
        await touchStreak();
        i++;
        draw();
      }, { signal });
    };

    paint();
  };

  draw();
}
