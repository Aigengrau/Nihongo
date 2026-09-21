// Video with big dual-language subtitles, every Japanese word tappable.
//
// The subtitle panel sits BELOW the player, never over it: YouTube's Required
// Minimum Functionality terms forbid overlaying anything in front of an
// embedded player. It also happens to be the better phone layout — you cannot
// tap a word through an overlay, and iOS fullscreen would hide it anyway.
import * as data from '../data.js';
import * as store from '../store.js';
import { esc, tappable, bindWordTaps, toast, knownWords, loadFurigana } from '../ui.js';
import * as dict from '../dict.js';

const CHEV = `<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- list
export async function list({ params, view, setChrome }) {
  const lv = params[0] || (await store.setting('level', 'N5'));
  setChrome({ title: 'Watch', back: true });

  const all = await data.videoIndex();
  if (!all.length) {
    view.innerHTML = `<div class="empty"><div class="empty-mark">見</div>
      <p><b>The video catalogue is missing.</b></p>
      <p class="small" style="margin-top:8px">Run <code>npm run build</code> to regenerate it.</p></div>`;
    return;
  }

  const forLevel = all.filter((v) => v.lv === lv);
  const others = all.filter((v) => v.lv !== lv);
  const baked = all.filter((v) => v.subs).length;

  const card = (v) => `
    <a class="tile" href="#/watch/v/${esc(v.id)}">
      <span class="tile-ico lv-${v.lv}" style="color:var(--lv)">${esc(v.lv)}</span>
      <span class="tile-main">
        <span class="tile-title">${esc(v.title || v.id)}</span>
        <span class="tile-sub">${esc(v.channel || '')} · ${mmss(v.durationSec || 0)}${
          v.subs ? ` · ${v.cues} tappable lines${v.enTrack ? ' + English' : ''}` : ' · subtitles not downloaded'
        }</span>
      </span>
      <span class="tile-end">${CHEV}</span>
    </a>`;

  view.innerHTML = `
    <div class="seg" role="group" aria-label="Level">
      ${data.LEVELS.map((l) => `<button data-lv="${l}" aria-pressed="${l === lv}">${l}</button>`).join('')}
    </div>

    ${baked === 0 ? `
      <div class="card" style="margin-top:12px;border-color:var(--amber)">
        <div style="font-weight:700">Tappable subtitles are not downloaded yet</div>
        <p class="small muted" style="margin-top:6px">
          These ${all.length} videos were each checked and do have a human-written Japanese
          caption track, but the tracks have to be downloaded on a computer before the app
          can make each word tappable — YouTube will not let a phone fetch them directly.
        </p>
        <p class="small muted" style="margin-top:6px">
          On the computer running this app: <code>npm run bake:videos</code>, then
          <code>npm run build</code>. YouTube rate-limits it, so it may need a few runs.
        </p>
        <p class="small muted" style="margin-top:6px">
          Until then you can still watch these with YouTube's own captions, and
          <a href="#/read/s/paste" style="color:var(--accent);text-decoration:underline">paste any Japanese text</a>
          to get the tappable reader.
        </p>
      </div>` : `
      <p class="small muted" style="margin:12px 2px">
        Tap any Japanese word in the subtitles to see what it means and save it.
        ${navigator.onLine ? '' : '<b>Offline — the video will not play, but the script still works.</b>'}
      </p>`}

    <h2 class="section-title">${esc(lv)} · ${forLevel.length} videos</h2>
    <div class="stack">${forLevel.map(card).join('') || '<p class="muted small">No videos at this level yet.</p>'}</div>
    ${others.length ? `<h2 class="section-title">Other levels</h2><div class="stack">${others.map(card).join('')}</div>` : ''}
  `;

  view.querySelectorAll('[data-lv]').forEach((b) =>
    b.addEventListener('click', () => { location.hash = `/watch/${b.dataset.lv}`; }));
}

// ---------------------------------------------------------------- player
let ytReady = null;
function loadYT() {
  if (ytReady) return ytReady;
  ytReady = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prev?.(); resolve(window.YT); };
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.async = true;
    s.onerror = () => reject(new Error('offline'));
    document.head.appendChild(s);
    setTimeout(() => reject(new Error('timeout')), 8000);
  }).catch((e) => { ytReady = null; throw e; });
  return ytReady;
}

export async function player({ params, view, setChrome }) {
  const id = params[0];
  setChrome({ title: 'Watch', back: true });

  // A video may be in the catalogue without its caption track baked yet. It is
  // still watchable — just with YouTube's own captions instead of tappable ones.
  // Consult the catalogue first so we never request a file we know is absent.
  const cat = await data.videoIndex();
  const meta = cat.find((v) => v.id === id);
  if (!meta) {
    view.innerHTML = `<div class="empty"><div class="empty-mark">×</div><p>That video is not in the catalogue.</p></div>`;
    return;
  }
  let doc = { ...meta, cues: [] };
  if (meta.subs) {
    try { doc = await data.video(id); } catch { /* fall back to the catalogue entry */ }
  }

  const cues = doc.cues || [];
  // Subtitle words are only tappable once the dictionary is in memory.
  const [haveDict, , known] = await Promise.all([dict.ready(), loadFurigana(), knownWords()]);

  view.innerHTML = `
    <div class="player-wrap"><div class="player-box" id="pbox"><div id="ytplayer"></div></div></div>
    <div class="spread" style="margin-top:12px">
      <div style="min-width:0">
        <h2 style="font-size:16px">${esc(doc.title)}</h2>
        <p class="small faint">${esc(doc.channel || '')} · <span class="lv-chip lv-${doc.lv}">${esc(doc.lv)}</span>
          ${doc.jaTrack === 'asr' ? ' · auto-captions, may contain errors' : ''}</p>
      </div>
      <button class="btn btn-sm" id="autoscroll" aria-pressed="true">Follow</button>
    </div>
    ${haveDict ? '' : '<p class="small faint" style="margin-top:8px">Dictionary unavailable — word lookup is off for now.</p>'}
    <div class="subs" id="subs"></div>
    <div class="vbar" id="vbar" hidden>
      <button class="vbar-btn" id="back5" aria-label="Back 5 seconds">
        <svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a6 6 0 11-6 6H4a8 8 0 108-8z"/></svg></button>
      <button class="vbar-btn" id="play" aria-label="Play or pause">
        <svg viewBox="0 0 24 24" id="playIcon"><path d="M8 5v14l11-7z"/></svg></button>
      <button class="vbar-btn" id="repeat" aria-label="Repeat this line">
        <svg viewBox="0 0 24 24"><path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/></svg></button>
      <span class="small muted" id="clock" style="margin-left:auto">0:00</span>
    </div>
  `;

  const subs = view.querySelector('#subs');
  if (!cues.length) {
    subs.innerHTML = `
      <div class="card" style="margin-top:12px">
        <div style="font-weight:700">Tappable subtitles not downloaded for this one</div>
        <p class="small muted" style="margin-top:6px">
          YouTube's own captions are switched on in the player above. To get the big
          tappable version, run <code>npm run bake:videos</code> on your computer.
        </p>
        <a class="btn btn-block" style="margin-top:10px" href="#/read/s/paste">Paste Japanese text instead</a>
      </div>`;
  } else subs.innerHTML = cues.map((c, n) => `
    <button class="subline" data-n="${n}" data-t="${c.t}">
      <span class="ja" lang="ja">${tappable(c.x, { knownMap: known })}</span>
      ${c.en ? `<span class="en">${esc(c.en)}</span>` : ''}
    </button>`).join('');

  let yt = null;
  let scriptOnly = false;   // true when YouTube could not be reached
  let follow = true;
  let active = -1;

  const setActive = (n, scroll) => {
    if (n === active) return;
    const prev = subs.querySelector('[data-active="true"]');
    if (prev) prev.dataset.active = 'false';
    active = n;
    const node = subs.querySelector(`[data-n="${n}"]`);
    if (!node) return;
    node.dataset.active = 'true';
    if (scroll && follow) node.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };

  const cueAt = (t) => {
    // cues are time-ordered; a linear scan from the current position is plenty
    for (let n = 0; n < cues.length; n++) {
      const c = cues[n];
      if (t >= c.t && t < c.t + (c.d || 2.5)) return n;
      if (c.t > t) return n > 0 ? n - 1 : -1;
    }
    return cues.length - 1;
  };

  // Tapping a word pauses playback so the learner can read in peace.
  // pauseVideo() is not gesture-gated (unlike playVideo) so this is safe on iOS.
  bindWordTaps(subs, () => { try { yt?.pauseVideo?.(); } catch { /* not ready */ } });

  subs.addEventListener('click', (e) => {
    if (e.target.closest('.wchip')) return;
    const line = e.target.closest('.subline');
    if (!line) return;
    const t = +line.dataset.t;
    setActive(+line.dataset.n, false);
    try { yt?.seekTo?.(t, true); } catch { /* script mode */ }
  });

  view.querySelector('#autoscroll').addEventListener('click', (e) => {
    follow = !follow;
    e.currentTarget.setAttribute('aria-pressed', String(follow));
    e.currentTarget.textContent = follow ? 'Follow' : 'Free';
  });

  try {
    const YT = await loadYT();
    yt = new YT.Player('ytplayer', {
      videoId: id,
      playerVars: {
        playsinline: 1,       // required or iOS takes over the whole screen
        // Our own captions render below the player; when they are not baked
        // yet, fall back to YouTube's own so the screen is still useful.
        cc_load_policy: cues.length ? 0 : 1,
        cc_lang_pref: 'ja',
        rel: 0, modestbranding: 1, iv_load_policy: 3,
      },
      events: {
        onReady: () => {
          view.querySelector('#vbar').hidden = false;
          tick();
        },
        onStateChange: (e) => {
          const playing = e.data === YT.PlayerState.PLAYING;
          view.querySelector('#playIcon').innerHTML = playing
            ? '<path d="M6 5h4v14H6zm8 0h4v14h-4z"/>'
            : '<path d="M8 5v14l11-7z"/>';
          if (playing) keepAwake();
        },
      },
    });
  } catch {
    scriptOnly = true;
    view.querySelector('#pbox').innerHTML =
      `<div class="empty" style="color:#fff;padding:22px"><p><b>Video unavailable offline.</b></p>
       <p class="small" style="margin-top:6px">The script below still works — tap through the lines at your own pace.</p></div>`;
    setActive(0, false);
  }

  view.querySelector('#play')?.addEventListener('click', () => {
    if (!yt) return;
    const s = yt.getPlayerState?.();
    if (s === 1) yt.pauseVideo(); else yt.playVideo();
  });
  view.querySelector('#back5')?.addEventListener('click', () => {
    try { yt?.seekTo(Math.max(0, yt.getCurrentTime() - 5), true); } catch { /* ignore */ }
  });
  view.querySelector('#repeat')?.addEventListener('click', () => {
    const c = cues[active];
    if (c && yt) { yt.seekTo(c.t, true); yt.playVideo(); }
  });

  // ~8fps is enough to keep subtitles in sync and cheap on battery.
  let raf = null;
  function tick() {
    if (!yt?.getCurrentTime) return;
    let t = 0;
    try { t = yt.getCurrentTime(); } catch { return; }
    const clock = view.querySelector('#clock');
    if (clock) clock.textContent = mmss(t);
    const n = cueAt(t);
    if (n >= 0) setActive(n, true);
    raf = setTimeout(tick, 125);
  }

  let wakeLock = null;
  async function keepAwake() {
    try { wakeLock = wakeLock || await navigator.wakeLock?.request('screen'); } catch { /* unsupported */ }
  }

  // Stop the timer when the screen is replaced.
  const stop = () => {
    clearTimeout(raf);
    try { wakeLock?.release?.(); } catch { /* ignore */ }
    try { yt?.destroy?.(); } catch { /* ignore */ }
    window.removeEventListener('hashchange', stop);
  };
  window.addEventListener('hashchange', stop);
}
