import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const ROOT = path.resolve('C:/Users/ochil/Desktop/Projects/My Projects/nihongo/app');
let BUILDVER = 'v3.0.0';
const TYPES = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const hits = [];
const server = http.createServer((req,res)=>{
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u.endsWith('/')) u += 'index.html';
  if (u === '/sw.js') hits.push(BUILDVER);
  const fp = path.join(ROOT, u);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  let body = fs.readFileSync(fp);
  if (u === '/sw.js') body = Buffer.from(body.toString().replace(/const BUILD = '[^']+'/, `const BUILD = '${BUILDVER}'`));
  res.writeHead(200, {'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream', 'Cache-Control':'no-store'});
  res.end(body);
});
await new Promise(r=>server.listen(8124, r));
const BASE='http://localhost:8124';
const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();
const probe = () => page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return { bar: !document.getElementById('updateBar').hidden, waiting: !!reg?.waiting, installing: !!reg?.installing, caches: await caches.keys() };
});
await page.goto(BASE+'/#/today', {waitUntil:'load'});
await page.waitForTimeout(6000);
console.log('install v3:', JSON.stringify(await probe()), 'swHits', hits.length);
BUILDVER='v4.0.0';
for (const n of [1,2]) {
  await page.goto(BASE+'/#/today', {waitUntil:'load'});
  // watch for up to 15s
  for (let i=0;i<15;i++){ await page.waitForTimeout(1000); const p=await probe(); if(p.bar||p.waiting){console.log(`  reload#${n} t=${i+1}s`, JSON.stringify(p)); break;} }
  console.log(`reload #${n}:`, JSON.stringify(await probe()), 'swHits', hits.length, hits.join(','));
}
await browser.close(); server.close();
