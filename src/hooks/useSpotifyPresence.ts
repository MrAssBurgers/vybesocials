import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

/**
 * While the signed-in user has a Spotify connection, polls
 * `spotify-now-playing` every 15s. The edge function refreshes tokens,
 * fetches the current track, and upserts `live_music_presence`.
 * Other users receive updates via realtime subscription.
 */
export function useSpotifyPresence() {
  const { user } = useAuth();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const inflight = useRef(false);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;
    let connected: boolean | null = null;

    const checkConnection = async () => {
      const { data } = await supabase
        .from('spotify_connections')
        .select('user_id')
        .eq('user_id', user.id)
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
        const { error } = await supabase.functions.invoke('spotify-now-playing');
        if (error?.message?.includes('Unauthorized') || error?.message?.includes('token_invalid')) {
          connected = false;
        }
      } catch (e) {
        // swallow transient
      } finally {
        inflight.current = false;
      }
    };

    (async () => {
      await checkConnection();
      if (connected) tick();
      timer.current = setInterval(tick, 15_000);
    })();

    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVis);
      if (timer.current) clearInterval(timer.current);
    };
  }, [user?.id]);
}
