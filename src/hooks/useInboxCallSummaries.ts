import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import type { InboxCallSummary } from '@/features/dms/dm.types';

export type InboxCallSummariesMap = Map<string, InboxCallSummary>;

/** Per-conversation call metadata for the Calls inbox category (7-day window). */
export function useInboxCallSummaries() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['inbox-call-summaries', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<InboxCallSummariesMap> => {
      if (!profileId) return new Map();

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await db
        .from('calls')
        .select('conversation_id, created_at, call_type, status')
        .or(`caller_id.eq.${profileId},receiver_id.eq.${profileId}`)
        .gte('created_at', weekAgo)
        .order('created_at', { ascending: false })
        .limit(80);

      if (error) {
        console.warn('[useInboxCallSummaries]', error);
        return new Map();
      }

      const map = new Map<string, InboxCallSummary>();
      for (const row of data ?? []) {
        const cid = (row as { conversation_id?: string }).conversation_id;
        if (!cid || map.has(cid)) continue;
        map.set(cid, {
          callType: String((row as { call_type?: string }).call_type || 'audio'),
          status: String((row as { status?: string }).status || 'completed'),
          at: String((row as { created_at?: string }).created_at || ''),
        });
      }
      return map;
    },
    staleTime: 60_000,
  });
}

/** @deprecated Use useInboxCallSummaries — conversation id set only. */
export function useInboxCallConversationIds() {
  const query = useInboxCallSummaries();
  const ids = new Set<string>();
  if (query.data) {
    for (const id of query.data.keys()) ids.add(id);
  }
  return {
    ...query,
    data: ids,
  };
}
