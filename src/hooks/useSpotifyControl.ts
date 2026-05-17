import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type SpotifyAction =
  | { action: 'play' }
  | { action: 'pause' }
  | { action: 'next' }
  | { action: 'previous' }
  | { action: 'seek'; position_ms: number }
  | { action: 'start_playlist'; playlist_id: string }
  | { action: 'start_track'; track_id: string; position_ms?: number };

export function useSpotifyControl() {
  const [loading, setLoading] = useState(false);

  const control = useCallback(async (payload: SpotifyAction): Promise<boolean> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('spotify-control', { body: payload });
      const d = (data as any) || {};
      if (error && !d?.ok && !d?.needs_connect && !d?.needs_reconnect && !d?.no_device && !d?.premium_required) {
        throw error;
      }
      if (d?.needs_connect) {
        toast.message('Connect Spotify first', { description: 'Open Settings → Connections to link your account.' });
        return false;
      }
      if (d?.needs_reconnect) {
        toast.message('Reconnect Spotify', { description: 'Playback permission expired. Open Settings → Connections and reconnect.' });
        return false;
      }
      if (d?.no_device) {
        toast.message('Open Spotify first', { description: 'Start Spotify on any device, then try again.' });
        return false;
      }
      if (d?.premium_required) {
        toast.error('Spotify Premium is required for playback control');
        return false;
      }
      if (d?.error) {
        toast.error(d.error);
        return false;
      }
      return !!d?.ok;
    } catch (err: any) {
      toast.error(err?.message || 'Spotify control failed');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { control, loading };
}
