import { chromium, devices } from 'playwright';
import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(process.argv[2]); const BASE='http://localhost:8139';
const P=(r)=>path.join(ROOT,r);
const browser = await chromium.launch();
const page = await (await browser.newContext({ ...devices['Pixel 7'] })).newPage();

await page.goto(`${BASE}/#/levels`,{waitUntil:'load'}); await page.waitForTimeout(5000);
// visit N5 words so the level vocab lands in data-v1
await page.goto(`${BASE}/#/words/N5`,{waitUntil:'load'}); await page.waitForTimeout(3000);
const peek = () => page.evaluate(async () => {
  const c = await caches.open('data-v1');
  const out = {};
  for (const u of ['./data/index.json','./data/levels/n5/vocab.json']) {
    const h = await c.match(u,{ignoreSearch:true});
    out[u] = h ? (await h.text()).slice(0,60) : 'MISS';
  }
  return out;
});
console.log('before:', await peek());

// ship v2: change both index.json and n5 vocab
const idx=JSON.parse(fs.readFileSync(P('data/index.json'),'utf8')); idx.levels[0].vocab=99999;
fs.writeFileSync(P('data/index.json'), JSON.stringify(idx));
const v=JSON.parse(fs.readFileSync(P('data/levels/n5/vocab.json'),'utf8'));
if (Array.isArray(v)) v.unshift({rf27:'NEWWORD'}); else v.rf27='NEWWORD';
fs.writeFileSync(P('data/levels/n5/vocab.json'), JSON.stringify(v));
fs.writeFileSync(P('sw.js'), fs.readFileSync(P('sw.js'),'utf8').replace("'v1.0.1'","'v2.0.0'"));
console.log('shipped v2 on disk');

await page.reload({waitUntil:'load'}); await page.waitForTimeout(3500);
if (await page.locator('#updateBar').isVisible().catch(()=>false)) {
  await page.evaluate(()=>document.getElementById('updateBtn').click()); await page.waitForTimeout(4500);
}
console.log('caches:', await page.evaluate(()=>caches.keys()));
console.log('after update:', await peek());

// now fire CACHE_LEVEL (what the "Download for offline" button sends)
await page.evaluate(async () => {
  const r = await navigator.serviceWorker.ready;
  r.active.postMessage({ type:'CACHE_LEVEL', level:'N5' });
});
await page.waitForTimeout(12000);
console.log('after CACHE_LEVEL N5:', await peek());
await browser.close();
