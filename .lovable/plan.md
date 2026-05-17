## What's blocking publish

Your **Live** backend is healthy and responding normally. The thing blocking publish is your **Test** (preview) backend — its Postgres connection pool is fully saturated:

```
FATAL: 53300: remaining connection slots are reserved for roles with the SUPERUSER attribute
```

This means every connection slot is used up by long-lived clients (mostly Realtime subscriptions and idle query connections from the preview app). Even Lovable's own auth admin role can't get a slot, so:

- Schema/types sync fails
- Migration preflight fails
- Publish refuses to proceed because it can't talk to Test

Live (production) currently sits at **92/?** connections (3 active, 81 idle, 8 realtime) — comfortable. Test is fully maxed.

## Why Test got saturated

Your project opens a lot of Realtime channels — I counted **43** `supabase.channel(...).subscribe()` call sites across hooks and components, against only **36** call sites that `removeChannel(...)` on cleanup. That gap, plus the recent additions (login-approval realtime, Spotify presence 8s polls, message read-sync, presence tracking) keeps slot pressure high in preview where the same tab can sit open for hours.

Every preview tab open right now is holding multiple subscriptions:

```
chat-presence, dm-conversation, message-notifications, login-approval-{user},
music-presence:{user}, conversation-typing, friend-map, locker, ...
```

When several tabs/devices are connected at once they multiply.

## Fix in two steps

### Step 1 — Unblock publish right now (no code change)

Restart the Test backend so all stuck slots are released:

1. Open **Connectors → Lovable Cloud → Test environment**
2. Click **Restart backend** (or pause + resume)
3. Wait ~30 seconds until status returns to healthy
4. Retry **Publish**

This always clears a 53300 lockup. Live is untouched.

### Step 2 — Stop it from happening again (small code change)

Audit the 7-call-site gap between `.subscribe()` and `removeChannel()` so every hook releases its channel on unmount. Specifically I want to:

- Add a single `useRealtimeChannel(name, setup)` helper that guarantees `removeChannel` on unmount even if `setup` throws.
- Convert the highest-churn subscribers to it:
  - `useMessageNotifications` (cross-device-read-sync) — currently re-subscribes on every dep change
  - `useLiveMusicPresence` — one per rendered avatar; coalesce to one shared channel per session
  - `LoginApprovalSheet` — fine, already cleans up
  - `useSpotifyPresence` — fine, but bump polling back to 12s (we lowered to 8s last turn — that's adding ~50% more `functions.invoke` traffic per tab)

This is purely defensive — none of these are required to publish; Step 1 unblocks you.

## Out of scope
- No schema migrations (the DB is unreachable from Test until restart anyway).
- No changes to the login-approval / Spotify pill features built last turn.

## Files I'd touch in Step 2
- `src/hooks/useRealtimeChannel.ts` (new helper)
- `src/hooks/useMessageNotifications.ts` (use helper, stable deps)
- `src/hooks/useLiveMusicPresence.ts` (shared channel registry)
- `src/hooks/useSpotifyPresence.ts` (interval 8s → 12s)

## Decision point
Tell me whether you want me to:
- **A.** Just restart Test (Step 1) and retry publish — fastest unblock, do nothing in code.
- **B.** Do Step 1 *and* implement Step 2 so this doesn't recur.