import { ReactNode, forwardRef, memo, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MobileHeader } from './MobileHeader';
import { DesktopLeftSidebar } from './DesktopLeftSidebar';
import { DesktopRightSidebar } from './DesktopRightSidebar';
import { useAuth } from '@/lib/auth';
import { hasStoredAuthSession } from '@/lib/legacyAuthStorage';
import { usePresence } from '@/hooks/usePresence';
import { useScrollOptimization } from '@/hooks/useScrollOptimization';
import { useScreenTimeTracker } from '@/hooks/useScreenTime';
import { useBreakpoint } from '@/hooks/usePlatform';
import { cn } from '@/lib/utils';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { isNativePerfMode } from '@/lib/nativePerfMode';
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner';
import { Enable2FANudge } from '@/components/auth/Enable2FANudge';
import { bindAppScrollHideContainer } from '@/lib/scrollHideSync';
import { navVisibility } from '@/lib/navVisibility';
import { setThemePreviewLock } from '@/hooks/useCustomTheme';
import { SelfNowPlayingPill } from '@/components/music/SelfNowPlayingPill';
import { useBottomNavMount } from '@/hooks/useBottomNavMount';
import { installKeyboardFocusScroll } from '@/lib/keyboardFocusScroll';
import { useNativeDocumentScrollLock } from '@/hooks/useNativeDocumentScrollLock';

interface AppLayoutProps {
  children: ReactNode;
  requireAuth?: boolean;
  hideRightSidebar?: boolean;
  fullWidth?: boolean;
  hideNav?: boolean;
  noPadding?: boolean;
  /** The page paints its own bottom navigation and safe-area space. */
  contentOwnsBottomPadding?: boolean;
  /** Force swipe-back when hideNav+noPadding would otherwise disable it (e.g. open DM). */
  enableSwipeBack?: boolean;
}

export const AppLayout = memo(forwardRef<HTMLDivElement, AppLayoutProps>(function AppLayout({
  children,
  requireAuth = true,
  hideRightSidebar = false,
  fullWidth = false,
  hideNav = false,
  noPadding = false,
  contentOwnsBottomPadding = false,
  enableSwipeBack,
}, ref) {
  const { loading, user, profile } = useAuth();
  const location = useLocation();
  const hasStoredSession = hasStoredAuthSession();
  const { isDesktop } = useBreakpoint();
  // iOS WKWebView rubber-bands the document; Android Chromium mostly doesn't.
  // Lock body/html for the app shell so only inner scrollers move.
  useNativeDocumentScrollLock(!isDesktop);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const nativePerf = isNativePerfMode();
  const swipeBackAllowed = !nativePerf && (enableSwipeBack ?? !(hideNav && noPadding));
  const { swipeBackHandlers, swipeProgress } = useSwipeBack(swipeBackAllowed);
  const bottomNavMounted = useBottomNavMount();
  const reserveBottomNavSpace = !hideNav && !noPadding && bottomNavMounted;
  const [navEffectiveVisible, setNavEffectiveVisible] = useState(true);

  useEffect(() => bindAppScrollHideContainer(), []);
  useEffect(() => installKeyboardFocusScroll(), []);

  useEffect(() => {
    return navVisibility.subscribeEffective(setNavEffectiveVisible);
  }, []);

  // Recover immersive overlay flags only — do not reset scroll-hide on every route.
  useEffect(() => {
    navVisibility.setInDesigner(false);
    // Equipped themes persist in localStorage; only clear preview lock outside settings.
    if (!location.pathname.startsWith('/settings')) {
      setThemePreviewLock(false);
    }
  }, [location.pathname]);

  usePresence();
  useScreenTimeTracker();
  useScrollOptimization();

  if (loading && !hasStoredSession) {
    return (
      <div className="vybe-loading-shell app-shell min-h-screen">
        {children}
      </div>
    );
  }

  // Keep the content subtree in one position across breakpoints. Replacing the
  // desktop/mobile trees remounts editors, players and other stateful children.
  return (
    <>
      {isDesktop && <a href="#main-content" className="skip-link sr-only">Skip to content</a>}
      <div
        ref={ref}
        className={cn('app-shell w-full overflow-hidden relative bg-transparent', isDesktop ? 'h-screen' : 'h-[100dvh] overflow-x-hidden')}
        {...(!isDesktop && swipeBackAllowed ? swipeBackHandlers : {})}
      >
        <div className={cn('relative z-[1] flex w-full', isDesktop ? 'h-screen' : 'flex-col h-full min-h-0')}>
          {isDesktop && <DesktopLeftSidebar collapsed={leftCollapsed} onCollapsedChange={setLeftCollapsed} />}
          {!isDesktop && swipeProgress > 0 && <div
            className="fixed left-0 top-0 bottom-0 z-50 w-1 bg-primary/60 rounded-r-full transition-opacity"
            style={{ opacity: swipeProgress, transform: `scaleX(${1 + swipeProgress * 3})` }}
          />}
          {!isDesktop && !hideNav && <MobileHeader />}
          <main
            key="page-content"
            id="main-content"
            data-app-scroll-container={isDesktop ? undefined : 'true'}
            className={cn(
              'main-content main-scroll overflow-x-hidden relative bg-transparent',
              isDesktop ? 'flex-1 min-w-0 h-screen z-[1]' : 'z-[2]',
              noPadding ? isDesktop ? 'overflow-hidden' : 'overflow-hidden flex flex-col min-h-0' : isDesktop ? 'overflow-y-auto scroller' : 'overflow-y-auto scroller native-scroll-shell',
              !isDesktop && !hideNav && !noPadding && 'content-with-header',
            )}
            style={isDesktop ? {
              overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch',
            } : {
              height: hideNav ? '100dvh' : noPadding ? 'calc(100dvh - var(--app-header-height))' : '100dvh',
              marginTop: hideNav || !noPadding ? undefined : 'var(--app-header-height)',
              // noPadding shells (DMs) contain their own scroller.
              touchAction: noPadding ? 'manipulation' : undefined,
              paddingBottom: reserveBottomNavSpace && !contentOwnsBottomPadding
                ? navEffectiveVisible
                  ? 'calc(6rem + var(--sab, env(safe-area-inset-bottom, 0px)))'
                  : 'calc(1.25rem + var(--sab, env(safe-area-inset-bottom, 0px)))'
                : undefined,
              WebkitOverflowScrolling: noPadding ? undefined : 'touch',
              overscrollBehaviorY: 'contain',
              transform: !nativePerf && swipeProgress > 0 && !document.documentElement.classList.contains('is-scrolling')
                ? `translateX(${swipeProgress * 60}px)` : undefined,
              transition: swipeProgress === 0 ? 'transform 0.2s ease-out' : undefined,
            }}
          >
            <div className={isDesktop ? cn('mx-auto w-full', noPadding ? 'h-full' : contentOwnsBottomPadding ? 'px-2 lg:px-3 pt-3' : 'px-2 lg:px-3 py-3', fullWidth ? '' : 'max-w-full') : 'contents'}>
              {children}
            </div>
          </main>
          {isDesktop && !hideRightSidebar && <DesktopRightSidebar />}
          {!isDesktop && <PWAInstallBanner />}
          {!isDesktop && !hideNav && <SelfNowPlayingPill floating />}
          <Enable2FANudge />
        </div>
      </div>
    </>
  );
}));
