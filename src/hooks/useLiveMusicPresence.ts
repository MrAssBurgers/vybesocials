import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface LiveMusicPresence {
  user_id: string;
  provider: 'spotify' | 'apple_music';
  track_id: string | null;
  title: string | null;
  artist: string | null;
  album: string | null;
  album_art_url: string | null;
  duration_ms: number | null;
  progress_ms: number | null;
  track_url: string | null;
  is_playing: boolean;
  updated_at: string;
}

/**
 * Subscribe to a user's live music presence. Pass the auth user id
 * (profiles.user_id), NOT profiles.id.
 */
export function useLiveMusicPresence(authUserId: string | null | undefined) {
  const [presence, setPresence] = useState<LiveMusicPresence | null>(null);

  useEffect(() => {
    if (!authUserId) { setPresence(null); return; }
    let cancelled = false;

    const fetchOne = async () => {
      const { data } = await supabase
        .from('live_music_presence')
        .select('*')
        .eq('user_id', authUserId)
        .maybeSingle();
      if (!cancelled) setPresence((data as any) || null);
    };
    fetchOne();

    const channel = supabase
      .channel(`music-presence:${authUserId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'live_music_presence',
        filter: `user_id=eq.${authUserId}`,
      }, (payload) => {
        if (cancelled) return;
        if (payload.eventType === 'DELETE') setPresence(null);
        else setPresence((payload.new as any) ?? null);
      })
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [authUserId]);

  return presence;
}
