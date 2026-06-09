import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, Target, Flame } from 'lucide-react';
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
      {/* Status bar zone — keep UI out of system clock / signal / battery */}
      <div className="h-[var(--app-header-safe,env(safe-area-inset-top,0px))] w-full shrink-0" aria-hidden />

      <div
        className="pointer-events-auto px-3 pb-2 pt-1"
        style={{
          paddingRight: 'max(0.75rem, var(--app-header-safe-right, 0px))',
        }}
      >
        <div className="relative flex items-center gap-2 h-11 px-2 rounded-2xl bg-background/78 backdrop-blur-2xl backdrop-saturate-150 border border-white/[0.09] shadow-[0_10px_36px_-16px_rgba(0,0,0,0.85)] ring-1 ring-inset ring-white/[0.06]">
          <div
            className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent"
            aria-hidden
          />

          <Link
            to="/home"
            className="group relative flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-br from-white/[0.06] to-white/[0.02] border border-white/[0.08] flex-shrink-0 active:scale-95 transition-transform"
            onClick={() => debugPanel?.handleLogoTap?.()}
            aria-label="Home"
          >
            <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-primary/35 to-accent/35 opacity-0 group-active:opacity-100 transition-opacity" />
            <span className="relative">
              <VYBELogo size="sm" showText={false} />
            </span>
          </Link>

          <HeaderSearch className="flex-1 min-w-0" variant="header" />

          <div className="flex items-center gap-0.5 flex-shrink-0 rounded-xl bg-white/[0.04] border border-white/[0.06] p-0.5">
            <Link
              to="/notifications"
              data-tutorial="notifications-badge"
              aria-label="Notifications"
              className={cn(
                'relative flex items-center justify-center h-8 w-8 rounded-lg transition-colors active:scale-95',
                isNotificationsActive
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]',
              )}
            >
              <Bell className={cn('h-[18px] w-[18px]', bellBounce && 'animate-bell-ring')} strokeWidth={1.85} />
              {unreadCount > 0 && (
                <motion.span
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-1 right-1 h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary))]"
                />
              )}
            </Link>

            <Link
              to="/challenges"
              aria-label={streakCount > 0 ? `Challenges, ${streakCount} day streak` : 'Challenges'}
              className={cn(
                'relative flex items-center justify-center h-8 w-8 rounded-lg transition-colors active:scale-95',
                isChallengesActive
                  ? 'bg-accent/20 text-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/[0.06]',
              )}
            >
              <Target className="h-[18px] w-[18px]" strokeWidth={1.85} />
              {streakCount > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center gap-px h-4 min-w-4 px-1 rounded-full bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-500 text-[8px] font-bold text-white leading-none shadow-[0_0_10px_rgba(244,63,94,0.55)]">
                  <Flame className="h-2 w-2 shrink-0" fill="currentColor" strokeWidth={0} />
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
