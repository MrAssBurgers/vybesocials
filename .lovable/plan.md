## Problems

1. **"Edge Function returned a non-2xx status code"** toast appears when opening the mini player. Direct curl to `/spotify-control` and `/spotify-playlists` both return `401 Unauthorized`, and the functions have **zero log entries**, meaning they're either not deployed or the auth check rejects the call before logging.
2. **Mini player is anchored off to the right** and clipped by the viewport edge, despite using `fixed left-1/2 -translate-x-1/2`. The pill it lives next to is wrapped in `motion.a` (a transformed ancestor), and `position: fixed` resolves against the nearest transformed ancestor, so it's no longer truly viewport-centered.

## Fixes

### 1. Render mini player + backdrop via portal (`SelfNowPlayingPill.tsx`)

- Import `createPortal` from `react-dom`.
- Wrap the `AnimatePresence` containing the backdrop and `<SpotifyMiniPlayer />` in `createPortal(..., document.body)` so they escape every transformed ancestor and `fixed` resolves against the viewport.
- Tighten the mini player width to `w-[min(340px,calc(100vw-32px))]` and keep it `left-1/2 -translate-x-1/2 bottom-[148px]` — once portaled, this centers cleanly on a 384px viewport.

### 2. Re-deploy + harden the two Spotify edge functions

- Deploy `spotify-control` and `spotify-playlists` explicitly (they currently return 401 with no log line, so the running build is stale or never booted).
- In both functions, replace `userClient.auth.getClaims(token)` with `userClient.auth.getUser(token)` and pull `userId` from `data.user.id`. `getClaims` can reject valid sessions when signing-key rotation is mid-flight; `getUser` is the pattern used by `spotify-listen-along` (which works today) and is more forgiving.
- Keep `verify_jwt = false` (already set in `supabase/config.toml`).
- Keep the existing `needs_connect / no_device / premium_required` response shape so the UI toasts in `useSpotifyControl` / `useSpotifyPlaylists` still match.

### 3. Sanity-check after deploy

- Re-issue curl with the preview session for both endpoints; expect either `{ ok: true }`, `{ no_device: true }`, `{ needs_connect: true }`, or a populated `playlists` array — never a 401.
- Tap the pill in preview: mini player should appear centered with margins on both sides, transport buttons should respond, and Playlists tab should load the user's library.

## Files

- `src/components/music/SelfNowPlayingPill.tsx` — portal the backdrop + mini player to `document.body`
- `src/components/music/SpotifyMiniPlayer.tsx` — width clamp tweak (`calc(100vw-32px)`)
- `supabase/functions/spotify-control/index.ts` — swap `getClaims` → `getUser`
- `supabase/functions/spotify-playlists/index.ts` — swap `getClaims` → `getUser`
- Deploy: `spotify-control`, `spotify-playlists`

## Notes

- No DB migration, no new secrets — `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` already configured.
- Spotify still requires Premium + an active device for transport control; the existing toasts already handle those branches.
