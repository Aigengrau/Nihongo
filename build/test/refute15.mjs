import { chromium } from 'playwright';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
await p.goto('http://localhost:8099/#/business/keigo-irregulars', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const tbl = await p.evaluate(() => {
  const t = document.querySelector('table');
  if (!t) return null;
  const head = [...t.querySelectorAll('thead th')].map(x => x.textContent.trim());
  const rows = [...t.querySelectorAll('tbody tr')].map(r => [...r.querySelectorAll('td')].map(c => c.textContent.trim().replace(/\s+/g,' ')));
  return { head, rows };
});
console.log(JSON.stringify(tbl.head));
for (const r of tbl.rows) console.log(r.join(' | '));
await p.screenshot({ path: 'build/test/shots/refute15-keigo.png', fullPage: true });
await b.close();
