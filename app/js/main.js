// App shell: routing, chrome, service worker, install prompt.
import * as store from './store.js';
import * as dict from './dict.js';
import { toast, closeSheet } from './ui.js';
import { inventory } from './progress.js';

const view = document.getElementById('view');
const appbar = document.getElementById('appbar');
const tabbar = document.getElementById('tabbar');
const titleEl = document.getElementById('appbarTitle');
const backBtn = document.getElementById('backBtn');
const actions = document.getElementById('appbarActions');

// ---------- routes ----------
const routes = [
  [/^\/today$/, () => import('./screens/home.js').then((m) => m.today)],
  [/^\/levels$/, () => import('./screens/home.js').then((m) => m.levels)],
  [/^\/level\/(N[1-5])$/, () => import('./screens/home.js').then((m) => m.level)],
  [/^\/words\/(N[1-5])(?:\/(list|cards|quiz|match|listen))?$/, () => import('./screens/browse.js').then((m) => m.words)],
  [/^\/kanji\/(N[1-5])(?:\/(list|cards|quiz|match|listen))?$/, () => import('./screens/browse.js').then((m) => m.kanjiList)],
  [/^\/grammar\/(N[1-5])$/, () => import('./screens/browse.js').then((m) => m.grammarList)],
  [/^\/grammar\/(N[1-5])\/(\d+)$/, () => import('./screens/browse.js').then((m) => m.grammarPoint)],
  [/^\/kana$/, () => import('./screens/browse.js').then((m) => m.kana)],
  [/^\/conjugate\/(N[1-5])$/, () => import('./screens/browse.js').then((m) => m.conjugate)],
  [/^\/review(?:\/(.+))?$/, () => import('./screens/review.js').then((m) => m.review)],
  [/^\/learn\/(N[1-5])(?:\/(kanji))?$/, () => import('./screens/review.js').then((m) => m.learn)],
  [/^\/produce$/, () => import('./screens/produce.js').then((m) => m.produce)],
  [/^\/watch(?:\/(N[1-5]))?$/, () => import('./screens/watch.js').then((m) => m.list)],
  [/^\/watch\/v\/([\w-]+)$/, () => import('./screens/watch.js').then((m) => m.player)],
  [/^\/read(?:\/(N[1-5]))?$/, () => import('./screens/read.js').then((m) => m.list)],
  [/^\/listen(?:\/(N[1-5]))?$/, () => import('./screens/listen.js').then((m) => m.list)],
  [/^\/listen\/s\/([\w-]+)$/, () => import('./screens/listen.js').then((m) => m.player)],
  [/^\/read\/s\/([\w-]+)$/, () => import('./screens/read.js').then((m) => m.reader)],
  [/^\/saved$/, () => import('./screens/me.js').then((m) => m.saved)],
  [/^\/stats$/, () => import('./screens/me.js').then((m) => m.stats)],
  [/^\/settings$/, () => import('./screens/me.js').then((m) => m.settings)],
  [/^\/credits$/, () => import('./screens/me.js').then((m) => m.credits)],
  [/^\/tracks$/, () => import('./screens/tracks.js').then((m) => m.hub)],
  [/^\/track\/([\w-]+)$/, () => import('./screens/tracks.js').then((m) => m.track)],
  [/^\/track\/([\w-]+)\/([\w-]+)$/, () => import('./screens/tracks.js').then((m) => m.module)],
  // the old business-only URLs still work
  [/^\/business$/, () => import('./screens/tracks.js').then((m) => (a) => m.track({ ...a, params: ['business'] }))],
  [/^\/business\/([\w-]+)$/, () => import('./screens/tracks.js').then((m) => (a) => m.module({ ...a, params: ['business', a.params[0]] }))],
];

const TABS = { today: /^\/today/, levels: /^\/(levels|level|words|kanji|grammar|kana|watch|read|learn|conjugate|business|tracks|track|produce|listen)/, saved: /^\/saved/, stats: /^\/(stats|settings|credits)/ };

export const go = (path, replace = false) => {
  if (replace) location.replace(`#${path}`);
  else location.hash = path;
};

export function setChrome({ title, back = false, actions: acts = '' }) {
  titleEl.textContent = title;
  backBtn.hidden = !back;
  actions.innerHTML = acts;
}

let currentToken = 0;
/**
 * Every screen gets an AbortController that the router aborts the moment you
 * navigate away. Screens pass `signal` to addEventListener and check
 * `signal.aborted` after any await, so a screen that is already gone can never
 * attach a surviving listener, fire a timer, or paint over its successor.
 */
let currentAbort = null;
export const isStale = (signal) => !!signal?.aborted;

async function render() {
  closeSheet();
  const path = (location.hash || '#/today').slice(1);
  const token = ++currentToken;
  currentAbort?.abort();
  const ac = new AbortController();
  currentAbort = ac;

  for (const [re, load] of routes) {
    const m = re.exec(path);
    if (!m) continue;
    let screen;
    try {
      screen = await load();
    } catch (e) {
      console.error(e);
      if (token !== currentToken) return;
      view.innerHTML = `<div class="empty"><div class="empty-mark">×</div><p>Could not load that screen.</p></div>`;
      return;
    }
    if (token !== currentToken) return; // a newer navigation won
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    try {
      await screen({ params: m.slice(1), view, setChrome, go, signal: ac.signal });
    } catch (e) {
      console.error(e);
      // The screen may have been abandoned mid-await; do not paint over its successor.
      if (token !== currentToken) return;
      if (e?.name === 'OfflineDataError') {
        const lv = /levels\/(n[1-5])\//.exec(e.path || '')?.[1]?.toUpperCase();
        view.innerHTML = `<div class="empty"><div class="empty-mark">⇣</div>
          <p><b>${lv ? `${lv} is not downloaded yet.` : 'This is not downloaded yet.'}</b></p>
          <p class="small" style="margin-top:8px">Connect once to fetch it, or open the level
          and tap "Download for offline" so it is always here.</p>
          ${lv ? `<a class="btn btn-primary" style="margin-top:16px" href="#/level/${lv}">Go to ${lv}</a>` : ''}
        </div>`;
        return;
      }
      view.innerHTML = `<div class="empty"><div class="empty-mark">×</div><p>Something went wrong.</p>
        <p class="small faint" style="margin-top:8px">${String(e.message || e)}</p></div>`;
    }
    if (token !== currentToken) return;
    for (const [name, tre] of Object.entries(TABS)) {
      const a = tabbar.querySelector(`[data-tab="${name}"]`);
      if (a) a.setAttribute('aria-current', tre.test(path) ? 'page' : 'false');
    }
    view.focus({ preventScroll: true });
    refreshBadge();
    return;
  }
  go('/today', true);
}

backBtn.addEventListener('click', () => history.back());
window.addEventListener('hashchange', render);

// ---------- due badge ----------
export async function refreshBadge() {
  try {
    const inv = await inventory();
    const b = document.getElementById('dueBadge');
    b.textContent = inv.due > 99 ? '99+' : String(inv.due);
    b.hidden = inv.due === 0;
    if (navigator.setAppBadge) {
      if (inv.due) navigator.setAppBadge(inv.due).catch(() => {});
      else navigator.clearAppBadge?.().catch(() => {});
    }
  } catch { /* badge is cosmetic */ }
}
window.addEventListener('nihongo:progress', refreshBadge);
window.addEventListener('nihongo:saved-changed', refreshBadge);

// ---------- install ----------
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  window.dispatchEvent(new CustomEvent('nihongo:installable'));
});
export const installable = () => !!deferredInstall;
export const isInstalled = () =>
  matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export async function promptInstall() {
  if (!deferredInstall) return false;
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  deferredInstall = null;
  return outcome === 'accepted';
}
export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// ---------- service worker ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          // Only offer the swap once an old worker is actually controlling the
          // page — otherwise this is just the first install, not an update.
          if (w.state === 'installed' && navigator.serviceWorker.controller) {
            const bar = document.getElementById('updateBar');
            bar.hidden = false;
            document.getElementById('updateBtn').onclick = () => {
              w.postMessage({ type: 'SKIP_WAITING' });
              bar.hidden = true;
            };
          }
        });
      });
      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;      // guard against a reload loop
        reloading = true;
        location.reload();
      });
    } catch (e) { console.warn('service worker not registered:', e); }
  });
}

// ---------- boot ----------
async function boot() {
  const theme = await store.setting('theme', 'system');
  if (theme !== 'system') document.documentElement.dataset.theme = theme;

  // Ask on every launch: on iOS the grant depends on being a Home Screen app,
  // which only becomes true after the user installs.
  store.requestPersistence().catch(() => {});

  // The dictionary powers tap-a-word everywhere, so load it before first paint
  // of any content screen, but never block the shell on it.
  dict.load().catch((e) => {
    console.warn('dictionary failed to load', e);
    toast('Dictionary unavailable — word lookup is off', 4000);
  });

  document.getElementById('boot').remove();
  appbar.hidden = false;
  tabbar.hidden = false;
  await render();
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('boot').innerHTML =
    `<p class="boot-text">Could not start: ${String(e.message || e)}</p>`;
});
