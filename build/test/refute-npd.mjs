import { chromium, devices } from 'playwright';
const b = await chromium.launch();
const p = await (await b.newContext({ ...devices['Pixel 7'] })).newPage();
await p.goto('http://localhost:8099/#/today', { waitUntil: 'load' });
await p.waitForTimeout(1200);
console.log(JSON.stringify(await p.evaluate(async () => {
  const store = await import('/js/store.js');
  const prog = await import('/js/progress.js');
  const { newCard } = await import('/js/srs.js');
  for (const s of ['cards','progress']) for (const r of await store.all(s)) await store.del(s, r.key);
  await store.putMany('cards', Array.from({length:60},(_,i)=>newCard(`vocab:${i}:rec`,'level:N5',{word:'w'+i,vocabId:i,ord:i})));
  const out = {};
  for (const n of [5,30]) { await store.setSetting('newPerDay', n); out['newPerDay='+n] = (await prog.session({})).queue.length; }
  return out;
}), null, 1));
await b.close();
