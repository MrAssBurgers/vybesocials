/**
 * In-feed native / inline AdMob slots for the home feed.
 * Uses Despia WebView inline bridge (adsbygoogle) when available.
 */

import { DESPIA_ADMOB_IDS } from './despiaRewardedAds';
import { isDespiaRuntime } from './despiaBridge';

export const ADMOB_PUBLISHER_ID = 'ca-app-pub-9952523729646293';
export const ADMOB_NATIVE_FEED_UNIT = DESPIA_ADMOB_IDS.android.nativeAdvanced;

let scriptLoading: Promise<void> | null = null;

function loadAdSenseScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).adsbygoogle) return Promise.resolve();
  if (scriptLoading) return scriptLoading;

  scriptLoading = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-vybe-adsense]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('adsense load failed')));
      return;
    }

    const s = document.createElement('script');
    s.async = true;
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADMOB_PUBLISHER_ID}`;
    s.crossOrigin = 'anonymous';
    s.setAttribute('data-vybe-adsense', '1');
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('adsense load failed'));
    document.head.appendChild(s);
  });

  return scriptLoading;
}

/** Push a single inline ad into a container element (Despia WebView bridge). */
export async function pushInlineFeedAd(container: HTMLElement | null): Promise<boolean> {
  if (!container || !isDespiaRuntime()) return false;

  try {
    await loadAdSenseScript();
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', ADMOB_PUBLISHER_ID);
    ins.setAttribute('data-ad-slot', ADMOB_NATIVE_FEED_UNIT.split('/')[1] ?? '');
    ins.setAttribute('data-ad-format', 'fluid');
    ins.setAttribute('data-ad-layout-key', '-fb+5w+4e-db+86');
    ins.setAttribute('data-full-width-responsive', 'true');

    container.innerHTML = '';
    container.appendChild(ins);

    ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
    return true;
  } catch (err) {
    console.warn('[nativeFeedAds] inline push failed', err);
    return false;
  }
}
