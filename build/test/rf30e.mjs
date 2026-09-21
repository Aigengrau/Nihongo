import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium, devices } from 'playwright';
const ROOT=path.resolve('C:/Users/ochil/Desktop/Projects/My Projects/nihongo/app');
let BUILDVER='v3.0.0';
const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const sw=[];
const server=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';if(u==='/sw.js')sw.push(BUILDVER);
const fp=path.join(ROOT,u); if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('nf');}
let b=fs.readFileSync(fp); if(u==='/sw.js')b=Buffer.from(b.toString().replace(/const BUILD = '[^']+'/,`const BUILD = '${BUILDVER}'`));
res.writeHead(200,{'Content-Type':TYPES[path.extname(fp)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);});
await new Promise(r=>server.listen(0,r));
const BASE='http://localhost:'+server.address().port;
const br=await chromium.launch(); const ctx=await br.newContext({...devices['Pixel 7']}); const page=await ctx.newPage();
const probe=()=>page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return{bar:!document.getElementById('updateBar').hidden,waiting:!!r?.waiting,caches:(await caches.keys()).sort()};});
await page.goto(BASE+'/#/today',{waitUntil:'load'}); await page.waitForTimeout(5000);
console.log('A install v3:',JSON.stringify(await probe()));
BUILDVER='v4.0.0';
for(const n of [1,2,3]){ await page.reload({waitUntil:'load'}); await page.waitForTimeout(7000);
  console.log(`reload#${n} (no reg.update ever):`,JSON.stringify(await probe()),'swFetches',sw.join(',')); }
await br.close(); server.close();
