import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';
const ROOT = path.resolve('C:/Users/ochil/Desktop/Projects/My Projects/nihongo/app');
let BUILDVER = 'v3.0.0';
const TYPES = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const hits=[];
const server = http.createServer((req,res)=>{
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u.endsWith('/')) u += 'index.html';
  if (u==='/sw.js') hits.push(BUILDVER);
  const fp = path.join(ROOT, u);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  let body = fs.readFileSync(fp);
  if (u==='/sw.js') body = Buffer.from(body.toString().replace(/const BUILD = '[^']+'/, `const BUILD = '${BUILDVER}'`));
  res.writeHead(200, {'Content-Type': TYPES[path.extname(fp)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(body);
});
await new Promise(r=>server.listen(0,r));
const PORT=server.address().port; console.log('port',PORT);
const BASE='http://localhost:'+PORT;
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const probe = () => page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return { bar: !document.getElementById('updateBar').hidden, waiting: !!reg?.waiting, installing: !!reg?.installing, caches: (await caches.keys()).sort() };
});
await page.goto(BASE+'/#/today',{waitUntil:'load'}); await page.waitForTimeout(5000);
console.log('A install v3      :', JSON.stringify(await probe()));
BUILDVER='v4.0.0';
// force an update check, as reg.update() in the proposed fix would
await page.evaluate(async()=>{ const r=await navigator.serviceWorker.getRegistration(); await r.update(); });
await page.waitForTimeout(6000);
console.log('B after reg.update():', JSON.stringify(await probe()), 'swHits', hits.join(','));
// now reload -- new worker is already in reg.waiting
await page.goto(BASE+'/#/today',{waitUntil:'load'}); await page.waitForTimeout(6000);
console.log('C reload w/ waiting :', JSON.stringify(await probe()), 'swHits', hits.join(','));
await page.goto(BASE+'/#/today',{waitUntil:'load'}); await page.waitForTimeout(6000);
console.log('D reload again      :', JSON.stringify(await probe()), 'swHits', hits.join(','));
await browser.close(); server.close();
