import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve('C:/Users/ochil/Desktop/Projects/My Projects/nihongo/app');
const orig = fs.readFileSync(path.join(ROOT,'manifest.webmanifest'),'utf8');
const variants = {
  'as-shipped  "id":"./"': orig,
  'id removed          ': JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(orig)).filter(([k])=>k!=='id')), null, 2),
  'id ":"./index.html"' : orig.replace('"id": "./"','"id": "./index.html"'),
};
const PORT = 8232;
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json',
  '.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain' };
let current = orig;
const srv = http.createServer((req,res)=>{
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (!u.startsWith('/nihongo/')) { res.writeHead(404); return res.end(); }
  let rel = u.slice(9) || 'index.html';
  if (rel === 'manifest.webmanifest') { res.writeHead(200,{'Content-Type':'application/manifest+json'}); return res.end(current); }
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200,{'Content-Type': MIME[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r=>srv.listen(PORT,r));
const browser = await chromium.launch();
for (const [label, body] of Object.entries(variants)) {
  current = body;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await page.goto(`http://localhost:${PORT}/nihongo/index.html`, { waitUntil:'load' });
  await page.waitForTimeout(600);
  const m = await cdp.send('Page.getAppManifest');
  const p = m.manifest ?? m.parsed;
  console.log(`${label}  ->  id=${p.id}   start=${p.startUrl}   errors=${JSON.stringify(m.errors)}`);
  await ctx.close();
}
await browser.close(); srv.close();
