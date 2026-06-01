import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { filterBlockedContent, containsBlockedContent } from '@/lib/contentModeration';
import { scanText as nsfwScanText } from '@/lib/nsfwScanner';
import { moderateContent } from '@/hooks/useModeration';
import { toast } from 'sonner';
import { useBumpReactionStreak } from './useReactionStreaks';
import { useTokenReward } from './useVybeTokens';

interface Comment {
  id: string;
  text: string;
  image_url: string | null;
  created_at: string;
  is_flagged?: boolean;
  safety_score?: number;
  safety_categories?: string[];
  like_count?: number;
  is_liked?: boolean;
  user: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

export function useComments(postId: string) {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['comments', postId],
    queryFn: async (): Promise<Comment[]> => {
      const { data, error } = await supabase
        .from('comments')
        .select(`
          id,
          text,
          image_url,
          created_at,
          is_flagged,
          safety_score,
          safety_categories,
          user:profiles!user_id (
            id,
            username,
            avatar_url
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      // Fetch like counts and user's likes in parallel
      const commentIds = (data || []).map(c => c.id);
      const likeCounts: Record<string, number> = {};
      const userLikes: Set<string> = new Set();

      if (commentIds.length > 0) {
        const [countsRes, userLikesRes] = await Promise.all([
          (supabase as any).from('comment_likes').select('comment_id').in('comment_id', commentIds),
          profile
            ? (supabase as any).from('comment_likes').select('comment_id').eq('user_id', profile.id).in('comment_id', commentIds)
            : Promise.resolve({ data: [] }),
        ]);

        // Count likes per comment
        for (const row of (countsRes.data || [])) {
          likeCounts[row.comment_id] = (likeCounts[row.comment_id] || 0) + 1;
        }
        for (const row of (userLikesRes.data || [])) {
          userLikes.add(row.comment_id);
        }
      }

      return (data || []).map(comment => ({
        ...comment,
        text: filterBlockedContent(comment.text),
        image_url: comment.image_url,
        is_flagged: comment.is_flagged ?? false,
        safety_score: comment.safety_score ?? 0,
        safety_categories: comment.safety_categories ?? [],
        like_count: likeCounts[comment.id] || 0,
        is_liked: userLikes.has(comment.id),
        user: comment.user as unknown as { id: string; username: string; avatar_url: string | null },
      }));
    },
    enabled: !!postId,
  });
}

export function useCreateComment() {
  const { profile, user } = useAuth();
  const queryClient = useQueryClient();
  const bumpStreak = useBumpReactionStreak();
  const { rewardComment } = useTokenReward();

  return useMutation({
    mutationFn: async ({ postId, text, authorId, imageUrl }: { postId: string; text: string; authorId: string; imageUrl?: string }) => {
      if (!profile) throw new Error('Not authenticated');

      // Check for blocked content before submitting
      const check = containsBlockedContent(text);
      if (check.blocked) {
        toast.error('Your comment contains inappropriate content. Please revise.');
        throw new Error('Comment contains blocked content');
      }

      const filteredText = filterBlockedContent(text);

      // Run AI safety scan on the comment text before inserting
      let isFlagged = false;
      let safetyScore = 0;
      let safetyCategories: string[] = [];

      if (filteredText.trim()) {
        try {
          const scanResult = nsfwScanText(filteredText);

          safetyScore = scanResult.score ?? 0;
          safetyCategories = scanResult.categories ?? [];
          
          if (scanResult.result === 'blocked') {
            toast.error(scanResult.message || 'This comment violates community guidelines.');
            throw new Error('Comment blocked by safety check');
          }
          
          if (scanResult.result === 'warned') {
            isFlagged = true;
          }
        } catch (err: any) {
          if (err.message === 'Comment blocked by safety check') throw err;
          console.warn('Safety scan failed, allowing comment:', err);
        }
      }

      const { data, error } = await supabase
        .from('comments')
        .insert({
          user_id: profile.id,
          post_id: postId,
          text: filteredText,
          image_url: imageUrl || null,
          is_flagged: isFlagged,
          safety_score: safetyScore,
          safety_categories: safetyCategories,
        })
        .select()
        .single();

      if (error) throw error;

      // Create notification + bump reaction streak (best-effort — must NEVER
      // fail the comment mutation, otherwise the composer keeps the GIF/text
      // and the user thinks "send didn't work" even though the row inserted).
      if (authorId && authorId !== profile.id) {
        try {
          await supabase.from('notifications').insert({
            user_id: authorId,
            type: 'comment',
            actor_id: profile.id,
            post_id: postId,
          });
        } catch (notifErr) {
          console.warn('comment notification insert failed (non-fatal):', notifErr);
        }

        // Bump reaction streak with post author (fire and forget)
        try { bumpStreak.mutate(authorId); } catch { /* ignore */ }
      }

      // Run additional AI moderation in background (non-blocking)
      if (filteredText.trim()) {
        moderateContent(filteredText, 'comment', data.id).then(result => {
          if (result.requires_review) {
            // Update the flag status if moderation catches something
            supabase.from('comments').update({ is_flagged: true }).eq('id', data.id).then(() => {});
          }
        }).catch(console.error);
      }

      return data;
    },
    onSuccess: (_, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      // Reward tokens for commenting
      rewardComment();
    },
  });
}

export function useDeleteComment() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commentId, postId }: { commentId: string; postId: string }) => {
      if (!profile) throw new Error('Not authenticated');

      const { data: comment, error: fetchError } = await supabase
        .from('comments')
        .select('user_id')
        .eq('id', commentId)
        .single();

      if (fetchError) throw fetchError;
      if (comment.user_id !== profile.id) {
        throw new Error('You can only delete your own comments');
      }

      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);

      if (error) throw error;
      return { postId };
    },
    onSuccess: ({ postId }) => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Comment deleted');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to delete comment');
    },
  });
}

export function useEditComment() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commentId, postId, text }: { commentId: string; postId: string; text: string }) => {
      if (!profile) throw new Error('Not authenticated');

      const check = containsBlockedContent(text);
      if (check.blocked) {
        toast.error('Your comment contains inappropriate content. Please revise.');
        throw new Error('Comment contains blocked content');
      }

      const filteredText = filterBlockedContent(text);

      const { error } = await supabase
        .from('comments')
        .update({ text: filteredText })
        .eq('id', commentId)
        .eq('user_id', profile.id);

      if (error) throw error;
      return { postId };
    },
    onSuccess: ({ postId }) => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      toast.success('Comment updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update comment');
    },
  });
}
