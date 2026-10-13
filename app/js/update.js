// Updating the app in place.
//
// Deliberately standalone. During an upgrade a page can end up running two
// builds at once — the document loaded yesterday's main.js from cache, then
// imports a screen that the network has already replaced — and the first
// version of this lived in main.js, so the new Settings screen called an
// export the running main.js did not have and the screen died with
// "appVersion is not a function".
//
// Nothing here is held in another module's scope: every call asks the browser
// for the registration itself. A page can therefore drive an update even when
// the main.js it booted from knows nothing about updates, which is exactly the
// page that needs to.

const UPDATE_EVERY = 60 * 60 * 1000;
const CHECK_GAP = 5 * 60 * 1000;      // never hammer the network on tab switches
let lastCheck = 0;

const supported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
const registration = async () => {
  if (!supported()) return null;
  try { return (await navigator.serviceWorker.getRegistration()) || null; } catch { return null; }
};

/**
 * Show the bar. It exists only while a new version is genuinely waiting, and
 * the swap only happens on a tap — swapping under a live page would throw away
 * the review in progress.
 */
export function offerUpdate(worker) {
  const bar = document.getElementById('updateBar');
  if (!worker || !bar?.hidden) return;
  bar.hidden = false;
  const apply = document.getElementById('updateBtn');
  const later = document.getElementById('updateLater');
  if (apply) apply.onclick = () => { bar.hidden = true; worker.postMessage({ type: 'SKIP_WAITING' }); };
  if (later) later.onclick = () => { bar.hidden = true; };
}

const DONE = ['installed', 'activated', 'redundant'];
/** Resolve once a worker has finished installing (or given up). */
const settled = (w, ms = 20000) => new Promise((resolve) => {
  if (DONE.includes(w.state)) return resolve();
  const off = () => { w.removeEventListener('statechange', onChange); resolve(); };
  const onChange = () => { if (DONE.includes(w.state)) off(); };
  w.addEventListener('statechange', onChange);
  setTimeout(off, ms);
});

/**
 * Look for a new version, and offer it if one is ready.
 * @returns {Promise<boolean>} true when a new version is now waiting.
 */
export async function checkForUpdate({ force = false } = {}) {
  const reg = await registration();
  if (!reg) return false;
  if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
  if (!force && Date.now() - lastCheck < CHECK_GAP) return !!reg.waiting;
  lastCheck = Date.now();
  try { await reg.update(); } catch { return !!reg.waiting; }
  // update() resolves as soon as the new worker *starts* installing, so without
  // this the answer would be "you are up to date" while a new version was
  // downloading in the background.
  if (reg.installing) await settled(reg.installing);
  if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
  return !!reg.waiting;
}

/** Apply a waiting update now. @returns {Promise<boolean>} whether there was one. */
export async function applyUpdate() {
  const reg = await registration();
  if (!reg?.waiting) return false;
  const bar = document.getElementById('updateBar');
  if (bar) bar.hidden = true;
  reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

/** The build the controlling worker was cut from, or null when it is not installed. */
export function appVersion() {
  const sw = supported() ? navigator.serviceWorker.controller : null;
  if (!sw) return Promise.resolve(null);
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const done = setTimeout(() => resolve(null), 800);
    ch.port1.onmessage = (e) => { clearTimeout(done); resolve(e.data?.version || null); };
    try { sw.postMessage({ type: 'VERSION' }, [ch.port2]); } catch { resolve(null); }
  });
}

/**
 * Register the worker and keep looking for new versions.
 *
 * An installed app can sit in the background for weeks, so waiting for the
 * browser to notice a deploy is not enough: check on launch, whenever the app
 * comes back to the foreground, and once an hour while it is open. A worker
 * left waiting from a previous session is picked up too, so an update declined
 * once is not an update lost.
 */
export function start() {
  if (!supported()) return;
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });

      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const w = reg.installing;
        w?.addEventListener('statechange', () => {
          // Only offer the swap once an old worker is actually controlling the
          // page — otherwise this is the first install, not an update.
          if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(w);
        });
      });

      let reloading = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloading) return;      // guard against a reload loop
        reloading = true;
        location.reload();
      });

      const quiet = (opts) => checkForUpdate(opts).catch(() => false);
      quiet({ force: true });
      setInterval(quiet, UPDATE_EVERY);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') quiet();
      });
    } catch (e) { console.warn('service worker not registered:', e); }
  });
}
