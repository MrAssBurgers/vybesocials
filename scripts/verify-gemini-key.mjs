#!/usr/bin/env node
/**
 * Verify GEMINI_API_KEY works against Google AI (OpenAI-compatible endpoint).
 *
 *   npm run verify:gemini
 *   npm run verify:gemini -- --from-firebase   # test Secret Manager (vybe-daaab)
 *   GEMINI_API_KEY=xxx npm run verify:gemini
 */
import { spawnSync } from 'node:child_process';
import { loadProjectEnv } from './load-env.mjs';

const PROJECT = process.env.FIREBASE_PROJECT || 'vybe-daaab';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

function loadEnvFile() {
  return loadProjectEnv();
}

function loadFromFirebase() {
  const r = spawnSync(
    'gcloud',
    ['secrets', 'versions', 'access', 'latest', '--secret=GEMINI_API_KEY', '--project', PROJECT],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    console.error('Could not read Firebase secret GEMINI_API_KEY:', r.stderr?.trim() || 'gcloud failed');
    process.exit(1);
  }
  return (r.stdout || '').trim();
}

function maskKey(key) {
  if (!key) return '(empty)';
  return `${key.slice(0, 4)}… (${key.length} chars)`;
}

async function pingGemini(key) {
  let lastErr = '';
  for (const model of MODELS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 600));
      const res = await fetch(GEMINI_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: 12,
          messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
        }),
      });
      if (res.ok) {
        const raw = await res.json();
        const reply = raw?.choices?.[0]?.message?.content?.trim() || '(empty)';
        return { ok: true, model, status: res.status, reply };
      }
      const body = await res.text();
      lastErr = `${model} HTTP ${res.status}: ${body.slice(0, 240)}`;
      if (res.status === 401 || res.status === 403) {
        return { ok: false, model, status: res.status, error: lastErr };
      }
      if (res.status < 500) {
        return { ok: false, model, status: res.status, error: lastErr };
      }
    }
  }
  return { ok: false, error: lastErr || 'All models failed' };
}

const fromFirebase = process.argv.includes('--from-firebase');
const env = loadEnvFile();
const key =
  (fromFirebase ? loadFromFirebase() : null) ||
  process.env.GEMINI_API_KEY ||
  env.GEMINI_API_KEY;

console.log('\n=== GEMINI API key verification ===\n');
console.log('Source:', fromFirebase ? `Firebase Secret Manager (${PROJECT})` : '.env / GEMINI_API_KEY env');

if (!key) {
  console.error(`
GEMINI_API_KEY not found.

This is NOT the same as VITE_FIREBASE_API_KEY in your .env.

Add to .env:
  GEMINI_API_KEY=AIza...your_google_ai_studio_key

Get a key: https://aistudio.google.com/apikey

Then sync to production Cloud Functions:
  npm run setup:gemini-secrets

Or test the deployed secret:
  npm run verify:gemini -- --from-firebase
`);
  process.exit(1);
}

if (!key.startsWith('AIza') && !key.startsWith('AQ.')) {
  console.warn('Warning: key does not start with AIza or AQ. — may not be a valid Google AI key.\n');
}

console.log('Key:', maskKey(key));

const result = await pingGemini(key);
if (result.ok) {
  console.log(`\nPASS — model ${result.model} responded (${result.status})`);
  console.log('Reply:', JSON.stringify(result.reply));
  console.log(`
AI Cloud Functions use this key via Firebase Secret Manager.
If the app still errors, hard refresh and use Clear Chat in VYBE-AI.
`);
  process.exit(0);
}

console.error('\nFAIL —', result.error || 'unknown error');
console.error(`
Fix:
  1. Create a new key at https://aistudio.google.com/apikey
  2. Add GEMINI_API_KEY=... to .env
  3. npm run setup:gemini-secrets
`);
process.exit(1);
