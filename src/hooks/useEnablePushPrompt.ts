import { useEffect, useState, useCallback } from 'react';
import { usePushNotifications } from './usePushNotifications';
import { useAuth } from '@/lib/auth';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { checkDespiaPushPermission } from '@/lib/despiaOneSignal';

const SNOOZE_KEY = 'vybe_push_prompt_snoozed_until';
const DISABLED_KEY = 'vybe_push_prompt_disabled';
const SNOOZE_DAYS = 30;

function isSnoozed(): boolean {
  try {
    if (localStorage.getItem(DISABLED_KEY) === '1') return true;
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const until = new Date(raw).getTime();
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

export function useEnablePushPrompt() {
  const { profile } = useAuth();
  const {
    isSupported,
    isSubscribed,
    isCheckingSubscription,
    isLoading,
    permission,
    subscribe,
  } = usePushNotifications();

  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [despiaPushEnabled, setDespiaPushEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    const delayMs = isDespiaRuntime() ? 1_500 : 3_000;
    const t = setTimeout(() => setReady(true), delayMs);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready || !profile?.id || !isDespiaRuntime()) return;
    void checkDespiaPushPermission().then((enabled) => {
      setDespiaPushEnabled(enabled);
      if (enabled === true) {
        setOpen(false);
        try { localStorage.setItem(DISABLED_KEY, '1'); } catch { /* */ }
      }
    });
  }, [ready, profile?.id]);

  useEffect(() => {
    if (!ready) return;
    if (!profile?.id) return;
    if (!isSupported) return;
    if (isCheckingSubscription) return;
    if (isSubscribed) return;
    if (isDespiaRuntime() && despiaPushEnabled === true) return;
    if (!isDespiaRuntime() && permission === 'denied') return;
    if (isSnoozed()) return;
    setOpen(true);
  }, [
    ready,
    profile?.id,
    isSupported,
    isCheckingSubscription,
    isSubscribed,
    permission,
    despiaPushEnabled,
  ]);

  useEffect(() => {
    if (isSubscribed || permission === 'granted' || despiaPushEnabled === true) {
      setOpen(false);
      try { localStorage.setItem(DISABLED_KEY, '1'); } catch { /* */ }
    }
  }, [isSubscribed, permission, despiaPushEnabled]);

  const onEnable = useCallback(async () => {
    const ok = await subscribe();
    if (ok) {
      setOpen(false);
      setDespiaPushEnabled(true);
      try { localStorage.setItem(DISABLED_KEY, '1'); } catch { /* */ }
    }
  }, [subscribe]);

  const onDismiss = useCallback(() => {
    try {
      const until = new Date(Date.now() + SNOOZE_DAYS * 86400_000).toISOString();
      localStorage.setItem(SNOOZE_KEY, until);
    } catch { /* */ }
    setOpen(false);
  }, []);

  return { open, onEnable, onDismiss, isLoading };
}
