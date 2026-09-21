// Today, Levels, and the per-level hub.
import * as data from '../data.js';
import * as store from '../store.js';
import { esc, ruby, toast } from '../ui.js';
import { inventory, today as todayCounts, streak, newAllowance, enrollLevel, stage, STAGES } from '../progress.js';
import { eligible as prodEligible } from './produce.js';

const CHEV = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------------------------------------------------------------- Today
export async function today({ view, setChrome }) {
  setChrome({
    title: 'Today',
    actions: `<a class="appbar-icon" href="#/settings" aria-label="Settings">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8.9 4a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1l-.4-2.5h-4l-.4 2.6a7 7 0 00-1.7 1l-2.4-1-2 3.4L7.2 11a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.4 2.5h4l.4-2.6a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6c0-.3.1-.6.1-1z"/></svg>
    </a>`,
  });

  const [inv, counts, st, lstats, prod] = await Promise.all([
    inventory(), todayCounts(), streak(), data.levelStats(), prodEligible().catch(() => []),
  ]);
  const base = await store.setting('newPerDay', 10);
  const allowance = newAllowance(inv.due, base);
  const level = (await store.setting('level', 'N5'));

  const goal = inv.due + allowance;
  const done = counts.reviews + counts.new;
  const pct = goal + done ? Math.min(100, Math.round((done / Math.max(1, goal + done)) * 100)) : 0;

  const firstRun = inv.total === 0;

  view.innerHTML = `
    <div class="spread" style="margin-bottom:14px">
      <div>
        <div style="font-size:26px;font-weight:800">${st.current}<span class="muted" style="font-size:15px;font-weight:600"> day streak</span></div>
        <div class="small faint">${st.freezes} freeze${st.freezes === 1 ? '' : 's'} · best ${st.best}</div>
      </div>
      <div class="ring" style="--p:${pct}"><span>${pct}%</span></div>
    </div>

    ${firstRun ? `
      <button class="cta" id="start">
        <span class="cta-n">始</span>
        <span><span class="cta-t">Start learning</span><br><span class="cta-s">Set up your ${esc(level)} deck — takes a second</span></span>
      </button>
      <a class="tile" href="#/kana" style="margin-top:10px">
        <span class="tile-ico">あ</span>
        <span class="tile-main"><span class="tile-title">Learn kana first</span>
          <span class="tile-sub">Never read hiragana? Start here — 3 days.</span></span>
        <span class="tile-end">${CHEV}</span>
      </a>
    ` : `
      ${inv.due > 0 ? `
        <a class="cta" href="#/review">
          <span class="cta-n">${inv.due}</span>
          <span><span class="cta-t">Reviews due</span><br><span class="cta-s">Clear these first — then new words unlock</span></span>
        </a>` : `
        <div class="card center" style="padding:20px">
          <div style="font-size:30px">✓</div>
          <div style="font-weight:700;margin-top:4px">Reviews all clear</div>
          <div class="small muted">${counts.reviews} done today</div>
        </div>`}

      <div class="tiles" style="margin-top:10px">
        ${allowance > 0
          ? `<a class="tile" href="#/learn/${esc(level)}">
               <span class="tile-ico">新</span>
               <span class="tile-main"><span class="tile-title">Learn ${allowance} new words</span>
                 <span class="tile-sub">${esc(level)} · ${counts.new} learned today</span></span>
               <span class="tile-end">${CHEV}</span></a>`
          : `<div class="tile" style="opacity:.6">
               <span class="tile-ico">新</span>
               <span class="tile-main"><span class="tile-title">New words paused</span>
                 <span class="tile-sub">Catch up on reviews to unlock them</span></span></div>`}

        <a class="tile" href="#/grammar/${esc(level)}">
          <span class="tile-ico">文</span>
          <span class="tile-main"><span class="tile-title">Grammar</span>
            <span class="tile-sub">${esc(level)} · ${lstats[level]?.grammar ?? 0} points</span></span>
          <span class="tile-end">${CHEV}</span></a>

        <a class="tile" href="#/watch/${esc(level)}">
          <span class="tile-ico">見</span>
          <span class="tile-main"><span class="tile-title">Watch with subtitles</span>
            <span class="tile-sub">Tap any word to look it up</span></span>
          <span class="tile-end">${CHEV}</span></a>

        <a class="tile" href="#/read/${esc(level)}">
          <span class="tile-ico">読</span>
          <span class="tile-main"><span class="tile-title">Read a short story</span>
            <span class="tile-sub">Built from words you already know</span></span>
          <span class="tile-end">${CHEV}</span></a>

        <a class="tile" href="#/listen/${esc(level)}">
          <span class="tile-ico">聴</span>
          <span class="tile-main"><span class="tile-title">Listen</span>
            <span class="tile-sub">Japanese audio, big JP + EN subtitles, tap any word</span></span>
          <span class="tile-end">${CHEV}</span></a>

        ${prod.length ? `<a class="tile" href="#/produce">
          <span class="tile-ico">話</span>
          <span class="tile-main"><span class="tile-title">Say it yourself</span>
            <span class="tile-sub">${prod.length} words you know well enough to produce, not just recognise</span></span>
          <span class="tile-end">${CHEV}</span></a>` : ''}
      </div>
    `}

    <h2 class="section-title">Your level</h2>
    <div class="seg" role="group" aria-label="Current level">
      ${data.LEVELS.map((l) => `<button data-lv="${l}" aria-pressed="${l === level}">${l}</button>`).join('')}
    </div>

    <h2 class="section-title">Where you are</h2>
    <div class="stat-grid">
      <div class="stat"><div class="stat-n">${inv.review + inv.learning}</div><div class="stat-l">words in progress</div></div>
      <div class="stat"><div class="stat-n">${inv.cards.filter((c) => stage(c) === 'burned').length}</div><div class="stat-l">mastered</div></div>
    </div>
  `;

  view.querySelectorAll('[data-lv]').forEach((b) => b.addEventListener('click', async () => {
    await store.setSetting('level', b.dataset.lv);
    today({ view, setChrome });
  }));

  view.querySelector('#start')?.addEventListener('click', async () => {
    const list = await data.vocab(level);
    const n = await enrollLevel(level, list);
    toast(`${n} ${level} words ready`);
    window.dispatchEvent(new CustomEvent('nihongo:progress'));
    today({ view, setChrome });
  });
}

// ---------------------------------------------------------------- Levels
export async function levels({ view, setChrome }) {
  setChrome({ title: 'Levels' });
  const [lstats, cards] = await Promise.all([data.levelStats(), store.all('cards')]);

  const perLevel = {};
  for (const c of cards) {
    const lv = c.lv || (c.deck?.startsWith('level:') ? c.deck.slice(6) : null);
    if (!lv) continue;
    perLevel[lv] = perLevel[lv] || { started: 0, known: 0 };
    perLevel[lv].started++;
    if (['master', 'enlightened', 'burned'].includes(stage(c))) perLevel[lv].known++;
  }

  view.innerHTML = `
    <p class="muted small" style="margin-bottom:14px">
      Five JLPT levels, easiest first. N5 is your first words; N1 is newspaper and novel Japanese.
    </p>

    <a class="tile" href="#/kana" style="margin-bottom:14px">
      <span class="tile-ico">あ</span>
      <span class="tile-main"><span class="tile-title">Kana</span>
        <span class="tile-sub">Hiragana + katakana — before N5</span></span>
      <span class="tile-end">${CHEV}</span>
    </a>

    <div class="stack">
      ${data.LEVELS.map((l) => {
        const s = lstats[l] || {};
        const p = perLevel[l] || { started: 0, known: 0 };
        const pct = s.vocab ? Math.round((p.known / s.vocab) * 100) : 0;
        return `<a class="level-card lv-${l}" href="#/level/${l}">
          <span class="level-big">${l}</span>
          <span class="tile-main">
            <span class="tile-title">${esc(data.LEVEL_NAMES[l])}</span>
            <span class="tile-sub">${s.vocab ?? 0} words · ${s.kanji ?? 0} kanji · ${s.grammar ?? 0} grammar</span>
            <span class="bar" style="margin-top:8px"><i style="width:${pct}%"></i></span>
          </span>
          <span class="tile-end">${pct}%</span>
        </a>`;
      }).join('')}
    </div>

    <h2 class="section-title">Beyond the JLPT</h2>
    <a class="tile" href="#/business">
      <span class="tile-ico">仕</span>
      <span class="tile-main"><span class="tile-title">Business Japanese</span>
        <span class="tile-sub">Keigo, email, meetings, phone — the working track</span></span>
      <span class="tile-end">${CHEV}</span>
    </a>
  `;
}

// ---------------------------------------------------------------- One level
export async function level({ params, view, setChrome }) {
  const lv = params[0];
  setChrome({ title: lv, back: true });

  const [lstats, list, cards] = await Promise.all([data.levelStats(), data.vocab(lv), store.all('cards')]);
  const s = lstats[lv] || {};
  const mine = cards.filter((c) => c.lv === lv || c.deck === `level:${lv}`);
  const enrolled = mine.length > 0;
  const byStage = Object.fromEntries(STAGES.map((x) => [x, 0]));
  for (const c of mine) byStage[stage(c)]++;
  const known = byStage.master + byStage.enlightened + byStage.burned;
  const pct = s.vocab ? Math.round((known / s.vocab) * 100) : 0;

  const tile = (href, ico, title, sub) => `
    <a class="tile" href="${href}">
      <span class="tile-ico">${ico}</span>
      <span class="tile-main"><span class="tile-title">${esc(title)}</span><span class="tile-sub">${esc(sub)}</span></span>
      <span class="tile-end">${CHEV}</span>
    </a>`;

  view.innerHTML = `
    <div class="card lv-${lv}" style="border-left:4px solid var(--lv)">
      <div class="spread">
        <div>
          <div style="font-size:22px;font-weight:800;color:var(--lv)">${lv}</div>
          <div class="small muted">${esc(data.LEVEL_NAMES[lv])}</div>
        </div>
        <div class="ring lv-${lv}" style="--p:${pct}"><span>${pct}%</span></div>
      </div>
      <div class="bar" style="margin-top:12px"><i style="width:${pct}%"></i></div>
      <div class="small faint" style="margin-top:7px">
        ${known} of ${s.vocab ?? 0} words known · ${byStage.apprentice + byStage.guru} in progress
      </div>
    </div>

    ${enrolled ? '' : `<button class="cta" id="enroll" style="margin-top:12px">
      <span class="cta-n">+</span>
      <span><span class="cta-t">Add ${lv} to my studies</span><br>
      <span class="cta-s">${s.vocab ?? 0} words, most useful first</span></span>
    </button>`}

    <h2 class="section-title">Study</h2>
    <div class="tiles">
      ${lv === 'N5' ? tile('#/kana', 'あ', 'Kana', 'Hiragana and katakana first') : ''}
      ${tile(`#/learn/${lv}`, '新', 'Learn new words', 'First exposure, with audio and a sentence')}
      ${tile(`#/review/level:${lv}`, '復', 'Flashcards', `${mine.filter((c) => c.due <= Date.now() && c.state !== 0).length} due now`)}
      ${tile(`#/words/${lv}`, '語', 'All words', `${s.vocab ?? 0} words, ordered by usefulness`)}
      ${tile(`#/kanji/${lv}`, '漢', 'Kanji', `${s.kanji ?? 0} characters with components`)}
      ${tile(`#/grammar/${lv}`, '文', 'Grammar', `${s.grammar ?? 0} points with examples`)}
      ${tile(`#/conjugate/${lv}`, '活', 'Conjugation drill', 'Verbs and adjectives, all forms')}
      ${tile('#/produce', '話', 'Say it yourself', 'English in, Japanese out — unlocks as you master words')}
      ${tile(`#/read/${lv}`, '読', 'Short stories', 'Reading with tap-to-look-up')}
      ${tile(`#/listen/${lv}`, '聴', 'Listen', 'Japanese audio with big JP + EN subtitles')}
      ${tile(`#/watch/${lv}`, '見', 'Watch video', 'Big Japanese + English subtitles')}
    </div>

    <h2 class="section-title">Progress by stage</h2>
    <div class="card">
      ${STAGES.filter((x) => x !== 'new').map((x) => `
        <div class="spread" style="padding:6px 0">
          <span class="small" style="text-transform:capitalize">${x}</span>
          <span class="small muted">${byStage[x]}</span>
        </div>`).join('')}
    </div>

    <h2 class="section-title">Offline</h2>
    <div class="card">
      <p class="small muted">Keep every ${lv} word, kanji, grammar point and story on your
      phone so this level works with no signal at all.</p>
      <button class="btn btn-block" id="dl" style="margin-top:10px">Download ${lv} for offline</button>
      <div class="bar" id="dlbar" hidden style="margin-top:10px"><i style="width:0%"></i></div>
    </div>
  `;

  const dl = view.querySelector('#dl');
  dl?.addEventListener('click', () => {
    const sw = navigator.serviceWorker?.controller;
    if (!sw) { toast('Offline download needs the app to be installed or reloaded once'); return; }
    const bar = view.querySelector('#dlbar');
    bar.hidden = false;
    dl.disabled = true;
    dl.textContent = 'Downloading…';
    const onMsg = (e) => {
      if (e.data?.type !== 'LEVEL_PROGRESS' || e.data.level !== lv) return;
      bar.querySelector('i').style.width = `${(e.data.done / e.data.total) * 100}%`;
      if (e.data.done >= e.data.total) {
        navigator.serviceWorker.removeEventListener('message', onMsg);
        dl.textContent = `${lv} saved for offline`;
        toast(`${lv} is available offline`);
      }
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    sw.postMessage({ type: 'CACHE_LEVEL', level: lv });
  });

  view.querySelector('#enroll')?.addEventListener('click', async () => {
    const n = await enrollLevel(lv, list);
    await store.setSetting('level', lv);
    toast(`${n} words added`);
    window.dispatchEvent(new CustomEvent('nihongo:progress'));
    level({ params, view, setChrome });
  });
}
