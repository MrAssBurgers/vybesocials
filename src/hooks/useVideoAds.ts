import { useCallback, useRef } from 'react';
import despia from 'despia-native';
import { showInterstitial } from '@/lib/admob';
import { isNativePlatform } from '@/lib/capacitor';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { useAuth } from '@/lib/auth';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { getTrackingConsent } from '@/components/app/TrackingConsentDialog';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';

/**
 * YouTube-style video ad orchestrator.
 *
 * Surfaces:
 *   - PRE_ROLL    Played once before the very first video of a session
 *                 (Clips/Shorts opens, or a feed video is tapped to play).
 *   - MID_FEED    Inserted in the Shorts/Clips reel every N clips.
 *   - PRE_VIDEO   Before an inline feed video the user actively starts.
 *
 * All three use AdMob interstitials under the hood. We frequency-cap globally
 * so users don't see ads back-to-back, and respect user gates:
 *   - Premium subscribers skip all ads (once VYBE+ launches the cosmetics gate
 *     can be swapped in for the temporary universal-Pro flag).
 *   - Users under 13 (COPPA) never see interstitials.
 *   - Users who denied tracking consent never see ads.
 *   - Web sessions are no-ops (native AdMob only).
 *
 * Frequency caps are persisted in localStorage per user so refreshes can't bypass.
 */

const SESSION_KEY = 'vybe_video_ads_session';
const GLOBAL_COOLDOWN_MS = 90 * 1000;          // 90s between ANY two video ads
const MID_FEED_EVERY_N_CLIPS = 6;              // ad every 6 clips watched
const MAX_VIDEO_ADS_PER_SESSION = 8;           // hard cap per app open
const PRE_VIDEO_COOLDOWN_MS = 5 * 60 * 1000;   // 5 min between pre-video ads

type Surface = 'pre_roll' | 'mid_feed' | 'pre_video';

interface SessionState {
  startedAt: number;
  lastAdAt: number;
  totalShown: number;
  preRollShown: boolean;
  lastPreVideoAt: number;
}

function loadSession(): SessionState {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as SessionState;
  } catch {}
  return { startedAt: Date.now(), lastAdAt: 0, totalShown: 0, preRollShown: false, lastPreVideoAt: 0 };
}

function saveSession(s: SessionState) {
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
}

export function useVideoAds() {
  const { user } = useAuth();
  const { isPremium, isLoading: premiumLoading } = usePremiumStatus();
  const inFlightRef = useRef(false);

  const { data: userAge } = useQuery({
    queryKey: ['user-age-video-ads', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_own_sensitive_profile');
      if (error || !data) return null;
      const dob = (data as any).date_of_birth;
      if (!dob) return null;
      const birth = new Date(dob);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const m = today.getMonth() - birth.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
      return age;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 60,
  });

  const isUnder13 = typeof userAge === 'number' && userAge < 13;
  const trackingAllowed = getTrackingConsent() === 'allowed';

  // Master gate. If this is false, ad calls are no-ops.
  const adsAllowed =
    isNativePlatform &&
    !premiumLoading &&
    !isPremium &&
    trackingAllowed &&
    !isUnder13;

  /**
   * Show a video ad for a given surface. Returns whether an ad actually played.
   * Always safe to await — never throws, never blocks UI on web.
   */
  const showVideoAd = useCallback(async (surface: Surface): Promise<boolean> => {
    if (!adsAllowed) return false;
    if (inFlightRef.current) return false;

    const s = loadSession();
    const now = Date.now();

    // Hard session cap
    if (s.totalShown >= MAX_VIDEO_ADS_PER_SESSION) return false;
    // Global cooldown between any two video ads
    if (now - s.lastAdAt < GLOBAL_COOLDOWN_MS) return false;

    // Surface-specific gates
    if (surface === 'pre_roll' && s.preRollShown) return false;
    if (surface === 'pre_video' && now - s.lastPreVideoAt < PRE_VIDEO_COOLDOWN_MS) return false;

    inFlightRef.current = true;
    try {
      await showInterstitial();
      const next: SessionState = {
        ...s,
        lastAdAt: Date.now(),
        totalShown: s.totalShown + 1,
        preRollShown: surface === 'pre_roll' ? true : s.preRollShown,
        lastPreVideoAt: surface === 'pre_video' ? Date.now() : s.lastPreVideoAt,
      };
      saveSession(next);
      return true;
    } catch (e) {
      console.warn('[useVideoAds] interstitial failed', e);
      return false;
    } finally {
      inFlightRef.current = false;
    }
  }, [adsAllowed]);

  /**
   * Check whether a given clip index in the Shorts/Clips reel should trigger
   * a mid-feed ad. Pure helper — caller invokes showVideoAd('mid_feed') if true.
   */
  const isMidFeedAdSlot = useCallback((clipIndex: number) => {
    if (!adsAllowed) return false;
    if (clipIndex <= 0) return false;
    return clipIndex % MID_FEED_EVERY_N_CLIPS === 0;
  }, [adsAllowed]);

  return { showVideoAd, isMidFeedAdSlot, adsAllowed };
}
