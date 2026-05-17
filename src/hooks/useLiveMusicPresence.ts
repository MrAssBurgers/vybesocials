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
  tempo: number | null;
  energy: number | null;
  updated_at: string;
}

/**
 * Shared subscription registry — every consumer for the same authUserId
 * piggybacks on a single Realtime channel + initial fetch. This keeps the
 * preview tab from opening dozens of channels (one per rendered avatar),
 * which was filling the database connection slots.
 */
type Listener = (p: LiveMusicPresence | null) => void;

interface Entry {
  channel: ReturnType<typeof supabase.channel>;
  listeners: Set<Listener>;
  latest: LiveMusicPresence | null;
  refCount: number;
}

const registry = new Map<string, Entry>();

function subscribe(authUserId: string, listener: Listener): () => void {
  let entry = registry.get(authUserId);

  if (!entry) {
    const channel = supabase
      .channel(`music-presence:${authUserId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'live_music_presence',
        filter: `user_id=eq.${authUserId}`,
      }, (payload) => {
        const e = registry.get(authUserId);
        if (!e) return;
        const next = payload.eventType === 'DELETE' ? null : ((payload.new as any) ?? null);
        e.latest = next;
        e.listeners.forEach((l) => l(next));
      })
      .subscribe();

    entry = { channel, listeners: new Set(), latest: null, refCount: 0 };
    registry.set(authUserId, entry);

    // initial fetch once per shared entry
    supabase
      .from('live_music_presence')
      .select('*')
      .eq('user_id', authUserId)
      .maybeSingle()
      .then(({ data }) => {
        const e = registry.get(authUserId);
        if (!e) return;
        e.latest = (data as any) || null;
        e.listeners.forEach((l) => l(e.latest));
      });
  }

  entry.listeners.add(listener);
  entry.refCount += 1;
  // hand over current value synchronously if we already have one
  if (entry.latest !== null) listener(entry.latest);

  return () => {
    const e = registry.get(authUserId);
    if (!e) return;
    e.listeners.delete(listener);
    e.refCount -= 1;
    if (e.refCount <= 0) {
      supabase.removeChannel(e.channel);
      registry.delete(authUserId);
    }
  };
}

/**
 * Subscribe to a user's live music presence. Pass the auth user id
 * (profiles.user_id), NOT profiles.id.
 */
/**
 * Optimistically push a presence row into the shared registry — used by
 * `useSpotifyPresence` so the signed-in user sees their own track changes
 * the instant polling returns, without waiting for the Realtime round-trip.
 */
export function setLocalPresence(authUserId: string, payload: Partial<LiveMusicPresence> | null) {
  const entry = registry.get(authUserId);
  const next = payload
    ? ({ ...(entry?.latest ?? {}), ...payload, user_id: authUserId, updated_at: new Date().toISOString() } as LiveMusicPresence)
    : null;
  if (!entry) {
    // No subscribers yet — stash so the next subscribe() hand-off sees it
    registry.set(authUserId, {
      channel: null as any,
      listeners: new Set(),
      latest: next,
      refCount: 0,
    });
    return;
  }
  entry.latest = next;
  entry.listeners.forEach((l) => l(next));
}

export function useLiveMusicPresence(authUserId: string | null | undefined) {
  const [presence, setPresence] = useState<LiveMusicPresence | null>(null);

  useEffect(() => {
    if (!authUserId) { setPresence(null); return; }
    const unsub = subscribe(authUserId, setPresence);
    return unsub;
  }, [authUserId]);

  return presence;
}
