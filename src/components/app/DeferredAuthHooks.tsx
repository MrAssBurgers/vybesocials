import { usePrefetchBackgrounds } from '@/hooks/useUserBackgrounds';
import { useGlobalRealtimeMessages } from '@/hooks/useGlobalRealtimeMessages';
import { useDynamicFavicon } from '@/hooks/useDynamicFavicon';
import { useDynamicManifest } from '@/hooks/useDynamicManifest';
import { useRetroactiveSync } from '@/hooks/useRetroactiveSync';
import { useDailyLoginChallenge } from '@/hooks/useDailyLogin';
import { useCaptureNotifications } from '@/hooks/useCaptureDetection';


/**
 * Deferred auth hooks - lazy loaded to reduce initial bundle size.
 * These hooks are non-critical for first paint and can load after the app shell renders.
 */
export default function DeferredAuthHooks() {
  usePrefetchBackgrounds();
  useGlobalRealtimeMessages();
  useDynamicFavicon();
  useDynamicManifest();
  useRetroactiveSync();
  useDailyLoginChallenge();
  useCaptureNotifications();
  useInitEncryption();
  return null;
}
