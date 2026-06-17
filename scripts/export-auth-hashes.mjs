#!/usr/bin/env node
/**
 * Phase 2b — Export bcrypt password hashes from Supabase auth.users.
 *
 * Run:
 *   SUPABASE_DB_URL='postgres://postgres:<PASSWORD>@db.hprmicwhlaaqfgshucec.supabase.co:5432/postgres' \
 *   npm run migrate:firebase:auth-hashes
 *
 * Output: ./export/firebase-users.json → firebase auth:import --hash-algo=BCRYPT --project=vybe-daaab
 */

import { execSync } from 'node:child_process';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const DB =
  process.env.SUPABASE_DB_URL ||
  process.env.AGTCYX_DB_URL ||
  process.env.HPRMIC_DB_URL;
if (!DB) {
  console.error('❌ SUPABASE_DB_URL missing (or AGTCYX_DB_URL for live auth export).');
  console.error('   Supabase Dashboard → Project Settings → Database → Connection string (pooling OFF).');
  console.error('   agtcyx live users: db.agtcyxjxgkdyoxwxkjth.supabase.co (needs Lovable support password).');
  process.exit(1);
}

await mkdir('./export', { recursive: true });

const sqlPath = join(tmpdir(), `vybe-auth-export-${Date.now()}.sql`);
const sql = `
SELECT json_build_object(
  'localId', id::text,
  'email', email,
  'emailVerified', email_confirmed_at IS NOT NULL,
  'passwordHash', encode(convert_to(encrypted_password, 'UTF8'), 'base64'),
  'createdAt', (EXTRACT(EPOCH FROM created_at) * 1000)::bigint,
  'lastSignedInAt', (EXTRACT(EPOCH FROM COALESCE(last_sign_in_at, created_at)) * 1000)::bigint,
  'phoneNumber', phone,
  'displayName', COALESCE(raw_user_meta_data->>'username', raw_user_meta_data->>'full_name', raw_user_meta_data->>'name'),
  'photoUrl', raw_user_meta_data->>'avatar_url',
  'disabled', (banned_until IS NOT NULL AND banned_until > now())
)
FROM auth.users
WHERE encrypted_password IS NOT NULL AND encrypted_password <> '';
`;

await writeFile(sqlPath, sql, 'utf8');

console.log('📤 Dumping auth.users password hashes from hprmic...');

let raw;
try {
  raw = execSync(`psql "${DB}" -v ON_ERROR_STOP=1 -t -A -P pager=off -f "${sqlPath}"`, {
    maxBuffer: 256 * 1024 * 1024,
    encoding: 'utf8',
  });
} catch (err) {
  console.error('❌ psql failed. Is psql installed? Is SUPABASE_DB_URL correct?');
  console.error(err.stderr?.toString() || err.message);
  process.exit(1);
} finally {
  await unlink(sqlPath).catch(() => {});
}

const users = raw
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean)
  .map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      console.warn('⚠️  Skipped bad line:', line.slice(0, 80));
      return null;
    }
  })
  .filter(Boolean)
  .map((user) => {
    if (typeof user.passwordHash === 'string') {
      user.passwordHash = user.passwordHash.replace(/\s/g, '');
    }
    return user;
  });

const payload = { users };
await writeFile('./export/firebase-users.json', JSON.stringify(payload, null, 2));
console.log(`✅ Wrote ${users.length} users → ./export/firebase-users.json`);
console.log('');
console.log('Next:');
console.log('  firebase auth:import ./export/firebase-users.json --hash-algo=BCRYPT --project=vybe-daaab');
console.log('');
console.log('⚠️  OAuth-only users (no password) are omitted — they sign in via Google/Apple after publish.');
