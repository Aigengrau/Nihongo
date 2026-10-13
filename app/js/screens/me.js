// Saved words, stats, settings, credits.
import * as data from '../data.js';
import * as store from '../store.js';
import { esc, ruby, toast, openWordSheet, canSpeak, speak, SPEECH_RATES, getSpeechRate, setSpeechRate, rateLabel } from '../ui.js';
import * as register from '../register.js';
import { inventory, streak, history, stage, STAGES, today as todayCounts } from '../progress.js';
import { humanInterval, STATE } from '../srs.js';

// ---------------------------------------------------------------- saved
export async function saved({ view, setChrome, signal }) {
  setChrome({ title: 'My words', back: false });

  const render = async () => {
    const [rows, cards] = await Promise.all([store.all('saved'), store.all('cards')]);
    const byKey = new Map(cards.map((c) => [c.key, c]));
    rows.sort((a, b) => b.added - a.added);

    if (!rows.length) {
      view.innerHTML = `<div class="empty"><div class="empty-mark">★</div>
        <p><b>No saved words yet.</b></p>
        <p class="small" style="margin-top:8px">Tap any Japanese word while watching or reading —
        in subtitles, stories, example sentences — and save it here. They join your reviews automatically.</p>
        <a class="btn btn-primary" style="margin-top:18px" href="#/watch">Watch something</a></div>`;
      return;
    }

    const dueNow = rows.filter((r) => {
      const c = byKey.get(`saved:${r.key}:rec`);
      return c && c.due <= Date.now();
    }).length;

    view.innerHTML = `
      ${dueNow ? `<a class="cta" href="#/review/saved">
        <span class="cta-n">${dueNow}</span>
        <span><span class="cta-t">Review your saved words</span><br>
        <span class="cta-s">Just the ones you picked out yourself</span></span></a>` : ''}
      <p class="small faint" style="margin:14px 2px">${rows.length} saved</p>
      <div class="list" id="rows">
        ${rows.map((r) => {
          const c = byKey.get(`saved:${r.key}:rec`);
          const st = c ? stage(c) : 'new';
          const when = c && c.state !== STATE.NEW
            ? (c.due <= Date.now() ? 'due now' : `in ${humanInterval((c.due - Date.now()) / 86400000)}`)
            : 'not studied';
          return `<div class="wrow">
            <button class="wrow-main" data-word="${esc(r.word)}" style="text-align:left">
              <span class="wrow-jp" lang="ja">${esc(r.word)}</span>
              <span class="wrow-en">${esc(r.meaning || '')}</span>
            </button>
            <span class="tile-end small faint" style="flex-direction:column;align-items:flex-end;gap:2px">
              <span class="pos-tag">${st}</span><span style="font-size:11px">${when}</span>
            </span>
            <button class="appbar-icon" data-del="${esc(r.key)}" aria-label="Remove" style="width:36px;height:36px">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M6 7h12l-1 13H7zM9 4h6l1 2H8z"/></svg>
            </button>
          </div>`;
        }).join('')}
      </div>
      <button class="btn btn-block btn-ghost" id="export" style="margin-top:16px">Back up my words</button>
    `;

    view.querySelector('#rows').addEventListener('click', async (e) => {
      const w = e.target.closest('[data-word]');
      if (w) return openWordSheet(w.dataset.word);
      const d = e.target.closest('[data-del]');
      if (d) {
        await store.del('saved', d.dataset.del);
        await store.del('cards', `saved:${d.dataset.del}:rec`);
        toast('Removed');
        render();
      }
    });
    view.querySelector('#export').addEventListener('click', downloadBackup);
  };

  // Bound to the screen's lifetime: without this, saving a word from a story
  // later on would repaint the saved-word list over whatever you were reading.
  window.addEventListener('nihongo:saved-changed', () => {
    if (location.hash === '#/saved') render();
  }, { signal });
  render();
}

async function downloadBackup() {
  const dump = await store.exportAll();
  const blob = new Blob([JSON.stringify(dump, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `nihongo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  await store.put('progress', { key: 'lastBackup', at: Date.now() });
  toast(`Backed up ${dump.counts.cards} cards`);
}

// ---------------------------------------------------------------- stats
export async function stats({ view, setChrome }) {
  setChrome({
    title: 'Stats',
    actions: `<a class="appbar-icon" href="#/settings" aria-label="Settings">
      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8a4 4 0 100 8 4 4 0 000-8zm8.9 4a7 7 0 00-.1-1l2-1.6-2-3.4-2.4 1a7 7 0 00-1.7-1l-.4-2.5h-4l-.4 2.6a7 7 0 00-1.7 1l-2.4-1-2 3.4L7.2 11a7 7 0 000 2l-2 1.6 2 3.4 2.4-1a7 7 0 001.7 1l.4 2.5h4l.4-2.6a7 7 0 001.7-1l2.4 1 2-3.4-2-1.6c0-.3.1-.6.1-1z"/></svg></a>`,
  });

  const [inv, st, hist, counts] = await Promise.all([inventory(), streak(), history(), todayCounts()]);
  const byStage = Object.fromEntries(STAGES.map((s) => [s, 0]));
  for (const c of inv.cards) byStage[stage(c)]++;

  const max = Math.max(1, ...hist.map((h) => h.n));
  const bucket = (n) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const total = hist.reduce((a, h) => a + h.n, 0);

  // Upcoming workload, so a backlog is visible before it becomes one.
  const upcoming = Array.from({ length: 7 }, (_, d) => {
    const from = Date.now() + d * 86400000;
    const to = from + 86400000;
    return inv.cards.filter((c) => c.due >= (d === 0 ? 0 : from) && c.due < to).length;
  });
  const upMax = Math.max(1, ...upcoming);

  view.innerHTML = `
    <div class="stat-grid">
      <div class="stat"><div class="stat-n">${st.current}</div><div class="stat-l">day streak · best ${st.best}</div></div>
      <div class="stat"><div class="stat-n">${total}</div><div class="stat-l">reviews all time</div></div>
      <div class="stat"><div class="stat-n">${inv.review + inv.learning}</div><div class="stat-l">words in progress</div></div>
      <div class="stat"><div class="stat-n">${byStage.burned}</div><div class="stat-l">mastered</div></div>
    </div>

    <h2 class="section-title">Last 17 weeks</h2>
    <div class="card"><div class="heat">
      ${hist.map((h) => `<i data-v="${bucket(h.n)}" title="${h.day}: ${h.n}"></i>`).join('')}
    </div></div>

    <h2 class="section-title">Coming up</h2>
    <div class="card">
      ${upcoming.map((n, d) => `<div class="spread" style="padding:5px 0">
        <span class="small muted" style="width:70px">${d === 0 ? 'Today' : new Date(Date.now() + d * 86400000).toLocaleDateString(undefined, { weekday: 'short' })}</span>
        <span class="bar" style="flex:1"><i style="width:${(n / upMax) * 100}%"></i></span>
        <span class="small" style="width:34px;text-align:right">${n}</span>
      </div>`).join('')}
    </div>

    <h2 class="section-title">Memory stages</h2>
    <div class="card">
      ${STAGES.filter((s) => s !== 'new').map((s) => `<div class="spread" style="padding:6px 0">
        <span class="small" style="text-transform:capitalize;width:110px">${s}</span>
        <span class="bar" style="flex:1"><i style="width:${inv.total ? (byStage[s] / inv.total) * 100 : 0}%"></i></span>
        <span class="small muted" style="width:44px;text-align:right">${byStage[s]}</span>
      </div>`).join('')}
      <p class="small faint" style="margin-top:10px">
        Stages come from how long your memory is predicted to last:
        apprentice &lt;1 day, guru &lt;2 weeks, master &lt;2 months, enlightened &lt;6 months, then burned.
      </p>
    </div>

    <h2 class="section-title">Today</h2>
    <div class="stat-grid">
      <div class="stat"><div class="stat-n">${counts.reviews}</div><div class="stat-l">reviews</div></div>
      <div class="stat"><div class="stat-n">${counts.new}</div><div class="stat-l">new words</div></div>
    </div>
  `;
}

// ---------------------------------------------------------------- settings
export async function settings({ view, setChrome }) {
  setChrome({ title: 'Settings', back: true });
  const [furi, newPerDay, theme, reviewCap] = await Promise.all([
    store.setting('furigana', 'auto'), store.setting('newPerDay', 10),
    store.setting('theme', 'system'), store.setting('reviewCap', 120),
  ]);
  await register.ready();
  const on = await register.enabledTags();
  const persist = await store.requestPersistence();
  const lastBackup = await store.get('progress', 'lastBackup');

  // Mid-upgrade, this screen can be newer than the main.js the page booted
  // from, so nothing here may assume a particular version of another module:
  // this screen going down is how someone loses the button that would have
  // fixed it. Updating has its own module for the same reason.
  const shell = await import('../main.js').catch(() => ({}));
  const isInstalled = shell.isInstalled ?? (() => true);
  const isIOS = shell.isIOS ?? (() => false);
  const updater = await import('../update.js').catch(() => null);
  const version = await updater?.appVersion().catch(() => null) ?? null;

  view.innerHTML = `
    ${!isInstalled() ? `<div class="card" style="border-color:var(--accent)">
      <div style="font-weight:700">Install on your phone</div>
      <p class="small muted" style="margin-top:4px">
        ${isIOS()
          ? 'Tap the Share button in Safari, then <b>Add to Home Screen</b>. Installing also stops iOS deleting your saved words.'
          : 'Add Nihongo to your home screen so it opens like an app and works offline.'}
      </p>
      ${!isIOS() ? `<button class="btn btn-primary btn-block" id="install" style="margin-top:10px">Install</button>` : ''}
    </div>` : ''}

    <h2 class="section-title">Study</h2>
    <div class="card">
      <div class="switch">
        <div><div>New words per day</div><div class="small faint">Fewer when reviews pile up</div></div>
        <select id="npd" class="btn btn-sm">${[5, 10, 15, 20, 30].map((n) => `<option ${n === newPerDay ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </div>
      <div class="switch" style="border-top:1px solid var(--line)">
        <div><div>Daily review cap</div><div class="small faint">Stops a backlog becoming unmanageable</div></div>
        <select id="cap" class="btn btn-sm">${[60, 120, 200, 400].map((n) => `<option ${n === reviewCap ? 'selected' : ''}>${n}</option>`).join('')}</select>
      </div>
      <div class="switch" style="border-top:1px solid var(--line)">
        <div><div>Furigana</div><div class="small faint">Reading hints above kanji</div></div>
        <select id="furi" class="btn btn-sm">
          <option value="always" ${furi === 'always' ? 'selected' : ''}>Always</option>
          <option value="auto" ${furi === 'auto' ? 'selected' : ''}>On reveal</option>
          <option value="never" ${furi === 'never' ? 'selected' : ''}>Never</option>
        </select>
      </div>
    </div>

    <h2 class="section-title">Speech</h2>
    <div class="card">
      <div class="switch">
        <div><div>Speaking speed</div>
          <div class="small faint">Used everywhere — cards, stories, Listen, drills</div></div>
        <select id="rate" class="btn btn-sm">
          ${SPEECH_RATES.map((r) => `<option value="${r}" ${r === getSpeechRate() ? 'selected' : ''}>${rateLabel(r)}</option>`).join('')}
        </select>
      </div>
      ${canSpeak() ? `<button class="btn btn-block btn-ghost" id="tryRate" style="margin-top:8px" lang="ja">Try it — 日本語を勉強しています</button>` : ''}
    </div>

    <h2 class="section-title">Casual and dialect</h2>
    <div class="card">
      <p class="small muted">Mark these forms wherever they appear, so you can tell at a glance
      what not to say at work. Tap a marked word for the explanation.</p>
      <div style="margin-top:10px">
        ${['casual', ...register.DIALECTS].map((t) => {
          const l = register.LABELS[t];
          return `<label class="switch" style="border-top:1px solid var(--line)">
            <div class="row" style="gap:8px">${register.badge(t)}
              <div><div>${esc(l.name)}</div><div class="small faint">${esc(l.hint)}</div></div></div>
            <input type="checkbox" data-reg="${t}" ${on.has(t) ? 'checked' : ''}>
          </label>`;
        }).join('')}
      </div>
      <a class="btn btn-block btn-ghost" style="margin-top:10px" href="#/marked">See every marked form</a>
    </div>

    <h2 class="section-title">Appearance</h2>
    <div class="card"><div class="switch">
      <div>Theme</div>
      <select id="theme" class="btn btn-sm">
        ${['system', 'dark', 'light'].map((t) => `<option value="${t}" ${t === theme ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div></div>

    <h2 class="section-title">Your data</h2>
    <div class="card">
      <p class="small muted">
        Everything you save lives only on this phone. ${persist.granted ? 'Storage is protected from automatic cleanup.' : 'Install the app to protect it from being cleared.'}
        ${persist.usage ? `<br>Using ${(persist.usage / 1048576).toFixed(1)} MB.` : ''}
        ${lastBackup ? `<br>Last backup ${new Date(lastBackup.at).toLocaleDateString()}.` : '<br><b>Never backed up.</b>'}
      </p>
      <button class="btn btn-block" id="export" style="margin-top:10px">Download a backup</button>
      <button class="btn btn-block btn-ghost" id="import" style="margin-top:8px">Restore from a backup</button>
      <input type="file" id="file" accept="application/json" hidden>
    </div>

    <h2 class="section-title">Version</h2>
    <div class="card">
      <p class="small muted">
        ${version ? `Running <b>${esc(version)}</b>.` : 'Running from the network — no offline copy yet.'}
        New versions install themselves in the background; the app offers to
        restart into one as soon as it is ready. You never reinstall it.
      </p>
      ${updater ? `<button class="btn btn-block" id="checkUpdate" style="margin-top:10px">Check for updates</button>
        <button class="btn btn-block btn-ghost" id="applyUpdate" style="margin-top:8px">Restart into the newest version</button>`
      : `<p class="small faint" style="margin-top:8px">Connect once to let it check.</p>`}
    </div>

    <h2 class="section-title">About</h2>
    <a class="tile" href="#/credits"><span class="tile-main"><span class="tile-title">Credits and licences</span>
      <span class="tile-sub">The open data this app is built on</span></span></a>
    <p class="small faint center" style="margin-top:20px">
      Speech ${canSpeak() ? 'available' : 'unavailable'} on this device.
    </p>
  `;

  view.querySelector('#install')?.addEventListener('click', async () => {
    if (!shell.installable?.()) return toast('Use your browser menu → Install app');
    await shell.promptInstall();
  });
  view.querySelector('#rate').addEventListener('change', async (e) => {
    await setSpeechRate(+e.target.value);
    speak('日本語を勉強しています');
  });
  view.querySelector('#tryRate')?.addEventListener('click', () => speak('日本語を勉強しています'));
  view.querySelectorAll('[data-reg]').forEach((cb) => cb.addEventListener('change', async () => {
    const tags = [...view.querySelectorAll('[data-reg]')].filter((x) => x.checked).map((x) => x.dataset.reg);
    await register.setEnabledTags(tags);
    toast(tags.length ? `Marking ${tags.length} register${tags.length === 1 ? '' : 's'}` : 'Marking off');
  }));
  view.querySelector('#npd').addEventListener('change', (e) => store.setSetting('newPerDay', +e.target.value));
  view.querySelector('#cap').addEventListener('change', (e) => store.setSetting('reviewCap', +e.target.value));
  view.querySelector('#furi').addEventListener('change', (e) => store.setSetting('furigana', e.target.value));
  view.querySelector('#theme').addEventListener('change', (e) => {
    const v = e.target.value;
    store.setSetting('theme', v);
    if (v === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = v;
  });
  view.querySelector('#checkUpdate')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = 'Checking…';
    const found = await updater.checkForUpdate({ force: true }).catch(() => false);
    btn.disabled = false;
    btn.textContent = 'Check for updates';
    // When one is found the bar appears on its own, with the button that applies it.
    toast(found ? 'A new version is ready — see the bar below' : 'You are on the latest version', 3000);
  });
  // The way out of a half-applied update: apply whatever is already downloaded,
  // without waiting for the bar or for the app to be closed and reopened.
  view.querySelector('#applyUpdate')?.addEventListener('click', async () => {
    const had = await updater.applyUpdate().catch(() => false);
    if (had) toast('Restarting into the new version…');
    else {
      const found = await updater.checkForUpdate({ force: true }).catch(() => false);
      if (found) await updater.applyUpdate().catch(() => false);
      toast(found ? 'Restarting into the new version…' : 'Already on the newest version', 3000);
    }
  });
  view.querySelector('#export').addEventListener('click', downloadBackup);
  view.querySelector('#import').addEventListener('click', () => view.querySelector('#file').click());
  view.querySelector('#file').addEventListener('change', async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      await store.importAll(data, 'merge');
      toast('Restored — merged with what you had');
      window.dispatchEvent(new CustomEvent('nihongo:progress'));
    } catch (err) { toast(`Could not restore: ${err.message}`, 4000); }
  });
}

// ---------------------------------------------------------------- marked forms
export async function marked({ view, setChrome }) {
  setChrome({ title: 'Casual & dialect', back: true });
  await register.ready();
  const on = await register.enabledTags();
  const rows = register.all();
  const groups = {};
  for (const r of rows) for (const t of r.t) (groups[t] ||= []).push(r);

  view.innerHTML = `
    <p class="muted small">${rows.length} forms the app marks as casual or dialect.
    ${on.size ? '' : '<b>Marking is currently off</b> — turn it on in Settings.'}</p>
    ${Object.entries(groups).map(([tag, list]) => `
      <h2 class="section-title">${register.badge(tag)} ${esc(register.LABELS[tag]?.name || tag)} · ${list.length}</h2>
      <div class="list">
        ${list.map((r) => `<button class="wrow" data-w="${esc(r.form)}">
          <span class="wrow-main">
            <span class="wrow-jp" lang="ja">${esc(r.form)}</span>
            <span class="wrow-en">${esc(r.en || '')}</span>
          </span>
          ${canSpeak() ? '<span class="tile-end small">🔊</span>' : ''}
        </button>`).join('')}
      </div>`).join('')}`;

  view.addEventListener('click', (e) => {
    const b = e.target.closest('[data-w]');
    if (!b) return;
    speak(b.dataset.w);
    openWordSheet(b.dataset.w);
  });
}

// ---------------------------------------------------------------- credits
export async function credits({ view, setChrome }) {
  setChrome({ title: 'Credits', back: true });
  const sources = [
    ['JMdict / JMnedict', 'Electronic Dictionary Research and Development Group', 'CC BY-SA 4.0', 'https://www.edrdg.org/jmdict/j_jmdict.html'],
    ['KANJIDIC2', 'EDRDG', 'CC BY-SA 4.0', 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project'],
    ['jmdict-simplified', 'scriptin', 'CC BY-SA 4.0', 'https://github.com/scriptin/jmdict-simplified'],
    ['japanese-language-data', 'jkindrix — grammar, furigana, frequency, radicals, cross-references', 'CC BY-SA 4.0', 'https://github.com/jkindrix/japanese-language-data'],
    ['OpenJLPT', 'evanclan — vocabulary and example pairs', 'CC BY-SA 4.0', 'https://github.com/evanclan/OpenJLPT'],
    ['JLPT level lists', 'Jonathan Waller, tanos.co.uk', 'CC BY 4.0', 'https://www.tanos.co.uk/jlpt/'],
    ['Tatoeba', 'Example sentences', 'CC BY 2.0 FR', 'https://tatoeba.org'],
    ['JmdictFurigana', 'Doublevil — ruby segmentation', 'CC BY-SA 4.0', 'https://github.com/Doublevil/JmdictFurigana'],
    ['Kanjium', 'Pitch accent data', 'CC BY-SA 4.0', 'https://github.com/mifunetoshiro/kanjium'],
    ['KanjiVG', 'Stroke order', 'CC BY-SA 3.0', 'https://kanjivg.tagaini.net/'],
    ['FSRS', 'Open Spaced Repetition — the scheduling algorithm', 'MIT', 'https://github.com/open-spaced-repetition'],
  ];
  view.innerHTML = `
    <p class="muted small">Nihongo is built entirely on openly licensed data. Derived data is
    redistributed under CC BY-SA 4.0, as those licences require.</p>
    <div class="stack" style="margin-top:14px">
      ${sources.map(([n, who, lic, url]) => `<a class="card" href="${url}" target="_blank" rel="noopener">
        <div style="font-weight:650">${esc(n)}</div>
        <div class="small muted">${esc(who)}</div>
        <div class="small faint" style="margin-top:3px">${esc(lic)}</div>
      </a>`).join('')}
    </div>
    <p class="small faint" style="margin-top:18px">
      Videos are embedded from YouTube and belong to their creators. Subtitles come from each
      video's own caption track.
    </p>`;
}
