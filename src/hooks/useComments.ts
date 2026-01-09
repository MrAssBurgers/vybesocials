import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { filterBlockedContent, containsBlockedContent } from '@/lib/contentModeration';
import { moderateContent } from '@/hooks/useModeration';
import { toast } from 'sonner';

interface Comment {
  id: string;
  text: string;
  image_url: string | null;
  created_at: string;
  user: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

export function useComments(postId: string) {
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
          user:profiles!user_id (
            id,
            username,
            avatar_url
          )
        `)
        .eq('post_id', postId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      return (data || []).map(comment => ({
        ...comment,
        text: filterBlockedContent(comment.text),
        image_url: comment.image_url,
        user: comment.user as unknown as { id: string; username: string; avatar_url: string | null },
      }));
    },
    enabled: !!postId,
  });
}

export function useCreateComment() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

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

      const { data, error } = await supabase
        .from('comments')
        .insert({
          user_id: profile.id,
          post_id: postId,
          text: filteredText,
          image_url: imageUrl || null,
        })
        .select()
        .single();

      if (error) throw error;

      // Create notification
      if (authorId !== profile.id) {
        await supabase.from('notifications').insert({
          user_id: authorId,
          type: 'comment',
          actor_id: profile.id,
          post_id: postId,
        });
      }

      // Run AI moderation in background (non-blocking)
      if (filteredText.trim()) {
        moderateContent(filteredText, 'comment', data.id).then(result => {
          if (result.requires_review) {
            console.log('Comment flagged for review:', data.id);
          }
        }).catch(console.error);
      }

      return data;
    },
    onSuccess: (_, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}

export function useDeleteComment() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ commentId, postId }: { commentId: string; postId: string }) => {
      if (!profile) throw new Error('Not authenticated');

      // Verify the comment belongs to the user
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
