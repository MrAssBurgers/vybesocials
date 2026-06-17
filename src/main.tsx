import "./lib/bootstrapAuthStorage";
import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import App from "./App.tsx";
import "./index.css";
import { initializeNativePlugins, isNativePlatform } from "./lib/capacitor";
import { initializeAdMob } from "./lib/admob";
import { isDespiaRuntime } from "./lib/despiaBridge";
import { syncNativeTrackingConsent } from "./lib/att";
import { installAttResumeRecovery } from "./lib/attResumeRecovery";
import { cleanupPreviewServiceWorkers, isLocalDevHost, isPreviewServiceWorkerDisabled, registerVybeServiceWorker } from "./lib/serviceWorker";
import { warmupAnimations, preloadFramerMotion } from "./lib/animationWarmup";
import { installFlickerGuardCheck } from "./lib/flickerGuardCheck";
import { installDespiaRealtimeTransport } from "./lib/installDespiaRealtimeTransport";
import { initSentry } from "./lib/sentry";
import { initNativePerfMode } from "./lib/nativePerfMode";
import { repairSupabaseAuthStorage, clearLegacySupabaseAuthStorage } from "./lib/supabaseStorageKey";
import { installAuthSessionKeepAlive } from "./lib/authSessionKeepAlive";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { installDespiaNfcDispatcher } from "./lib/despiaNFCv2";
import { installDespiaRewardedAdBridge } from "./lib/despiaRewardedAds";
import { isFirebaseConfigured } from "./lib/firebase/config";
import { initFirebaseAppCheck } from "./lib/firebase/appCheck";
import { isMaintenanceMode } from "./lib/maintenanceMode";
import { MaintenanceScreen } from "./components/system/MaintenanceScreen";
import { FirebaseConfigScreen } from "./components/system/FirebaseConfigScreen";

// Initialize Sentry as early as possible so we capture init-time errors.
initSentry();

// App Check before Firebase AI Logic (Gemini proxy) — reCAPTCHA Enterprise on web.
if (isFirebaseConfigured()) {
  try {
    initFirebaseAppCheck();
  } catch (err) {
    console.warn("[VYBE] App Check init skipped:", err);
  }
}

// Native store shell: static aurora + reduced motion before first paint.
initNativePerfMode();
repairSupabaseAuthStorage();
clearLegacySupabaseAuthStorage();
installAuthSessionKeepAlive();

// Despia NFC: define window.onNFCEvent multiplexer before any nfc://read/write.
installDespiaNfcDispatcher();

// Despia rewarded ads: register updateRewardedStatus before Wallet can mount.
installDespiaRewardedAdBridge();

// Inside Despia, route Supabase Realtime WebSockets through the native bridge
// so connections survive WebView reloads and backgrounding.
installDespiaRealtimeTransport();

// One-time cleanup: legacy biometric app-lock pref (card + gate were removed).
try { localStorage.removeItem('vybe.bioauth.enabled'); } catch { /* ignore */ }

// Warm up keyframes and preload Framer Motion when idle — skip on native (startup jank)
const scheduleAnimationWarmup = () => {
  if (isNativePlatform) return;
  const idle = (window as any).requestIdleCallback as
    | ((cb: () => void, opts?: { timeout: number }) => number)
    | undefined;
  if (idle) {
    idle(() => {
      warmupAnimations();
      preloadFramerMotion();
    }, { timeout: 3000 });
    return;
  }
  setTimeout(() => {
    warmupAnimations();
    preloadFramerMotion();
  }, 400);
};
scheduleAnimationWarmup();

// Dev-only regression check: warns if any gradient-text element lacks a fallback color
installFlickerGuardCheck();

function isPreviewOneSignalDomainError(message: unknown) {
  return typeof message === 'string' && message.includes('Can only be used on: https://vybehub.app');
}

// Suppress benign third-party service worker postMessage warnings (web-monetization
// shim emits these on every navigation when no SW is present — harmless noise).
const noisyPatterns = [
  '[WM] No SW registration for postMessage',
];
const isNoisy = (args: unknown[]) =>
  typeof args[0] === 'string' && noisyPatterns.some((p) => (args[0] as string).includes(p));

const originalConsoleError = console.error;
console.error = (...args: unknown[]) => {
  if (isNoisy(args)) return;
  originalConsoleError.apply(console, args);
};
const originalConsoleWarn = console.warn;
console.warn = (...args: unknown[]) => {
  if (isNoisy(args)) return;
  originalConsoleWarn.apply(console, args);
};

// Mirror Despia ATT before React paints; recover UI after system permission sheets.
syncNativeTrackingConsent();
installAttResumeRecovery();

// Initialize native plugins if running on native platform
if (isNativePlatform) {
  initializeNativePlugins().then(() => {
    console.log('[VYBE] Native platform initialized');
    initializeAdMob();
  });
}

if (isDespiaRuntime()) {
  void initializeAdMob();
}

// Register service worker for PWA offline shell (web + Despia URL mode on vybehub.app)
if ('serviceWorker' in navigator) {
  const shouldIgnorePreviewPushErrors = isPreviewServiceWorkerDisabled();

  window.addEventListener('error', (event) => {
    if (shouldIgnorePreviewPushErrors && isPreviewOneSignalDomainError(event.message)) {
      console.warn('[VYBE] Ignored preview-only OneSignal error');
      event.preventDefault();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    const rejectionMessage = event.reason instanceof Error ? event.reason.message : event.reason;
    if (shouldIgnorePreviewPushErrors && isPreviewOneSignalDomainError(rejectionMessage)) {
      console.warn('[VYBE] Ignored preview-only OneSignal rejection');
      event.preventDefault();
    }
  });

  window.addEventListener('load', async () => {
    try {
      if (isPreviewServiceWorkerDisabled()) {
        await cleanupPreviewServiceWorkers();
        console.info('[VYBE] Service worker disabled for preview host');
        return;
      }

      // Clear any stale SW/cache from prior sessions so local dev matches fresh prod loads.
      if (import.meta.env.DEV && isLocalDevHost()) {
        await cleanupPreviewServiceWorkers();
        console.info('[VYBE] Service worker disabled for local dev');
        return;
      }

      await registerVybeServiceWorker();
    } catch (error) {
      console.error('[VYBE] Service worker registration failed:', error);
    }
  });
}

// Enable concurrent features for better performance
const root = createRoot(document.getElementById("root")!);

if (isMaintenanceMode()) {
  root.render(
    <ErrorBoundary scope="maintenance">
      <MaintenanceScreen />
    </ErrorBoundary>
  );
} else if (!isFirebaseConfigured()) {
  root.render(
    <ErrorBoundary scope="config">
      <FirebaseConfigScreen />
    </ErrorBoundary>
  );
} else {
  root.render(
    <StrictMode>
      <ErrorBoundary scope="root">
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
}
