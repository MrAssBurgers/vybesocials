import { supabase } from '@/integrations/supabase/client';
import { setLocalPresence, type LiveMusicPresence, type LivePresenceProvider } from '@/hooks/useLiveMusicPresence';

/**
 * Generic "now playing/watching" upsert. Used by the in-app YouTube player
 * (and any future client-side source) so a single live_music_presence row
 * powers Spotify, Apple Music, YouTube, Steam, Twitch presence pills.
 *
 * For Spotify/Apple, the source of truth is a server-side edge function;
 * for YouTube it's the IFrame Player API running in this tab.
 */
export interface LivePresencePayload {
  provider: LivePresenceProvider;
  trackId?: string | null;
  title?: string | null;
  artist?: string | null;
  album?: string | null;
  albumArtUrl?: string | null;
  trackUrl?: string | null;
  durationMs?: number | null;
  progressMs?: number | null;
  isPlaying: boolean;
}

export async function upsertLivePresence(payload: LivePresencePayload) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const row = {
    user_id: user.id,
    provider: payload.provider,
    track_id: payload.trackId ?? null,
    title: payload.title ?? null,
    artist: payload.artist ?? null,
    album: payload.album ?? null,
    album_art_url: payload.albumArtUrl ?? null,
    track_url: payload.trackUrl ?? null,
    duration_ms: payload.durationMs ?? null,
    progress_ms: payload.progressMs ?? null,
    is_playing: payload.isPlaying,
  };

  // Optimistic UI immediately
  setLocalPresence(user.id, row as Partial<LiveMusicPresence>);

  await supabase.from('live_music_presence').upsert(row, { onConflict: 'user_id' });
}

export async function clearLivePresence(provider?: LivePresenceProvider) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  // Only clear if the current row matches this provider (avoid wiping Spotify
  // because the YouTube player unmounted).
  if (provider) {
    const { data } = await supabase
      .from('live_music_presence')
      .select('provider')
      .eq('user_id', user.id)
      .maybeSingle();
    if (data && data.provider !== provider) return;
  }

  setLocalPresence(user.id, null);
  await supabase.from('live_music_presence').delete().eq('user_id', user.id);
}
