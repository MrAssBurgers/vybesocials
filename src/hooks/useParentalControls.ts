import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { httpsCallable, getFunctions } from 'firebase/functions';
import { getApp } from 'firebase/app';
import { useRef } from 'react';
import { reportAccountSnapshot } from '@/lib/reportModerationService';
import { toast } from 'sonner';
import { useVerifiedSettingsScope } from './useVerifiedSettingsScope';

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
  const { user, account, capture, ready, profileId, creationTime } = useVerifiedSettingsScope();

  return useQuery({
    queryKey: ['parental-controls', user?.id, account.epoch, profileId, creationTime],
    queryFn: async () => {
      if (!user) return null;
      const { guard, fields } = capture();
      const call = httpsCallable<unknown, { controls: ParentalControls | null }>(
        fns(),
        'getParentalControlsSafe',
      );
      const res = await call(fields);
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
    enabled: ready,
  });
}

export function useSetupParentalControls() {
  const queryClient = useQueryClient();
  const { user, capture, profileId, creationTime } = useVerifiedSettingsScope();
  // Keep only the uncertain request in memory. No PIN/request is serialized.
  const pending = useRef<{ scope: string; effect: string; requestId: string } | null>(null);

  return useMutation({
    retry: false, networkMode: 'always', gcTime: 0,
    onMutate: () => capture(),
    mutationFn: async ({ pin, settings }: { pin: string; settings?: Partial<ParentalControls> }) => {
      if (!user) throw new Error('Not authenticated');
      const { guard, fields } = capture();
      if (!/^\d{4,8}$/.test(pin)) throw new Error('Use a four to eight digit PIN.');
      const scope = JSON.stringify([fields, reportAccountSnapshot().epoch]);
      const effect = JSON.stringify([pin, Object.entries(settings ?? {}).sort(([a], [b]) => a.localeCompare(b))]);
      if (pending.current?.scope !== scope) pending.current = null;
      if (pending.current && pending.current.effect !== effect) throw new Error('Retry the original setup details or reload parental controls before changing them.');
      pending.current ??= { scope, effect, requestId: crypto.randomUUID() };
      const requestId = pending.current.requestId;
      const call = httpsCallable<unknown, { ok: boolean; requestId: string; replayed: boolean; controls: ParentalControls }>(fns(), 'setParentalPin');
      try {
        const res = await call({ pin, ...(settings === undefined ? {} : { settings }), requestId, ...fields });
        guard();
        if (res.data?.ok !== true || res.data.requestId !== requestId || typeof res.data.replayed !== 'boolean' || res.data.controls?.user_id !== fields.expectedOwnerUid || res.data.controls.has_pin !== true) throw new Error('Your setup confirmation was incomplete. Retry the same details.');
        return res.data.controls;
      } catch (error) {
        const code = String((error as { code?: string }).code ?? '').replace(/^functions\//, '');
        if (code === 'invalid-argument' && pending.current?.scope === scope && pending.current.requestId === requestId) pending.current = null;
        throw error;
      }
    },
    onSuccess: (data, _variables, context) => {
      try { context?.guard(); } catch { return; }
      pending.current = null;
      queryClient.setQueryData(['parental-controls', user?.id, reportAccountSnapshot().epoch, profileId, creationTime], data);
      queryClient.invalidateQueries({ queryKey: ['parental-controls', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['safety-settings', profileId] });
    },
  });
}

export interface ParentalUnlockProof { pin: string; uid: string; epoch: number }
export function useUpdateParentalControls(proof?: ParentalUnlockProof | null, onUnlockExpired?: () => void) {
  const queryClient = useQueryClient();
  const { user, capture, profileId } = useVerifiedSettingsScope();

  return useMutation({
    retry: false, networkMode: 'always', gcTime: 0,
    onMutate: () => capture(),
    mutationFn: async (updates: Partial<ParentalControls>) => {
      if (!user) throw new Error('Not authenticated');
      const started = reportAccountSnapshot(), { guard, fields } = capture();
      if (!proof || proof.uid !== user.id || proof.epoch !== started.epoch) throw new Error('Unlock parental controls again.');
      const call = httpsCallable<unknown, { ok: boolean }>(fns(), 'updateParentalControls');
      const res = await call({ updates, pin: proof.pin, ...fields });
      guard();
      if (res.data?.ok !== true) throw new Error('Your save confirmation was incomplete. Refresh controls before retrying.');
      return updates as ParentalControls;
    },
    onSuccess: (_data, _variables, context) => {
      try { context?.guard(); } catch { return; }
      queryClient.invalidateQueries({ queryKey: ['parental-controls', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['safety-settings', profileId] });
    },
    onError: (error, _variables, context) => {
      try { context?.guard(); } catch { return; }
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
  const { user, capture } = useVerifiedSettingsScope();
  return useMutation({
    retry: false, networkMode: 'always', gcTime: 0,
    mutationFn: async (pin: string) => {
      if (!user) throw new Error('Not authenticated');
      const { guard, fields } = capture();
      const call = httpsCallable<unknown, { ok: boolean }>(fns(), 'verifyParentalPin');
      const res = await call({ pin, ...fields });
      guard();
      return Boolean(res.data?.ok);
    },
  });
}
