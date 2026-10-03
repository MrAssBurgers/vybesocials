import { useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { setLocalPresence } from '@/hooks/useLiveMusicPresence';
import {
  SPOTIFY_REFRESH_EVENT,
  readSpotifyRefreshDetail,
  spotifyPollIntervalMs,
  subscribeSpotifyPollInterval,
  type SpotifyRefreshDetail,
} from '@/lib/spotifyPlayback';

const TRACK_CHANGE_RETRY_MS = [450, 900, 1600];

/**
 * While the signed-in user has a Spotify connection, polls
 * `spotify-now-playing` and pushes the track into the local presence
 * registry immediately. Skips and playlist starts request an extra pull
 * so the title changes with the song instead of waiting on the next interval.
 */
export function useSpotifyPresence() {
  const { user } = useAuth();
  const inflight = useRef(false);
  const cancelledRef = useRef(false);
  const connectedRef = useRef<boolean | null>(null);
  const endOfTrackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const lastGoodRef = useRef<{ trackId: string | null; at: number } | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    cancelledRef.current = false;
    connectedRef.current = null;

    const clearEndOfTrack = () => {
      if (endOfTrackTimer.current) {
        clearTimeout(endOfTrackTimer.current);
        endOfTrackTimer.current = null;
      }
    };

    const clearRetries = () => {
      retryTimers.current.forEach((timer) => clearTimeout(timer));
      retryTimers.current = [];
    };

    const scheduleEndOfTrack = (duration: number | null, progress: number | null) => {
      clearEndOfTrack();
      if (!duration || progress == null) return;
      const remaining = Math.max(0, duration - progress);
      const delay = Math.min(30_000, Math.max(3_000, remaining + 800));
      endOfTrackTimer.current = setTimeout(() => { void tick(); }, delay);
    };

    const applyPayload = (raw: Record<string, unknown> | null | undefined): string | null => {
      if (!raw || raw.connected === false) return null;
      const { connected: _connected, ok: _ok, now_playing: _nested, ...presence } = raw;
      const title = typeof presence.title === 'string' ? presence.title : null;
      const trackId = typeof presence.track_id === 'string' ? presence.track_id : null;
      const isPlaying = presence.is_playing === true;
      // Spotify often returns an empty player for a moment after next/previous.
      // Keep the song already on screen instead of blanking it.
      if (!title && !isPlaying && lastGoodRef.current && Date.now() - lastGoodRef.current.at < 5000) {
        return lastGoodRef.current.trackId;
      }
      if (!presence.provider) presence.provider = 'spotify';
      setLocalPresence(userId, presence as any, { pinMs: title ? 12_000 : 0 });
      if (title) lastGoodRef.current = { trackId, at: Date.now() };
      scheduleEndOfTrack(
        typeof presence.duration_ms === 'number' ? presence.duration_ms : null,
        typeof presence.progress_ms === 'number' ? presence.progress_ms : null,
      );
      return trackId;
    };

    const tick = async (detail?: SpotifyRefreshDetail, attempt = 0): Promise<void> => {
      if (cancelledRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible' && !detail) return;
      if (typeof navigator !== 'undefined' && !navigator.onLine) return;
      if (connectedRef.current === false) return;
      if (inflight.current && !detail) return;
      inflight.current = true;
      let trackId: string | null = null;
      try {
        const { data, error } = await db.functions.invoke('spotify-now-playing');
        if (error) {
          const msg = String(error?.message || '');
          if (/503|Service Unavailable|quota|rate.?limit/i.test(msg)) {
            console.info('[SpotifyPresence] upstream unavailable (soft):', msg.slice(0, 120));
          } else {
            console.warn('[SpotifyPresence] invoke error', error);
          }
          if (msg.includes('Unauthorized') || msg.includes('token_invalid')) {
            connectedRef.current = false;
          }
        } else if (data) {
          const incoming = data as Record<string, unknown>;
          const incomingId = typeof incoming.track_id === 'string' ? incoming.track_id : null;
          const staleSkip = !!detail?.expectTrackChange
            && !!detail.previousTrackId
            && incomingId === detail.previousTrackId;
          // A poll that still has the song we just skipped must not cover the new one.
          if (!staleSkip) trackId = applyPayload(incoming);
          else trackId = incomingId;
        }
      } catch (e) {
        console.warn('[SpotifyPresence] threw', e);
      } finally {
        inflight.current = false;
      }

      const previous = detail?.previousTrackId;
      const stillSame = detail?.expectTrackChange && previous && trackId === previous;
      if (stillSame && attempt < TRACK_CHANGE_RETRY_MS.length && !cancelledRef.current) {
        const wait = TRACK_CHANGE_RETRY_MS[attempt];
        const timer = setTimeout(() => { void tick(detail, attempt + 1); }, wait);
        retryTimers.current.push(timer);
      }
    };

    const checkConnection = async () => {
      const { data } = await db
        .from('spotify_connections')
        .select('user_id')
        .eq('user_id', userId)
        .maybeSingle();
      connectedRef.current = !!data;
    };

    let interval: ReturnType<typeof setInterval> | null = null;
    const armInterval = () => {
      if (interval) clearInterval(interval);
      interval = setInterval(() => { void tick(); }, spotifyPollIntervalMs());
    };

    const onRefresh = (event: Event) => {
      const detail = readSpotifyRefreshDetail(event);
      if (detail.nowPlaying) applyPayload(detail.nowPlaying);
      void tick(detail.expectTrackChange ? detail : undefined);
    };

    void (async () => {
      await checkConnection();
      if (connectedRef.current) void tick();
      armInterval();
    })();

    const releasePoll = subscribeSpotifyPollInterval(armInterval);
    const onVis = () => { if (document.visibilityState === 'visible') void tick(); };
    const onOnline = () => { void tick(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onOnline);
    window.addEventListener(SPOTIFY_REFRESH_EVENT, onRefresh);

    return () => {
      cancelledRef.current = true;
      releasePoll();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      window.removeEventListener(SPOTIFY_REFRESH_EVENT, onRefresh);
      if (interval) clearInterval(interval);
      clearEndOfTrack();
      clearRetries();
    };
  }, [user?.id]);
}
