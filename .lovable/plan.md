# Make VYBE Feel Like Instagram

A staged perf + stability pass. Each stage is independently testable and ships behind no flags — if any stage regresses, it can be reverted in isolation.

## What's already done (last turn)
- Splash safety 1500→600ms, auth/profile race 1000/800→400ms
- Vite `optimizeDeps` expanded (radix, supabase, lucide, date-fns, i18n)
- Global Motion default 220→180ms
- Spotify presence deferred to idle

---

## Stage 1 — Instant navigation (low risk, biggest perceived win)

**1.1 Hover/touchstart prefetch on BottomNav**
Wire `preloadRoute(path)` from `src/lib/routePreloader.ts` to every nav item's `onPointerEnter` + `onTouchStart`. By the time the user taps, the chunk is already parsed.

**1.2 Prefetch first-page data for the target tab**
On hover of Messages/Notifications/Profile, kick off the same Supabase RPC the page itself runs and stash in React Query — instant render on arrival.

**1.3 Strip the route fade animation**
`AnimatedRoutes.tsx` wraps every page in `motion.div` with opacity tween. Instagram doesn't cross-fade tabs. Replace with a no-op wrapper for the 5 main tabs; keep the spring only for stacked detail pages (post, profile, listing).

## Stage 2 — Feed virtualization (biggest scroll win)

**2.1 Install `react-virtuoso`** and replace the home feed `.map(...)` with `<Virtuoso />`. Currently every PostCard ever scrolled stays mounted (hundreds of media elements, IntersectionObservers, video tags). Virtuoso recycles them.

**2.2 Apply same treatment to Clips/Shorts viewer** — already uses IntersectionObserver but the DOM grows unbounded.

**2.3 Add `content-visibility: auto` + `contain-intrinsic-size` fallback** on PostCard root so off-screen cards skip layout/paint even before virtualization fully takes over.

## Stage 3 — Image & media pipeline

**3.1 Add `vite-imagetools`** for bundled assets so AVIF/WebP variants are auto-generated.

**3.2 Avatars & thumbnails**: wrap in a `<ResponsiveImage>` that emits `<picture>` with AVIF→WebP→JPEG sources, explicit `width`/`height` to kill CLS, `decoding="async"`, and `fetchpriority="high"` only on the first 2 visible posts.

**3.3 Video posters**: ensure every `<video>` has a `poster` so first paint isn't a black box.

**3.4 Signed-URL batch on idle**: today `batchSignUrls` runs eagerly in the preloader; move it behind `requestIdleCallback` so it doesn't fight initial paint.

## Stage 4 — Trim the provider/hook tree

App.tsx wraps every render in 11 nested providers. Defer the ones not needed for first paint behind a `<DeferredProviders>` boundary that mounts after `requestIdleCallback`:

- `StreakProvider`
- `RewardNotificationProvider`
- `EasterEggProvider`
- `TutorialProvider`
- `DebugPanelProvider` (already idle-safe, just move it)

Critical providers stay synchronous: Auth, Theme, QueryClient, Router, Tooltip, CallStore.

## Stage 5 — Realtime coalescing

Today on `/home` mount we open: `useRealtimeProfiles`, `usePostsRealtime`, `useSpotifyPresence`, `useExternalPresence`, plus per-message channels. Each is a WS subscription.

- Move profiles + posts subscriptions into a single multiplexed channel.
- Gate presence loops behind tab visibility (`document.visibilityState === 'visible'`).
- Debounce profile invalidations to 250ms (currently re-renders per event).

See `mem://technical/realtime/realtime-subscription-management` — keep within those rules.

## Stage 6 — Service worker shell cache (cold start)

`public/sw.js` already exists at v8 with shell/media caches. Audit:

- Verify `/index.html` is in SHELL_CACHE so repeat visits paint in <300ms offline-first.
- Add stale-while-revalidate for the React/Vite chunk filenames (hashed → safe to cache forever).
- Ensure SW doesn't intercept Supabase REST (it shouldn't — confirm NETWORK_FIRST_PATTERNS covers it).

## Stage 7 — Bug & jank sweep

- Run `code--read_runtime_errors` + `supabase--linter` to surface live issues, fix anything red.
- Grep for `setInterval` and `setTimeout` polls under 5s — flag for throttling.
- Verify no component uses `backdrop-blur` in scroll-critical paths (per Core rule — bottom nav, sticky headers).
- Check console for "Maximum update depth" and key-warnings on lists.

---

## Technical notes

- **No DB migrations** required.
- **One new dependency**: `react-virtuoso` (Stage 2). Optional: `vite-imagetools` (Stage 3) — can defer if you want zero new deps.
- **Risk**: Stage 2 (virtualization) touches the most-used screen; will test scroll-to-top, pull-to-refresh, scroll restoration, and infinite-load after.
- **Validation**: After each stage I'll reload preview, check console for errors, scroll the feed, and navigate between 3 tabs. Stage 5 also gets `supabase--analytics_query` to confirm channel count dropped.

## Out of scope

- Server-side rendering (would require leaving Vite SPA — too large).
- Native iOS/Android optimizations (Despia wrapper is doing its job).
- Algorithm changes to the feed ranking.

## Order I'll ship in

1, 7, 4, 5, 2, 3, 6 — biggest perceived wins + safest first, virtualization once the rest is stable.
