import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { motion, AnimatePresence } from 'framer-motion';

export function PushNotificationPrompt() {
  const { 
    isSupported, 
    isLoading, 
    isCheckingSubscription,
    subscribe 
  } = usePushNotifications();
  
  const [shouldShow, setShouldShow] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>('default');

  // Check browser permission directly on mount and when window regains focus
  useEffect(() => {
    const checkBrowserPermission = () => {
      if ('Notification' in window) {
        setBrowserPermission(Notification.permission);
      }
    };

    checkBrowserPermission();
    
    // Re-check when window regains focus (user might have changed settings)
    window.addEventListener('focus', checkBrowserPermission);
    return () => window.removeEventListener('focus', checkBrowserPermission);
  }, []);

  useEffect(() => {
    // Wait until subscription check is complete
    if (isCheckingSubscription) {
      return;
    }

    // If browser permission is granted, never show
    if (browserPermission === 'granted') {
      setShouldShow(false);
      return;
    }

    // Don't show if not supported
    if (!isSupported) {
      setShouldShow(false);
      return;
    }

    // Check if user dismissed temporarily (24 hour cooldown)
    const dismissedUntil = localStorage.getItem('push-prompt-dismissed-until');
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil)) {
      setShouldShow(false);
      return;
    }

    // Show prompt quickly if notifications not enabled
    const timer = setTimeout(() => {
      setShouldShow(true);
    }, 500);

    return () => clearTimeout(timer);
  }, [isSupported, isCheckingSubscription, browserPermission]);

  const handleDismiss = () => {
    // Dismiss for 24 hours, then show again if still not enabled
    const oneDayFromNow = Date.now() + (24 * 60 * 60 * 1000);
    localStorage.setItem('push-prompt-dismissed-until', oneDayFromNow.toString());
    setShouldShow(false);
  };

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      // Clear dismiss timer and hide
      localStorage.removeItem('push-prompt-dismissed-until');
      setShouldShow(false);
    }
  };

  if (!shouldShow) {
    return null;
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="push-prompt"
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-6 md:w-96"
      >
        <div className="bg-card border border-border rounded-xl p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-primary/10 rounded-full">
              <Bell className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground">Stay Updated</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Get notified about calls and messages instantly.
              </p>
              <div className="flex gap-2 mt-3">
                <Button
                  size="sm"
                  onClick={handleEnable}
                  disabled={isLoading}
                >
                  {isLoading ? 'Enabling...' : 'Enable'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleDismiss}
                >
                  Not now
                </Button>
              </div>
            </div>
            <button
              onClick={handleDismiss}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
