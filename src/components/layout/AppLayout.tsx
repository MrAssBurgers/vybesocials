import { ReactNode, forwardRef, memo, useEffect, useState } from 'react';
import { MobileHeader } from './MobileHeader';
import { DesktopLeftSidebar } from './DesktopLeftSidebar';
import { DesktopRightSidebar } from './DesktopRightSidebar';
import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import { usePresence } from '@/hooks/usePresence';
import { useScrollOptimization } from '@/hooks/useScrollOptimization';
import { useScreenTimeTracker } from '@/hooks/useScreenTime';
import { useBreakpoint } from '@/hooks/usePlatform';
import { cn } from '@/lib/utils';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { PWAInstallBanner } from '@/components/pwa/PWAInstallBanner';
import { Enable2FANudge } from '@/components/auth/Enable2FANudge';
import { navVisibility } from '@/lib/navVisibility';

interface AppLayoutProps {
  children: ReactNode;
  requireAuth?: boolean;
  hideRightSidebar?: boolean;
  fullWidth?: boolean;
  hideNav?: boolean; // Hide bottom nav for immersive views like Clips
  noPadding?: boolean; // Remove padding for full-bleed content like DMs
}

// Use forwardRef to avoid React ref warnings
export const AppLayout = memo(forwardRef<HTMLDivElement, AppLayoutProps>(function AppLayout({ 
  children, 
  requireAuth = true, 
  hideRightSidebar = false,
  fullWidth = false,
  hideNav = false,
  noPadding = false
}, ref) {
  const { user, loading } = useAuth();
  const { isDesktop, isTablet, isIPad } = useBreakpoint();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [navEffectiveVisible, setNavEffectiveVisible] = useState(true);
  const { swipeBackHandlers, swipeProgress } = useSwipeBack();

  useEffect(() => navVisibility.subscribeEffective(setNavEffectiveVisible), []);
  
  // Track online presence
  usePresence();
  
  // Track screen time
  useScreenTimeTracker();
  
  // Optimize animations during scroll
  useScrollOptimization();

  // INSTANT NAVIGATION: Minimize loading UI to prevent delays
  // The main splash screen handles initial loading, so subsequent navigations
  // should show content immediately without skeleton flicker
  if (loading) {
    // Return children directly with minimal wrapper to prevent visual delay
    // Auth state will resolve almost immediately after initial load
    return (
      <div className="min-h-screen">
        {children}
      </div>
    );
  }

  // Allow guest browsing - don't redirect if no user
  // Individual components will show auth prompts as needed

  // Desktop layout with sidebars (lg+ only, NOT tablets or iPads)
  if (isDesktop) {
    return (
      <>
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-lg focus:bg-primary focus:text-primary-foreground focus:text-sm focus:font-medium">
          Skip to content
        </a>
        <div ref={ref} className="h-screen w-full overflow-hidden relative">
          <div className="flex h-screen w-full">
            <DesktopLeftSidebar 
              collapsed={leftCollapsed} 
              onCollapsedChange={setLeftCollapsed}
            />
            <main 
              id="main-content"
              className={cn(
                "flex-1 min-w-0 h-screen overflow-x-hidden relative z-[2]",
                noPadding ? "overflow-hidden" : "overflow-y-auto scroller"
              )}
              style={{
                  overscrollBehavior: 'contain',
                  WebkitOverflowScrolling: 'touch',
              }}
            >
              <div 
                className={cn(
                  "mx-auto w-full",
                  noPadding ? "h-full" : "px-2 lg:px-3 py-3",
                  fullWidth ? "" : "max-w-full"
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

  // Mobile/Tablet layout - optimized for smooth scrolling
  return (
    <div 
      ref={ref} 
      className={cn(
        "h-screen w-full overflow-hidden overflow-x-hidden",
        hideNav && noPadding && "!overflow-hidden"
      )}
      style={hideNav && noPadding ? { touchAction: 'none', overscrollBehavior: 'none' } : undefined}
      {...(hideNav && noPadding ? {} : swipeBackHandlers)}
    >
      {/* Swipe-back edge indicator */}
      {swipeProgress > 0 && (
        <div 
          className="fixed left-0 top-0 bottom-0 z-50 w-1 bg-primary/60 rounded-r-full transition-opacity"
          style={{ opacity: swipeProgress, transform: `scaleX(${1 + swipeProgress * 3})` }}
        />
      )}

      {/* Header - visible on mobile/tablet */}
      {!hideNav && <MobileHeader />}

      {/* Main content - optimized touch scrolling */}
      <main
        id="main-content"
        data-app-scroll-container="true"
        className={cn(
          "overflow-x-hidden relative z-[2]",
          noPadding ? "overflow-hidden" : "overflow-y-auto scroller",
          hideNav ? "" : "pt-14",
        )}
        style={{
          height: hideNav ? '100dvh' : (noPadding ? 'calc(100dvh - 3.5rem)' : 'calc(100dvh)'),
          paddingBottom: hideNav || noPadding
            ? undefined
            : (navEffectiveVisible
                ? 'calc(6rem + env(safe-area-inset-bottom))'
                : 'env(safe-area-inset-bottom)'),
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
          transform: swipeProgress > 0 ? `translateX(${swipeProgress * 60}px)` : undefined,
          transition: swipeProgress === 0
            ? 'transform 0.2s ease-out, padding-bottom 0.3s ease'
            : 'padding-bottom 0.3s ease',
        }}
      >
        {children}
      </main>

      {/* PWA Install Prompt */}
      <PWAInstallBanner />

      {/* One-time soft prompt to enable 2FA so users don't lose access */}
      <Enable2FANudge />
    </div>
  );
}));
