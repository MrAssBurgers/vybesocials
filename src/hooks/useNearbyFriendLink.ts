import { useCallback, useEffect, useRef, useState } from 'react';
import { db } from '@/lib/firebase';
import { setDocument, deleteDocument } from '@/lib/firebase/firestoreDb';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { haptics } from '@/lib/haptics';
import {
  getCoarsePosition,
  isPresenceFresh,
  nearbyCellForPosition,
  nearbyCellsAround,
  NEARBY_HEARTBEAT_MS,
  NEARBY_PEER_POLL_MS,
  NEARBY_STALE_MS,
  stopFriendLinkNativeGps,
  type NearbyPresence,
} from '@/lib/friendLinkNearby';

export interface NearbyFriendPeer {
  peerId: string;
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export type NearbyFriendStatus =
  | 'idle'
  | 'locating'
  | 'searching'
  | 'denied'
  | 'unavailable'
  | 'error';

interface UseNearbyFriendLinkOptions {
  enabled: boolean;
  profileId: string | null | undefined;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

function toPeer(presence: NearbyPresence): NearbyFriendPeer {
  return {
    peerId: presence.user_id,
    userId: presence.user_id,
    username: presence.username || 'vyber',
    displayName: presence.display_name || presence.username || 'vyber',
    avatarUrl: presence.avatar_url ?? null,
  };
}

/**
 * AirDrop-style nearby discovery over Firestore presence docs.
 * Publishes this phone's presence in a coarse location cell and streams
 * everyone else broadcasting in the same/adjacent cells.
 */
export function useNearbyFriendLink({
  enabled,
  profileId,
  username,
  displayName,
  avatarUrl,
}: UseNearbyFriendLinkOptions): {
  peers: NearbyFriendPeer[];
  status: NearbyFriendStatus;
  retry: () => void;
} {
  const [peers, setPeers] = useState<NearbyFriendPeer[]>([]);
  const [status, setStatus] = useState<NearbyFriendStatus>('idle');
  const [attempt, setAttempt] = useState(0);

  // Identity in refs so the session effect doesn't restart on profile refetches.
  const identityRef = useRef({ username, displayName, avatarUrl });
  identityRef.current = { username, displayName, avatarUrl };

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled || !profileId) {
      setPeers([]);
      setStatus('idle');
      return;
    }

    let cancelled = false;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let sweep: ReturnType<typeof setInterval> | null = null;
    let peerPoll: ReturnType<typeof setInterval> | null = null;
    let channel: ReturnType<typeof subscribePostgresChannel> | null = null;
    const presenceMap = new Map<string, NearbyPresence>();

    const emitPeers = () => {
      if (cancelled) return;
      const now = Date.now();
      const fresh = [...presenceMap.values()].filter(
        (p) => p.user_id !== profileId && isPresenceFresh(p, now),
      );
      setPeers(fresh.map(toPeer));
    };

    const upsertPresence = (raw: Record<string, unknown>) => {
      const presence = raw as unknown as NearbyPresence;
      if (!presence?.user_id || presence.user_id === profileId) return;
      const isNew = !presenceMap.has(presence.user_id);
      presenceMap.set(presence.user_id, presence);
      if (isNew && isPresenceFresh(presence)) haptics.impact();
      emitPeers();
    };

    const writeOwnPresence = async (cell: string) => {
      const identity = identityRef.current;
      const now = Date.now();
      await setDocument('friend_link_nearby', profileId, {
        id: profileId,
        user_id: profileId,
        username: identity.username || 'vyber',
        display_name: identity.displayName ?? null,
        avatar_url: identity.avatarUrl ?? null,
        cell,
        updated_at: new Date(now).toISOString(),
        expires_at: new Date(now + NEARBY_STALE_MS).toISOString(),
      });
    };

    const run = async () => {
      setStatus('locating');
      setPeers([]);

      const position = await getCoarsePosition();
      if (cancelled) return;
      if ('error' in position) {
        setStatus(position.error);
        return;
      }

      const ownCell = nearbyCellForPosition(position.lat, position.lng);
      const cells = nearbyCellsAround(position.lat, position.lng);

      try {
        await writeOwnPresence(ownCell);
        // #region agent log
        import('@/lib/friendLinkDebug').then(({ dbgFriendLink }) =>
          dbgFriendLink('H4', 'useNearbyFriendLink.ts', 'presence_published', {
            cellLen: ownCell.length,
            cells: cells.length,
          }),
        );
        // #endregion
      } catch (err) {
        console.warn('[NearbyFriendLink] presence write failed:', err);
        if (!cancelled) setStatus('error');
        return;
      }
      if (cancelled) return;

      setStatus('searching');

      heartbeat = setInterval(() => {
        void writeOwnPresence(ownCell).catch(() => {});
      }, NEARBY_HEARTBEAT_MS);

      // Peers that stop heartbeating fade out even without a DELETE event.
      sweep = setInterval(emitPeers, 15_000);

      channel = subscribePostgresChannel(
        `friend-link-nearby-${profileId}`,
        cells.map((cell) => ({
          event: '*' as const,
          table: 'friend_link_nearby',
          filter: `cell=eq.${cell}`,
          callback: (payload) => {
            if (payload.eventType === 'DELETE') {
              const gone = payload.old as { user_id?: string } | undefined;
              if (gone?.user_id && gone.user_id !== profileId) {
                presenceMap.delete(gone.user_id);
                emitPeers();
              }
              return;
            }
            upsertPresence(payload.new as Record<string, unknown>);
          },
        })),
      );

      const refreshPeersFromServer = async () => {
        try {
          const { data } = await db
            .from('friend_link_nearby')
            .select('*')
            .in('cell', cells);
          if (cancelled) return;
          const seen = new Set<string>();
          for (const row of (data as NearbyPresence[] | null) ?? []) {
            if (!row.user_id || row.user_id === profileId || !isPresenceFresh(row)) continue;
            presenceMap.set(row.user_id, row);
            seen.add(row.user_id);
          }
          for (const id of [...presenceMap.keys()]) {
            if (!seen.has(id)) presenceMap.delete(id);
          }
          emitPeers();
          // #region agent log
          import('@/lib/friendLinkDebug').then(({ dbgFriendLink }) =>
            dbgFriendLink('H4', 'useNearbyFriendLink.ts', 'peer_poll', {
              peers: presenceMap.size,
              cells: cells.length,
            }),
          );
          // #endregion
        } catch (err) {
          console.warn('[NearbyFriendLink] peer poll failed:', err);
        }
      };

      // Realtime skips the bootstrap snapshot — seed + poll so both phones connect.
      await refreshPeersFromServer();
      peerPoll = setInterval(() => {
        void refreshPeersFromServer();
      }, NEARBY_PEER_POLL_MS);
    };

    void run();

    return () => {
      cancelled = true;
      if (heartbeat) clearInterval(heartbeat);
      if (sweep) clearInterval(sweep);
      if (peerPoll) clearInterval(peerPoll);
      if (channel) removeRealtimeChannel(channel);
      void deleteDocument('friend_link_nearby', profileId).catch(() => {});
      stopFriendLinkNativeGps();
    };
  }, [enabled, profileId, attempt]);

  return { peers, status, retry };
}
