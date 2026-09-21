// Static server for app/ with a toggleable "hang" mode.
// GET /__hang  -> all later requests accept the socket and never respond.
// GET /__ok    -> back to normal.  (control endpoints always answer)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../app');
const PORT = Number(process.argv[2]) || 8125;
let HANG = false;
let FOUR = false;
const held = [];

const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg','.woff2':'font/woff2' };

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/__hang') { HANG = true; res.writeHead(200).end('hang'); return; }
  if (u.pathname === '/__ok')   { HANG = false; FOUR = false; for (const r of held.splice(0)) { try { r.destroy(); } catch {} } res.writeHead(200).end('ok'); return; }
  if (u.pathname === '/__404') { FOUR = true; res.writeHead(200).end('404mode'); return; }
  if (FOUR && (u.pathname === '/' || u.pathname.endsWith('.html'))) { res.writeHead(404, {'Content-Type':'text/html'}); return res.end('<h1>404 Not Found — GitHub Pages</h1>'); }
  if (HANG) { console.log('[hang]', u.pathname); held.push(res); res.socket?.setTimeout(0); return; }
  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, {'Content-Type':'text/plain'}); return res.end('Not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-cache', 'Service-Worker-Allowed':'/' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log('hangserver on ' + PORT));
