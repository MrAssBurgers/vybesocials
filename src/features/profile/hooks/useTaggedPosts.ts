import { useSocialPostList } from '@/hooks/useSocialPostList';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
  const query = useSocialPostList({ scope: 'tagged', targetId: profileId }, !!profileId);
  return { ...query, data: query.data?.map(post => ({ ...post, post_id: post.id })) };
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
