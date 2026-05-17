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
      if (error) throw error;
      const d = data as any;
      if (d?.needs_connect) {
        toast.message('Connect Spotify first', { description: 'Open Settings → Connections to link your account.' });
        return false;
      }
      if (d?.no_device) {
        toast.message('Open Spotify first', { description: 'Start Spotify on any device, then try again.' });
        return false;
      }
      if (d?.premium_required) {
        toast.error('Spotify Premium required for playback control');
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
