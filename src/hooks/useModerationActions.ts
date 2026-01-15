import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { isOwner } from '@/components/ui/OwnerBadge';

// Owner username for protection
const OWNER_USERNAME = 'mrassburgers';

// Helper to check if a user is the owner by their profile ID
async function isUserOwner(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .single();
  return data?.username?.toLowerCase() === OWNER_USERNAME.toLowerCase();
}

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

// Ban user mutation with owner protection
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
      customGifUrl,
    }: { 
      userId: string; 
      reason: string; 
      isPermanent?: boolean;
      durationDays?: number;
      isMemeBan?: boolean;
      customGifUrl?: string | null;
    }): Promise<{ reversedOnMod: boolean }> => {
      if (!profile?.id) throw new Error('Not authenticated');
      
      // Check if target user is the owner
      const targetIsOwner = await isUserOwner(userId);
      
      // If trying to ban the owner, ban the person trying instead for double the time
      if (targetIsOwner) {
        // Also check if the person trying is the owner (owner can't ban themselves this way)
        const currentUserIsOwner = isOwner(profile.username);
        if (currentUserIsOwner) {
          throw new Error('Nice try, but you can\'t ban yourself!');
        }
        
        // Calculate double the ban duration for the mod
        const doubleDurationDays = durationDays ? durationDays * 2 : 14; // Default 2 weeks if no duration
        const expiresAt = !isPermanent 
          ? new Date(Date.now() + doubleDurationDays * 24 * 60 * 60 * 1000).toISOString()
          : null;

        // Ban the mod/admin who tried to ban the owner
        const { error } = await supabase
          .from('user_bans')
          .insert({
            user_id: profile.id, // Ban the person who tried
            banned_by: profile.id, // Self-inflicted (by their own action)
            reason: `Attempted to ban the owner. Original reason: "${reason}"`,
            is_permanent: isPermanent, // If they tried permanent, they get permanent
            expires_at: expiresAt,
            is_meme_ban: true, // Always meme ban them for the irony
            custom_gif_url: customGifUrl || null,
          });
        
        if (error) throw error;
        return { reversedOnMod: true };
      }
      
      // Normal ban flow for non-owner targets
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
          custom_gif_url: isMemeBan ? (customGifUrl || null) : null,
        });
      
      if (error) throw error;
      return { reversedOnMod: false };
    },
    onSuccess: (result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['user-bans'] });
      queryClient.invalidateQueries({ queryKey: ['all-bans'] });
      queryClient.invalidateQueries({ queryKey: ['is-banned'] });
      queryClient.invalidateQueries({ queryKey: ['ban-status'] });
      
      if (result.reversedOnMod) {
        toast.error('🚫 Nice try! You got banned for trying to ban the owner 😂', {
          duration: 5000,
        });
      } else {
        toast.success(variables.isMemeBan ? '😂 User meme banned!' : 'User banned successfully');
      }
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to ban user');
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
