import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
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
      const { data: announcements, error } = await supabase
        .from('announcements')
        .select(`
          *,
          author:profiles!author_id (username, avatar_url)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      const { data: dismissed } = await supabase
        .from('dismissed_announcements')
        .select('announcement_id')
        .eq('user_id', profile?.id || '');
      
      const dismissedIds = new Set(dismissed?.map(d => d.announcement_id) || []);
      
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
    mutationFn: async ({ title, content, image_url }: { title: string; content: string; image_url?: string }) => {
      const { data, error } = await supabase
        .from('announcements')
        .insert({
          title,
          content,
          image_url: image_url || null,
          author_id: profile!.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      const { data: usersToNotify } = await supabase
        .from('profiles')
        .select('id')
        .neq('id', profile!.id);
      
      if (usersToNotify && usersToNotify.length > 0) {
        const { data: disabledPrefs } = await supabase
          .from('notification_preferences')
          .select('user_id')
          .eq('announcements_enabled', false);
        
        const disabledUserIds = new Set(disabledPrefs?.map(p => p.user_id) || []);
        
        const notifyUserIds = usersToNotify
          .map(u => u.id)
          .filter(id => !disabledUserIds.has(id));
        
        if (notifyUserIds.length > 0) {
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

export function useUpdateAnnouncement() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ id, title, content, image_url }: { id: string; title: string; content: string; image_url?: string | null }) => {
      const { error } = await supabase
        .from('announcements')
        .update({ title, content, image_url: image_url ?? null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['all-announcements'] });
    },
  });
}

export function useClearAnnouncementNotifications() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      if (!profile?.id) return;
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
