import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';

export function useEventReminder(eventId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['event-reminder', user?.id, eventId],
    queryFn: async () => {
      if (!user?.id || !eventId) return null;
      const { data } = await supabase
        .from('event_reminders')
        .select('*')
        .eq('user_id', user.id)
        .eq('event_id', eventId)
        .maybeSingle();
      return data;
    },
    enabled: !!user?.id && !!eventId,
  });
}

export function useSetEventReminder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ eventId, remindAt }: { eventId: string; remindAt: Date }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('event_reminders')
        .upsert({
          user_id: user.id,
          event_id: eventId,
          remind_at: remindAt.toISOString(),
          reminded: false,
        }, { onConflict: 'user_id,event_id' });

      if (error) throw error;
    },
    onSuccess: (_, { eventId }) => {
      queryClient.invalidateQueries({ queryKey: ['event-reminder'] });
      toast.success('⏰ Reminder set!');
    },
  });
}

export function useRemoveEventReminder() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (eventId: string) => {
      if (!user?.id) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('event_reminders')
        .delete()
        .eq('user_id', user.id)
        .eq('event_id', eventId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-reminder'] });
      toast('Reminder removed');
    },
  });
}
