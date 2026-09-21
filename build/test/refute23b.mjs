// Finding 23, part 2: walk the real review UI and see whether the same word is shown twice.
import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('  pageerror:', e.message));
const run = (fn, a) => page.evaluate(fn, a);

await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(2500);

// Build the exact state a learner reaches: N5 enrolled, one word saved from the
// word sheet, and both cards due (i.e. the learner studied them yesterday).
console.log(JSON.stringify(await run(async () => {
  const store = await import('/js/store.js');
  const data = await import('/js/data.js');
  const { enrollLevel } = await import('/js/progress.js');
  const { newCard, STATE } = await import('/js/srs.js');
  for (const s of ['cards', 'progress', 'saved', 'settings']) for (const r of await store.all(s)) await store.del(s, r.key);
  const db = await store.open();
  await new Promise((res) => { const t = db.transaction('reviews', 'readwrite'); t.objectStore('reviews').clear(); t.oncomplete = res; });

  const list = await data.vocab('N5');
  await enrollLevel('N5', list);
  const w = list.find((x) => /^[一-龯]/.test(x.w)) || list[1];

  // exactly what ui.js does on "Save to my words"
  await store.put('saved', { key: w.w, word: w.w, reading: w.r, meaning: (w.m || [])[0] || '', lv: w.lv, vocabId: w.id, added: Date.now() });
  await store.put('cards', newCard(`saved:${w.w}:rec`, 'saved', { word: w.w, reading: w.r, ord: Date.now() }));

  // both studied yesterday -> both due now
  const now = Date.now();
  for (const c of await store.all('cards')) {
    if (c.key === `saved:${w.w}:rec` || c.key === `vocab:${w.id}:rec`) {
      await store.put('cards', { ...c, state: STATE.REVIEW, due: now - 3600e3, S: 2, D: 5, reps: 3, lapses: 0, last: now - 86400e3 });
    }
  }
  return { word: w.w, id: w.id };
})));

await page.goto(`${BASE}/#/review`, { waitUntil: 'load' });
await page.waitForTimeout(1500);

const faces = [];
for (let i = 0; i < 14; i++) {
  const counter = await page.locator('.review-top span').first().innerText().catch(() => '');
  const face = await page.locator('#face .jp-lg').first().innerText().catch(() => '');
  if (!face) break;
  faces.push(`${counter} ${face.replace(/\s+/g, '')}`);
  await page.locator('#reveal').dispatchEvent('click').catch((e) => console.log('reveal fail', e.message));
  await page.waitForTimeout(400);
  const g = page.locator('.grade[data-g="3"]');
  if (!(await g.count())) { console.log('no grade buttons; html=', (await page.locator('#view').innerHTML()).slice(0, 500)); break; }
  await g.dispatchEvent('click');
  await page.waitForTimeout(450);
}
console.log('faces shown:', JSON.stringify(faces, null, 1));
const bare = faces.map((f) => f.split(' ').pop());
console.log('REPEATS:', JSON.stringify([...new Set(bare.filter((w, i) => bare.indexOf(w) !== i))]));
console.log('end screen:', JSON.stringify((await page.locator('.empty').innerText().catch(() => '')).replace(/\s+/g, ' ')));

// what the stats screen says
await page.goto(`${BASE}/#/stats`, { waitUntil: 'load' });
await page.waitForTimeout(1200);
console.log('stats:', JSON.stringify((await page.locator('#view').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 400)));

await browser.close();
