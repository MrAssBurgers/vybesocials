import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import { HeaderSearch } from './HeaderSearch';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { useDebugPanel } from '@/contexts/DebugPanelContext';
import { navVisibility } from '@/lib/navVisibility';

export const MobileHeader = React.forwardRef<HTMLElement, {}>(function MobileHeader(_props, ref) {
  const { profile } = useAuth();
  const { data: unreadCount = 0 } = useUnreadCount();
  const location = useLocation();
  const debugPanel = useDebugPanel();
  const [headerVisible, setHeaderVisible] = useState(true);

  useEffect(() => {
    return navVisibility.subscribeHeader(setHeaderVisible);
  }, []);

  const isNotificationsActive = location.pathname === '/notifications';

  if (location.pathname === '/clips' || !headerVisible) {
    return null;
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 safe-area-top">
      <div className="bg-background/95 border-b border-border/30">
        <div className="flex items-center justify-between h-12 px-3 relative z-10">
          {/* Logo */}
          <Link
            to="/home"
            className="flex items-center justify-center h-9 w-9 rounded-xl hover:bg-muted/30 transition-colors flex-shrink-0"
            onClick={() => { debugPanel?.handleLogoTap?.(); }}
          >
            <VYBELogo size="sm" showText={false} />
          </Link>

          {/* Search */}
          <HeaderSearch className="flex-1 mx-3" />

          {/* Notifications only */}
          <Link
            to="/notifications"
            data-tutorial="notifications-badge"
            className={cn(
              "relative flex items-center justify-center h-9 w-9 rounded-xl transition-all flex-shrink-0",
              isNotificationsActive
                ? "bg-primary/15 text-primary"
                : "hover:bg-muted/30 text-muted-foreground hover:text-foreground"
            )}
          >
            <Bell className="h-5 w-5" />
            <AnimatePresence>
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold"
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </motion.span>
              )}
            </AnimatePresence>
          </Link>
        </div>
      </div>
    </header>
  );
});
MobileHeader.displayName = 'MobileHeader';
