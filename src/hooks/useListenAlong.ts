import { useState, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import { toast } from '@/hooks/use-toast';
import type { LiveMusicPresence } from '@/hooks/useLiveMusicPresence';

/**
 * Triggers Spotify playback of someone else's currently-playing track on
 * the signed-in user's active Spotify device, starting at their current
 * position. Requires Spotify Premium + an active device.
 */
export function useListenAlong() {
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);

  const listenAlong = useCallback(async (presence: Pick<LiveMusicPresence, 'user_id' | 'provider' | 'track_id' | 'title'> | null | undefined) => {
    if (pending.current) return;
    if (!presence?.track_id || !presence.user_id || presence.provider !== 'spotify') {
      toast({ title: 'Nothing playing', description: 'Wait for them to start a song.' });
      return;
    }
    pending.current = true;
    setLoading(true);
    try {
      const { data, error } = await db.functions.invoke('spotify-listen-along', {
        // Presence stores profiles.user_id (Firebase Auth UID). The server
        // verifies friendship/privacy and fetches the friend's current track.
        body: { friend_id: presence.user_id },
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
      if (data?.needs_reconnect) {
        toast({ title: 'Reconnect Spotify', description: 'Reconnect Spotify in Settings to renew playback permission.' });
        return;
      }
      if (data?.premium_required) {
        toast({ title: 'Spotify Premium required', description: 'Listen-along uses Spotify playback control.', variant: 'destructive' });
        return;
      }
      if (data?.error) {
        const err = String(data.error);
        if (err === 'friend_not_connected') {
          toast({ title: 'Friend’s Spotify is disconnected', description: 'They need to reconnect Spotify before you can listen along.' });
        } else if (err === 'sharing_disabled') {
          toast({ title: 'Listening activity is private', description: 'This friend is not sharing their music right now.' });
        } else if (err === 'cannot_listen_along_self') {
          toast({ title: 'This is your own music', description: 'Choose a friend’s Spotify activity to listen along.' });
        } else if (/503|Service Unavailable|temporarily unavailable/i.test(err)) {
          toast({
            title: 'Spotify is busy',
            description: 'Spotify’s servers are slow right now — try again in a moment.',
          });
        } else {
          toast({ title: 'Spotify error', description: err, variant: 'destructive' });
        }
        return;
      }
      if (data?.ok === true && data?.listening === false) {
        toast({ title: 'Nothing playing', description: 'Your friend is not playing a song right now.' });
        return;
      }
      if (data?.ok !== true || data?.listening !== true) {
        toast({ title: 'Listen-along failed', description: 'Spotify did not confirm playback. Please try again.', variant: 'destructive' });
        return;
      }
      toast({ title: 'Listening along 🎧', description: presence.title ?? 'Synced to their track' });
    } catch (e: any) {
      const msg = e?.message || 'Could not start playback';
      if (msg.includes('Premium')) {
        toast({ title: 'Spotify Premium required', description: 'Listen-along uses Spotify playback control.', variant: 'destructive' });
      } else if (/503|Service Unavailable/i.test(msg)) {
        toast({
          title: 'Spotify is busy',
          description: 'Spotify’s servers are slow right now — try again in a moment.',
        });
      } else {
        toast({ title: 'Listen-along failed', description: msg, variant: 'destructive' });
      }
    } finally {
      pending.current = false;
      setLoading(false);
    }
  }, []);

  return { listenAlong, loading };
}
