/**
 * Server Status Banner
 * 
 * Shows a banner when there are known server issues.
 * Toggle via localStorage or a feature flag.
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ServerCrash, X } from 'lucide-react';

// Set this to true to show the banner, or use localStorage
const SHOW_SERVER_BANNER_KEY = 'vybe_show_server_banner';

interface ServerStatusBannerProps {
  /** Force show the banner regardless of localStorage */
  forceShow?: boolean;
  /** Custom message to display */
  message?: string;
}

export function ServerStatusBanner({ 
  forceShow = false,
  message = "We're experiencing some issues. Working on it — things will be back soon! 🛠️"
}: ServerStatusBannerProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    // Check if banner should be shown
    const shouldShow = forceShow || localStorage.getItem(SHOW_SERVER_BANNER_KEY) === 'true';
    const wasDismissed = sessionStorage.getItem('server_banner_dismissed') === 'true';
    
    setIsVisible(shouldShow && !wasDismissed);
  }, [forceShow]);

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsVisible(false);
    sessionStorage.setItem('server_banner_dismissed', 'true');
  };

  return (
    <AnimatePresence>
      {isVisible && !isDismissed && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="overflow-hidden"
        >
          <div className="bg-warning text-warning-foreground px-4 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <ServerCrash className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm font-medium truncate">
                {message}
              </p>
            </div>
            
            <button
              onClick={handleDismiss}
              className="p-1 rounded-md hover:bg-black/10 transition-colors flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Utility to toggle the server banner from console or code
 */
export function setServerBannerVisible(visible: boolean) {
  localStorage.setItem(SHOW_SERVER_BANNER_KEY, String(visible));
  // Trigger a storage event so components update
  window.dispatchEvent(new Event('storage'));
}
