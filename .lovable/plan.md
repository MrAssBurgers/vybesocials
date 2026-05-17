# Daily Brief deep-link page + notification delivery fix

Two problems to solve:

1. Tapping a daily-brief push just drops you on `/home` (it opens a bottom sheet via `?openBrief=true`, which mobile webviews often strip or ignore). You want a real page.
2. You're not receiving any push notifications — not the brief, not regular Vybe ones.

## 1. New `/brief` page

Create `src/pages/BriefPage.tsx` mounted at:
- `/brief` — today's brief for the signed-in user
- `/brief?topic=<topic>&headline=<headline>` — focused view when the push was a Smart Ping for a specific topic
- `/brief/:dateOrId` — historical brief (optional, same component)

The page reuses the existing brief data layer already powering `AIBriefSheet` (same query/cache via `useBriefPreFetch`) but renders it as a full page:
- Header with greeting (morning / lunch / dinner) + refresh button
- Each interest section (news, sources, image, category)
- Unread DMs preview block
- Active challenges block
- Notifications summary block
- "Open full feed" CTA
- Back button → previous route (defaults to `/home`)

Registered in `src/components/layout/AnimatedRoutes.tsx` alongside the other authenticated routes.

## 2. Point every brief notification at the new page

Update deep links from `/?openBrief=true` → `/brief`:
- `supabase/functions/send-brief-notification/index.ts` → `url: "/brief"` + per-time-of-day `tag`
- `supabase/functions/smart-brief-pings/index.ts` → `deepLink = '/brief?topic=...&headline=...'`
- Any in-app `notifications` rows seeded with the old deep link get rewritten in a small data migration so existing unread notifications also route correctly
- Remove the `?openBrief=true` auto-open handlers in `src/components/home/WelcomeHeader.tsx` and `src/components/home/DailyBriefWidget.tsx` (the sheet stays available from the home widget tap, but the URL-trigger code becomes a redirect to `/brief` for backwards compat)

## 3. Fix notifications not arriving

Diagnosis from the code:

- `send-brief-notification` and `smart-brief-pings` exist but I can't see scheduled cron jobs for them in the live DB (no permission to read `cron.job`). At minimum the schedule layer needs to be (re)asserted.
- `send-brief-notification` only queries `push_tokens` where `platform = 'web'` and sends raw VAPID web-push directly from the function. On the installed iOS/Android Despia app your tokens are stored with `platform = 'despia'` (see `src/lib/despiaPush.ts`), so the brief function silently skips you.
- Smart Pings call `send-push-notification`, which is the correct fan-out function — so the brief path is the broken one for native installs.
- The general "I get no Vybe notifications at all" symptom is consistent with either (a) push permission never granted on this device, or (b) `push_tokens` row missing for the current platform. The Settings → Notifications panel + `usePushNotifications` already supports re-subscribing; we'll surface a clearer "Notifications are off — enable" banner on the new `/brief` page and on the home brief widget when no token row exists for the active platform.

Fixes:

a. Rewrite `send-brief-notification` to fan out through `send-push-notification` per recipient (the same path Smart Pings already use). That hits web + Despia tokens, respects per-type preferences, and stops dropping native users on the floor.

b. Insert a row into `public.notifications` for every brief send (title/body/deep_link `/brief`) so the bell shows them even if OS-level push is blocked.

c. Add a migration that (re)creates the pg_cron schedules for both functions:
   - `send-brief-notification` at 06:00, 12:00 and 18:00 in the user's local timezone bucket (function already picks morning/lunch/dinner from current hour, so we schedule it hourly at :00 and the function filters by hour)
   - `smart-brief-pings` every 2 hours between 09:00–21:00 UTC, capped per-user via the existing `count_smart_pings_today` RPC
   Idempotent: each schedule does `cron.unschedule` if it exists before `cron.schedule`.

d. Add a one-time "Enable notifications" prompt on the new `/brief` page (and a small inline pill on the home brief widget) when `Notification.permission !== 'granted'` or no `push_tokens` row exists for the current platform. Tapping it runs the existing `subscribe()` from `usePushNotifications`.

e. Log every send attempt with success/fail counts so we can verify delivery from edge function logs after deploy.

## Technical notes

- No schema changes beyond the cron migration and the data backfill of existing brief `notifications.deep_link` values.
- `BriefPage` reads from the same cached query key as `AIBriefSheet`; opening the page right after a push will be instant if `useBriefPreFetch` already populated it.
- Service worker (`public/sw.js` / Despia push handler) doesn't need changes — it already opens whatever `url` is in the payload, so switching the payload to `/brief` is enough.
- Keep `AIBriefSheet` for the in-app "tap the widget" UX; the page is purely for deep-link entry.

## Files

New:
- `src/pages/BriefPage.tsx`

Edited:
- `src/components/layout/AnimatedRoutes.tsx` (add route)
- `src/components/home/WelcomeHeader.tsx`, `src/components/home/DailyBriefWidget.tsx` (redirect old `?openBrief=true` to `/brief` instead of auto-opening sheet)
- `src/components/home/AIBriefSheet.tsx` (extract brief-content renderer into a shared component reused by `BriefPage`)
- `src/hooks/usePushNotifications.ts` (small helper to report "is this platform subscribed")
- `supabase/functions/send-brief-notification/index.ts` (fan out via `send-push-notification`, insert `notifications` rows, log results)
- `supabase/functions/smart-brief-pings/index.ts` (deep link → `/brief?...`)

Migration:
- Recreate pg_cron schedules for `send-brief-notification` (hourly) and `smart-brief-pings` (every 2h daytime)
- `UPDATE public.notifications SET deep_link = '/brief' WHERE deep_link LIKE '/?openBrief=true%'`
