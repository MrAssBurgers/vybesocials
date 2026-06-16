import { useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { setLocalPresence } from '@/hooks/useLiveMusicPresence';

/**
 * While the signed-in user has a Spotify connection, polls
 * `spotify-now-playing`. The edge function refreshes tokens, fetches the
 * current track, and upserts `live_music_presence`. Other users receive
 * updates via realtime subscription.
 *
 * Polling is adaptive: in addition to the 12s base interval, we schedule
 * an extra tick ~1.5s after the current track is expected to end, so a
 * song change shows up within ~2s for the user playing it.
 */
export function useSpotifyPresence() {
  const { user } = useAuth();
  const baseTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const endOfTrackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflight = useRef(false);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;

    let cancelled = false;
    let connected: boolean | null = null;

    const clearEndOfTrack = () => {
      if (endOfTrackTimer.current) {
        clearTimeout(endOfTrackTimer.current);
        endOfTrackTimer.current = null;
      }
    };

    const scheduleEndOfTrack = (duration: number | null, progress: number | null) => {
      clearEndOfTrack();
      if (!duration || progress == null) return;
      const remaining = Math.max(0, duration - progress);
      // 1.5s after song ends, clamped 3s–30s
      const delay = Math.min(30_000, Math.max(3_000, remaining + 1_500));
      endOfTrackTimer.current = setTimeout(() => { tick(); }, delay);
    };

    const checkConnection = async () => {
      const { data } = await db
        .from('spotify_connections')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();
      connected = !!data;
    };

    const tick = async () => {
      if (cancelled || inflight.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (connected === false) return;
      inflight.current = true;
      try {
        const { data, error } = await db.functions.invoke('spotify-now-playing');
        if (error) {
          console.warn('[SpotifyPresence] invoke error', error);
          if (error?.message?.includes('Unauthorized') || error?.message?.includes('token_invalid')) {
            connected = false;
          }
        } else if (data) {
          // Optimistically push into the shared registry so the user sees
          // their own track change instantly, without waiting for realtime.
          if (data.connected !== false) {
            const { connected: _c, ...presence } = data as any;
            setLocalPresence(userId, presence);
            scheduleEndOfTrack(presence?.duration_ms ?? null, presence?.progress_ms ?? null);
          }
        }
      } catch (e) {
        console.warn('[SpotifyPresence] threw', e);
      } finally {
        inflight.current = false;
      }
    };

    (async () => {
      await checkConnection();
      if (connected) tick();
      baseTimer.current = setInterval(tick, 12_000);
    })();

    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    const onOnline = () => tick();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      if (baseTimer.current) clearInterval(baseTimer.current);
      clearEndOfTrack();
    };
  }, [user?.id]);
}
