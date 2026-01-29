import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
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
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      >
        {/* Backdrop */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={handleDismiss}
        />
        
        {/* Modal Card */}
        <motion.div 
          initial={{ y: 20 }}
          animate={{ y: 0 }}
          className="relative w-full max-w-sm bg-card/95 backdrop-blur-md border border-border rounded-3xl p-8 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            {/* Icon */}
            <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-primary via-accent to-primary flex items-center justify-center mb-6 shadow-lg shadow-primary/25">
              <Bell className="h-10 w-10 text-white" />
            </div>
            
            {/* Text */}
            <h2 className="text-2xl font-bold mb-3">Turn on Notifications</h2>
            <p className="text-muted-foreground text-sm mb-8 leading-relaxed">
              Stay connected with instant updates for messages, calls, and friend activity. Never miss a moment!
            </p>
            
            {/* Buttons */}
            <div className="space-y-3">
              <Button 
                onClick={handleEnable}
                disabled={isLoading}
                className="w-full h-12 text-base font-semibold rounded-xl gradient-animated"
              >
                {isLoading ? 'Enabling...' : 'Enable Notifications'}
              </Button>
              <Button 
                variant="ghost" 
                onClick={handleDismiss}
                className="w-full h-10 text-muted-foreground hover:text-foreground"
              >
                Not Now
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
