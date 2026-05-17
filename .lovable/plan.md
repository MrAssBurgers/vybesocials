## Plan

1. **Fix Spotify control permissions**
   - Update the Spotify OAuth start function to request `user-modify-playback-state` in addition to the existing playback read scopes.
   - This is required for pause, play, next, previous, seek, and playlist playback to work.
   - Improve the control function’s Spotify error handling so a missing permission returns a clear “Reconnect Spotify” response instead of a generic non-2xx edge function error.

2. **Make the client handle control errors cleanly**
   - Update `useSpotifyControl` so edge-function 403/401 responses don’t show the scary generic “Edge Function returned a non-2xx status code”.
   - Show useful messages like “Reconnect Spotify” or “Open Spotify first” based on the function response.

3. **Redesign mobile positioning behavior**
   - Keep the collapsed Spotify pill small and move it to the lower-left side of the phone, above the bottom nav, so it doesn’t block the main feed.
   - Tapping the small pill opens the larger Spotify player.
   - The large player will be centered horizontally, constrained to the phone width, and positioned above the bottom nav.
   - Tapping **X** on the large player will collapse it back to the small left-side pill, not dismiss the whole Spotify presence.

4. **Preserve the true dismiss control**
   - Keep the tiny `X` on the small pill as the actual dismiss/hide action for the current track.
   - The expanded player’s `X` only collapses back to the small UI, matching your request.

5. **Deploy and verify edge functions**
   - Deploy the updated Spotify edge functions.
   - Test the `spotify-control` function directly to confirm it no longer fails with the generic edge-function error path.

## Technical details

- Files to update:
  - `supabase/functions/spotify-oauth-start/index.ts`
  - `supabase/functions/spotify-control/index.ts`
  - `supabase/functions/spotify-playlists/index.ts` if shared error handling is needed
  - `src/hooks/useSpotifyControl.ts`
  - `src/components/music/SelfNowPlayingPill.tsx`
  - `src/components/music/SpotifyMiniPlayer.tsx`

- Important note: users who connected Spotify before the new permission was added will need to reconnect Spotify once, because Spotify scopes are granted at connection time.