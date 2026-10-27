// Upgrading a phone that is already running the PREVIOUS release.
//
// The update test covers a clean swap. This one covers the case that actually
// bit: build 1 is the real previous commit, checked out of git, and build 2 is
// the working tree. An installed app serves its shell from its own cache, so
// while the old worker is still in charge every module it loads has to stay on
// the old build — a page running old main.js with a newly fetched screen module
// is a crash ("appVersion is not a function").
//
//   node build/test/upgrade.mjs [previous-ref]
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PREV = process.argv[2] || 'HEAD~1';
// Read from the worker rather than written down here, so cutting a release is
// one edit and not two — a stale literal here fails a working upgrade.
const BUILD = /const BUILD = '([^']+)'/
  .exec(fs.readFileSync(path.join(ROOT, 'app', 'sw.js'), 'utf8'))[1];
const PORT = 8124;
const BASE = `http://localhost:${PORT}`;

// Build 1: the previous release, checked out exactly as it was published.
const old = path.join(os.tmpdir(), `nihongo-prev-${Date.now()}`);
execFileSync('git', ['worktree', 'add', '--detach', old, PREV], { cwd: ROOT, stdio: 'inherit' });
const cleanup = () => {
  try { execFileSync('git', ['worktree', 'remove', '--force', old], { cwd: ROOT, stdio: 'ignore' }); } catch { /* already gone */ }
};
process.on('exit', cleanup);
const ROOTS = { 1: path.join(old, 'app'), 2: path.join(ROOT, 'app') };

// `mixed` is the state that broke a real phone: the page booted from the old
// build's cached shell, and then a screen it imported later came back new.
let deployed = 1;
let mixed = false;
let tampered = false;      // a deploy that lands while a build is running
const fromNewBuild = (p) => mixed && p.startsWith('/js/screens/');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  // Data is generated and identical in both builds; serve it from the working
  // tree so the old checkout does not need its own copy.
  const base = p.startsWith('/data/') || fromNewBuild(p) ? ROOTS[2] : ROOTS[deployed];
  const file = path.join(base, p);
  if (!file.startsWith(base) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('no'); }
  let body = fs.readFileSync(file);
  if (tampered && p.endsWith('.js')) body = Buffer.concat([body, Buffer.from('\n// LATER-DEPLOY-MARKER\n')]);
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(body);
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'], serviceWorkers: 'allow' });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
let fail = 0;
const check = (n, ok, d = '') => { if (!ok) fail++; console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${d ? '  — ' + d : ''}`); };

console.log(`build 1 = ${PREV}, build 2 = working tree\n`);

// --- living on the previous release -------------------------------------
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(3000);
const v1 = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.getRegistration();
  return { controlled: !!navigator.serviceWorker.controller, caches: await caches.keys() };
});
check('the previous release installs', v1.controlled, v1.caches.join(', '));
const oldShell = v1.caches.find((c) => c.startsWith('shell-'));

// --- the new release is deployed ----------------------------------------
deployed = 2;

// Open the app again, exactly as a phone would the next morning.
await page.goto(BASE, { waitUntil: 'load' });
await page.waitForTimeout(4000);

// Everything the old worker serves must still come from the old build, or the
// page ends up running two releases at once.
await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const settings = await page.locator('#view').innerText().catch(() => '');
check('Settings opens during an upgrade', /Study|Install|Theme|version/i.test(settings),
  settings.split('\n').slice(0, 2).join(' / ') || '(empty)');
check('no module-version crash', !errs.some((e) => /is not a function|undefined/.test(e)),
  errs.join(' | ') || 'none');

// The old worker refreshes its own cache from the network as it serves, which
// is the habit that mixed two builds into one page. Nothing can be done about
// the copy already on a phone — it is fixed from the new build onwards, and
// checked below — so this only reports what the old one did.
const cached = await page.evaluate(async (shell) => {
  const c = await caches.open(shell);
  const text = async (u) => (await c.match(u))?.text() ?? '';
  return { me: /update\.js|checkForUpdate/.test(await text('./js/screens/me.js')),
           main: /update\.js|checkForUpdate/.test(await text('./js/main.js')) };
}, oldShell);
console.log(`     (the old worker's cache during the upgrade — me.js new: ${cached.me}, main.js new: ${cached.main})`);

// --- and the update is offered ------------------------------------------
const offered = await page.locator('#updateBar').isVisible().catch(() => false);
check('the previous release offers the update', offered);

if (offered) {
  const nav = page.waitForNavigation({ timeout: 20000 }).catch(() => null);
  await page.click('#updateBtn');
  await nav;
  await page.waitForTimeout(3500);
  const now = await page.evaluate(async () => {
    const names = await caches.keys();
    const m = await import('./js/update.js').catch(() => null);
    return { caches: names, version: m ? await m.appVersion() : null };
  });
  check('the phone is on the new build', now.version === BUILD, String(now.version));
  check('the old shell is gone', !now.caches.includes(oldShell), now.caches.join(', '));
  await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  check('Settings works on the new build', /version/i.test(await page.locator('#view').innerText()));
  check('and shows the running build', (await page.locator('#view').innerText()).includes(BUILD));

  // A build's shell must be immutable: deploy something different and the
  // running build has to keep serving its own files until its worker is
  // replaced wholesale. This is the fix for two releases in one page.
  tampered = true;
  // A plain fetch, the way a dynamic import asks for a module. (A hard reload
  // deliberately goes to the network — that is the developer's escape hatch.)
  const served = await page.evaluate(async () => {
    const r = await fetch('./js/screens/me.js');
    return (await r.text()).includes('LATER-DEPLOY-MARKER');
  });
  check('a later deploy cannot leak into the running build', served === false);
  const stored = await page.evaluate(async () => {
    const c = await caches.open((await caches.keys()).find((k) => k.startsWith('shell-')));
    return (await (await c.match('./js/screens/me.js')).text()).includes('LATER-DEPLOY-MARKER');
  });
  check('and cannot overwrite what it cached', stored === false);
  tampered = false;
}

// --- the crash, reproduced on purpose -----------------------------------
// Old shell, new screen module: this is what "appVersion is not a function"
// was. The screen must survive it, because this screen is where the button
// that gets you out of a half-applied update lives.
mixed = true;
await ctx.clearCookies();
await page.evaluate(async () => {
  for (const k of await caches.keys()) await caches.delete(k);
  const r = await navigator.serviceWorker.getRegistration();
  await r?.unregister();
});
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
errs.length = 0;
await page.goto(`${BASE}/#/settings`, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const skewed = await page.locator('#view').innerText();
check('a newer screen still opens on an older shell', /Study|Theme|Version/i.test(skewed),
  skewed.split('\n').slice(0, 2).join(' / ') || '(empty)');
check('and does not throw', !errs.some((e) => /is not a function/.test(e)), errs.join(' | ') || 'none');
check('it still offers a way to update', await page.locator('#checkUpdate').count() > 0);
mixed = false;

console.log(`\nerrors: ${errs.length ? [...new Set(errs)].join(' | ') : 'none'}`);
console.log(`\n=== upgrade ${fail === 0 ? 'PASS' : `FAIL (${fail})`} ===`);
await browser.close();
server.close();
cleanup();
process.exit(fail ? 1 : 0);
