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
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
}
