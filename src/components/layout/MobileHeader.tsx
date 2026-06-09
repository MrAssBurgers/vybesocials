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

const iconButtonClass = (active: boolean) =>
  cn(
    'relative flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200 active:scale-95',
    active
      ? 'bg-primary/15 text-primary'
      : 'text-muted-foreground hover:bg-white/[0.06] hover:text-foreground',
  );

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
        className="w-full shrink-0"
        style={{ height: 'var(--app-header-top, calc(var(--app-header-safe, env(safe-area-inset-top, 0px)) + var(--app-header-gap, 0.75rem)))' }}
        aria-hidden
      />

      <div
        className={cn(
          'pointer-events-auto border-b border-white/[0.07]',
          'bg-[hsl(var(--background)/0.82)] backdrop-blur-2xl backdrop-saturate-150',
          'shadow-[0_1px_0_0_hsl(var(--primary)/0.08)]',
        )}
        style={{ paddingRight: 'max(1rem, calc(1rem + var(--app-header-safe-right, 0px)))' }}
      >
        <div className="flex items-center gap-2.5 h-12 px-4 pb-[var(--app-header-tail,0.625rem)]">
          <Link
            to="/home"
            className="flex items-center gap-2 flex-shrink-0 active:scale-[0.98] transition-transform"
            onClick={() => debugPanel?.handleLogoTap?.()}
            aria-label="Home"
          >
            <VYBELogo size="sm" showText={false} />
            <span className="text-[13px] font-semibold tracking-[0.18em] text-foreground/90 uppercase">
              VYBE
            </span>
          </Link>

          <HeaderSearch className="flex-1 min-w-0" variant="header" />

          <div
            className="flex items-center gap-0.5 flex-shrink-0 rounded-xl bg-white/[0.04] p-0.5 ring-1 ring-inset ring-white/[0.06]"
            aria-label="Quick actions"
          >
            <Link
              to="/notifications"
              data-tutorial="notifications-badge"
              aria-label="Notifications"
              className={iconButtonClass(isNotificationsActive)}
            >
              <Bell className={cn('h-[18px] w-[18px]', bellBounce && 'animate-bell-ring')} strokeWidth={1.75} />
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary ring-2 ring-[hsl(var(--background))]"
                />
              )}
            </Link>

            <Link
              to="/challenges"
              aria-label={streakCount > 0 ? `Challenges, ${streakCount} day streak` : 'Challenges'}
              className={iconButtonClass(isChallengesActive)}
            >
              <Target className="h-[18px] w-[18px]" strokeWidth={1.75} />
              {streakCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold leading-none text-primary-foreground ring-2 ring-[hsl(var(--background))]">
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
