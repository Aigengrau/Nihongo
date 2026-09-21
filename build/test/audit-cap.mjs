import { chromium, devices } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage();
await p.goto('http://localhost:8099/#/today', { waitUntil: 'load' });
await p.waitForTimeout(700);
console.log(JSON.stringify(await p.evaluate(async () => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  const { newCard } = await import('/js/srs.js');
  for (const s of ['cards','progress']) for (const r of await store.all(s)) await store.del(s, r.key);
  const now = Date.now();
  await store.putMany('cards', Array.from({length:300},(_,i)=>({
    ...newCard(`vocab:${i}:rec`,'level:N5',{word:'w'+i,vocabId:i,ord:i}),
    state:2,S:5,D:5,due:now-1000-i,lastReview:now-6*86400000,reps:3})));
  await store.setSetting('reviewCap', 400);
  const a = (await prog.session({})).queue.length;
  await store.setSetting('reviewCap', 60);
  const c = (await prog.session({})).queue.length;
  return { reviewCapSetTo400_queue: a, reviewCapSetTo60_queue: c, storedSetting: await store.setting('reviewCap') };
}), null, 1));
await b.close();
