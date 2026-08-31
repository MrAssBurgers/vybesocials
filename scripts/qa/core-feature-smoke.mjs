import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const tools = process.env.PLAYWRIGHT_PACKAGE_ROOT;
if (!tools) throw new Error('Set PLAYWRIGHT_PACKAGE_ROOT to the isolated Playwright installation.');
const { chromium, webkit, devices } = createRequire(path.join(tools, 'package.json'))('playwright');
const origin = 'http://127.0.0.1:4176';
const output = path.resolve('artifacts/core-feature-smoke');
await fs.mkdir(output, { recursive: true });
const report = {
  sourceCommit: process.env.GITHUB_SHA || null,
  startedAt: new Date().toISOString(),
  scope: 'Actual built app, signed out. Remote non-read requests blocked. No credentials, content submissions, authenticated E2E or native-device certification.',
  cases: [],
};
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4176', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
server.stdout.on('data', chunk => { serverLog += chunk; });
server.stderr.on('data', chunk => { serverLog += chunk; });
server.on('error', error => { serverLog += String(error); });
const profiles = [
  { name: 'desktop', engine: 'chromium', options: { viewport: { width: 1440, height: 900 } } },
  { name: 'android', engine: 'chromium', options: devices['Pixel 7'] },
  { name: 'iphone', engine: 'webkit', options: devices['iPhone 13'] },
  { name: 'landscape', engine: 'webkit', options: { ...devices['iPhone 13'], viewport: { width: 844, height: 390 } } },
];
const routes = ['/home', '/explore?q=music', '/clips', '/clips/qa-read-only'];
const safeError = value => String(value).replace(/https?:\/\/[^\s"'<>]+/g, url => {
  try { const parsed = new URL(url); return parsed.origin + parsed.pathname; } catch { return '[url]'; }
}).slice(0, 1800);
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error('Preview server stopped.');
    try { if ((await fetch(origin)).ok) { ready = true; break; } } catch { /* server is starting */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Preview server did not start.');
  for (const profile of profiles) {
    const browser = await (profile.engine === 'webkit' ? webkit : chromium).launch({ headless: true });
    try {
      for (const route of routes) {
        const row = { profile: profile.name, engine: profile.engine, browserVersion: browser.version(), route, status: 'NOT_RUN', checks: [], pageErrors: [], blockedNonReadRequests: 0 };
        const context = await browser.newContext({ ...profile.options, reducedMotion: 'reduce', permissions: [] });
        context.setDefaultTimeout(10000);
        await context.route('**/*', requestRoute => {
          const request = requestRoute.request();
          if (new URL(request.url()).origin !== origin && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
            row.blockedNonReadRequests++;
            return requestRoute.abort();
          }
          return requestRoute.continue();
        });
        const page = await context.newPage();
        page.on('pageerror', error => row.pageErrors.push(safeError(error)));
        const check = (name, value) => {
          row.checks.push({ name, passed: !!value });
          assert.ok(value, name);
        };
        const stem = `${profile.name}-${route.replace(/[^a-z0-9]/gi, '_')}`;
        try {
          const response = await page.goto(origin + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
          check('HTTP page loads', response && response.status() < 400);
          const main = page.getByRole('main', { name: 'Sign in to browse VYBE', exact: true });
          await main.waitFor({ state: 'visible', timeout: 40000 });
          await page.waitForTimeout(2300);
          const dismiss = page.getByRole('button', { name: 'Dismiss cookie notice', exact: true });
          if (await dismiss.isVisible()) { await dismiss.click(); await dismiss.waitFor({ state: 'hidden' }); }
          check('A named guest screen replaces denied queries', await main.count() === 1);
          check('Guest screen has one title', await main.getByRole('heading', { level: 1 }).count() === 1);
          check('Signed-out screen has no overlapping floating navigation', await page.getByRole('navigation', { name: 'Bottom navigation', exact: true }).count() === 0);
          check('No horizontal document overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          for (const name of ['Sign in', 'Create account', 'Learn about VYBE']) {
            const control = main.getByRole('link', { name, exact: true });
            await control.scrollIntoViewIfNeeded();
            await control.click({ trial: true }); // Verify hit testing without navigating or submitting.
            const box = await control.boundingBox();
            check(`${name} is reachable and has a 44px target`, box && box.width >= 43.5 && box.height >= 43.5 && box.y >= -1 && box.y + box.height <= profile.options.viewport.height + 1);
          }
          await page.screenshot({ path: path.join(output, `${stem}-actions.png`), animations: 'disabled' });
          await main.evaluate(element => { element.scrollTop = 0; });
          await page.screenshot({ path: path.join(output, `${stem}.png`), animations: 'disabled' });
          if (route.startsWith('/explore')) {
            await main.getByRole('link', { name: 'Sign in', exact: true }).click();
            await page.waitForURL(url => url.pathname === '/login');
            await page.locator('#email').waitFor({ state: 'visible', timeout: 30000 });
            check('Sign in opens the real account form', await page.locator('#email').isVisible());
            const heading = page.locator('h1 .vybe-liquid-text__stream').first();
            const fill = await heading.evaluate(element => getComputedStyle(element).webkitTextFillColor);
            check('Reduced-motion account title is visible', fill !== 'transparent' && fill !== 'rgba(0, 0, 0, 0)');
            await page.goBack();
            await main.waitFor({ state: 'visible' });
            check('Browser Back restores the original query', new URL(page.url()).searchParams.get('q') === 'music');
          }
          check('No uncaught browser exceptions', row.pageErrors.length === 0);
          row.status = 'PASS';
        } catch (error) {
          row.status = 'FAIL'; row.error = safeError(error);
          row.body = (await page.locator('body').innerText().catch(() => '')).slice(0, 1800);
          await page.screenshot({ path: path.join(output, `${stem}-error.png`), animations: 'disabled', timeout: 10000 }).catch(() => {});
        } finally {
          page.removeAllListeners(); await context.close(); report.cases.push(row);
          await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
          console.log('CORE_SMOKE', JSON.stringify(row));
        }
      }
    } finally { await browser.close(); }
  }
} finally {
  server.kill('SIGTERM');
  report.finishedAt = new Date().toISOString();
  report.counts = report.cases.reduce((counts, row) => ({ ...counts, [row.status]: (counts[row.status] || 0) + 1 }), {});
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(output, 'server.log'), serverLog);
}
assert.equal(report.cases.length, profiles.length * routes.length, 'Every declared browser case must run.');
assert.ok(report.cases.every(row => row.status === 'PASS'), 'Some core-route browser checks failed.');
