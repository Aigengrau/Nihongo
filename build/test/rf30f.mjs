import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium, devices } from 'playwright';
const ROOT=path.resolve('C:/Users/ochil/Desktop/Projects/My Projects/nihongo/app');
let BUILDVER='v3.0.0';
const TYPES={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.mp3':'audio/mpeg'};
const server=http.createServer((req,res)=>{let u=decodeURIComponent(req.url.split('?')[0]);if(u.endsWith('/'))u+='index.html';
const fp=path.join(ROOT,u); if(!fp.startsWith(ROOT)||!fs.existsSync(fp)||fs.statSync(fp).isDirectory()){res.writeHead(404);return res.end('nf');}
let b=fs.readFileSync(fp); if(u==='/sw.js')b=Buffer.from(b.toString().replace(/const BUILD = '[^']+'/,`const BUILD = '${BUILDVER}'`));
res.writeHead(200,{'Content-Type':TYPES[path.extname(fp)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);});
await new Promise(r=>server.listen(0,r));
const BASE='http://localhost:'+server.address().port;
const br=await chromium.launch(); const ctx=await br.newContext({...devices['Pixel 7']});
let page=await ctx.newPage();
const probe=(p)=>p.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return{bar:!document.getElementById('updateBar').hidden,waiting:!!r?.waiting,active:r?.active?.scriptURL?'y':'n',caches:(await caches.keys()).sort()};});
await page.goto(BASE+'/#/today',{waitUntil:'load'}); await page.waitForTimeout(5000);
BUILDVER='v4.0.0';
await page.reload({waitUntil:'load'}); await page.waitForTimeout(7000);
console.log('reload#1:',JSON.stringify(await probe(page)));
await page.reload({waitUntil:'load'}); await page.waitForTimeout(7000);
console.log('reload#2 (bar gone):',JSON.stringify(await probe(page)));
// user closes the PWA entirely, then reopens it
await page.close(); await new Promise(r=>setTimeout(r,3000));
page=await ctx.newPage(); await page.goto(BASE+'/#/today',{waitUntil:'load'}); await page.waitForTimeout(7000);
console.log('after full close+reopen:',JSON.stringify(await probe(page)));
const ver=await page.evaluate(async()=>{const c=await caches.keys();return c;});
await br.close(); server.close();
