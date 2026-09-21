import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('pageerror',e.message));
await p.goto(`${BASE}/#/words/N5`,{waitUntil:'load'});
await p.waitForTimeout(3000);
const txt=await p.locator('#view').innerText();
for(const w of ['為る','居る','有る','此処','出来る','遣る','私']){
  console.log(w, txt.includes(w) ? 'PRESENT in N5 word list' : '(not in first page)');
}
// scroll to load all, then count
await p.evaluate(async()=>{for(let i=0;i<40;i++){window.scrollTo(0,document.body.scrollHeight);await new Promise(r=>setTimeout(r,120));}});
await p.waitForTimeout(800);
const txt2=await p.locator('#view').innerText();
for(const w of ['為る','居る','有る','此処','出来る','遣る']){
  const i=txt2.indexOf(w);
  console.log(w, i<0?'absent':'FOUND -> '+txt2.slice(i,i+60).replace(/\n/g,' / '));
}
await p.screenshot({path:'build/test/shots/jp-words-n5.png',fullPage:false});
await b.close();
