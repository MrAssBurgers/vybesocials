import { useEffect, useState, useCallback, useRef } from 'react';
import { usePushNotifications } from './usePushNotifications';
import { useAuth } from '@/lib/auth';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { checkDespiaPushPermission } from '@/lib/despiaOneSignal';
import { useCrashReportConsentState } from '@/lib/crashReportConsent';
import { readDevicePreference, subscribeDevicePreference, writeDevicePreference } from '@/lib/devicePreferences';
import { useOptionalPromptBlocked } from './useOptionalPromptBlocked';

const SNOOZE_KEY = 'vybe_push_prompt_snoozed_until';
const DISABLED_KEY = 'vybe_push_prompt_disabled';
const SNOOZE_DAYS = 30;

function isSnoozed(): boolean {
  try {
    if (readDevicePreference(DISABLED_KEY) === '1') return true;
    const raw = readDevicePreference(SNOOZE_KEY);
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
  const [snoozed, setSnoozed] = useState(isSnoozed);
  const [despiaPushEnabled, setDespiaPushEnabled] = useState<boolean | null>(null);
  const consent = useCrashReportConsentState();
  const generation = useRef(0);
  const native = isDespiaRuntime();

  useEffect(() => {
    const update = () => setSnoozed(isSnoozed());
    const snooze = subscribeDevicePreference(SNOOZE_KEY, update);
    const disable = subscribeDevicePreference(DISABLED_KEY, update);
    update();
    return () => { snooze(); disable(); };
  }, []);

  useEffect(() => {
    generation.current++;
    setReady(false);
    setDespiaPushEnabled(null);
    const delayMs = native ? 1_500 : 3_000;
    const t = setTimeout(() => setReady(true), delayMs);
    return () => { generation.current++; clearTimeout(t); };
  }, [profile?.id, native]);

  useEffect(() => {
    if (!ready || !profile?.id || !native) return;
    let active = true;
    void checkDespiaPushPermission().then((enabled) => {
      if (!active) return;
      setDespiaPushEnabled(enabled === true);
      if (enabled === true) {
        writeDevicePreference(DISABLED_KEY, '1');
      }
    }).catch(() => { if (active) setDespiaPushEnabled(false); });
    return () => { active = false; };
  }, [ready, profile?.id, native]);

  useEffect(() => {
    if (isSubscribed || permission === 'granted' || despiaPushEnabled === true) {
      writeDevicePreference(DISABLED_KEY, '1');
    }
  }, [isSubscribed, permission, despiaPushEnabled]);

  const onEnable = useCallback(async () => {
    const started = generation.current;
    const ok = await subscribe();
    if (ok && started === generation.current) {
      setDespiaPushEnabled(true);
      writeDevicePreference(DISABLED_KEY, '1');
    }
  }, [subscribe]);

  const onDismiss = useCallback(() => {
    const until = new Date(Date.now() + SNOOZE_DAYS * 86400_000).toISOString();
    writeDevicePreference(SNOOZE_KEY, until);
  }, []);

  const eligible = ready && !!profile?.id && consent !== null && !snoozed
    && isSupported && !isCheckingSubscription && !isSubscribed && permission !== 'granted'
    && (native ? despiaPushEnabled === false : permission !== 'denied');
  const blocked = useOptionalPromptBlocked('push', eligible);
  const open = eligible && !blocked;

  return { open, onEnable, onDismiss, isLoading };
}
