#!/usr/bin/env node
/**
 * Phase 4 — Verify the Supabase → Firebase migration.
 *
 * Compares row counts in Supabase (hprmic) against doc counts in Firestore
 * for every table/collection, and auth user counts on both sides.
 *
 * Run locally:
 *   SUPABASE_URL=https://hprmicwhlaaqfgshucec.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role> \
 *   GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json \
 *   node scripts/verify-migration.mjs
 *
 * Output:
 *   Prints a side-by-side table. Non-zero diffs are flagged ❌.
 *   Writes ./export/VERIFY.json with full results.
 */

import { createClient } from '@supabase/supabase-js';
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const URL = process.env.SUPABASE_URL || 'https://hprmicwhlaaqfgshucec.supabase.co';
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const SA = process.env.GOOGLE_APPLICATION_CREDENTIALS || './secrets/firebase-admin.json';

if (!KEY) { console.error('❌ SUPABASE_SERVICE_ROLE_KEY missing'); process.exit(1); }
if (!existsSync(SA)) { console.error(`❌ Firebase service account not found at ${SA}`); process.exit(1); }

const supabase = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
initializeApp({ credential: cert(JSON.parse(await readFile(SA, 'utf8'))) });
const fsdb = getFirestore();
const fauth = getAuth();

// Reuse the table list from export-supabase.mjs (kept in sync manually).
const TABLES = [
  '_demo_seed_log','account_deletion_requests','ad_campaigns','ad_credits','ad_daily_stats',
  'ad_impressions','ai_brief_preferences','algorithm_settings','analytics_events','announcements',
  'app_screenshots','app_secrets','auth_challenges','badges','battle_pass_tiers','blocked_users',
  'bookmarks','bug_reports','business_offers','business_orders','business_products',
  'business_profiles','business_reviews','business_subscription_tiers','business_subscriptions',
  'call_signals','calls','capture_events','challenge_progress','challenge_rewards',
  'challenge_templates','challenges','channel_messages','channel_permissions','channels',
  'chat_presence','checkin_prompts','close_friends','collab_post_invites','collab_posts',
  'comment_likes','comments','community_filter_likes','community_filters','community_guidelines',
  'contact_hashes','content_appeals','content_flags','conversation_admins','conversation_members',
  'conversation_notification_prefs','conversation_safety_overrides','conversation_safety_responses',
  'conversation_shortcuts','conversations','creator_daily_stats','creator_earnings',
  'creator_payouts','creator_profiles','daily_brief_cache','dismissed_announcements',
  'dismissed_profiles','dm_settings','dna_agent_actions','dna_agent_settings','dna_auto_theme',
  'dna_content_preferences','e2e_device_keys','email_send_log','email_send_state',
  'email_unsubscribe_tokens','encryption_keys','error_logs','event_comments','event_reminders',
  'event_rsvps','events','external_account_handles','feature_requests','feature_votes',
  'feedback','feedback_likes','filter_saves','filter_usage','filters','follows','friend_drops',
  'friend_requests','gifted_premium','group_call_participants','group_members','growth_config',
  'hidden_conversations','hub_content','invite_redemptions','invites','legal_acceptances',
  'licensed_tracks','likes','listing_favorites','listings','live_activity','live_music_presence',
  'live_widgets','login_history','login_streaks','marketplace_purchases','meme_ban_backgrounds',
  'message_deletions','message_pins','message_reactions','message_requests','message_views',
  'messages','moderation_feedback','moderator_applications','mood_states','music_providers',
  'music_settings','notification_preferences','notifications','order_events','orders',
  'parallel_feeds','parental_controls','payment_methods','phone_verifications',
  'post_collaborators','post_deletion_log','post_mood_signals','posts','profiles','push_tokens',
  'reaction_streaks','reports','roulette_matches','roulette_queue','saved_themes',
  'scheduled_messages','screen_time_sessions','screenshot_notifications','seller_ratings',
  'server_members','server_notifications','servers','shared_themes','snap_recipients',
  'sound_analytics','sound_play_events','sounds','space_participants','spaces',
  'sponsor_analytics','sponsor_profiles','spotify_connections','stories','story_likes',
  'story_poll_votes','story_views','streaks','stripe_config','suppressed_emails','theme_codes',
  'theme_likes','tips','token_transactions','track_usage','trashed_conversations',
  'typing_indicators','user_2fa_settings','user_about','user_active_boosts','user_ai_keys',
  'user_backgrounds','user_badges','user_bans','user_checkins','user_custom_sounds',
  'user_interactions','user_levels','user_locations','user_notes','user_passkeys',
  'user_preferences','user_presence','user_roles','user_roles_auth','user_safety_settings',
  'user_saved_sounds','user_sessions','user_settings','user_statuses','user_stickers',
  'user_themes','user_ui_settings','user_warnings','vanish_messages','vanish_threads',
  'video_stats','vybe_dna','vybe_score_events','vybe_scores','vybe_tokens',
  'webauthn_credentials','word_reactions',
];

async function supabaseCount(table) {
  const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
  if (error) return { count: null, error: error.message };
  return { count: count ?? 0 };
}

async function firestoreCount(collection) {
  try {
    const snap = await fsdb.collection(collection).count().get();
    return { count: snap.data().count };
  } catch (e) {
    return { count: null, error: e.message };
  }
}

async function authCounts() {
  // Supabase
  let sbTotal = 0; let page = 1;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    sbTotal += data.users.length;
    if (data.users.length < 1000) break;
    page++;
  }
  // Firebase
  let fbTotal = 0; let pageToken;
  do {
    const res = await fauth.listUsers(1000, pageToken);
    fbTotal += res.users.length;
    pageToken = res.pageToken;
  } while (pageToken);
  return { supabase: sbTotal, firebase: fbTotal };
}

console.log('🔍 Verifying migration: hprmic (Supabase) ↔ Firebase\n');
const results = [];
let mismatches = 0;

for (const t of TABLES) {
  const [sb, fb] = await Promise.all([supabaseCount(t), firestoreCount(t)]);
  const ok = sb.count === fb.count;
  if (!ok) mismatches++;
  const sbStr = sb.error ? `ERR(${sb.error.slice(0, 20)})` : String(sb.count);
  const fbStr = fb.error ? `ERR(${fb.error.slice(0, 20)})` : String(fb.count);
  console.log(`  ${ok ? '✅' : '❌'} ${t.padEnd(40)} supabase=${sbStr.padStart(7)}  firebase=${fbStr.padStart(7)}`);
  results.push({ table: t, supabase: sb.count, firebase: fb.count, ok });
}

console.log('\n👤 Auth users:');
const auth = await authCounts();
const authOk = auth.supabase === auth.firebase;
if (!authOk) mismatches++;
console.log(`  ${authOk ? '✅' : '❌'} supabase=${auth.supabase}  firebase=${auth.firebase}`);

await mkdir('./export', { recursive: true });
await writeFile('./export/VERIFY.json', JSON.stringify({
  verified_at: new Date().toISOString(),
  tables: results, auth, mismatches,
}, null, 2));

console.log(`\n${mismatches === 0 ? '✅' : '❌'} ${mismatches} mismatch(es). Full report → ./export/VERIFY.json`);
process.exit(mismatches === 0 ? 0 : 1);
