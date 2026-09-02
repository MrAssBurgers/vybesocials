import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const tools = process.env.PLAYWRIGHT_PACKAGE_ROOT;
if (!tools) throw new Error('Set PLAYWRIGHT_PACKAGE_ROOT to the isolated Playwright installation.');
const { chromium, webkit } = createRequire(path.join(tools, 'package.json'))('playwright');

const origin = 'http://127.0.0.1:4177';
const output = path.resolve('artifacts/public-shell-smoke');
await fs.mkdir(output, { recursive: true });

const profiles = [
  { name: 'phone-chromium', engine: 'chromium', viewport: { width: 390, height: 844 }, touch: true },
  { name: 'tablet-chromium', engine: 'chromium', viewport: { width: 768, height: 1024 }, touch: true },
  { name: 'tablet-landscape', engine: 'chromium', viewport: { width: 1024, height: 768 }, touch: true },
  { name: 'desktop-chromium', engine: 'chromium', viewport: { width: 1440, height: 900 }, touch: false },
  { name: 'iphone-webkit', engine: 'webkit', viewport: { width: 390, height: 844 }, touch: true },
];

const routes = [
  '/',
  '/auth',
  '/about',
  '/privacy',
  '/terms',
  '/safety',
  '/community-guidelines',
  '/delete-account',
  '/home',
  '/explore?q=music',
  '/clips',
  '/release-qa-not-found',
];

const report = {
  sourceCommit: process.env.GITHUB_SHA || null,
  startedAt: new Date().toISOString(),
  scope: 'Built VYBE app, signed out, read-only browser matrix. Remote non-read requests blocked. No production records or provider flows are exercised.',
  cases: [],
};

const server = spawn(
  process.execPath,
  ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', '4177', '--strictPort'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
);
let serverLog = '';
server.stdout.on('data', (chunk) => { serverLog += chunk; });
server.stderr.on('data', (chunk) => { serverLog += chunk; });
server.on('error', (error) => { serverLog += String(error); });

const clean = (value) => String(value)
  .replace(/https?:\/\/[^\s"'<>]+/g, (url) => {
    try {
      const parsed = new URL(url);
      return parsed.origin + parsed.pathname;
    } catch {
      return '[url]';
    }
  })
  .slice(0, 1800);

try {
  let ready = false;
  for (let i = 0; i < 80; i += 1) {
    if (server.exitCode !== null) throw new Error('Preview server stopped before becoming ready.');
    try {
      if ((await fetch(origin)).ok) {
        ready = true;
        break;
      }
    } catch {
      // Preview is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('Preview server did not start.');

  for (const profile of profiles) {
    const browserType = profile.engine === 'webkit' ? webkit : chromium;
    const browser = await browserType.launch({ headless: true });
    try {
      for (const route of routes) {
        const row = {
          profile: profile.name,
          engine: profile.engine,
          browserVersion: browser.version(),
          route,
          status: 'NOT_RUN',
          checks: [],
          pageErrors: [],
          blockedNonReadRequests: 0,
        };

        const context = await browser.newContext({
          viewport: profile.viewport,
          hasTouch: profile.touch,
          isMobile: profile.viewport.width < 768,
          reducedMotion: 'reduce',
          permissions: [],
        });
        context.setDefaultTimeout(12_000);
        await context.route('**/*', async (requestRoute) => {
          const request = requestRoute.request();
          const requestOrigin = new URL(request.url()).origin;
          if (requestOrigin !== origin && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
            row.blockedNonReadRequests += 1;
            await requestRoute.abort();
            return;
          }
          await requestRoute.continue();
        });

        const page = await context.newPage();
        page.on('pageerror', (error) => row.pageErrors.push(clean(error)));
        const check = (name, value) => {
          const passed = Boolean(value);
          row.checks.push({ name, passed });
          assert.ok(passed, name);
        };

        const stem = `${profile.name}-${route.replace(/[^a-z0-9]/gi, '_') || 'root'}`;
        try {
          const response = await page.goto(origin + route, {
            waitUntil: 'domcontentloaded',
            timeout: 45_000,
          });
          check('HTTP page loads', response && response.status() < 400);

          await page.waitForFunction(() => {
            const shell = document.querySelector('[data-route-shell], #main-content, main, [role="main"]');
            const splash = document.querySelector('#vybe-static-boot');
            const splashStyle = splash ? getComputedStyle(splash) : null;
            const splashHidden = !splash || splashStyle?.display === 'none' || splashStyle?.visibility === 'hidden' || splashStyle?.opacity === '0';
            return Boolean(shell) && splashHidden;
          }, null, { timeout: 45_000 });
          await page.waitForTimeout(500);

          const dismiss = page.getByRole('button', { name: 'Dismiss cookie notice', exact: true });
          if (await dismiss.isVisible().catch(() => false)) {
            await dismiss.click();
            await dismiss.waitFor({ state: 'hidden' }).catch(() => {});
          }

          const mainLandmarks = page.getByRole('main');
          check('Exactly one visible main landmark', await mainLandmarks.count() === 1);
          const main = mainLandmarks.first();
          check('Main landmark has the shared skip target', await main.getAttribute('id') === 'main-content');

          const skip = page.getByRole('link', { name: 'Skip to main content', exact: true });
          check('Skip link exists once', await skip.count() === 1);
          await skip.focus();
          await page.keyboard.press('Enter');
          check(
            'Skip link moves focus to main content',
            await page.evaluate(() => document.activeElement?.id === 'main-content'),
          );

          check(
            'No horizontal document overflow',
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
          );

          check(
            'Maintenance overlay is not visible in a healthy build',
            await page.locator('#vybe-maintenance-static:visible').count() === 0,
          );
          check(
            'Startup recovery overlay is not visible after successful boot',
            await page.locator('#vybe-boot-recovery:visible').count() === 0,
          );

          const bodyText = await page.locator('body').innerText();
          check('Normal page text excludes reconstruction copy', !bodyText.includes('Under reconstruction'));
          check('Normal page text excludes dormant startup-error copy', !bodyText.includes("VYBE didn't load"));
          check('Document title is meaningful', (await page.title()).trim().length > 4);
          check('No uncaught browser exceptions', row.pageErrors.length === 0);

          await page.screenshot({
            path: path.join(output, `${stem}.png`),
            animations: 'disabled',
            fullPage: false,
          });
          row.status = 'PASS';
        } catch (error) {
          row.status = 'FAIL';
          row.error = clean(error);
          row.body = (await page.locator('body').innerText().catch(() => '')).slice(0, 1800);
          await page.screenshot({
            path: path.join(output, `${stem}-error.png`),
            animations: 'disabled',
            timeout: 10_000,
          }).catch(() => {});
        } finally {
          page.removeAllListeners();
          await context.close();
          report.cases.push(row);
          await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
          console.log('PUBLIC_SHELL_SMOKE', JSON.stringify(row));
        }
      }
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill('SIGTERM');
  report.finishedAt = new Date().toISOString();
  report.counts = report.cases.reduce(
    (counts, row) => ({ ...counts, [row.status]: (counts[row.status] || 0) + 1 }),
    {},
  );
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  await fs.writeFile(path.join(output, 'server.log'), serverLog);
}

assert.equal(report.cases.length, profiles.length * routes.length, 'Every declared browser case must run.');
assert.ok(report.cases.every((row) => row.status === 'PASS'), 'Some public shell browser checks failed.');
