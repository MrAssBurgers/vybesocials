import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Target, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/hooks/useNotifications';
import { useStreakCount } from '@/hooks/useLoginStreak';
import { cn } from '@/lib/utils';
import { HeaderSearch } from './HeaderSearch';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { useDebugPanel } from '@/contexts/DebugPanelContext';

export const MobileHeader = React.forwardRef<HTMLElement, {}>(function MobileHeader(_props, ref) {
  const { profile } = useAuth();
  const { data: unreadCount = 0 } = useUnreadCount();
  const streakCount = useStreakCount();
  const location = useLocation();
  const debugPanel = useDebugPanel();

  const isNotificationsActive = location.pathname === '/notifications';
  const isChallengesActive = location.pathname === '/challenges';

  // Hide header on clips page for immersive experience
  if (location.pathname === '/clips') {
    return null;
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 safe-area-top">
      <div className="liquid-glass border-b border-foreground/5">
        <div className="flex items-center justify-between h-14 px-3 relative z-10">
          {/* Logo - clean and minimal */}
          <Link 
            to="/home" 
            className="flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-xl hover:bg-muted/30 transition-colors"
            onClick={(e) => {
              if (debugPanel?.handleLogoTap) {
                debugPanel.handleLogoTap();
              }
            }}
          >
            <VYBELogo size="sm" showText={false} />
          </Link>

          {/* Center - Search - clean styling */}
          <HeaderSearch className="flex-1 mx-3" />

          {/* Right side - Notifications & Challenges */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Notifications */}
            <Link
              to="/notifications"
              className={cn(
                "relative flex items-center justify-center h-9 w-9 rounded-xl transition-all",
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
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 bg-destructive rounded-full flex items-center justify-center text-[9px] text-destructive-foreground font-bold shadow-sm"
                  >
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>

            {/* Challenges with streak indicator */}
            <Link
              to="/challenges"
              className={cn(
                "relative flex items-center justify-center h-9 w-9 rounded-xl transition-all",
                isChallengesActive 
                  ? "bg-accent/15 text-accent" 
                  : "hover:bg-muted/30 text-muted-foreground hover:text-foreground"
              )}
            >
              <Target className="h-5 w-5" />
              {/* Streak badge */}
              <AnimatePresence>
                {streakCount > 0 && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 25 }}
                    className="absolute -top-1 -right-1 flex items-center gap-0.5 h-4 min-w-4 px-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-full shadow-sm"
                  >
                    <Flame className="h-2.5 w-2.5 text-white" />
                    <span className="text-[9px] text-white font-bold">{streakCount > 99 ? '99' : streakCount}</span>
                  </motion.div>
                )}
              </AnimatePresence>
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
});
MobileHeader.displayName = 'MobileHeader';