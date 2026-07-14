/**
 * Probe DM open → leave on local or staging (auth required for full flow).
 * Usage: node scripts/probe-dm-leave.mjs [baseUrl]
 */
import { chromium, devices } from 'playwright';

const BASE = process.argv[2] || 'http://127.0.0.1:8080';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 13'],
  });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (msg) => {
    if (String(msg.text()).includes('vybe-dm-nav-debug')) logs.push(msg.text());
  });

  await page.goto(`${BASE}/messages`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(2500);

  const path1 = page.url();
  console.log('start url:', path1);

  // Enable nav debug
  await page.evaluate(() => localStorage.setItem('vybe-dm-nav-debug', '1'));

  // Try auth-gated: look for conversation rows or login
  const row = page.locator('[data-conversation-id], a[href*="/messages/"], [data-dm-row]').first();
  const backLinkSel = '[data-dm-back-link], a[aria-label="Back to messages"], button[aria-label="Back to messages"]';

  const hasRow = await row.count().then((n) => n > 0).catch(() => false);
  const bodyText = await page.locator('body').innerText().catch(() => '');
  console.log('has conversation row:', hasRow);
  console.log('body snippet:', bodyText.slice(0, 280).replace(/\s+/g, ' '));

  if (!hasRow) {
    // Hit-test probe at typical back-button coords even without auth
    const hit = await page.evaluate(() => {
      const pts = [
        { x: 28, y: 56 },
        { x: 40, y: 80 },
        { x: 20, y: 100 },
      ];
      return pts.map(({ x, y }) => {
        const el = document.elementFromPoint(x, y);
        return {
          x,
          y,
          tag: el?.tagName,
          id: el?.id,
          cls: (el?.className && String(el.className).slice(0, 100)) || '',
          aria: el?.getAttribute?.('aria-label'),
        };
      });
    });
    console.log('hit-test (no inbox rows / likely logged out):', JSON.stringify(hit, null, 2));
    await browser.close();
    process.exit(hasRow ? 0 : 2);
  }

  await row.click({ timeout: 10000 });
  await page.waitForTimeout(2000);
  const path2 = page.url();
  console.log('after open:', path2);

  const back = page.locator(backLinkSel).first();
  const backCount = await back.count();
  console.log('back control count:', backCount);

  if (backCount === 0) {
    const hit = await page.evaluate(() => {
      const el = document.elementFromPoint(28, 56);
      return {
        tag: el?.tagName,
        id: el?.id,
        cls: String(el?.className || '').slice(0, 120),
        aria: el?.getAttribute?.('aria-label'),
        html: document.documentElement.getAttribute('data-dm-active'),
        camera: document.documentElement.getAttribute('data-camera-open'),
      };
    });
    console.log('no back control; hit-test:', hit);
    await browser.close();
    process.exit(3);
  }

  // What is under the back control?
  const box = await back.boundingBox();
  console.log('back box:', box);
  if (box) {
    const under = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return {
        tag: el?.tagName,
        id: el?.id,
        cls: String(el?.className || '').slice(0, 120),
        aria: el?.getAttribute?.('aria-label'),
        href: el?.getAttribute?.('href'),
      };
    }, { x: box.x + box.width / 2, y: box.y + box.height / 2 });
    console.log('element under back center:', under);
  }

  await back.click({ force: false, timeout: 5000 });
  await page.waitForTimeout(1500);
  const path3 = page.url();
  console.log('after back:', path3);
  console.log('debug logs:', logs.slice(-10));

  const left = /\/messages\/?$/.test(new URL(path3).pathname) || path3.includes('/messages?') || new URL(path3).pathname === '/messages';
  await browser.close();
  if (!left) {
    console.error('FAIL: still not on inbox after back');
    process.exit(4);
  }
  console.log('PASS: left conversation');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
