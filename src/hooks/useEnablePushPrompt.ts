import { useEffect, useState, useCallback } from 'react';
import { usePushNotifications } from './usePushNotifications';
import { useAuth } from '@/lib/auth';

const SNOOZE_KEY = 'vybe_push_prompt_snoozed_until';
const SNOOZE_DAYS = 7;

function isSnoozed(): boolean {
  try {
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

  // Delay first eligibility check ~3s after mount to avoid cold-load slam
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 3000);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!profile?.id) return;
    if (!isSupported) return;
    if (isCheckingSubscription) return;
    if (isSubscribed) return;
    if (permission === 'denied') return;
    if (isSnoozed()) return;
    setOpen(true);
  }, [ready, profile?.id, isSupported, isCheckingSubscription, isSubscribed, permission]);

  // If user subscribes elsewhere, close
  useEffect(() => {
    if (isSubscribed) setOpen(false);
  }, [isSubscribed]);

  const onEnable = useCallback(async () => {
    const ok = await subscribe();
    if (ok) setOpen(false);
  }, [subscribe]);

  const onDismiss = useCallback(() => {
    try {
      const until = new Date(Date.now() + SNOOZE_DAYS * 86400_000).toISOString();
      localStorage.setItem(SNOOZE_KEY, until);
    } catch {}
    setOpen(false);
  }, []);

  return { open, onEnable, onDismiss, isLoading };
}
