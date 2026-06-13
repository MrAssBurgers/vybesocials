import { usePrefetchBackgrounds } from '@/hooks/useUserBackgrounds';
import { useGlobalRealtimeMessages } from '@/hooks/useGlobalRealtimeMessages';
import { useDynamicFavicon } from '@/hooks/useDynamicFavicon';
import { useDynamicManifest } from '@/hooks/useDynamicManifest';
import { useRetroactiveSync } from '@/hooks/useRetroactiveSync';
import { useDailyLoginChallenge } from '@/hooks/useDailyLogin';
import { useCaptureNotifications } from '@/hooks/useCaptureDetection';
import { useApplyAutoTheme } from '@/hooks/useApplyAutoTheme';
import { useSessionTracking } from '@/hooks/useSessionTracking';
import { useAuth } from '@/lib/auth';
import { useEffect, useRef } from 'react';
import { debugLog } from '@/lib/debugSessionLog';

/**
 * Deferred auth hooks - lazy loaded to reduce initial bundle size.
 * These hooks are non-critical for first paint and can load after the app shell renders.
 */
export default function DeferredAuthHooks() {
  const { user, profile, authReady } = useAuth();
  const bootLogged = useRef(false);

  useEffect(() => {
    if (!authReady || bootLogged.current) return;
    bootLogged.current = true;
    // #region agent log
    debugLog('DeferredAuthHooks.tsx', 'app boot auth snapshot', {
      hasUser: !!user,
      userId: user?.id ?? null,
      profileId: profile?.id ?? null,
      onboardingCompleted: profile?.onboarding_completed ?? null,
      href: typeof window !== 'undefined' ? window.location.href : null,
      supabaseProject: import.meta.env.VITE_SUPABASE_PROJECT_ID ?? null,
    }, 'H0-env', 'verify');
    // #endregion
  }, [authReady, user, profile?.id, profile?.onboarding_completed]);

  usePrefetchBackgrounds();
  useGlobalRealtimeMessages();
  useDynamicFavicon();
  useDynamicManifest();
  useRetroactiveSync();
  useDailyLoginChallenge();
  useCaptureNotifications();
  useApplyAutoTheme();
  useSessionTracking();
  
  return null;
}
