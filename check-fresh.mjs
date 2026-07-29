import { chromium } from 'playwright';
const browser = await chromium.launch({ channel: 'chrome' });
// Fully isolated, no cache, no cookies, no prior state at all.
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const apiCalls = [];
page.on('request', (req) => {
  if (req.url().includes('/auth/') || req.url().includes('/health')) apiCalls.push(req.url());
});
await page.goto('https://app.opslin.com/login', { waitUntil: 'networkidle', timeout: 20000, });
await page.waitForTimeout(1000);
console.log('Fresh incognito-style load of https://app.opslin.com/login:');
for (const url of apiCalls) console.log(' ', url);

const cspHeader = await page.evaluate(() => {
  return document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content || 'checking response headers instead';
});
console.log('CSP meta tag:', cspHeader);

await browser.close();
