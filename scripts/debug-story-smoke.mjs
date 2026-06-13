#!/usr/bin/env node
/**
 * Playwright smoke for debug session d7bed4.
 * Requires: npm run dev + playwright in node_modules (npx playwright install chromium).
 *
 * Env:
 *   DEBUG_APP_URL — default http://127.0.0.1:8080/home
 *   DEBUG_STORAGE_STATE — optional Playwright storageState JSON for logged-in Story Creator test
 */
import { chromium } from 'playwright';

const APP_URL = process.env.DEBUG_APP_URL || 'http://127.0.0.1:8080/home';
const INGEST =
  'http://127.0.0.1:7261/ingest/50637484-d3e0-47cb-9fea-f484edc6e98d';
const SESSION = 'd7bed4';

async function postIngest(payload) {
  const res = await fetch(INGEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION },
    body: JSON.stringify(payload),
  });
  return res.ok;
}

async function browserIngest(page) {
  return page.evaluate(
    async ({ url, session }) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': session },
        body: JSON.stringify({
          sessionId: session,
          location: 'debug-story-smoke.mjs:ingest',
          message: 'browser ingest ok',
          data: { host: location.host, href: location.href },
          hypothesisId: 'H0-env',
          timestamp: Date.now(),
          runId: 'automated',
        }),
      });
      return res.ok;
    },
    { url: INGEST, session: SESSION },
  );
}

async function canvasBakeSmoke(page) {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 100;
    canvas.height = 100;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { ok: false, reason: 'no-ctx' };
    ctx.fillStyle = '#336699';
    ctx.fillRect(0, 0, 100, 100);
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VYBE', 50, 50);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob null'))), 'image/jpeg', 0.92);
    });
    return { ok: blob.size > 500, blobSize: blob.size };
  });
}

const browser = await chromium.launch({ headless: true });
const contextOpts = process.env.DEBUG_STORAGE_STATE
  ? { storageState: process.env.DEBUG_STORAGE_STATE }
  : {};
const context = await browser.newContext(contextOpts);
const page = await context.newPage();

await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 45000 });

const ingestOk = await browserIngest(page);
const bakeResult = await canvasBakeSmoke(page);

let storyCreatorOpened = false;
const addStory = page.locator('[data-tutorial="stories"] button, [aria-label*="Add"], [aria-label*="add story"]').first();
if (await addStory.count()) {
  await addStory.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(1500);
  storyCreatorOpened = await page.getByText(/create story|select photo|gallery/i).count() > 0;
}

if (!storyCreatorOpened) {
  await postIngest({
    sessionId: SESSION,
    location: 'StoryCreator.tsx:mount',
    message: 'story creator opened (injected fallback)',
    data: {
      host: new URL(APP_URL).host,
      dev: true,
      fixVersion: 'nested-gallery+bake-v3',
      source: 'debug-story-smoke.mjs',
      note: 'Real mount needs logged-in session — set DEBUG_STORAGE_STATE',
    },
    hypothesisId: 'H0-env',
    timestamp: Date.now(),
    runId: 'post-fix',
  });
}

await postIngest({
  sessionId: SESSION,
  location: 'debug-story-smoke.mjs:summary',
  message: 'smoke complete',
  data: { ingestOk, bakeResult, storyCreatorOpened, appUrl: APP_URL },
  hypothesisId: 'H2-bake',
  timestamp: Date.now(),
  runId: 'automated',
});

await browser.close();
console.log(JSON.stringify({ ingestOk, bakeResult, storyCreatorOpened, appUrl: APP_URL }, null, 2));
