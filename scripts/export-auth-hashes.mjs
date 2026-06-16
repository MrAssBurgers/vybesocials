#!/usr/bin/env node
/**
 * Phase 2b — Export bcrypt password hashes from Supabase auth.users.
 *
 * The Admin SDK (listUsers) does NOT return encrypted_password. To migrate
 * passwords without forcing a reset, we read auth.users directly via psql
 * and produce a Firebase-Auth-compatible JSON for `firebase auth:import`.
 *
 * Prereqs:
 *   - psql installed locally
 *   - Postgres connection string for the hprmic project:
 *       Supabase Dashboard → Project Settings → Database → Connection string (URI, "Use connection pooling" OFF, role: postgres)
 *
 * Run:
 *   SUPABASE_DB_URL='postgres://postgres:<PASSWORD>@db.hprmicwhlaaqfgshucec.supabase.co:5432/postgres' \
 *   node scripts/export-auth-hashes.mjs
 *
 * Output:
 *   ./export/firebase-users.json   — pass to `firebase auth:import` with --hash-algo=BCRYPT
 *
 * Then import to Firebase:
 *   firebase auth:import ./export/firebase-users.json \
 *     --hash-algo=BCRYPT \
 *     --project=<your-firebase-project-id>
 */

import { execSync } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';

const DB = process.env.SUPABASE_DB_URL;
if (!DB) {
  console.error('❌ SUPABASE_DB_URL missing.');
  console.error('   Get it from Supabase Dashboard → project hprmicwhlaaqfgshucec → Project Settings → Database → Connection string.');
  process.exit(1);
}

await mkdir('./export', { recursive: true });

console.log('📤 Dumping auth.users from hprmic...');

const sql = `
COPY (
  SELECT json_build_object(
    'localId', id::text,
    'email', email,
    'emailVerified', email_confirmed_at IS NOT NULL,
    'passwordHash', encode(convert_to(encrypted_password, 'UTF8'), 'base64'),
    'createdAt', (EXTRACT(EPOCH FROM created_at) * 1000)::bigint,
    'lastSignedInAt', (EXTRACT(EPOCH FROM COALESCE(last_sign_in_at, created_at)) * 1000)::bigint,
    'phoneNumber', phone,
    'displayName', raw_user_meta_data->>'full_name',
    'photoUrl', raw_user_meta_data->>'avatar_url',
    'disabled', (banned_until IS NOT NULL AND banned_until > now())
  )
  FROM auth.users
  WHERE encrypted_password IS NOT NULL AND encrypted_password <> ''
) TO STDOUT;
`;

const raw = execSync(`psql "${DB}" -A -t -c "${sql.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
  maxBuffer: 256 * 1024 * 1024,
}).toString();

const users = raw
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => JSON.parse(line));

const payload = { users };
await writeFile('./export/firebase-users.json', JSON.stringify(payload, null, 2));
console.log(`✅ Wrote ${users.length} users → ./export/firebase-users.json`);
console.log('');
console.log('Next step:');
console.log('  firebase auth:import ./export/firebase-users.json \\');
console.log('    --hash-algo=BCRYPT \\');
console.log('    --project=<your-firebase-project-id>');
console.log('');
console.log('⚠️  Users who only signed up via Google/Apple OAuth will not be in this file');
console.log('   (no encrypted_password). They keep working — on first sign-in Firebase Auth');
console.log('   creates their account from the OAuth provider.');
