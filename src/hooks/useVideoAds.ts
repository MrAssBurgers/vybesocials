import { useCallback, useRef } from 'react';
import despia from 'despia-native';
import { showInterstitial } from '@/lib/admob';
import { isNativeAppShell } from '@/lib/despiaBridge';
import { useAdEligibility } from '@/hooks/useAdEligibility';
import { recordAdImpression } from '@/lib/adPreferences';

/**
 * YouTube-style video ad orchestrator (Despia AdMob interstitials).
 *
 * Surfaces: pre_roll, mid_feed, pre_video, mid_video, feed_scroll
 */

const SESSION_KEY = 'vybe_video_ads_session';
const GLOBAL_COOLDOWN_MS = 28 * 1000;
const MID_FEED_RANGE: [number, number] = [4, 6];
const MAX_VIDEO_ADS_PER_SESSION = 14;
const PRE_VIDEO_COOLDOWN_MS = 75 * 1000;
const MID_VIDEO_INTERVAL_RANGE: [number, number] = [120, 240];

type Surface = 'pre_roll' | 'mid_feed' | 'pre_video' | 'mid_video' | 'feed_scroll';

let MID_FEED_SLOT_LADDER: number[] | null = null;
function randInt([min, max]: [number, number]) {
  return Math.floor(min + Math.random() * (max - min + 1));
}
function getMidFeedSlots(maxIndex: number): number[] {
  if (MID_FEED_SLOT_LADDER && MID_FEED_SLOT_LADDER[MID_FEED_SLOT_LADDER.length - 1] >= maxIndex) {
    return MID_FEED_SLOT_LADDER;
  }
  const slots: number[] = [];
  let cur = randInt(MID_FEED_RANGE);
  while (cur <= maxIndex + 30) {
    slots.push(cur);
    cur += randInt(MID_FEED_RANGE);
  }
  MID_FEED_SLOT_LADDER = slots;
  return slots;
}

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
  } catch { /* ignore */ }
  return { startedAt: Date.now(), lastAdAt: 0, totalShown: 0, preRollShown: false, lastPreVideoAt: 0 };
}

function saveSession(s: SessionState) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
}

export function useVideoAds() {
  const { showNativeAds, personalizedAds } = useAdEligibility();
  const inFlightRef = useRef(false);
  const inNativeShell = isNativeAppShell();

  const adsAllowed = showNativeAds && inNativeShell;

  const showVideoAd = useCallback(
    async (surface: Surface): Promise<boolean> => {
      if (!adsAllowed) return false;
      if (inFlightRef.current) return false;

      const s = loadSession();
      const now = Date.now();

      if (s.totalShown >= MAX_VIDEO_ADS_PER_SESSION) return false;
      if (now - s.lastAdAt < GLOBAL_COOLDOWN_MS) return false;

      if (surface === 'pre_roll' && s.preRollShown) return false;
      if (surface === 'pre_video' && now - s.lastPreVideoAt < PRE_VIDEO_COOLDOWN_MS) return false;

      inFlightRef.current = true;
      try {
        if (inNativeShell) {
          try {
            despia('displayinterstitialad://');
          } catch (e) {
            console.warn('[useVideoAds] despia interstitial failed', e);
            return false;
          }
        } else {
          await showInterstitial();
        }

        recordAdImpression();
        saveSession({
          ...s,
          lastAdAt: Date.now(),
          totalShown: s.totalShown + 1,
          preRollShown: surface === 'pre_roll' ? true : s.preRollShown,
          lastPreVideoAt: surface === 'pre_video' ? Date.now() : s.lastPreVideoAt,
        });
        return true;
      } catch (e) {
        console.warn('[useVideoAds] interstitial failed', e);
        return false;
      } finally {
        inFlightRef.current = false;
      }
    },
    [adsAllowed, inNativeShell],
  );

  const isMidFeedAdSlot = useCallback(
    (clipIndex: number) => {
      if (!adsAllowed) return false;
      if (clipIndex <= 0) return false;
      return getMidFeedSlots(clipIndex).includes(clipIndex);
    },
    [adsAllowed],
  );

  const scheduleMidVideoAd = useCallback(
    (isPlaying: boolean) => {
      if (!adsAllowed || !isPlaying) return () => {};
      const delayMs = randInt(MID_VIDEO_INTERVAL_RANGE) * 1000;
      const t = setTimeout(() => {
        showVideoAd('mid_video');
      }, delayMs);
      return () => clearTimeout(t);
    },
    [adsAllowed, showVideoAd],
  );

  return { showVideoAd, isMidFeedAdSlot, scheduleMidVideoAd, adsAllowed, personalizedAds };
}
