import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Target, Flame, Crown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/auth';
import { useUnreadCount } from '@/hooks/useNotifications';
import { useStreakCount } from '@/hooks/useLoginStreak';
import { usePremiumStatus } from '@/hooks/usePremiumStatus';
import { cn } from '@/lib/utils';
import { HeaderSearch } from './HeaderSearch';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { useDebugPanel } from '@/contexts/DebugPanelContext';
import { navVisibility } from '@/lib/navVisibility';

export const MobileHeader = React.forwardRef<HTMLElement, {}>(function MobileHeader(_props, ref) {
  const { profile } = useAuth();
  const { data: unreadCount = 0 } = useUnreadCount();
  const streakCount = useStreakCount();
  const prevUnreadRef = useRef(unreadCount);
  const [bellBounce, setBellBounce] = useState(false);

  // Bell bounce when unread count increases
  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setBellBounce(true);
      const t = setTimeout(() => setBellBounce(false), 1500);
      return () => clearTimeout(t);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);
  const { isPremium } = usePremiumStatus();
  const location = useLocation();
  const debugPanel = useDebugPanel();
  const [headerVisible, setHeaderVisible] = useState(true);

  useEffect(() => {
    return navVisibility.subscribeHeader(setHeaderVisible);
  }, []);

  const isNotificationsActive = location.pathname === '/notifications';
  const isChallengesActive = location.pathname === '/challenges';

  // Hide header on clips page or during edit mode
  if (location.pathname === '/clips' || !headerVisible) {
    return null;
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 safe-area-top">
      <div className="liquid-glass border-b border-foreground/5">
        <div className="flex items-center justify-between h-14 px-3 relative z-10">
          {/* Logo - clean and minimal */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <Link 
              to="/home" 
              className="flex items-center justify-center h-9 w-9 rounded-xl hover:bg-muted/30 transition-colors"
              onClick={(e) => {
                if (debugPanel?.handleLogoTap) {
                  debugPanel.handleLogoTap();
                }
              }}
            >
              <VYBELogo size="sm" showText={false} />
            </Link>
            {!isPremium && (
              <Link
                to="/settings?tab=subscription"
                className="flex items-center gap-1 h-7 px-2 rounded-full bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-500/30 hover:from-amber-500/30 hover:to-yellow-500/30 transition-all"
              >
                <Crown className="h-3 w-3 text-amber-500" />
                <span className="text-[10px] font-bold text-amber-500">PRO</span>
              </Link>
            )}
          </div>

          {/* Center - Search - clean styling */}
          <HeaderSearch className="flex-1 mx-3" />

          {/* Right side - Notifications & Challenges */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Notifications */}
            <Link
              to="/notifications"
              data-tutorial="notifications-badge"
              className={cn(
                "relative flex items-center justify-center h-9 w-9 rounded-xl transition-all",
                isNotificationsActive 
                  ? "bg-primary/15 text-primary" 
                  : "hover:bg-muted/30 text-muted-foreground hover:text-foreground"
              )}
            >
              <Bell className={cn("h-5 w-5", bellBounce && "animate-bell-ring")} />
              {unreadCount > 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary shadow-[0_0_6px_hsl(var(--primary)/0.6)]"
                />
              )}
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
      {/* Bottom glow line */}
      <div className="h-[1px] bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
    </header>
  );
});
MobileHeader.displayName = 'MobileHeader';