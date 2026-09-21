import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const ROOT = path.resolve('C:/Users/ochil/Desktop/Projects/My Projects/nihongo/app');
const PORT = 8231;
const MIME = { '.html':'text/html', '.js':'text/javascript', '.mjs':'text/javascript', '.css':'text/css',
  '.json':'application/json', '.webmanifest':'application/manifest+json', '.png':'image/png',
  '.svg':'image/svg+xml', '.woff2':'font/woff2', '.txt':'text/plain' };

const srv = http.createServer((req,res)=>{
  let u = decodeURIComponent(req.url.split('?')[0]);
  if (!u.startsWith('/nihongo/')) { res.writeHead(404); return res.end('nope'); }
  let rel = u.slice('/nihongo/'.length) || 'index.html';
  if (rel.endsWith('/')) rel += 'index.html';
  const f = path.join(ROOT, rel);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
  res.writeHead(200, {'Content-Type': MIME[path.extname(f)] || 'application/octet-stream'});
  fs.createReadStream(f).pipe(res);
});
await new Promise(r=>srv.listen(PORT,r));
console.log('serving http://localhost:'+PORT+'/nihongo/');

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto(`http://localhost:${PORT}/nihongo/index.html`, { waitUntil:'load' });
await page.waitForTimeout(1500);

const m = await cdp.send('Page.getAppManifest');
console.log('--- CDP Page.getAppManifest ---');
console.log('url        :', m.url);
console.log('errors     :', JSON.stringify(m.errors));
console.log('parsed.id  :', m.manifest?.id ?? m.parsed?.id);
console.log('parsed.start:', m.manifest?.startUrl ?? m.parsed?.startUrl);
console.log('parsed.scope:', m.manifest?.scope ?? m.parsed?.scope);
console.log('full parsed:', JSON.stringify(m.manifest ?? m.parsed, null, 1).slice(0,900));

// spec-reference resolution
console.log('--- URL resolution reference ---');
console.log("new URL('./', origin) =", new URL('./', `http://localhost:${PORT}`).href);
console.log("new URL('./', href)   =", new URL('./', `http://localhost:${PORT}/nihongo/index.html`).href);

// also test at origin root for comparison
await browser.close();
srv.close();
