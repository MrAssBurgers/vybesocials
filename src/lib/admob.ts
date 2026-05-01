import {
  AdMob,
  BannerAdOptions,
  BannerAdSize,
  BannerAdPosition,
  AdOptions,
  RewardAdOptions,
  AdmobConsentStatus,
} from '@capacitor-community/admob';
import { isNativePlatform } from './capacitor';

/**
 * AdMob integration for Vybe Studios.
 *
 * Replace the TEST IDs below with your real AdMob unit IDs from the AdMob console
 * once your account is approved. App ID goes in AndroidManifest.xml (see PLAY_STORE_GUIDE.md).
 *
 * Test IDs (safe to ship while developing — Google's official test units):
 *   App ID:        ca-app-pub-3940256099942544~3347511713
 *   Banner:        ca-app-pub-3940256099942544/6300978111
 *   Interstitial:  ca-app-pub-3940256099942544/1033173712
 *   Rewarded:      ca-app-pub-3940256099942544/5224354917
 */

const USE_TEST_ADS = true; // Flip to false when you have real unit IDs

export const AD_UNIT_IDS = {
  banner: USE_TEST_ADS
    ? 'ca-app-pub-3940256099942544/6300978111'
    : 'REPLACE_WITH_REAL_BANNER_ID',
  interstitial: USE_TEST_ADS
    ? 'ca-app-pub-3940256099942544/1033173712'
    : 'REPLACE_WITH_REAL_INTERSTITIAL_ID',
  rewarded: USE_TEST_ADS
    ? 'ca-app-pub-3940256099942544/5224354917'
    : 'REPLACE_WITH_REAL_REWARDED_ID',
};

let initialized = false;

export async function initializeAdMob() {
  if (!isNativePlatform || initialized) return;
  try {
    await AdMob.initialize({
      testingDevices: [],
      initializeForTesting: USE_TEST_ADS,
    });

    // Request consent (required for EEA users / GDPR)
    const consentInfo = await AdMob.requestConsentInfo();
    if (
      consentInfo.isConsentFormAvailable &&
      consentInfo.status === AdmobConsentStatus.REQUIRED
    ) {
      await AdMob.showConsentForm();
    }

    initialized = true;
    console.log('[AdMob] Initialized');
  } catch (e) {
    console.error('[AdMob] Init failed:', e);
  }
}

export async function showBanner() {
  if (!isNativePlatform) return;
  const options: BannerAdOptions = {
    adId: AD_UNIT_IDS.banner,
    adSize: BannerAdSize.ADAPTIVE_BANNER,
    position: BannerAdPosition.BOTTOM_CENTER,
    margin: 0,
    isTesting: USE_TEST_ADS,
  };
  await AdMob.showBanner(options);
}

export async function hideBanner() {
  if (!isNativePlatform) return;
  await AdMob.hideBanner();
}

export async function removeBanner() {
  if (!isNativePlatform) return;
  await AdMob.removeBanner();
}

export async function showInterstitial() {
  if (!isNativePlatform) return;
  const options: AdOptions = {
    adId: AD_UNIT_IDS.interstitial,
    isTesting: USE_TEST_ADS,
  };
  await AdMob.prepareInterstitial(options);
  await AdMob.showInterstitial();
}

export async function showRewarded(): Promise<{ amount: number; type: string } | null> {
  if (!isNativePlatform) return null;
  const options: RewardAdOptions = {
    adId: AD_UNIT_IDS.rewarded,
    isTesting: USE_TEST_ADS,
  };
  await AdMob.prepareRewardVideoAd(options);
  const reward = await AdMob.showRewardVideoAd();
  return reward ?? null;
}
