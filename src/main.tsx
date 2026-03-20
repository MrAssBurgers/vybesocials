import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import App from "./App.tsx";
import "./index.css";
import { initializeNativePlugins, isNativePlatform, isWeb } from "./lib/capacitor";
import { cleanupPreviewServiceWorkers, isPreviewServiceWorkerDisabled } from "./lib/serviceWorker";

// Initialize native plugins if running on native platform
if (isNativePlatform) {
  initializeNativePlugins().then(() => {
    console.log('[VYBE] Native platform initialized');
  });
}

// Register service worker for web push notifications
if (isWeb && 'serviceWorker' in navigator) {
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
