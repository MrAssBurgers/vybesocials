import { useCallback, useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { normalizeSpotifyPlaylists } from '@/lib/spotifyPlayback';

export interface SpotifyPlaylist {
  id: string;
  name: string;
  image: string | null;
  tracks: number;
  owner: string;
}

export type SpotifyPlaylistsStatus = 'ok' | 'needs_connect' | 'needs_reconnect' | 'error';

const CACHE_KEY = 'vybe_spotify_playlists_cache';
const CACHE_TTL = 1000 * 60 * 5; // 5 min

function readCache(): SpotifyPlaylist[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) return null;
    return data as SpotifyPlaylist[];
  } catch { return null; }
}

function writeCache(data: SpotifyPlaylist[]) {
  try { sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); } catch {}
}

export function useSpotifyPlaylists(enabled: boolean) {
  const [playlists, setPlaylists] = useState<SpotifyPlaylist[] | null>(() => readCache());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SpotifyPlaylistsStatus>('ok');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: invokeError } = await db.functions.invoke('spotify-playlists', { body: {} });
      const d = (data as any) || {};

      // Only treat invoke error as fatal if the payload didn't carry a status flag we can interpret
      if (invokeError && !d?.needs_connect && !d?.needs_reconnect && !d?.error && !Array.isArray(d?.playlists) && !Array.isArray(d?.items)) {
        throw invokeError;
      }

      if (d?.needs_connect) {
        try { sessionStorage.removeItem(CACHE_KEY); } catch {}
        setStatus('needs_connect');
        setError('Connect Spotify to see your playlists');
        setPlaylists([]);
        return;
      }
      if (d?.needs_reconnect) {
        try { sessionStorage.removeItem(CACHE_KEY); } catch {}
        setStatus('needs_reconnect');
        setError('Reconnect Spotify to refresh access');
        setPlaylists([]);
        return;
      }
      if (d?.error && !d?.playlists?.length && !Array.isArray(d?.items)) {
        setStatus('error');
        setError(d.error);
        setPlaylists([]);
        return;
      }

      const list = normalizeSpotifyPlaylists(d);
      setStatus('ok');
      setPlaylists(list);
      writeCache(list);
    } catch (e: any) {
      setStatus('error');
      setError(e?.message || 'Could not load playlists');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    // Cache paints immediately. Always refresh so a stale empty parse
    // (raw Spotify `items` before the client mapped them) doesn't stick.
    void refresh();
  }, [enabled, refresh]);

  return { playlists, loading, error, status, refresh };
}
