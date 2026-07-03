/**
 * Bundled to public/boot-theme.js — synchronous pre-paint theme before React.
 */
import { prepaintThemeFromStorage, reinforceSplashTheme } from './lib/theme/themePrepaint';

declare global {
  interface Window {
    __vybeStampSplashTheme?: () => void;
  }
}

window.__vybeStampSplashTheme = () => {
  reinforceSplashTheme();
};

try {
  const painted = prepaintThemeFromStorage();
  if (painted) {
    document.documentElement.setAttribute('data-vybe-theme-painted', 'true');
  }
  if (document.getElementById('vybe-static-boot')) {
    window.__vybeStampSplashTheme();
  } else {
    document.addEventListener('DOMContentLoaded', () => window.__vybeStampSplashTheme?.(), { once: true });
  }
} catch {
  /* fail open — earlyThemeBoot retries after index.css */
}
