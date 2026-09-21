import { chromium, devices } from 'playwright';
import fs from 'node:fs';
const BASE='http://localhost:8099';
const ids=JSON.parse(fs.readFileSync('app/data/stories/index.json','utf8')).map(s=>s.id);
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
const rows=[];
for(const id of ids){
  await p.goto(`${BASE}/#/read/s/${id}`,{waitUntil:'load'});
  await p.waitForTimeout(2000);
  const r=await p.evaluate(()=>{
    const out=[];
    document.querySelectorAll('.wtext').forEach(w=>{
      const plain=[...w.querySelectorAll('.wchip, .wpunct')].map(c=>{
        if(c.classList.contains('wpunct'))return c.textContent;
        return [...c.childNodes].map(n=>n.nodeType===3?n.textContent:(n.tagName==='RUBY'?[...n.childNodes].filter(x=>x.nodeType===3).map(x=>x.textContent).join(''):'')).join('');
      }).join('');
      w.querySelectorAll('.wchip').forEach(c=>{
        c.querySelectorAll('ruby').forEach(ru=>{
          const rt=ru.querySelector('rt')?.textContent||'';
          const base=[...ru.childNodes].filter(x=>x.nodeType===3).map(x=>x.textContent).join('');
          out.push([base,rt,c.dataset.s,plain]);
        });
      });
    });
    return out;
  });
  r.forEach(x=>rows.push([id,...x]));
}
fs.writeFileSync('C:/Users/ochil/AppData/Local/Temp/claude/ruby2.tsv', rows.map(r=>r.join('\t')).join('\n'));
console.log('rows',rows.length);
const want=['個','長','一','日','何','中','間','方','生','行','上','下','来','家','人'];
for(const k of want){
  const set=new Map();
  rows.filter(r=>r[1]===k).forEach(r=>{const key=r[2]; set.set(key,(set.get(key)||[])); set.get(key).push(r[3]);});
  console.log('\n'+k+':');
  for(const [rt,ctxs] of set) console.log('   '+rt+' ('+ctxs.length+')  e.g. '+ctxs[0].slice(0,42));
}
await b.close();
