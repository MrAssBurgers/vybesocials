#!/usr/bin/env node
/**
 * Production secret checklist for vybe-daaab Cloud Functions.
 *
 *   npm run audit:secrets
 *   npm run audit:secrets -- --project=vybe-daaab
 *
 * Lists Secret Manager entries (names only — never prints values).
 * Run setup scripts for any FAIL rows.
 */
import { spawnSync } from 'node:child_process';

const PROJECT = process.env.FIREBASE_PROJECT || 'vybe-daaab';

const EXPECTED = [
  {
    name: 'GEMINI_API_KEY',
    usedBy: 'aiChat, aiCatchUp, VYBE-AI, moderation, themes',
    setup: 'npm run setup:gemini-secrets',
  },
  {
    name: 'GIPHY_API_KEY',
    usedBy: 'giphySearch (DM GIF picker)',
    setup: 'npx firebase functions:secrets:set GIPHY_API_KEY --project ' + PROJECT,
  },
  {
    name: 'LIVEKIT_API_KEY',
    usedBy: 'livekit-token, startDmCall (Stay On Call)',
    setup: 'Set LIVEKIT_API_KEY + LIVEKIT_API_SECRET in Firebase Secret Manager',
  },
  {
    name: 'LIVEKIT_API_SECRET',
    usedBy: 'livekit-token',
    setup: 'Set LIVEKIT_API_SECRET in Firebase Secret Manager',
  },
  {
    name: 'STRIPE_SECRET_KEY',
    usedBy: 'Premium / checkout',
    setup: 'Firebase Console → Secret Manager',
  },
  {
    name: 'SPOTIFY_CLIENT_ID',
    usedBy: 'spotifyNowPlaying',
    setup: 'npm run setup:spotify-secrets',
  },
  {
    name: 'SPOTIFY_CLIENT_SECRET',
    usedBy: 'spotifyNowPlaying',
    setup: 'npm run setup:spotify-secrets',
  },
  {
    name: 'ONESIGNAL_REST_API_KEY',
    usedBy: 'Push notifications',
    setup: 'npm run setup:onesignal-secrets',
  },
  {
    name: 'ONESIGNAL_APP_ID',
    usedBy: 'Push notifications',
    setup: 'npm run setup:onesignal-secrets',
  },
  {
    name: 'RESEND_API_KEY',
    usedBy: 'Password reset email',
    setup: 'Firebase Console → Secret Manager',
  },
];

function runGcloud(args) {
  return spawnSync('gcloud', args, { encoding: 'utf8' });
}

function listSecretsViaGcloud() {
  const r = runGcloud([
    'secrets',
    'list',
    `--project=${PROJECT}`,
    '--format=value(name)',
  ]);
  if (r.status !== 0) return null;
  return new Set(
    (r.stdout || '')
      .split('\n')
      .map((line) => line.trim().split('/').pop())
      .filter(Boolean),
  );
}

function secretExistsViaFirebase(name) {
  const r = spawnSync(
    'npx',
    ['-y', 'firebase-tools@latest', 'functions:secrets:describe', name, '--project', PROJECT],
    { encoding: 'utf8', stdio: 'pipe' },
  );
  return r.status === 0;
}

function main() {
  console.log(`\n=== Secret audit (${PROJECT}) ===\n`);

  const gcloudSet = listSecretsViaGcloud();
  if (gcloudSet) {
    console.log('Source: gcloud secrets list\n');
  } else {
    console.log('Source: firebase functions:secrets:describe (install gcloud for faster listing)\n');
  }

  const rows = [];
  for (const secret of EXPECTED) {
    const present = gcloudSet
      ? gcloudSet.has(secret.name)
      : secretExistsViaFirebase(secret.name);
    rows.push({ ...secret, present });
  }

  const colName = 22;
  console.log(`${'Secret'.padEnd(colName)} Status  Used by`);
  console.log('-'.repeat(72));
  for (const row of rows) {
    const status = row.present ? 'PASS' : 'FAIL';
    console.log(`${row.name.padEnd(colName)} ${status.padEnd(6)}  ${row.usedBy}`);
  }

  const missing = rows.filter((r) => !r.present);
  if (missing.length === 0) {
    console.log('\nAll expected secrets present in Secret Manager.');
  } else {
    console.log('\nMissing secrets — setup commands:');
    for (const row of missing) {
      console.log(`  • ${row.name}: ${row.setup}`);
    }
  }

  console.log(
    '\nRuntime probe (admin): call checkDebugSecrets Cloud Function after deploy for env binding verification.',
  );
  console.log('Redeploy checkDebugSecrets after changing secret bindings:\n  npm run setup:gemini-secrets -- --deploy-only\n');

  process.exit(missing.length > 0 ? 1 : 0);
}

main();
