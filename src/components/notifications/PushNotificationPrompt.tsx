import { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useAuth } from '@/lib/auth';
import { motion, AnimatePresence } from 'framer-motion';

export function PushNotificationPrompt() {
  const { user } = useAuth();
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

    // Don't show if user is not signed in
    if (!user) {
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
  }, [isSupported, isCheckingSubscription, browserPermission, user]);

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
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 pointer-events-none"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm pointer-events-auto"
          onClick={handleDismiss}
        />
        
        {/* Modal */}
        <motion.div 
          className="relative w-full max-w-sm bg-card/95 backdrop-blur-xl border border-border/50 rounded-2xl p-6 shadow-2xl pointer-events-auto"
          initial={{ scale: 0.9 }}
          animate={{ scale: 1 }}
          exit={{ scale: 0.9 }}
        >
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-1 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Content */}
          <div className="flex flex-col items-center text-center">
            {/* Icon */}
            <div className="p-4 bg-primary/10 rounded-full mb-4">
              <Bell className="h-8 w-8 text-primary" />
            </div>
            
            {/* Text */}
            <h3 className="text-xl font-semibold text-foreground mb-2">
              Stay Updated
            </h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-[280px]">
              Get notified instantly when friends message or call you.
            </p>
            
            {/* Actions */}
            <div className="flex flex-col w-full gap-2">
              <Button
                onClick={handleEnable}
                disabled={isLoading}
                className="w-full"
                size="lg"
              >
                {isLoading ? 'Enabling...' : 'Enable Notifications'}
              </Button>
              <Button
                variant="ghost"
                onClick={handleDismiss}
                className="w-full text-muted-foreground"
                size="sm"
              >
                Maybe Later
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
