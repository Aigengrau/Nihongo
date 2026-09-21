import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from 'playwright';

const ROOT = path.resolve('C:/Users/ochil/Desktop/Projects/My Projects/nihongo/app');
let BUILDVER = 'v3.0.0';

const TYPES = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'};

const server = http.createServer((req,res)=>{
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (u.endsWith('/')) u += 'index.html';
  const fp = path.join(ROOT, u);
  if (!fp.startsWith(ROOT) || !fs.existsSync(fp) || fs.statSync(fp).isDirectory()) { res.writeHead(404); return res.end('nf'); }
  let body = fs.readFileSync(fp);
  if (u === '/sw.js') body = Buffer.from(body.toString().replace(/const BUILD = '[^']+'/, `const BUILD = '${BUILDVER}'`));
  res.writeHead(200, {'Content-Type': TYPES[path.extname(fp)] || 'application/octet-stream', 'Cache-Control':'no-store'});
  res.end(body);
});
await new Promise(r=>server.listen(8123, r));
const BASE='http://localhost:8123';

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['Pixel 7'] });
const page = await ctx.newPage();

const probe = () => page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  return {
    barHidden: document.getElementById('updateBar')?.hidden,
    barVisible: !!document.getElementById('updateBar') && !document.getElementById('updateBar').hidden,
    waiting: !!reg?.waiting, installing: !!reg?.installing, active: reg?.active?.state,
    controller: !!navigator.serviceWorker.controller,
    caches: await caches.keys(),
  };
});

// load 1: first install
await page.goto(BASE+'/#/today', {waitUntil:'load'});
await page.waitForTimeout(3000);
console.log('install(v3):', JSON.stringify(await probe()));

// bump version on disk
BUILDVER = 'v4.0.0';

for (const n of [1,2,3]) {
  await page.goto(BASE+'/#/today', {waitUntil:'load'});
  await page.waitForTimeout(3500);
  console.log(`reload #${n} (server v4):`, JSON.stringify(await probe()));
}

// simulate "resume from app switcher": visibility change, no navigation
await page.evaluate(()=>{ /* noop */ });
await page.waitForTimeout(500);
console.log('final:', JSON.stringify(await probe()));

await browser.close();
server.close();
