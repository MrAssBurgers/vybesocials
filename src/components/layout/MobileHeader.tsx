import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Flame, Target } from 'lucide-react';
import { motion } from 'framer-motion';
import { useUnreadCount } from '@/hooks/useNotifications';
import { useStreakCount } from '@/hooks/useLoginStreak';
import { cn } from '@/lib/utils';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { HeaderSearch } from './HeaderSearch';
import { VYBELogo } from '@/components/ui/VYBELogo';
import { useDebugPanel } from '@/contexts/DebugPanelContext';
import { navVisibility } from '@/lib/navVisibility';

const TOOLBAR_H = 'h-10';

const iconButtonClass = (active: boolean) =>
  cn(
    'relative flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-150 active:scale-95',
    active
      ? 'text-primary'
      : 'text-muted-foreground hover:text-foreground',
  );

export const MobileHeader = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<'header'>>(function MobileHeader(_props, ref) {
  const { data: unreadCount = 0 } = useUnreadCount();
  const streakCount = useStreakCount();
  const prevUnreadRef = useRef(unreadCount);
  const [bellBounce, setBellBounce] = useState(false);
  const location = useLocation();
  const debugPanel = useDebugPanel();
  const [headerVisible, setHeaderVisible] = useState(true);
  const nativePerf = isNativePerfMode();

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

  const hideHeader =
    location.pathname === '/clips' ||
    location.pathname === '/shorts' ||
    location.pathname.startsWith('/clips/') ||
    location.pathname.startsWith('/watch/');

  if (hideHeader || !headerVisible) {
    return null;
  }

  return (
    <header
      ref={ref}
      data-no-auto-contrast
      data-app-mobile-header
      className="fixed top-0 inset-x-0 z-50 pointer-events-none"
    >
      {/*
        Background lives on the same box as padding-top so the status-bar /
        Dynamic Island region stays opaque (WebKit often refuses to paint
        absolute -z-10 fills under padding). Despia: --safe-area-top first.
      */}
      <div
        className={cn(
          'pointer-events-auto relative',
          nativePerf
            ? 'bg-[hsl(var(--background))]'
            : 'bg-[hsl(var(--background)/0.96)] backdrop-blur-xl backdrop-saturate-150',
        )}
        style={{
          paddingTop:
            'calc(0px + var(--safe-area-top, var(--app-header-safe, env(safe-area-inset-top, 0px))))',
          paddingBottom: '0px',
          paddingLeft:
            'calc(0px + var(--safe-area-left, var(--app-gutter-x, max(1rem, env(safe-area-inset-left, 0px)))))',
          paddingRight:
            'calc(0px + var(--safe-area-right, var(--app-gutter-x-end, max(1rem, env(safe-area-inset-right, 0px)))))',
        }}
      >
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute inset-x-0 top-full h-7',
            nativePerf
              ? 'bg-gradient-to-b from-[hsl(var(--background))] to-transparent'
              : 'bg-gradient-to-b from-[hsl(var(--background)/0.96)] to-transparent',
          )}
        />
        <div
          className={cn('flex items-center gap-2.5', TOOLBAR_H)}
        >
          <Link
            to="/home"
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full active:scale-95 transition-transform',
              TOOLBAR_H,
              'w-10',
            )}
            onClick={() => debugPanel?.handleLogoTap?.()}
            aria-label="Home"
          >
            <VYBELogo size="sm" showText={false} />
          </Link>

          <HeaderSearch className="flex-1 min-w-0 h-full" variant="header" />

          <div
            className={cn(
              'flex shrink-0 items-center gap-0.5 px-0.5',
              TOOLBAR_H,
              'rounded-full border border-foreground/[0.06] bg-transparent',
            )}
            aria-label="Quick actions"
          >
            <Link
              to="/notifications"
              data-tutorial="notifications-badge"
              aria-label="Notifications"
              className={iconButtonClass(isNotificationsActive)}
            >
              <Bell className={cn('h-[17px] w-[17px]', bellBounce && 'animate-bell-ring')} strokeWidth={1.75} />
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-primary ring-[1.5px] ring-[hsl(var(--background))]"
                />
              )}
            </Link>

            <span className="h-4 w-px bg-foreground/[0.08]" aria-hidden />

            <Link
              to="/challenges"
              aria-label={streakCount > 0 ? `Challenges, ${streakCount} day streak` : 'Challenges'}
              className={iconButtonClass(isChallengesActive)}
            >
              <Target className="h-[17px] w-[17px]" strokeWidth={1.75} />
              {streakCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-[15px] items-center gap-[1px] rounded-full bg-gradient-to-br from-orange-500 to-red-500 pl-0.5 pr-1 text-[8px] font-bold leading-none text-white ring-[1.5px] ring-[hsl(var(--background))]">
                  <Flame className="h-2.5 w-2.5 fill-white text-white" strokeWidth={0} />
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
