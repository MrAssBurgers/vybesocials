import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Target } from 'lucide-react';
import { motion } from 'framer-motion';
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
      {/* Camera / status bar dead zone — toolbar starts below this */}
      <div
        className="w-full shrink-0"
        style={{ height: 'var(--app-header-top, calc(var(--app-header-safe, env(safe-area-inset-top, 0px)) + var(--app-header-gap, 0.75rem)))' }}
        aria-hidden
      />

      <div
        className="pointer-events-auto px-4 pb-[var(--app-header-tail,0.625rem)]"
        style={{ paddingRight: 'max(1rem, calc(0.75rem + var(--app-header-safe-right, 0px)))' }}
      >
        <div className="relative flex items-center gap-2.5 h-12 px-2.5 rounded-[1.35rem] bg-[hsl(var(--background)/0.88)] backdrop-blur-xl border border-white/10 shadow-[0_12px_40px_-18px_rgba(0,0,0,0.9)]">
          <Link
            to="/home"
            className="flex items-center justify-center h-9 w-9 flex-shrink-0 active:scale-95 transition-transform"
            onClick={() => debugPanel?.handleLogoTap?.()}
            aria-label="Home"
          >
            <VYBELogo size="sm" showText={false} />
          </Link>

          <HeaderSearch className="flex-1 min-w-0" variant="header" />

          <div className="flex items-center flex-shrink-0">
            <Link
              to="/notifications"
              data-tutorial="notifications-badge"
              aria-label="Notifications"
              className={cn(
                'relative flex items-center justify-center h-9 w-9 rounded-full transition-colors active:scale-95',
                isNotificationsActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Bell className={cn('h-[19px] w-[19px]', bellBounce && 'animate-bell-ring')} strokeWidth={1.75} />
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary"
                />
              )}
            </Link>

            <Link
              to="/challenges"
              aria-label={streakCount > 0 ? `Challenges, ${streakCount} day streak` : 'Challenges'}
              className={cn(
                'relative flex items-center justify-center h-9 w-9 rounded-full transition-colors active:scale-95',
                isChallengesActive ? 'text-accent' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Target className="h-[19px] w-[19px]" strokeWidth={1.75} />
              {streakCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full bg-gradient-to-br from-orange-500 to-fuchsia-600 text-[9px] font-bold text-white leading-none ring-2 ring-[hsl(var(--background))]">
                  {streakCount > 99 ? '99+' : streakCount}
                </span>
              )}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
});
MobileHeader.displayName = 'MobileHeader';
