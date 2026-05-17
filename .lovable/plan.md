## 1. Spotify "Now Playing" pill → mini-player

**Visual change (`SelfNowPlayingPill.tsx`):**
- Flip the pill layout: album art stays on the **right**, everything else (live waveform, "LISTENING ON SPOTIFY", track title + artist) slides to the **left**. Dismiss `X` moves to the far right after the art, or is hidden by default and only shown via long-press to keep the pill clean.
- Tapping the pill no longer opens the Spotify web URL — it triggers a Framer Motion **expand animation** (spring 260/22, scale + height + opacity) into a "mini player" card anchored above the pill.

**Mini-player card (new `SpotifyMiniPlayer.tsx`):**
- Layout: large album art on the left, title/artist on the right, progress bar underneath, transport row with **Previous · Play/Pause · Next** circular buttons, and a "Open Spotify" + "Playlists" pill row at the bottom.
- Tap any control → calls a new edge function (see backend). UI updates optimistically (icon swap, progress reset on skip) and re-syncs from the next `useLiveMusicPresence` payload.
- Tap "Playlists" → slides a second panel (same card, swap content) showing the user's Spotify playlists in a scrollable list. Tap a playlist → starts it on the active device.
- Backdrop tap or pull-down gesture closes the mini player back into the pill.

**Backend additions:**
- New edge function `spotify-control` (verify_jwt=false, validates JWT in code) — accepts `{ action: 'play' | 'pause' | 'next' | 'previous' | 'seek' | 'start_playlist', position_ms?, playlist_id? }` and calls the matching `https://api.spotify.com/v1/me/player/*` endpoint. Reuses the `refreshIfNeeded` helper pattern from `spotify-listen-along`. Returns `{ needs_connect, no_device, premium_required, ok }` so the UI can show the same toasts already used by listen-along.
- New edge function `spotify-playlists` — `GET https://api.spotify.com/v1/me/playlists?limit=50`, returns trimmed `{ id, name, image, tracks }[]`. Cached in `sessionStorage` for 5 min on the client.
- Both functions registered in `supabase/config.toml` with `verify_jwt = false`.

**Files**
- `src/components/music/SelfNowPlayingPill.tsx` — layout flip + tap handler opens mini player
- `src/components/music/SpotifyMiniPlayer.tsx` *(new)* — expanded card with transport + playlists
- `src/hooks/useSpotifyControl.ts` *(new)* — wraps invoke of `spotify-control`
- `src/hooks/useSpotifyPlaylists.ts` *(new)* — fetches and caches playlists
- `supabase/functions/spotify-control/index.ts` *(new)*
- `supabase/functions/spotify-playlists/index.ts` *(new)*
- `supabase/config.toml` — register both new functions

## 2. Video posts: kill the white-bg / black play-circle placeholder

In `src/components/posts/PostCard.tsx` `VideoPlayer`:
- Replace `bg-muted/30` outer wrapper and inner `bg-muted` with **solid `bg-black`** so the moment the post mounts you see a clean black frame instead of a light/white skeleton.
- Replace `MediaSkeleton` (which shimmers white) with a transparent placeholder over `bg-black`, so only the black surface shows until the first frame paints.
- Keep the play affordance, but drop its surrounding `bg-black/30` veil (already black underneath) and shrink the icon (`h-14 w-14`, no fill-white halo) so it reads as a subtle Play glyph on pure black, matching the reference image.

**Files**
- `src/components/posts/PostCard.tsx` — `VideoPlayer` background + skeleton swap

## 3. Composer "Video" tab crash

When the user opens the Create sheet and taps the **Video** mode in `CreateModeSelector`, the app crashes. Root cause to verify during build: `MobileCreateStudio.startCamera` calls `getUserMedia` with `audio: mode === 'video'`, but on mode switch the previous stream isn't always stopped before re-requesting with audio, which throws `NotReadableError` and the error path doesn't always return cleanly (it can re-throw inside a `useEffect`, crashing the tree).

Fix:
- In `MobileCreateStudio.tsx`, wrap the mode-change effect so it: (a) calls `stopCameraStream()` + `streamRef.current?.getTracks().forEach(t => t.stop())`, (b) awaits a 300ms tick, (c) only then re-calls `startCamera()`.
- Wrap `startCamera`'s outer `try` to catch **all** errors (currently `secondErr` re-throws), surface as a toast, and leave `phase === 'camera'` with a "Tap to retry" overlay instead of unmounting.
- Add an `ErrorBoundary` wrapper around `MobileCreateStudio` in `MobilePostComposer` so any future render failure surfaces a recoverable UI instead of crashing the whole app.

**Files**
- `src/components/create/MobileCreateStudio.tsx`
- `src/components/create/MobilePostComposer.tsx`

## 4. Daily Brief → instant load

Today: `useBriefPreFetch` waits **5 seconds after mount** before prefetching, and `AIBriefSheet` shows a loading spinner whenever cached data is older than the current 30-min window.

Changes:

**Client (`useBriefPreFetch.ts`):**
- Remove the 5-second `setTimeout`; kick `prefetchBrief()` immediately on first authenticated mount.
- On app launch, **always** check `daily_brief_cache` table for the current slot first; if found, hydrate `localStorage` synchronously so `AIBriefSheet`'s `useState(() => getCachedBrief())` already has data on first render.
- Move the periodic refresh from a wall-clock 30-min interval to **slot boundaries** (6 AM, 12 PM, 6 PM local time) — schedule a single timeout to the next slot, then re-arm. When a slot fires: regenerate in background, write to cache, then `toast.message('Your new Daily Brief is ready')` + `haptics.success()`.

**Sheet (`AIBriefSheet.tsx`):**
- On open, if `briefData` is non-null (cached), **never show the loading screen** — render immediately and only call `fetchBrief(true)` in the background to revalidate. The existing `isRefreshing` already shows a small spinner in the header; no full-screen takeover.
- Only show `GeneratingScreen` when there is truly no cached data **and** no server cache (first-ever run).

**Server-side warm cache (already exists via `prewarm-daily-briefs`):**
- Confirm cron is hitting all three slots (6/12/18 in user timezone bucket). If timezone isn't already captured, fall back to UTC slots — no schema change needed.

**Files**
- `src/hooks/useBriefPreFetch.ts` — instant kick + slot-boundary scheduling + alert toast
- `src/components/home/AIBriefSheet.tsx` — render cached instantly, background revalidate only

## Notes for the user

- Spotify transport requires Spotify Premium and an active device — same constraint as today's Listen-Along. The mini-player will surface the existing "Open Spotify first" / "Premium required" toasts.
- The Daily Brief "alert" is an in-app toast + haptic. Push-notification delivery of the new brief already exists via `send-brief-notification` and is unchanged.
- No database migrations needed.
