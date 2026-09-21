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
const BUILD = 'v1.0.4';
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
  './js/screens/business.js',
  './js/screens/produce.js',
  './js/screens/listen.js',
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
  './data/business.json',
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
    const keep = new Set([SHELL, DATA, MEDIA]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();

    // Warm the core data in the background; failures are not fatal.
    const cache = await caches.open(DATA);
    for (const url of CORE_DATA) {
      try { if (!(await cache.match(url))) await cache.add(new Request(url, { cache: 'reload' })); }
      catch { /* will be fetched on demand */ }
    }
  })());
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'CACHE_LEVEL') e.waitUntil(cacheLevel(e.data.level, e.source));
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

  // Shell: cache first, refresh in the background.
  e.respondWith((async () => {
    const cache = await caches.open(SHELL);
    const hit = await cache.match(req, { ignoreSearch: true });
    const net = fetch(req).then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await net) || new Response('', { status: 504 });
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
