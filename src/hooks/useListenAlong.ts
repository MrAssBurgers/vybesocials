import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import type { LiveMusicPresence } from '@/hooks/useLiveMusicPresence';

/**
 * Triggers Spotify playback of someone else's currently-playing track on
 * the signed-in user's active Spotify device, starting at their current
 * position. Requires Spotify Premium + an active device.
 */
export function useListenAlong() {
  const [loading, setLoading] = useState(false);

  const listenAlong = useCallback(async (presence: Pick<LiveMusicPresence, 'track_id' | 'progress_ms' | 'title'> | null | undefined) => {
    if (!presence?.track_id) {
      toast({ title: 'Nothing playing', description: 'Wait for them to start a song.' });
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('spotify-listen-along', {
        body: { track_id: presence.track_id, position_ms: presence.progress_ms ?? 0 },
      });
      if (error) throw error;
      if (data?.needs_connect) {
        toast({ title: 'Connect Spotify', description: 'Link your Spotify account in Settings to listen along.' });
        return;
      }
      if (data?.no_device) {
        toast({ title: 'Open Spotify first', description: 'Start playback once on any Spotify device, then try again.' });
        return;
      }
      if (data?.error) {
        toast({ title: 'Spotify error', description: data.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Listening along 🎧', description: presence.title ?? 'Synced to their track' });
    } catch (e: any) {
      const msg = e?.message || 'Could not start playback';
      if (msg.includes('Premium')) {
        toast({ title: 'Spotify Premium required', description: 'Listen-along uses Spotify playback control.', variant: 'destructive' });
      } else {
        toast({ title: 'Listen-along failed', description: msg, variant: 'destructive' });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  return { listenAlong, loading };
}
