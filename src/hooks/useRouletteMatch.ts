import { useState, useEffect, useCallback, useRef } from 'react';
import { db } from '@/lib/firebase';
import { subscribePostgresChannel, removeRealtimeChannel } from '@/lib/realtimeChannel';
import { useAuth } from '@/lib/auth';

export type RouletteMode = 'text' | 'video' | 'audio';
export type RouletteStatus = 'idle' | 'searching' | 'matched' | 'ended';

export interface RouletteMatch {
  id: string;
  user_a: string;
  user_b: string;
  mode: string;
  shared_interests: string[];
  status: string;
  conversation_id: string | null;
  started_at: string;
  partner?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export function useRouletteMatch() {
  const { user, profile } = useAuth();
  const [status, setStatus] = useState<RouletteStatus>('idle');
  const [match, setMatch] = useState<RouletteMatch | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);
  const channelRef = useRef<any>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      if (channelRef.current) removeRealtimeChannel(channelRef.current);
      // Remove from queue on unmount
      if (user?.id) {
        db.from('roulette_queue' as any).delete().eq('user_id', user.id);
      }
    };
  }, [user?.id]);

  const findMatch = useCallback(async (mode: RouletteMode = 'text', interests: string[] = []) => {
    if (!user?.id) return;
    
    setStatus('searching');
    setError(null);
    setMatch(null);

    try {
      const { data, error: rpcError } = await db.rpc('find_roulette_match', {
        p_mode: mode,
        p_interests: interests,
      });

      if (rpcError) throw rpcError;

      if (data) {
        // Matched immediately
        const partnerId = (data as any).user_a === user.id ? (data as any).user_b : (data as any).user_a;
        const { data: partnerProfile } = await db
          .from('profiles')
          .select('id, username, avatar_url, display_name')
          .eq('id', partnerId)
          .single();

        setMatch({ ...(data as any), partner: partnerProfile });
        setStatus('matched');
        return;
      }

      const handleMatch = async (m: any) => {
        const partnerId = m.user_a === user.id ? m.user_b : m.user_a;
        const { data: partnerProfile } = await db
          .from('profiles')
          .select('id, username, avatar_url, display_name')
          .eq('id', partnerId)
          .single();
        setMatch({ ...m, partner: partnerProfile });
        setStatus('matched');
      };

      const channel = subscribePostgresChannel(`roulette-${user.id}`, [
        {
          event: 'INSERT',
          table: 'roulette_matches',
          filter: `user_a=eq.${user.id}`,
          callback: async (payload) => {
            await handleMatch(payload.new as any);
          },
        },
        {
          event: 'INSERT',
          table: 'roulette_matches',
          filter: `user_b=eq.${user.id}`,
          callback: async (payload) => {
            await handleMatch(payload.new as any);
          },
        },
      ]);

      channelRef.current = channel;

      // Also poll every 5s as fallback
      pollingRef.current = setInterval(async () => {
        const { data: pollData } = await db.rpc('find_roulette_match', {
          p_mode: mode,
          p_interests: interests,
        });
        if (pollData) {
          const partnerId = (pollData as any).user_a === user.id ? (pollData as any).user_b : (pollData as any).user_a;
          const { data: partnerProfile } = await db
            .from('profiles')
            .select('id, username, avatar_url, display_name')
            .eq('id', partnerId)
            .single();
          setMatch({ ...(pollData as any), partner: partnerProfile });
          setStatus('matched');
          if (pollingRef.current) clearInterval(pollingRef.current);
          if (channelRef.current) removeRealtimeChannel(channelRef.current);
        }
      }, 5000);

    } catch (err: any) {
      setError(err.message);
      setStatus('idle');
    }
  }, [user?.id]);

  const cancelSearch = useCallback(async () => {
    if (pollingRef.current) clearInterval(pollingRef.current);
    if (channelRef.current) removeRealtimeChannel(channelRef.current);
    if (user?.id) {
      await db.from('roulette_queue' as any).delete().eq('user_id', user.id);
    }
    setStatus('idle');
    setMatch(null);
  }, [user?.id]);

  const endMatch = useCallback(async () => {
    if (match?.id) {
      await db
        .from('roulette_matches' as any)
        .update({ status: 'ended', ended_at: new Date().toISOString() } as any)
        .eq('id', match.id);
    }
    setStatus('ended');
    setTimeout(() => {
      setMatch(null);
      setStatus('idle');
    }, 500);
  }, [match?.id]);

  const skipToNext = useCallback(async (mode: RouletteMode = 'text', interests: string[] = []) => {
    await endMatch();
    setTimeout(() => findMatch(mode, interests), 600);
  }, [endMatch, findMatch]);

  return {
    status,
    match,
    error,
    findMatch,
    cancelSearch,
    endMatch,
    skipToNext,
  };
}
