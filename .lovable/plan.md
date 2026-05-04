
# Fix Plan: Ads policy, theme flicker, NFC, call crashes, map compass

## 1. AdSense "Low value content / no publisher content" rejection

Google rejected because the **app shell (auth, navigation, alerts) is what they crawled** — there's no public, content-rich, indexable surface. Two parts to fix:

**A. Split monetization by platform (maximize revenue)**
- **Web (vybehub.app)** → Google AdSense only (already integrated, currently disabled via `ADS_ENABLED=false` in `useShowAds.ts`).
- **Native APK / iOS (Despia + Capacitor)** → AdMob only (already wired in `src/lib/admob.ts` + `useVideoAds.ts`).
- Update `useShowAds` to also gate on `!isNativePlatform` so AdSense never loads inside the APK (AdMob handles native).
- Update `useVideoAds` (already native-only) — confirm gating and switch `USE_TEST_ADS = false` once real AdMob unit IDs are added (leave a clear `REPLACE_WITH_REAL_*` marker; user must paste real IDs from AdMob console).

**B. Make the web actually approvable by AdSense**
The real reason for rejection: AdSense crawler hits `vybehub.app` and sees a login wall + nav shell. Need real public content pages with substantive copy. We already have `Blog.tsx`, `BlogPost.tsx`, `Features.tsx`, `About.tsx`, `FAQ.tsx`, `Safety.tsx` — but likely thin. Plan:
- Audit `src/content/blogPosts.ts` and ensure ≥ 6 long-form posts (800+ words each). Expand any thin ones.
- Ensure `/`, `/features`, `/about`, `/blog`, `/faq` are reachable **without auth** and render full content server-friendly (already SPA, but ensure `index.html` has rich meta + the routes don't redirect anonymous users to `/auth`).
- Add `ads.txt` is already present — verify publisher ID matches `ca-pub-9952523729646293`.
- Only re-enable `ADS_ENABLED = true` AFTER content audit + resubmission to AdSense. Until then, keep AdSense off on web to avoid another policy strike.
- Keep AdSense **completely disabled inside the APK WebView** (Despia loads the same site) by checking `isNativePlatform` AND a Despia user-agent sniff.

## 2. Custom theme text flicker

Likely cause: `useApplyThemeFonts` / `ThemeProvider` / `ThemeTransitionProvider` re-applies CSS variables on every render or on route change, causing FOUC on text. Will:
- Inspect `src/providers/ThemeProvider.tsx`, `src/providers/ThemeTransitionProvider.tsx`, `src/hooks/useApplyThemeFonts.ts`.
- Move theme variable application to a single `useLayoutEffect` keyed only on actual theme id change (not the whole theme object).
- Add `font-display: swap` + preload custom fonts in `index.html` so swap doesn't flash.
- Add `color: inherit` fallback + a `[data-theme-loading="true"] { visibility: hidden }` guard removed on first paint after theme resolves.

## 3. APK: NFC trigger not firing

`useNativeFriendDrop` / `useWebNFC` / `native/android/FriendDropPlugin.kt` exist. Likely Despia doesn't expose the Capacitor plugin, so `useNativeFriendDrop` falls back silently. Will:
- Inspect `src/lib/nativeFriendDrop.ts` and `nativeFriendDropWeb.ts`.
- For Despia, NFC must use the **Web NFC API** (`NDEFReader`) — Despia Android exposes it. Currently `useWebNFC` may be gated incorrectly. Verify `'NDEFReader' in window` check runs on Despia and add a Despia-specific path that calls `despia://nfc-scan` if the plugin bridge exists, otherwise falls back to Web NFC.
- Add a visible "NFC ready" toast + error toast so the user knows it's listening.

## 4. APK: Calling crashes app instantly + AI crash detection

Calls use `stopCameraStream()` + WebRTC. On Despia APK the crash is almost certainly:
- `getUserMedia` invoked without prior `Permissions` grant on the WebView, OR
- A missing native permission in Despia's manifest (`RECORD_AUDIO`, `CAMERA`).
Plan:
- Inspect the call entry component (likely under `src/components/calls/` or `src/components/chat/`) and `SlideToAnswer`.
- Wrap call init in try/catch, request permissions explicitly via `navigator.permissions.query` + `getUserMedia` with audio-only first, then upgrade to video.
- Stop preloading camera before call — already a memory rule but verify.
- If running inside Despia (UA sniff), force audio-only first second to avoid the camera-init crash, then attach video.

**AI crash auto-reporter for admin panel**:
- Already have `useAutoBugReporter` + `bug_reports` table + admin panel.
- Add a new edge function `analyze-bug-report` that, on insert into `bug_reports`, calls Lovable AI Gateway (`google/gemini-3-flash-preview`) with the stack + breadcrumbs and writes back `ai_analysis` (root cause + suggested fix) into the row.
- Migration: add `ai_analysis jsonb` and `ai_analyzed_at timestamptz` columns to `bug_reports`. Add DB trigger or call function from client right after insert.
- Surface `ai_analysis` in `AdminBugReports.tsx` as a collapsible "AI root cause" panel.

## 5. Vybe Map compass: only tilts up/down, won't rotate 360°, weird movement

Compass mode is using device orientation `beta` (tilt) instead of `alpha` (heading/yaw), and likely applying it to map pitch instead of bearing.
Plan:
- Find map component (likely `src/components/map/` or `FriendMap`). Inspect compass / heading hook.
- Use `DeviceOrientationEvent.alpha` (corrected for screen orientation via `screen.orientation.angle`) and on iOS `webkitCompassHeading` for true north.
- Apply heading to **map bearing/rotation** (e.g. `map.setBearing(-heading)`), not pitch.
- Lock pitch when in compass mode to avoid the "whole map moves weird" feel — only bearing rotates with phone.
- Add iOS permission request: `DeviceOrientationEvent.requestPermission()` on user tap before enabling compass.
- Two-finger rotate gesture for manual 360° rotation when not in compass mode.

## Technical summary

**Files to edit**
- `src/hooks/useShowAds.ts` — add `!isNativePlatform` gate
- `src/lib/admob.ts` — leave test IDs marker, add comment block for production IDs
- `src/content/blogPosts.ts` — expand to 6+ long-form posts
- `src/providers/ThemeProvider.tsx`, `ThemeTransitionProvider.tsx`, `useApplyThemeFonts.ts` — fix flicker
- `index.html` — font preload + swap
- `src/lib/nativeFriendDrop.ts`, `nativeFriendDropWeb.ts`, `useWebNFC.ts` — Despia NFC path + toasts
- Call components (TBD after read) + `useCameraPreload` — audio-first init, try/catch
- `src/pages/AdminBugReports.tsx` — show `ai_analysis`
- Map component (TBD) — bearing rotation, alpha+webkitCompassHeading

**New**
- Edge function `analyze-bug-report` (Lovable AI Gateway, no API key needed)
- Migration: `ALTER TABLE bug_reports ADD COLUMN ai_analysis jsonb, ai_analyzed_at timestamptz`

**Order of execution**
1. Map compass fix (most concrete user pain)
2. Call crash fix + AI bug analyzer
3. NFC Despia path
4. Theme flicker
5. Ads platform split + AdSense content audit guidance

Approve and I'll execute in that order.
