#!/usr/bin/env node
/**
 * Authenticated story publish E2E for debug session d7bed4.
 * Requires: npm run dev + DEBUG_TEST_EMAIL + DEBUG_TEST_PASSWORD in env.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const APP_URL = process.env.DEBUG_APP_URL || 'http://127.0.0.1:8080/home';
const INGEST = 'http://127.0.0.1:7261/ingest/50637484-d3e0-47cb-9fea-f484edc6e98d';
const SESSION = 'd7bed4';

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (!m) continue;
      const key = m[1].trim();
      const val = m[2].trim().replace(/^"|"$/g, '');
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    /* ignore */
  }
}

loadEnv();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const EMAIL = process.env.DEBUG_TEST_EMAIL;
const PASSWORD = process.env.DEBUG_TEST_PASSWORD;

async function postIngest(payload) {
  await fetch(INGEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

if (!EMAIL || !PASSWORD) {
  await postIngest({
    sessionId: SESSION,
    location: 'debug-story-publish-e2e.mjs',
    message: 'skipped — set DEBUG_TEST_EMAIL and DEBUG_TEST_PASSWORD',
    data: {},
    hypothesisId: 'H0-env',
    timestamp: Date.now(),
    runId: 'automated',
  });
  console.log(JSON.stringify({ skipped: true, reason: 'missing DEBUG_TEST_EMAIL/PASSWORD' }));
  process.exit(0);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const { data: authData, error: authError } = await sb.auth.signInWithPassword({
  email: EMAIL,
  password: PASSWORD,
});

if (authError || !authData.session) {
  await postIngest({
    sessionId: SESSION,
    location: 'debug-story-publish-e2e.mjs',
    message: 'auth failed',
    data: { error: authError?.message ?? 'no session' },
    hypothesisId: 'H0-env',
    timestamp: Date.now(),
    runId: 'automated',
  });
  console.error(authError?.message || 'auth failed');
  process.exit(1);
}

const projectRef = SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1] ?? 'hprmicwhlaaqfgshucec';
const storageKey = `sb-${projectRef}-auth-token`;
const sessionJson = JSON.stringify({
  access_token: authData.session.access_token,
  refresh_token: authData.session.refresh_token,
  expires_at: authData.session.expires_at,
  expires_in: authData.session.expires_in,
  token_type: authData.session.token_type,
  user: authData.session.user,
});

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addInitScript(({ key, value }) => {
  localStorage.setItem(key, value);
}, { key: storageKey, value: sessionJson });

const page = await context.newPage();
await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(2000);

const sessionProbe = await page.evaluate(() => {
  const keys = Object.keys(localStorage).filter((k) => k.includes('auth-token'));
  return { authKeys: keys.length, href: location.href };
});

await postIngest({
  sessionId: SESSION,
  location: 'debug-story-publish-e2e.mjs',
  message: 'authenticated session injected',
  data: { ...sessionProbe, userId: authData.session.user.id },
  hypothesisId: 'H0-env',
  timestamp: Date.now(),
  runId: 'automated',
});

const storiesSection = page.locator('[data-tutorial="stories"]').first();
await storiesSection.locator('button').first().click({ timeout: 10000 }).catch(() => {});
await page.waitForTimeout(1500);

const creatorVisible = await page.getByText(/create story|gallery|camera/i).first().isVisible().catch(() => false);

let publishResult = { creatorVisible, shared: false, error: null };

if (creatorVisible) {
  const fileInput = page.locator('input[type="file"]').first();
  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP///9k=',
    'base64',
  );
  await fileInput.setInputFiles({
    name: 'test-story.jpg',
    mimeType: 'image/jpeg',
    buffer: jpeg,
  }).catch((e) => {
    publishResult.error = e.message;
  });

  await page.waitForTimeout(3000);

  const shareBtn = page.getByRole('button', { name: /share/i }).first();
  if (await shareBtn.isEnabled().catch(() => false)) {
    await shareBtn.click();
    await page.waitForTimeout(15000);
    publishResult.shared = true;
  } else {
    publishResult.error = 'share button disabled';
  }
}

const { data: stories } = await sb
  .from('stories')
  .select('id, created_at')
  .eq('author_id', authData.session.user.id)
  .order('created_at', { ascending: false })
  .limit(1);

await postIngest({
  sessionId: SESSION,
  location: 'debug-story-publish-e2e.mjs',
  message: 'publish attempt complete',
  data: { ...publishResult, latestStoryId: stories?.[0]?.id ?? null },
  hypothesisId: 'H3',
  timestamp: Date.now(),
  runId: 'automated',
});

await browser.close();
console.log(JSON.stringify({ ...publishResult, latestStoryId: stories?.[0]?.id ?? null }, null, 2));
