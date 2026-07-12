import { useQuery } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { friendshipPairId } from '@/lib/friendProfilePair';

export interface SharedContentRow {
  id: string;
  pair_id: string;
  shared_by: string;
  content_type: string;
  content_id: string;
  title?: string | null;
  thumbnail_url?: string | null;
  created_at?: string;
}

export function useSharedWithFriend(
  otherProfileId: string | undefined,
  contentType?: string,
) {
  const profileId = useAuthProfileId();
  const pairId =
    profileId && otherProfileId ? friendshipPairId(profileId, otherProfileId) : null;

  return useQuery({
    queryKey: ['shared-content', pairId, contentType ?? 'all'],
    queryFn: async (): Promise<SharedContentRow[]> => {
      if (!pairId) return [];
      let q = db.from('shared_content_index').select('*').eq('pair_id', pairId);
      if (contentType) q = q.eq('content_type', contentType);
      const { data, error } = await q.order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return (data || []) as SharedContentRow[];
    },
    enabled: !!pairId,
    staleTime: 30_000,
  });
}
