#!/usr/bin/env node
/**
 * Verifies signed-in user reaches /home (not stuck on onboarding) when DB has onboarding_completed=true.
 * Injects session for barron user via Supabase password auth when DEBUG_TEST_PASSWORD is set.
 */
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const APP_URL = process.env.DEBUG_APP_URL || 'http://127.0.0.1:8080/home';
const INGEST = 'http://127.0.0.1:7261/ingest/50637484-d3e0-47cb-9fea-f484edc6e98d';
const SESSION = 'd7bed4';
const USER_ID = '53e0076d-5163-46f5-b711-a58a03393744';
const EMAIL = process.env.DEBUG_TEST_EMAIL || 'barron.bakic@gmail.com';
const PASSWORD = process.env.DEBUG_TEST_PASSWORD;

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

async function postIngest(payload) {
  await fetch(INGEST, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': SESSION },
    body: JSON.stringify(payload),
  }).catch(() => {});
}

if (!PASSWORD) {
  await postIngest({
    sessionId: SESSION,
    location: 'debug-onboarding-home.mjs',
    message: 'skipped — set DEBUG_TEST_PASSWORD for authed onboarding test',
    data: {},
    hypothesisId: 'H8',
    timestamp: Date.now(),
    runId: 'automated',
  });
  console.log(JSON.stringify({ skipped: true, reason: 'missing DEBUG_TEST_PASSWORD' }));
  process.exit(0);
}

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY);
const { data: authData, error: authError } = await sb.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });

if (authError || !authData.session) {
  console.error(authError?.message || 'auth failed');
  process.exit(1);
}

const projectRef = process.env.VITE_SUPABASE_URL.match(/https:\/\/([^.]+)/)?.[1] ?? 'hprmicwhlaaqfgshucec';
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
await page.waitForTimeout(4000);

const state = await page.evaluate(() => ({
  href: location.href,
  pathname: location.pathname,
}));

await postIngest({
  sessionId: SESSION,
  location: 'debug-onboarding-home.mjs',
  message: 'authed navigation result',
  data: { ...state, userId: USER_ID },
  hypothesisId: 'H8',
  timestamp: Date.now(),
  runId: 'automated',
});

await browser.close();
console.log(JSON.stringify(state, null, 2));
