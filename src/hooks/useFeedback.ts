import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export interface Feedback {
  id: string;
  user_id: string;
  type: 'bug' | 'feature' | 'improvement' | 'other';
  message: string;
  likes_count: number;
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
  has_liked?: boolean;
}

export function useFeedback() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['feedback', profile?.id],
    queryFn: async () => {
      const { data: feedback, error } = await db
        .from('feedback')
        .select(`
          *,
          user:profiles!user_id(id, username, avatar_url, display_name)
        `)
        .order('likes_count', { ascending: false });

      if (error) throw error;

      // Check if current user has liked each feedback
      if (profile?.id) {
        const { data: likes } = await db
          .from('feedback_likes')
          .select('feedback_id')
          .eq('user_id', profile.id);

        const likedIds = new Set((likes || []).map((l) => l.feedback_id));

        return (feedback || []).map((f) => ({
          ...f,
          has_liked: likedIds.has(f.id),
        })) as Feedback[];
      }

      return (feedback || []).map((f) => ({
        ...f,
        has_liked: false,
      })) as Feedback[];
    },
  });
}

export function useCreateFeedback() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ type, message }: { type: string; message: string }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      const { error } = await db.from('feedback').insert({
        user_id: profile.id,
        type,
        message,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      toast.success('Feedback submitted successfully!');
    },
    onError: (error) => {
      toast.error('Failed to submit feedback');
      console.error('Feedback error:', error);
    },
  });
}

export function useLikeFeedback() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async ({ feedbackId, unlike }: { feedbackId: string; unlike?: boolean }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      if (unlike) {
        const { error } = await db
          .from('feedback_likes')
          .delete()
          .eq('feedback_id', feedbackId)
          .eq('user_id', profile.id);

        if (error) throw error;
      } else {
        const { error } = await db.from('feedback_likes').insert({
          feedback_id: feedbackId,
          user_id: profile.id,
        });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
    },
  });
}

export function useUpdateFeedbackStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await db
        .from('feedback')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedback'] });
      toast.success('Feedback status updated');
    },
  });
}
