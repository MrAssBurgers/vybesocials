/**
 * Rate VYBE — opens the app's listing on the Play Store (or web fallback).
 *
 * On Android wrappers (Capacitor / Despia / generic WebView) we try to open
 * the native `market://` URL first so users land directly in the Play Store
 * app's review screen. If that fails, or on the web, we fall back to the
 * https Play Store URL.
 */
export const PLAY_STORE_PACKAGE = 'com.despia.vybe';
export const PLAY_STORE_URL = `https://play.google.com/store/apps/details?id=${PLAY_STORE_PACKAGE}`;
const MARKET_URL = `market://details?id=${PLAY_STORE_PACKAGE}`;

const RATE_PROMPT_KEY = 'vybe_rate_prompt_state_v1';

interface RatePromptState {
  rated?: boolean;
  dismissedAt?: number;
  lastShownAt?: number;
}

function readState(): RatePromptState {
  try {
    const raw = localStorage.getItem(RATE_PROMPT_KEY);
    return raw ? (JSON.parse(raw) as RatePromptState) : {};
  } catch {
    return {};
  }
}

function writeState(state: RatePromptState) {
  try {
    localStorage.setItem(RATE_PROMPT_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function isNativeAndroidWrapper(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = (navigator.userAgent || '').toLowerCase();
  return /android/.test(ua) && /despia|capacitor|cordova|median|gonative|wv\)|; wv\b/.test(ua);
}

export function openRateApp() {
  try {
    if (isNativeAndroidWrapper()) {
      // Try native Play Store URI first
      window.location.href = MARKET_URL;
      // Fallback after a brief moment if market:// is unhandled
      setTimeout(() => {
        try { window.open(PLAY_STORE_URL, '_blank', 'noopener,noreferrer'); } catch { /* ignore */ }
      }, 600);
    } else {
      window.open(PLAY_STORE_URL, '_blank', 'noopener,noreferrer');
    }
    const state = readState();
    state.rated = true;
    state.lastShownAt = Date.now();
    writeState(state);
  } catch {
    /* ignore */
  }
}

export function dismissRatePrompt(snoozeDays = 14) {
  const state = readState();
  state.dismissedAt = Date.now() + snoozeDays * 24 * 60 * 60 * 1000;
  writeState(state);
}

/**
 * Should we show the milestone "rate the app" prompt?
 *  - Never if the user already tapped Rate.
 *  - Never if they dismissed and the snooze window hasn't passed.
 *  - Otherwise yes when caller decides the milestone has been hit.
 */
export function shouldShowRatePrompt(): boolean {
  const state = readState();
  if (state.rated) return false;
  if (state.dismissedAt && Date.now() < state.dismissedAt) return false;
  return true;
}

export function markRatePromptShown() {
  const state = readState();
  state.lastShownAt = Date.now();
  writeState(state);
}
