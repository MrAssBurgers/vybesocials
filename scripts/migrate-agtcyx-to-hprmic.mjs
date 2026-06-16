#!/usr/bin/env node
/**
 * Migrate user data from legacy Supabase project (agtcyx) → canonical (hprmic).
 *
 * Requires service_role keys for BOTH projects. Add to .env (do NOT commit):
 *   AGTCYX_URL=https://agtcyxjxgkdyoxwxkjth.supabase.co
 *   AGTCYX_SERVICE_ROLE_KEY=...
 *   HPRMIC_URL=https://hprmicwhlaaqfgshucec.supabase.co
 *   HPRMIC_SERVICE_ROLE_KEY=...
 *
 * Usage:
 *   npm run migrate:agtcyx -- --verify    # connectivity + row counts
 *   npm run migrate:agtcyx -- --dry-run   # preview, no writes
 *   npm run migrate:agtcyx -- --execute   # copies everything (UPSERT) into hprmic
 *
 * Honest limits:
 *   - Auth password hashes do NOT transfer via the Admin API. Users will need
 *     to use "Forgot password" on first login after migration.
 *   - Storage objects (avatars, posts, etc.) are NOT copied — only DB rows.
 *     Add a storage pass later if needed.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const FLAG = process.argv.slice(2);
const MODE = FLAG.includes('--execute') ? 'execute'
           : FLAG.includes('--dry-run') ? 'dry-run'
           : FLAG.includes('--verify')  ? 'verify'
           : null;

if (!MODE) {
  console.error('Usage: node scripts/migrate-agtcyx-to-hprmic.mjs --verify|--dry-run|--execute');
  process.exit(1);
}

const {
  AGTCYX_URL, AGTCYX_SERVICE_ROLE_KEY,
  HPRMIC_URL, HPRMIC_SERVICE_ROLE_KEY,
} = process.env;

for (const [k, v] of Object.entries({
  AGTCYX_URL, AGTCYX_SERVICE_ROLE_KEY, HPRMIC_URL, HPRMIC_SERVICE_ROLE_KEY,
})) {
  if (!v) { console.error(`Missing ${k} in .env`); process.exit(1); }
}

const src = createClient(AGTCYX_URL, AGTCYX_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const dst = createClient(HPRMIC_URL, HPRMIC_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Tables to copy, in dependency order. profiles first (FK target).
// id-keyed → upsert on 'id'. Others use composite or 'id'.
const TABLES = [
  { name: 'profiles',            conflict: 'id' },
  { name: 'user_roles',          conflict: 'id' },
  { name: 'user_settings',       conflict: 'id' },
  { name: 'user_preferences',    conflict: 'id' },
  { name: 'user_about',          conflict: 'id' },
  { name: 'user_themes',         conflict: 'id' },
  { name: 'user_ui_settings',    conflict: 'id' },
  { name: 'user_safety_settings',conflict: 'id' },
  { name: 'notification_preferences', conflict: 'id' },
  { name: 'dm_settings',         conflict: 'id' },
  { name: 'vybe_dna',            conflict: 'id' },
  { name: 'vybe_scores',         conflict: 'id' },
  { name: 'vybe_tokens',         conflict: 'id' },
  { name: 'user_levels',         conflict: 'id' },
  { name: 'login_streaks',       conflict: 'id' },
  { name: 'badges',              conflict: 'id' },
  { name: 'user_badges',         conflict: 'id' },
  { name: 'follows',             conflict: 'id' },
  { name: 'friend_requests',     conflict: 'id' },
  { name: 'blocked_users',       conflict: 'id' },
  { name: 'close_friends',       conflict: 'id' },
  { name: 'posts',               conflict: 'id' },
  { name: 'comments',            conflict: 'id' },
  { name: 'comment_likes',       conflict: 'id' },
  { name: 'likes',               conflict: 'id' },
  { name: 'bookmarks',           conflict: 'id' },
  { name: 'stories',             conflict: 'id' },
  { name: 'story_views',         conflict: 'id' },
  { name: 'story_likes',         conflict: 'id' },
  { name: 'conversations',       conflict: 'id' },
  { name: 'conversation_members',conflict: 'id' },
  { name: 'messages',            conflict: 'id' },
  { name: 'message_reactions',   conflict: 'id' },
  { name: 'notifications',       conflict: 'id' },
];

async function count(client, table) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  if (error) return { error: error.message };
  return { count };
}

async function verify() {
  console.log('Verifying connectivity + counts...\n');
  console.log('TABLE'.padEnd(34), 'AGTCYX'.padStart(10), 'HPRMIC'.padStart(10));
  for (const { name } of TABLES) {
    const [s, d] = await Promise.all([count(src, name), count(dst, name)]);
    const sv = s.error ? `ERR` : String(s.count ?? 0);
    const dv = d.error ? `ERR` : String(d.count ?? 0);
    console.log(name.padEnd(34), sv.padStart(10), dv.padStart(10));
  }
  // Also auth users count via admin
  try {
    const { data: s } = await src.auth.admin.listUsers({ page: 1, perPage: 1 });
    const { data: d } = await dst.auth.admin.listUsers({ page: 1, perPage: 1 });
    console.log('\nauth.users (total):', s?.total ?? '?', '→', d?.total ?? '?');
  } catch (e) {
    console.warn('auth.users count failed:', e.message);
  }
}

async function copyAuthUsers({ dryRun }) {
  console.log('\n=== auth.users ===');
  let page = 1, copied = 0, skipped = 0, failed = 0;
  while (true) {
    const { data, error } = await src.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { console.error('listUsers error:', error.message); break; }
    if (!data?.users?.length) break;

    for (const u of data.users) {
      if (dryRun) { copied++; continue; }
      const { error: cErr } = await dst.auth.admin.createUser({
        // Preserve id so all FKs line up
        // @ts-ignore — supported by admin API
        id: u.id,
        email: u.email ?? undefined,
        phone: u.phone ?? undefined,
        email_confirm: !!u.email_confirmed_at,
        phone_confirm: !!u.phone_confirmed_at,
        user_metadata: u.user_metadata ?? {},
        app_metadata: u.app_metadata ?? {},
      });
      if (cErr) {
        if (/already.*registered|duplicate/i.test(cErr.message)) skipped++;
        else { failed++; console.warn(`  user ${u.id} (${u.email}):`, cErr.message); }
      } else {
        copied++;
      }
    }
    if (data.users.length < 200) break;
    page++;
  }
  console.log(`auth.users — copied=${copied} skipped=${skipped} failed=${failed}`);
  console.log('NOTE: password hashes do not transfer. Users must use "Forgot password".');
}

async function copyTable(table, conflict, { dryRun }) {
  let from = 0;
  const PAGE = 500;
  let total = 0, written = 0, errors = 0;
  while (true) {
    const { data, error } = await src.from(table).select('*').range(from, from + PAGE - 1);
    if (error) { console.error(`  read ${table}:`, error.message); return; }
    if (!data?.length) break;
    total += data.length;

    if (!dryRun) {
      const { error: wErr } = await dst.from(table).upsert(data, { onConflict: conflict });
      if (wErr) { errors++; console.warn(`  write ${table}:`, wErr.message); }
      else written += data.length;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`${table.padEnd(34)} read=${String(total).padStart(6)} ${dryRun ? '(dry-run)' : `written=${written} errors=${errors}`}`);
}

async function run() {
  if (MODE === 'verify') return verify();

  const dryRun = MODE === 'dry-run';
  console.log(`Mode: ${MODE.toUpperCase()}\n`);

  await copyAuthUsers({ dryRun });

  console.log('\n=== public tables ===');
  for (const { name, conflict } of TABLES) {
    await copyTable(name, conflict, { dryRun });
  }

  console.log('\nDone.');
  if (!dryRun) console.log('Next: have users "Forgot password" on first login, then Lovable Publish.');
}

run().catch((e) => { console.error(e); process.exit(1); });
