#!/usr/bin/env node
/**
 * Upload GEMINI_API_KEY to Firebase Secret Manager and redeploy AI Cloud Functions.
 *
 *   GEMINI_API_KEY=your_key npm run setup:gemini-secrets
 *
 *   npm run setup:gemini-secrets -- --key=your_key
 *   npm run setup:gemini-secrets -- --deploy-only   # skip secret set, redeploy all AI fns
 *
 * Or add GEMINI_API_KEY to `.env`, then run npm run setup:gemini-secrets
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const PROJECT = process.env.FIREBASE_PROJECT || 'vybe-daaab';

/** All Cloud Functions bound to GEMINI_API_KEY (callable + scheduled). */
const GEMINI_FUNCTIONS = [
  'aiChat',
  'aiCatchUp',
  'aiSmartReplies',
  'aiCommentSuggestions',
  'aiMessageAssist',
  'aiHumanize',
  'aiChatSummary',
  'aiProfileWriter',
  'aiSafetyScan',
  'scanContentSafety',
  'scanVideoSafety',
  'moderateContent',
  'generateTheme',
  'generateAdvancedTheme',
  'generateBackground',
  'generateCaption',
  'detectAiContent',
  'dnaChat',
  'aiDetectText',
  'aiAdaptiveResponse',
  'aiAutoFix',
  'aiEnhancePhoto',
  'generateChallenges',
  'generateCustomAnimations',
  'generatePwaIcon',
  'generateArFilter',
  'generateAiVideo',
  'adminAiBuilder',
  'analyzeBugReport',
  'analyzeError',
  'dnaAutopilot',
  'vybeAgent',
  'vybeCommander',
  'startVybeCheck',
  'researchMapLocation',
  'briefTopicDetail',
  'prewarmDailyBriefs',
  'checkDebugSecrets',
];

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
  let key = null;
  let deployOnly = false;
  for (const arg of argv) {
    const km = arg.match(/^--key=(.+)$/);
    if (km) key = km[1];
    if (arg === '--deploy-only') deployOnly = true;
  }
  return { key, deployOnly };
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

const { key: fromArgs, deployOnly } = parseArgs(process.argv.slice(2));
const fromFile = loadEnvFile();
const geminiKey =
  fromArgs ||
  process.env.GEMINI_API_KEY ||
  fromFile.GEMINI_API_KEY;

if (!deployOnly) {
  if (!geminiKey) {
    console.error(`
Missing GEMINI_API_KEY. Use any ONE of these:

  GEMINI_API_KEY=xxx npm run setup:gemini-secrets

  npm run setup:gemini-secrets -- --key=xxx

  Add GEMINI_API_KEY to .env, then run npm run setup:gemini-secrets

  npm run setup:gemini-secrets -- --deploy-only   (secret already set)

Get a key: https://aistudio.google.com/apikey
`);
    process.exit(1);
  }

  if (!geminiKey.startsWith('AIza') && !geminiKey.startsWith('AQ.')) {
    console.error(`
GEMINI_API_KEY must be a Google AI Studio API key (starts with "AIza") or access token ("AQ.").
Get a key at https://aistudio.google.com/apikey
`);
    process.exit(1);
  }

  console.log(`Setting GEMINI_API_KEY on Firebase project ${PROJECT}…`);
  runFirebase(['functions:secrets:set', 'GEMINI_API_KEY', '--force'], geminiKey);
}

console.log('\nBuilding Cloud Functions…');
const build = spawnSync('npm', ['run', 'build'], { cwd: 'functions', stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const onlyArg = GEMINI_FUNCTIONS.map((n) => `functions:${n}`).join(',');
console.log(`\nDeploying ${GEMINI_FUNCTIONS.length} GEMINI-bound functions…`);
runFirebase(['deploy', '--only', onlyArg], undefined);

console.log(`
Done. VYBE-AI + smart replies + briefs should use the latest GEMINI secret.

Hard refresh the app; Clear Chat in VYBE-AI to drop stale error bubbles.
`);
