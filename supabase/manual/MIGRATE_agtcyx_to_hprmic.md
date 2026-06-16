# Migrate live data: agtcyx → hprmic (full import)

Move **all** user data from Lovable production **`agtcyxjxgkdyoxwxkjth`** into your owned project **`hprmicwhlaaqfgshucec`**, then publish the client that points only at hprmic.

## Who can run this

| Actor | Can run migration? |
|-------|-------------------|
| **You (locally)** | Yes — paste both service role keys into `.env` and run npm commands |
| **Cursor / Lovable agent** | **No** — agents cannot access agtcyx `service_role`; you run the script |

---

## Prerequisites (hprmic)

1. **Schema** — hprmic should have migrations applied (MCP check 2026-06-16: key tables exist).
2. **RPCs on hprmic** — `ensure_profile`, `sync_signup_username`, `is_username_available`, `get_public_user_count`, `create_dm_conversation` are present. **`PENDING_20260530.sql` is optional** if those RPCs already exist.
3. **Edge functions** — deploy on **hprmic** after data import (`ai-chat`, `livekit-token`, `send-push-notification`, etc.).

---

## Keys you need

Add to local `.env` (gitignored — never commit):

```bash
AGTCYX_URL=https://agtcyxjxgkdyoxwxkjth.supabase.co
AGTCYX_SERVICE_ROLE_KEY=<from Lovable support — not in Cloud UI>

HPRMIC_URL=https://hprmicwhlaaqfgshucec.supabase.co
HPRMIC_SERVICE_ROLE_KEY=<Supabase dashboard → hprmic → Settings → API → service_role>
```

### Email template for Lovable support

> Project: `416714c8-d013-4aff-984d-522418a9bbc7` (vybehub.app)  
> Please provide the **service_role** key for Supabase **`agtcyxjxgkdyoxwxkjth`**, or a **pg_dump** of `auth.users`, `auth.identities`, and `public` tables.

---

## Commands (run on your Mac, in this repo)

```bash
# 1) Connectivity + row counts (before)
npm run migrate:agtcyx -- --verify

# 2) Preview (no writes)
npm run migrate:agtcyx -- --dry-run

# 3) Full import: auth + ~130 public tables + all storage buckets
npm run migrate:agtcyx -- --execute

# Partial runs (if you need to retry)
npm run migrate:agtcyx -- --tables-only --execute    # public tables only
npm run migrate:agtcyx -- --storage-only --execute   # buckets/objects only
npm run migrate:agtcyx -- --skip-auth --execute      # tables + storage (auth imported via SQL)
```

The script prints **before/after row counts** per table and progress logs during copy.

---

## What gets imported

### Auth
- **`auth.users`** — same UUIDs (required for FKs)
- **`auth.identities`** — **not** copied by Admin API; OAuth users need SQL import (see below)

### Public tables (~130, FK-safe order)

**Profile & settings:** profiles, user_roles, user_roles_auth, user_settings, user_preferences, user_about, user_themes, user_ui_settings, user_safety_settings, notification_preferences, dm_settings, user_levels, login_streaks, challenge_progress, challenge_rewards, user_badges, vybe_dna, vybe_scores, vybe_score_events, vybe_tokens, token_transactions, user_backgrounds, user_custom_sounds, user_stickers, user_notes, user_presence, user_statuses, user_locations, user_interactions, user_checkins, ai_brief_preferences, daily_brief_cache, push_tokens, phone_verifications, user_2fa_settings, auth_challenges, user_passkeys, user_sessions, login_history, webauthn_credentials, e2e_device_keys, dna_*, user_active_boosts, parental_controls, screen_time_sessions, spotify_connections, live_music_presence, music_settings, external_account_handles, contact_hashes, encryption_keys, user_ai_keys, user_saved_sounds, filter_usage, filter_saves, parallel_feeds, mood_states, live_widgets, marketplace_purchases, gifted_premium, account_deletion_requests, conversation_notification_prefs, conversation_shortcuts, legal_acceptances, algorithm_settings

**Social:** follows, friend_requests, blocked_users, close_friends, dismissed_profiles, friend_drops, snap_recipients, referrals, invites, invite_redemptions

**Content:** posts, comments, comment_likes, likes, bookmarks, post_mood_signals, post_collaborators, collab_post_invites, post_deletion_log, stories, story_views, story_likes, story_poll_votes, video_stats

**DMs & calls:** conversations, conversation_members, conversation_admins, messages, message_views, message_reactions, message_deletions, message_pins, scheduled_messages, vanish_threads, vanish_messages, word_reactions, message_requests, hidden_conversations, trashed_conversations, conversation_safety_*, streaks, typing_indicators, screenshot_notifications, chat_presence, calls, call_signals, group_members, group_call_participants

**Moderation & themes:** notifications, reports, content_flags, content_appeals, user_warnings, user_bans, bug_reports, moderation_feedback, profile_audit, shared_themes, saved_themes, theme_likes, theme_codes, community_filters, community_filter_likes, filters

**Events & market:** events, event_rsvps, event_comments, event_reminders, dismissed_announcements, listings, listing_favorites, seller_ratings, orders, order_events, payment_methods

**Communities:** servers, server_members, channels, channel_messages, channel_permissions, server_notifications, spaces, space_participants

**Business & ads:** business_*, creator_*, ad_*, tips, sponsor_*, roulette_*, reaction_streaks, feedback, feedback_likes, analytics_events, capture_events, live_activity, moderator_applications, app_screenshots, meme_ban_backgrounds, sound_analytics, sound_play_events, feature_requests, feature_votes, error_logs

### Skipped (seed / ops on hprmic)
badges, challenges, challenge_templates, battle_pass_tiers, growth_config, stripe_config, app_secrets, hub_content, checkin_prompts, community_guidelines, announcements, sounds (catalog), music_providers, rate_limits, password_reset_tokens, oauth_nonces, email_* tables, client_debug_logs, _demo_seed_log, _view_backups

### Storage buckets (recursive copy)
avatars, media, stories, chat-media, custom-sounds, announcements, sounds, marketing-screenshots, app-screenshots (+ any extra buckets on agtcyx)

---

## Passwords & OAuth after migrate

| Method | Passwords | Google/Apple OAuth |
|--------|-----------|-------------------|
| Admin API (`--execute`) | **Not copied** — use Forgot password once | **Not copied** — need SQL or re-link |
| SQL dump from Lovable | Copy `encrypted_password` from dump | Copy `auth.identities` rows |

The script lists OAuth-only users during auth copy.

---

## Post-migration checklist

- [ ] `npm run migrate:agtcyx -- --verify` — hprmic counts match agtcyx
- [ ] Forgot password → log in as Bakrix on vybehub.app
- [ ] Home feed, profile, DMs, stories, avatars load
- [ ] Lovable Cloud env: `VITE_SUPABASE_URL` + `VITE_SUPABASE_PUBLISHABLE_KEY` → **hprmic**
- [ ] Lovable Backend deploy edge functions on **hprmic**
- [ ] Lovable → Share → Publish (SW **v20**)
- [ ] Clear site data on vybehub.app (removes old agtcyx session/cache)

---

## App config after this commit

- **Single Supabase client** — auth, reads, writes, storage, edge functions → **hprmic**
- **Removed:** `dualSupabase.ts`, `hprmicClient.ts`, feed/story merge, hprmic auth mirror on login
- **Legacy URLs:** `mediaUrl.ts` still rewrites old `agtcyx` storage hosts to hprmic for migrated rows

---

## If Lovable only gives a SQL dump

1. Import `auth.users` + `auth.identities` on hprmic (preserve UUIDs)
2. `npm run migrate:agtcyx -- --skip-auth --execute`
3. Re-run `--storage-only --execute` if objects missing
