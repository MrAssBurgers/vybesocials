import { createRoot } from "react-dom/client";
import { StrictMode } from "react";
import App from "./App.tsx";
import "./index.css";
import { initializeNativePlugins, isNativePlatform } from "./lib/capacitor";

// Initialize native plugins if running on native platform
if (isNativePlatform) {
  initializeNativePlugins().then(() => {
    console.log('[VYBE] Native platform initialized');
  });
}

// Enable concurrent features for better performance
const root = createRoot(document.getElementById("root")!);
root.render(
  <StrictMode>
    <App />
  </StrictMode>
);
