import despia from 'despia-native';
import { isDespiaRuntime } from '@/lib/despiaBridge';
import { recordAdImpression } from '@/lib/adPreferences';

const FEED_AD_LAST_KEY = 'vybe_feed_ad_last';
const FEED_AD_COOLDOWN_MS = 45_000;

function canShowFeedAd(): boolean {
  try {
    const last = Number(localStorage.getItem(FEED_AD_LAST_KEY) || '0');
    return Date.now() - last >= FEED_AD_COOLDOWN_MS;
  } catch {
    return true;
  }
}

function markFeedAdShown() {
  try {
    localStorage.setItem(FEED_AD_LAST_KEY, String(Date.now()));
  } catch { /* ignore */ }
  recordAdImpression();
}

/** Fire a native feed interstitial when a sponsored slot scrolls into view. */
export function showFeedInterstitial(): boolean {
  if (!isDespiaRuntime() || !canShowFeedAd()) return false;
  try {
    despia('displayinterstitialad://');
    markFeedAdShown();
    return true;
  } catch (err) {
    console.warn('[adDelivery] feed interstitial failed', err);
    return false;
  }
}
