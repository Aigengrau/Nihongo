import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const p=await ctx.newPage();
p.on('pageerror',e=>console.log('pageerror',e.message));

// 1. Words list for N5
await p.goto(`${BASE}/#/words/N5`,{waitUntil:'load'});
await p.waitForTimeout(1500);
const txt=await p.locator('#view').innerText();
console.log('--- WORDS/N5 first 900 chars ---');
console.log(txt.slice(0,900));

// search for これ in the list
const search=await p.locator('input[type=search], input[type=text]').first();
if (await search.count()) {
  await search.fill('これ');
  await p.waitForTimeout(900);
  console.log('--- after search これ ---');
  console.log((await p.locator('#view').innerText()).slice(0,600));
}
await p.screenshot({path:'build/test/shots/refute44-words.png'});

// 2. Learn flow
await p.goto(`${BASE}/#/learn/N5`,{waitUntil:'load'});
await p.waitForTimeout(2000);
console.log('--- LEARN/N5 ---');
console.log((await p.locator('#view').innerText()).slice(0,700));
await p.screenshot({path:'build/test/shots/refute44-learn.png'});
await b.close();
