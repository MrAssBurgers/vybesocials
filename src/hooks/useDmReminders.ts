import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuthProfileId } from '@/hooks/useAuthProfileId';

export type DmReminderPreset = 'later_today' | 'tomorrow' | 'next_week' | 'custom';

export interface DmReminder {
  id: string;
  user_id: string;
  conversation_id: string;
  message_id?: string | null;
  remind_at: string;
  status: 'pending' | 'fired' | 'cancelled';
  note?: string | null;
  created_at: string;
}

function presetToDate(preset: DmReminderPreset): Date {
  const now = new Date();
  switch (preset) {
    case 'later_today': {
      const d = new Date(now);
      d.setHours(d.getHours() + 3, 0, 0, 0);
      return d;
    }
    case 'tomorrow': {
      const d = new Date(now);
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    case 'next_week': {
      const d = new Date(now);
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
      return d;
    }
    default:
      return now;
  }
}

export function useDmReminders(conversationId?: string) {
  const profileId = useAuthProfileId();

  return useQuery({
    queryKey: ['dm-reminders', profileId, conversationId],
    enabled: !!profileId,
    queryFn: async (): Promise<DmReminder[]> => {
      if (!profileId) return [];
      let q = db.from('dm_reminders').select('*').eq('user_id', profileId).eq('status', 'pending');
      if (conversationId) {
        q = q.eq('conversation_id', conversationId);
      }
      const { data, error } = await q.order('remind_at', { ascending: true });
      if (error) {
        console.warn('[useDmReminders] load failed', error);
        return [];
      }
      return (data ?? []) as DmReminder[];
    },
    staleTime: 15_000,
  });
}

export function useCreateDmReminder() {
  const profileId = useAuthProfileId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      conversationId: string;
      messageId?: string;
      preset?: DmReminderPreset;
      remindAt?: Date;
      note?: string;
    }) => {
      if (!profileId) throw new Error('Not signed in');
      const remindAt = input.remindAt ?? presetToDate(input.preset ?? 'later_today');
      const { error } = await db.from('dm_reminders').insert({
        user_id: profileId,
        conversation_id: input.conversationId,
        message_id: input.messageId ?? null,
        remind_at: remindAt.toISOString(),
        status: 'pending',
        note: input.note ?? null,
        created_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['dm-reminders', profileId] });
      qc.invalidateQueries({ queryKey: ['dm-reminders', profileId, vars.conversationId] });
    },
  });
}

export function useCancelDmReminder() {
  const profileId = useAuthProfileId();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (reminderId: string) => {
      const { error } = await db
        .from('dm_reminders')
        .update({ status: 'cancelled' })
        .eq('id', reminderId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dm-reminders', profileId] });
    },
  });
}
