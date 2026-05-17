## Plan: make Spotify controls and playlists work reliably

1. **Fix playback controls so taps respond instantly**
   - Update `spotify-control` to always return app-readable status payloads instead of hard failures where possible.
   - Treat common Spotify playback responses correctly:
     - `404` → open Spotify on a device first
     - `403` with premium/player restrictions → clear friendly status
     - `401` → refresh token and retry once before asking reconnect
   - For `play`, `pause`, `next`, `previous`, and playlist start, keep the UI optimistic so buttons visually respond immediately while the backend request completes.

2. **Fix playlist loading**
   - Update `spotify-playlists` to be more tolerant of existing connections:
     - Do not block users just because an old stored scope string is missing `playlist-read-private`; try Spotify first and only request reconnect if Spotify actually denies access.
     - Refresh expired tokens before fetching playlists.
     - Retry once after a Spotify `401`.
     - Return clean `{ playlists: [] }`, `{ needs_connect }`, `{ needs_reconnect }`, or `{ error }` payloads that the frontend can render.

3. **Fix starting playlists from the mini player**
   - Make playlist row taps optimistically close back to the player immediately.
   - If Spotify rejects the request, return to playlists and show the correct reconnect/open-Spotify message.
   - Prevent double taps while a playlist start is in flight.

4. **Clean the frontend error handling**
   - Update `useSpotifyControl` and `useSpotifyPlaylists` so function invocation errors don’t mask useful payloads.
   - Show simple user-facing messages instead of raw function/Spotify errors.
   - Refresh playlist state after reconnect/error retry without stale cache getting stuck.

5. **Deploy and validate**
   - Deploy the updated Spotify functions.
   - Test both deployed function endpoints with the current preview auth session where available.
   - Confirm the app receives structured responses for controls and playlist pulling.