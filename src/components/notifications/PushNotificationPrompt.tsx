import { useState, useEffect } from 'react';
import { Bell, X, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { motion, AnimatePresence } from 'framer-motion';

export function PushNotificationPrompt() {
  const { 
    isSupported, 
    isSubscribed, 
    isLoading, 
    isCheckingSubscription,
    subscribe 
  } = usePushNotifications();
  
  const [shouldShow, setShouldShow] = useState(false);
  const [showDeniedMessage, setShowDeniedMessage] = useState(false);
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

    // If browser permission is already granted AND subscribed, never show
    if (browserPermission === 'granted' && isSubscribed) {
      setShouldShow(false);
      setShowDeniedMessage(false);
      return;
    }

    // If browser permission is granted but not subscribed in DB, still don't nag
    // The user has granted permission, we just need to sync
    if (browserPermission === 'granted') {
      setShouldShow(false);
      setShowDeniedMessage(false);
      return;
    }

    // If permission denied - show one-time subtle message, don't show enable prompt
    if (browserPermission === 'denied') {
      setShouldShow(false);
      // Check if we already showed the denied message
      const deniedMessageShown = localStorage.getItem('push-denied-message-shown');
      if (!deniedMessageShown) {
        setShowDeniedMessage(true);
        localStorage.setItem('push-denied-message-shown', 'true');
      }
      return;
    }

    // Don't show if not supported
    if (!isSupported) {
      setShouldShow(false);
      return;
    }

    // Check if user already accepted or dismissed (permanent)
    const promptHandled = localStorage.getItem('push-prompt-handled');
    if (promptHandled) {
      setShouldShow(false);
      return;
    }

    // Show prompt after 3 seconds if permission is 'default'
    const timer = setTimeout(() => {
      setShouldShow(true);
    }, 3000);

    return () => clearTimeout(timer);
  }, [isSupported, isSubscribed, isCheckingSubscription, browserPermission]);

  const handleDismiss = () => {
    // Mark as permanently handled
    localStorage.setItem('push-prompt-handled', 'true');
    setShouldShow(false);
  };

  const handleDismissDenied = () => {
    setShowDeniedMessage(false);
  };

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      // Permanently mark as handled
      localStorage.setItem('push-prompt-handled', 'true');
      setShouldShow(false);
    }
  };

  // Show denied message
  if (showDeniedMessage) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-20 left-4 right-4 z-50 md:left-auto md:right-6 md:w-96"
      >
        <div className="bg-card border border-border rounded-xl p-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-muted rounded-full">
              <AlertCircle className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-muted-foreground">
                Notifications are disabled in your browser settings.
              </p>
            </div>
            <button
              onClick={handleDismissDenied}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  // Don't show enable prompt if shouldn't
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
