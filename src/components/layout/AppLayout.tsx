import { ReactNode, forwardRef, memo, useEffect, useState } from 'react';
import { MobileHeader } from './MobileHeader';
import { DesktopLeftSidebar } from './DesktopLeftSidebar';
import { DesktopRightSidebar } from './DesktopRightSidebar';
import { useAuth } from '@/lib/auth';
import { hasStoredSupabaseSession } from '@/lib/supabaseStorageKey';
import { usePresence } from '@/hooks/usePresence';
import { useScrollOptimization } from '@/hooks/useScrollOptimization';
import { useScreenTimeTracker } from '@/hooks/useScreenTime';
import { useBreakpoint } from '@/hooks/usePlatform';
import { cn } from '@/lib/utils';
import { useDefaultLiquidBackground } from '@/hooks/useDefaultLiquidBackground';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner';
import { Enable2FANudge } from '@/components/auth/Enable2FANudge';
import { PhoneVerifyGate } from '@/components/auth/PhoneVerifyGate';
import { navVisibility } from '@/lib/navVisibility';
import { SelfNowPlayingPill } from '@/components/music/SelfNowPlayingPill';

interface AppLayoutProps {
  children: ReactNode;
  requireAuth?: boolean;
  hideRightSidebar?: boolean;
  fullWidth?: boolean;
  hideNav?: boolean;
  noPadding?: boolean;
}

export const AppLayout = memo(forwardRef<HTMLDivElement, AppLayoutProps>(function AppLayout({
  children,
  requireAuth = true,
  hideRightSidebar = false,
  fullWidth = false,
  hideNav = false,
  noPadding = false,
}, ref) {
  const { loading } = useAuth();
  const hasStoredSession = hasStoredSupabaseSession();
  const { isDesktop } = useBreakpoint();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [navEffectiveVisible, setNavEffectiveVisible] = useState(true);
  const nativePerf = isNativePerfMode();
  const { swipeBackHandlers, swipeProgress } = useSwipeBack(!nativePerf);
  const showLiquidBg = useDefaultLiquidBackground();

  useEffect(() => navVisibility.subscribeEffective(setNavEffectiveVisible), []);

  usePresence();
  useScreenTimeTracker();
  useScrollOptimization();

  if (loading && !hasStoredSession) {
    return (
      <div className={cn('min-h-screen bg-background', showLiquidBg && 'bg-transparent')}>
        {children}
      </div>
    );
  }

  if (isDesktop) {
    return (
      <>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-medium"
        >
          Skip to content
        </a>
        <div ref={ref} className={cn('h-screen w-full overflow-hidden relative bg-background', showLiquidBg && 'bg-transparent')}>
          <div className="relative z-[1] flex h-screen w-full">
            <DesktopLeftSidebar
              collapsed={leftCollapsed}
              onCollapsedChange={setLeftCollapsed}
            />
            <main
              id="main-content"
              className={cn(
                'flex-1 min-w-0 h-screen overflow-x-hidden relative z-[2] bg-background',
                showLiquidBg && 'bg-transparent',
                noPadding ? 'overflow-hidden' : 'overflow-y-auto scroller',
              )}
              style={{
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch',
              }}
            >
              <div
                className={cn(
                  'mx-auto w-full',
                  noPadding ? 'h-full' : 'px-2 lg:px-3 py-3',
                  fullWidth ? '' : 'max-w-full',
                )}
              >
                {children}
              </div>
            </main>
            {!hideRightSidebar && <DesktopRightSidebar />}
          </div>
          <Enable2FANudge />
        </div>
      </>
    );
  }

  return (
    <div
        ref={ref}
        className={cn(
          'h-[100dvh] w-full overflow-hidden overflow-x-hidden relative bg-background',
          showLiquidBg && 'bg-transparent',
        )}
        {...(hideNav && noPadding ? {} : swipeBackHandlers)}
      >
        <div className="relative z-[1] flex flex-col h-full min-h-0">
          {swipeProgress > 0 && (
            <div
              className="fixed left-0 top-0 bottom-0 z-50 w-1 bg-primary/60 rounded-r-full transition-opacity"
              style={{ opacity: swipeProgress, transform: `scaleX(${1 + swipeProgress * 3})` }}
            />
          )}

          {!hideNav && <MobileHeader />}

          <main
            id="main-content"
            data-app-scroll-container="true"
            className={cn(
              'overflow-x-hidden relative z-[2] bg-background',
              showLiquidBg && 'bg-transparent',
              noPadding ? 'overflow-hidden flex flex-col min-h-0' : 'overflow-y-auto scroller native-scroll-shell',
              !hideNav && !noPadding ? 'content-with-header' : '',
            )}
            style={{
              height: hideNav
                ? '100dvh'
                : noPadding
                  ? 'calc(100dvh - var(--app-header-height))'
                  : '100dvh',
              marginTop: hideNav || !noPadding ? undefined : 'var(--app-header-height)',
              touchAction: noPadding ? 'pan-y' : undefined,
              paddingBottom:
                hideNav || noPadding
                  ? undefined
                  : navEffectiveVisible
                    ? 'calc(6rem + env(safe-area-inset-bottom))'
                    : 'env(safe-area-inset-bottom)',
              WebkitOverflowScrolling: 'touch',
              overscrollBehaviorY: 'contain',
              transform: !nativePerf && swipeProgress > 0 ? `translateX(${swipeProgress * 60}px)` : undefined,
              transition:
                swipeProgress === 0
                  ? 'transform 0.2s ease-out, padding-bottom 0.3s ease'
                  : 'padding-bottom 0.3s ease',
            }}
          >
            {children}
          </main>

          <PWAInstallBanner />
          {!hideNav && <SelfNowPlayingPill floating />}
          <Enable2FANudge />
          {requireAuth && <PhoneVerifyGate />}
        </div>
      </div>
  );
}));
