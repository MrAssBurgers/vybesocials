import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

// Fetch user warnings
export function useUserWarnings(userId?: string) {
  return useQuery({
    queryKey: ['user-warnings', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_warnings')
        .select(`
          *,
          warned_by_profile:profiles!warned_by(username, avatar_url)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

// Fetch user bans
export function useUserBans(userId?: string) {
  return useQuery({
    queryKey: ['user-bans', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from('user_bans')
        .select(`
          *,
          banned_by_profile:profiles!banned_by(username, avatar_url)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

// Fetch all warnings (for admin)
export function useAllWarnings() {
  return useQuery({
    queryKey: ['all-warnings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_warnings')
        .select(`
          *,
          user:profiles!user_id(id, username, avatar_url),
          warned_by_profile:profiles!warned_by(username)
        `)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
}

// Fetch all bans (for admin)
export function useAllBans() {
  return useQuery({
    queryKey: ['all-bans'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_bans')
        .select(`
          *,
          user:profiles!user_id(id, username, avatar_url),
          banned_by_profile:profiles!banned_by(username)
        `)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
}

// Check if user is banned
export function useIsUserBanned(userId?: string) {
  return useQuery({
    queryKey: ['is-banned', userId],
    queryFn: async () => {
      if (!userId) return false;
      const { data, error } = await supabase
        .from('user_bans')
        .select('id, expires_at, is_permanent')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      if (!data || data.length === 0) return false;
      
      const ban = data[0];
      if (ban.is_permanent) return true;
      if (ban.expires_at && new Date(ban.expires_at) > new Date()) return true;
      return false;
    },
    enabled: !!userId,
  });
}

// Warn user mutation
export function useWarnUser() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, reason }: { userId: string; reason: string }) => {
      if (!profile?.id) throw new Error('Not authenticated');
      
      const { error } = await supabase
        .from('user_warnings')
        .insert({
          user_id: userId,
          warned_by: profile.id,
          reason,
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-warnings'] });
      queryClient.invalidateQueries({ queryKey: ['all-warnings'] });
      toast.success('User warned successfully');
    },
    onError: () => {
      toast.error('Failed to warn user');
    },
  });
}

// Ban user mutation
export function useBanUser() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      userId, 
      reason, 
      isPermanent = false, 
      durationDays,
      isMemeBan = false,
    }: { 
      userId: string; 
      reason: string; 
      isPermanent?: boolean;
      durationDays?: number;
      isMemeBan?: boolean;
    }) => {
      if (!profile?.id) throw new Error('Not authenticated');
      
      // Convert fractional days to proper timestamp
      const expiresAt = !isPermanent && durationDays 
        ? new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString()
        : null;

      const { error } = await supabase
        .from('user_bans')
        .insert({
          user_id: userId,
          banned_by: profile.id,
          reason,
          is_permanent: isPermanent,
          expires_at: expiresAt,
          is_meme_ban: isMemeBan,
        });
      
      if (error) throw error;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-bans'] });
      queryClient.invalidateQueries({ queryKey: ['all-bans'] });
      queryClient.invalidateQueries({ queryKey: ['is-banned'] });
      toast.success(variables.isMemeBan ? '😂 User meme banned!' : 'User banned successfully');
    },
    onError: () => {
      toast.error('Failed to ban user');
    },
  });
}

// Unban user mutation
export function useUnbanUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (banId: string) => {
      const { error } = await supabase
        .from('user_bans')
        .delete()
        .eq('id', banId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-bans'] });
      queryClient.invalidateQueries({ queryKey: ['all-bans'] });
      queryClient.invalidateQueries({ queryKey: ['is-banned'] });
      toast.success('User unbanned successfully');
    },
    onError: () => {
      toast.error('Failed to unban user');
    },
  });
}

// Delete comment as admin
export function useAdminDeleteComment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (commentId: string) => {
      const { error } = await supabase
        .from('comments')
        .delete()
        .eq('id', commentId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments'] });
      toast.success('Comment deleted');
    },
    onError: () => {
      toast.error('Failed to delete comment');
    },
  });
}
