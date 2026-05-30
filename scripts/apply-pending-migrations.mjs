#!/usr/bin/env node
/**
 * Apply pending Supabase migrations that are not yet on production.
 *
 * Option A — Supabase Dashboard (no CLI):
 *   Open supabase/manual/PENDING_20260530.sql in SQL Editor and run it.
 *
 * Option B — CLI with database URL:
 *   DATABASE_URL="postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres" \
 *     npm run db:apply-pending
 *
 * Option C — Supabase CLI linked project:
 *   npx supabase db push
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const migrationsDir = join(root, 'supabase', 'migrations');
const manualDir = join(root, 'supabase', 'manual');

const PENDING = [
  '20260530153000_get_public_user_count.sql',
  '20260530160000_preserve_signup_username.sql',
  '20260530170000_repair_existing_signup_usernames.sql',
];

function readMigration(name) {
  const path = join(migrationsDir, name);
  if (!existsSync(path)) {
    throw new Error(`Missing migration: ${path}`);
  }
  return readFileSync(path, 'utf8').trim();
}

function buildCombinedSql() {
  const parts = PENDING.map((name) => {
    const sql = readMigration(name);
    return `-- >>> ${name}\n${sql}`;
  });
  return `${parts.join('\n\n')}\n`;
}

function writeManualBundle() {
  if (!existsSync(manualDir)) {
    mkdirSync(manualDir, { recursive: true });
  }
  const outPath = join(manualDir, 'PENDING_20260530.sql');
  writeFileSync(outPath, buildCombinedSql(), 'utf8');
  return outPath;
}

async function applyWithPg(combinedSql) {
  let pg;
  try {
    pg = await import('pg');
  } catch {
    console.error('Install pg to apply via DATABASE_URL: npm install --save-dev pg');
    process.exit(1);
  }

  const client = new pg.default.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query(combinedSql);
    console.log('Applied pending migrations successfully.');
  } finally {
    await client.end();
  }
}

function applyWithSupabaseCli() {
  const result = spawnSync('npx', ['supabase', 'db', 'push', '--include-all'], {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

const manualPath = writeManualBundle();
console.log(`Wrote ${manualPath}`);

if (process.env.DATABASE_URL) {
  await applyWithPg(buildCombinedSql());
  process.exit(0);
}

if (process.argv.includes('--cli')) {
  applyWithSupabaseCli();
}

console.log(`
Pending migrations are NOT on production yet.

Quick fix (recommended):
  1. Open Supabase Dashboard → SQL Editor
  2. Paste contents of: ${manualPath}
  3. Run

Or set DATABASE_URL and re-run:
  npm run db:apply-pending
`);
