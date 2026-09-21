import { chromium, devices } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
await page.goto(`${BASE}/#/today`, { waitUntil: 'load' });
await page.waitForTimeout(1500);

const out = await page.evaluate(async () => {
  const data = await import('/js/data.js');
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  const srs  = await import('/js/srs.js');
  const r = {};

  // clean slate
  for (const s of ['cards','saved','progress','reviews']) {
    for (const row of await store.all(s)) await store.del(s, row.key ?? row.id ?? row);
  }

  const list = await data.vocab('N5');
  r.n5count = list.length;
  r.enrolled = await prog.enrollLevel('N5', list);
  const lvCards = (await store.all('cards')).filter(c=>c.deck==='level:N5');
  r.levelOrdRange = [Math.min(...lvCards.map(c=>c.ord)), Math.max(...lvCards.map(c=>c.ord))];

  // save 3 words exactly as ui.js does
  const words = ['猫','水','本'];
  for (const hw of words) {
    await store.put('saved', { key: hw, word: hw, reading: hw, meaning: 'x', lv: 'N5', vocabId: null, added: Date.now() });
    await store.put('cards', srs.newCard(`saved:${hw}:rec`, 'saved', { word: hw, reading: hw, ord: Date.now() }));
  }
  const sv = (await store.all('cards')).filter(c=>c.deck==='saved');
  r.savedOrd = sv.map(c=>c.ord);
  r.savedKeysHaveVocabId = sv.map(c=>('vocabId' in c));

  // 1) global queue
  let s = await prog.session({});
  r.globalQueueLen = s.queue.length;
  r.globalQueueDecks = s.queue.map(c=>c.deck);
  r.globalQueueSavedCards = s.queue.filter(c=>c.deck==='saved').length;

  // saved-deck queue before doing anything
  let sd = await prog.session({ deck: 'saved' });
  r.savedDeckQueueFresh = sd.queue.map(c=>c.key);

  // 2) after 10 new today
  await prog.bumpToday({ new: 10 });
  sd = await prog.session({ deck: 'saved' });
  r.savedDeckQueueAfter10NewToday = sd.queue.map(c=>c.key);
  r.todayNew = (await prog.today()).new;

  // 3) backlog of 250 due
  await store.put('progress', { key: `day:${prog.dayKey()}`, day: prog.dayKey(), new: 0, reviews: 0, correct: 0, minutes: 0 });
  const backlog = [];
  for (let i=0;i<250;i++) backlog.push(srs.newCard(`bk:${i}:rec`,'level:N5',{ state: 2, S: 5, D: 5, due: Date.now()-86400000, lastReview: Date.now()-2*86400000, reps:1, ord: i }));
  await store.putMany('cards', backlog);
  const inv = await prog.inventory();
  r.dueCount = inv.due;
  r.newAllowance_250 = prog.newAllowance(250, 10);
  sd = await prog.session({ deck: 'saved' });
  r.savedDeckQueueWith250Backlog = sd.queue.map(c=>c.key);

  // cleanup backlog so UI test is clean, reset today
  for (const b of backlog) await store.del('cards', b.key);
  return r;
});
console.log(JSON.stringify(out, null, 2));
await browser.close();
