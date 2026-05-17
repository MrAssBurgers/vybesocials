import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export interface NotificationPreferences {
  id: string;
  user_id: string;
  likes_enabled: boolean;
  comments_enabled: boolean;
  follows_enabled: boolean;
  mentions_enabled: boolean;
  dms_enabled: boolean;
  marketplace_enabled: boolean;
  events_enabled: boolean;
  system_enabled: boolean;
  announcements_enabled: boolean;
  nearby_enabled?: boolean;
  brief_pings_enabled?: boolean;
  friend_activity_enabled?: boolean;
  trending_local_enabled?: boolean;
  smart_ping_radius_miles?: number;
  smart_ping_max_per_day?: number;
  quiet_hours_start: string | null;
  quiet_hours_end: string | null;
}

const DEFAULTS = (userId: string): NotificationPreferences => ({
  id: '',
  user_id: userId,
  likes_enabled: true,
  comments_enabled: true,
  follows_enabled: true,
  mentions_enabled: true,
  dms_enabled: true,
  marketplace_enabled: true,
  events_enabled: true,
  system_enabled: true,
  announcements_enabled: true,
  nearby_enabled: true,
  brief_pings_enabled: true,
  friend_activity_enabled: true,
  trending_local_enabled: true,
  smart_ping_radius_miles: 5,
  smart_ping_max_per_day: 6,
  quiet_hours_start: null,
  quiet_hours_end: null,
});

export function useNotificationPreferences() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['notification-preferences', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return null;

      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) return DEFAULTS(profile.id);
      return data as NotificationPreferences;
    },
    enabled: !!profile?.id,
    staleTime: 5 * 60 * 1000,
    placeholderData: profile?.id ? DEFAULTS(profile.id) : undefined,
    refetchOnWindowFocus: false,
  });
}

export function useUpdateNotificationPreference() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      key,
      value,
    }: {
      key: keyof NotificationPreferences;
      value: boolean | string | null;
    }) => {
      if (!profile?.id) throw new Error('Not authenticated');

      // Check if preferences exist
      const { data: existing } = await supabase
        .from('notification_preferences')
        .select('id')
        .eq('user_id', profile.id)
        .maybeSingle();

      if (existing) {
        // Update existing
        const { error } = await supabase
          .from('notification_preferences')
          .update({ [key]: value, updated_at: new Date().toISOString() })
          .eq('user_id', profile.id);

        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('notification_preferences')
          .insert({
            user_id: profile.id,
            [key]: value,
          });

        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notification-preferences'] });
    },
    onError: (error: any) => {
      console.error('Failed to update notification preference:', error);
      toast.error('Failed to update setting');
    },
  });
}
