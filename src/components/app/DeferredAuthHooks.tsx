import { usePrefetchBackgrounds } from '@/hooks/useUserBackgrounds';
import { useDynamicFavicon } from '@/hooks/useDynamicFavicon';
import { useDynamicManifest } from '@/hooks/useDynamicManifest';
import { useRetroactiveSync } from '@/hooks/useRetroactiveSync';
import { useDailyLoginChallenge } from '@/hooks/useDailyLogin';
import { useCaptureNotifications } from '@/hooks/useCaptureDetection';
import { useApplyAutoTheme } from '@/hooks/useApplyAutoTheme';
import { useSessionTracking } from '@/hooks/useSessionTracking';

/**
 * Deferred auth hooks - lazy loaded to reduce initial bundle size.
 * These hooks are non-critical for first paint and can load after the app shell renders.
 */
export default function DeferredAuthHooks() {
  usePrefetchBackgrounds();
  useDynamicFavicon();
  useDynamicManifest();
  useRetroactiveSync();
  useDailyLoginChallenge();
  useCaptureNotifications();
  useApplyAutoTheme();
  useSessionTracking();

  return null;
}
