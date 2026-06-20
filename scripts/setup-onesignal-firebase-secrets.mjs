#!/usr/bin/env node
/**
 * Set OneSignal secrets on Firebase Cloud Functions (vybe-daaab).
 *
 * Option A — inline env (both required unless app id omitted — uses VYBE default):
 *   ONESIGNAL_REST_API_KEY=your_rest_key npm run setup:onesignal-secrets
 *
 * Option B — explicit app id:
 *   ONESIGNAL_APP_ID=85bcf4b4-16fb-4101-90b3-59ca9574e57b \
 *   ONESIGNAL_REST_API_KEY=your_rest_key \
 *   npm run setup:onesignal-secrets
 *
 * Option C — add ONESIGNAL_REST_API_KEY (and optional ONESIGNAL_APP_ID) to `.env`
 */
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const PROJECT = process.env.FIREBASE_PROJECT || 'vybe-daaab';
/** Despia / VYBE native app — see docs/AUTH_SMS_PUSH_SETUP.md */
const DEFAULT_APP_ID = '85bcf4b4-16fb-4101-90b3-59ca9574e57b';

function loadEnvFile() {
  const env = {};
  if (!existsSync('.env')) return env;
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return env;
}

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const app = arg.match(/^--app-id=(.+)$/);
    const key = arg.match(/^--rest-key=(.+)$/);
    const dm = arg.match(/^--dm-channel=(.+)$/);
    if (app) out.ONESIGNAL_APP_ID = app[1];
    if (key) out.ONESIGNAL_REST_API_KEY = key[1];
    if (dm) out.ONESIGNAL_DM_CHANNEL_ID = dm[1];
  }
  return out;
}

function runFirebase(args, input) {
  const r = spawnSync(
    'npx',
    ['-y', 'firebase-tools@latest', ...args, '--project', PROJECT, '--force'],
    { input, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const fromArgs = parseArgs(process.argv.slice(2));
const fromFile = loadEnvFile();

const appId =
  fromArgs.ONESIGNAL_APP_ID ||
  process.env.ONESIGNAL_APP_ID?.trim() ||
  fromFile.ONESIGNAL_APP_ID?.trim() ||
  DEFAULT_APP_ID;

const restKey =
  fromArgs.ONESIGNAL_REST_API_KEY ||
  process.env.ONESIGNAL_REST_API_KEY?.trim() ||
  fromFile.ONESIGNAL_REST_API_KEY?.trim();

const dmChannel =
  fromArgs.ONESIGNAL_DM_CHANNEL_ID ||
  process.env.ONESIGNAL_DM_CHANNEL_ID?.trim() ||
  fromFile.ONESIGNAL_DM_CHANNEL_ID?.trim();

if (!restKey) {
  console.error(`
Missing ONESIGNAL_REST_API_KEY. Use any ONE of these:

  ONESIGNAL_REST_API_KEY=your_key npm run setup:onesignal-secrets

  npm run setup:onesignal-secrets -- --rest-key=your_key

  Add ONESIGNAL_REST_API_KEY to .env, then run npm run setup:onesignal-secrets

App ID defaults to ${DEFAULT_APP_ID} (override with ONESIGNAL_APP_ID=…).
Get REST key: OneSignal Dashboard → Settings → Keys & IDs
`);
  process.exit(1);
}

console.log(`Setting OneSignal secrets on Firebase project ${PROJECT}…`);
console.log(`  ONESIGNAL_APP_ID=${appId}`);

runFirebase(['functions:secrets:set', 'ONESIGNAL_APP_ID'], appId);
runFirebase(['functions:secrets:set', 'ONESIGNAL_REST_API_KEY'], restKey);
if (dmChannel) {
  runFirebase(['functions:secrets:set', 'ONESIGNAL_DM_CHANNEL_ID'], dmChannel);
}

console.log('\nBuilding Cloud Functions…');
const build = spawnSync('npm', ['run', 'build'], { cwd: 'functions', stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

console.log('\nDeploying push functions…');
runFirebase([
  'deploy',
  '--only',
  'functions:onDmMessageCreated,functions:sendPushNotification',
]);

console.log(`
Done. Native DM push should work after the next message is sent.

If you shared your REST key in chat/terminal, rotate it in OneSignal Dashboard.
`);
