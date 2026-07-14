import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

export interface PostUserTag {
  id: string;
  post_id: string;
  tagged_user_id: string;
  tagged_by: string;
  created_at?: string;
}

export interface TaggedPostPreview {
  id: string;
  post_id: string;
  media_url?: string | null;
  thumbnail_url?: string | null;
  type?: string | null;
  created_at?: string;
}

/**
 * Lean post↔user tags. Doc shape: post_user_tags/{id}
 * Fields: post_id, tagged_user_id, tagged_by, created_at
 */
export function useTaggedPosts(profileId: string | undefined) {
  return useQuery({
    queryKey: ['tagged-posts', profileId],
    queryFn: async (): Promise<TaggedPostPreview[]> => {
      if (!profileId) return [];
      const { data: tags, error } = await db
        .from('post_user_tags')
        .select('id, post_id, tagged_user_id, tagged_by, created_at')
        .eq('tagged_user_id', profileId)
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) {
        console.warn('[useTaggedPosts]', error.message);
        return [];
      }
      const rows = (tags || []) as PostUserTag[];
      if (!rows.length) return [];

      const postIds = [...new Set(rows.map((r) => r.post_id).filter(Boolean))];
      const posts: TaggedPostPreview[] = [];
      for (let i = 0; i < postIds.length; i += 10) {
        const chunk = postIds.slice(i, i + 10);
        const { data: batch } = await db
          .from('posts')
          .select('id, media_url, thumbnail_url, type, created_at')
          .in('id', chunk);
        for (const p of batch || []) {
          posts.push({
            id: String((p as { id: string }).id),
            post_id: String((p as { id: string }).id),
            media_url: (p as { media_url?: string }).media_url ?? null,
            thumbnail_url: (p as { thumbnail_url?: string }).thumbnail_url ?? null,
            type: (p as { type?: string }).type ?? null,
            created_at: (p as { created_at?: string }).created_at,
          });
        }
      }

      const byId = new Map(posts.map((p) => [p.post_id, p]));
      return rows
        .map((tag) => byId.get(tag.post_id))
        .filter((p): p is TaggedPostPreview => !!p);
    },
    enabled: !!profileId,
    staleTime: 60_000,
  });
}

export function useTagUsersOnPost() {
  const profileId = useAuthProfileId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { postId: string; taggedUserIds: string[] }) => {
      if (!profileId) throw new Error('Not signed in');
      const now = new Date().toISOString();
      const unique = [...new Set(input.taggedUserIds.filter(Boolean))];
      for (const taggedUserId of unique) {
        const docId = `${input.postId}_${taggedUserId}`;
        const { error } = await db.from('post_user_tags').upsert({
          id: docId,
          post_id: input.postId,
          tagged_user_id: taggedUserId,
          tagged_by: profileId,
          created_at: now,
        });
        if (error) throw error;
      }
      return unique;
    },
    onSuccess: (_data, vars) => {
      for (const id of vars.taggedUserIds) {
        void qc.invalidateQueries({ queryKey: ['tagged-posts', id] });
      }
    },
  });
}
