#!/usr/bin/env node
/**
 * Upload GEMINI_API_KEY to Firebase Secret Manager and redeploy AI Cloud Functions.
 *
 *   GEMINI_API_KEY=your_key npm run setup:gemini-secrets
 *
 *   npm run setup:gemini-secrets -- --key=your_key
 *
 * Or add GEMINI_API_KEY to `.env`, then run npm run setup:gemini-secrets
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const PROJECT = process.env.FIREBASE_PROJECT || 'vybe-daaab';

function loadEnvFile() {
  const env = {};
  if (!existsSync('.env')) return env;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function parseArgs(argv) {
  for (const arg of argv) {
    const m = arg.match(/^--key=(.+)$/);
    if (m) return m[1];
  }
  return null;
}

function runFirebase(args, input) {
  const result = spawnSync('npx', ['-y', 'firebase-tools@latest', ...args, '--project', PROJECT], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const fromArgs = parseArgs(process.argv.slice(2));
const fromFile = loadEnvFile();
const geminiKey =
  fromArgs ||
  process.env.GEMINI_API_KEY ||
  fromFile.GEMINI_API_KEY;

if (!geminiKey) {
  console.error(`
Missing GEMINI_API_KEY. Use any ONE of these:

  GEMINI_API_KEY=xxx npm run setup:gemini-secrets

  npm run setup:gemini-secrets -- --key=xxx

  Add GEMINI_API_KEY to .env, then run npm run setup:gemini-secrets

Get a key: https://aistudio.google.com/apikey
`);
  process.exit(1);
}

console.log(`Setting GEMINI_API_KEY on Firebase project ${PROJECT}…`);
runFirebase(['functions:secrets:set', 'GEMINI_API_KEY', '--force'], geminiKey);

console.log('\nBuilding Cloud Functions…');
const build = spawnSync('npm', ['run', 'build'], { cwd: 'functions', stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

console.log('\nDeploying AI functions (aiChat + helpers)…');
runFirebase(
  [
    'deploy',
    '--only',
    'functions:aiChat,functions:aiCatchUp,functions:aiSmartReplies,functions:aiMessageAssist,functions:checkDebugSecrets',
  ],
  undefined,
);

console.log(`
Done. VYBE-AI should respond after a hard refresh.

If calls still fail (group / Stay On Call), set LIVEKIT secrets separately.
`);
