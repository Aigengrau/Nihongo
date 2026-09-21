import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const p=await (await b.newContext({...devices['Pixel 7']})).newPage();
await p.goto(`${BASE}/#/business`,{waitUntil:'load'});
await p.waitForTimeout(1200);
const ids = await p.locator('#view a, #view [data-href], #view button').evaluateAll(els=>els.slice(0,25).map(e=>(e.getAttribute('href')||e.getAttribute('data-href')||'')+' :: '+e.innerText.slice(0,40).replace(/\s+/g,' ')));
console.log(ids.join('\n'));
await b.close();
