import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const BASE='http://localhost:8099';
const ids=JSON.parse(fs.readFileSync('app/data/stories/index.json','utf8')).map(s=>s.id);
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
const seen=new Map(); let blobs=0, lines=0;
for(const id of ids){
  await p.goto(`${BASE}/#/read/s/${id}`,{waitUntil:'load'});
  await p.waitForTimeout(2200);
  const r=await p.evaluate(()=>{
    const pairs=[];let blob=0,n=0;
    document.querySelectorAll('.wtext').forEach(w=>{
      n++;
      const chips=w.querySelectorAll('.wchip');
      if(chips.length===1 && w.innerText.replace(/\s/g,'').length>6) blob++;
      w.querySelectorAll('ruby').forEach(ru=>{
        const rt=ru.querySelector('rt')?.textContent||'';
        const base=[...ru.childNodes].filter(x=>x.nodeType===3).map(x=>x.textContent).join('');
        pairs.push(base+'|'+rt);
      });
    });
    return {pairs,blob,n};
  });
  blobs+=r.blob; lines+=r.n;
  r.pairs.forEach(x=>seen.set(x,(seen.get(x)||0)+1));
}
console.log('story lines total',lines,'single-chip blobs',blobs);
console.log('distinct ruby pairs',seen.size);
const rows=[...seen.entries()].sort((a,b)=>b[1]-a[1]);
fs.writeFileSync('C:/Users/ochil/AppData/Local/Temp/claude/ruby.txt', rows.map(([k,v])=>v+'  '+k).join('\n'));
console.log(rows.slice(0,60).map(([k,v])=>k+'('+v+')').join('  '));
await b.close();
