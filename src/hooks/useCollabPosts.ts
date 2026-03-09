import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface CollabInvite {
  id: string;
  post_id: string | null;
  inviter_id: string;
  invitee_id: string;
  status: 'pending' | 'accepted' | 'declined';
  created_at: string;
  responded_at: string | null;
  inviter?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
  invitee?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export interface PostCollaborator {
  id: string;
  post_id: string;
  user_id: string;
  role: 'owner' | 'contributor';
  added_at: string;
  profile?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export function useCollabInvites() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['collab-invites', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('collab_post_invites' as any)
        .select(`
          *,
          inviter:profiles!inviter_id(id, username, avatar_url, display_name)
        `)
        .eq('invitee_id', user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data || []) as CollabInvite[];
    },
    enabled: !!user?.id,
  });
}

export function usePostCollaborators(postId: string | undefined) {
  return useQuery({
    queryKey: ['post-collaborators', postId],
    queryFn: async () => {
      if (!postId) return [];

      const { data, error } = await supabase
        .from('post_collaborators' as any)
        .select(`
          *,
          profile:profiles!user_id(id, username, avatar_url, display_name)
        `)
        .eq('post_id', postId)
        .order('added_at', { ascending: true });

      if (error) throw error;
      return (data || []) as PostCollaborator[];
    },
    enabled: !!postId,
  });
}

export function useSendCollabInvite() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ postId, inviteeId }: { postId?: string; inviteeId: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('collab_post_invites' as any)
        .insert({
          post_id: postId || null,
          inviter_id: user.id,
          invitee_id: inviteeId,
          status: 'pending',
        } as any)
        .select()
        .single();

      if (error) throw error;

      // Create notification
      await supabase.from('notifications').insert({
        user_id: inviteeId,
        type: 'collab_invite',
        actor_id: user.id,
        post_id: postId,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collab-invites'] });
    },
  });
}

export function useRespondToCollabInvite() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ inviteId, accept, postId }: { inviteId: string; accept: boolean; postId?: string }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('collab_post_invites' as any)
        .update({
          status: accept ? 'accepted' : 'declined',
          responded_at: new Date().toISOString(),
        } as any)
        .eq('id', inviteId);

      if (error) throw error;

      // If accepted and post exists, add as collaborator
      if (accept && postId) {
        await supabase.from('post_collaborators' as any).insert({
          post_id: postId,
          user_id: user.id,
          role: 'contributor',
        } as any);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['collab-invites'] });
      queryClient.invalidateQueries({ queryKey: ['post-collaborators'] });
    },
  });
}

export function useAddCollaborator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, userId }: { postId: string; userId: string }) => {
      const { error } = await supabase
        .from('post_collaborators' as any)
        .insert({
          post_id: postId,
          user_id: userId,
          role: 'contributor',
        } as any);

      if (error) throw error;
    },
    onSuccess: (_, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['post-collaborators', postId] });
    },
  });
}

export function useRemoveCollaborator() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ postId, collaboratorId }: { postId: string; collaboratorId: string }) => {
      const { error } = await supabase
        .from('post_collaborators' as any)
        .delete()
        .eq('id', collaboratorId);

      if (error) throw error;
    },
    onSuccess: (_, { postId }) => {
      queryClient.invalidateQueries({ queryKey: ['post-collaborators', postId] });
    },
  });
}
