import { useState, useEffect, useCallback } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const SESSION_COUNT_KEY = 'vybe_session_count';
const PWA_DISMISSED_KEY = 'vybe_pwa_dismissed';

/**
 * PWA install prompt hook.
 * Shows install prompt after 3 sessions, unless dismissed or already installed.
 */
export function usePWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed as PWA
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
      return;
    }

    // Check if user dismissed previously
    const dismissed = localStorage.getItem(PWA_DISMISSED_KEY);
    if (dismissed) return;

    // Increment session count
    const count = parseInt(localStorage.getItem(SESSION_COUNT_KEY) || '0', 10) + 1;
    localStorage.setItem(SESSION_COUNT_KEY, String(count));

    // Only show after 3 sessions
    if (count < 3) return;

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowPrompt(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const install = useCallback(async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setShowPrompt(false);
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  const dismiss = useCallback(() => {
    localStorage.setItem(PWA_DISMISSED_KEY, 'true');
    setShowPrompt(false);
    setDeferredPrompt(null);
  }, []);

  return { showPrompt, install, dismiss, isInstalled };
}
