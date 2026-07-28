import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import type { InboxCallSummary } from '@/features/dms/dm.types';
import { normalizePersistedMap } from '@/lib/persistedCollections';

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
      // Firestore rules cannot prove that a collection-wide fetch plus a
      // client-side `.or()` contains only this user's calls. Two constrained
      // queries keep call history secure and avoid permission warnings.
      const [asCaller, asReceiver] = await Promise.all([
        db
          .from('calls')
          .select('id, conversation_id, created_at, call_type, status')
          .eq('caller_id', profileId)
          .gte('created_at', weekAgo)
          .order('created_at', { ascending: false })
          .limit(80),
        db
          .from('calls')
          .select('id, conversation_id, created_at, call_type, status')
          .eq('receiver_id', profileId)
          .gte('created_at', weekAgo)
          .order('created_at', { ascending: false })
          .limit(80),
      ]);

      const errors = [asCaller.error, asReceiver.error].filter(Boolean);
      if (errors.length) {
        console.warn(
          '[useInboxCallSummaries]',
          errors.map((error) => error?.message || 'Call history query failed').join('; '),
        );
      }

      const data = [...(asCaller.data ?? []), ...(asReceiver.data ?? [])]
        .filter((row, index, rows) => {
          const id = String((row as { id?: string }).id || '');
          return !id || rows.findIndex(
            (candidate) => String((candidate as { id?: string }).id || '') === id,
          ) === index;
        })
        .sort((a, b) => String((b as { created_at?: string }).created_at || '').localeCompare(
          String((a as { created_at?: string }).created_at || ''),
        ))
        .slice(0, 80);

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
    select: (data) => normalizePersistedMap<InboxCallSummary>(data),
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
