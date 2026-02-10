import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import App from "./App.tsx";
import "./index.css";
import { initializeNativePlugins, isNativePlatform, isWeb } from "./lib/capacitor";
import { RecoveryFallback } from "./components/error/RecoveryFallback";

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
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      console.log('[VYBE] Service worker registered:', registration.scope);
      
      setInterval(() => {
        registration.update();
      }, 60 * 60 * 1000);
    } catch (error) {
      console.error('[VYBE] Service worker registration failed:', error);
    }
  });
}

// Catch unhandled promise rejections globally
window.addEventListener('unhandledrejection', (event) => {
  console.error('[VYBE] Unhandled rejection:', event.reason);
  event.preventDefault();
});

// Try/catch-safe bootstrap — always render something
const root = createRoot(document.getElementById("root")!);
try {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>
  );
} catch (error) {
  console.error('[VYBE] Fatal bootstrap error:', error);
  root.render(<RecoveryFallback />);
}
