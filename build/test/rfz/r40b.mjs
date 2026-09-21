import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();

// --- profile 1: make real data, export a real backup file
const c1 = await browser.newContext({ ...devices['Pixel 7'] });
const p1 = await c1.newPage();
await p1.goto(`${BASE}/#/today`, { waitUntil: 'load' }); await p1.waitForTimeout(2500);
if (await p1.locator('#start').count()) { await p1.evaluate(()=>document.getElementById('start').click()); await p1.waitForTimeout(1500); }
await p1.evaluate(() => { location.hash = '/learn/N5'; }); await p1.waitForTimeout(2500);
for (let i=0;i<4;i++){ await p1.evaluate(()=>document.getElementById('next')?.click()); await p1.waitForTimeout(450); }
await p1.evaluate(async () => { const s = await import('./js/store.js'); await s.put('saved', { key: 'w:猫', added: Date.now(), word: '猫' }); });
const dump = await p1.evaluate(async () => (await (await import('./js/store.js')).exportAll()));
const file = 'build/test/rfz/backup.json';
fs.writeFileSync(file, JSON.stringify(dump));
console.log('1. backup written, counts:', JSON.stringify(dump.counts), 'progress rows:', dump.progress.length, 'settings rows:', dump.settings.length);
await c1.close();

// --- profile 2: brand-new device, restore through the real Settings UI
const c2 = await browser.newContext({ ...devices['Pixel 7'] });
const p2 = await c2.newPage();
const errs = []; p2.on('pageerror', e => errs.push(e.message));
await p2.goto(`${BASE}/#/settings`, { waitUntil: 'load' }); await p2.waitForTimeout(2000);
const before = await p2.evaluate(async () => (await (await import('./js/store.js')).exportAll()).counts);
console.log('2. fresh device counts before restore:', JSON.stringify(before));
await p2.setInputFiles('#file', 'C:/Users/ochil/Desktop/Projects/My Projects/nihongo/' + file);
await p2.waitForTimeout(2500);
const toast = await p2.locator('.toast, #toast, [class*=toast]').allInnerTexts().catch(()=>[]);
console.log('3. toast shown to user:', JSON.stringify(toast));
const after = await p2.evaluate(async () => {
  const s = await import('./js/store.js');
  const d = await s.exportAll();
  return { counts: d.counts, progress: d.progress.length, settings: d.settings.length };
});
console.log('4. counts after restore:', JSON.stringify(after));
await p2.screenshot({ path: 'build/test/rfz/restore-toast.png' });
console.log('pageerrors:', errs.length ? errs : 'none');
await browser.close();
