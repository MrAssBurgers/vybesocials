import { useEffect, useRef } from 'react';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

/**
 * Polls the external-presence-poll edge function every ~45s while the tab
 * is visible. The function checks the user's saved Twitch login + Steam ID
 * and upserts live_music_presence accordingly. The realtime subscription on
 * live_music_presence (already shared by useLiveMusicPresence) picks up the
 * change so pills update across the app.
 *
 * Skips entirely when the user has no handles saved.
 */
export function useExternalPresence(enabled = true) {
  const { user } = useAuth();
  const timerRef = useRef<number | null>(null);
  const hasHandlesRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (!enabled || !user) return;
    let cancelled = false;

    async function tick() {
      if (cancelled || document.hidden) return;
      // Cheap check the first time — skip polling entirely if no handles saved
      if (hasHandlesRef.current === null) {
        const { data } = await db
          .from('external_account_handles')
          .select('twitch_login, steam_id')
          .eq('user_id', user!.id)
          .maybeSingle();
        hasHandlesRef.current = !!(data?.twitch_login || data?.steam_id);
      }
      if (!hasHandlesRef.current) return;

      try {
        await db.functions.invoke('external-presence-poll', { body: {} });
      } catch (e) {
        console.warn('external-presence-poll failed', e);
      }
    }

    function start() {
      tick();
      timerRef.current = window.setInterval(tick, 45_000);
    }
    function stop() {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    const onVis = () => {
      if (document.hidden) stop();
      else if (!timerRef.current) start();
    };

    start();
    document.addEventListener('visibilitychange', onVis);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, user]);

  // Expose a manual invalidator for the settings card
  return {
    refreshHandles: () => { hasHandlesRef.current = null; },
  };
}
