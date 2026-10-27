/* Nihongo service worker.
 *
 * Three caches with different lifetimes:
 *   shell-<BUILD>  replaced wholesale on every deploy
 *   data-v1        level JSON, cache-first and never revalidated
 *   media-v1       same-origin audio, trimmed LRU-style
 *
 * Deliberate choices, each one load-bearing:
 *  - cross-origin requests are never intercepted (opaque responses are padded
 *    ~7MB each against the origin quota, and YouTube must not be cached)
 *  - install precaches file-by-file, so one 404 cannot abort the whole install
 *  - no skipWaiting() in install: swapping the worker under a live page would
 *    destroy a review in progress. The page offers a Restart button instead.
 *  - Range requests are answered with a real 206, or Safari's <audio> silently
 *    refuses to play.
 */
const BUILD = 'v1.3.0';
const SHELL = `shell-${BUILD}`;
// Versioned with the build: a fixed name meant shipped data corrections
// could never reach anyone who had already installed.
const DATA = `data-${BUILD}`;
const MEDIA = 'media-v1';

const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/main.js',
  './js/store.js',
  './js/data.js',
  './js/ui.js',
  './js/dict.js',
  './js/srs.js',
  './js/progress.js',
  './js/deinflect.js',
  './js/tokenize.js',
  './js/furigana.js',
  './js/screens/home.js',
  './js/screens/browse.js',
  './js/screens/review.js',
  './js/screens/watch.js',
  './js/screens/read.js',
  './js/screens/me.js',
  './js/screens/tracks.js',
  './js/register.js',
  './js/screens/produce.js',
  './js/screens/listen.js',
  './js/screens/drill.js',
  './js/screens/grammar.js',
  './js/grammar.js',
  './js/swipe.js',
  './js/update.js',
  './js/notify.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// Fetched right after the shell so the app is genuinely usable offline on
// first run. Total is a couple of MB — small enough not to need a prompt.
const CORE_DATA = [
  './data/index.json',
  './data/kana.json',
  './data/dict/common.json',          // the tap-any-word dictionary, 2.8 MB
  './data/register.json',
  './data/tracks/index.json',
  './data/i1.json',
  './data/sentence-words.json',
  './data/stories/index.json',
  './data/videos/index.json',
  './data/levels/n5/vocab.json',
  './data/levels/n5/kanji.json',
  './data/levels/n5/grammar.json',
];

// The remaining levels, the sentence corpus and the conjugation tables are
// several megabytes; they cache when visited, or all at once from the
// "Download for offline" button on a level screen.
const HEAVY = ['./data/sentences.json', './data/conjugations.json'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // One at a time: addAll is all-or-nothing and a single missing icon
    // would leave the app permanently un-installable.
    for (const url of SHELL_FILES) {
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch (err) { console.warn('[sw] precache skipped', url, err.message); }
    }
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.enable(); } catch { /* not supported */ }
    }
    await adoptPreviousData();
    const keep = new Set([SHELL, DATA, MEDIA]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();

    // Core data is re-fetched on every build, so a shipped correction reaches
    // everyone. Failures are not fatal — an update applied on the train still
    // leaves a working app.
    const cache = await caches.open(DATA);
    for (const url of CORE_DATA) {
      // add(), not put(): it refuses a 404 instead of caching the error page.
      try { await cache.add(new Request(url, { cache: 'reload' })); }
      catch { /* keep whatever was carried over */ }
    }
  })());
});

/**
 * Carry the previous build's downloaded data into this build's cache.
 *
 * The data cache is versioned per build so corrections can ship, but throwing
 * it away outright meant every update silently deleted the levels someone had
 * downloaded for offline — turning "update" into "lose the app on the train".
 * The core files above are refreshed regardless; the heavy ones move across,
 * and "Download for offline" re-fetches them whenever the learner wants.
 */
async function adoptPreviousData() {
  const old = (await caches.keys()).filter((k) => k.startsWith('data-') && k !== DATA);
  if (!old.length) return;
  const to = await caches.open(DATA);
  for (const name of old) {
    const from = await caches.open(name);
    for (const req of await from.keys()) {
      try {
        if (await to.match(req)) continue;
        const res = await from.match(req);
        if (res) await to.put(req, res);
      } catch { /* one file failing must not abandon the rest */ }
    }
  }
}

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'CACHE_LEVEL') e.waitUntil(cacheLevel(e.data.level, e.source));
  // So Settings can show which build is actually running.
  if (e.data?.type === 'VERSION') e.ports?.[0]?.postMessage({ version: BUILD });
  if (e.data?.type === 'RUN_REMINDERS') e.waitUntil(runReminders());
});

async function cacheLevel(level, client) {
  const lv = String(level).toLowerCase();
  const stories = await listStories(lv);
  const urls = [
    `./data/levels/${lv}/vocab.json`,
    `./data/levels/${lv}/kanji.json`,
    `./data/levels/${lv}/grammar.json`,
    ...HEAVY,
    ...stories,
  ];
  const cache = await caches.open(DATA);
  let done = 0;
  for (const u of urls) {
    try { await cache.add(new Request(u, { cache: 'reload' })); } catch { /* skip */ }
    client?.postMessage({ type: 'LEVEL_PROGRESS', level, done: ++done, total: urls.length });
  }
}

// Which story files belong to a level, so "download this level" gets them too.
async function listStories(lv) {
  try {
    const r = await fetch('./data/stories/index.json');
    if (!r.ok) return [];
    const idx = await r.json();
    return idx.filter((s) => String(s.lv).toLowerCase() === lv).map((s) => `./data/stories/${s.id}.json`);
  } catch { return []; }
}

const isData = (p) => p.includes('/data/');
const isMedia = (p) => /\.(mp3|m4a|ogg|wav)$/i.test(p);

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Never touch cross-origin traffic — YouTube, fonts, anything.
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = async () =>
        (await caches.match('./index.html')) || (await caches.match('./')) || null;
      // Hard offline rejects instantly, but the common phone failure is lie-fi:
      // the socket opens and nothing ever arrives. Race the cache so a complete
      // offline copy is never held hostage by one bar of signal.
      const net = (async () => {
        const pre = await e.preloadResponse;
        return pre || fetch(req);
      })();
      const timeout = new Promise((r) => setTimeout(() => r(null), 2500));
      try {
        const winner = await Promise.race([net.catch(() => null), timeout]);
        if (winner) return winner;
      } catch { /* fall through to cache */ }
      return (await cached()) ||
        new Response('<h1>Offline</h1>', { headers: { 'Content-Type': 'text/html' } });
    })());
    return;
  }

  if (isMedia(url.pathname)) { e.respondWith(serveMedia(req)); return; }

  if (isData(url.pathname)) {
    // Content is immutable per deploy: serve from cache, fill in on a miss.
    e.respondWith((async () => {
      const cache = await caches.open(DATA);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      try {
        const res = await fetch(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        // Tagged so the app can say "this level is not downloaded yet"
        // instead of printing a raw HTTP status at the user.
        return new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json', 'X-Nihongo-Offline': '1' },
        });
      }
    })());
    return;
  }

  // Shell: cache only, network as a fallback for anything not precached.
  //
  // This used to refresh each file in the background after serving it, which
  // quietly mixed builds: once a new version was deployed, a page that had
  // already loaded the old main.js would import a screen and get the NEW one
  // from the refreshed cache. Two builds in one page is not a stale page, it
  // is a broken one — the new Settings screen called an export yesterday's
  // main.js did not have, and the screen died.
  //
  // A build's shell is immutable. The new build has its own cache, precached
  // whole at install, and switches over in one step when the worker does.
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    // A hard reload is the one gesture that means "ignore what you have", and
    // it is how a developer sees an edit without bumping BUILD. Offline it
    // falls through to the cache, so this costs nothing on a train.
    if (req.cache === 'reload' || req.cache === 'no-store') {
      try { return await fetch(req); } catch { /* use the cache */ }
    }
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(req);
      if (res.ok) await cache.put(req, res.clone());
      return res;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});

/**
 * Safari's <audio> sends a Range header and silently refuses a cached 200.
 * Key the cache on a Range-less request and slice out a real 206.
 */
async function serveMedia(req) {
  const cache = await caches.open(MEDIA);
  const bare = new Request(req.url, { headers: stripRange(req.headers) });
  let res = await cache.match(bare);

  if (!res) {
    try {
      res = await fetch(bare);
      if (res.ok) await cache.put(bare, res.clone());
    } catch {
      return new Response('', { status: 504 });
    }
  }

  const range = req.headers.get('range');
  if (!range) return res;

  const buf = await res.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  const start = m[1] ? parseInt(m[1], 10) : 0;
  const end = m[2] ? parseInt(m[2], 10) : buf.byteLength - 1;
  if (start >= buf.byteLength) {
    return new Response('', { status: 416, headers: { 'Content-Range': `bytes */${buf.byteLength}` } });
  }
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'audio/mpeg',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
      'Accept-Ranges': 'bytes',
    },
  });
}

function stripRange(headers) {
  const h = new Headers();
  for (const [k, v] of headers) if (k.toLowerCase() !== 'range') h.set(k, v);
  return h;
}

/* ---------------------------------------------------------------- reminders
 *
 * The page writes every notification out in full — title, body, the link to
 * tap — days in advance, into the `progress` store under a `notif:` prefix.
 * See js/notify.js, which is where all of the thinking lives.
 *
 * This end knows no Japanese and loads no data. It wakes up, shows whatever
 * came due, and marks it consumed. That is deliberate: a worker that picked
 * its own word of the day would be a second copy of the app's content logic,
 * and the two would drift.
 */
const NOTIF_TAG = 'nihongo-notify';
const NOTIF_PREFIX = 'notif:';
const NOTIF_GRACE = 2 * 60 * 60 * 1000;
const NOTIF_DB = 'nihongo';

self.addEventListener('periodicsync', (e) => {
  if (e.tag === NOTIF_TAG) e.waitUntil(runReminders());
});

// A one-off sync is not a timer, but it is one more moment the browser is
// willing to wake us, and a reminder delivered late beats one never delivered.
self.addEventListener('sync', (e) => {
  if (e.tag === NOTIF_TAG) e.waitUntil(runReminders());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const hash = String(e.notification.data?.url || '#/today').replace(/^#?/, '#');
  e.waitUntil((async () => {
    const target = new URL(`./index.html${hash}`, self.location.href);
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of windows) {
      if (new URL(c.url).origin !== target.origin) continue;
      try { await c.focus(); } catch { /* a focus the OS refused is not fatal */ }
      // A hash change is all this needs. navigate() would reload the app and
      // throw away a review in progress to show someone a word of the day.
      c.postMessage({ type: 'NAVIGATE', url: hash });
      return;
    }
    await self.clients.openWindow(target.href);
  })());
});

/**
 * Open the app's database WITHOUT a version, so this can never run an upgrade
 * of its own and race the page's.
 */
function notifDB() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(NOTIF_DB); } catch { return resolve(null); }
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
    req.onsuccess = () => {
      const db = req.result;
      if (db.objectStoreNames.contains('progress')) return resolve(db);
      // The app has never run on this device, so open() just conjured an empty
      // database. Leaving it behind would be worse than useless: the app opens
      // at version 1, would find the version already matching, and so would
      // never get the upgrade that creates its stores. A database with no
      // stores at all can only be this one, so it is safe to take back.
      const conjured = db.objectStoreNames.length === 0;
      db.close();
      if (conjured) { try { indexedDB.deleteDatabase(NOTIF_DB); } catch { /* nothing to undo */ } }
      resolve(null);
    };
  });
}

const idbGet = (db, name, key) => new Promise((resolve) => {
  try {
    const req = db.transaction(name).objectStore(name).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => resolve(null);
  } catch { resolve(null); }
});

const idbAll = (db, name) => new Promise((resolve) => {
  try {
    const req = db.transaction(name).objectStore(name).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => resolve([]);
  } catch { resolve([]); }
});

const idbPutAll = (db, name, rows) => new Promise((resolve) => {
  if (!rows.length) return resolve();
  try {
    const t = db.transaction(name, 'readwrite');
    for (const r of rows) t.objectStore(name).put(r);
    t.oncomplete = () => resolve();
    t.onerror = () => resolve();
    t.onabort = () => resolve();
  } catch { resolve(); }
});

// Mirrors dayKey() in js/progress.js. The two have to agree, or "have they
// studied today" reads the wrong row and the evening nudge fires at someone
// who has already done their reviews.
function notifDayKey(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function runReminders() {
  // Not every engine exposes Notification inside a worker. Only bail when it
  // is there AND says no — otherwise let showNotification have its go.
  if (self.Notification && self.Notification.permission !== 'granted') return;
  const db = await notifDB();
  if (!db) return;
  try {
    const settings = await idbGet(db, 'settings', 'notify');
    if (!settings?.value?.enabled) return;

    const now = Date.now();
    const due = (await idbAll(db, 'progress'))
      .filter((r) => typeof r?.key === 'string' && r.key.startsWith(NOTIF_PREFIX) && !r.shown && r.at <= now)
      .sort((a, b) => a.at - b.at);
    if (!due.length) return;

    const day = await idbGet(db, 'progress', `day:${notifDayKey(now)}`);
    const studied = !!day &&
      ((day.reviews || 0) + (day.new || 0) + (day.newKanji || 0) + (day.newGrammar || 0)) > 0;

    // Everything that has passed is consumed, shown or not. A phone that spent
    // the week in a drawer must not empty five days of reminders onto the lock
    // screen the moment it comes back.
    const fresh = due.filter((r) => r.at > now - NOTIF_GRACE && !(r.skipIfStudied && studied));
    for (const r of fresh.slice(-2)) {
      try {
        await self.registration.showNotification(r.title, {
          body: r.body,
          tag: r.tag || `nihongo-${r.kind}`,
          renotify: true,
          icon: './icons/icon-192.png',
          badge: './icons/icon-192.png',
          lang: 'ja',
          data: { url: r.url || '#/today', kind: r.kind },
        });
      } catch (err) { console.warn('[sw] notification refused', err); }
    }
    await idbPutAll(db, 'progress', due.map((r) => ({ ...r, shown: true })));
  } finally {
    db.close();
  }
}
