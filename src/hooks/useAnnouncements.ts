import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';
import { isRetiredUpgradeNotice } from '@/lib/migrationNotice';
import { useReportAccountSession } from './useReportAccountSession';
import { reportAccountGuard, type ReportAccountGuard } from '@/lib/reportModerationService';

export interface Announcement {
  id: string;
  title: string;
  content: string;
  image_url: string | null;
  media_type: 'image' | 'video' | 'gif' | null;
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
  const profileId = useAuthProfileId();
  const session = useReportAccountSession();
  const guard = reportAccountGuard(session.uid);
  
  return useQuery({
    queryKey: ['announcements', profileId, session.uid, session.epoch],
    queryFn: async () => {
      guard();
      const { data: announcements, error } = await db
        .from('announcements')
        .select(`
          *,
          author:profiles!author_id (username, avatar_url)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      
      guard();
      if (error) throw error;
      
      const { data: dismissed, error: dismissedError } = await db
        .from('dismissed_announcements')
        .select('announcement_id')
        .eq('user_id', profileId || '');
      guard();
      if (dismissedError) throw dismissedError;
      
      const dismissedIds = new Set(dismissed?.map(d => d.announcement_id) || []);
      
      return (announcements || []).filter(a => !dismissedIds.has(a.id) && !isRetiredUpgradeNotice(a)) as Announcement[];
    },
    enabled: !!profileId && !!session.uid,
    placeholderData: undefined,
    initialData: undefined,
    select: (announcements) => announcements.filter(a => !isRetiredUpgradeNotice(a)),
    networkMode: 'always',
  });
}

export function useDismissAnnouncement() {
  const queryClient = useQueryClient();
  const profileId = useAuthProfileId();
  const session = useReportAccountSession();
  const guard = reportAccountGuard(session.uid);
  type Operation = { announcementId: string; profileId: string | undefined; uid: string | undefined; epoch: number; guard: ReportAccountGuard };
  const keyFor = (operation: Operation) => ['announcements', operation.profileId, operation.uid, operation.epoch];
  const mutation = useMutation({
    mutationFn: async (operation: Operation) => {
      operation.guard();
      if (!operation.profileId) throw new Error('Your profile is unavailable. Reopen this announcement.');
      const { error } = await db
        .from('dismissed_announcements')
        .upsert({
          user_id: operation.profileId,
          announcement_id: operation.announcementId,
        }, { onConflict: 'user_id,announcement_id', ignoreDuplicates: true });
      operation.guard();
      if (error && error.code !== '23505') throw error;
    },
    onSuccess: (_data, operation) => {
      operation.guard();
      const queryKey = keyFor(operation);
      queryClient.setQueryData<Announcement[]>(queryKey, rows => rows?.filter(row => row.id !== operation.announcementId));
      void queryClient.invalidateQueries({ queryKey, exact: true });
    },
  });
  const operation = (announcementId: string): Operation => ({ announcementId, profileId, uid: session.uid, epoch: session.epoch, guard });
  // Retained handlers carry their own operation; React Query's latest options
  // cannot retarget an old announcement action to the next account.
  return { ...mutation, variables: mutation.variables?.announcementId,
    mutate: (announcementId: string) => mutation.mutate(operation(announcementId)),
    mutateAsync: (announcementId: string) => mutation.mutateAsync(operation(announcementId)),
  };
}

export function useCreateAnnouncement() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async ({ title, content, image_url, media_type }: { title: string; content: string; image_url?: string; media_type?: string }) => {
      const { data, error } = await db
        .from('announcements')
        .insert({
          title,
          content,
          image_url: image_url || null,
          media_type: media_type || 'image',
          author_id: profile!.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      const { data: usersToNotify } = await db
        .from('profiles')
        .select('id')
        .neq('id', profile!.id);
      
      if (usersToNotify && usersToNotify.length > 0) {
        // Notification preferences control device push. They do not erase or
        // prevent inbox announcements; delivery checks preferences on the server.
        const notifyUserIds = usersToNotify.map(u => u.id);
        
        if (notifyUserIds.length > 0) {
          const notifications = notifyUserIds.map(userId => ({
            user_id: userId,
            actor_id: profile!.id,
            type: 'announcement' as const,
          }));
          
          await db.from('notifications').insert(notifications);
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
    mutationFn: async ({ id, title, content, image_url, media_type }: { id: string; title: string; content: string; image_url?: string | null; media_type?: string | null }) => {
      const { error } = await db
        .from('announcements')
        .update({ title, content, image_url: image_url ?? null, media_type: media_type ?? 'image' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['announcements'] });
      queryClient.invalidateQueries({ queryKey: ['all-announcements'] });
    },
  });
}

export function useRecentAnnouncements(limit = 5) {
  return useQuery({
    queryKey: ['recent-announcements', limit],
    queryFn: async () => {
      const { data, error } = await db
        .from('announcements')
        .select(`
          *,
          author:profiles!author_id (username, avatar_url)
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return (data || []).filter(a => !isRetiredUpgradeNotice(a)) as Announcement[];
    },
    select: (announcements) => announcements.filter(a => !isRetiredUpgradeNotice(a)),
  });
}

export function useClearAnnouncementNotifications() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      if (!profile?.id) return;
      await db
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
