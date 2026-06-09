# WORKLOG

Use this file as the Lovable -> Cursor handoff each session.

**Links:** [Lovable project](https://lovable.dev/projects/416714c8-d013-4aff-984d-522418a9bbc7) · [Production](https://vybehub.app) · Deploy steps: `DEPLOY.md`

## Current Focus
- **Lovable Publish** — production perfection pass (publish routing, feeds, fullscreen UX)

## Publish log
- **2026-06-09** — production perfection pass pushed. **Lovable Publish pending.**

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
- Done: realtime crash fix (`realtimeChannel.ts`, ban/global-messages/autopilot cleanup); `npm run build` + `npm run lint`
- **Your turn:** Lovable Publish → verify `/home` loads without Realtime errors → Despia rebuild

## Next 3 tasks
1. Lovable Publish + verify Home loads (no `postgres_changes after subscribe()` errors)
2. Investigate `user_backgrounds` statement timeout on preview DB (index/RLS if persists)
3. Despia rebuild (>6061901) + App Store resubmit prep

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
