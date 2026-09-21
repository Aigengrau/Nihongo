import { chromium, devices } from 'playwright';
const b = await chromium.launch(); const c = await b.newContext({ ...devices['Pixel 7'] });
const p = await c.newPage();
await p.goto('http://localhost:8099/#/settings', { waitUntil: 'load' });
await p.waitForTimeout(2000);
const t = await p.locator('#view').innerText();
console.log('settings "Your data" text:', (t.match(/Everything you save[\s\S]{0,220}/) || ['?'])[0].replace(/\s+/g, ' '));
await b.close();
