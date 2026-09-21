import { chromium } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
// plain desktop context, narrow window - no mobile emulation at all
const ctx=await b.newContext({viewport:{width:360,height:740}});
const p=await ctx.newPage();
await p.goto(`${BASE}/#/words/N5`,{waitUntil:'load'});
await p.waitForSelector('.wrow',{timeout:15000});
await p.waitForTimeout(1000);
const base=await p.evaluate(()=>{
  const row=document.querySelector('.wrow'), jp=row.querySelector('.wrow-jp');
  const rg=document.createRange(); rg.selectNodeContents(jp);
  return {docSW:document.documentElement.scrollWidth,clientW:document.documentElement.clientWidth,
    rowW:Math.round(row.getBoundingClientRect().width),jpTextL:Math.round(rg.getBoundingClientRect().left),
    align:getComputedStyle(row).textAlign};
});
console.log('NO-EMULATION 360 baseline:',JSON.stringify(base));
// apply proposed fix
await p.addStyleTag({content:'.list{grid-template-columns:minmax(0,1fr)} .wrow{text-align:left}'});
await p.waitForTimeout(300);
const fixed=await p.evaluate(()=>{
  const row=document.querySelector('.wrow'), jp=row.querySelector('.wrow-jp');
  const rg=document.createRange(); rg.selectNodeContents(jp);
  return {docSW:document.documentElement.scrollWidth,
    rowW:Math.round(row.getBoundingClientRect().width),jpTextL:Math.round(rg.getBoundingClientRect().left),
    text:row.innerText.replace(/\s+/g,' ')};
});
console.log('AFTER PROPOSED FIX     :',JSON.stringify(fixed));
await p.screenshot({path:'build/test/zz-fixed-360.png'});
await b.close();
