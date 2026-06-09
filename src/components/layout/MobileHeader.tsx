import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Target, Flame } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useUnreadCount } from '@/hooks/useNotifications';
import { useStreakCount } from '@/hooks/useLoginStreak';
import { cn } from '@/lib/utils';
import { HeaderSearch } from './HeaderSearch';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { useDebugPanel } from '@/contexts/DebugPanelContext';
import { navVisibility } from '@/lib/navVisibility';

export const MobileHeader = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<'header'>>(function MobileHeader(_props, ref) {
  const { data: unreadCount = 0 } = useUnreadCount();
  const streakCount = useStreakCount();
  const prevUnreadRef = useRef(unreadCount);
  const [bellBounce, setBellBounce] = useState(false);
  const location = useLocation();
  const debugPanel = useDebugPanel();
  const [headerVisible, setHeaderVisible] = useState(true);

  useEffect(() => {
    if (unreadCount > prevUnreadRef.current) {
      setBellBounce(true);
      const t = setTimeout(() => setBellBounce(false), 1500);
      return () => clearTimeout(t);
    }
    prevUnreadRef.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => {
    return navVisibility.subscribeHeader(setHeaderVisible);
  }, []);

  const isNotificationsActive = location.pathname === '/notifications';
  const isChallengesActive = location.pathname === '/challenges';

  if (location.pathname === '/clips' || !headerVisible) {
    return null;
  }

  return (
    <header
      ref={ref}
      data-no-auto-contrast
      data-app-mobile-header
      className="fixed top-0 inset-x-0 z-50 pointer-events-none"
    >
      <div
        className="px-3 pb-2 pointer-events-auto"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.5rem)' }}
      >
        <div className="flex items-center gap-1.5 h-11 pl-1 pr-1.5 rounded-[1.25rem] bg-background/78 backdrop-blur-2xl backdrop-saturate-150 border border-white/[0.08] shadow-[0_10px_40px_-14px_rgba(0,0,0,0.72)] ring-1 ring-inset ring-white/[0.05]">
          <Link
            to="/home"
            className="group relative flex items-center justify-center h-9 w-9 rounded-xl bg-white/[0.04] border border-white/[0.06] flex-shrink-0 active:scale-95 transition-transform"
            onClick={() => debugPanel?.handleLogoTap?.()}
            aria-label="Home"
          >
            <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/30 to-accent/30 opacity-0 group-active:opacity-100 transition-opacity" />
            <span className="relative">
              <VYBELogo size="sm" showText={false} />
            </span>
          </Link>

          <HeaderSearch className="flex-1 min-w-0" variant="header" />

          <div className="flex items-center gap-0.5 flex-shrink-0">
            <Link
              to="/notifications"
              data-tutorial="notifications-badge"
              aria-label="Notifications"
              className={cn(
                'relative flex items-center justify-center h-9 w-9 rounded-xl transition-colors active:scale-95',
                isNotificationsActive
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.05]',
              )}
            >
              <Bell className={cn('h-[19px] w-[19px]', bellBounce && 'animate-bell-ring')} strokeWidth={1.85} />
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
                />
              )}
            </Link>

            <Link
              to="/challenges"
              aria-label="Challenges"
              className={cn(
                'relative flex items-center justify-center h-9 w-9 rounded-xl transition-colors active:scale-95',
                isChallengesActive
                  ? 'bg-accent/15 text-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.05]',
              )}
            >
              <Target className="h-[19px] w-[19px]" strokeWidth={1.85} />
            </Link>

            <AnimatePresence>
              {streakCount > 0 && (
                <motion.div
                  initial={{ opacity: 0, width: 0, marginLeft: 0 }}
                  animate={{ opacity: 1, width: 'auto', marginLeft: 2 }}
                  exit={{ opacity: 0, width: 0, marginLeft: 0 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="overflow-hidden"
                >
                  <Link
                    to="/challenges"
                    className="relative flex items-center gap-0.5 h-7 px-2 rounded-full overflow-hidden active:scale-95 transition-transform"
                    aria-label={`${streakCount} day streak`}
                  >
                    <span className="absolute inset-0 bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-500" />
                    <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/20 to-transparent" />
                    <Flame className="relative h-3 w-3 text-white" fill="currentColor" strokeWidth={0} />
                    <span className="relative text-[10px] font-bold text-white tabular-nums leading-none">
                      {streakCount > 99 ? '99+' : streakCount}
                    </span>
                  </Link>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
});
MobileHeader.displayName = 'MobileHeader';
