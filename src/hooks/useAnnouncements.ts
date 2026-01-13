import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  author_id: string;
  created_at: string;
  expires_at: string | null;
  is_active: boolean;
  author?: {
    username: string;
    avatar_url: string | null;
  };
}

export function useAnnouncements() {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['announcements', profile?.id],
    queryFn: async () => {
      // Get active announcements
      const { data: announcements, error } = await supabase
        .from('announcements')
        .select(`
          *,
          author:profiles!author_id (username, avatar_url)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // Get dismissed announcements for this user
      const { data: dismissed } = await supabase
        .from('dismissed_announcements')
        .select('announcement_id')
        .eq('user_id', profile?.id || '');
      
      const dismissedIds = new Set(dismissed?.map(d => d.announcement_id) || []);
      
      // Filter out dismissed announcements
      return (announcements || []).filter(a => !dismissedIds.has(a.id)) as Announcement[];
    },
    enabled: !!profile?.id,
  });
}

export function useDismissAnnouncement() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async (announcementId: string) => {
      const { error } = await supabase
        .from('dismissed_announcements')
        .insert({
          user_id: profile!.id,
          announcement_id: announcementId,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async ({ title, content }: { title: string; content: string }) => {
      const { data, error } = await supabase
        .from('announcements')
        .insert({
          title,
          content,
          author_id: profile!.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // Create notifications ONLY for users who have announcements enabled
      // First get all users with announcements enabled (or no preference = default enabled)
      const { data: usersToNotify } = await supabase
        .from('profiles')
        .select('id')
        .neq('id', profile!.id);
      
      if (usersToNotify && usersToNotify.length > 0) {
        // Get users who have explicitly disabled announcements
        const { data: disabledPrefs } = await supabase
          .from('notification_preferences')
          .select('user_id')
          .eq('announcements_enabled', false);
        
        const disabledUserIds = new Set(disabledPrefs?.map(p => p.user_id) || []);
        
        // Filter to only notify users who haven't disabled announcements
        const notifyUserIds = usersToNotify
          .map(u => u.id)
          .filter(id => !disabledUserIds.has(id));
        
        if (notifyUserIds.length > 0) {
          // Create notification records
          const notifications = notifyUserIds.map(userId => ({
            user_id: userId,
            actor_id: profile!.id,
            type: 'announcement' as const,
          }));
          
          await supabase.from('notifications').insert(notifications);
        }
      }
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
}

// Clear announcement notifications when user disables announcements
export function useClearAnnouncementNotifications() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      if (!profile?.id) return;
      
      // Delete all unread announcement notifications for this user
      await supabase
        .from('notifications')
        .delete()
        .eq('user_id', profile.id)
        .eq('type', 'announcement')
        .eq('read', false);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['unread-notifications'] });
    },
  });
}
