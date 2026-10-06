import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { useAuth } from '@/lib/auth';
import { useSyncExternalStore } from 'react';
import { reportAccountGuard, reportAccountSnapshot, reportAccountSubscribe } from '@/lib/reportModerationService';
import { toast } from 'sonner';

const fns = () => getFunctions(getApp());


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
  const account = useSyncExternalStore(reportAccountSubscribe, reportAccountSnapshot, reportAccountSnapshot);

  return useQuery({
    queryKey: ['parental-controls', user?.id, account.epoch],
    queryFn: async () => {
      if (!user) return null;
      const guard = reportAccountGuard(user.id); guard();
      const call = httpsCallable<unknown, { controls: ParentalControls | null }>(
        fns(),
        'getParentalControlsSafe',
      );
      const res = await call({});
      guard();
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
    enabled: !!user && account.uid === user.id,
  });
}

export function useSetupParentalControls() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    retry: false, networkMode: 'always', gcTime: 0,
    mutationFn: async ({ pin, settings }: { pin: string; settings?: Partial<ParentalControls> }) => {
      if (!user) throw new Error('Not authenticated');
      const guard = reportAccountGuard(user.id); guard();
      const call = httpsCallable<unknown, { ok: boolean; controls: ParentalControls }>(
        fns(),
        'setParentalPin',
      );
      const res = await call({ pin, settings, expectedOwnerUid: user.id });
      guard();
      return res.data.controls;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['parental-controls', user?.id, reportAccountSnapshot().epoch], data);
      queryClient.invalidateQueries({ queryKey: ['parental-controls', user?.id] });
    },
  });
}

export interface ParentalUnlockProof { pin: string; uid: string; epoch: number }
export function useUpdateParentalControls(proof?: ParentalUnlockProof | null, onUnlockExpired?: () => void) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    retry: false, networkMode: 'always', gcTime: 0,
    mutationFn: async (updates: Partial<ParentalControls>) => {
      if (!user) throw new Error('Not authenticated');
      const started = reportAccountSnapshot(), guard = reportAccountGuard(user.id);
      guard();
      if (!proof || proof.uid !== user.id || proof.epoch !== started.epoch) throw new Error('Unlock parental controls again.');
      const call = httpsCallable<unknown, { ok: boolean }>(fns(), 'updateParentalControls');
      await call({ updates, pin: proof.pin, expectedOwnerUid: user.id });
      guard();
      return updates as ParentalControls;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['parental-controls', user?.id] });
    },
    onError: error => {
      const current = reportAccountSnapshot();
      if (current.uid !== user?.id || proof?.epoch !== current.epoch) return;
      const code = String((error as { code?: string }).code ?? '').replace(/^functions\//, '');
      if (['permission-denied', 'failed-precondition', 'resource-exhausted'].includes(code)) onUnlockExpired?.();
      toast.error('Could not save parental controls. Unlock again and retry.');
    },
  });
}

/** Server-side PIN verification. Returns true iff the PIN matches. */
export function useVerifyParentalPin() {
  const { user } = useAuth();
  return useMutation({
    retry: false, networkMode: 'always', gcTime: 0,
    mutationFn: async (pin: string) => {
      if (!user) throw new Error('Not authenticated');
      const guard = reportAccountGuard(user.id); guard();
      const call = httpsCallable<unknown, { ok: boolean }>(fns(), 'verifyParentalPin');
      const res = await call({ pin, expectedOwnerUid: user.id });
      guard();
      return Boolean(res.data?.ok);
    },
  });
}
