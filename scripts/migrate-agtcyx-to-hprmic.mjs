#!/usr/bin/env node
/**
 * Full migration: agtcyxjxgkdyoxwxkjth (Lovable live) → hprmicwhlaaqfgshucec (owned).
 *
 * Requires service_role keys for BOTH projects in .env (never commit):
 *   AGTCYX_URL=https://agtcyxjxgkdyoxwxkjth.supabase.co
 *   AGTCYX_SERVICE_ROLE_KEY=...
 *   HPRMIC_URL=https://hprmicwhlaaqfgshucec.supabase.co
 *   HPRMIC_SERVICE_ROLE_KEY=...
 *
 * Usage:
 *   npm run migrate:agtcyx -- --verify
 *   npm run migrate:agtcyx -- --dry-run
 *   npm run migrate:agtcyx -- --execute
 *   npm run migrate:agtcyx -- --tables-only --execute
 *   npm run migrate:agtcyx -- --storage-only --execute
 *   npm run migrate:agtcyx -- --skip-auth --execute
 *
 * Password hashes do NOT transfer via Admin API — use Forgot password or SQL import.
 * OAuth identities need SQL import (see MIGRATE_agtcyx_to_hprmic.md).
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const argv = process.argv.slice(2);
const MODE = argv.includes('--execute') ? 'execute'
  : argv.includes('--dry-run') ? 'dry-run'
  : argv.includes('--verify') ? 'verify'
  : null;

const FLAGS = {
  storageOnly: argv.includes('--storage-only'),
  tablesOnly: argv.includes('--tables-only'),
  skipAuth: argv.includes('--skip-auth'),
};

if (!MODE) {
  console.error(`Usage: node scripts/migrate-agtcyx-to-hprmic.mjs --verify|--dry-run|--execute [options]
Options:
  --storage-only   Copy storage buckets/objects only
  --tables-only    Copy public tables only (no auth, no storage)
  --skip-auth      Skip auth.users (use after SQL auth import)`);
  process.exit(1);
}

if (FLAGS.storageOnly && FLAGS.tablesOnly) {
  console.error('Use only one of --storage-only or --tables-only');
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

/** Seed / ops tables — never overwrite on hprmic. */
const SKIP_TABLES = new Set([
  'badges', 'challenges', 'challenge_templates', 'battle_pass_tiers',
  'growth_config', 'stripe_config', 'app_secrets', 'hub_content',
  'checkin_prompts', 'community_guidelines', 'announcements', 'sounds',
  'music_providers', 'rate_limits', 'password_reset_tokens', 'oauth_nonces',
  'email_send_log', 'email_send_state', 'suppressed_emails', 'email_unsubscribe_tokens',
  'client_debug_logs', '_demo_seed_log', '_view_backups', 'view_backups_safe',
]);

/**
 * User-data tables in FK-safe order (profiles → social → content → DMs → misc).
 * Covers all public tables with user-owned rows from supabase/migrations.
 */
const USER_DATA_TABLES = [
  { name: 'profiles', conflict: 'id' },

  { name: 'user_roles', conflict: 'id' },
  { name: 'user_roles_auth', conflict: 'id' },
  { name: 'user_settings', conflict: 'id' },
  { name: 'user_preferences', conflict: 'id' },
  { name: 'user_about', conflict: 'id' },
  { name: 'user_themes', conflict: 'id' },
  { name: 'user_ui_settings', conflict: 'id' },
  { name: 'user_safety_settings', conflict: 'id' },
  { name: 'notification_preferences', conflict: 'id' },
  { name: 'dm_settings', conflict: 'id' },
  { name: 'user_levels', conflict: 'id' },
  { name: 'login_streaks', conflict: 'id' },
  { name: 'challenge_progress', conflict: 'id' },
  { name: 'challenge_rewards', conflict: 'id' },
  { name: 'user_badges', conflict: 'id' },
  { name: 'vybe_dna', conflict: 'id' },
  { name: 'vybe_scores', conflict: 'id' },
  { name: 'vybe_score_events', conflict: 'id' },
  { name: 'vybe_tokens', conflict: 'id' },
  { name: 'token_transactions', conflict: 'id' },
  { name: 'user_backgrounds', conflict: 'id' },
  { name: 'user_custom_sounds', conflict: 'id' },
  { name: 'user_stickers', conflict: 'id' },
  { name: 'user_notes', conflict: 'id' },
  { name: 'user_presence', conflict: 'id' },
  { name: 'user_statuses', conflict: 'id' },
  { name: 'user_locations', conflict: 'id' },
  { name: 'user_interactions', conflict: 'id' },
  { name: 'user_checkins', conflict: 'id' },
  { name: 'ai_brief_preferences', conflict: 'id' },
  { name: 'daily_brief_cache', conflict: 'id' },
  { name: 'push_tokens', conflict: 'id' },
  { name: 'phone_verifications', conflict: 'id' },
  { name: 'user_2fa_settings', conflict: 'id' },
  { name: 'auth_challenges', conflict: 'id' },
  { name: 'user_passkeys', conflict: 'id' },
  { name: 'user_sessions', conflict: 'id' },
  { name: 'login_history', conflict: 'id' },
  { name: 'webauthn_credentials', conflict: 'id' },
  { name: 'e2e_device_keys', conflict: 'id' },
  { name: 'dna_agent_settings', conflict: 'id' },
  { name: 'dna_auto_theme', conflict: 'id' },
  { name: 'dna_agent_actions', conflict: 'id' },
  { name: 'dna_content_preferences', conflict: 'id' },
  { name: 'user_active_boosts', conflict: 'id' },
  { name: 'parental_controls', conflict: 'id' },
  { name: 'screen_time_sessions', conflict: 'id' },
  { name: 'spotify_connections', conflict: 'id' },
  { name: 'live_music_presence', conflict: 'id' },
  { name: 'music_settings', conflict: 'id' },
  { name: 'external_account_handles', conflict: 'id' },
  { name: 'contact_hashes', conflict: 'id' },
  { name: 'encryption_keys', conflict: 'id' },
  { name: 'user_ai_keys', conflict: 'id' },
  { name: 'user_saved_sounds', conflict: 'id' },
  { name: 'filter_usage', conflict: 'id' },
  { name: 'filter_saves', conflict: 'id' },
  { name: 'parallel_feeds', conflict: 'id' },
  { name: 'mood_states', conflict: 'id' },
  { name: 'live_widgets', conflict: 'id' },
  { name: 'marketplace_purchases', conflict: 'id' },
  { name: 'gifted_premium', conflict: 'id' },
  { name: 'account_deletion_requests', conflict: 'id' },
  { name: 'conversation_notification_prefs', conflict: 'id' },
  { name: 'conversation_shortcuts', conflict: 'id' },
  { name: 'legal_acceptances', conflict: 'id' },
  { name: 'algorithm_settings', conflict: 'id' },

  { name: 'follows', conflict: 'id' },
  { name: 'friend_requests', conflict: 'id' },
  { name: 'blocked_users', conflict: 'id' },
  { name: 'close_friends', conflict: 'id' },
  { name: 'dismissed_profiles', conflict: 'id' },
  { name: 'friend_drops', conflict: 'id' },
  { name: 'snap_recipients', conflict: 'id' },
  { name: 'referrals', conflict: 'id' },
  { name: 'invites', conflict: 'id' },
  { name: 'invite_redemptions', conflict: 'id' },

  { name: 'posts', conflict: 'id' },
  { name: 'comments', conflict: 'id' },
  { name: 'comment_likes', conflict: 'id' },
  { name: 'likes', conflict: 'id' },
  { name: 'bookmarks', conflict: 'id' },
  { name: 'post_mood_signals', conflict: 'id' },
  { name: 'post_collaborators', conflict: 'id' },
  { name: 'collab_post_invites', conflict: 'id' },
  { name: 'post_deletion_log', conflict: 'id' },
  { name: 'stories', conflict: 'id' },
  { name: 'story_views', conflict: 'id' },
  { name: 'story_likes', conflict: 'id' },
  { name: 'story_poll_votes', conflict: 'id' },
  { name: 'video_stats', conflict: 'id' },

  { name: 'conversations', conflict: 'id' },
  { name: 'conversation_members', conflict: 'id' },
  { name: 'conversation_admins', conflict: 'id' },
  { name: 'messages', conflict: 'id' },
  { name: 'message_views', conflict: 'id' },
  { name: 'message_reactions', conflict: 'id' },
  { name: 'message_deletions', conflict: 'id' },
  { name: 'message_pins', conflict: 'id' },
  { name: 'scheduled_messages', conflict: 'id' },
  { name: 'vanish_threads', conflict: 'id' },
  { name: 'vanish_messages', conflict: 'id' },
  { name: 'word_reactions', conflict: 'id' },
  { name: 'message_requests', conflict: 'id' },
  { name: 'hidden_conversations', conflict: 'id' },
  { name: 'trashed_conversations', conflict: 'id' },
  { name: 'conversation_safety_overrides', conflict: 'id' },
  { name: 'conversation_safety_responses', conflict: 'id' },
  { name: 'streaks', conflict: 'id' },
  { name: 'typing_indicators', conflict: 'id' },
  { name: 'screenshot_notifications', conflict: 'id' },
  { name: 'chat_presence', conflict: 'id' },
  { name: 'calls', conflict: 'id' },
  { name: 'call_signals', conflict: 'id' },
  { name: 'group_members', conflict: 'id' },
  { name: 'group_call_participants', conflict: 'id' },

  { name: 'notifications', conflict: 'id' },
  { name: 'reports', conflict: 'id' },
  { name: 'content_flags', conflict: 'id' },
  { name: 'content_appeals', conflict: 'id' },
  { name: 'user_warnings', conflict: 'id' },
  { name: 'user_bans', conflict: 'id' },
  { name: 'bug_reports', conflict: 'id' },
  { name: 'moderation_feedback', conflict: 'id' },
  { name: 'profile_audit', conflict: 'id' },

  { name: 'shared_themes', conflict: 'id' },
  { name: 'saved_themes', conflict: 'id' },
  { name: 'theme_likes', conflict: 'id' },
  { name: 'theme_codes', conflict: 'id' },
  { name: 'community_filters', conflict: 'id' },
  { name: 'community_filter_likes', conflict: 'id' },
  { name: 'filters', conflict: 'id' },

  { name: 'events', conflict: 'id' },
  { name: 'event_rsvps', conflict: 'id' },
  { name: 'event_comments', conflict: 'id' },
  { name: 'event_reminders', conflict: 'id' },
  { name: 'dismissed_announcements', conflict: 'id' },

  { name: 'listings', conflict: 'id' },
  { name: 'listing_favorites', conflict: 'id' },
  { name: 'seller_ratings', conflict: 'id' },
  { name: 'orders', conflict: 'id' },
  { name: 'order_events', conflict: 'id' },
  { name: 'payment_methods', conflict: 'id' },

  { name: 'servers', conflict: 'id' },
  { name: 'server_members', conflict: 'id' },
  { name: 'channels', conflict: 'id' },
  { name: 'channel_messages', conflict: 'id' },
  { name: 'channel_permissions', conflict: 'id' },
  { name: 'server_notifications', conflict: 'id' },

  { name: 'spaces', conflict: 'id' },
  { name: 'space_participants', conflict: 'id' },

  { name: 'business_profiles', conflict: 'id' },
  { name: 'business_products', conflict: 'id' },
  { name: 'business_orders', conflict: 'id' },
  { name: 'business_reviews', conflict: 'id' },
  { name: 'business_offers', conflict: 'id' },
  { name: 'business_subscription_tiers', conflict: 'id' },
  { name: 'business_subscriptions', conflict: 'id' },

  { name: 'creator_profiles', conflict: 'id' },
  { name: 'creator_earnings', conflict: 'id' },
  { name: 'creator_payouts', conflict: 'id' },
  { name: 'creator_daily_stats', conflict: 'id' },

  { name: 'ad_campaigns', conflict: 'id' },
  { name: 'ad_impressions', conflict: 'id' },
  { name: 'ad_credits', conflict: 'id' },
  { name: 'ad_daily_stats', conflict: 'id' },
  { name: 'tips', conflict: 'id' },
  { name: 'sponsor_profiles', conflict: 'id' },
  { name: 'collab_posts', conflict: 'id' },
  { name: 'sponsor_analytics', conflict: 'id' },

  { name: 'roulette_queue', conflict: 'id' },
  { name: 'roulette_matches', conflict: 'id' },
  { name: 'reaction_streaks', conflict: 'id' },

  { name: 'feedback', conflict: 'id' },
  { name: 'feedback_likes', conflict: 'id' },
  { name: 'analytics_events', conflict: 'id' },
  { name: 'capture_events', conflict: 'id' },
  { name: 'live_activity', conflict: 'id' },
  { name: 'moderator_applications', conflict: 'id' },
  { name: 'app_screenshots', conflict: 'id' },
  { name: 'meme_ban_backgrounds', conflict: 'id' },
  { name: 'sound_analytics', conflict: 'id' },
  { name: 'sound_play_events', conflict: 'id' },
  { name: 'feature_requests', conflict: 'id' },
  { name: 'feature_votes', conflict: 'id' },
  { name: 'error_logs', conflict: 'id' },
];

const STORAGE_BUCKETS_FALLBACK = [
  'avatars', 'media', 'stories', 'chat-media', 'custom-sounds',
  'announcements', 'sounds', 'marketing-screenshots', 'app-screenshots',
];

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

async function countRows(client, table) {
  const { count, error } = await client.from(table).select('*', { count: 'exact', head: true });
  if (error) {
    if (/relation.*does not exist|schema cache/i.test(error.message)) return { skip: true };
    return { error: error.message };
  }
  return { count: count ?? 0 };
}

async function countAuthUsers(client) {
  try {
    const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (error) return { error: error.message };
    return { count: data?.total ?? '?' };
  } catch (e) {
    return { error: e.message };
  }
}

async function printCountTable(label = 'Row counts') {
  console.log(`\n=== ${label} ===`);
  console.log('TABLE'.padEnd(38), 'AGTCYX'.padStart(8), 'HPRMIC'.padStart(8), 'DELTA'.padStart(8));
  console.log('-'.repeat(64));

  let srcTotal = 0;
  let dstTotal = 0;

  for (const { name } of USER_DATA_TABLES) {
    if (SKIP_TABLES.has(name)) continue;
    const [s, d] = await Promise.all([countRows(src, name), countRows(dst, name)]);
    const sv = s.skip ? 'skip' : s.error ? 'ERR' : String(s.count ?? 0);
    const dv = d.skip ? 'skip' : d.error ? 'ERR' : String(d.count ?? 0);
    let delta = '';
    if (!s.skip && !d.skip && !s.error && !d.error) {
      const diff = (d.count ?? 0) - (s.count ?? 0);
      delta = diff === 0 ? 'ok' : (diff > 0 ? `+${diff}` : String(diff));
      srcTotal += s.count ?? 0;
      dstTotal += d.count ?? 0;
    }
    console.log(name.padEnd(38), sv.padStart(8), dv.padStart(8), delta.padStart(8));
  }

  const [as, ad] = await Promise.all([countAuthUsers(src), countAuthUsers(dst)]);
  const authSv = as.error ? 'ERR' : String(as.count);
  const authDv = ad.error ? 'ERR' : String(ad.count);
  console.log('auth.users'.padEnd(38), authSv.padStart(8), authDv.padStart(8));
  console.log('-'.repeat(64));
  console.log(`public rows (summed): ${srcTotal} → ${dstTotal}`);
}

async function copyAuthUsers({ dryRun }) {
  log('=== auth.users (preserve UUIDs) ===');
  let page = 1;
  let copied = 0;
  let skipped = 0;
  let failed = 0;
  const oauthOnly = [];

  while (true) {
    const { data, error } = await src.auth.admin.listUsers({ page, perPage: 200 });
    if (error) { console.error('listUsers error:', error.message); break; }
    if (!data?.users?.length) break;

    for (const u of data.users) {
      const identities = u.identities ?? [];
      const hasOAuth = identities.some((i) => i.provider !== 'email');
      const hasEmail = !!u.email;
      if (hasOAuth && !hasEmail) oauthOnly.push({ id: u.id, providers: identities.map((i) => i.provider) });

      if (dryRun) { copied++; continue; }

      const { error: cErr } = await dst.auth.admin.createUser({
        id: u.id,
        email: u.email ?? undefined,
        phone: u.phone ?? undefined,
        email_confirm: !!u.email_confirmed_at,
        phone_confirm: !!u.phone_confirmed_at,
        user_metadata: u.user_metadata ?? {},
        app_metadata: u.app_metadata ?? {},
      });

      if (cErr) {
        if (/already.*registered|duplicate|already exists/i.test(cErr.message)) skipped++;
        else { failed++; console.warn(`  user ${u.id} (${u.email ?? 'no-email'}):`, cErr.message); }
      } else {
        copied++;
      }
    }

    log(`  page ${page}: processed ${data.users.length} users`);
    if (data.users.length < 200) break;
    page++;
  }

  log(`auth.users — copied=${copied} skipped=${skipped} failed=${failed}`);
  log('NOTE: password hashes do not transfer via Admin API. Users need Forgot password OR SQL import.');
  if (oauthOnly.length) {
    log(`OAuth-only users (${oauthOnly.length}) — identities need SQL import from auth.identities:`);
    for (const o of oauthOnly.slice(0, 10)) {
      log(`  ${o.id} providers=${o.providers.join(',')}`);
    }
    if (oauthOnly.length > 10) log(`  ... and ${oauthOnly.length - 10} more`);
  }
}

async function copyTable({ name, conflict }, { dryRun }) {
  if (SKIP_TABLES.has(name)) return { name, skipped: true };

  let from = 0;
  const PAGE = 500;
  let total = 0;
  let written = 0;
  let errors = 0;
  const started = Date.now();

  while (true) {
    const { data, error } = await src.from(name).select('*').range(from, from + PAGE - 1);
    if (error) {
      if (/relation.*does not exist|schema cache/i.test(error.message)) {
        log(`  ${name}: skip (not on source)`);
        return { name, skip: true };
      }
      console.error(`  read ${name}:`, error.message);
      return { name, error: error.message };
    }
    if (!data?.length) break;
    total += data.length;

    if (!dryRun) {
      const { error: wErr } = await dst.from(name).upsert(data, { onConflict: conflict });
      if (wErr) {
        errors++;
        if (errors <= 3) console.warn(`  write ${name}:`, wErr.message);
      } else {
        written += data.length;
      }
    }

    if (data.length < PAGE) break;
    from += PAGE;
    if (from % 2000 === 0) log(`  ${name}: ${from} rows read...`);
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const status = dryRun
    ? `read=${total} (dry-run) ${elapsed}s`
    : `read=${total} written=${written} errors=${errors} ${elapsed}s`;
  log(`${name.padEnd(36)} ${status}`);
  return { name, total, written, errors };
}

async function listObjectsRecursive(client, bucket, prefix = '') {
  const files = [];
  let offset = 0;

  while (true) {
    const { data, error } = await client.storage.from(bucket).list(prefix, {
      limit: 1000,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    if (!data?.length) break;

    for (const item of data) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) {
        files.push(...await listObjectsRecursive(client, bucket, path));
      } else {
        files.push(path);
      }
    }

    if (data.length < 1000) break;
    offset += 1000;
  }

  return files;
}

async function ensureDestBuckets({ dryRun }) {
  const { data: buckets, error } = await src.storage.listBuckets();
  if (error) throw error;

  const bucketList = buckets?.length ? buckets : STORAGE_BUCKETS_FALLBACK.map((id) => ({ id, name: id, public: true }));

  log(`=== storage buckets (${bucketList.length}) ===`);
  for (const b of bucketList) {
    const id = typeof b === 'string' ? b : b.id;
    const { data: existing } = await dst.storage.getBucket(id);
    if (existing) {
      log(`  bucket ${id}: exists on hprmic`);
      continue;
    }
    if (dryRun) {
      log(`  bucket ${id}: would create on hprmic`);
      continue;
    }
    const meta = typeof b === 'string' ? { public: true } : {
      public: b.public ?? false,
      fileSizeLimit: b.file_size_limit ?? b.fileSizeLimit,
      allowedMimeTypes: b.allowed_mime_types ?? b.allowedMimeTypes,
    };
    const { error: cErr } = await dst.storage.createBucket(id, meta);
    if (cErr) console.warn(`  create bucket ${id}:`, cErr.message);
    else log(`  bucket ${id}: created`);
  }

  return bucketList.map((b) => (typeof b === 'string' ? b : b.id));
}

async function copyStorage({ dryRun }) {
  const bucketIds = await ensureDestBuckets({ dryRun });
  let totalObjects = 0;
  let copied = 0;
  let failed = 0;
  let skipped = 0;

  for (const bucket of bucketIds) {
    let objects;
    try {
      objects = await listObjectsRecursive(src, bucket);
    } catch (e) {
      console.warn(`  list ${bucket}:`, e.message);
      continue;
    }

    log(`bucket ${bucket}: ${objects.length} objects`);
    totalObjects += objects.length;

    for (let i = 0; i < objects.length; i++) {
      const path = objects[i];
      if (dryRun) { copied++; continue; }

      const { data: blob, error: dErr } = await src.storage.from(bucket).download(path);
      if (dErr) { failed++; continue; }

      const { error: uErr } = await dst.storage.from(bucket).upload(path, blob, {
        upsert: true,
        contentType: blob.type || undefined,
      });
      if (uErr) {
        if (/already exists|duplicate/i.test(uErr.message)) skipped++;
        else failed++;
      } else {
        copied++;
      }

      if ((i + 1) % 50 === 0) log(`  ${bucket}: ${i + 1}/${objects.length} objects...`);
    }
  }

  log(`storage — objects=${totalObjects} copied=${copied} skipped=${skipped} failed=${failed}`);
}

async function run() {
  if (MODE === 'verify') {
    log('Verifying connectivity...');
    await printCountTable('Before migration');
    return;
  }

  const dryRun = MODE === 'dry-run';
  log(`Mode: ${MODE.toUpperCase()}${dryRun ? '' : ' (WRITES TO HPRMIC)'}`);
  if (FLAGS.storageOnly) log('Scope: storage only');
  if (FLAGS.tablesOnly) log('Scope: public tables only');
  if (FLAGS.skipAuth) log('Scope: skipping auth.users');

  log('\n--- BEFORE counts ---');
  await printCountTable('Before');

  if (!FLAGS.skipAuth && !FLAGS.tablesOnly && !FLAGS.storageOnly) {
    await copyAuthUsers({ dryRun });
  }

  if (!FLAGS.storageOnly) {
    log('\n=== public tables ===');
    for (const table of USER_DATA_TABLES) {
      await copyTable(table, { dryRun });
    }
  }

  if (!FLAGS.tablesOnly) {
    log('');
    await copyStorage({ dryRun });
  }

  log('\n--- AFTER counts ---');
  await printCountTable('After');

  log('\nDone.');
  if (!dryRun) {
    log('Next steps:');
    log('  1. Users: Forgot password (or SQL auth import for passwords + OAuth identities)');
    log('  2. Lovable env → hprmic URL + anon key');
    log('  3. Lovable → Share → Publish');
    log('  4. Clear site data on vybehub.app and sign in');
  }
}

run().catch((e) => { console.error(e); process.exit(1); });
