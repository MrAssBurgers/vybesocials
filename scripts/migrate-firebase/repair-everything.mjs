#!/usr/bin/env node
/**
 * Master repair — reconnect ALL user data in Firestore (run after migration).
 *
 * Steps:
 *   1. repair-all-user-data.mjs   — auth index, profile.user_id, social members
 *   2. repair-content-connections.mjs — posts, DMs, badges, tokens, roles, etc.
 *   3. verify-firestore-connections.mjs — final audit
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=secrets/firebase-admin.json \
 *   node scripts/migrate-firebase/repair-everything.mjs [--dry-run]
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dryRun = process.argv.includes('--dry-run');
const extra = dryRun ? ['--dry-run'] : [];

const steps = [
  'repair-all-user-data.mjs',
  'repair-content-connections.mjs',
  'verify-firestore-connections.mjs',
];

for (const script of steps) {
  console.log(`\n========== ${script} ==========\n`);
  const args = [join(__dirname, script), ...extra.filter(() => script !== 'repair-all-user-data.mjs')];
  if (script === 'repair-all-user-data.mjs' && dryRun) args.push('--dry-run');

  const child = spawnSync(process.execPath, args, { stdio: 'inherit', env: process.env });
  if (child.status !== 0) {
    console.error(`\n❌ ${script} failed (exit ${child.status})`);
    process.exit(child.status ?? 1);
  }
}

console.log('\n✅ Full user-data reconnection complete');
