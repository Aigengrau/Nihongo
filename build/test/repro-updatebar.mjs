import { chromium } from 'playwright';
const BASE = 'http://localhost:8099';
const browser = await chromium.launch();
const sizes = [[375,667,'iPhone SE'],[393,852,'iPhone 14 Pro'],[412,915,'Pixel 7']];

for (const [w,h,label] of sizes) {
  for (const safe of [0, 34]) {
    const ctx = await browser.newContext({ viewport:{width:w,height:h}, deviceScaleFactor:2, isMobile:true, hasTouch:true });
    const page = await ctx.newPage();
    const inject = async () => { if (safe) await page.addStyleTag({content:`:root{--safe-t:59px;--safe-b:${safe}px}`}).catch(()=>{}); };
    await page.goto(`${BASE}/#/today`, {waitUntil:'load'}); await page.waitForTimeout(1500);
    const b = page.locator('#start'); if (await b.count()) { await b.click(); await page.waitForTimeout(1000); }
    await page.goto(`${BASE}/#/review`, {waitUntil:'load'}); await page.waitForTimeout(1500);
    await inject();
    const rev = page.locator('#reveal');
    if (await rev.count()) { await rev.click(); await page.waitForTimeout(500); }
    if (!(await page.locator('.grade').count())) { console.log(`${label} ${w}x${h} safe=${safe}: no grades: ${(await page.locator('#view').innerText()).slice(0,60).replace(/\s+/g,' ')}`); await ctx.close(); continue; }
    await page.evaluate(()=>{ document.getElementById('updateBar').hidden=false; });
    await page.waitForTimeout(200);
    const out = await page.evaluate(()=>{
      const maxS = document.documentElement.scrollHeight - window.innerHeight;
      const rows=[];
      for (const s of [...new Set([0, Math.round(maxS/2), maxS])]) {
        window.scrollTo(0,s);
        const bar=document.getElementById('updateBar').getBoundingClientRect();
        const hits=[...document.querySelectorAll('.grade')].map(g=>{
          const r=g.getBoundingClientRect();
          const cx=r.left+r.width/2, cy=r.top+r.height/2;
          const el=(cy>0&&cy<window.innerHeight)?document.elementFromPoint(cx,cy):null;
          const ov=Math.max(0,Math.min(bar.bottom,r.bottom)-Math.max(bar.top,r.top))*Math.max(0,Math.min(bar.right,r.right)-Math.max(bar.left,r.left));
          return {t:Math.round(r.top),b:Math.round(r.bottom),ov:Math.round(100*ov/(r.width*r.height)),
            hit: !el?'OFFSCREEN':(el.closest('.grade')?'GRADE':(el.closest('.updatebar')?'UPDATEBAR':(el.closest('.tabbar')?'TABBAR':el.tagName+'.'+el.className)))};
        });
        rows.push({s, bar:[Math.round(bar.top),Math.round(bar.bottom)], hits});
      }
      return {maxS, vh:window.innerHeight, rows};
    });
    console.log(`\n== ${label} ${w}x${h} safe-b=${safe}  vh=${out.vh} maxScroll=${out.maxS}`);
    for (const r of out.rows) console.log(`  scrollY=${String(r.s).padStart(4)} bar=${r.bar[0]}-${r.bar[1]}  ` + r.hits.map(x=>`[${x.t}-${x.b} ov${x.ov}% ${x.hit}]`).join(' '));
    // real tap test at bottom scroll
    await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
    const before = await page.locator('.review-top span').first().textContent();
    let tapErr='';
    try { await page.locator('.grade[data-g="4"]').click({timeout:2500}); } catch(e){ tapErr = e.message.split('\n')[0]; }
    await page.waitForTimeout(600);
    const after = await page.locator('.review-top span').first().textContent().catch(()=>'gone');
    console.log(`  real tap Easy: ${tapErr? 'FAILED -> '+tapErr : 'clicked'}  progress ${before} -> ${after}`);
    await page.screenshot({path:`build/test/shots/repro-updatebar-${w}x${h}-safe${safe}.png`});
    await ctx.close();
  }
}
await browser.close();
