#!/usr/bin/env node
/**
 * Phase 2 — Export everything from Supabase (hprmic — the LIVE project) to local NDJSON + files.
 *
 * Run locally (NEVER in CI without secrets review):
 *   SUPABASE_URL=https://hprmicwhlaaqfgshucec.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role from Supabase dashboard → Project Settings → API> \
 *   node scripts/export-supabase.mjs
 *
 * Output:
 *   ./export/tables/<table>.ndjson      — one JSON doc per line
 *   ./export/auth-users.ndjson          — auth.users + identities (NO password hashes — see export-auth-hashes.mjs)
 *   ./export/storage/<bucket>/...       — downloaded objects (preserve paths)
 *   ./export/MANIFEST.json              — counts, sizes, timing
 *
 * Idempotent: existing table files are overwritten; existing storage files are skipped.
 */

import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile, appendFile, stat } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const URL = process.env.SUPABASE_URL || process.env.AGTCYX_URL || 'https://hprmicwhlaaqfgshucec.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AGTCYX_SERVICE_ROLE_KEY;
if (!KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY missing.');
  console.error('   Get it from Supabase Dashboard → project hprmicwhlaaqfgshucec → Project Settings → API → service_role.');
  process.exit(1);
}

const OUT = './export';
const TABLE_DIR = join(OUT, 'tables');
const STORAGE_DIR = join(OUT, 'storage');
const BATCH = 1000;

const supabase = createClient(URL, KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Tables to export. Update as schema grows. Skipped: oauth_nonces, password_reset_tokens, rate_limits, *_log temp tables. */
const TABLES = [
  '_demo_seed_log', 'account_deletion_requests', 'ad_campaigns', 'ad_credits', 'ad_daily_stats',
  'ad_impressions', 'ai_brief_preferences', 'algorithm_settings', 'analytics_events', 'announcements',
  'app_screenshots', 'app_secrets', 'auth_challenges', 'badges', 'battle_pass_tiers', 'blocked_users',
  'bookmarks', 'bug_reports', 'business_offers', 'business_orders', 'business_products',
  'business_profiles', 'business_reviews', 'business_subscription_tiers', 'business_subscriptions',
  'call_signals', 'calls', 'capture_events', 'challenge_progress', 'challenge_rewards',
  'challenge_templates', 'challenges', 'channel_messages', 'channel_permissions', 'channels',
  'chat_presence', 'checkin_prompts', 'close_friends', 'collab_post_invites', 'collab_posts',
  'comment_likes', 'comments', 'community_filter_likes', 'community_filters', 'community_guidelines',
  'contact_hashes', 'content_appeals', 'content_flags', 'conversation_admins', 'conversation_members',
  'conversation_notification_prefs', 'conversation_safety_overrides', 'conversation_safety_responses',
  'conversation_shortcuts', 'conversations', 'creator_daily_stats', 'creator_earnings',
  'creator_payouts', 'creator_profiles', 'daily_brief_cache', 'dismissed_announcements',
  'dismissed_profiles', 'dm_settings', 'dna_agent_actions', 'dna_agent_settings', 'dna_auto_theme',
  'dna_content_preferences', 'e2e_device_keys', 'email_send_log', 'email_send_state',
  'email_unsubscribe_tokens', 'encryption_keys', 'error_logs', 'event_comments', 'event_reminders',
  'event_rsvps', 'events', 'external_account_handles', 'feature_requests', 'feature_votes',
  'feedback', 'feedback_likes', 'filter_saves', 'filter_usage', 'filters', 'follows', 'friend_drops',
  'friend_requests', 'gifted_premium', 'group_call_participants', 'group_members', 'growth_config',
  'hidden_conversations', 'hub_content', 'invite_redemptions', 'invites', 'legal_acceptances',
  'licensed_tracks', 'likes', 'listing_favorites', 'listings', 'live_activity', 'live_music_presence',
  'live_widgets', 'login_history', 'login_streaks', 'marketplace_purchases', 'meme_ban_backgrounds',
  'message_deletions', 'message_pins', 'message_reactions', 'message_requests', 'message_views',
  'messages', 'moderation_feedback', 'moderator_applications', 'mood_states', 'music_providers',
  'music_settings', 'notification_preferences', 'notifications', 'order_events', 'orders',
  'parallel_feeds', 'parental_controls', 'payment_methods', 'phone_verifications',
  'post_collaborators', 'post_deletion_log', 'post_mood_signals', 'posts', 'profiles', 'push_tokens',
  'reaction_streaks', 'reports', 'roulette_matches', 'roulette_queue', 'saved_themes',
  'scheduled_messages', 'screen_time_sessions', 'screenshot_notifications', 'seller_ratings',
  'server_members', 'server_notifications', 'servers', 'shared_themes', 'snap_recipients',
  'sound_analytics', 'sound_play_events', 'sounds', 'space_participants', 'spaces',
  'sponsor_analytics', 'sponsor_profiles', 'spotify_connections', 'stories', 'story_likes',
  'story_poll_votes', 'story_views', 'streaks', 'stripe_config', 'suppressed_emails', 'theme_codes',
  'theme_likes', 'tips', 'token_transactions', 'track_usage', 'trashed_conversations',
  'typing_indicators', 'user_2fa_settings', 'user_about', 'user_active_boosts', 'user_ai_keys',
  'user_backgrounds', 'user_badges', 'user_bans', 'user_checkins', 'user_custom_sounds',
  'user_interactions', 'user_levels', 'user_locations', 'user_notes', 'user_passkeys',
  'user_preferences', 'user_presence', 'user_roles', 'user_roles_auth', 'user_safety_settings',
  'user_saved_sounds', 'user_sessions', 'user_settings', 'user_statuses', 'user_stickers',
  'user_themes', 'user_ui_settings', 'user_warnings', 'vanish_messages', 'vanish_threads',
  'video_stats', 'vybe_dna', 'vybe_score_events', 'vybe_scores', 'vybe_tokens',
  'webauthn_credentials', 'word_reactions',
];

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function exportTable(table) {
  const file = join(TABLE_DIR, `${table}.ndjson`);
  await writeFile(file, '');
  let from = 0;
  let total = 0;
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + BATCH - 1)
      .order('created_at', { ascending: true, nullsFirst: false })
      .throwOnError()
      .then((r) => r, (err) => ({ data: null, error: err }));

    if (error) {
      // Some tables don't have created_at — fallback to unordered.
      const fb = await supabase.from(table).select('*').range(from, from + BATCH - 1);
      if (fb.error) {
        console.warn(`  ⚠️  ${table}: ${fb.error.message}`);
        return { table, rows: total, error: fb.error.message };
      }
      const rows = fb.data || [];
      if (!rows.length) break;
      await appendFile(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
      total += rows.length;
      if (rows.length < BATCH) break;
      from += BATCH;
      continue;
    }

    const rows = data || [];
    if (!rows.length) break;
    await appendFile(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    total += rows.length;
    if (rows.length < BATCH) break;
    from += BATCH;
  }
  return { table, rows: total };
}

async function exportAuthUsers() {
  const file = join(OUT, 'auth-users.ndjson');
  await writeFile(file, '');
  let page = 1;
  let total = 0;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const users = data?.users || [];
    if (!users.length) break;
    await appendFile(file, users.map((u) => JSON.stringify(u)).join('\n') + '\n');
    total += users.length;
    if (users.length < 200) break;
    page++;
  }
  console.log(`  ✓ auth-users: ${total} rows`);
  console.log(`  ⚠️  Password hashes are NOT returned by listUsers() — to migrate passwords without forcing reset, ask Lovable support for an auth schema dump (auth.users.encrypted_password column).`);
  return total;
}

async function exportStorage() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  const summary = [];
  for (const b of buckets) {
    const objects = await listAllObjects(b.id);
    let downloaded = 0;
    let skipped = 0;
    for (const obj of objects) {
      const localPath = join(STORAGE_DIR, b.id, obj.name);
      try {
        await stat(localPath);
        skipped++;
        continue;
      } catch {}
      await ensureDir(dirname(localPath));
      const { data, error: dlErr } = await supabase.storage.from(b.id).download(obj.name);
      if (dlErr) { console.warn(`    ⚠️ ${b.id}/${obj.name}: ${dlErr.message}`); continue; }
      const buf = Buffer.from(await data.arrayBuffer());
      await writeFile(localPath, buf);
      downloaded++;
    }
    summary.push({ bucket: b.id, objects: objects.length, downloaded, skipped });
    console.log(`  ✓ storage/${b.id}: ${objects.length} objects (${downloaded} new, ${skipped} cached)`);
  }
  return summary;
}

async function listAllObjects(bucket, prefix = '') {
  const out = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 1000, offset, sortBy: { column: 'name', order: 'asc' },
    });
    if (error) throw error;
    if (!data || !data.length) break;
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id) out.push({ ...entry, name: full });
      else out.push(...await listAllObjects(bucket, full));
    }
    if (data.length < 1000) break;
    offset += 1000;
  }
  return out;
}

async function main() {
  await ensureDir(TABLE_DIR);
  await ensureDir(STORAGE_DIR);
  const start = Date.now();
  console.log(`📤 Exporting from ${URL}\n`);

  console.log('📋 Tables:');
  const tableResults = [];
  for (const t of TABLES) {
    process.stdout.write(`  → ${t}... `);
    const r = await exportTable(t);
    console.log(r.error ? `❌ ${r.error}` : `${r.rows} rows`);
    tableResults.push(r);
  }

  console.log('\n👤 Auth users:');
  const authCount = await exportAuthUsers();

  console.log('\n📦 Storage:');
  const storageSummary = await exportStorage();

  const manifest = {
    exported_at: new Date().toISOString(),
    duration_ms: Date.now() - start,
    source_url: URL,
    tables: tableResults,
    auth_users: authCount,
    storage: storageSummary,
  };
  await writeFile(join(OUT, 'MANIFEST.json'), JSON.stringify(manifest, null, 2));
  console.log(`\n✅ Done in ${Math.round((Date.now() - start) / 1000)}s — manifest at ${OUT}/MANIFEST.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
