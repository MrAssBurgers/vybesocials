import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useReportAccountSession } from '@/hooks/useReportAccountSession';
import { getDocumentsFromServer, where, firestoreLimit } from '@/lib/firebase/firestoreDb';
import { tokenAccountGuard } from '@/lib/tokenMarketplaceService';

export interface DNAContentPreferences {
  boost_topics: string[]; reduce_topics: string[];
  preferred_content_types?: string[]; discovery_level?: 'conservative' | 'balanced' | 'adventurous';
}
export function useDNAPreferences() {
  const { user, profile } = useAuth(); const session = useReportAccountSession();
  const uid = user?.id, ready = !!uid && profile?.user_id === uid && session.uid === uid;
  const query = useQuery({
    queryKey: ['dna-content-preferences', uid, session.epoch, profile?.id],
    queryFn: async ({ signal }): Promise<DNAContentPreferences | null> => {
      const guard = tokenAccountGuard(uid); guard();
      const rows = await getDocumentsFromServer<Record<string, unknown>>('dna_content_preferences', [where('user_id', '==', uid!), firestoreLimit(2)]);
      guard(); if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (rows.length > 1 || rows.some(row => row.user_id !== uid)) throw new Error('Feed preferences could not be verified.');
      const row = rows[0]; if (!row) return null;
      const topics = (value: unknown) => {
        if (value === undefined) return [];
        if (!Array.isArray(value) || value.length > 10 || value.some(topic => typeof topic !== 'string' || topic.length > 40)) throw new Error('Feed preferences need review.');
        return value as string[];
      };
      return { boost_topics: topics(row.boost_topics), reduce_topics: topics(row.reduce_topics) };
    }, enabled: ready, staleTime: 0, gcTime: 0, refetchInterval: 30_000, retry: false,
  });
  useEffect(() => {
    const changed = (event: Event) => { if ((event as CustomEvent<string>).detail === uid) void query.refetch(); };
    window.addEventListener('vybeDnaAdaptationCleared', changed);
    return () => { window.removeEventListener('vybeDnaAdaptationCleared', changed); };
  }, [uid, query.refetch]);
  return { ...query, data: ready && !query.isError && !query.isFetching ? query.data : undefined };
}
