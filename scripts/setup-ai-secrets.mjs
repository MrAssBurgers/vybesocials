#!/usr/bin/env node
/**
 * Sync Core AI keys from `.env` → Firebase Secret Manager, then redeploy AI functions.
 *
 *   npm run setup:ai-secrets
 *   npm run setup:ai-secrets -- --deploy-only
 *   npm run setup:ai-secrets -- --gemini-only
 *   npm run setup:ai-secrets -- --openai-only
 */
import { spawnSync } from 'node:child_process';
import { loadProjectEnv } from './load-env.mjs';

const PROJECT = process.env.FIREBASE_PROJECT || 'vybe-daaab';

function runFirebase(args, input) {
  const result = spawnSync('npx', ['-y', 'firebase-tools@latest', ...args, '--project', PROJECT], {
    input,
    encoding: 'utf8',
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const argv = process.argv.slice(2);
const deployOnly = argv.includes('--deploy-only');
const geminiOnly = argv.includes('--gemini-only');
const openaiOnly = argv.includes('--openai-only');
const env = loadProjectEnv();

const geminiKey = process.env.GEMINI_API_KEY || env.GEMINI_API_KEY;
const openaiKey = process.env.OPENAI_API_KEY || env.OPENAI_API_KEY;

if (!deployOnly) {
  if (!openaiOnly) {
    if (!geminiKey) {
      console.error('Missing GEMINI_API_KEY — add under # Core AI in .env');
      process.exit(1);
    }
    console.log(`Setting GEMINI_API_KEY on ${PROJECT}…`);
    runFirebase(['functions:secrets:set', 'GEMINI_API_KEY', '--force'], geminiKey);
  }
  if (!geminiOnly) {
    if (!openaiKey) {
      console.warn('OPENAI_API_KEY not in .env — skipping (Vybe Check will use Gemini-only)');
    } else {
      console.log(`Setting OPENAI_API_KEY on ${PROJECT}…`);
      runFirebase(['functions:secrets:set', 'OPENAI_API_KEY', '--force'], openaiKey);
    }
  }
}

console.log('\nBuilding Cloud Functions…');
const build = spawnSync('npm', ['run', 'build'], { cwd: 'functions', stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

console.log('\nRedeploying AI + Vybe Check functions…');
runFirebase(
  ['deploy', '--only', 'functions:aiChat,functions:generateTheme,functions:startVybeCheck,functions:aiCatchUp,functions:aiSmartReplies,functions:aiMessageAssist'],
  undefined,
);

console.log(`
Done. For full AI function redeploy: npm run setup:gemini-secrets -- --deploy-only

Verify keys: npm run verify:ai
`);
