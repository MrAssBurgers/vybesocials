import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

interface Comment {
  id: string;
  text: string;
  created_at: string;
  user: {
    id: string;
    username: string;
    avatar_url: string | null;
  };
}

// Simple profanity filter
const badWords = ['fuck', 'shit', 'ass', 'bitch', 'damn', 'crap'];

function filterProfanity(text: string): string {
  let filtered = text;
  badWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    filtered = filtered.replace(regex, '*'.repeat(word.length));
  });
  return filtered;
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
        text: filterProfanity(comment.text),
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
    mutationFn: async ({ postId, text, authorId }: { postId: string; text: string; authorId: string }) => {
      if (!profile) throw new Error('Not authenticated');

      const filteredText = filterProfanity(text);

      const { data, error } = await supabase
        .from('comments')
        .insert({
          user_id: profile.id,
          post_id: postId,
          text: filteredText,
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

      return data;
    },
    onSuccess: (_, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['posts'] });
    },
  });
}
