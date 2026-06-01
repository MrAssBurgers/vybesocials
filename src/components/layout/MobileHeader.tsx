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

export const MobileHeader = React.forwardRef<HTMLElement, React.ComponentPropsWithoutRef<'header'>>(function MobileHeader(_props, ref) {
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
    <header
      data-no-auto-contrast
      className="fixed top-0 left-0 right-0 z-50 backdrop-blur-2xl bg-background/60"
    >
      {/* Ambient gradient wash — replaces the boxy border */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-16 left-1/4 h-32 w-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -top-12 right-0 h-24 w-1/3 rounded-full bg-accent/10 blur-3xl" />
      </div>

      <div className="safe-area-top relative">
        <div className="flex items-center gap-2 h-14 px-4 relative z-10">

          {/* Logo — naked with a soft gradient halo on press */}
          <Link
            to="/home"
            className="group relative flex items-center justify-center h-10 w-10 -ml-1 flex-shrink-0 active:scale-90 transition-transform"
            onClick={() => debugPanel?.handleLogoTap?.()}
          >
            <span className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 blur-md opacity-0 group-hover:opacity-100 group-active:opacity-100 transition-opacity" />
            <span className="relative">
              <VYBELogo size="sm" showText={false} />
            </span>
          </Link>

          {/* Center — fluid pill search with gradient ring on focus */}
          <HeaderSearch className="flex-1 mx-1" />

          {/* Right side — naked icons, generous spacing */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {/* Notifications — circular, no box */}
            <Link
              to="/notifications"
              data-tutorial="notifications-badge"
              className={cn(
                "relative flex items-center justify-center h-10 w-10 rounded-full transition-all active:scale-90",
                isNotificationsActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Bell className={cn("h-[22px] w-[22px]", bellBounce && "animate-bell-ring")} strokeWidth={1.75} />
              {unreadCount > 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]"
                />
              )}
            </Link>

            {/* Challenges + integrated streak chip */}
            <Link
              to="/challenges"
              className={cn(
                "relative flex items-center gap-1.5 h-10 pl-2 pr-1 rounded-full transition-all active:scale-95",
                isChallengesActive
                  ? "text-accent"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Target className="h-[22px] w-[22px]" strokeWidth={1.75} />

              {/* Inline streak pill — flows next to the icon, not a floating badge */}
              <AnimatePresence>
                {streakCount > 0 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.6, x: -4 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.6, x: -4 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                    className="relative flex items-center gap-0.5 h-6 px-1.5 rounded-full overflow-hidden"
                  >
                    {/* Gradient fill */}
                    <span className="absolute inset-0 bg-gradient-to-r from-orange-500 via-rose-500 to-fuchsia-500" />
                    {/* Glossy highlight */}
                    <span className="absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/25 to-transparent" />
                    {/* Outer glow */}
                    <span className="absolute -inset-px rounded-full shadow-[0_0_12px_-2px_rgba(244,63,94,0.7)]" />
                    <Flame className="relative h-3 w-3 text-white drop-shadow" fill="currentColor" strokeWidth={0} />
                    <span className="relative text-[10px] leading-none font-bold text-white tabular-nums tracking-tight">
                      {streakCount > 99 ? '99+' : streakCount}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </Link>
          </div>
        </div>
      </div>

      {/* Whisper-thin gradient hairline instead of a hard border */}
      <div className="h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
    </header>
  );
});
MobileHeader.displayName = 'MobileHeader';