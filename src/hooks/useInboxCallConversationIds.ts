import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

/** Conversation IDs with recent call activity for the Calls inbox tab. */
export function useInboxCallConversationIds() {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['inbox-call-conversations', profileId],
    enabled: !!profileId,
    queryFn: async (): Promise<Set<string>> => {
      if (!profileId) return new Set();

      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await db
        .from('calls')
        .select('conversation_id, created_at')
        .or(`caller_id.eq.${profileId},receiver_id.eq.${profileId}`)
        .gte('created_at', weekAgo)
        .order('created_at', { ascending: false })
        .limit(80);

      if (error) {
        console.warn('[useInboxCallConversationIds]', error);
        return new Set();
      }

      const ids = new Set<string>();
      for (const row of data ?? []) {
        const cid = (row as { conversation_id?: string }).conversation_id;
        if (cid) ids.add(cid);
      }
      return ids;
    },
    staleTime: 60_000,
  });
}
