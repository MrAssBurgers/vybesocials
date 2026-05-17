## Fixes

### 1. Spotify controls + "Your Playlists" failing instantly
Root cause: `spotify-playlists` still throws raw non-2xx errors (no scope/refresh handling, no graceful payload) — that's the "Edge Function returned a non-2xx status code" toast. And the playlists hook treats any `error` as a hard failure, so the sheet shows the raw message instead of `needs_connect`/`needs_reconnect`.

- `supabase/functions/spotify-playlists/index.ts` — match the new `spotify-control` pattern: always return HTTP 200, retry on 401 by force-refreshing, return `{ needs_connect }` / `{ needs_reconnect, reason }` / `{ error }` payloads instead of HTTP errors. Add `REQUIRED_SCOPE = 'playlist-read-private'` guard against the stored `conn.scope`.
- `src/hooks/useSpotifyPlaylists.ts` — read `needs_connect` / `needs_reconnect` / `error` from the payload and surface friendly messages; never throw on functions-invoke `error` when the payload has a status field; cache only on success.
- `src/components/music/SpotifyMiniPlayer.tsx` — render the `needs_reconnect` / `needs_connect` states as a small "Reconnect Spotify" CTA inside the playlists view instead of a raw error string.
- Redeploy `spotify-playlists`.

### 2. Bottom nav covers the VYBE-AI chat
- `src/components/layout/RootBottomNavMount.tsx` — add `/VYBE-AI` to `HIDDEN_NAV_ROUTES` so the floating nav doesn't sit on top of the composer.
- `src/pages/AIChat.tsx` — drop the extra bottom safe-area padding that was compensating for the (now hidden) nav so the quick-prompt list fits the viewport.

### 3. Colorful aura "falling" from the VYBE-AI avatar
Root cause: the outer pulsing blur and the `-top-1 -right-1` glow chip sit outside the rounded avatar without clipping, so they bleed into the header.

- `src/pages/AIChat.tsx` (header avatar block, lines ~505-515) — wrap the avatar in a `relative h-10 w-10 rounded-full overflow-hidden` container, move the pulsing gradient + glow chip inside it, and keep the green online dot as a sibling outside the clip so it still pokes out cleanly.

### 4. Opening a user's DM takes forever
Likely cause: navigating to `/messages/:id` waits on conversation hydration before the screen paints. We'll:

- `src/components/chat/ConversationList.tsx` — on row tap, navigate immediately and prefetch the conversation's last messages via the existing query client (optimistic `setQueryData` from the row's preview).
- Verify the DM page renders skeleton/header instantly while messages stream in (no work if it already does).

## Technical notes
- Keep `spotify-playlists` response shape backwards-compatible: still include `playlists: []` alongside status flags so existing consumers don't crash.
- No DB / RLS changes.
- No UI design changes beyond the avatar clip fix and a tiny reconnect CTA.

Files touched: `supabase/functions/spotify-playlists/index.ts`, `src/hooks/useSpotifyPlaylists.ts`, `src/components/music/SpotifyMiniPlayer.tsx`, `src/components/layout/RootBottomNavMount.tsx`, `src/pages/AIChat.tsx`, `src/components/chat/ConversationList.tsx`.
