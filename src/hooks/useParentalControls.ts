import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/integrations/firebase/client';
import { useAuth } from '@/lib/auth';

export interface ParentalControls {
  id?: string;
  user_id: string;
  has_pin: boolean;
  is_active: boolean;
  content_filter_level: string;
  max_screen_time_minutes: number | null;
  allowed_features: string[] | null;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_PARENTAL_VALUES = {
  is_active: true,
  content_filter_level: 'protected',
  max_screen_time_minutes: 120,
  allowed_features: ['messaging', 'feed', 'profile'],
};

/**
 * SECURITY: PIN hashing/verification happens server-side in Cloud Functions.
 * The client never sees `pin_hash`. These helpers are deprecated stubs kept
 * only so legacy imports don't break — they always return false.
 */
export function hashPin(_pin: string): string {
  // Server-side only; kept for backward-compat imports.
  return '';
}
export function verifyPin(_inputPin: string, _storedHash: string): boolean {
  // Deprecated client check. Use `useVerifyParentalPin` instead.
  return false;
}

export function useParentalControls() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['parental-controls', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const call = httpsCallable<unknown, { controls: ParentalControls | null }>(
        functions,
        'getParentalControlsSafe',
      );
      const res = await call({});
      const controls = res.data?.controls;
      if (!controls) return null;
      return {
        ...DEFAULT_PARENTAL_VALUES,
        ...controls,
        max_screen_time_minutes:
          controls.max_screen_time_minutes ?? DEFAULT_PARENTAL_VALUES.max_screen_time_minutes,
        allowed_features: controls.allowed_features ?? DEFAULT_PARENTAL_VALUES.allowed_features,
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
      const call = httpsCallable<unknown, { ok: boolean; controls: ParentalControls }>(
        functions,
        'setParentalPin',
      );
      const res = await call({ pin, settings });
      return res.data.controls;
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
      const call = httpsCallable<unknown, { ok: boolean }>(functions, 'updateParentalControls');
      await call({ updates });
      return updates as ParentalControls;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parental-controls', user?.id] });
    },
  });
}

/** Server-side PIN verification. Returns true iff the PIN matches. */
export function useVerifyParentalPin() {
  return useMutation({
    mutationFn: async (pin: string) => {
      const call = httpsCallable<unknown, { ok: boolean }>(functions, 'verifyParentalPin');
      const res = await call({ pin });
      return Boolean(res.data?.ok);
    },
  });
}
