import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(process.argv[2]);
const PORT = Number(process.argv[3]);
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.mp3':'audio/mpeg'};
http.createServer((req,res)=>{
  let p = decodeURIComponent(new URL(req.url,'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.join(ROOT,p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404,{'Content-Type':'text/plain'}); return res.end('Not found'); }
  res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache','Service-Worker-Allowed':'/'});
  fs.createReadStream(file).pipe(res);
}).listen(PORT,()=>console.log('rf27 server on',PORT,ROOT));
