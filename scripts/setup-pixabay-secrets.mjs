#!/usr/bin/env node
/**
 * Upload PIXABAY_API_KEY to Firebase Secret Manager and redeploy fetchPixabaySounds.
 *
 *   PIXABAY_API_KEY=your_key npm run setup:pixabay-secrets
 *   npm run setup:pixabay-secrets -- --key=your_key
 *   npm run setup:pixabay-secrets -- --deploy-only
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const PROJECT = process.env.FIREBASE_PROJECT || 'vybe-daaab';
const PIXABAY_FUNCTIONS = ['fetchPixabaySounds'];

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
const pixabayKey =
  fromArgs ||
  process.env.PIXABAY_API_KEY ||
  fromFile.PIXABAY_API_KEY;

if (!deployOnly) {
  if (!pixabayKey) {
    console.error(`
Missing PIXABAY_API_KEY. Use any ONE of these:

  PIXABAY_API_KEY=xxx npm run setup:pixabay-secrets
  npm run setup:pixabay-secrets -- --key=xxx
  Add PIXABAY_API_KEY to .env, then run npm run setup:pixabay-secrets
  npm run setup:pixabay-secrets -- --deploy-only

Get a key: https://pixabay.com/api/docs/
`);
    process.exit(1);
  }

  console.log(`Setting PIXABAY_API_KEY on Firebase project ${PROJECT}…`);
  runFirebase(['functions:secrets:set', 'PIXABAY_API_KEY', '--force'], pixabayKey);
}

console.log('\nBuilding Cloud Functions…');
const build = spawnSync('npm', ['run', 'build'], { cwd: 'functions', stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

const onlyArg = PIXABAY_FUNCTIONS.map((n) => `functions:${n}`).join(',');
console.log(`\nDeploying ${onlyArg}…`);
runFirebase(['deploy', '--only', onlyArg], undefined);

console.log('\nDone. Pixabay sound search should work after hard refresh.');
