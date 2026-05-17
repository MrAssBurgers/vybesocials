## Short answer
Spotify works because it has an official **Currently Playing** API. Most other platforms — especially **YouTube** — don't expose what a user is watching in real time, so the same pattern isn't universally possible. Here's what's actually doable.

## Platform-by-platform reality check

| Platform | Real-time "now watching/playing"? | Notes |
|---|---|---|
| **YouTube** | No public API for it. The Data API only returns history if the user enabled it (and YouTube has been removing watch-history endpoints). No "currently watching" endpoint exists. | Workarounds below. |
| **Twitch** | Partial. Can show **what channel/stream they're watching** only if they're the streamer (Helix `streams` endpoint). Cannot see what stream a *viewer* is watching. | Good for "X is live streaming now". |
| **Apple Music** | Yes — MusicKit JS exposes the user's current track. Same pattern as Spotify. | Requires Apple Developer membership. |
| **SoundCloud** | API closed to new apps since 2021. | Skip. |
| **Steam** | Yes — Web API `GetPlayerSummaries` returns `gameextrainfo` (current game). | Easy add, same pattern as Spotify pill. |
| **Discord** | Yes — Discord exposes user presence (game/Spotify/custom status) via a bot in a shared server. | Requires bot + shared guild; viable. |
| **Last.fm** | Yes — `user.getRecentTracks` includes a `nowplaying` flag. | Aggregates scrobbles from many players. |
| **Netflix / Hulu / Disney+ / HBO / Prime** | No public API at all. | Not possible. |
| **TikTok / Instagram** | No "now watching" API. | Not possible. |

## YouTube — what we *can* actually do
Since "currently watching on YouTube.com" is impossible from a server, pick one of:

1. **In-app YouTube player (recommended)** — when a user plays a YouTube video *inside Vybe* via the IFrame Player API, we already know the videoId and can write to `live_music_presence` exactly like Spotify. Shows up as a "Watching on YouTube" pill on their profile/DM. Only works while they watch inside our app.
2. **Recently liked / uploaded** — OAuth Google sign-in with the `youtube.readonly` scope, periodically pull `playlistItems` for the "Liked videos" playlist. Shows "Recently liked: <title>". Not real-time, but real signal.
3. **Browser extension (future)** — a tiny extension that reads the active YouTube tab and pings our `live_music_presence` endpoint. Real-time, but requires installing the extension.

## Recommended rollout (incremental, reusing today's plumbing)
Today's `live_music_presence` table + shared realtime channel + `LiveSpotifyWaveform`/`NowPlayingInline` pills already generalize cleanly. We add new providers without schema changes.

### Phase 1 — Steam (smallest win, ~1 day)
- New edge function `steam-now-playing` polled by a `useSteamPresence` hook (mirrors `useSpotifyPresence`).
- Settings → Connections: "Connect Steam" → ask for SteamID64 + store Steam Web API key as a project secret.
- Reuse `live_music_presence` row with `provider = 'steam'`, `title = gameextrainfo`, `album_art_url = game header image`.
- Pill copy switches to "Playing on Steam".

### Phase 2 — YouTube in-app player
- New `YouTubePlayer` component using IFrame API; on `onStateChange = PLAYING`, upsert to `live_music_presence` with `provider = 'youtube'`, `title`, `album_art_url = video thumbnail`, `track_url`.
- On stop/route-change, clear the row.
- No OAuth needed for this path.

### Phase 3 — Apple Music
- Same pattern as Spotify (MusicKit JS handles auth + currentItem). Requires Apple Developer credentials from you.

### Phase 4 — Discord-style rich presence aggregator
- Optional Discord bot in a shared guild that pushes each user's presence (game, Spotify, custom status) into `live_music_presence` via webhook. Lets us show *anything* Discord already tracks without us reinventing each integration.

### Out of scope
- Netflix/Hulu/TikTok/Instagram "now watching" — no API, not possible.
- Live scraping of YouTube watch history — against ToS.

## DB changes (one small migration, total)
- Extend the `provider` check / enum on `live_music_presence` to include `'youtube' | 'steam' | 'apple_music' | 'discord'`. Everything else (title/artist/album_art_url/track_url/is_playing/updated_at) already fits the existing row.

## What I need from you before building
1. Which platforms do you want first? (Pick any subset of: Steam, YouTube in-app, Apple Music, Twitch live-streamer badge, Discord bot.)
2. For Steam: confirm you'll generate a Steam Web API key (free, takes ~1 min at steamcommunity.com/dev/apikey).
3. For Apple Music: confirm you have (or will get) an Apple Developer account.
4. For Discord: do you want me to set up a bot, or skip this phase?

Once you tell me which ones, I'll build them in one pass, reusing the Spotify pipeline so each new provider is ~150 lines of code instead of a separate system.
