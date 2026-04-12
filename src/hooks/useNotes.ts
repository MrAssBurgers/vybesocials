import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface UserNote {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  expires_at: string;
  profile?: {
    id: string;
    username: string;
    avatar_url: string | null;
    display_name: string | null;
  };
}

export function useMyNote() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  return useQuery({
    queryKey: ['my-note', userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data, error } = await supabase
        .from('user_notes')
        .select('*')
        .eq('user_id', userId)
        .gt('expires_at', new Date().toISOString())
        .maybeSingle();
      if (error) throw error;
      return data as UserNote | null;
    },
    enabled: !!userId,
  });
}

export function useFriendsNotes() {
  const { profile, session } = useAuth();
  const userId = session?.user?.id;

  return useQuery({
    queryKey: ['friends-notes', userId],
    queryFn: async () => {
      if (!userId || !profile?.id) return [];

      // Get friend IDs via accepted friend requests
      const { data: friendReqs } = await supabase
        .from('friend_requests')
        .select('sender_id, receiver_id')
        .eq('status', 'accepted')
        .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`);

      if (!friendReqs || friendReqs.length === 0) return [];

      const friendProfileIds = friendReqs.map(f =>
        f.sender_id === profile.id ? f.receiver_id : f.sender_id
      );

      // Get profiles to map profile_id -> auth user_id
      const { data: friendProfiles } = await supabase
        .from('profiles')
        .select('id, username, avatar_url, display_name, user_id')
        .in('id', friendProfileIds);

      if (!friendProfiles || friendProfiles.length === 0) return [];

      const authUserIds = friendProfiles
        .map(p => (p as any).user_id)
        .filter(Boolean) as string[];

      if (authUserIds.length === 0) return [];

      // Get active notes
      const { data: notes, error } = await supabase
        .from('user_notes')
        .select('*')
        .in('user_id', authUserIds)
        .gt('expires_at', new Date().toISOString());

      if (error) throw error;

      // Attach profile info
      return (notes || []).map(note => {
        const prof = friendProfiles.find(p => (p as any).user_id === note.user_id);
        return {
          ...note,
          profile: prof ? {
            id: prof.id,
            username: prof.username,
            avatar_url: prof.avatar_url,
            display_name: prof.display_name,
          } : undefined,
        } as UserNote;
      });
    },
    enabled: !!userId && !!profile?.id,
    staleTime: 60_000,
  });
}

export function useSetNote() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;

  return useMutation({
    mutationFn: async (content: string) => {
      if (!userId) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('user_notes')
        .upsert(
          {
            user_id: userId,
            content,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: 'user_id' }
        )
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-note'] });
    },
  });
}

export function useDeleteNote() {
  const { session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user?.id;

  return useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('user_notes')
        .delete()
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-note'] });
    },
  });
}
