import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const apiCalls = [];
page.on('response', (res) => {
  if (res.url().includes('/auth/')) apiCalls.push(`${res.status()} ${res.request().method()} ${res.url()}`);
});
await page.goto('https://app.opslin.com/login', { waitUntil: 'networkidle', timeout: 20000 });
await page.fill('#email', 'admin@opslin.com');
await page.fill('#password', 'SuperAdmin@123');
await page.click('button[type="submit"]');
await page.waitForTimeout(3000);
console.log('URL after login:', page.url());
console.log('auth calls:', apiCalls);
await browser.close();
