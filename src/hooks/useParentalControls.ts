import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth';

export interface ParentalControls {
  id: string;
  user_id: string;
  pin_hash: string;
  is_active: boolean;
  content_filter_level: string;
  max_screen_time_minutes: number | null;
  allowed_features: string[] | null;
  created_at: string;
  updated_at: string;
}

const DEFAULT_PARENTAL_VALUES = {
  is_active: true,
  content_filter_level: 'protected',
  max_screen_time_minutes: 120,
  allowed_features: ['messaging', 'feed', 'profile'],
};

export function hashPin(pin: string): string {
  let hash = 0;
  const str = `vybe_pin_${pin}_salt`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

export function useParentalControls() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['parental-controls', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await db
        .from('parental_controls')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...DEFAULT_PARENTAL_VALUES,
        ...data,
        max_screen_time_minutes: data.max_screen_time_minutes ?? DEFAULT_PARENTAL_VALUES.max_screen_time_minutes,
        allowed_features: data.allowed_features ?? DEFAULT_PARENTAL_VALUES.allowed_features,
      } as ParentalControls;
    },
    enabled: !!user,
  });
}

export function useSetupParentalControls() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ pin, settings }: { pin: string; settings?: Partial<ParentalControls> }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await db
        .from('parental_controls')
        .upsert({
          user_id: user.id,
          pin_hash: hashPin(pin),
          is_active: true,
          content_filter_level: settings?.content_filter_level || DEFAULT_PARENTAL_VALUES.content_filter_level,
          max_screen_time_minutes: settings?.max_screen_time_minutes ?? DEFAULT_PARENTAL_VALUES.max_screen_time_minutes,
          allowed_features: settings?.allowed_features || DEFAULT_PARENTAL_VALUES.allowed_features,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' })
        .select()
        .single();
      if (error) throw error;
      return data as ParentalControls;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['parental-controls', user?.id], data);
      queryClient.invalidateQueries({ queryKey: ['parental-controls', user?.id] });
    },
  });
}

export function useUpdateParentalControls() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (updates: Partial<ParentalControls>) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await db
        .from('parental_controls')
        .update({
          ...updates,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .select()
        .single();
      if (error) throw error;
      return data as ParentalControls;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['parental-controls', user?.id], data);
      queryClient.invalidateQueries({ queryKey: ['parental-controls', user?.id] });
    },
  });
}

export function verifyPin(inputPin: string, storedHash: string): boolean {
  return hashPin(inputPin) === storedHash;
}
