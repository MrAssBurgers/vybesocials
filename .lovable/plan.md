## Goal

Turn notifications into the coolest, most useful part of VYBE. Instead of generic "you got a like", users get short, contextual, personalized push pings like:

- "📍 Something's happening 0.3 mi from you — 12 people just checked in at Roosevelt Park"
- "🧠 From your morning brief: Lakers just signed a new coach — tap to read"
- "👀 alex_p just posted in your neighborhood"
- "🔥 3 friends are live on VYBE right now"
- "🎵 New track from an artist you follow is trending near you"

Clean, rich, Alexa-card style — never spammy.

## What gets built

### 1. New "Smart Pings" notification type
- Add notification category `smart_ping` (sub-types: `nearby_post`, `nearby_event`, `brief_item`, `friend_activity`, `trending_local`, `creator_drop`).
- New columns on `notifications`: `title`, `body`, `image_url`, `deep_link`, `subtype`, `meta jsonb`. (Existing rows untouched; nullable.)
- Add the type to the CHECK constraint.

### 2. New preferences (per-toggle, default ON, respects quiet hours)
Added to `notification_preferences`:
- `nearby_enabled` — happenings near me
- `brief_pings_enabled` — individual story alerts from Daily Brief
- `friend_activity_enabled` — when close friends post / go live
- `trending_local_enabled` — what's blowing up nearby
- `smart_ping_radius_miles` (default 5)
- `smart_ping_max_per_day` (default 6) — hard cap so it never feels spammy

Wire these into `NotificationsSection.tsx` with the existing toggle pattern (Smartphone/Bell icons, glass card section titled "Smart Pings ✨").

### 3. Edge functions

**`smart-ping-dispatcher`** (cron every 15 min)
- Pulls users with `nearby_enabled` and a recent location (`profiles.last_lat/lng` or friend_map).
- For each, runs:
  - **Nearby posts**: posts created in last 30 min within radius, ranked by engagement_score (existing ranked-discovery formula).
  - **Friend activity**: posts/lives by accepted friends in last 20 min near user.
  - **Trending local**: posts with sudden engagement spike within radius in last hour.
- Picks top 1 candidate per user per run, dedupes against `notifications` last 6h, respects daily cap + quiet hours + DND.
- Generates a short Alexa-style line via Lovable AI Gateway (`google/gemini-2.5-flash-lite`) with a strict system prompt: ≤90 chars, friendly, no emoji spam (max 1), action-oriented.
- Writes row to `notifications` and calls `send-push-notification` with `image_url` + `deep_link`.

**`smart-brief-pings`** (runs after `ai-catch-up` finishes a brief)
- Takes the highest-priority brief item (from `daily_briefs` rows) and sends ONE individual push per user: e.g. "🧠 Top story for you: <headline>". Tap → opens that brief slide.
- Respects `brief_pings_enabled` and daily cap.

Both reuse existing OneSignal + Web Push fan-out in `send-push-notification` (already supports `image_url`/`data.url`).

### 4. Rich notification UI

**Service worker** (`public/sw.js` — verify path):
- Render notifications with `image`, `badge`, `actions: [{action:'open', title:'Open'},{action:'mute', title:'Mute 1h'}]`. Mute action calls a tiny edge function `mute-smart-pings` that sets `dnd_until = now()+1h`.

**In-app `/notifications` page card**:
- New `SmartPingCard` component: glass card, 56px rounded image on left, title bold, body muted, small chip showing distance ("0.3 mi") or category ("Brief"), tap navigates to `deep_link`.
- Group consecutive smart pings under a "Near you" header.

### 5. Anti-spam guardrails (the "clean" part)
- Hard daily cap per user (`smart_ping_max_per_day`).
- 6-hour dedupe window on (user, subtype, target_id).
- Quiet hours and DND fully respected.
- One-tap "Mute smart pings 1h / 24h / off" from any smart ping (long-press in `DMHoldMenu` style, matches existing notification interaction memory).

## Technical notes

- Distance calc: existing 25-mile Haversine helper used for local feed (per memory) — reuse for the radius filter.
- Engagement score: reuse weights from ranked discovery (Shares 5, Saves 4, Comments 3, Likes 1, Views 0.1).
- AI copy: small Gemini Flash Lite call, cached by content hash to avoid re-billing for duplicate posts.
- Cron: add two `pg_cron` schedules — `smart-ping-dispatcher` every 15 min, `smart-brief-pings` triggered at the end of `ai-catch-up`.
- All RLS: notifications table policies already correct; new columns inherit.
- Identity mapping: writes use `profiles.id` (per Identity Mapping memory), pushes use `auth.uid()` external_id which `send-push-notification` already handles.

## Out of scope (ask later)
- Lock-screen Live Activity (iOS native shell) — needs Despia config update.
- Group/co-post pings.

## Files

New:
- `supabase/functions/smart-ping-dispatcher/index.ts`
- `supabase/functions/smart-brief-pings/index.ts`
- `supabase/functions/mute-smart-pings/index.ts`
- `src/components/notifications/SmartPingCard.tsx`
- migration: add columns + new prefs + CHECK update + cron schedules

Edited:
- `public/sw.js` — rich rendering + actions
- `src/components/settings/NotificationsSection.tsx` — Smart Pings section
- `src/components/notifications/*` list page — render `SmartPingCard` for `smart_ping` rows
- `supabase/functions/send-push-notification/index.ts` — pass through `image_url`, action buttons

After approval I'll implement in this order: migration → dispatcher fn → brief pings fn → service worker rich UI → settings toggles → in-app card.
