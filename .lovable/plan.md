# Spotify Shuffle + Open Track Fix

## 1. Edge function — add `shuffle` action
`supabase/functions/spotify-control/index.ts`

Extend `buildRequest` with a new case:
- `shuffle` → `PUT https://api.spotify.com/v1/me/player/shuffle?state=<true|false>`

Read a new body param `state: boolean` and pass it through. Same auth/refresh/no_device/premium handling as the other actions (no change required there).

## 2. Hook — expose the action
`src/hooks/useSpotifyControl.ts`

Add to `SpotifyAction` union:
```ts
| { action: 'shuffle'; state: boolean }
```

No other changes — payload is forwarded verbatim.

## 3. UI — add shuffle button to `SpotifyMiniPlayer`
`src/components/music/SpotifyMiniPlayer.tsx`

- Import `Shuffle` from `lucide-react`.
- Local state: `const [shuffleOn, setShuffleOn] = useState(false);` (purely UI — Spotify doesn't return shuffle state in the presence payload, so we track the user's last toggle optimistically).
- Add a Shuffle button to the transport row, placed to the **left of SkipBack**, smaller (`w-9 h-9`) so the play button stays the visual center. Active state lights it `#1DB954` with a glow, inactive is muted foreground.
- Handler:
  ```ts
  const handleShuffle = async () => {
    const next = !shuffleOn;
    setShuffleOn(next);                       // optimistic
    const ok = await control({ action: 'shuffle', state: next });
    if (!ok) setShuffleOn(!next);             // revert on failure
  };
  ```
- aria-label: `"Shuffle ${shuffleOn ? 'on' : 'off'}"`, `aria-pressed={shuffleOn}`.

## 4. Fix "Open Spotify" to land on the playing track
`src/components/music/SpotifyMiniPlayer.tsx`

Currently uses `presence.track_url`. When that field is missing or falls back to a context URL, Spotify can open the album. Replace `handleOpenSpotify` with a track-first deep link:

```ts
const handleOpenSpotify = () => {
  const trackUrl = presence?.track_id
    ? `https://open.spotify.com/track/${presence.track_id}`
    : presence?.track_url;
  if (trackUrl) window.open(trackUrl, '_blank', 'noopener,noreferrer');
};
```

This guarantees the user lands on the exact playing track every time (Spotify web/app both honor `/track/<id>` and open the song view, not the album).

## Out of scope
- Repeat control (can be added later with the same pattern: `PUT /me/player/repeat?state=track|context|off`).
- Persisting shuffle state across sessions — Spotify is the source of truth; the optimistic toggle is correct UX and inexpensive.

## Files touched
- `supabase/functions/spotify-control/index.ts`
- `src/hooks/useSpotifyControl.ts`
- `src/components/music/SpotifyMiniPlayer.tsx`
