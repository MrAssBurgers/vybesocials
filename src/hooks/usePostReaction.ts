import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import type { ReactionType } from '@/lib/reactions';
import {
  patchReactionInFeedCaches,
  removePostReaction,
  savePostReaction,
} from '@/lib/postReactions';
import { toast } from 'sonner';

interface PostReactionSource {
  id: string;
  is_liked: boolean;
  like_count: number;
  reaction_type?: string | null;
  author: { id: string };
}

export function usePostReaction(post: PostReactionSource) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [isLiked, setIsLiked] = useState(post.is_liked);
  const [currentReaction, setCurrentReaction] = useState<ReactionType | null>(
    post.is_liked ? ((post.reaction_type as ReactionType) || 'like') : null,
  );
  const [likeCount, setLikeCount] = useState(post.like_count);

  useEffect(() => {
    setIsLiked(post.is_liked);
    setCurrentReaction(
      post.is_liked ? ((post.reaction_type as ReactionType) || 'like') : null,
    );
    setLikeCount(post.like_count);
  }, [post.id, post.is_liked, post.reaction_type, post.like_count]);

  const handleReaction = useCallback(
    async (reactionType: ReactionType | null) => {
      if (!profile?.id) return;

      const wasLiked = currentReaction !== null;
      const newIsLiked = reactionType !== null;
      const prevReaction = currentReaction;
      const prevIsLiked = isLiked;
      const prevLikeCount = likeCount;

      setCurrentReaction(reactionType);
      setIsLiked(newIsLiked);
      setLikeCount((prev) => {
        if (wasLiked && !newIsLiked) return prev - 1;
        if (!wasLiked && newIsLiked) return prev + 1;
        return prev;
      });
      patchReactionInFeedCaches(queryClient, post.id, reactionType);

      try {
        if (newIsLiked && reactionType) {
          await savePostReaction({
            userId: profile.id,
            postId: post.id,
            reactionType,
          });

          if (!wasLiked && post.author.id !== profile.id) {
            await db.from('notifications').insert({
              user_id: post.author.id,
              type: 'like',
              actor_id: profile.id,
              post_id: post.id,
            });
          }
        } else {
          await removePostReaction(profile.id, post.id);
        }
      } catch (error) {
        console.error('[usePostReaction] failed:', error);
        setCurrentReaction(prevReaction);
        setIsLiked(prevIsLiked);
        setLikeCount(prevLikeCount);
        patchReactionInFeedCaches(queryClient, post.id, prevReaction);
        toast.error("Couldn't save reaction — try again");
      }
    },
    [
      profile?.id,
      currentReaction,
      isLiked,
      likeCount,
      post.id,
      post.author.id,
      queryClient,
    ],
  );

  return {
    isLiked,
    currentReaction,
    likeCount,
    setLikeCount,
    handleReaction,
  };
}
