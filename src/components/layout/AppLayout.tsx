import { ReactNode, forwardRef, memo } from 'react';
import { MobileHeader } from './MobileHeader';
import { DesktopLeftSidebar } from './DesktopLeftSidebar';
import { DesktopRightSidebar } from './DesktopRightSidebar';
import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import { usePresence } from '@/hooks/usePresence';
import { useScrollOptimization } from '@/hooks/useScrollOptimization';
import { useBreakpoint } from '@/hooks/usePlatform';
import { useState } from 'react';
import { cn } from '@/lib/utils';

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
  
  // Track online presence
  usePresence();
  
  // Optimize animations during scroll
  useScrollOptimization();

  // INSTANT NAVIGATION: Minimize loading UI to prevent delays
  // The main splash screen handles initial loading, so subsequent navigations
  // should show content immediately without skeleton flicker
  if (loading) {
    // Return children directly with minimal wrapper to prevent visual delay
    // Auth state will resolve almost immediately after initial load
    return (
      <div className="min-h-screen bg-background">
        {children}
      </div>
    );
  }

  // Allow guest browsing - don't redirect if no user
  // Individual components will show auth prompts as needed

  // Desktop layout with sidebars (lg+ only, NOT tablets or iPads)
  if (isDesktop) {
    return (
      <div ref={ref} className="h-screen w-full overflow-hidden relative">
        <div className="flex h-screen w-full">
          {/* Left Sidebar */}
          <DesktopLeftSidebar 
            collapsed={leftCollapsed} 
            onCollapsedChange={setLeftCollapsed}
          />

          {/* Main Content Area */}
          <main 
            className={cn(
              "flex-1 min-w-0 h-screen overflow-x-hidden relative z-[2]",
              noPadding ? "overflow-hidden" : "overflow-y-auto"
            )}
            style={{
              overscrollBehavior: 'contain',
              WebkitOverflowScrolling: 'touch',
              contain: 'layout style',
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

          {/* Right Sidebar */}
          {!hideRightSidebar && <DesktopRightSidebar />}
        </div>
      </div>
    );
  }

  // Mobile/Tablet layout - optimized for smooth scrolling
  return (
    <div 
      ref={ref} 
      className="h-screen w-full overflow-hidden"
    >
      {/* Header - visible on mobile/tablet */}
      {!hideNav && <MobileHeader />}

      {/* Main content - optimized touch scrolling */}
      <main
        data-app-scroll-container="true"
        className={cn(
          "overflow-x-hidden relative z-[2]",
          noPadding ? "overflow-hidden" : "overflow-y-auto",
          noPadding ? "h-[calc(100dvh-3.5rem)]" : "h-full",
          hideNav ? "" : (!noPadding ? "pb-[calc(5rem+env(safe-area-inset-bottom))]" : ""),
          hideNav ? "" : "pt-14",
        )}
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
        }}
      >
        {children}
      </main>
    </div>
  );
}));
