// Persistent storage. Everything the user creates - saved words, review history,
// progress, settings - lives here and must survive app updates and reinstalls.
//
// IndexedDB for the data, localStorage only for trivial per-device preferences.
// Every read is wrapped: a private window or evicted storage must degrade to a
// working (if forgetful) app, never a blank screen.

const DB_NAME = 'nihongo';
const DB_VERSION = 1;

/** @type {IDBDatabase|null} */
let db = null;
let memoryFallback = false;
const mem = new Map();

export async function open() {
  if (db) return db;
  if (memoryFallback) return null;
  try {
    db = await new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const d = req.result;
        // cards: one per thing being learned (word, kanji, grammar point, sentence)
        if (!d.objectStoreNames.contains('cards')) {
          const s = d.createObjectStore('cards', { keyPath: 'key' });
          s.createIndex('due', 'due');
          s.createIndex('deck', 'deck');
          s.createIndex('state', 'state');
        }
        // reviews: an append-only log, so the scheduler can be retuned later
        if (!d.objectStoreNames.contains('reviews')) {
          d.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true })
            .createIndex('key', 'key');
        }
        // saved: words the user explicitly starred while reading or watching
        if (!d.objectStoreNames.contains('saved')) {
          const s = d.createObjectStore('saved', { keyPath: 'key' });
          s.createIndex('added', 'added');
        }
        // progress: per-level/lesson completion, streaks, daily counters
        if (!d.objectStoreNames.contains('progress')) d.createObjectStore('progress', { keyPath: 'key' });
        // settings: user preferences that should follow an export/import
        if (!d.objectStoreNames.contains('settings')) d.createObjectStore('settings', { keyPath: 'key' });
        if (e.oldVersion === 0) seedDefaults(req.transaction);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('blocked'));
    });
    db.onversionchange = () => { db.close(); db = null; };
    return db;
  } catch (err) {
    console.warn('IndexedDB unavailable, running in memory only:', err);
    memoryFallback = true;
    return null;
  }
}

function seedDefaults(tx) {
  const s = tx.objectStore('settings');
  s.put({ key: 'furigana', value: 'auto' });       // always | auto | never
  s.put({ key: 'newPerDay', value: 10 });
  s.put({ key: 'reviewCap', value: 120 });
  s.put({ key: 'theme', value: 'system' });
  s.put({ key: 'subtitleSize', value: 'large' });
  s.put({ key: 'showRomaji', value: true });
}

function tx(storeName, mode = 'readonly') {
  if (!db) return null;
  return db.transaction(storeName, mode).objectStore(storeName);
}

const memKey = (store, key) => `${store}\u0000${key}`;

function wrap(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function get(store, key) {
  await open();
  if (!db) return mem.get(memKey(store, key)) ?? null;
  try { return (await wrap(tx(store).get(key))) ?? null; } catch { return null; }
}

export async function put(store, value) {
  await open();
  if (!db) { mem.set(memKey(store, value.key), value); return value; }
  try {
    await wrap(tx(store, 'readwrite').put(value));
    return value;
  } catch (e) {
    // A swallowed write means the user believes their progress is saved when it
    // is not. Keep it in memory and tell the app.
    console.error('write failed', store, e);
    mem.set(memKey(store, value.key), value);
    window.dispatchEvent(new CustomEvent('nihongo:storage-error', { detail: { store, error: String(e) } }));
    throw e;
  }
}

export async function del(store, key) {
  await open();
  if (!db) { mem.delete(memKey(store, key)); return; }
  try { await wrap(tx(store, 'readwrite').delete(key)); } catch (e) { console.warn('delete failed', e); }
}

/**
 * Drop the newest review-log row for one card.
 *
 * Undo needs this: putting the card snapshot back restores the schedule, but
 * the log is append-only, so without this the history would still show a review
 * that the learner took back, and a future scheduler retune would learn from it.
 */
export async function delLastReview(cardKey) {
  await open();
  if (!db) { mem.delete(memKey('reviews', cardKey)); return; }
  try {
    const t = db.transaction('reviews', 'readwrite');
    const s = t.objectStore('reviews');
    await new Promise((resolve, reject) => {
      const req = s.index('key').openCursor(IDBKeyRange.only(cardKey), 'prev');
      req.onsuccess = () => {
        const c = req.result;
        if (c) c.delete();
        resolve();
      };
      req.onerror = () => reject(req.error);
    });
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  } catch (e) { console.warn('could not undo the review log entry', e); }
}

export async function all(store) {
  await open();
  if (!db) return [...mem.entries()].filter(([k]) => k.startsWith(store + '\u0000')).map(([, v]) => v);
  try { return (await wrap(tx(store).getAll())) || []; } catch { return []; }
}

export async function count(store) {
  await open();
  if (!db) return (await all(store)).length;
  try { return await wrap(tx(store).count()); } catch { return 0; }
}

/** Cards due at or before `when`, oldest first. */
export async function due(when = Date.now(), limit = 500) {
  await open();
  if (!db) return (await all('cards')).filter((c) => c.due <= when).slice(0, limit);
  try {
    const out = [];
    await new Promise((resolve, reject) => {
      const req = tx('cards').index('due').openCursor(IDBKeyRange.upperBound(when));
      req.onsuccess = () => {
        const c = req.result;
        if (!c || out.length >= limit) return resolve();
        out.push(c.value);
        c.continue();
      };
      req.onerror = () => reject(req.error);
    });
    return out;
  } catch { return []; }
}

export async function putMany(store, values) {
  await open();
  if (!db) { values.forEach((v) => mem.set(memKey(store, v.key), v)); return; }
  try {
    const t = db.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    values.forEach((v) => s.put(v));
    await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); });
  } catch (e) { console.warn('putMany failed', e); }
}

// --- settings ------------------------------------------------------------
const settingsCache = new Map();

export async function setting(key, fallback = null) {
  if (settingsCache.has(key)) return settingsCache.get(key);
  const row = await get('settings', key);
  const v = row ? row.value : fallback;
  settingsCache.set(key, v);
  return v;
}

export async function setSetting(key, value) {
  settingsCache.set(key, value);
  await put('settings', { key, value });
}

// --- durability ----------------------------------------------------------
// iOS evicts unused site data after ~7 days. Asking for persistent storage is
// the only defence, and it only tends to be granted once the app is installed.
export async function requestPersistence() {
  try {
    if (!navigator.storage?.persist) return { supported: false };
    const already = await navigator.storage.persisted();
    const granted = already || (await navigator.storage.persist());
    const est = navigator.storage.estimate ? await navigator.storage.estimate() : {};
    return { supported: true, granted, usage: est.usage, quota: est.quota };
  } catch {
    return { supported: false };
  }
}

// --- backup --------------------------------------------------------------
// The user's saved words are irreplaceable. Export must be one tap.
export async function exportAll() {
  const [cards, reviews, saved, progress, settings] = await Promise.all(
    ['cards', 'reviews', 'saved', 'progress', 'settings'].map((s) => all(s))
  );
  return {
    app: 'nihongo',
    version: 1,
    exported: new Date().toISOString(),
    counts: { cards: cards.length, reviews: reviews.length, saved: saved.length },
    cards, reviews, saved, progress, settings,
  };
}

/**
 * Merge a backup into the current database.
 * @param {object} data an object produced by exportAll()
 * @param {'merge'|'replace'} mode merge keeps whichever card was reviewed most recently
 */
export async function importAll(data, mode = 'merge') {
  if (!data || data.app !== 'nihongo') throw new Error('Not a nihongo backup file');
  const stores = ['cards', 'saved', 'progress', 'settings'];
  if (mode === 'replace') {
    await open();
    if (db) {
      const t = db.transaction([...stores, 'reviews'], 'readwrite');
      [...stores, 'reviews'].forEach((s) => t.objectStore(s).clear());
      await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
    }
  }
  for (const s of stores) {
    const incoming = data[s] || [];
    if (mode === 'merge' && s === 'cards') {
      const existing = new Map((await all('cards')).map((c) => [c.key, c]));
      const merged = incoming.map((c) => {
        const cur = existing.get(c.key);
        return !cur || (c.lastReview ?? 0) > (cur.lastReview ?? 0) ? c : cur;
      });
      const untouched = [...existing.values()].filter((c) => !incoming.some((i) => i.key === c.key));
      await putMany('cards', [...merged, ...untouched]);
    } else {
      await putMany(s, incoming);
    }
  }
  if (data.reviews?.length) {
    await open();
    if (db) {
      const t = db.transaction('reviews', 'readwrite');
      const st = t.objectStore('reviews');
      // The store has keyPath 'id' with autoIncrement. Passing `id: undefined`
      // does NOT trigger the key generator — the property is present, so the
      // key path evaluates to undefined and IndexedDB throws DataError. The
      // property has to be absent entirely.
      for (const r of data.reviews) {
        const row = { ...r };
        delete row.id;
        st.put(row);
      }
      await new Promise((res, rej) => { t.oncomplete = res; t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
    }
  }
  settingsCache.clear();
  return true;
}
