# VYBE Patch Notes

## v1.2.0 — June 10, 2026

### Google Play — paste this (≤500 chars)

```
• Communities — new layout, text & voice channels, live voice lounges
• Vybe Map — cleaner map, live friend rings & status picker
• Messages — smoother chat list, faster updates, less flicker
• Friends — refreshed suggestions & profile cards
• Home & Settings — new look, easier navigation, theme polish
• Nav — bottom bar hides in chats, map, voice & communities
• Stability — crash fixes & realtime improvements app-wide
```

_Char count: 397 — fits Google Play release notes._

### Short summary (internal)

**Communities** — Orbit community switcher, glass channel sidebar, hero banner, text + voice channels, LiveKit voice lounges (join muted, unmute when ready), voice connection bar.

**Vybe Map** — Glass UI, gradient filters, animated live friend rings, status picker in Ghost Mode.

**Messages** — DM shell polish, composer/header seams fixed, list stops constant refreshing, realtime hardening.

**Friends** — Glass cards, gradient avatar rings, suggested friends polish.

**Home** — Aurora hero card, feed tabs, quick-access cards.

**Settings** — iOS-style grouped layout, glass panels, Connections/Security/Appearance refresh.

**Stability** — App-wide realtime channel hardening, community voice membership fix, bottom nav immersion, nested-button HTML fix, feed/settings/deep-link bug fixes.

---

## v1.1.5 — May 18, 2026

### 🎧 Spotify
- **Shuffle button** added to the Spotify player — toggles real Spotify shuffle with optimistic UI + green glow when on.
- **"Open Spotify"** now deep-links straight to the currently playing track (`/track/<id>`) instead of dumping you on the album.
- **Controls + playlists are instant now** — `spotify-control` and `spotify-playlists` edge functions auto-refresh expired tokens and retry once on 401 before asking for reconnect.
- Removed the stored-scope pre-block so old connections no longer get stuck on "needs reconnect" when Spotify itself would have allowed it.
- Edge functions now always return `200` with structured payloads (`needs_connect`, `needs_reconnect`, `error`) — UI shows a clean green **Reconnect Spotify** button instead of raw error strings.
- Playlist taps are optimistic — view jumps back to the player immediately, reverts only on failure. Stale playlist cache clears automatically on reconnect.
- **Now Playing pill** polished: bigger album art, two-line title/artist, larger dismiss target, provider-tinted ring, and the expanded player is truly centered (`inset-x-0 mx-auto`) with a symmetric spacer so play stays in the middle.
- **Connection return flow** fixed — after connecting Spotify (or linking Google/Apple), you land back on **Settings → Connections** with the provider already showing as Connected.

### 💬 Messaging & Push Notifications
- **DM push notifications now always fire** — even when the app is fully closed. Title = sender's name, body = the message (or `📷 sent a photo` / `🎤 sent a voice message` / `🎬 sent a video`).
- Server-side `on_message_insert_notify` trigger pulls the service-role key from Vault and pushes via `pg_net` — independent of whether the sender's tab is still alive.
- **Web/PWA users now bound to OneSignal** via `OneSignal.login(profileId)` on sign-in (and `logout()` on sign-out), so alias-targeted pushes actually reach browser users.
- Removed duplicate client-side push fan-out from `useSendMessage` — no more double notifications.
- Fixed DM send trigger that was referencing a non-existent `cm.profile_id` (now uses `cm.user_id`), so sends go through reliably.
- Header presence bar no longer flips into "typing…" — only the `SnapTypingBubble` above the input shows it.

### 🤖 AI Chat
- AI chat now looks **identical to a regular DM** — same floating frosted-glass pill header (back + avatar + name on the left, options on the right), same bubble radius/colors/padding, same composer feel.
- Avatar "aura" no longer bleeds — wrapped in `rounded-full overflow-hidden` so the pulsing gradient clips to the circle; green online dot still pokes out cleanly.
- Bottom nav no longer covers the composer/quick prompts on `/VYBE-AI`.

### 🎥 Posts & Video
- **Video posts no longer crash the app** — `VideoPlayer` wrapped in `SmartErrorBoundary` with a black fallback, click handler guarded with try/catch.
- Killed the **white "play button" flash** when opening a post — `VideoThumbnail` is solid black, `<video>` gets `poster=""` and `bg #000`, and the play overlay is a subtle `text-white/40` icon that only appears once loaded.

### 📡 NFC + Friend Link
- **Despia Android NFC works now** — added `despiaScanNFC()` helper that cycles through `readnfc://`, `nfcread://`, `scannfc://`, `nfc://read` and polls `window.readNFCResult`.
- Broader Despia/WebView detection — no more incorrect "NFC unavailable on this device" toast when Despia has NFC enabled.
- Normalized NFC payload parser supports `/friend-drop/:id`, `/add-friend/:id`, and raw `vybe:friend:` formats.
- Removed the fake gray QR camera placeholder + play-button image — now shows a loading spinner during init and only the real camera frame once it's live, with a "Tap to open camera" fallback if it fails.
- Camera stream now explicitly stops when leaving the QR tab or closing the Friend Link sheet.

### ⚡ Performance (Instagram-feel pass)
- **Splash safety** 1500ms → **600ms**, killed an 80ms boot stall, tightened auth race (1000→400ms) and profile race (800→400ms).
- **Bottom nav prefetch** — wired `preloadRoute()` to `onPointerEnter` / `onTouchStart` / `onFocus` so target page JS is downloaded before you tap.
- **Off-screen render skip** — added `content-visibility: auto` + `contain-intrinsic-size: 0 720px` to every PostCard so the browser stops re-laying-out cards that aren't visible.
- **Vite `optimizeDeps`** expanded (radix, supabase, lucide, date-fns, i18n, zod, react-hook-form) so cold dev compiles land in one pass.
- **Global Motion** default 220ms → **180ms** for that Instagram flick.
- **`og-image.png` 1.7MB → og-image.jpg 118KB** (~93% smaller). Updated OG/Twitter meta tags.
- `SpotifyPresenceMount` now defers `useSpotifyPresence` + `useExternalPresence` to `requestIdleCallback` so presence polling no longer competes with first paint.
- Confirmed realtime presence loops already gate on `visibilityState` and profile invalidations are debounced.

### 🛡️ Stability & Crash Isolation
- New **`LocalErrorBoundary`** wraps background/overlay mounts (`DeferredAuthHooks`, `LoginApprovalSheet`, `GlobalMessageNotifications`, `DespiaOneSignalSync`, etc.) so a crash in one subtree no longer takes down the whole app.
- `SmartErrorBoundary` no longer auto-recovers on runtime subtree errors — this stops the cascade of `useAuth must be used within an AuthProvider` errors and `uuid: "undefined"` 400s that were blanking the screen.
- Hardened realtime cleanups in `useGlobalRealtimeMessages` and `useApplyAutoTheme` with null guards and `try/catch` around `supabase.removeChannel()`.
- Suppressed the "Turn on notifications" prompt when permission is already `granted` or a subscription exists, with a `vybe_push_prompt_disabled` lock once enabled or dismissed.

### 🐞 Bug Reports & Admin
- **Bug reports page now loads on the live website.** Fixed auth race condition that was firing queries before the session was ready.
- `useUserRole` now correctly recognizes the **`owner`** role (checks both `user_roles` and `user_roles_auth`).
- Gated moderation queries (`useContentFlags`, `useReports`, `useAllWarnings`, `useAllBans`) behind `authReady && !!user` to eliminate premature 400s.
- `AdminBugReports` and `AdminDashboard` updated to grant owners full access and show proper error / access-denied states.
- Added `AdminBugReport` type for cleaner typing.

### 🔧 Version
- App version bumped to **1.1.5**.
