#!/usr/bin/env node
// Zero-dependency static server for local testing.
//   node serve.mjs            -> http://localhost:8080
//   node serve.mjs 3000
// localhost is a secure context, so the service worker and install both work.
// A LAN IP over plain http is NOT, so use a tunnel to test on your phone
// (see README).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'app');
const PORT = Number(process.argv[2]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};

http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, {
    'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
    'Cache-Control': 'no-cache',
    'Service-Worker-Allowed': '/',
  });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => {
  const lan = Object.values(os.networkInterfaces()).flat()
    .find((i) => i && i.family === 'IPv4' && !i.internal)?.address;
  console.log(`\n  Nihongo serving ${ROOT}\n`);
  console.log(`  → http://localhost:${PORT}        (installable: localhost is a secure context)`);
  if (lan) console.log(`  → http://${lan}:${PORT}   (same wifi — renders, but will NOT install over plain http)`);
  console.log(`\n  To install on your phone you need https. See README "Put it on your phone".\n`);
});
