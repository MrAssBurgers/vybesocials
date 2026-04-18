import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import App from "./App.tsx";
import "./index.css";
import { initializeNativePlugins, isNativePlatform, isWeb } from "./lib/capacitor";
import { cleanupPreviewServiceWorkers, isPreviewServiceWorkerDisabled } from "./lib/serviceWorker";
import { warmupAnimations, preloadFramerMotion } from "./lib/animationWarmup";

// Warm up keyframes and preload Framer Motion at idle so first animations are jank-free
warmupAnimations();
preloadFramerMotion();

function isPreviewOneSignalDomainError(message: unknown) {
  return typeof message === 'string' && message.includes('Can only be used on: https://vybehub.app');
}

// Initialize native plugins if running on native platform
if (isNativePlatform) {
  initializeNativePlugins().then(() => {
    console.log('[VYBE] Native platform initialized');
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
    <App />
  </StrictMode>
);
