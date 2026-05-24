import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import App from "./App.tsx";
import "./index.css";
import { initializeNativePlugins, isNativePlatform, isWeb } from "./lib/capacitor";
import { initializeAdMob } from "./lib/admob";
import { cleanupPreviewServiceWorkers, isPreviewServiceWorkerDisabled } from "./lib/serviceWorker";
import { warmupAnimations, preloadFramerMotion } from "./lib/animationWarmup";
import { installFlickerGuardCheck } from "./lib/flickerGuardCheck";
import { installDespiaRealtimeTransport } from "./lib/installDespiaRealtimeTransport";
import { initSentry } from "./lib/sentry";
import { ErrorBoundary } from "./components/ErrorBoundary";

// Initialize Sentry as early as possible so we capture init-time errors.
initSentry();

// Inside Despia, route Supabase Realtime WebSockets through the native bridge
// so connections survive WebView reloads and backgrounding.
installDespiaRealtimeTransport();

// One-time cleanup: legacy biometric app-lock pref (card + gate were removed).
try { localStorage.removeItem('vybe.bioauth.enabled'); } catch { /* ignore */ }

// Warm up keyframes and preload Framer Motion at idle so first animations are jank-free
warmupAnimations();
preloadFramerMotion();

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

// Initialize native plugins if running on native platform
if (isNativePlatform) {
  initializeNativePlugins().then(() => {
    console.log('[VYBE] Native platform initialized');
    // Initialize AdMob after native plugins are ready
    initializeAdMob();
  });
}

// Register service worker for web push notifications
if (isWeb && 'serviceWorker' in navigator) {
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

      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      console.log('[VYBE] Service worker registered:', registration.scope);
      
      // Check for updates periodically
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000); // Check every hour
    } catch (error) {
      console.error('[VYBE] Service worker registration failed:', error);
    }
  });
}

// Enable concurrent features for better performance
const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <ErrorBoundary scope="root">
      <App />
    </ErrorBoundary>
  </StrictMode>
);
