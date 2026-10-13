// "Beyond the JLPT" — the tracks that are not vocabulary lists.
//
// Travel, real casual speech, sounds & counting, dialects, business, academic.
// Each is a set of modules in one of three shapes: a list of phrases, a
// comparison table with an auto-generated drill, or a slot-filling template.
// Replaces the old business-only screen; business is now one track among six.
import * as store from '../store.js';
import * as dict from '../dict.js';
import { esc, toast, buzz, speak, canSpeak, tappable, bindWordTaps } from '../ui.js';
import { newCard } from '../srs.js';

const CHEV = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const cache = new Map();
const getIndex = () => (cache.has('i') ? cache.get('i') : cache.set('i', fetch('./data/tracks/index.json').then((r) => r.json())).get('i'));
const getTrack = (id) => (cache.has(id) ? cache.get(id) : cache.set(id, fetch(`./data/tracks/${id}.json`).then((r) => r.json())).get(id));

// ---------------------------------------------------------------- hub
export async function hub({ view, setChrome }) {
  setChrome({ title: 'Beyond the JLPT', back: true });
  const tracks = await getIndex();
  view.innerHTML = `
    <p class="muted small">The JLPT teaches you to pass an exam. These are the things you
    need in order to actually use Japanese — ordered roughly by how soon they become useful.</p>
    <div class="stack" style="margin-top:14px">
      ${tracks.map((t) => `<a class="tile" href="#/track/${esc(t.id)}">
        <span class="tile-ico">${esc(t.icon)}</span>
        <span class="tile-main">
          <span class="tile-title">${esc(t.title)}</span>
          <span class="tile-sub">${esc(t.blurb)}</span>
          <span class="tile-sub faint">${t.modules} modules · ${t.items} items · from ${esc(t.from)}</span>
        </span>
        <span class="tile-end">${CHEV}</span>
      </a>`).join('')}
    </div>`;
}

// ---------------------------------------------------------------- one track
export async function track({ params, view, setChrome }) {
  const t = await getTrack(params[0]).catch(() => null);
  if (!t) { view.innerHTML = `<div class="empty"><p>Track not found.</p></div>`; return; }
  setChrome({ title: t.title.replace(/\s*[぀-鿿].*$/, '') || t.title, back: true });

  view.innerHTML = `
    <p class="muted small">${esc(t.intro)}</p>
    ${t.stages.map((s) => {
      const mods = t.modules.filter((m) => m.stage === s.id);
      if (!mods.length) return '';
      return `
        <h2 class="section-title">${esc(s.name)} · from ${esc(s.after)}</h2>
        <p class="small faint" style="margin:0 2px 8px">${esc(s.note)}</p>
        <div class="stack">
          ${mods.map((m) => `<a class="tile" href="#/track/${esc(t.id)}/${esc(m.id)}">
            <span class="tile-ico">${esc((m.title.match(/[一-鿿]/) || [t.icon])[0])}</span>
            <span class="tile-main"><span class="tile-title">${esc(m.title)}</span>
              <span class="tile-sub">${esc(m.blurb)}</span></span>
            <span class="tile-end">${CHEV}</span></a>`).join('')}
        </div>`;
    }).join('')}`;
}

// ---------------------------------------------------------------- one module
export async function module({ params, view, setChrome, signal }) {
  const [t] = await Promise.all([getTrack(params[0]).catch(() => null), dict.ready()]);
  const m = t?.modules.find((x) => x.id === params[1]);
  if (!m) { view.innerHTML = `<div class="empty"><p>Not found.</p></div>`; return; }
  setChrome({ title: m.title.replace(/\s*[぀-鿿]+\s*$/, '') || m.title, back: true });

  if (m.kind === 'transform') return transform(m, view, signal);
  if (m.kind === 'template') return template(m, view, signal);
  return phrases(m, view, signal);
}

// ---------------------------------------------------------------- phrases
function phrases(m, view, signal) {
  view.innerHTML = `
    <h2 style="font-size:18px">${esc(m.title)}</h2>
    <p class="muted small" style="margin-top:4px">${esc(m.blurb)}</p>
    ${m.note ? `<p class="small" style="margin-top:8px;color:var(--indigo)">${esc(m.note)}</p>` : ''}
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
    await savePhrase(it);
    sv.textContent = '★ Saved';
    buzz(12);
    toast('Added to your reviews');
  }, { signal });
}

async function savePhrase(it) {
  await store.put('saved', {
    key: it.ja, word: it.ja, reading: it.r || '', meaning: it.en,
    lv: 'TRACK', vocabId: null, added: Date.now(),
  });
  if (!(await store.get('cards', `saved:${it.ja}:rec`))) {
    await store.put('cards', newCard(`saved:${it.ja}:rec`, 'saved',
      { word: it.ja, reading: it.r || '', ord: -Date.now() }));
  }
  window.dispatchEvent(new CustomEvent('nihongo:saved-changed'));
}

// ---------------------------------------------------------------- transform
/**
 * A comparison table plus a drill generated from it. Columns are declared by
 * the data, so the same renderer handles keigo (plain/丁寧/尊敬/謙譲), Kansai
 * (standard/dialect), counters (1/3/6/8/10) and register conversion.
 */
function transform(m, view, signal) {
  const cols = m.columns?.length ? m.columns : [{ key: 'ja', label: 'Japanese' }];
  const has = (it, k) => it[k] && it[k] !== '—';
  let mode = 'table';

  /**
   * One card per row, not one table.
   *
   * This was a <table> with a column per form and `white-space: nowrap`, which
   * on a phone meant a four-column grid of Japanese inside a horizontal
   * scroller: every form too small to read and half of them off-screen. The
   * same data as a stack of cards — the form you know at the top, each
   * transformation under its own label — needs no sideways scrolling and gives
   * every form room to be read, heard and tapped for a definition.
   */
  // Not every column is a form you could say: 地方 is a region, and the counter
  // tables are indexed by a bare numeral. Those are labels on the row, so they
  // get no voice button and no dictionary lookup.
  const META = new Set(['region', 'where', 'n', 'number']);
  const form = (it, c, { head = false } = {}) => {
    if (META.has(c.key)) return `<div class="xcard-meta">${esc(it[c.key])}</div>`;
    return `<div class="jp-md ${head ? 'xcard-head' : 'xcard-form'}" lang="ja">${tappable(it[c.key] ?? '—')}
      ${canSpeak() && has(it, c.key) ? `<button class="btn btn-sm xsay" data-say="${esc(it[c.key])}" aria-label="Hear it">🔊</button>` : ''}
    </div>`;
  };

  const table = () => {
    const [first, ...rest] = cols;
    return `<div class="stack" id="xcards">
      ${m.items.map((it) => `
        <div class="card xcard">
          <div class="xcard-label">${esc(first.label)}</div>
          ${form(it, first, { head: true })}
          ${it.en ? `<div class="ex-en">${esc(it.en)}</div>` : ''}
          ${rest.filter((c) => has(it, c.key)).map((c) => `
            <div class="xrow">
              <div class="xcard-label xcard-label-alt">${esc(c.label)}</div>
              ${form(it, c)}
            </div>`).join('')}
          ${it.note ? `<p class="small xcard-note">${esc(it.note)}</p>` : ''}
        </div>`).join('')}
    </div>`;
  };

  let asked = 0, right = 0;
  const drill = () => {
    if (signal?.aborted) return;
    // Ask: given the first column, produce one of the others.
    const from = cols[0].key;
    const targets = cols.slice(1);
    const pool = m.items.filter((it) => has(it, from) && targets.some((c) => has(it, c.key)));
    if (pool.length < 4) {
      view.querySelector('#pane').innerHTML = `<div class="empty"><p>Not enough rows to drill.</p></div>`;
      return;
    }
    const it = pool[Math.floor(Math.random() * pool.length)];
    const avail = targets.filter((c) => has(it, c.key));
    const col = avail[Math.floor(Math.random() * avail.length)];
    const answer = it[col.key];

    const wrong = new Set();
    let guard = 0;
    while (wrong.size < 3 && guard++ < 80) {
      const o = pool[Math.floor(Math.random() * pool.length)];
      const c = targets[Math.floor(Math.random() * targets.length)];
      if (has(o, c.key) && o[c.key] !== answer) wrong.add(o[c.key]);
    }
    const opts = [answer, ...wrong].sort(() => 0.5 - Math.random());

    view.querySelector('#pane').innerHTML = `
      <div class="review-top"><span>${right}/${asked}</span>
        <span class="bar" style="flex:1"><i style="width:${asked ? (right / asked) * 100 : 0}%"></i></span></div>
      <div class="review-card" style="margin-top:10px">
        <div class="jp-lg" lang="ja">${esc(it[from])}</div>
        ${it.en ? `<div class="muted">${esc(it.en)}</div>` : ''}
        <div style="font-size:17px;font-weight:650;margin-top:10px">→ ${esc(col.label)}</div>
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

  const render = () => {
    view.innerHTML = `
      <h2 style="font-size:18px">${esc(m.title)}</h2>
      <p class="muted small" style="margin-top:4px">${esc(m.blurb)}</p>
      ${m.note ? `<p class="small" style="margin-top:8px;color:var(--indigo)">${esc(m.note)}</p>` : ''}
      <div class="seg" style="margin:14px 0">
        <button data-m="table" aria-pressed="${mode === 'table'}">Compare</button>
        <button data-m="drill" aria-pressed="${mode === 'drill'}">Drill</button>
      </div>
      <div id="pane">${mode === 'table' ? table() : ''}</div>`;
    view.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.m; render();
    }, { signal }));

    const cards = view.querySelector('#xcards');
    if (cards) {
      bindWordTaps(cards);
      cards.addEventListener('click', (e) => {
        const say = e.target.closest('[data-say]');
        if (say) speak(say.dataset.say);
      }, { signal });
    }
    if (mode === 'drill') drill();
  };
  render();
}

// ---------------------------------------------------------------- template
function template(m, view, signal) {
  const chosen = m.slots.map(() => 0);
  const compose = () => m.slots.map((s, i) => s.options[chosen[i]]).join('\n\n');

  const render = () => {
    view.innerHTML = `
      <h2 style="font-size:18px">${esc(m.title)}</h2>
      <p class="muted small" style="margin-top:4px">${esc(m.blurb)}</p>
      ${m.note ? `<p class="small" style="margin-top:8px;color:var(--indigo)">${esc(m.note)}</p>` : ''}

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

      <h3 class="section-title">Your version</h3>
      <div class="card"><pre class="jp-sm" lang="ja" id="out"
        style="white-space:pre-wrap;margin:0;font-family:var(--jp)">${esc(compose())}</pre></div>
      <button class="btn btn-block" id="copy" style="margin-top:10px">Copy</button>

      ${m.cushions?.length ? `<h3 class="section-title">Useful alongside</h3>
        <div class="stack">
          ${m.cushions.map((c) => `<div class="card">
            <div class="jp-md" lang="ja">${esc(c.ja)}</div>
            <div class="small faint jp-sm" lang="ja">${esc(c.r)}</div>
            <div class="ex-en">${esc(c.en)}</div>
          </div>`).join('')}
        </div>` : ''}`;
  };

  // Bound once, outside render(): binding inside doubles handlers on every tap.
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
