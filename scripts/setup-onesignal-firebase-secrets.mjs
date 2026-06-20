#!/usr/bin/env node
/**
 * Set OneSignal secrets on Firebase Cloud Functions (vybe-daaab).
 *
 * Usage:
 *   ONESIGNAL_APP_ID=85bcf4b4-16fb-4101-90b3-59ca9574e57b \
 *   ONESIGNAL_REST_API_KEY=your_rest_key \
 *   npm run setup:onesignal-secrets
 */
import { spawnSync } from 'node:child_process';

const PROJECT = 'vybe-daaab';
const appId = process.env.ONESIGNAL_APP_ID?.trim();
const restKey = process.env.ONESIGNAL_REST_API_KEY?.trim();
const dmChannel = process.env.ONESIGNAL_DM_CHANNEL_ID?.trim();

if (!appId || !restKey) {
  console.error('Set ONESIGNAL_APP_ID and ONESIGNAL_REST_API_KEY in the environment.');
  process.exit(1);
}

function setSecret(name, value) {
  console.log(`Setting secret ${name}…`);
  const r = spawnSync(
    'npx',
    ['-y', 'firebase-tools@latest', 'functions:secrets:set', name, '--project', PROJECT, '--force'],
    { input: value, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] },
  );
  if (r.status !== 0) process.exit(r.status ?? 1);
}

setSecret('ONESIGNAL_APP_ID', appId);
setSecret('ONESIGNAL_REST_API_KEY', restKey);
if (dmChannel) setSecret('ONESIGNAL_DM_CHANNEL_ID', dmChannel);

console.log('\nDone. Redeploy push functions:');
console.log('  firebase deploy --only functions:onDmMessageCreated,functions:sendPushNotification --project vybe-daaab');
