#!/usr/bin/env node
/**
 * Verify Core AI keys from `.env` (GEMINI + optional OPENAI).
 *   npm run verify:ai
 */
import { spawnSync } from 'node:child_process';
import { loadProjectEnv } from './load-env.mjs';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
const env = loadProjectEnv();
const gemini = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
const openai = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;

let ok = true;

console.log('\n=== Core AI keys (.env) ===\n');

if (!gemini) {
  console.log('GEMINI_API_KEY: MISSING — add under # Core AI in .env');
  ok = false;
} else {
  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${gemini}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemini-2.5-flash',
      max_tokens: 8,
      messages: [{ role: 'user', content: 'say ok' }],
    }),
  });
  console.log(
    'GEMINI_API_KEY:',
    res.ok ? 'PASS' : `FAIL (${res.status})`,
    `— ${gemini.slice(0, 4)}… (${gemini.length} chars)`,
  );
  if (!res.ok) ok = false;
}

if (!openai) {
  console.log('OPENAI_API_KEY: not set (optional — Vybe Check moderation/STT)');
} else {
  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { Authorization: `Bearer ${openai}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: 'hello' }),
  });
  console.log(
    'OPENAI_API_KEY:',
    res.ok ? 'PASS' : `FAIL (${res.status})`,
    `— ${openai.slice(0, 7)}… (${openai.length} chars)`,
  );
  if (!res.ok) {
    console.log('  (Vybe Check still works via Gemini + Vision without OpenAI)');
    ok = false;
  }
}

if (ok) {
  console.log('\nSync to production: npm run setup:ai-secrets\n');
  process.exit(0);
}
console.log('\nFix keys in .env, then: npm run setup:ai-secrets\n');
process.exit(1);
