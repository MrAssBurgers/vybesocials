import { useCallback, useState } from 'react';
import { db } from '@/lib/firebase';
import { toast } from 'sonner';
import { requestSpotifyRefresh } from '@/lib/spotifyPlayback';
import { reportAppCrash } from '@/lib/bugReportClient';

export type SpotifyAction =
  | { action: 'play' }
  | { action: 'pause' }
  | { action: 'next' }
  | { action: 'previous' }
  | { action: 'seek'; position_ms: number }
  | { action: 'shuffle'; state: boolean }
  | { action: 'start_playlist'; playlist_id: string }
  | { action: 'start_track'; track_id: string; position_ms?: number };

const TRACK_CHANGES = new Set(['next', 'previous', 'start_playlist', 'start_track']);

export function useSpotifyControl() {
  const [loading, setLoading] = useState(false);

  const control = useCallback(async (
    payload: SpotifyAction,
    opts?: { previousTrackId?: string | null },
  ): Promise<boolean> => {
    setLoading(true);
    try {
      const { data, error } = await db.functions.invoke('spotify-control', { body: payload });
      const d = (data as any) || {};
      const message = String(error?.message || d?.error || '');
      const noDevice = !!d?.no_device || /404|no active device|NO_ACTIVE_DEVICE/i.test(message);
      if (error && !d?.ok && !d?.needs_connect && !d?.needs_reconnect && !noDevice && !d?.premium_required) {
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
      if (noDevice) {
        toast.message('Open Spotify first', { description: 'Start Spotify on any device, then try again.' });
        return false;
      }
      if (d?.premium_required || /premium/i.test(message)) {
        toast.error('Spotify Premium is required for playback control');
        return false;
      }
      if (d?.error) {
        toast.error(d.error);
        return false;
      }
      const ok = !!d?.ok || !error;
      if (ok) {
        requestSpotifyRefresh({
          previousTrackId: opts?.previousTrackId ?? null,
          nowPlaying: d?.now_playing || null,
          expectTrackChange: TRACK_CHANGES.has(payload.action),
        });
      }
      return ok;
    } catch (err: any) {
      const message = String(err?.message || '');
      if (/404|no active device/i.test(message)) {
        toast.message('Open Spotify first', { description: 'Start Spotify on any device, then try again.' });
      } else if (/unknown action/i.test(message) && payload.action === 'start_playlist') {
        toast.message('Playlists are in VYBE', { description: 'Starting one needs the latest Spotify control on the server.' });
        void reportAppCrash({
          error: err,
          source: 'spotify_control',
          reason: 'Spotify playlist start is not available on the server',
        });
      } else if (/premium/i.test(message)) {
        toast.error('Spotify Premium is required for playback control');
      } else {
        toast.error(message || 'Spotify control failed');
        void reportAppCrash({
          error: err,
          source: 'spotify_control',
          reason: `Spotify ${payload.action} failed`,
        });
      }
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  return { control, loading };
}
