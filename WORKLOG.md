# WORKLOG

Use this file as the Lovable -> Cursor handoff each session.

**Links:** [Lovable project](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) · [Production](https://vybehub.app) · Deploy steps: `DEPLOY.md`

## Current Focus
- **Load perf fix** — level cache, DM fast shell, personalized feed warm (local; publish via Lovable)
- **Prod SQL** — run `supabase/manual/PENDING_20260530.sql` on **`agtcyxjxgkdyoxwxkjth`**
- **Despia native rebuild** — after AdMob IDs saved in Despia dashboard (rewarded ads)

## What Changed (instant load — DMs, level, feed — 2026-06-10)
- **`userLevelCache.ts`** — disk cache so home never flashes fake Lv.1
- **`useVybePass`** — fixed `ensure_user_level()` call (no invalid param); offline-first placeholder
- **`GreetingWidget` / `XPStreakWidget`** — hide level badge until real data; skeleton instead of Lv.1
- **`loadDMConversations`** — two-phase load (list shell → previews); per-conv last message (not 200-row scan)
- **`useAppPreloader`** — warm `personalized-feed-v2` + proper user_levels fetch on boot
- **`auth`** — prefetch DMs when profile hydrates; clear level cache on sign-out
- **Debug scan:** build PASS; prod still missing `get_public_user_count` / `sync_signup_username` RPCs
- **Build:** `npm run build` pass

## What Changed (splash / onboarding loading glitch — 2026-06-10)
- **`SplashScreen`** — removed scale exit (fragmented V logo); faster fade; hides app shell during splash
- **`splashSession.ts`** — sessionStorage flag so refresh on `/onboarding` skips replaying boot splash
- **`useAppPreloader`** — instant ready on setup routes (`/onboarding`, `/auth`, etc.)
- **`Onboarding`** — blocking "Saving…" overlay on Skip/Finish (no mystery reload)
- **`UsernameSetup`** — removed duplicate subtitle line
- **Build:** `npm run build` pass

- **`despiaRewardedAds.ts`** — central `displayrewardedad://` bridge + `updateRewardedStatus` handler; documents Android AdMob IDs
- **`main.tsx`** — registers rewarded callback at boot (before React)
- **`useRewardedAd`** — uses Despia bridge only; `canUseDespiaRewardedAds` (no RC/age spinner block)
- **`useAdEligibility`** — exports `canUseDespiaRewardedAds` for Wallet Watch & Earn
- **`ADMOB_SETUP.md`** — rewritten for Despia dashboard (not Capacitor)
- **Build:** `npm run build` pass

## What Changed (debug scan — 2026-06-10)
- **`npm run debug`** — full scan script (build/lint/CSS, edge fn refs, production probes)
- **`AGENTS.md`** — "do a debug" protocol for future sessions
- **Scan results:** frontend PASS; production missing RPCs `get_public_user_count`, `sync_signup_username`; `ensure_user_level` OK (auth required); `community-voice-token` edge fn not deployed (livekit-token fallback OK)
- **Blocker:** apply `supabase/manual/PENDING_20260530.sql` on prod `agtcyxjxgkdyoxwxkjth`; Lovable Backend deploy for new edge functions
- **Git:** `6e808306` pushed — awaiting Lovable Publish

## What Changed (location + welcome/marketing preview — 2026-06-10)
- **Location** — no GPS prompt on app boot; only watches position on `/map`; Local feed asks when that tab is opened; onboarding permissions unchanged
- **`AppWelcome`** — phone screenshots use `object-cover` + eager load
- **`VybeHome`** — marketing device PNGs via `publicAsset()`; hero phones animate on mount (fixes Lovable preview `whileInView` miss)
- **`AIVybeDesigner`** — live preview cards no longer stuck invisible when animation gate fails
- **`useActivityStats`** — fail-soft on preview DB (home “Live” ticker always renders)
- **Build:** `npm run build` pass

## What Changed (home boot — missing nav + skeleton hang — 2026-06-10)
- **`BottomNav`** — show nav while profile loads; only hide when `onboarding_completed === false` (was hiding on undefined)
- **`profileCache` / `auth`** — persist `user_id` + `onboarding_completed`; hydrate cached profile on boot; backfill auth user id
- **`useUserLevel`** — query with `user.id` fallback so XP/level load without waiting on full profile
- **Splash CSS** — stop forcing nav `opacity: 0` during splash (was leaving nav invisible after fast dismiss)
- **Build:** `npm run build` pass

## What Changed (boot speed — 2026-06-10)
- **`useAppPreloader`** — instant ready for any returning user (stored session or cached profile); shorter persist gate; no blocking level/prefs wait; skip progress animation on exit
- **`App.tsx`** — shorter auth/splash caps (2s web max); optimistic session when token in storage
- **`BottomNav`** — boot grace 2.8s → 600ms
- **`auth.tsx`** — faster getSession safety timeout
- **Build:** `npm run build` pass

## What Changed (boot nav + profile hydration — 2026-06-10)
- **Bottom nav** — sync mobile detection on first paint; boot grace period; force-show after splash; main-tab recovery
- **Splash CSS** — removed `#app-shell visibility:hidden` (fixed black screen / missing nav)
- **Auth** — profile from disk cache on boot; rejects `user_xxxx` placeholders; greeting/XP skeletons while loading
- **Build:** `npm run build` pass

## Next 3 Tasks
1. User: Lovable Publish after load-perf fixes
2. User: paste `PENDING_20260530.sql` into prod SQL Editor (`agtcyxjxgkdyoxwxkjth`)
3. Device test — DMs list instant, level badge correct on cold start, feed posts not stuck on skeleton

## What Changed (instant DMs + onboarding — 2026-06-09)
- **`loadDMConversations.ts`** — shared fetch + nav/app prefetch for conversation list cache
- **`Messages.tsx`** — removed artificial mount skeleton delay
- **`useDMConversations`** — show cached list immediately; don't block on friends load
- **`ConversationList`** — skeleton only when no cached conversations
- **`useAppPreloader` / `routePreloader`** — prefetch DMs right after profile + on Messages tab hover
- **`Onboarding.tsx`** — Skip/Finish use `ensure_profile` + update (RLS-safe on production)
- **Build:** `npm run build` pass

## What Changed (incoming calls — 2026-06-09)
- **`GlobalCallOverlay`** — Snapchat-style full-screen incoming UI (portal → `document.body`, blurred caller wallpaper, slide-to-answer + Accept/Decline, locks scroll)
- **`nativeIncomingCall.ts`** + **`NativeIncomingCallBridge`** — Capacitor `@capgo/capacitor-incoming-call-kit` for iOS CallKit + Android full-screen intent; Despia `scanningmode://auto` during ring
- **`callStore`** — presents/dismisses native UI on ring/accept/decline; `vybe:incoming-call` event for push deep links
- **`NotificationActionRouter`** — tapping call notification surfaces full overlay before poll catches it
- **`send-push-notification`** — `ios_interruption_level: time_sensitive` for calls; optional `ONESIGNAL_CALL_CHANNEL_ID`
- **`DespiaOneSignalSync`** — requests incoming-call permissions on login
- **`index.css`** — `body.vybe-incoming-call-active` hides app chrome under overlay
- **Build:** `npm run build` pass

## What Changed (stability + UX pass — 2026-06-09)
- **DM refresh loop** — `ChatView` mark-read patches React Query cache instead of invalidating; `useMessages`/`useConversations` `refetchOnMount: false`
- **DM list density** — removed edge mask gradient; compact `.dm-convo-row`; smaller avatars; removed composer bottom shadow/fade
- **Bottom nav stuck** — `navVisibility.forceShow()` + scroll-hide reset on main tab routes
- **Splash preload** — warms user level, preferences, DNA settings before dismiss
- **Login approval** — `LoginGateModal` uses `activeChallengeId`; session retry on approve; push uses `profiles.id`
- **OneSignal push** — `send-push-notification` resolves auth uid → profile id for OneSignal lookup
- **Clips scroll** — removed `contentVisibility: auto`; explicit `touchAction: pan-y`; `vybe-clips-page` on ClipsViewer
- **Vybe DNA** — instant cache from preloader + localStorage actions cache

## What Changed (notifications — 2026-06-09)
- **`NotificationActionRouter`** — unified handler for Despia taps, OneSignal web clicks, service worker actions, and deep links (`?call=`, `?login-approval=`)
- **Call push** — Answer/Decline buttons on OneSignal Android; accept joins call instantly; decline updates DB
- **`send-push-notification`** — VAPID optional when OneSignal delivers to native; always sends `path` + `url` for Despia routing; profile-id resolution
- **Login approval push** — deep link `/?login-approval={id}` opens approval sheet on trusted device
- **Service worker** — call accept uses `?call=&action=accept`; posts `NOTIFICATION_CLICK` to app for decline

## What Changed (realtime hardening — app-wide)
- **`subscribePostgresChannel`** — migrated every remaining raw `.channel().on('postgres_changes')` across hooks, `callStore`, admin/auth components (~30 files)
- **`useServers`** — replaced anti-pattern `useQuery` subscription for channel messages with proper `useEffect`
- **`useFriendDropSync`** — stable channel name (removed `Date.now()` suffix that leaked channels)
- Broadcast/signaling channels (`useInstantSend`, `p2pConnection`, `LoginGateModal`, DM broadcast) intentionally unchanged

## What Changed (stability audit)
- **`spaces-token` community voice** — membership + LiveKit identity use `profiles.id` (was auth uid → 403 / missing avatars)
- **`RoomChat`** — removed nav cleanup that re-showed bottom nav when switching text → voice
- **`CommunityChannelSidebar`** — fixed nested `<button>` invalid HTML
- **`RootBottomNavMount`** — hide nav on all `/messages/*` sub-routes

## Publish log
- **2026-06-10** — Pushed `9e2b3ef8` to `main`: onboarding skip RLS fix, instant DM prefetch/cache. Build pass. **Lovable Publish pending** — production still serving `index-BfmVdKUH.js` (pre-9e2b3ef8).
- **2026-06-09** — Pushed `7f32cabf` to `main`: app-wide `subscribePostgresChannel` hardening, community voice ID fix, Vybe Map + friends polish, bottom nav immersion. Build + lint pass. **Lovable Publish pending** (user action).
- **2026-06-09** — Pushed `4d295871` to `main`: Discord-style communities shell, LiveKit voice (`community-voice-token`, `useCommunityVoice`), theme equip persistence, home/DM polish. Build + lint pass. Edge fn deploy blocked (Supabase CLI 403 — needs login or Lovable deploy). **Lovable Publish pending.**
- **2026-06-10** — Home iconic redesign: aurora hero card (spinning avatar ring, gradient greeting), spring feed tabs, quick-access cards, customize pill. DM convo: removed header/composer backdrop-blur seam — solid gradient fade header + opaque composer. Build + lint pass. **Lovable Publish pending.**
- **2026-06-09** — Settings visual system pass: new `SettingsUI.tsx` (`SettingsSectionCard`, `SettingsPanel`, `SettingsToggleRow`, `SettingsActionRow`, `SettingsStatusCard`); Security/Privacy migrated; Notifications/Appearance/Help fully refactored; glass inset panels (`.settings-panel`), action rows, segment pickers, FAQ items; Themes CTA + MyCurrentVybeCard liquid glass; SubscriptionSection glass; ARCHITECTURE_ROADMAP Supabase ref fix. Build + lint pass. **Lovable Publish pending.**
- **2026-06-09** — Scan pass 2: mobile settings detail gets a sticky horizontal category strip (switch sections without going home); theme preview lock on Gallery/Marketplace apply; useLearningSignals profile lookup fixed (`user_id` not `id`); PostCarousel lazy-load ready; sidebar scrollbar hidden. **Lovable Publish pending.**
- **2026-06-09** — Deep scan fixes: settings sidebar now pinned while scrolling (self-scrolling sticky + breakpoint aligned with AppLayout); theme preview lock kills the old-theme flicker after generating a vybe (AIVybeDesigner/ThemeCustomizer/DesignYourVybe vs useApplyUserTheme race); DM avatar story tap opens StoryViewer inline (was navigating to nonexistent /stories → 404); "Create Post" CTA → /upload, welcome "Shape what we build" → /roadmap (both 404'd); feed images lazy-load except first 2 (all were eager+high priority); invite stats polling 1s→15s with batched profile fetch (~13 req/s → ~0.2). **Lovable Publish pending.**
- **2026-06-09** — Settings total redesign: removed ugly spinning-square header icon; mobile is now an iOS-style grouped home list (profile hero card, grouped categories with colored tiles, red Log Out row, slide home↔detail navigation with back bar); desktop is a sticky grouped sidebar + content layout with sign-out under the nav. `?tab=` deep links still work. **Lovable Publish pending.**
- **2026-06-09** — Settings revamp: iOS-style colored icon tiles in nav (mobile dropdown + desktop pills with animated sliding active pill), aurora header with conic-gradient settings icon, theme-tinted card hairlines + hover glow on every settings card (scoped `.settings-shell` CSS so all 35 section components are lifted at once), gradient section-header icon tiles in 8 sections, redesigned Profile Settings card (aurora glows + gradient-ring avatar), polished footer. Build + lint pass. **Lovable Publish pending.**
- **2026-06-09** — CRITICAL: reverted `.env` + `config.toml` to production Supabase `agtcyxjxgkdyoxwxkjth`. They had been switched to `hprmicwhlaaqfgshucec` ("VYBE-Social"), an almost-empty project (8 tables, 5 migrations) — onboarding "Design your VYBE" failed because `profiles.bio` etc. don't exist there. NOTE: today's `spaces-token`/`generate-advanced-theme` deploys + recent migrations went to that wrong project; they're all in the repo, so Lovable Publish will deploy/apply them to production. **Lovable Publish pending.**
- **2026-06-09** — AI Vybe Designer: fixed "try again later" (function `generate-advanced-theme` was never deployed to `hprmicwhlaaqfgshucec` — deployed now with curated no-AI-key fallback + client-side local themes per vibe so it never dead-ends). Full UI redesign: aurora backdrop that morphs to selected vibe, animated headlines, springy vibe cards, gradient CTAs, clean preview. NOTE: set `GEMINI_API_KEY` or `LOVABLE_API_KEY` secret to enable true AI generation. **Lovable Publish pending.**
- **2026-06-09** — Mobile header polish: background now fades into the page theme (28px gradient mask, no hard black edge); streak badge on Challenges icon is now a flame (orange→red gradient + count). **Lovable Publish pending.**
- **2026-06-09** — App-wide safe-area pass: global `pt-safe`/`safe-area-*` utilities + all inline `env(safe-area-inset-top)` now use measured `--sat` var (env() = 0 in WebViews); added missing top safe areas to SpaceRoom, Community, Sounds, SoundDetail, Watch, camera editors, video preview, offline banner, toasts (sonner offset), pull-to-refresh, About/Contact, AdminDashboard. Headers keep themed bg so notch strip matches user theme. **Lovable Publish pending.**
- **2026-06-09** — Clips header safe area: `ClipsFeedHeader`/`ClipsViewer` now use measured `--app-header-safe` var (raw `env()` reported 0 in WebViews, header sat under the notch). **Lovable Publish pending.**
- **2026-06-02** — Spaces live audio (LiveKit) + raise-hand/mute persistence; `spaces-token` edge function deployed. **Lovable Publish pending.**
- **2026-06-02** — Phase 2 content unification (/shorts redirect, ranked Watch browse, ClipsViewer v2). **Lovable Publish pending.**
- **2026-06-02** — Messaging Polish Phase 1 (snap drag parity, outbox/call resume, voice scrub). **Lovable Publish pending.**
- **2026-06-09** — Vybe Snap text drag 1:1 finger tracking fix (local, publish pending)
- **2026-06-09** — production perfection pass pushed. **Lovable Publish pending.**

## What Changed (Spaces live audio — Phase 5 early)
- **`spaces-token` edge function** — role-aware LiveKit tokens for `space-{id}` rooms (speakers publish, listeners subscribe-only); deployed to `hprmicwhlaaqfgshucec`
- **`useSpaceAudio`** — LiveKit room connect, remote audio playback, active-speaker tracking, app-resume recovery; reconnects on listener→speaker promotion
- **`SpaceRoom`** — real mic mute (LiveKit + DB), raise-hand persists (`role: requested` so host sees it), audio status pill + retry, speaking ring from live audio
- **`useSpaces` fix** — host/participant profiles joined by `profiles.user_id` (was wrongly `profiles.id`, broke avatars/usernames)

## What Changed (Phase 2 — Content unification)
- **`/shorts` → `/clips` redirect** — one canonical clips route; `/shorts/:postId` deep links redirect too
- **Watch browse (`VideoBrowse`)** — now uses `get_ranked_feed_v2` ("For You" default) with load-more pagination; Trending/Recent re-sort loaded pages
- **`ClipsViewer`** — upgraded from legacy `get_ranked_feed` (v1) to `get_ranked_feed_v2`
- **Bottom nav** — Clips tab highlights on `/watch` + `/watch/:id` (Videos lives inside Clips)
- **Locales** — removed unused `allowDuet` ("Allow Duet/Remix") promise from all 20 locale files (feature not implemented)

## What Changed (Messaging Polish — Phase 1)
- **`SnapOverlayDraggable`** — shared 1:1 drag component for `VybeSnapEditor` + legacy `SnapCamera`
- **DM outbox** — flush on `visibilitychange` + `app-resumed` (background resume)
- **Send UX** — toast when message queued offline; vybe upload already marks `_failed` for retry
- **Calls** — `GlobalCallOverlay` listens for `app-resumed`; P2P waits out post-camera acquire
- **Voice notes** — waveform scrubbing on `AudioMessage`
- **Roadmap doc** — `docs/ARCHITECTURE_ROADMAP.md` (Phases 2–6 sequenced)

## What Changed (Vybe Snap text drag fix)
- **Text overlay drag** — removed Framer `drag="y"` + delta state double-move; new `SnapOverlayBar` uses start+delta touch math (1:1 finger tracking)
- **Trash zone** — still works during drag; position commits to state only on pointer/touch end

## What Changed (native black screen fix)
- **Native aurora restored** — static mesh gradient on Home/Explore/DMs (was flat `#0B0B10`)
- **Removed `vybe-stable-background`** from native boot — aurora mount no longer hidden
- **Clips/Watch** — aurora suppressed on immersive routes (intentional black player)
- **Splash dismiss** — `ensureAppShellVisible()` clears stuck `#root` visibility
- **Clips loading** — 10s timeout shows retry UI instead of infinite black skeleton

## What Changed (production perfection pass)
- **After publish** — clips → `/clips`, long videos → Videos tab; feeds invalidate instantly
- **No duplicate** “Post created” toast on upload
- **Email verify** — auth state + app resume detection (faster onboarding)
- **Watch** — mobile autoplay (muted), immersive layout, bottom nav hidden
- **Clip deep links** — `/clips/:id` redirects long videos to `/watch/:id`
- **Header/nav** — hidden on clips, watch, and clip viewer routes

## What Changed (clips perfection pass)
- **Videos tab header** — readable on light background (was invisible white-on-white)
- **Clips scroll** — stable intersection observer, no reconnect jank per swipe
- **Watch page** — mobile controls, view counts, related videos feed, short→clips redirect
- **Bottom nav** — Clips tab highlights on `/clips/*`; safe nav order fallback
- **Double-tap like** — fixed stale handler on clip cards

## What Changed (long-form Videos tab)
- **Clips → Videos tab** — YouTube-style grid browse inside Clips; tap opens `/watch/:id`
- **Sort chips** — For You, Following, Trending, Recent (type `video` posts)
- **Upload** — Mobile videos **>60s** auto-publish as `video` (long), shorter as `short` (clip)

## What Changed (VYBE-branded clips flow)
- **Same TikTok flow** — Clips tab, Following | For You, full-screen swipe, progress bar, sound pill
- **VYBE skin** — gradient tabs, VybeMiniIcon, aurora hearts, story-ring avatars, primary progress bar
- **Home feed** — rounded VYBE cards restored (removed flat Instagram-style overrides on native)

## What Changed (TikTok-style clips)
- **Bottom nav** — Clips is a primary tab (Film icon); Explore still available via search on clips header
- **Clips page** — Full-screen `100dvh` feed with bottom nav overlay (TikTok-style)
- **Following | For You** tabs at top; Following uses `get_following_posts_with_counts`
- **MobileShortCard** — Progress bar, spinning sound pill, expandable caption, TikTok layout offsets
- **ClipsFeedHeader** — Search shortcut to Explore

## What Changed (Instagram-ready polish)
- **`instagram-ready` document class** on native shell alongside perf mode
- **Clips** — no pre-roll on native; mid-feed ads after 4 clips; instant snap scroll; swipe hint once
- **Feed** — double-tap to like on touch; flat card separators on native
- **PWA banner** — hidden in Despia/native shell
- **Post publish** — faster return to feed on native (~900ms)

## What Changed (Instagram-ready foundation)
- **Auth keepalive** — periodic + resume refresh; `wasLoggedIn` flag synced on restore/sign-out
- **AppLayout** — don’t blank screen while auth loads if stored token exists; native scroll shell
- **Feed perf** — native `content-visibility`, no backdrop-blur on native, swipe transform off
- **Signup email** — auto-detect verification + spam-folder copy on auth screen

## What Changed (auth hardening)
- **getSession errors** — refresh stored token instead of clearing session on native cold start
- **App resume** — refresh on `visibilitychange`, `app-resumed`, iOS `pageshow` bfcache
- **AuthCallback** — detect `token_hash` / `refresh_token`; don’t bounce valid email links
- **Password reset** — always uses `https://vybehub.app/reset-password` on native shells

## What Changed (PWA default)
- **`VITE_OFFLINE_MODE=pwa`** — service worker caches shell; skip `despia/local.json` unless `despia-local`
- **`registerVybeServiceWorker`** — works on vybehub.app in browser + Despia URL mode
- **`manifest.webmanifest`** — local PNG icons + `id` for installability
- **`DEPLOY.md`** — Despia dashboard: disable local server, use URL mode

## Publish log (prior)
- **2026-06-09** — pushed `b4330cbb`. **Lovable Publish pending.**

## What Changed (`b4330cbb`)
- **Signup → onboarding** — `waitForAuthSession`, email verification screen, `ProtectedRoute` race fix
- **Mobile header** — cleaner full-width bar redesign
- **Despia local OTA** — `@despia/local` in dependencies, `postbuild`, `DEPLOY.md` troubleshooting

## Despia local server (handoff)
- **`@despia/local`** in `dependencies` + Vite plugin + `postbuild: despia-local dist index.html`
- **Production manifest:** https://vybehub.app/despia/local.json (`deployed_at` drives OTA)
- **Despia URL must be `vybehub.app`** — preview `*.lovableproject.com` redirects to auth; offline validator fails
- **OTA path:** Lovable Publish → manifest updates → native app background download → next launch
- **Store build only when:** new Despia native features / permissions / plugins (not for web UI fixes)

## Publish log
- **2026-06-02** — pushed `cc046265` (header gap + safe-area fallbacks, floating pill bar). **Lovable Publish pending.**
- **2026-06-08** — pushed `e7c8d285` (status bar clearance, header polish). **Lovable Publish pending.**

## What Changed (header below camera — `cc046265`)
- **`safeAreaInsets.ts`** — `--app-header-top` / `--app-header-gap`; higher iOS/Android Despia fallbacks; visualViewport offset
- **`index.css`** — header height = safe top + gap + toolbar + tail; CSS fallbacks before JS
- **`MobileHeader`** — dead zone under notch; floating rounded pill bar; compact streak badge
- **`HeaderSearch`** — full-width pill in header; overlay positioned below header

## What Changed (brief settings + header polish — `318e40e8`)
- **`AIBriefCustomizePanel`** — inline in brief sheet (no nested dialog); load/save `finally` fixes infinite spinner
- **`MobileHeader`** — lower compact bar via `--app-header-*` CSS vars; streak hides on narrow screens

## Publish log
- **2026-06-08** — pushed brief settings + header polish. **Lovable Publish pending.**
- **2026-06-08** — pushed `d1ebdbd9` (DM scroll fix + header redesign)
- **2026-06-08** — pushed `edbf9205` / `28cdf141` (Realtime crash fix)
- **2026-06-08** — pushed `5fa238d3` (mobile safe area, brief, AI keyboard, Friend Link, nav liquid, ads gating). Supabase auth/SMS/email/push functions deployed (user CLI). Redeploy `auth-2fa-request` after resend fix.
- **2026-06-02** — pushed `e489cfa2` (native perf mode). Web publish: pending Lovable.

## What Changed (realtime crash fix — `edbf9205`)
- **`realtimeChannel.ts`** — remove stale channels by topic before `.on()` / `.subscribe()` (fixes `postgres_changes after subscribe()` crashes)
- **`auth.tsx`** — single ban-status subscription via safe helper
- **`useBanStatus.ts`** — removed duplicate ban realtime (auth owns it)
- **`useGridLayout` / `useHomeLayout`** — removed no-op autopilot-grid/layout subscriptions (were duplicated per widget mount)
- **`useGlobalRealtimeMessages.ts`** — stable channel names, generation guard for async setup, safe teardown
- **`AppBackground.tsx`** — fail soft on `user_backgrounds` query errors (57014 timeout)

## What Changed (console error cleanup — `29b17a08`)
- **`mediaUrl.ts`** — rewrite legacy Supabase hosts, block Pexels 403 URLs, resolve bare filenames safely
- **Preload hooks** — skip dead URLs; removed `<link rel=preload>` spam
- **`get_public_user_count`** — fail soft when RPC missing (Lovable preview DB)
- **YouTube embed** — pass `origin` to fix postMessage mismatch
- **`index.html`** — removed unused GPT Engineer font preload

## What Changed (mobile polish batch — `5fa238d3`)
- **Safe area** — `--app-header-height` CSS var; AppLayout/Messages/ChatView respect notch; removed body safe-area padding that broke fixed headers
- **MobileHeader** — removed blur blobs that rendered as grey circles on WebKit
- **Verification email** — `auth-2fa-request` resend now matches preauth (no silent skip); LoginGateModal surfaces resend failures
- **Daily brief** — unified cache slots (`morning/lunch/dinner`); refresh keeps content visible; settings load via `.maybeSingle()` + error toast
- **Friend Link** — removed `animate-ping` grey ring; simplified phone-tap ripples (no conic-gradient mask)
- **VYBE AI chat** — composer uses `--kb-h` keyboard offset + scroll-on-focus
- **Bottom nav Create** — uses login-style `vybeLiquid` button
- **Ads** — no longer blocked while age RPC loads; Despia AdMob init on shell startup

## What Changed (native perf mode — prior)
- **`nativePerfMode.ts`** — Despia/Capacitor store shell gets static colorful aurora (mesh only), no touch ripples, reduced Framer motion, no contrast DOM scans
- **`VybeLiquidBackground`** — skips animated blobs, bloom, grain, device tilt, and pointer FX on native
- **`AnimatedRoutes`** — plain route shell on native (no `AnimatePresence popLayout`)
- **`main.tsx`** — `native-perf-mode` + `reduce-motion` classes before first paint; skip animation warmup on native
- **`index.css`** — native overrides beat immersive aurora/touch CSS

## What Changed (launch polish — prior local)
- Safari vs WebView detection — iPad Safari no longer mis-detected as native app
- Auth `getSession` — late responses no longer ignored after timeout
- `RootGate` — orientation/resize-aware mobile routing
- `PublicOnlyRoute` — waits for auth before redirect (no flash to sign-in)
- Friend Link pill visible on iPad (`useIsMobileOrTablet`)
- Shared `detectIsIPad` in `deviceDetection.ts` + `use-mobile.tsx`

## What Changed (iPad launch fix — pushed `94b22cad`)
- **`deviceDetection.ts`** — iPad/Macintosh UA + embedded WebView heuristics
- **`RootGate`** — iPad always gets mobile intro/Landing (not desktop `VybeHome`)
- **`despiaBridge`** — native shell detection for iPadOS desktop-class UA
- **`auth.tsx`** — 6s auth safety timeout + 5s `getSession` race
- **`App.tsx`** — clear stuck `#root` visibility after splash dismiss
- **`PublicOnlyRoute`** — iPad redirects to `/auth` instead of marketing pages

## What Changed (colorful background restore — prior local)
- **`STABLE_APP_BACKGROUND = false`** — liquid aurora + touch ripples back app-wide (Home, Clips, Explore, auth Landing)
- App shell transparent again; `VybeLiquidTouchShell` remounted in `App.tsx`
- Custom wallpaper still overrides aurora when set

## What Changed (App Store rejection fixes — prior local)
- **2.1(a) ATT:** splash absolute max 6.5s (was 3.5s early dismiss); post-ATT poll until auth+preload ready; staggered WebView recovery; consent poll after resume
- **2.1(a) routes:** loaders instead of blank null; stale token → `/auth`; local signOut on refresh timeout
- **2.1 NFC:** `docs/APP_STORE_RESUBMIT.md` — demo video script + App Review notes to paste (video still required manually)
- **AR filters:** lite CPU on all phones, overlay/zoom alignment, color filters without face lock
- **Stability:** Friend Link perf, cold start hardening (prior batch)

## What Changed (AR filters — prior local)
- **AR on all phones:** lite CPU profile no longer blocked by missing WebGL
- **Overlay alignment:** selfie roll corrected when mirrored; video + AR share pinch-zoom wrapper
- **Color AR filters:** golden hour / midnight / noir work without a detected face (fallback + no scan reticle)
- **Tracking lifecycle:** survives camera flip/restart; session AR retry when opening AR tab
- **AR tab default:** first free face filter (Neon Eyes), not premium Holographic

## What Changed (smoothness + bug pass — prior)
- ATT resume only after real backgrounding (no cold-load splash skip)
- IndexedDB restore 600ms cap so cold start never hangs
- PublicOnlyRoute loader instead of blank null during auth
- Friend Link: lighter QR scan (every 2nd frame), native NFC stop on close, duplicate-add guard

## What Changed (App Store ATT fix — prior)
- No duplicate tracking dialog on Despia native — uses `despia.trackingDisabled` only
- `attResumeRecovery.ts` clears stuck splash/body lock after system permission sheets
- Landing/RootGate never render blank during auth redirect (iPad review device)

## What Changed (Friend Link + Create camera — prior)
- **Friend Link:** single shake listener; iOS motion on pill tap + coach “Got it”; instant X close; activation hints (pill coach, sheet tips, feed spotlight); `AutoFriendDrop` mounted app-wide (pill only on `/home`); NFC/tap auto-add now calls `runAutoFriendAdd`
- **Create camera:** Snapchat-style bottom stack (lenses → shutter → modes), glass top controls, viewfinder grid, one-time `CreateCameraCoach`

## What Changed (AR — prior)
- Mobile AR enabled: `arEngine.ts` lite profile (CPU, 320px, smoothed landmarks)
- AR composited into photos (`arCapture.ts`); scan reticle while finding face
- Friend Link QR scanner: orbital sweep + target pulse animation
- `SnapARProvider` mounted in App (needs Snap token for full lens library)

## What Changed (platform polish)
- Lazy i18n: English only in main bundle; 19 locales on demand (`i18nLoadLocale.ts`)
- Offline feed: empty-state when no cache; “saved feed” banner when offline with cache
- Friend Link spotlight on Home + `openFriendLink()` → AutoFriendDrop sheet
- Mobile intro: Friend Link slide (`VYBE_INTRO_VERSION` 3)

## What Changed (perf + offline)
- Preloader waits for IndexedDB persist restore; skips heavy work when warm cache exists
- Home: tab-gated feeds; Global/Local only after first visit
- No full cache wipe on sign-in; deferred realtime/presence + animation warmup
- `offlineCacheProbe.ts`, `persistRestoreGate.ts`

## What Changed (aurora/touch — prior)
- `#vybe-aurora-mount` behind `#root`; portaled aurora + transparent app shells
- `VybeLiquidTouchOverlay` / `VybeLiquidTouchShell` — global tap ripples (Landing z-25, app z-5010)
- `vybeLiquid` buttons trigger same touch animation; blob pull via bridge
- Custom wallpaper gate: `hasUserWallpaper` + `isBackgroundResolved` hide aurora/touch; `stripLiquidShellDocumentState()` on upload

## Current Status
- Done: Snapchat-style full-screen incoming call overlay; native CallKit bridge wired; build pass
- **Your turn:** Despia native rebuild (Capacitor plugin) + Lovable Backend deploy `send-push-notification` → test locked-phone incoming call

## Next 3 tasks
1. Despia rebuild with `@capgo/capacitor-incoming-call-kit` (`npx cap sync` + native build); create OneSignal Android channel → set `ONESIGNAL_CALL_CHANNEL_ID`
2. Lovable Backend deploy `send-push-notification` → Publish → smoke test: locked phone incoming call (Answer/Decline from notification + full-screen UI)
3. Lovable Backend deploy `livekit-token` with LIVEKIT secrets → test community voice

## Publish log
- **2026-06-02** — pushed `edbf9205` (Realtime crash fix on Home). **Lovable Publish pending.**
- **2026-06-05** — smoothness/ATT resume + Friend Link perf — **Publish in Lovable + Despia now**
- **2026-06-02** — commit `ee375394` — ATT blank-screen fix
- **2026-06-02** — commit `934af286` — Friend Link polish + Create camera revamp
- **2026-06-02** — commit `686f01c0` — mobile AR + Friend Link QR scanner
- **2026-06-01** — commit `601ebb39` — perf, offline UX, lazy i18n, Friend Link spotlight
- **2026-06-01** — commit `821c373d` — liquid FAB + auth liquid UI
- **2026-06-01** — commit `6f265956` — auth liquid UI, Welcome heading

## Verification Checklist
- [x] `npm run build` passes
- [ ] Friend Link pill + shake on Home; X closes instantly
- [ ] Friend Link spotlight → opens tap sheet
- [ ] Offline: no cache → helpful empty state; with cache → banner + posts
- [ ] Lovable Publish completed
- [ ] `vybehub.app` Home aurora + tap verified
- [ ] `vybehub.app` Login tap + Log In button verified
- [ ] Custom wallpaper hides aurora (Settings → Background)
