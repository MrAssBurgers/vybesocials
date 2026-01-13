import { ReactNode, forwardRef, memo } from 'react';
import { BottomNav } from './BottomNav';
import { MobileHeader } from './MobileHeader';
import { DesktopLeftSidebar } from './DesktopLeftSidebar';
import { DesktopRightSidebar } from './DesktopRightSidebar';
import { useAuth } from '@/lib/auth';
import { Navigate } from 'react-router-dom';
import { usePresence } from '@/hooks/usePresence';
import { useScrollOptimization } from '@/hooks/useScrollOptimization';
import { useBreakpoint } from '@/hooks/usePlatform';
import { Skeleton } from '@/components/ui/skeleton';
import { useState } from 'react';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
  requireAuth?: boolean;
  hideRightSidebar?: boolean;
  fullWidth?: boolean;
  hideNav?: boolean; // Hide bottom nav for immersive views like Clips
}

// Use forwardRef to avoid React ref warnings
export const AppLayout = memo(forwardRef<HTMLDivElement, AppLayoutProps>(function AppLayout({ 
  children, 
  requireAuth = true, 
  hideRightSidebar = false,
  fullWidth = false,
  hideNav = false 
}, ref) {
  const { user, loading } = useAuth();
  const { isDesktop, isTablet, isIPad } = useBreakpoint();
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  
  // Track online presence
  usePresence();
  
  // Optimize animations during scroll
  useScrollOptimization();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Skeleton variant="circular" className="h-16 w-16" />
          <Skeleton className="h-4 w-24" />
        </div>
      </div>
    );
  }

  if (requireAuth && !user) {
    return <Navigate to="/" replace />;
  }

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

          {/* Main Content Area - ONLY scrollable area */}
          <main className="flex-1 min-w-0 h-screen overflow-y-auto overflow-x-hidden">
            <div 
              className={cn(
                "mx-auto w-full px-2 lg:px-3 py-3",
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

  // Mobile/Tablet layout
  return (
    <div ref={ref} className="min-h-screen w-full overflow-x-hidden">
      {/* Header - visible on mobile/tablet */}
      {!hideNav && <MobileHeader />}
      {/* Main content - consistent spacing with safe area */}
      <main className={cn(
        hideNav ? "" : "pb-[calc(5rem+env(safe-area-inset-bottom))] pt-14"
      )}>
        {children}
      </main>
      {/* Bottom nav - visible on mobile/tablet */}
      {!hideNav && <BottomNav />}
    </div>
  );
}));
