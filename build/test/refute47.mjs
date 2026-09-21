import { chromium, devices } from 'playwright';
const BASE='http://localhost:8099';
const b=await chromium.launch();
const ctx=await b.newContext({...devices['Pixel 7']});
const page=await ctx.newPage();
const T=n=>page.waitForTimeout(n);
await page.goto(BASE+'/#/today',{waitUntil:'load'}); await T(1200);
await page.click('#start'); await T(2500);
await page.goto(BASE+'/#/learn/N5',{waitUntil:'load'}); await T(1800);
for(let i=1;i<=10;i++){
  const word = await page.locator('#view .jp-lg').first().innerText().catch(()=>'?');
  const cards = page.locator('#view .card');
  let ex='(none)', tapchips=0, rubies=0;
  if(await cards.count()>1){
    const sec = cards.nth(1);
    ex = (await sec.innerText()).replace(/\n/g,' / ');
    tapchips = await sec.locator('.wchip').count();
    rubies = await sec.locator('ruby, rt').count();
  }
  console.log(`card ${i}  word=${word.replace(/\s+/g,'')}`);
  console.log(`   example: ${ex}`);
  console.log(`   tappable chips in example: ${tapchips} | ruby/furigana: ${rubies}`);
  const nb = page.locator('#view button:has-text("Got it")').first();
  if(!await nb.count()) break;
  await nb.click(); await T(600);
}
await b.close();
