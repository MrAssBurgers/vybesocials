import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface SpotifyPlaylist {
  id: string;
  name: string;
  image: string | null;
  tracks: number;
  owner: string;
}

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

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase.functions.invoke('spotify-playlists', { body: {} });
      if (error) throw error;
      const list = (data as any)?.playlists || [];
      setPlaylists(list);
      writeCache(list);
    } catch (e: any) {
      setError(e?.message || 'Could not load playlists');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (playlists === null) refresh();
  }, [enabled, playlists, refresh]);

  return { playlists, loading, error, refresh };
}
