## Goal
Make the Spotify "now playing" UI feel live (instant track changes), let viewers tap to listen along, and make the waveform animation pulse to the actual song's tempo/energy.

## 1. Instant song changes
Today `useSpotifyPresence` polls every 12s, so a song change can take up to 12s to reflect (and that delay is also why viewers see stale tracks). Two changes:

- **Adaptive polling in `src/hooks/useSpotifyPresence.ts`**: keep the 12s base interval, but when the edge function reports a track with `duration_ms` and `progress_ms`, schedule an extra tick ~1.5s after the track is expected to end (`duration - progress + 1500ms`, clamped 3s–30s). That catches the new song within ~2s without raising overall traffic. Also re-poll immediately on `visibilitychange→visible` (already there) and on `online`.
- **Optimistic local update**: when the edge function returns a payload, push it straight into the shared `useLiveMusicPresence` registry (new exported `setLocalPresence(authUserId, payload)`) so the signed-in user's own pill/widget updates the instant polling returns, without waiting for the realtime round-trip from Postgres.
- **Already covered**: the realtime subscription on `live_music_presence` in `useLiveMusicPresence` propagates changes to viewers within ~1s once the row updates, so no extra channel work is needed.

## 2. Listen-along
The `spotify-listen-along` edge function already exists and accepts `{ track_id, position_ms }`. We'll wire it into the existing pills/inline now-playing UI.

- **New hook `src/hooks/useListenAlong.ts`**: exposes `listenAlong(presence)` which calls `supabase.functions.invoke('spotify-listen-along', { body: { track_id, position_ms } })` and surfaces toast feedback for the three response shapes the function already returns: `ok`, `no_device` ("Open Spotify on a device first"), `needs_connect` ("Connect Spotify in Settings"), and `403` ("Spotify Premium required").
- **UI integration**:
  - `src/components/music/NowPlayingInline.tsx` — when `authUserId !== currentUser.id`, wrap the row in a button that triggers `listenAlong`. Add a small headphones icon on hover.
  - Add a dedicated `ListenAlongButton` used in DM headers and the friends-listening list, so viewers can sync without opening the row.
  - `SelfNowPlayingPill.tsx` stays a link to Spotify (self view doesn't need listen-along).

## 3. Waveform matches the music
`WaveformVisualizer` currently uses a static pseudo-random fallback. We'll make it tempo/energy-reactive when Spotify presence is available (the edge function already stores `tempo` BPM and `energy` 0–1 on `live_music_presence`).

- **New `src/components/music/LiveSpotifyWaveform.tsx`** (thin wrapper, presentation-only): takes `tempo`, `energy`, `isPlaying`, and renders 24 bars whose heights are driven by a `requestAnimationFrame` loop using `Math.sin(t * 2π * bpm/60 + barPhase)` scaled by `energy`. No new state libs, just `useRef` + `rAF` + transform updates for 60fps.
- **Equalizer upgrades in `SelfNowPlayingPill.tsx` and `NowPlayingInline.tsx`**: replace the fixed 3-bar Framer Motion equalizer with the live BPM-driven version when `presence.tempo` is present; fall back to current animation otherwise.
- Do not touch `WaveformVisualizer.tsx` (that one is for sound clips, different use case).

## Files

```text
edit   src/hooks/useSpotifyPresence.ts         adaptive end-of-track re-poll + push to registry
edit   src/hooks/useLiveMusicPresence.ts        export setLocalPresence(authUserId, payload)
new    src/hooks/useListenAlong.ts              wraps spotify-listen-along edge function
new    src/components/music/LiveSpotifyWaveform.tsx   BPM/energy-driven equalizer bars
edit   src/components/music/SelfNowPlayingPill.tsx    use LiveSpotifyWaveform
edit   src/components/music/NowPlayingInline.tsx       LiveSpotifyWaveform + listen-along tap
```

## Out of scope
- No DB migration (tempo/energy columns already exist; the edge function already writes them).
- No new edge function (listen-along already deployed).
- No changes to publish/connection-slot issues — separate from this request.
