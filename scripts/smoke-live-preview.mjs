import { chromium, devices } from 'playwright';

const BASE = process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5173';
const results = [];

async function check(label, fn) {
  try {
    await fn();
    results.push({ label, ok: true });
    console.log(`PASS: ${label}`);
  } catch (err) {
    results.push({ label, ok: false, error: err?.message || String(err) });
    console.log(`FAIL: ${label} — ${err?.message || err}`);
  }
}

const browser = await chromium.launch({ headless: true });

{
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await check('iPhone: /home loads after splash', async () => {
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4500);
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    if (text.length < 40) throw new Error(`Body too empty (${text.length} chars)`);
  });
  await check('iPhone: Home shows feed or auth affordance', async () => {
    const ok = await page.getByText(/offline|saved feed|For You|Global|Sign in|Log in|VYBE|Friend/i).first().isVisible().catch(() => false);
    if (!ok) throw new Error('No recognizable Home UI');
  });
  await check('iPhone: /upload create studio mounts', async () => {
    await page.goto(`${BASE}/upload`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2500);
    const text = await page.locator('body').innerText();
    if (text.length < 20) throw new Error('Upload page blank');
    if (!/camera|photo|video|create|unavailable|Enable|Close/i.test(text)) {
      throw new Error('Create studio UI not detected');
    }
  });
  await ctx.close();
}

{
  const ctx = await browser.newContext({ ...devices['iPad Pro 11'] });
  const page = await ctx.newPage();
  await check('iPad: /home loads after splash', async () => {
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(4500);
    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ').trim();
    if (text.length < 40) throw new Error(`Body too empty (${text.length} chars)`);
  });
  await check('iPad: /auth not blank', async () => {
    await page.goto(`${BASE}/auth`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(2000);
    const text = await page.locator('body').innerText();
    if (!/log in|sign up|email|password|VYBE/i.test(text)) throw new Error('Auth UI missing');
  });
  await ctx.close();
}

{
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  await check('iPhone: visibility resume (ATT simulation)', async () => {
    await page.goto(`${BASE}/home`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForTimeout(500);
    const text = (await page.locator('body').innerText()).trim();
    if (text.length < 40) throw new Error('Blank after visibility resume');
  });
  await ctx.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
