// The business/professional track: keigo drills, email assembly, workplace phrases.
import * as store from '../store.js';
import { esc, toast, buzz, speak, canSpeak, tappable, bindWordTaps, openSheet } from '../ui.js';
import { newCard } from '../srs.js';
import * as dict from '../dict.js';

const CHEV = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

let docP = null;
const load = () => (docP ||= fetch('./data/business.json').then((r) => r.json()));

export async function home({ view, setChrome, signal }) {
  setChrome({ title: 'Business Japanese', back: true });
  const doc = await load();

  view.innerHTML = `
    <p class="muted small">${esc(doc.intro)}</p>
    ${doc.stages.map((s) => {
      const mods = doc.modules.filter((m) => m.stage === s.id);
      return `
        <h2 class="section-title">${esc(s.name)} · from ${esc(s.after)}</h2>
        <p class="small faint" style="margin:0 2px 8px">${esc(s.note)}</p>
        <div class="stack">
          ${mods.map((m) => `<a class="tile" href="#/business/${esc(m.id)}">
            <span class="tile-ico">${esc(m.title.match(/[一-鿿]/)?.[0] || '仕')}</span>
            <span class="tile-main"><span class="tile-title">${esc(m.title)}</span>
              <span class="tile-sub">${esc(m.blurb)}</span></span>
            <span class="tile-end">${CHEV}</span></a>`).join('')}
        </div>`;
    }).join('')}
  `;
}

export async function module({ params, view, setChrome, signal }) {
  const [doc] = await Promise.all([load(), dict.ready()]);
  const m = doc.modules.find((x) => x.id === params[0]);
  if (!m) { view.innerHTML = `<div class="empty"><p>Not found.</p></div>`; return; }
  setChrome({ title: m.title.replace(/\s*[一-鿿].*$/, '') || 'Business', back: true });

  if (m.kind === 'transform') return transform(m, view, signal);
  if (m.kind === 'template') return template(m, view, signal);
  return phrases(m, view, signal);
}

// ---------------------------------------------------------------- phrases
function phrases(m, view, signal) {
  view.innerHTML = `
    <h2 style="font-size:18px">${esc(m.title)}</h2>
    <p class="muted small" style="margin-top:4px">${esc(m.blurb)}</p>
    <div class="stack" style="margin-top:14px" id="items">
      ${m.items.map((it, n) => `
        <div class="card">
          <div class="jp-md" lang="ja">${tappable(it.ja)}</div>
          ${it.r && it.r !== it.ja ? `<div class="small faint jp-sm" lang="ja" style="margin-top:2px">${esc(it.r)}</div>` : ''}
          <div class="ex-en" style="margin-top:6px">${esc(it.en)}</div>
          ${it.note ? `<p class="small" style="margin-top:8px;color:var(--indigo)">${esc(it.note)}</p>` : ''}
          <div class="row" style="margin-top:10px;gap:6px">
            ${canSpeak() ? `<button class="btn btn-sm" data-say="${esc(it.r || it.ja)}">🔊</button>` : ''}
            <button class="btn btn-sm" data-save="${n}">☆ Save</button>
          </div>
        </div>`).join('')}
    </div>`;

  const items = view.querySelector('#items');
  bindWordTaps(items);
  items.addEventListener('click', async (e) => {
    const say = e.target.closest('[data-say]');
    if (say) return speak(say.dataset.say);
    const sv = e.target.closest('[data-save]');
    if (!sv) return;
    const it = m.items[+sv.dataset.save];
    await store.put('saved', {
      key: it.ja, word: it.ja, reading: it.r || '', meaning: it.en,
      lv: 'BIZ', vocabId: null, added: Date.now(),
    });
    if (!(await store.get('cards', `saved:${it.ja}:rec`))) {
      await store.put('cards', newCard(`saved:${it.ja}:rec`, 'saved', { word: it.ja, reading: it.r || '', ord: -Date.now() }));
    }
    sv.textContent = '★ Saved';
    buzz(12);
    toast('Added to your reviews');
    window.dispatchEvent(new CustomEvent('nihongo:saved-changed'));
  });
}

// ---------------------------------------------------------------- keigo drill
function transform(m, view, signal) {
  const COLS = [
    ['polite', 'polite 丁寧語'],
    ['sonkei', 'respectful 尊敬語'],
    ['kenjou', 'humble 謙譲語'],
  ];
  let mode = 'table';

  const table = () => `
    <div class="card" style="padding:0;overflow-x:auto">
      <table style="width:100%;border-collapse:collapse;font-size:13.5px">
        <thead><tr>
          ${['plain', ...COLS.map((c) => c[1])].map((h) =>
            `<th style="text-align:left;padding:9px 10px;border-bottom:1px solid var(--line);color:var(--text-faint);font-size:11px;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap">${esc(h)}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${m.items.map((it) => `<tr>
            <td style="padding:9px 10px;border-top:1px solid var(--line)" lang="ja" class="jp-sm">${esc(it.plain)}
              <div class="small faint" style="font-family:var(--ui)">${esc(it.en)}</div></td>
            ${COLS.map(([k]) => `<td style="padding:9px 10px;border-top:1px solid var(--line);white-space:nowrap" lang="ja" class="jp-sm">${esc(it[k])}</td>`).join('')}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  const render = () => {
    view.innerHTML = `
      <h2 style="font-size:18px">${esc(m.title)}</h2>
      <p class="muted small" style="margin-top:4px">${esc(m.blurb)}</p>
      ${m.note ? `<p class="small" style="margin-top:8px;color:var(--indigo)">${esc(m.note)}</p>` : ''}
      <div class="seg" style="margin:14px 0">
        <button data-m="table" aria-pressed="${mode === 'table'}">Table</button>
        <button data-m="drill" aria-pressed="${mode === 'drill'}">Drill</button>
      </div>
      <div id="pane">${mode === 'table' ? table() : ''}</div>`;
    view.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.m; render(); if (mode === 'drill') drill();
    }, { signal }));
    if (mode === 'drill') drill();
  };

  let asked = 0, right = 0;
  const drill = () => {
    if (signal?.aborted) return;
    const pool = m.items.filter((it) => COLS.some(([k]) => it[k] && it[k] !== '—'));
    const it = pool[Math.floor(Math.random() * pool.length)];
    const avail = COLS.filter(([k]) => it[k] && it[k] !== '—');
    const [key, label] = avail[Math.floor(Math.random() * avail.length)];
    const answer = it[key];

    const wrong = new Set();
    while (wrong.size < 3) {
      const o = pool[Math.floor(Math.random() * pool.length)];
      const k2 = COLS[Math.floor(Math.random() * COLS.length)][0];
      if (o[k2] && o[k2] !== '—' && o[k2] !== answer) wrong.add(o[k2]);
    }
    const opts = [answer, ...wrong].sort(() => 0.5 - Math.random());

    view.querySelector('#pane').innerHTML = `
      <div class="review-top"><span>${asked} asked</span>
        <span class="bar" style="flex:1"><i style="width:${asked ? (right / asked) * 100 : 0}%"></i></span>
        <span>${right} right</span></div>
      <div class="review-card" style="margin-top:10px">
        <div class="jp-lg" lang="ja">${esc(it.plain)}</div>
        <div class="muted">${esc(it.en)}</div>
        <div style="font-size:17px;font-weight:650;margin-top:10px">→ ${esc(label)}</div>
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
      speak(answer);
      setTimeout(() => { if (!signal?.aborted) drill(); }, ok ? 550 : 1500);
    }, { once: true, signal });
  };

  render();
}

// ---------------------------------------------------------------- email builder
function template(m, view, signal) {
  const chosen = m.slots.map((s) => 0);

  const compose = () => m.slots.map((s, i) => s.options[chosen[i]]).join('\n\n');

  const render = () => {
    view.innerHTML = `
      <h2 style="font-size:18px">${esc(m.title)}</h2>
      <p class="muted small" style="margin-top:4px">${esc(m.blurb)}</p>

      <h3 class="section-title">Build it block by block</h3>
      <div class="stack">
        ${m.slots.map((s, i) => `
          <div class="card">
            <div class="spread"><span class="small" style="font-weight:700" lang="ja">${esc(s.slot)}</span>
              <span class="small faint">${esc(s.en)}</span></div>
            <div class="stack" style="margin-top:8px">
              ${s.options.map((o, j) => `<button class="btn btn-block jp-sm" lang="ja"
                  data-slot="${i}" data-opt="${j}"
                  style="min-height:auto;padding:10px 12px;text-align:left;justify-content:flex-start;white-space:pre-wrap;${j === chosen[i] ? 'border-color:var(--accent)' : ''}">${esc(o)}</button>`).join('')}
            </div>
            ${s.note ? `<p class="small" style="margin-top:8px;color:var(--indigo)">${esc(s.note)}</p>` : ''}
          </div>`).join('')}
      </div>

      <h3 class="section-title">Your email</h3>
      <div class="card"><pre class="jp-sm" lang="ja" id="out"
        style="white-space:pre-wrap;margin:0;font-family:var(--jp)">${esc(compose())}</pre></div>
      <button class="btn btn-block" id="copy" style="margin-top:10px">Copy</button>

      <h3 class="section-title">Softening phrases (クッション言葉)</h3>
      <p class="small faint" style="margin:0 2px 8px">Drop one of these in front of a request or a refusal.</p>
      <div class="stack" id="cush">
        ${m.cushions.map((c) => `<div class="card">
          <div class="jp-md" lang="ja">${esc(c.ja)}</div>
          <div class="small faint jp-sm" lang="ja">${esc(c.r)}</div>
          <div class="ex-en">${esc(c.en)}</div>
        </div>`).join('')}
      </div>`;

  };

  // Bound ONCE, outside render(). Attaching inside render() doubled the handler
  // count on every tap: by the fifteenth option the page did 16,384 re-renders.
  view.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-slot]');
    if (b) { chosen[+b.dataset.slot] = +b.dataset.opt; render(); return; }
    if (e.target.closest('#copy')) {
      try { await navigator.clipboard.writeText(compose()); toast('Copied'); }
      catch { toast('Could not copy — select the text instead'); }
    }
  }, { signal });
  render();
}
